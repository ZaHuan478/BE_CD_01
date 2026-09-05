import type { FastifyRequest } from 'fastify'
import type { AuthService } from '../services/auth.service.js'
import type { MeService } from '../services/me.service.js'
export class MeController {
  constructor(private readonly auth: AuthService, private readonly service: MeService) {}
  async get(request: FastifyRequest) { return this.service.get(await this.auth.authenticate(request)) }
  async modules(request: FastifyRequest) {
    return { data: await this.service.modules(await this.auth.authenticate(request)), requestId: request.id }
  }
}
