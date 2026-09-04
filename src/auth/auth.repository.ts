import type { QueryRunner } from '../database/database.js'
import type { AuthPrincipal, PrincipalGrant } from './types.js'

interface AccountRow {
  AccountId: string
  Username: string
  FullName: string
  Email: string | null
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
  constructor(private readonly database: QueryRunner) {}

  async findPrincipal(identity: { accountId?: string; externalSubject?: string }): Promise<AuthPrincipal | null> {
    const where = identity.accountId ? 'a.AccountId = @identity' : 'a.ExternalSubject = @identity'
    const identityValue = identity.accountId ?? identity.externalSubject
    if (!identityValue) return null

    const accounts = await this.database.query<AccountRow>(`
      SELECT a.AccountId, a.Username, a.FullName, a.Email
      FROM dbo.Account a
      WHERE ${where} AND a.IsActive = 1
    `, { identity: identityValue })
    const account = accounts[0]
    if (!account) return null

    const [groups, grants] = await Promise.all([
      this.database.query<GroupRow>(`
        SELECT ag.GroupId
        FROM dbo.AccountGroup ag
        INNER JOIN dbo.UserGroup g ON g.GroupId = ag.GroupId AND g.IsActive = 1
        WHERE ag.AccountId = @accountId
          AND (ag.ValidFrom IS NULL OR ag.ValidFrom <= SYSUTCDATETIME())
          AND (ag.ValidTo IS NULL OR ag.ValidTo > SYSUTCDATETIME())
      `, { accountId: account.AccountId }),
      this.database.query<GrantRow>(`
        SELECT DISTINCT grantRow.PermissionCode, grantRow.ScopeType, grantRow.ScopeId
        FROM dbo.AccountGroup ag
        INNER JOIN dbo.UserGroup g ON g.GroupId = ag.GroupId AND g.IsActive = 1
        INNER JOIN dbo.AccessGrant grantRow ON grantRow.GroupId = ag.GroupId
        WHERE ag.AccountId = @accountId
          AND (ag.ValidFrom IS NULL OR ag.ValidFrom <= SYSUTCDATETIME())
          AND (ag.ValidTo IS NULL OR ag.ValidTo > SYSUTCDATETIME())
      `, { accountId: account.AccountId })
    ])

    return {
      accountId: account.AccountId,
      username: account.Username,
      fullName: account.FullName,
      email: account.Email,
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
      SELECT TOP (1) a.AccountId, a.Username, a.FullName, a.Email
      FROM dbo.Account a
      INNER JOIN dbo.AccountGroup ag ON ag.AccountId = a.AccountId
        AND (ag.ValidFrom IS NULL OR ag.ValidFrom <= SYSUTCDATETIME())
        AND (ag.ValidTo IS NULL OR ag.ValidTo > SYSUTCDATETIME())
      INNER JOIN dbo.UserGroup g ON g.GroupId = ag.GroupId AND g.IsActive = 1
      WHERE a.IsActive = 1
        AND g.GroupCode IN (
          'ADMIN', 'BOM', 'HR_ADMIN', 'RECRUITER', 'TIMEKEEPER',
          'CB_SPECIALIST', 'INSURANCE_OFFICER', 'LINE_MANAGER', 'EMPLOYEE'
        )
        AND (LOWER(a.Email) = LOWER(@identifier) OR LOWER(a.Username) = LOWER(@identifier))
    `, { identifier: identifier.trim() })
    return rows[0] ?? null
  }

  async listDevelopmentAccounts() {
    const [rows, moduleRows] = await Promise.all([
      this.database.query<DevelopmentAccountRow>(`
        SELECT a.AccountId, a.Username, a.FullName, a.Email, g.GroupCode, g.GroupName,
               g.Description AS GroupDescription
        FROM dbo.Account a
        LEFT JOIN dbo.AccountGroup ag ON ag.AccountId = a.AccountId
          AND (ag.ValidFrom IS NULL OR ag.ValidFrom <= SYSUTCDATETIME())
          AND (ag.ValidTo IS NULL OR ag.ValidTo > SYSUTCDATETIME())
        LEFT JOIN dbo.UserGroup g ON g.GroupId = ag.GroupId AND g.IsActive = 1
        WHERE a.IsActive = 1
          AND g.GroupCode IN (
            'ADMIN', 'BOM', 'HR_ADMIN', 'RECRUITER', 'TIMEKEEPER',
            'CB_SPECIALIST', 'INSURANCE_OFFICER', 'LINE_MANAGER', 'EMPLOYEE'
          )
        ORDER BY a.FullName, g.GroupName
      `),
      this.database.query<DevelopmentAccountModuleRow>(`
        SELECT DISTINCT ag.AccountId, module.ModuleId, module.ModuleCode,
               module.Title AS ModuleTitle
        FROM dbo.AccountGroup ag
        INNER JOIN dbo.UserGroup roleGroup ON roleGroup.GroupId = ag.GroupId AND roleGroup.IsActive = 1
          AND roleGroup.GroupCode IN (
            'ADMIN', 'BOM', 'HR_ADMIN', 'RECRUITER', 'TIMEKEEPER',
            'CB_SPECIALIST', 'INSURANCE_OFFICER', 'LINE_MANAGER', 'EMPLOYEE'
          )
        INNER JOIN dbo.AccessGrant grantRow ON grantRow.GroupId = ag.GroupId
          AND grantRow.PermissionCode = 'sop.read'
        INNER JOIN dbo.HrModule module ON module.Status = 'published'
          AND (
            (grantRow.ScopeType = 'system' AND grantRow.ScopeId = '*')
            OR (grantRow.ScopeType = 'module' AND grantRow.ScopeId = module.ModuleId)
          )
        INNER JOIN dbo.Account accountRow ON accountRow.AccountId = ag.AccountId
          AND accountRow.IsActive = 1
        WHERE (ag.ValidFrom IS NULL OR ag.ValidFrom <= SYSUTCDATETIME())
          AND (ag.ValidTo IS NULL OR ag.ValidTo > SYSUTCDATETIME())
        ORDER BY ag.AccountId, module.ModuleId
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
        roleTitle: row.GroupName ?? 'Chưa gán nhóm',
        roleDescription: row.GroupDescription ?? 'Tài khoản phát triển chưa có mô tả vai trò.',
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
