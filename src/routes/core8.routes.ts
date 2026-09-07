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
    app.post<{ Body: CoreDocumentBody }>('/knowledge-documents', { schema: { tags: ['Core8'], body: coreDocumentBody } }, req => controller.create(req))
    app.post<{ Params: { id: string }; Body: CoreVersionBody }>('/knowledge-documents/:id/versions', {
      schema: { tags: ['Core8'], params: coreIdParams, body: coreVersionBody }
    }, req => controller.addVersion(req))
    app.get<{ Params: { id: string } }>('/knowledge-documents/:id/versions', { schema: { tags: ['Core8'], params: coreIdParams } }, req => controller.versions(req))
    app.get<{ Params: { id: string; version: number } }>('/knowledge-documents/:id/versions/:version', {
      schema: { tags: ['Core8'], params: Type.Object({ id: Type.String({ minLength: 1, maxLength: 100 }), version: Type.Integer({ minimum: 1 }) }) }
    }, req => controller.version(req))
    const params = Type.Object({ policyId: Type.String({ minLength: 1, maxLength: 200 }) })
    app.get<{ Params: { policyId: string } }>('/policy-acknowledgements/:policyId', { schema: { tags: ['Core8'], params } }, req => controller.acknowledgement(req))
    app.put<{ Params: { policyId: string }; Body: { acknowledged: boolean } }>('/policy-acknowledgements/:policyId', {
      schema: { tags: ['Core8'], params, body: Type.Object({ acknowledged: Type.Boolean() }, { additionalProperties: false }) }
    }, req => controller.acknowledgement(req))
  }
}
