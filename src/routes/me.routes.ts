import { MeController } from '../controllers/me.controller.js'
import { MeService } from '../services/me.service.js'
import type { FastifyPluginAsync } from 'fastify'
import type { AuthService } from '../services/auth.service.js'
import type { ModuleRepository } from '../repositories/module.repository.js'
import { MeRepository } from '../repositories/me.repository.js'

export function meRoutes(
  authService: AuthService,
  repository: MeRepository,
  moduleRepository: ModuleRepository
): FastifyPluginAsync {
  const controller = new MeController(authService, new MeService(repository, moduleRepository))
  return async (app) => {
    app.get('/me', {
      schema: { tags: ['Identity'], summary: 'Current account, groups, grants and allowed menu' }
    }, (request) => controller.get(request))

    app.get('/me/modules', {
      schema: { tags: ['Identity'], summary: 'List effective modules for the current account' }
    }, (request) => controller.modules(request))
  }
}
