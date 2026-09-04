export type ScopeType = 'system' | 'module' | 'sop'

export interface PrincipalGrant {
  permissionCode: string
  scopeType: ScopeType
  scopeId: string
}

export interface AuthPrincipal {
  accountId: string
  username: string
  fullName: string
  email: string | null
  groupIds: string[]
  grants: PrincipalGrant[]
}

