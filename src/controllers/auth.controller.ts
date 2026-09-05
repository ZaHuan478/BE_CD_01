import type { FastifyRequest } from 'fastify'
import type { AuthService } from '../services/auth.service.js'
export class AuthController {
  constructor(private readonly service: AuthService) {}
  async accounts() { return { items: await this.service.listDevelopmentAccounts() } }
  login(request: FastifyRequest<{ Body: { identifier: string; password: string } }>) {
    return this.service.loginDevelopment(request.body.identifier, request.body.password)
  }
}
