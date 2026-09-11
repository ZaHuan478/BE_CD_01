import type { FastifyReply, FastifyRequest } from 'fastify'
import type { AuthService } from '../services/auth.service.js'
import type { IndexingService } from '../services/rag/indexing.service.js'
import { forbidden } from '../common/errors.js'
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

  async getStatus(request: FastifyRequest) {
    const principal = await this.auth.authenticate(request)
    this.assertAdmin(principal)
    const data = await this.indexingService.getOverview()
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
}
