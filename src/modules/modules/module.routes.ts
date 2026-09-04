import type { FastifyPluginAsync } from 'fastify'
import { canReadModule, listReadableModules } from '../../auth/module-access.js'
import { requirePermission } from '../../auth/guards.js'
import type { AuthService } from '../../auth/auth.service.js'
import { ModuleRepository } from './module.repository.js'
import {
  createModuleSchema,
  moduleParamsSchema,
  updateModuleSchema,
  type CreateModuleBody,
  type UpdateModuleBody
} from './module.schemas.js'

interface ModuleParams { moduleId: string }

export function moduleRoutes(authService: AuthService, repository: ModuleRepository): FastifyPluginAsync {
  return async (app) => {
    app.get('/modules', {
      schema: { tags: ['Modules'], summary: 'List modules visible to current account' }
    }, async (request) => {
      const principal = await authService.authenticate(request)
      return { items: await listReadableModules(principal, repository) }
    })

    app.get<{ Params: ModuleParams }>('/modules/:moduleId', {
      schema: { tags: ['Modules'], summary: 'Get one module', params: moduleParamsSchema }
    }, async (request) => {
      const principal = await authService.authenticate(request)
      const module = await repository.findById(request.params.moduleId)
      if (!(await canReadModule(principal, repository, module.id))) {
        requirePermission(principal, 'sop.read', 'module', module.id)
      }
      return module
    })

    app.post<{ Body: CreateModuleBody }>('/modules', {
      schema: { tags: ['Modules'], summary: 'Create a module', body: createModuleSchema }
    }, async (request, reply) => {
      const principal = await authService.authenticate(request)
      requirePermission(principal, 'module.manage')
      const created = await repository.create(request.body)
      return reply.code(201).send(created)
    })

    app.patch<{ Params: ModuleParams; Body: UpdateModuleBody }>('/modules/:moduleId', {
      schema: {
        tags: ['Modules'],
        summary: 'Update or archive a module',
        params: moduleParamsSchema,
        body: updateModuleSchema
      }
    }, async (request) => {
      const principal = await authService.authenticate(request)
      requirePermission(principal, 'module.manage', 'module', request.params.moduleId)
      return repository.update(request.params.moduleId, request.body)
    })
  }
}
