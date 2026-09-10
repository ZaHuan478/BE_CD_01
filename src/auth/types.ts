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
  systemRole: 'USER' | 'CONTENT_EDITOR' | 'ADMIN' | 'SUPER_ADMIN'
  organization: {
    employeeCode: string | null
    company: string | null
    division: string | null
    department: string | null
    team: string | null
    jobTitle: string | null
    managerAccountId: string | null
  }
  groupIds: string[]
  grants: PrincipalGrant[]
}

