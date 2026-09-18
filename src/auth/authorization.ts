import type { AuthPrincipal, ScopeType } from './types.js'

export function hasPermission(
  principal: AuthPrincipal,
  permissionCode: string,
  scopeType?: ScopeType,
  scopeId?: string
): boolean {
  return (principal.grants ?? []).some((grant) => {
    if (grant.permissionCode !== permissionCode) return false
    if (grant.scopeType === 'system' && grant.scopeId === '*') return true
    return grant.scopeType === scopeType && grant.scopeId === scopeId
  })
}

export function canAccessSop(
  principal: AuthPrincipal,
  permissionCode: string,
  sopId: string,
  moduleIds: string[]
): boolean {
  return hasPermission(principal, permissionCode)
    || hasPermission(principal, permissionCode, 'sop', sopId)
    || moduleIds.some((moduleId) => hasPermission(principal, permissionCode, 'module', moduleId))
}

export function hasAnyPermission(principal: AuthPrincipal, permissionCode: string): boolean {
  return (principal.grants ?? []).some((grant) => grant.permissionCode === permissionCode)
}

