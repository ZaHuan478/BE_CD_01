import type { FastifyReply, FastifyRequest } from 'fastify'
import type { AuthService } from '../services/auth.service.js'
import type { IndexingService } from '../services/rag/indexing.service.js'
import { forbidden, notFound } from '../common/errors.js'
import { hasPermission } from '../auth/authorization.js'
import type { ReindexRequest } from '../schemas/rag.schemas.js'

export class RagController {
  constructor(
    private readonly auth: AuthService,
    private readonly indexingService: IndexingService
  ) {}

  private assertAdmin(principal: Awaited<ReturnType<AuthService['authenticate']>>) {
    const isAdmin =
      principal.systemRole === 'ADMIN' ||
      principal.systemRole === 'SUPER_ADMIN' ||
      hasPermission(principal, 'rag.manage')

    if (!isAdmin) {
      throw forbidden('Chỉ Quản trị viên hệ thống (Admin) mới có quyền truy cập quản trị RAG và Chỉ mục.')
    }
  }

  async getStatus(request: FastifyRequest<{
    Querystring: { search?: string; query?: string; page?: string; pageSize?: string }
  }>) {
    const principal = await this.auth.authenticate(request)
    this.assertAdmin(principal)
    const query = request.query || {}
    const data = await this.indexingService.getOverview({
      search: query.search ?? query.query,
      page: Number(query.page || 1),
      pageSize: Number(query.pageSize || 25)
    })
    return { data, requestId: request.id }
  }

  async triggerReindex(request: FastifyRequest<{ Body: ReindexRequest }>, reply: FastifyReply) {
    const principal = await this.auth.authenticate(request)
    this.assertAdmin(principal)

    const { scope, targetId } = request.body
    if ((scope === 'module' || scope === 'sop') && !targetId) {
      throw forbidden(scope === 'module' ? 'Thiếu targetId (Mã phân hệ)' : 'Thiếu targetId (Mã SOP / Document)')
    }
    const job = await this.indexingService.enqueueReindex(scope, targetId, principal.accountId)
    return reply.code(202).send({
      data: {
        message: 'Đã đưa yêu cầu vào hàng đợi lập chỉ mục.',
        ...job
      },
      requestId: request.id
    })
  }

  async listChunks(request: FastifyRequest<{
    Params: { entityId: string }
    Querystring: { versionId?: string; query?: string; search?: string; page?: string; pageSize?: string }
  }>) {
    const principal = await this.auth.authenticate(request)
    this.assertAdmin(principal)

    const query = request.query || {}
    const data = await this.indexingService.listChunks(request.params.entityId, {
      versionId: query.versionId,
      query: query.query ?? query.search,
      page: Number(query.page || 1),
      pageSize: Number(query.pageSize || 25)
    })
    return { data, requestId: request.id }
  }

  async getChunk(request: FastifyRequest<{ Params: { chunkId: string } }>) {
    const principal = await this.auth.authenticate(request)
    this.assertAdmin(principal)

    const data = await this.indexingService.getChunk(request.params.chunkId)
    if (!data) throw notFound('RAG chunk', request.params.chunkId)
    return { data, requestId: request.id }
  }
}
