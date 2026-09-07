import type { FastifyPluginAsync } from 'fastify'
import type { AuthService } from '../services/auth.service.js'
import type { RuntimeRepository } from '../repositories/runtime.repository.js'
import type { ModuleRepository } from '../repositories/module.repository.js'
import type { KnowledgeReadRepository } from '../repositories/knowledge-read.repository.js'
import { RuntimeService } from '../services/runtime.service.js'
import { RuntimeController } from '../controllers/runtime.controller.js'
import { catalogQuerySchema, datasetParamsSchema, documentParamsSchema, workflowParamsSchema, type CatalogQuery } from '../schemas/runtime.schemas.js'

export function runtimeRoutes(auth: AuthService, repository: RuntimeRepository, modules: ModuleRepository, normalized?: Pick<KnowledgeReadRepository, 'list' | 'get'>): FastifyPluginAsync {
  const controller = new RuntimeController(auth, new RuntimeService(repository, modules, normalized))
  return async app => {
    // Responses depend on the authenticated principal and must not enter a shared HTTP cache.
    app.addHook('onRequest', async (_request, reply) => { reply.header('Cache-Control', 'private, no-store') })
    app.get<{ Params: { key: string } }>('/ui/datasets/:key', {
      schema: { tags: ['Knowledge reads'], params: datasetParamsSchema }
    }, request => controller.dataset(request))
    app.get('/ui/workflows', { schema: { tags: ['Knowledge reads'], summary: 'Workflow navigation index without step bodies' } }, request => controller.workflows(request))
    app.get<{ Params: { workflowId: string } }>('/ui/workflows/:workflowId', {
      schema: { tags: ['Knowledge reads'], params: workflowParamsSchema }
    }, request => controller.workflow(request))
    for (const path of ['/knowledge-documents', '/knowledge-search']) {
      app.get<{ Querystring: CatalogQuery }>(path, {
        schema: { tags: ['Knowledge reads'], querystring: catalogQuerySchema }
      }, request => controller.documents(request))
    }
    app.get<{ Params: { documentId: string } }>('/knowledge-documents/:documentId', {
      schema: { tags: ['Knowledge reads'], params: documentParamsSchema }
    }, request => controller.document(request))
  }
}
