import type { FastifyRequest } from 'fastify'
import type { AuthService } from '../services/auth.service.js'
import type { RuntimeService } from '../services/runtime.service.js'
import type { CatalogQuery } from '../schemas/runtime.schemas.js'

export class RuntimeController {
  constructor(private readonly auth: AuthService, private readonly service: RuntimeService) {}
  async dataset(request: FastifyRequest<{ Params: { key: string } }>) {
    const key = request.params.key === 'core-operations' ? 'coreOperations.config' : request.params.key
    return this.service.dataset(await this.auth.authenticate(request), key)
  }
  async workflows(request: FastifyRequest) { return this.service.workflows(await this.auth.authenticate(request)) }
  async workflow(request: FastifyRequest<{ Params: { workflowId: string } }>) {
    return this.service.workflow(await this.auth.authenticate(request), request.params.workflowId)
  }
  async documents(request: FastifyRequest<{ Querystring: CatalogQuery }>) {
    return this.service.documents(await this.auth.authenticate(request), request.query)
  }
  async document(request: FastifyRequest<{ Params: { documentId: string } }>) {
    return this.service.document(await this.auth.authenticate(request), request.params.documentId)
  }
}
