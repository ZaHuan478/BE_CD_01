import type { FastifyPluginAsync } from 'fastify'
import { Type, type Static } from '@sinclair/typebox'
import type { AuthService } from '../services/auth.service.js'
import type { SopWorkspaceRepository } from '../repositories/sop-workspace.repository.js'
import { SopWorkspaceService } from '../services/sop-workspace.service.js'
import { SopWorkspaceController } from '../controllers/sop-workspace.controller.js'
import { createSopSchema } from '../schemas/sop.schemas.js'
import type { IndexingService } from '../services/rag/indexing.service.js'

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

export function sopWorkspaceRoutes(auth: AuthService, repository: SopWorkspaceRepository, indexingService?: IndexingService): FastifyPluginAsync {
  const service = new SopWorkspaceService(repository, indexingService)
  const controller = new SopWorkspaceController(auth, service)

  return async app => {
    app.addHook('onRequest', async (_req, reply) => { reply.header('Cache-Control', 'private, no-store') })
    app.get<{ Querystring: Static<typeof list> }>('/sop-workspace', { schema: { querystring: list } }, async req => controller.list(req))
    app.post<{ Body: Static<typeof create> }>('/sop-workspace', { schema: { body: create } }, async req => controller.create(req))
    app.get<{ Params: { id: string } }>('/sop-workspace/:id', { schema: { params } }, async req => controller.get(req))
    app.put<{ Params: { id: string }; Body: Static<typeof save> }>('/sop-workspace/:id', { schema: { params, body: save } }, async req => controller.save(req))
    app.post<{ Params: { id: string }; Body: Static<typeof action> }>('/sop-workspace/:id/actions', { schema: { params, body: action } }, async req => controller.action(req))
  }
}
