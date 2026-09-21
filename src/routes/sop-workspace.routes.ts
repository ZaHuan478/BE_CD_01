import type { FastifyPluginAsync } from 'fastify'
import { Type, type Static } from '@sinclair/typebox'
import type { AuthService } from '../services/auth.service.js'
import type { SopWorkspaceRepository } from '../repositories/sop-workspace.repository.js'
import { SopWorkspaceService } from '../services/sop-workspace.service.js'
import { SopWorkspaceController } from '../controllers/sop-workspace.controller.js'
import { createSopSchema } from '../schemas/sop.schemas.js'
import type { IndexingService } from '../services/rag/indexing.service.js'
import type { SopImportService } from '../services/sop-import.service.js'

const params = Type.Object({ id: Type.String({ minLength: 1, maxLength: 100 }) })
const create = Type.Union([
  Type.Object({ documentId: Type.String({ minLength: 1, maxLength: 100 }) }, { additionalProperties: false }),
  Type.Object({ preview: createSopSchema }, { additionalProperties: false })
])
const save = Type.Object({ revision: Type.Integer({ minimum: 1 }), preview: createSopSchema }, { additionalProperties: false })
const action = Type.Object({
  revision: Type.Integer({ minimum: 1 }),
  action: Type.Union([
    Type.Literal('submit'),
    Type.Literal('review'),
    Type.Literal('reject'),
    Type.Literal('publish'),
    Type.Literal('archive'),
    Type.Literal('trash'),
    Type.Literal('restore')
  ]),
  note: Type.Optional(Type.String({ maxLength: 4000 }))
}, { additionalProperties: false })
const list = Type.Object({
  q: Type.Optional(Type.String({ maxLength: 200 })),
  state: Type.Optional(Type.String({ maxLength: 30 })),
  page: Type.Optional(Type.Integer({ minimum: 1 })),
  pageSize: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 }))
}, { additionalProperties: false })
const archiveDocumentParams = Type.Object({ documentId: Type.String({ minLength: 1, maxLength: 100 }) })
const archiveDocumentBody = Type.Object({
  reason: Type.String({ minLength: 1, maxLength: 4000 }),
  expectedVersion: Type.Integer({ minimum: 1 })
}, { additionalProperties: false })
const deleteParams = Type.Object({ id: Type.String({ minLength: 1, maxLength: 100 }) })

export function sopWorkspaceRoutes(auth: AuthService, repository: SopWorkspaceRepository, indexingService?: IndexingService, importService?: SopImportService): FastifyPluginAsync {
  const service = new SopWorkspaceService(repository, indexingService, importService)
  const controller = new SopWorkspaceController(auth, service)

  return async app => {
    app.addHook('onRequest', async (_req, reply) => { reply.header('Cache-Control', 'private, no-store') })
    app.get<{ Querystring: Static<typeof list> }>('/sop-workspace', {
      schema: {
        tags: ['SOP Workspace'],
        summary: 'List SOP documents in workspace',
        description: 'Danh sách tài liệu SOP trong không gian làm việc với bộ lọc từ khóa, trạng thái và phân trang',
        querystring: list
      }
    }, async req => controller.list(req))

    app.post<{ Body: Static<typeof create> }>('/sop-workspace', {
      schema: {
        tags: ['SOP Workspace'],
        summary: 'Create SOP workspace draft',
        description: 'Tạo bản nháp quy trình SOP mới hoặc tạo bản nháp sửa đổi từ một documentId đã có',
        body: create
      }
    }, async req => controller.create(req))

    app.get<{ Params: { id: string } }>('/sop-workspace/:id', {
      schema: {
        tags: ['SOP Workspace'],
        summary: 'Get SOP workspace draft detail',
        description: 'Lấy chi tiết bản ghi không gian làm việc SOP bao gồm nội dung bản nháp, revision hiện tại',
        params
      }
    }, async req => controller.get(req))

    app.put<{ Params: { id: string }; Body: Static<typeof save> }>('/sop-workspace/:id', {
      schema: {
        tags: ['SOP Workspace'],
        summary: 'Save SOP workspace draft changes',
        description: 'Lưu thay đổi nội dung bản nháp SOP (yêu cầu kiểm tra xung đột revision)',
        params,
        body: save
      }
    }, async req => controller.save(req))

    app.post<{ Params: { id: string }; Body: Static<typeof action> }>('/sop-workspace/:id/actions', {
      schema: {
        tags: ['SOP Workspace'],
        summary: 'Execute SOP lifecycle action (submit, review, reject, publish, archive, trash, restore)',
        description: 'Thực hiện chuyển đổi trạng thái vòng đời SOP (gửi duyệt, phê duyệt, từ chối, xuất bản lên Core8, lưu trữ, xóa tạm, khôi phục)',
        params,
        body: action
      }
    }, async req => controller.action(req))

    app.post<{ Params: Static<typeof archiveDocumentParams>; Body: Static<typeof archiveDocumentBody> }>(
      '/admin/sop-documents/:documentId/archive',
      {
        schema: {
          tags: ['SOP Workspace'],
          summary: 'Archive SOP document (Admin)',
          description: 'Lưu trữ một tài liệu SOP đã xuất bản cấp quản trị viên',
          params: archiveDocumentParams,
          body: archiveDocumentBody
        }
      },
      async req => controller.archiveDocument(req)
    )

    app.post<{ Params: Static<typeof archiveDocumentParams>; Body: Static<typeof archiveDocumentBody> }>(
      '/sop-workspace/documents/:documentId/archive',
      {
        schema: {
          tags: ['SOP Workspace'],
          summary: 'Archive SOP document',
          description: 'Lưu trữ tài liệu quy trình SOP',
          params: archiveDocumentParams,
          body: archiveDocumentBody
        }
      },
      async req => controller.archiveDocument(req)
    )

    app.delete<{ Params: Static<typeof deleteParams>; Querystring: { confirmCode?: string }; Body?: { confirmCode?: string } }>(
      '/sop-workspace/:id',
      {
        schema: {
          tags: ['SOP Workspace'],
          summary: 'Permanently delete SOP workspace draft',
          description: 'Xóa vĩnh viễn bản ghi bản nháp SOP khỏi không gian làm việc',
          params: deleteParams
        }
      },
      async req => controller.permanentDelete(req)
    )
  }
}
