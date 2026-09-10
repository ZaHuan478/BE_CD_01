import { hasAnyPermission } from '../auth/authorization.js'
import { listReadableModules } from '../auth/module-access.js'
import type { AuthPrincipal } from '../auth/types.js'
import type { MeRepository } from '../repositories/me.repository.js'
import type { ModuleRepository } from '../repositories/module.repository.js'
export class MeService {
  constructor(private readonly repository: MeRepository, private readonly moduleRepository: ModuleRepository) {}
  modules(principal: AuthPrincipal) { return listReadableModules(principal, this.moduleRepository) }
  async get(principal: AuthPrincipal) {
    const modules = await listReadableModules(principal, this.moduleRepository)
    const readableModuleIds = new Set(modules.map((module) => module.id))
    const menuItems = (await this.repository.listMenuItems()).filter((item) => {
      // Company policies apply to every authenticated employee. Keep this guard here
      // as well as in menu configuration so older imported databases cannot hide it.
      if (item.code === 'policy-center') return true
      // The admin workspace is available to both administrator tiers. The
      // `permission.manage` capability is intentionally Super Admin-only, so
      // using it as the menu visibility check would hide the workspace from a
      // regular Admin even though the workspace has Admin-safe sections.
      if (item.code === 'ADMIN' && ['ADMIN', 'SUPER_ADMIN'].includes(principal.systemRole)) return true
      return (!item.requiredPermissionCode || hasAnyPermission(principal, item.requiredPermissionCode))
        && (item.moduleIds.length === 0 || item.moduleIds.some((moduleId) => readableModuleIds.has(moduleId)))
    })
    return {
      ...principal,
      menuItems,
      modules,
      capabilities: [...new Set(principal.grants.map((grant) => grant.permissionCode))].sort()
    }
  }
}
