import type { ModuleDto, ModuleRepository } from '../modules/modules/module.repository.js'
import { hasPermission } from './authorization.js'
import type { AuthPrincipal } from './types.js'

const readablePermissions = ['sop.read', 'module.manage'] as const

export async function listReadableModules(
  principal: AuthPrincipal,
  repository: ModuleRepository
): Promise<ModuleDto[]> {
  const modules = await repository.list()
  if (readablePermissions.some((permission) => hasPermission(principal, permission))) return modules

  const scopedSopIds = principal.grants
    .filter((grant) => grant.permissionCode === 'sop.read' && grant.scopeType === 'sop')
    .map((grant) => grant.scopeId)
  const inheritedModuleIds = new Set(await repository.findModuleIdsForSops(scopedSopIds))

  return modules.filter((module) =>
    readablePermissions.some((permission) => hasPermission(principal, permission, 'module', module.id))
    || inheritedModuleIds.has(module.id)
  )
}

export async function canReadModule(
  principal: AuthPrincipal,
  repository: ModuleRepository,
  moduleId: string
): Promise<boolean> {
  const modules = await listReadableModules(principal, repository)
  return modules.some((module) => module.id === moduleId)
}
