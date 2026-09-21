import type { FastifyPluginAsync } from 'fastify'
import { Type } from '@sinclair/typebox'
import type { AuthService } from '../services/auth.service.js'
import { Core8Service } from '../services/core8.service.js'
import { Core8Controller } from '../controllers/core8.controller.js'
import type { Core8Repository } from '../repositories/core8.repository.js'
import type { ModuleRepository } from '../repositories/module.repository.js'
import { coreDocumentBody, coreVersionBody, coreIdParams, type CoreDocumentBody, type CoreVersionBody } from '../schemas/core8.schemas.js'

export function core8Routes(auth: AuthService, repository: Core8Repository, modules: ModuleRepository): FastifyPluginAsync {
  const controller = new Core8Controller(auth, new Core8Service(repository, modules))
  return async app => {
    app.addHook('onRequest', async (_request, reply) => { reply.header('Cache-Control', 'private, no-store') })
    app.post<{ Body: CoreDocumentBody }>('/knowledge-documents', {
      schema: {
        tags: ['Core8'],
        summary: 'Create a knowledge document with initial revision (Core8)',
        description: 'Khởi tạo tài liệu quy trình SOP theo chuẩn cơ sở dữ liệu Core8 với phiên bản nháp ban đầu',
        body: coreDocumentBody
      }
    }, req => controller.create(req))

    app.post<{ Params: { id: string }; Body: CoreVersionBody }>('/knowledge-documents/:id/versions', {
      schema: {
        tags: ['Core8'],
        summary: 'Add a new version revision to a knowledge document (Core8)',
        description: 'Tạo bản sửa đổi (version/revision) mới cho quy trình SOP đã có',
        params: coreIdParams,
        body: coreVersionBody
      }
    }, req => controller.addVersion(req))

    app.get<{ Params: { id: string } }>('/knowledge-documents/:id/versions', {
      schema: {
        tags: ['Core8'],
        summary: 'List all versions of a knowledge document (Core8)',
        description: 'Lấy lịch sử tất cả các phiên bản và trạng thái của tài liệu quy trình',
        params: coreIdParams
      }
    }, req => controller.versions(req))

    app.get<{ Params: { id: string; version: number } }>('/knowledge-documents/:id/versions/:version', {
      schema: {
        tags: ['Core8'],
        summary: 'Get details of a specific version revision (Core8)',
        description: 'Lấy nội dung chi tiết các bước (steps) và biểu mẫu của một phiên bản cụ thể phục vụ so sánh phiên bản (version diff)',
        params: Type.Object({ id: Type.String({ minLength: 1, maxLength: 100 }), version: Type.Integer({ minimum: 1 }) })
      }
    }, req => controller.version(req))

    const params = Type.Object({ policyId: Type.String({ minLength: 1, maxLength: 200 }) })
    app.get<{ Params: { policyId: string } }>('/policy-acknowledgements/:policyId', {
      schema: {
        tags: ['Core8'],
        summary: 'Check policy acknowledgement status (Core8)',
        description: 'Kiểm tra trạng thái xác nhận đọc chính sách của tài khoản hiện tại',
        params
      }
    }, req => controller.acknowledgement(req))

    app.put<{ Params: { policyId: string }; Body: { acknowledged: boolean } }>('/policy-acknowledgements/:policyId', {
      schema: {
        tags: ['Core8'],
        summary: 'Record policy acknowledgement status (Core8)',
        description: 'Lưu trạng thái xác nhận đã hiểu và tuân thủ chính sách',
        params,
        body: Type.Object({ acknowledged: Type.Boolean() }, { additionalProperties: false })
      }
    }, req => controller.acknowledgement(req))
  }
}
