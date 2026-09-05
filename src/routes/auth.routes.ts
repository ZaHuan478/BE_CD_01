import type { FastifyPluginAsync } from 'fastify'
import type { AuthService } from '../services/auth.service.js'
import { AuthController } from '../controllers/auth.controller.js'
export function authRoutes(service: AuthService): FastifyPluginAsync {
  const controller = new AuthController(service)
  return async app => {
    app.get('/auth/development-accounts', {
      schema: { tags: ['Identity'], summary: 'List local demo identities (development only)' }
    }, () => controller.accounts())
    app.post<{ Body: { identifier: string; password: string } }>('/auth/development-login', {
      schema: {
        tags: ['Identity'],
        body: {
          type: 'object', additionalProperties: false, required: ['identifier', 'password'],
          properties: {
            identifier: { type: 'string', minLength: 1, maxLength: 320 },
            password: { type: 'string', minLength: 1, maxLength: 200 }
          }
        }
      }
    }, request => controller.login(request))
  }
}
