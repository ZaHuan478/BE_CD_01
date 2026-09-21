import type { FastifyPluginAsync } from 'fastify'
import type { AuthService } from '../services/auth.service.js'
import type { IndexingService } from '../services/rag/indexing.service.js'
import { RagController } from '../controllers/rag.controller.js'
import { reindexRequestSchema, type ReindexRequest } from '../schemas/rag.schemas.js'

export function ragRoutes(
  authService: AuthService,
  indexingService: IndexingService
): FastifyPluginAsync {
  const controller = new RagController(authService, indexingService)

  return async (app) => {
    app.get<{ Querystring: { search?: string; query?: string; page?: string; pageSize?: string } }>('/admin/rag/status', {
      schema: {
        tags: ['Administration - RAG'],
        summary: 'Xem trạng thái và tổng quan chỉ mục ngữ nghĩa (Admin-only)'
      }
    }, (request) => controller.getStatus(request))

    app.post<{ Body: ReindexRequest }>('/admin/rag/reindex', {
      schema: {
        tags: ['Administration - RAG'],
        summary: 'Kích hoạt lập chỉ mục (Re-index) thủ công (Admin-only)',
        body: reindexRequestSchema
      }
    }, (request, reply) => controller.triggerReindex(request, reply))

    app.get<{
      Params: { entityId: string }
      Querystring: { versionId?: string; query?: string; search?: string; page?: string; pageSize?: string }
    }>('/admin/rag/entities/:entityId/chunks', {
      schema: {
        tags: ['Administration - RAG'],
        summary: 'Xem các chunk của một SOP hoặc tài liệu (Admin-only)'
      }
    }, (request) => controller.listChunks(request))

    app.get<{ Params: { chunkId: string } }>('/admin/rag/chunks/:chunkId', {
      schema: {
        tags: ['Administration - RAG'],
        summary: 'Xem chi tiết một chunk RAG (Admin-only)'
      }
    }, (request) => controller.getChunk(request))
  }
}
