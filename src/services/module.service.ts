import type { AuthPrincipal } from '../auth/types.js'
import { canReadModule, listReadableModules } from '../auth/module-access.js'
import { requirePermission } from '../auth/guards.js'
import type { ModuleRepository } from '../repositories/module.repository.js'
import type { CreateModuleBody, UpdateModuleBody } from '../schemas/module.schemas.js'

export class ModuleService {
  constructor(private readonly repository: ModuleRepository) {}

  listReadable(principal: AuthPrincipal) {
    return listReadableModules(principal, this.repository)
  }

  async getReadable(principal: AuthPrincipal, moduleId: string) {
    const module = await this.repository.findById(moduleId)
    if (!(await canReadModule(principal, this.repository, module.id))) {
      requirePermission(principal, 'sop.read', 'module', module.id)
    }
    return module
  }

  create(principal: AuthPrincipal, body: CreateModuleBody) {
    requirePermission(principal, 'module.manage')
    return this.repository.create(body, principal.accountId)
  }

  update(principal: AuthPrincipal, moduleId: string, body: UpdateModuleBody) {
    requirePermission(principal, 'module.manage', 'module', moduleId)
    return this.repository.update(moduleId, body, principal.accountId)
  }
}
