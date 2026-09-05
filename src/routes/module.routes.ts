import type { FastifyPluginAsync } from 'fastify'
import type { AuthService } from '../services/auth.service.js'
import { ModuleController } from '../controllers/module.controller.js'
import { ModuleRepository } from '../repositories/module.repository.js'
import { ModuleService } from '../services/module.service.js'
import {
  createModuleSchema,
  moduleParamsSchema,
  updateModuleSchema,
  type CreateModuleBody,
  type UpdateModuleBody
} from '../schemas/module.schemas.js'

interface ModuleParams { moduleId: string }

export function moduleRoutes(authService: AuthService, repository: ModuleRepository): FastifyPluginAsync {
  const controller = new ModuleController(authService, new ModuleService(repository))
  return async (app) => {
    app.get('/modules', {
      schema: { tags: ['Modules'], summary: 'List modules visible to current account' }
    }, (request) => controller.list(request))

    app.get<{ Params: ModuleParams }>('/modules/:moduleId', {
      schema: { tags: ['Modules'], summary: 'Get one module', params: moduleParamsSchema }
    }, (request) => controller.get(request))

    app.post<{ Body: CreateModuleBody }>('/modules', {
      schema: { tags: ['Modules'], summary: 'Create a module', body: createModuleSchema }
    }, (request, reply) => controller.create(request, reply))

    app.patch<{ Params: ModuleParams; Body: UpdateModuleBody }>('/modules/:moduleId', {
      schema: {
        tags: ['Modules'],
        summary: 'Update or archive a module',
        params: moduleParamsSchema,
        body: updateModuleSchema
      }
    }, (request) => controller.update(request))
  }
}
