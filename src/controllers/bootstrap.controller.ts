import type { FastifyRequest } from 'fastify'
import type { AuthService } from '../services/auth.service.js'
import type { BootstrapService } from '../services/bootstrap.service.js'
export class BootstrapController {
  constructor(private readonly auth: AuthService, private readonly service: BootstrapService) {}
  async get(request: FastifyRequest) { return this.service.get(await this.auth.authenticate(request)) }
  async acknowledgement(request: FastifyRequest<{ Params: { policyId: string } }>) {
    return this.service.acknowledgement(await this.auth.authenticate(request), request.params.policyId)
  }
  async setAcknowledgement(request: FastifyRequest<{ Params: { policyId: string }; Body: { acknowledged: boolean } }>) {
    return this.service.setAcknowledgement(await this.auth.authenticate(request), request.params.policyId, request.body.acknowledged)
  }
}
