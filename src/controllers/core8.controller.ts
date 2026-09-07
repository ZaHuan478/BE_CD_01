import type { FastifyRequest } from 'fastify'
import type { AuthService } from '../services/auth.service.js'
import type { Core8Service } from '../services/core8.service.js'
import type { CoreDocumentBody, CoreVersionBody } from '../schemas/core8.schemas.js'
export class Core8Controller {
  constructor(private readonly auth: AuthService, private readonly service: Core8Service) {}
  async create(req: FastifyRequest<{ Body: CoreDocumentBody }>) { return this.service.create(await this.auth.authenticate(req), req.body) }
  async addVersion(req: FastifyRequest<{ Params: { id: string }; Body: CoreVersionBody }>) { return this.service.addVersion(await this.auth.authenticate(req), req.params.id, req.body) }
  async versions(req: FastifyRequest<{ Params: { id: string } }>) { return this.service.versions(await this.auth.authenticate(req), req.params.id) }
  async version(req: FastifyRequest<{ Params: { id: string; version: number } }>) { return this.service.version(await this.auth.authenticate(req), req.params.id, req.params.version) }
  async acknowledgement(req: FastifyRequest<{ Params: { policyId: string }; Body?: { acknowledged: boolean } }>) {
    return this.service.acknowledgement(await this.auth.authenticate(req), req.params.policyId, req.body?.acknowledged)
  }
}
