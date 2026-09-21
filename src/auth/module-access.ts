import type { ModuleDto, ModuleRepository } from '../repositories/module.repository.js'
import { hasPermission } from './authorization.js'
import type { AuthPrincipal } from './types.js'

const readablePermissions = ['sop.read', 'module.manage'] as const

export async function listReadableModules(
  principal: AuthPrincipal,
  repository: ModuleRepository
): Promise<ModuleDto[]> {
  const modules = await repository.list()
  if (readablePermissions.some((permission) => hasPermission(principal, permission))) return modules

  const directModuleIds = new Set(principal.grants
    .filter((grant) => grant.permissionCode === 'sop.read' && grant.scopeType === 'module')
    .map((grant) => grant.scopeId))
  const scopedSopIds = principal.grants
    .filter((grant) => grant.permissionCode === 'sop.read' && grant.scopeType === 'sop')
    .map((grant) => grant.scopeId)
  // Direct module assignments are an explicit allow-list. Once an admin has
  // assigned at least one module, SOP-level roles must not silently re-expand
  // the user's module catalogue after a revoke. Accounts with no direct module
  // assignment retain the fine-grained SOP-role behaviour for backward
  // compatibility.
  const inheritedModuleIds = directModuleIds.size === 0
    ? new Set(await repository.findModuleIdsForSops(scopedSopIds))
    : new Set<string>()

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
