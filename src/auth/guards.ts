import { forbidden } from '../common/errors.js'
import { hasPermission } from './authorization.js'
import type { AuthPrincipal, ScopeType } from './types.js'

export function requirePermission(
  principal: AuthPrincipal,
  permissionCode: string,
  scopeType?: ScopeType,
  scopeId?: string
): void {
  if (!hasPermission(principal, permissionCode, scopeType, scopeId)) {
    throw forbidden(`Permission ${permissionCode} is required for this scope`)
  }
}

