import type { QueryRunner, DatabaseParameters } from '../database/database.js'

export interface RagChunkRecord {
  RagChunkId: string
  SopId: string
  SopVersionId: string
  SopStepId: string | null
  ModuleId: string
  ModuleIdsJson?: string | null
  IsCommon: boolean
  ChunkType: string
  ChunkIndex: number
  Title: string
  Content: string
  ContentHash: string
  MetadataJson: string | null
  EmbeddingJson?: string | null
  EmbeddingModel?: string | null
  Distance?: number
}

export interface IndexStateRecord {
  EntityId: string
  EntityType: string
  VersionId: string
  Title: string
  ModuleId: string
  IndexStatus: 'pending' | 'indexing' | 'synced' | 'failed' | 'stale'
  TotalChunks: number
  IndexedChunks: number
  ErrorMessage: string | null
  TriggerSource: string
  LastIndexedAt: Date | null
  UpdatedAt: Date
}

export interface IndexStateItem {
  entityId: string
  entityType: string
  versionId: string
  title: string
  moduleId: string
  indexStatus: IndexStateRecord['IndexStatus']
  totalChunks: number
  indexedChunks: number
  errorMessage: string | null
  triggerSource: string
  lastIndexedAt: string | null
  updatedAt: string
}

export interface RagIndexJobRecord {
  JobId: string
  Scope: 'all' | 'module' | 'sop'
  TargetId: string | null
  Status: 'pending' | 'running' | 'succeeded' | 'failed'
  TotalItems: number
  SucceededItems: number
  FailedItems: number
  ErrorMessage: string | null
  RequestedBy: string
  CreatedAt: Date
  StartedAt: Date | null
  FinishedAt: Date | null
}

export class RagRepository {
  constructor(private readonly database: QueryRunner) {}

  async getExistingHashes(chunkIds: string[]): Promise<Map<string, string>> {
    if (chunkIds.length === 0) return new Map()
    const placeholders = chunkIds.map((_, i) => `:id${i}`).join(', ')
    const params: DatabaseParameters = Object.fromEntries(chunkIds.map((id, i) => [`id${i}`, id]))
    const rows = await this.database.query<{ RagChunkId: string; ContentHash: string }>(`
      SELECT RagChunkId, ContentHash FROM RagChunk
      WHERE RagChunkId IN (${placeholders})
    `, params)
    const map = new Map<string, string>()
    for (const r of rows) map.set(r.RagChunkId, r.ContentHash)
    return map
  }

  async saveChunk(chunk: {
    chunkId: string
    sopId: string
    sopVersionId: string
    sopStepId: string | null
    moduleId: string
    moduleIds: string[]
    isCommon: boolean
    chunkType: string
    chunkIndex: number
    title: string
    content: string
    contentHash: string
    metadataJson: string
    embedding?: number[]
    embeddingModel?: string
  }): Promise<void> {
    const embeddingStr = chunk.embedding ? JSON.stringify(chunk.embedding) : null

    const baseParams: DatabaseParameters = {
      chunkId: chunk.chunkId,
      sopId: chunk.sopId,
      sopVersionId: chunk.sopVersionId,
      sopStepId: chunk.sopStepId,
      moduleId: chunk.moduleId,
      moduleIdsJson: JSON.stringify(chunk.moduleIds),
      isCommon: chunk.isCommon,
      chunkType: chunk.chunkType,
      chunkIndex: chunk.chunkIndex,
      title: chunk.title,
      content: chunk.content,
      contentHash: chunk.contentHash,
      metadataJson: chunk.metadataJson,
      embeddingStr,
      embeddingModel: chunk.embeddingModel ?? null
    }

    await this.database.query(`
        INSERT INTO RagChunk (
          RagChunkId, SopId, SopVersionId, SopStepId, ModuleId, ModuleIdsJson, IsCommon,
          ChunkType, ChunkIndex, Title, Content, ContentHash, MetadataJson,
          EmbeddingJson, EmbeddingModel
        ) VALUES (
          :chunkId, :sopId, :sopVersionId, :sopStepId, :moduleId, :moduleIdsJson, :isCommon,
          :chunkType, :chunkIndex, :title, :content, :contentHash, :metadataJson,
          :embeddingStr, :embeddingModel
        )
        ON DUPLICATE KEY UPDATE
          Title = VALUES(Title),
          ModuleId = VALUES(ModuleId),
          ModuleIdsJson = VALUES(ModuleIdsJson),
          IsCommon = VALUES(IsCommon),
          Content = VALUES(Content),
          ContentHash = VALUES(ContentHash),
          MetadataJson = VALUES(MetadataJson),
          EmbeddingJson = COALESCE(VALUES(EmbeddingJson), EmbeddingJson),
          EmbeddingModel = COALESCE(VALUES(EmbeddingModel), EmbeddingModel),
          PublishedAt = CURRENT_TIMESTAMP(3)
      `, baseParams)
  }

  async deleteChunksByEntity(sopId: string): Promise<void> {
    await this.database.query(`DELETE FROM RagChunk WHERE SopId = :sopId`, { sopId })
  }

  async deleteObsoleteChunks(sopId: string, currentChunkIds: string[]): Promise<void> {
    if (!currentChunkIds.length) return this.deleteChunksByEntity(sopId)
    const placeholders = currentChunkIds.map((_, index) => `:current${index}`).join(', ')
    await this.database.query(`
      DELETE FROM RagChunk
      WHERE SopId = :sopId AND RagChunkId NOT IN (${placeholders})
    `, {
      sopId,
      ...Object.fromEntries(currentChunkIds.map((id, index) => [`current${index}`, id]))
    })
  }

  async markEntityStale(entityId: string): Promise<void> {
    await this.database.query(`
      UPDATE IndexDocumentState
      SET IndexStatus = 'stale', UpdatedAt = CURRENT_TIMESTAMP(3)
      WHERE EntityId = :entityId
    `, { entityId })
  }

  async updateIndexState(state: {
    entityId: string
    entityType: string
    versionId: string
    title: string
    moduleId: string
    indexStatus: 'pending' | 'indexing' | 'synced' | 'failed' | 'stale'
    totalChunks: number
    indexedChunks: number
    errorMessage?: string | null
    triggerSource: string
  }): Promise<void> {
    if (state.indexStatus !== 'stale') {
      await this.database.query(`
        UPDATE IndexDocumentState SET IndexStatus = 'stale', UpdatedAt = CURRENT_TIMESTAMP(3)
        WHERE EntityId = :entityId AND VersionId <> :versionId AND IndexStatus <> 'stale'
      `, { entityId: state.entityId, versionId: state.versionId })
    }
    await this.database.query(`
      INSERT INTO IndexDocumentState (
        EntityId, EntityType, VersionId, Title, ModuleId, IndexStatus,
        TotalChunks, IndexedChunks, ErrorMessage, TriggerSource, LastIndexedAt
      ) VALUES (
        :entityId, :entityType, :versionId, :title, :moduleId, :indexStatus,
        :totalChunks, :indexedChunks, :errorMessage, :triggerSource,
        IF(:indexStatus = 'synced', CURRENT_TIMESTAMP(3), NULL)
      )
      ON DUPLICATE KEY UPDATE
        Title = VALUES(Title),
        ModuleId = VALUES(ModuleId),
        IndexStatus = VALUES(IndexStatus),
        TotalChunks = VALUES(TotalChunks),
        IndexedChunks = VALUES(IndexedChunks),
        ErrorMessage = VALUES(ErrorMessage),
        TriggerSource = VALUES(TriggerSource),
        LastIndexedAt = IF(VALUES(IndexStatus) = 'synced', CURRENT_TIMESTAMP(3), LastIndexedAt)
    `, {
      entityId: state.entityId,
      entityType: state.entityType,
      versionId: state.versionId,
      title: state.title,
      moduleId: state.moduleId,
      indexStatus: state.indexStatus,
      totalChunks: state.totalChunks,
      indexedChunks: state.indexedChunks,
      errorMessage: state.errorMessage || null,
      triggerSource: state.triggerSource
    })
  }

  async getIndexOverview(): Promise<{
    totalDocuments: number
    syncedDocuments: number
    pendingDocuments: number
    failedDocuments: number
    totalChunks: number
    items: IndexStateItem[]
    latestJob: null | {
      jobId: string
      scope: RagIndexJobRecord['Scope']
      targetId: string | null
      status: RagIndexJobRecord['Status']
      totalItems: number
      succeededItems: number
      failedItems: number
      errorMessage: string | null
      requestedBy: string
      createdAt: string
      startedAt: string | null
      finishedAt: string | null
    }
  }> {
    const [counts] = await this.database.query<{
      TotalDocuments: number
      SyncedDocuments: number
      PendingDocuments: number
      FailedDocuments: number
    }>(`
      SELECT
        SUM(CASE WHEN IndexStatus <> 'stale' THEN 1 ELSE 0 END) AS TotalDocuments,
        SUM(CASE WHEN IndexStatus = 'synced' THEN 1 ELSE 0 END) AS SyncedDocuments,
        SUM(CASE WHEN IndexStatus = 'pending' OR IndexStatus = 'indexing' THEN 1 ELSE 0 END) AS PendingDocuments,
        SUM(CASE WHEN IndexStatus = 'failed' THEN 1 ELSE 0 END) AS FailedDocuments
      FROM IndexDocumentState
    `)

    const [chunkCount] = await this.database.query<{ TotalChunks: number }>(`
      SELECT COUNT(*) AS TotalChunks FROM RagChunk chunk
      WHERE NOT EXISTS (
        SELECT 1 FROM IndexDocumentState state
        WHERE state.EntityId = chunk.SopId
          AND state.VersionId = chunk.SopVersionId
          AND state.IndexStatus = 'stale'
      )
    `)

    const rows = await this.database.query<IndexStateRecord>(`
      SELECT * FROM IndexDocumentState WHERE IndexStatus <> 'stale' ORDER BY UpdatedAt DESC LIMIT 200
    `)
    const [latestJob] = await this.database.query<RagIndexJobRecord>(`
      SELECT * FROM RagIndexJob ORDER BY CreatedAt DESC LIMIT 1
    `)

    return {
      totalDocuments: Number(counts?.TotalDocuments || 0),
      syncedDocuments: Number(counts?.SyncedDocuments || 0),
      pendingDocuments: Number(counts?.PendingDocuments || 0),
      failedDocuments: Number(counts?.FailedDocuments || 0),
      totalChunks: Number(chunkCount?.TotalChunks || 0),
      latestJob: latestJob ? {
        jobId: latestJob.JobId,
        scope: latestJob.Scope,
        targetId: latestJob.TargetId,
        status: latestJob.Status,
        totalItems: Number(latestJob.TotalItems),
        succeededItems: Number(latestJob.SucceededItems),
        failedItems: Number(latestJob.FailedItems),
        errorMessage: latestJob.ErrorMessage,
        requestedBy: latestJob.RequestedBy,
        createdAt: latestJob.CreatedAt.toISOString(),
        startedAt: latestJob.StartedAt?.toISOString() ?? null,
        finishedAt: latestJob.FinishedAt?.toISOString() ?? null
      } : null,
      items: rows.map(row => ({
        entityId: row.EntityId,
        entityType: row.EntityType,
        versionId: row.VersionId,
        title: row.Title,
        moduleId: row.ModuleId,
        indexStatus: row.IndexStatus,
        totalChunks: Number(row.TotalChunks),
        indexedChunks: Number(row.IndexedChunks),
        errorMessage: row.ErrorMessage,
        triggerSource: row.TriggerSource,
        lastIndexedAt: row.LastIndexedAt?.toISOString() ?? null,
        updatedAt: row.UpdatedAt.toISOString()
      }))
    }
  }

  async createIndexJob(input: { jobId: string; scope: RagIndexJobRecord['Scope']; targetId?: string; requestedBy: string }) {
    await this.database.query(`INSERT INTO RagIndexJob (JobId, Scope, TargetId, RequestedBy)
      VALUES (:jobId, :scope, :targetId, :requestedBy)`, {
      jobId: input.jobId,
      scope: input.scope,
      targetId: input.targetId ?? null,
      requestedBy: input.requestedBy
    })
  }

  async findActiveIndexJob(scope: RagIndexJobRecord['Scope'], targetId?: string): Promise<RagIndexJobRecord | null> {
    const [job] = await this.database.query<RagIndexJobRecord>(`
      SELECT * FROM RagIndexJob
      WHERE Scope = :scope AND TargetId <=> :targetId AND Status IN ('pending', 'running')
      ORDER BY CreatedAt ASC LIMIT 1
    `, { scope, targetId: targetId ?? null })
    return job ?? null
  }

  async recoverInterruptedIndexJobs(): Promise<void> {
    await this.database.query(`UPDATE RagIndexJob
      SET Status = 'pending', StartedAt = NULL,
          ErrorMessage = 'Backend restarted while this job was running; the job was queued again.'
      WHERE Status = 'running'`)
  }

  async claimNextIndexJob(): Promise<RagIndexJobRecord | null> {
    const [job] = await this.database.query<RagIndexJobRecord>(`
      SELECT * FROM RagIndexJob WHERE Status = 'pending' ORDER BY CreatedAt ASC LIMIT 1
    `)
    if (!job) return null
    const [result] = await this.database.query<{ affectedRows: number }>(`
      UPDATE RagIndexJob SET Status = 'running', StartedAt = CURRENT_TIMESTAMP(3), ErrorMessage = NULL
      WHERE JobId = :jobId AND Status = 'pending'
    `, { jobId: job.JobId })
    return result?.affectedRows ? { ...job, Status: 'running' } : null
  }

  async finishIndexJob(jobId: string, result: { total: number; succeeded: number; failed: number; errorMessage?: string }) {
    await this.database.query(`UPDATE RagIndexJob
      SET Status = :status, TotalItems = :total, SucceededItems = :succeeded,
          FailedItems = :failed, ErrorMessage = :errorMessage, FinishedAt = CURRENT_TIMESTAMP(3)
      WHERE JobId = :jobId`, {
      jobId,
      status: result.failed > 0 ? 'failed' : 'succeeded',
      total: result.total,
      succeeded: result.succeeded,
      failed: result.failed,
      errorMessage: result.errorMessage ?? null
    })
  }

  async updateIndexJobProgress(jobId: string, result: { total: number; succeeded: number; failed: number }): Promise<void> {
    await this.database.query(`UPDATE RagIndexJob
      SET TotalItems = :total, SucceededItems = :succeeded, FailedItems = :failed
      WHERE JobId = :jobId AND Status = 'running'`, {
      jobId,
      total: result.total,
      succeeded: result.succeeded,
      failed: result.failed
    })
  }

  async searchByVector(
    queryVector: number[],
    readableModuleIds: string[],
    limit = 5
  ): Promise<RagChunkRecord[]> {
    if (readableModuleIds.length === 0) return []
    const modulePlaceholders = readableModuleIds.map((_, i) => `:mod${i}`).join(', ')
    const rows = await this.database.query<RagChunkRecord>(`
      SELECT RagChunkId, SopId, SopVersionId, SopStepId, ModuleId, ModuleIdsJson, IsCommon,
             ChunkType, ChunkIndex, Title, Content, ContentHash, MetadataJson,
             EmbeddingJson, EmbeddingModel
      FROM RagChunk
      WHERE (ModuleId IN (${modulePlaceholders})
        OR ${readableModuleIds.map((_, i) => `JSON_CONTAINS(ModuleIdsJson, JSON_QUOTE(:mod${i}))`).join(' OR ')}
        OR IsCommon = 1)
        AND EmbeddingJson IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM IndexDocumentState state
          WHERE state.EntityId = RagChunk.SopId
            AND state.VersionId = RagChunk.SopVersionId
            AND state.IndexStatus = 'stale'
        )
      LIMIT 5000
    `, Object.fromEntries(readableModuleIds.map((m, i) => [`mod${i}`, m])))
    const magnitude = (values: number[]) => Math.sqrt(values.reduce((sum, value) => sum + value * value, 0))
    const queryMagnitude = magnitude(queryVector)
    return rows.flatMap(row => {
      try {
        const vector = JSON.parse(String(row.EmbeddingJson)) as number[]
        if (!Array.isArray(vector) || vector.length !== queryVector.length) return []
        const denominator = queryMagnitude * magnitude(vector)
        if (!denominator) return []
        const cosine = vector.reduce((sum, value, index) => sum + value * queryVector[index]!, 0) / denominator
        return [{ ...row, Distance: 1 - cosine }]
      } catch { return [] }
    }).sort((left, right) => (left.Distance ?? 2) - (right.Distance ?? 2)).slice(0, limit)
  }

  async searchByKeyword(
    queryText: string,
    readableModuleIds: string[],
    limit = 5
  ): Promise<RagChunkRecord[]> {
    if (readableModuleIds.length === 0) return []
    const searchPattern = `%${queryText}%`
    const modulePlaceholders = readableModuleIds.map((_, i) => `:mod${i}`).join(', ')
    const params: DatabaseParameters = {
      ...Object.fromEntries(readableModuleIds.map((m, i) => [`mod${i}`, m])),
      searchPattern,
      limit
    }

    return this.database.query<RagChunkRecord>(`
      SELECT RagChunkId, SopId, SopVersionId, SopStepId, ModuleId, ModuleIdsJson, IsCommon,
             ChunkType, ChunkIndex, Title, Content, ContentHash, MetadataJson
      FROM RagChunk
      WHERE (ModuleId IN (${modulePlaceholders})
        OR ${readableModuleIds.map((_, i) => `JSON_CONTAINS(ModuleIdsJson, JSON_QUOTE(:mod${i}))`).join(' OR ')}
        OR IsCommon = 1)
        AND (Title LIKE :searchPattern OR Content LIKE :searchPattern)
        AND NOT EXISTS (
          SELECT 1 FROM IndexDocumentState state
          WHERE state.EntityId = RagChunk.SopId
            AND state.VersionId = RagChunk.SopVersionId
            AND state.IndexStatus = 'stale'
        )
      ORDER BY ChunkIndex ASC
      LIMIT :limit
    `, params)
  }
}
