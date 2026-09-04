import type { FastifyPluginAsync } from 'fastify'
import { hasAnyPermission } from '../../auth/authorization.js'
import { listReadableModules } from '../../auth/module-access.js'
import type { AuthService } from '../../auth/auth.service.js'
import type { ModuleRepository } from '../modules/module.repository.js'
import { MeRepository } from './me.repository.js'

export function meRoutes(
  authService: AuthService,
  repository: MeRepository,
  moduleRepository: ModuleRepository
): FastifyPluginAsync {
  return async (app) => {
    app.get('/me', {
      schema: { tags: ['Identity'], summary: 'Current account, groups, grants and allowed menu' }
    }, async (request) => {
      const principal = await authService.authenticate(request)
      const modules = await listReadableModules(principal, moduleRepository)
      const readableModuleIds = new Set(modules.map((module) => module.id))
      const menuItems = (await repository.listMenuItems()).filter((item) =>
        (!item.requiredPermissionCode || hasAnyPermission(principal, item.requiredPermissionCode))
        && (item.moduleIds.length === 0 || item.moduleIds.some((moduleId) => readableModuleIds.has(moduleId)))
      )
      return {
        ...principal,
        menuItems,
        modules,
        capabilities: [...new Set(principal.grants.map((grant) => grant.permissionCode))].sort()
      }
    })
  }
}
