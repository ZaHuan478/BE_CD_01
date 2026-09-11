import type { AuthPrincipal } from '../../auth/types.js'
import { listReadableModules } from '../../auth/module-access.js'
import type { ModuleRepository } from '../../repositories/module.repository.js'
import type { GeminiClient } from './gemini.client.js'
import { RagRepository, type RagChunkRecord } from '../../repositories/rag.repository.js'
import type { QueryRunner } from '../../database/database.js'
import { forbidden } from '../../common/errors.js'
import { CoreDocumentRepository } from '../../repositories/core-document.repository.js'

export interface RetrievedChunk {
  chunkId: string
  sopId: string
  sopStepId: string | null
  moduleId: string
  title: string
  content: string
  metadata: Record<string, unknown>
  distance?: number
}

export class RetrievalService {
  private readonly repository: RagRepository
  private readonly documents: CoreDocumentRepository

  constructor(
    database: QueryRunner,
    private readonly moduleRepository: ModuleRepository,
    private readonly geminiClient: GeminiClient,
    private readonly topK = 5,
    private readonly similarityThreshold = 0.65
  ) {
    this.repository = new RagRepository(database)
    this.documents = new CoreDocumentRepository(database)
  }

  async retrieveRelevantChunks(
    principal: AuthPrincipal,
    query: string,
    filterModuleId?: string
  ): Promise<RetrievedChunk[]> {
    // 1. Lọc quyền tiền truy vấn (Pre-filtering RBAC)
    const readableModules = await listReadableModules(principal, this.moduleRepository)
    const readableIds = readableModules.map((m) => m.id)

    if (filterModuleId && !readableIds.includes(filterModuleId)) {
      throw forbidden('Bạn không có quyền truy cập vào phân hệ này.')
    }

    // The sentinel still lets IsCommon policy chunks participate when an
    // account has no business module. It can never match a real module id.
    const effectiveModuleIds = filterModuleId ? [filterModuleId] : (readableIds.length ? readableIds : ['__none__'])

    // 2. Tìm kiếm Vector (Dense Retrieval)
    let vectorResults: RagChunkRecord[] = []
    if (this.geminiClient.isConfigured()) {
      try {
        const queryVector = await this.geminiClient.embedText(query, 'RETRIEVAL_QUERY')
        vectorResults = await this.repository.searchByVector(queryVector, effectiveModuleIds, this.topK)
      } catch (err) {
        console.warn('Lỗi embedding truy vấn, fallback sang tìm kiếm từ khóa:', err)
      }
    }

    // 3. Tìm kiếm Từ khóa (Sparse / Keyword Retrieval)
    const keywordResults = await this.repository.searchByKeyword(query, effectiveModuleIds, this.topK)

    // 4. Kết hợp và khử trùng lặp (Hybrid Deduplication)
    const chunkMap = new Map<string, RagChunkRecord>()

    // Ưu tiên vector results trước
    for (const item of vectorResults) {
      chunkMap.set(item.RagChunkId, item)
    }
    // Bổ sung keyword results nếu chưa có
    for (const item of keywordResults) {
      if (!chunkMap.has(item.RagChunkId)) {
        chunkMap.set(item.RagChunkId, item)
      }
    }

    const ranked = Array.from(chunkMap.values())
      .filter(item => item.Distance === undefined || item.Distance <= 1 - this.similarityThreshold)
    const combined: RagChunkRecord[] = []
    for (const item of ranked) {
      try {
        // This is the same current-version/effective-date/audience check used by
        // the published library. It runs before any chunk enters the LLM prompt.
        const document = await this.documents.get(readableIds, item.SopId, principal)
        if (item.SopVersionId !== `v${document.data.version}`) continue
        combined.push(item)
      } catch { /* hide inaccessible and stale sources */ }
      if (combined.length >= this.topK) break
    }

    return combined.map((record) => {
      let metadata: Record<string, unknown> = {}
      if (record.MetadataJson) {
        try {
          metadata = JSON.parse(record.MetadataJson)
        } catch {
          // ignore
        }
      }

      return {
        chunkId: record.RagChunkId,
        sopId: record.SopId,
        sopStepId: record.SopStepId,
        moduleId: record.ModuleId,
        title: record.Title,
        content: record.Content,
        metadata,
        distance: record.Distance
      }
    })
  }

  async canReadDocument(principal: AuthPrincipal, documentId: string): Promise<boolean> {
    const modules = await listReadableModules(principal, this.moduleRepository)
    try {
      await this.documents.get(modules.map(module => module.id), documentId, principal)
      return true
    } catch { return false }
  }
}
