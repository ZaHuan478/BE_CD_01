import type { QueryRunner } from '../database/database.js'
import type { AuthPrincipal, PrincipalGrant } from '../auth/types.js'
import { CoreAuthRepository } from './core-auth.repository.js'

interface AccountRow {
  AccountId: string
  Username: string
  FullName: string
  Email: string | null
  SystemRole: AuthPrincipal['systemRole']
  EmployeeCode: string | null
  CompanyName: string | null
  DivisionName: string | null
  DepartmentName: string | null
  TeamName: string | null
  JobTitle: string | null
  ManagerAccountId: string | null
}

interface GroupRow { GroupId: string }

interface GrantRow {
  PermissionCode: string
  ScopeType: PrincipalGrant['scopeType']
  ScopeId: string
}

interface DevelopmentAccountRow {
  AccountId: string
  Username: string
  FullName: string
  Email: string | null
  SystemRole: AuthPrincipal['systemRole']
  GroupCode: string | null
  GroupName: string | null
  GroupDescription: string | null
}

interface DevelopmentAccountModuleRow {
  AccountId: string
  ModuleId: string
  ModuleCode: string
  ModuleTitle: string
}

interface DevelopmentLoginAccountRow {
  AccountId: string
  Username: string
  FullName: string
  Email: string | null
}

export class AuthRepository {
  constructor(private readonly database: QueryRunner, private readonly core8 = false) {}

  async findPrincipal(identity: { accountId?: string; externalSubject?: string }): Promise<AuthPrincipal | null> {
    if (this.core8) return new CoreAuthRepository(this.database).findPrincipal(identity)
    const where = identity.accountId ? 'a.AccountId = :identity' : 'a.ExternalSubject = :identity'
    const identityValue = identity.accountId ?? identity.externalSubject
    if (!identityValue) return null

    const accounts = await this.database.query<AccountRow>(`
      SELECT a.AccountId, a.Username, a.FullName, a.Email, a.SystemRole,
             a.EmployeeCode, a.CompanyName, a.DivisionName, a.DepartmentName,
             a.TeamName, a.JobTitle, a.ManagerAccountId
      FROM Account a
      WHERE ${where} AND a.IsActive = 1
    `, { identity: identityValue })
    const account = accounts[0]
    if (!account) return null

    const [groups, groupGrants, moduleGrants] = await Promise.all([
      this.database.query<GroupRow>(`
        SELECT ag.GroupId
        FROM AccountGroup ag
        INNER JOIN UserGroup g ON g.GroupId = ag.GroupId AND g.IsActive = 1
        WHERE ag.AccountId = :accountId
          AND (ag.ValidFrom IS NULL OR ag.ValidFrom <= UTC_TIMESTAMP(3))
          AND (ag.ValidTo IS NULL OR ag.ValidTo > UTC_TIMESTAMP(3))
      `, { accountId: account.AccountId }),
      this.database.query<GrantRow>(`
        SELECT DISTINCT grantRow.PermissionCode, grantRow.ScopeType, grantRow.ScopeId
        FROM AccountGroup ag
        INNER JOIN UserGroup g ON g.GroupId = ag.GroupId AND g.IsActive = 1
        INNER JOIN AccessGrant grantRow ON grantRow.GroupId = ag.GroupId
        WHERE ag.AccountId = :accountId
          AND (ag.ValidFrom IS NULL OR ag.ValidFrom <= UTC_TIMESTAMP(3))
          AND (ag.ValidTo IS NULL OR ag.ValidTo > UTC_TIMESTAMP(3))
      `, { accountId: account.AccountId })
      , this.database.query<GrantRow>(`
        SELECT 'sop.read' AS PermissionCode, 'module' AS ScopeType, module.ModuleId AS ScopeId
        FROM HrModule module
        LEFT JOIN AccountModuleAccess accessRow
          ON accessRow.ModuleId = module.ModuleId
          AND accessRow.AccountId = :accountId
          AND (accessRow.ValidFrom IS NULL OR accessRow.ValidFrom <= UTC_TIMESTAMP(3))
          AND (accessRow.ValidTo IS NULL OR accessRow.ValidTo > UTC_TIMESTAMP(3))
        WHERE module.Status = 'published'
          AND (module.IsCommon = 1 OR accessRow.AccountModuleAccessId IS NOT NULL)
      `, { accountId: account.AccountId })
    ])

    const grants = [...new Map([...groupGrants, ...moduleGrants].map((grant) => [
      `${grant.PermissionCode}:${grant.ScopeType}:${grant.ScopeId}`,
      grant
    ])).values()]

    return {
      accountId: account.AccountId,
      username: account.Username,
      fullName: account.FullName,
      email: account.Email,
      systemRole: account.SystemRole,
      organization: {
        employeeCode: account.EmployeeCode,
        company: account.CompanyName,
        division: account.DivisionName,
        department: account.DepartmentName,
        team: account.TeamName,
        jobTitle: account.JobTitle,
        managerAccountId: account.ManagerAccountId
      },
      groupIds: groups.map((row) => row.GroupId),
      grants: grants.map((row) => ({
        permissionCode: row.PermissionCode,
        scopeType: row.ScopeType,
        scopeId: row.ScopeId
      }))
    }
  }

  async findDevelopmentAccount(identifier: string): Promise<DevelopmentLoginAccountRow | null> {
    const rows = await this.database.query<DevelopmentLoginAccountRow>(`
      SELECT a.AccountId, a.Username, a.FullName, a.Email
      FROM Account a
      WHERE a.IsActive = 1
        AND (LOWER(a.Email) = LOWER(:identifier) OR LOWER(a.Username) = LOWER(:identifier))
      LIMIT 1
    `, { identifier: identifier.trim() })
    return rows[0] ?? null
  }

  async listDevelopmentAccounts() {
    if (this.core8) return new CoreAuthRepository(this.database).listDevelopmentAccounts()
    const [rows, moduleRows] = await Promise.all([
      this.database.query<DevelopmentAccountRow>(`
        SELECT a.AccountId, a.Username, a.FullName, a.Email, a.SystemRole,
               g.GroupCode, g.GroupName,
               g.Description AS GroupDescription
        FROM Account a
        LEFT JOIN AccountGroup ag ON ag.AccountId = a.AccountId
          AND (ag.ValidFrom IS NULL OR ag.ValidFrom <= UTC_TIMESTAMP(3))
          AND (ag.ValidTo IS NULL OR ag.ValidTo > UTC_TIMESTAMP(3))
        LEFT JOIN UserGroup g ON g.GroupId = ag.GroupId AND g.IsActive = 1
        WHERE a.IsActive = 1
        ORDER BY a.FullName, g.GroupName
      `),
      this.database.query<DevelopmentAccountModuleRow>(`
        SELECT DISTINCT accountRow.AccountId, module.ModuleId, module.ModuleCode,
               module.Title AS ModuleTitle
        FROM Account accountRow
        CROSS JOIN HrModule module
        LEFT JOIN AccountModuleAccess accessRow
          ON accessRow.AccountId = accountRow.AccountId AND accessRow.ModuleId = module.ModuleId
          AND (accessRow.ValidFrom IS NULL OR accessRow.ValidFrom <= UTC_TIMESTAMP(3))
          AND (accessRow.ValidTo IS NULL OR accessRow.ValidTo > UTC_TIMESTAMP(3))
        WHERE accountRow.IsActive = 1 AND module.Status = 'published'
          AND (module.IsCommon = 1 OR accessRow.AccountModuleAccessId IS NOT NULL OR EXISTS (
            SELECT 1 FROM AccountGroup membership
            JOIN UserGroup legacyGroup ON legacyGroup.GroupId = membership.GroupId AND legacyGroup.IsActive = 1
            JOIN AccessGrant grantRow ON grantRow.GroupId = membership.GroupId
            WHERE membership.AccountId = accountRow.AccountId
              AND (membership.ValidFrom IS NULL OR membership.ValidFrom <= UTC_TIMESTAMP(3))
              AND (membership.ValidTo IS NULL OR membership.ValidTo > UTC_TIMESTAMP(3))
              AND grantRow.PermissionCode IN ('sop.read', 'module.manage')
              AND ((grantRow.ScopeType = 'system' AND grantRow.ScopeId = '*')
                OR (grantRow.ScopeType = 'module' AND grantRow.ScopeId = module.ModuleId)
                OR (grantRow.PermissionCode = 'sop.read' AND grantRow.ScopeType = 'sop'
                  AND EXISTS (SELECT 1 FROM SopModule sm WHERE sm.SopId = grantRow.ScopeId AND sm.ModuleId = module.ModuleId)))
          ))
        ORDER BY accountRow.AccountId, module.ModuleId
      `)
    ])
    const accounts = new Map<string, {
      id: string
      username: string
      email: string | null
      fullName: string
      roleTitle: string
      roleDescription: string
      groups: Array<{ code: string; name: string; description: string | null }>
      modules: Array<{ id: string; code: string; title: string }>
    }>()
    for (const row of rows) {
      const account = accounts.get(row.AccountId) ?? {
        id: row.AccountId,
        username: row.Username,
        email: row.Email,
        fullName: row.FullName,
        roleTitle: row.SystemRole === 'ADMIN' ? 'Quản trị hệ thống'
          : row.SystemRole === 'CONTENT_EDITOR' ? 'Biên tập nội dung' : 'Người dùng',
        roleDescription: row.GroupDescription ?? 'Quyền xem được cấp trực tiếp theo module.',
        groups: [],
        modules: []
      }
      if (row.GroupCode && row.GroupName) {
        account.groups.push({
          code: row.GroupCode,
          name: row.GroupName,
          description: row.GroupDescription ?? null
        })
      }
      accounts.set(row.AccountId, account)
    }

    for (const row of moduleRows) {
      const account = accounts.get(row.AccountId)
      if (!account || account.modules.some((module) => module.id === row.ModuleId)) continue
      account.modules.push({ id: row.ModuleId, code: row.ModuleCode, title: row.ModuleTitle })
    }

    return [...accounts.values()]
  }
}
