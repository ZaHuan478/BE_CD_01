import type { QueryRunner } from '../../database/database.js'
import { SopExtractor, hashString, type ExtractedChunk } from './sop-extractor.js'
import type { GeminiClient } from './gemini.client.js'
import { RagRepository } from '../../repositories/rag.repository.js'
import { splitSemanticChunks } from './semantic-chunker.js'
import { randomUUID } from 'node:crypto'

export interface IndexProgress {
  total: number
  succeeded: number
  failed: number
}

type IndexProgressHandler = (progress: IndexProgress) => Promise<void>

const activeSourceCondition = `NOT EXISTS (
  SELECT 1 FROM SopImportJob sourceJob
  WHERE sourceJob.TargetSopId = d.DocumentId
    AND CAST(sourceJob.TargetVersionId AS UNSIGNED) = d.CurrentVersionNumber
    AND (
      (sourceJob.SourceDocumentId IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM UserDocument sourceDocument
        WHERE sourceDocument.DocumentId = sourceJob.SourceDocumentId
          AND sourceDocument.DeletedAt IS NULL
      ))
      OR EXISTS (
        SELECT 1 FROM AuditLog deletedSource
        WHERE deletedSource.EntityType = 'user-document'
          AND deletedSource.Action = 'admin-permanent-delete'
          AND JSON_VALID(deletedSource.BeforeJson) = 1
          AND (
            JSON_UNQUOTE(JSON_EXTRACT(deletedSource.BeforeJson, '$.sourceImportJobId')) = sourceJob.SopImportJobId
            OR JSON_UNQUOTE(JSON_EXTRACT(deletedSource.BeforeJson, '$.storageKey')) = sourceJob.StorageKey
          )
      )
    )
)`

export class IndexingService {
  private readonly extractor = new SopExtractor()
  private readonly repository: RagRepository
  private workerTimer?: NodeJS.Timeout
  private workerRunning = false

  constructor(
    private readonly database: QueryRunner,
    private readonly geminiClient: GeminiClient,
    private readonly isCore8: boolean,
    private readonly chunkMaxTokens = 500
  ) {
    this.repository = new RagRepository(database)
  }

  async getOverview() {
    return this.repository.getIndexOverview()
  }

  async enqueueReindex(
    scope: 'all' | 'module' | 'sop',
    targetId: string | undefined,
    requestedBy: string
  ): Promise<{ jobId: string; status: 'pending' | 'running' }> {
    const activeJob = await this.repository.findActiveIndexJob(scope, targetId)
    if (activeJob) {
      return { jobId: activeJob.JobId, status: activeJob.Status as 'pending' | 'running' }
    }
    const jobId = `rag-job-${randomUUID()}`
    await this.repository.createIndexJob({ jobId, scope, targetId, requestedBy })
    void this.drainQueue()
    return { jobId, status: 'pending' }
  }

  async startWorker(): Promise<void> {
    if (this.workerTimer) return
    await this.repository.recoverInterruptedIndexJobs()
    this.workerTimer = setInterval(() => { void this.drainQueue() }, 2_000)
    this.workerTimer.unref()
    void this.drainQueue()
  }

  stopWorker(): void {
    if (this.workerTimer) clearInterval(this.workerTimer)
    this.workerTimer = undefined
  }

  private async drainQueue(): Promise<void> {
    if (this.workerRunning) return
    this.workerRunning = true
    let currentJobId: string | undefined
    try {
      const job = await this.repository.claimNextIndexJob()
      if (!job) return
      currentJobId = job.JobId

      const onProgress: IndexProgressHandler = (progress) =>
        this.repository.updateIndexJobProgress(job.JobId, progress)

      let result: IndexProgress
      if (job.Scope === 'all') {
        result = await this.reindexAll(onProgress)
      } else if (job.Scope === 'module' && job.TargetId) {
        result = await this.reindexModule(job.TargetId, onProgress)
      } else if (job.Scope === 'sop' && job.TargetId) {
        await onProgress({ total: 1, succeeded: 0, failed: 0 })
        await this.indexEntity(job.TargetId, 'manual_sync')
        result = { total: 1, succeeded: 1, failed: 0 }
      } else {
        throw new Error('RAG index job is missing a targetId.')
      }
      await this.repository.finishIndexJob(job.JobId, result)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (currentJobId) {
        try {
          await this.repository.finishIndexJob(currentJobId, {
            total: 0,
            succeeded: 0,
            failed: 1,
            errorMessage: message
          })
        } catch { /* preserve the original worker failure */ }
      }
      console.error('RAG index worker failed:', message)
    } finally {
      this.workerRunning = false
    }
  }

  /**
   * Lập chỉ mục cho 1 tài liệu/SOP
   */
  async indexEntity(entityId: string, triggerSource = 'manual_sync'): Promise<void> {
    if (this.isCore8) {
      await this.indexCore8Document(entityId, triggerSource)
    } else {
      await this.indexLegacySop(entityId, triggerSource)
    }
  }

  async removeEntity(entityId: string): Promise<void> {
    await this.repository.deleteChunksByEntity(entityId)
    await this.repository.markEntityStale(entityId)
  }

  /** Record a local pending job after publication; no document content leaves the server. */
  async markPending(entityId: string, triggerSource = 'auto_publish'): Promise<void> {
    if (this.isCore8) {
      const [row] = await this.database.query<{
        DocumentId: string
        DocumentType: string
        CurrentVersionNumber: number
        Title: string
        ModuleId: string | null
      }>(`
        SELECT d.DocumentId, d.DocumentType, d.CurrentVersionNumber, d.Title,
               MIN(m.ModuleId) AS ModuleId
        FROM KnowledgeDocument d
        LEFT JOIN KnowledgeDocumentModule m ON m.DocumentId = d.DocumentId
        WHERE d.DocumentId = :entityId AND d.Status = 'published'
        GROUP BY d.DocumentId, d.DocumentType, d.CurrentVersionNumber, d.Title
      `, { entityId })
      if (!row) return
      await this.repository.updateIndexState({
        entityId: row.DocumentId,
        entityType: row.DocumentType,
        versionId: `v${row.CurrentVersionNumber}`,
        title: row.Title,
        moduleId: row.ModuleId || 'common',
        indexStatus: 'pending',
        totalChunks: 0,
        indexedChunks: 0,
        triggerSource
      })
      return
    }

    const [row] = await this.database.query<{
      SopId: string
      CurrentPublishedVersionId: string
      Title: string
      ModuleId: string | null
    }>(`
      SELECT s.SopId, s.CurrentPublishedVersionId, s.Title, MIN(m.ModuleId) AS ModuleId
      FROM Sop s LEFT JOIN SopModule m ON m.SopId = s.SopId
      WHERE s.SopId = :entityId AND s.CurrentPublishedVersionId IS NOT NULL
      GROUP BY s.SopId, s.CurrentPublishedVersionId, s.Title
    `, { entityId })
    if (!row) return
    await this.repository.updateIndexState({
      entityId: row.SopId,
      entityType: 'sop',
      versionId: row.CurrentPublishedVersionId,
      title: row.Title,
      moduleId: row.ModuleId || 'common',
      indexStatus: 'pending',
      totalChunks: 0,
      indexedChunks: 0,
      triggerSource
    })
  }

  /**
   * Lập chỉ mục toàn bộ tài liệu trong hệ thống
   */
  async reindexAll(onProgress?: IndexProgressHandler): Promise<IndexProgress> {
    let entityIds: string[] = []

    if (this.isCore8) {
      const rows = await this.database.query<{ DocumentId: string }>(`
        SELECT d.DocumentId FROM KnowledgeDocument d
        JOIN KnowledgeDocumentVersion v ON v.DocumentId = d.DocumentId AND v.VersionNumber = d.CurrentVersionNumber
        WHERE d.Status = 'published' AND d.Visibility = 'module'
          AND d.DocumentType IN ('procedure', 'policy', 'guide')
          AND v.Status = 'published'
          AND ${activeSourceCondition}
          AND (v.EffectiveFrom IS NULL OR v.EffectiveFrom <= UTC_TIMESTAMP(3))
          AND (v.EffectiveTo IS NULL OR v.EffectiveTo > UTC_TIMESTAMP(3))
      `)
      entityIds = rows.map((r: { DocumentId: string }) => r.DocumentId)
    } else {
      const rows = await this.database.query<{ SopId: string }>(`
        SELECT SopId FROM Sop WHERE CurrentPublishedVersionId IS NOT NULL
      `)
      entityIds = rows.map((r: { SopId: string }) => r.SopId)
    }

    let succeeded = 0
    let failed = 0
    await onProgress?.({ total: entityIds.length, succeeded, failed })

    for (let index = 0; index < entityIds.length; index++) {
      const id = entityIds[index]!
      try {
        await this.indexEntity(id, 'reindex_all')
        succeeded++
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        console.error(`Lỗi index entity ${id}: ${message}`)
        failed++
        if (this.shouldStopBatch(err)) {
          failed += entityIds.length - index - 1
          await onProgress?.({ total: entityIds.length, succeeded, failed })
          break
        }
      }
      await onProgress?.({ total: entityIds.length, succeeded, failed })
    }

    return { total: entityIds.length, succeeded, failed }
  }

  /**
   * Lập chỉ mục theo Phân hệ
   */
  async reindexModule(moduleId: string, onProgress?: IndexProgressHandler): Promise<IndexProgress> {
    let entityIds: string[] = []

    if (this.isCore8) {
      const rows = await this.database.query<{ DocumentId: string }>(`
        SELECT d.DocumentId FROM KnowledgeDocument d
        INNER JOIN KnowledgeDocumentModule m ON m.DocumentId = d.DocumentId
        INNER JOIN KnowledgeDocumentVersion v ON v.DocumentId = d.DocumentId AND v.VersionNumber = d.CurrentVersionNumber
        WHERE m.ModuleId = :moduleId AND d.Status = 'published' AND d.Visibility = 'module'
          AND d.DocumentType IN ('procedure', 'policy', 'guide') AND v.Status = 'published'
          AND ${activeSourceCondition}
          AND (v.EffectiveFrom IS NULL OR v.EffectiveFrom <= UTC_TIMESTAMP(3))
          AND (v.EffectiveTo IS NULL OR v.EffectiveTo > UTC_TIMESTAMP(3))
      `, { moduleId })
      entityIds = rows.map((r: { DocumentId: string }) => r.DocumentId)
    } else {
      const rows = await this.database.query<{ SopId: string }>(`
        SELECT s.SopId FROM Sop s
        INNER JOIN SopModule m ON m.SopId = s.SopId
        WHERE m.ModuleId = :moduleId AND s.CurrentPublishedVersionId IS NOT NULL
      `, { moduleId })
      entityIds = rows.map((r: { SopId: string }) => r.SopId)
    }

    let succeeded = 0
    let failed = 0
    await onProgress?.({ total: entityIds.length, succeeded, failed })

    for (let index = 0; index < entityIds.length; index++) {
      const id = entityIds[index]!
      try {
        await this.indexEntity(id, 'manual_sync')
        succeeded++
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        console.error(`Lỗi index entity ${id} của module ${moduleId}: ${message}`)
        failed++
        if (this.shouldStopBatch(err)) {
          failed += entityIds.length - index - 1
          await onProgress?.({ total: entityIds.length, succeeded, failed })
          break
        }
      }
      await onProgress?.({ total: entityIds.length, succeeded, failed })
    }

    return { total: entityIds.length, succeeded, failed }
  }

  private shouldStopBatch(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error)
    return /fetch failed|429|quota|api[_ -]?key|401|403|permission denied/i.test(message)
  }

  private async indexCore8Document(documentId: string, triggerSource: string): Promise<void> {
    const [docRow] = await this.database.query<{
      DocumentId: string
      Code: string
      Title: string
      DocumentType: string
      Summary: string
      Status: string
      CurrentVersionNumber: number
      ModuleIds: string | null
      ContentJson: unknown
    }>(`
      SELECT d.DocumentId, d.Code, d.Title, d.DocumentType, d.Summary, d.Status,
             d.CurrentVersionNumber,
             GROUP_CONCAT(DISTINCT m.ModuleId SEPARATOR '|') AS ModuleIds,
             v.ContentJson
      FROM KnowledgeDocument d
      LEFT JOIN KnowledgeDocumentModule m ON m.DocumentId = d.DocumentId
      LEFT JOIN KnowledgeDocumentVersion v ON v.DocumentId = d.DocumentId AND v.VersionNumber = d.CurrentVersionNumber
      WHERE d.DocumentId = :documentId AND d.Status = 'published' AND d.Visibility = 'module'
        AND d.DocumentType IN ('procedure', 'policy', 'guide') AND v.Status = 'published'
        AND ${activeSourceCondition}
        AND (v.EffectiveFrom IS NULL OR v.EffectiveFrom <= UTC_TIMESTAMP(3))
        AND (v.EffectiveTo IS NULL OR v.EffectiveTo > UTC_TIMESTAMP(3))
      GROUP BY d.DocumentId, d.Code, d.Title, d.DocumentType, d.Summary, d.Status, d.CurrentVersionNumber, v.ContentJson
    `, { documentId })

    if (!docRow) throw new Error(`Không tìm thấy tài liệu đã công bố ${documentId} để lập chỉ mục.`)

    const moduleIds = docRow.ModuleIds?.split('|').filter(Boolean) ?? ['common']
    const isCommon = docRow.DocumentType === 'policy' || moduleIds.includes('common')
    const rawContent = docRow.ContentJson
    const parsedContent = typeof rawContent === 'string' ? JSON.parse(rawContent) : (rawContent || {})

    const versionId = `v${docRow.CurrentVersionNumber}`

    await this.repository.updateIndexState({
      entityId: docRow.DocumentId,
      entityType: docRow.DocumentType,
      versionId,
      title: docRow.Title,
      moduleId: moduleIds[0] || 'common',
      indexStatus: 'indexing',
      totalChunks: 0,
      indexedChunks: 0,
      triggerSource
    })

    try {
      const chunks = splitSemanticChunks(this.extractor.extractFromKnowledgeDocument({
        documentId: docRow.DocumentId,
        code: docRow.Code,
        title: docRow.Title,
        type: docRow.DocumentType,
        summary: docRow.Summary,
        moduleId: moduleIds[0] || 'common',
        isCommon,
        versionNumber: docRow.CurrentVersionNumber,
        content: parsedContent as Record<string, unknown>
      }), this.chunkMaxTokens)

      await this.processAndPersistChunks(chunks, moduleIds)

      await this.repository.updateIndexState({
        entityId: docRow.DocumentId,
        entityType: docRow.DocumentType,
        versionId,
        title: docRow.Title,
        moduleId: moduleIds[0] || 'common',
        indexStatus: 'synced',
        totalChunks: chunks.length,
        indexedChunks: chunks.length,
        triggerSource
      })
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err)
      await this.repository.updateIndexState({
        entityId: docRow.DocumentId,
        entityType: docRow.DocumentType,
        versionId,
        title: docRow.Title,
        moduleId: moduleIds[0] || 'common',
        indexStatus: 'failed',
        totalChunks: 0,
        indexedChunks: 0,
        errorMessage: errMsg,
        triggerSource
      })
      throw err
    }
  }

  private async indexLegacySop(sopId: string, triggerSource: string): Promise<void> {
    const [sopRow] = await this.database.query<{
      SopId: string
      SopCode: string
      Title: string
      Category: string | null
      CurrentPublishedVersionId: string | null
      Purpose: string | null
      Scope: string | null
      Definition: string | null
      ModuleIds: string | null
    }>(`
      SELECT s.SopId, s.SopCode, s.Title, s.Category, s.CurrentPublishedVersionId,
             v.Purpose, v.Scope, v.Definition,
             GROUP_CONCAT(DISTINCT m.ModuleId SEPARATOR '|') AS ModuleIds
      FROM Sop s
      INNER JOIN SopVersion v ON v.SopVersionId = s.CurrentPublishedVersionId
      LEFT JOIN SopModule m ON m.SopId = s.SopId
      WHERE s.SopId = :sopId
      GROUP BY s.SopId, s.SopCode, s.Title, s.Category, s.CurrentPublishedVersionId,
               v.Purpose, v.Scope, v.Definition
    `, { sopId })

    if (!sopRow || !sopRow.CurrentPublishedVersionId) {
      throw new Error(`Không tìm thấy SOP đã công bố ${sopId} để lập chỉ mục.`)
    }

    const moduleIds = sopRow.ModuleIds?.split('|').filter(Boolean) ?? ['common']
    const isCommon = moduleIds.includes('common')

    const steps = await this.database.query<{
      SopStepId: string
      StepCode: string
      Title: string
      Actor: string | null
      Timing: string | null
      Location: string | null
      Description: string | null
      ChecklistJson: string | null
    }>(`
      SELECT SopStepId, StepCode, Title, Actor, Timing, Location, Description, ChecklistJson
      FROM SopStep
      WHERE SopVersionId = :versionId
      ORDER BY SortOrder ASC
    `, { versionId: sopRow.CurrentPublishedVersionId })

    await this.repository.updateIndexState({
      entityId: sopRow.SopId,
      entityType: 'sop',
      versionId: sopRow.CurrentPublishedVersionId,
      title: sopRow.Title,
      moduleId: moduleIds[0] || 'common',
      indexStatus: 'indexing',
      totalChunks: 0,
      indexedChunks: 0,
      triggerSource
    })

    try {
      const chunks = splitSemanticChunks(this.extractor.extractFromLegacySop({
        sopId: sopRow.SopId,
        sopCode: sopRow.SopCode,
        title: sopRow.Title,
        category: sopRow.Category || undefined,
        versionId: sopRow.CurrentPublishedVersionId,
        purpose: sopRow.Purpose || undefined,
        scope: sopRow.Scope || undefined,
        definition: sopRow.Definition || undefined,
        moduleId: moduleIds[0] || 'common',
        isCommon,
        steps: steps.map((s: {
          SopStepId: string
          StepCode: string
          Title: string
          Actor: string | null
          Timing: string | null
          Location: string | null
          Description: string | null
          ChecklistJson: string | null
        }) => ({
          stepId: s.SopStepId,
          stepCode: s.StepCode,
          title: s.Title,
          actor: s.Actor || undefined,
          timing: s.Timing || undefined,
          location: s.Location || undefined,
          description: s.Description || undefined,
          checklistJson: s.ChecklistJson
        }))
      }), this.chunkMaxTokens)

      await this.processAndPersistChunks(chunks, moduleIds)

      await this.repository.updateIndexState({
        entityId: sopRow.SopId,
        entityType: 'sop',
        versionId: sopRow.CurrentPublishedVersionId,
        title: sopRow.Title,
        moduleId: moduleIds[0] || 'common',
        indexStatus: 'synced',
        totalChunks: chunks.length,
        indexedChunks: chunks.length,
        triggerSource
      })
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err)
      await this.repository.updateIndexState({
        entityId: sopRow.SopId,
        entityType: 'sop',
        versionId: sopRow.CurrentPublishedVersionId,
        title: sopRow.Title,
        moduleId: moduleIds[0] || 'common',
        indexStatus: 'failed',
        totalChunks: 0,
        indexedChunks: 0,
        errorMessage: errMsg,
        triggerSource
      })
      throw err
    }
  }

  private async processAndPersistChunks(chunks: ExtractedChunk[], moduleIds: string[]): Promise<void> {
    if (chunks.length === 0) return

    const chunkIds = chunks.map((c) => c.chunkId)
    const existingHashes = await this.repository.getExistingHashes(chunkIds)

    const chunksToEmbed: ExtractedChunk[] = []
    const chunksWithHash: Array<{ chunk: ExtractedChunk; hash: string }> = []

    for (const chunk of chunks) {
      const hash = hashString(this.geminiClient.getEmbeddingModel() + '\n' + chunk.content + JSON.stringify(chunk.metadata))
      chunksWithHash.push({ chunk, hash })

      const existingHash = existingHashes.get(chunk.chunkId)
      if (existingHash !== hash) {
        chunksToEmbed.push(chunk)
      }
    }

    const embeddingsMap = new Map<string, number[]>()
    if (chunksToEmbed.length > 0 && this.geminiClient.isConfigured()) {
      const texts = chunksToEmbed.map((c) => c.content)
      const vectors = await this.geminiClient.batchEmbedTexts(texts, 'RETRIEVAL_DOCUMENT')
      for (let i = 0; i < chunksToEmbed.length; i++) {
        embeddingsMap.set(chunksToEmbed[i]!.chunkId, vectors[i]!)
      }
    }

    for (const item of chunksWithHash) {
      const embedding = embeddingsMap.get(item.chunk.chunkId)
      await this.repository.saveChunk({
        chunkId: item.chunk.chunkId,
        sopId: item.chunk.sopId,
        sopVersionId: item.chunk.sopVersionId,
        sopStepId: item.chunk.sopStepId,
        moduleId: item.chunk.moduleId,
        moduleIds,
        isCommon: item.chunk.isCommon,
        chunkType: item.chunk.chunkType,
        chunkIndex: item.chunk.chunkIndex,
        title: item.chunk.title,
        content: item.chunk.content,
        contentHash: item.hash,
        metadataJson: JSON.stringify(item.chunk.metadata),
        embedding,
        embeddingModel: embedding ? this.geminiClient.getEmbeddingModel() : undefined
      })
    }
    await this.repository.deleteObsoleteChunks(chunks[0]!.sopId, chunkIds)
  }
}
