import { conflict, notFound } from '../common/errors.js'
import { createId } from '../common/ids.js'
import type { TransactionalDatabase } from '../database/database.js'
import type {
  CreateAccountBody,
  CreateGroupBody,
  ReplaceGroupGrantsBody
} from '../schemas/access.schemas.js'
import type { UpdateUserBody } from '../schemas/access.schemas.js'

export class AccessRepository {
  constructor(private readonly database: TransactionalDatabase, private readonly core8 = false) {}

  async listPermissions() {
    if (this.core8) return ['sop.read', 'module.manage', 'permission.manage', 'knowledge.manage'].map(permissionCode => ({ permissionCode, permissionName: permissionCode, description: null }))
    return this.database.query<{ permissionCode: string; permissionName: string; description: string | null }>(`
      SELECT PermissionCode AS permissionCode, PermissionName AS permissionName, Description AS description
      FROM Permission ORDER BY PermissionCode
    `)
  }

  async listAccounts() {
    if (this.core8) return (await this.listUsers()).map(user => ({ ...user, groupIds: [] }))
    const [rows, memberships] = await Promise.all([
      this.database.query<{
      AccountId: string; ExternalSubject: string | null; Username: string; FullName: string
      Email: string | null; IsActive: boolean
    }>(`
      SELECT a.AccountId, a.ExternalSubject, a.Username, a.FullName, a.Email, a.IsActive
      FROM Account a ORDER BY a.FullName
      `),
      this.database.query<{ AccountId: string; GroupId: string }>(`
        SELECT AccountId, GroupId FROM AccountGroup ORDER BY AccountId, GroupId
      `)
    ])
    return rows.map((row) => ({
      id: row.AccountId,
      externalSubject: row.ExternalSubject,
      username: row.Username,
      fullName: row.FullName,
      email: row.Email,
      active: Boolean(row.IsActive),
      groupIds: memberships
        .filter((membership) => membership.AccountId === row.AccountId)
        .map((membership) => membership.GroupId)
    }))
  }

  async createAccount(body: CreateAccountBody) {
    const accountId = body.id ?? createId('account')
    await this.database.query(`
      INSERT INTO Account (AccountId, ExternalSubject, Username, FullName, Email, IsActive)
      VALUES (:accountId, :externalSubject, :username, :fullName, :email, :active)
    `, {
      accountId,
      externalSubject: body.externalSubject ?? null,
      username: body.username,
      fullName: body.fullName,
      email: body.email ?? null,
      active: body.active ?? true
    })
    return (await this.listAccounts()).find((account) => account.id === accountId)
  }

  async listGroups() {
    const groups = await this.database.query<{
      GroupId: string; GroupCode: string; GroupName: string; Description: string | null; IsActive: boolean
    }>(`
      SELECT GroupId, GroupCode, GroupName, Description, IsActive FROM UserGroup ORDER BY GroupName
    `)
    const grants = await this.database.query<{
      GroupId: string; PermissionCode: string; ScopeType: 'system' | 'module' | 'sop'; ScopeId: string
    }>(`
      SELECT GroupId, PermissionCode, ScopeType, ScopeId FROM AccessGrant
      ORDER BY GroupId, PermissionCode, ScopeType, ScopeId
    `)
    return groups.map((group) => ({
      id: group.GroupId,
      code: group.GroupCode,
      name: group.GroupName,
      description: group.Description,
      active: Boolean(group.IsActive),
      grants: grants.filter((grant) => grant.GroupId === group.GroupId).map((grant) => ({
        permissionCode: grant.PermissionCode,
        scopeType: grant.ScopeType,
        scopeId: grant.ScopeId
      }))
    }))
  }

  async createGroup(body: CreateGroupBody) {
    const groupId = createId('group')
    await this.database.query(`
      INSERT INTO UserGroup (GroupId, GroupCode, GroupName, Description)
      VALUES (:groupId, :code, :name, :description)
    `, { groupId, code: body.code, name: body.name, description: body.description ?? null })
    return (await this.listGroups()).find((group) => group.id === groupId)
  }

  async replaceAccountGroups(accountId: string, groupIds: string[], actorAccountId: string): Promise<void> {
    const uniqueIds = [...new Set(groupIds)]
    await this.database.transaction(async (runner) => {
      const accounts = await runner.query<{ AccountId: string }>(
        'SELECT AccountId FROM Account WHERE AccountId = :accountId', { accountId }
      )
      if (!accounts[0]) throw notFound('Account', accountId)
      if (uniqueIds.length > 0) {
        const parameters = Object.fromEntries(uniqueIds.map((id, index) => [`group${index}`, id]))
        const placeholders = uniqueIds.map((_, index) => `:group${index}`).join(', ')
        const existing = await runner.query<{ GroupId: string }>(`
          SELECT GroupId FROM UserGroup WHERE GroupId IN (${placeholders})
        `, parameters)
        if (existing.length !== uniqueIds.length) throw conflict('GROUP_NOT_FOUND', 'One or more groups do not exist')
      }
      await runner.query('DELETE FROM AccountGroup WHERE AccountId = :accountId', { accountId })
      for (const groupId of uniqueIds) {
        await runner.query(`
          INSERT INTO AccountGroup (AccountId, GroupId) VALUES (:accountId, :groupId)
        `, { accountId, groupId })
      }
      await runner.query(`
        INSERT INTO AuditLog (EntityType, EntityId, Action, ActorAccountId, AfterJson)
        VALUES ('account', :accountId, 'replace-groups', :actorAccountId, :afterJson)
      `, { accountId, actorAccountId, afterJson: JSON.stringify({ groupIds: uniqueIds }) })
    })
  }

  async replaceGroupGrants(groupId: string, body: ReplaceGroupGrantsBody, actorAccountId: string): Promise<void> {
    const deduplicated = [...new Map(body.grants.map((grant) => [
      `${grant.permissionCode}:${grant.scopeType}:${grant.scopeId}`,
      grant
    ])).values()]
    if (deduplicated.some((grant) => grant.scopeType === 'system' && grant.scopeId !== '*')) {
      throw conflict('SYSTEM_SCOPE_INVALID', 'System grants must use scopeId=*')
    }
    await this.database.transaction(async (runner) => {
      const groups = await runner.query<{ GroupId: string }>(
        'SELECT GroupId FROM UserGroup WHERE GroupId = :groupId', { groupId }
      )
      if (!groups[0]) throw notFound('Group', groupId)
      for (const grant of deduplicated) {
        if (grant.scopeType === 'module') {
          const rows = await runner.query<{ Id: string }>(
            'SELECT ModuleId AS Id FROM HrModule WHERE ModuleId = :scopeId', { scopeId: grant.scopeId }
          )
          if (!rows[0]) throw notFound('Module scope', grant.scopeId)
        }
        if (grant.scopeType === 'sop') {
          const rows = await runner.query<{ Id: string }>(
            'SELECT SopId AS Id FROM Sop WHERE SopId = :scopeId', { scopeId: grant.scopeId }
          )
          if (!rows[0]) throw notFound('SOP scope', grant.scopeId)
        }
      }
      await runner.query('DELETE FROM AccessGrant WHERE GroupId = :groupId', { groupId })
      for (const grant of deduplicated) {
        await runner.query(`
          INSERT INTO AccessGrant (AccessGrantId, GroupId, PermissionCode, ScopeType, ScopeId)
          VALUES (:grantId, :groupId, :permissionCode, :scopeType, :scopeId)
        `, {
          grantId: createId('grant'),
          groupId,
          permissionCode: grant.permissionCode,
          scopeType: grant.scopeType,
          scopeId: grant.scopeId
        })
      }
      await runner.query(`
        INSERT INTO AuditLog (EntityType, EntityId, Action, ActorAccountId, AfterJson)
        VALUES ('group', :groupId, 'replace-grants', :actorAccountId, :afterJson)
      `, { groupId, actorAccountId, afterJson: JSON.stringify({ grants: deduplicated }) })
    })
  }

  async listUsers(search?: string) {
    const where = search ? `
      WHERE a.FullName LIKE :search OR a.Username LIKE :search
        OR a.Email LIKE :search OR a.EmployeeCode LIKE :search
    ` : ''
    const parameters: Record<string, string> = search ? { search: `%${search}%` } : {}
    const rows = await this.database.query<{
      AccountId: string; EmployeeCode: string | null; Username: string; FullName: string
      Email: string | null; SystemRole: 'USER' | 'CONTENT_EDITOR' | 'ADMIN' | 'SUPER_ADMIN'; IsActive: boolean
      CompanyName: string | null; DivisionName: string | null; DepartmentName: string | null
      TeamName: string | null; JobTitle: string | null; ManagerAccountId: string | null
      AssignedModuleCount: number
    }>(`
      SELECT a.AccountId, a.EmployeeCode, a.Username, a.FullName, a.Email, a.SystemRole,
             a.IsActive, a.CompanyName, a.DivisionName, a.DepartmentName, a.TeamName,
             a.JobTitle, a.ManagerAccountId,
             COUNT(DISTINCT accessRow.ModuleId) AS AssignedModuleCount
      FROM Account a
      LEFT JOIN AccountModuleAccess accessRow
        ON accessRow.AccountId = a.AccountId
        AND (accessRow.ValidFrom IS NULL OR accessRow.ValidFrom <= UTC_TIMESTAMP(3))
        AND (accessRow.ValidTo IS NULL OR accessRow.ValidTo > UTC_TIMESTAMP(3))
      ${where}
      GROUP BY a.AccountId, a.EmployeeCode, a.Username, a.FullName, a.Email, a.SystemRole,
               a.IsActive, a.CompanyName, a.DivisionName, a.DepartmentName, a.TeamName,
               a.JobTitle, a.ManagerAccountId
      ORDER BY a.FullName
    `, parameters)
    return rows.map((row) => ({
      id: row.AccountId,
      employeeCode: row.EmployeeCode,
      username: row.Username,
      fullName: row.FullName,
      email: row.Email,
      systemRole: row.SystemRole,
      active: Boolean(row.IsActive),
      organization: {
        company: row.CompanyName,
        division: row.DivisionName,
        department: row.DepartmentName,
        team: row.TeamName,
        jobTitle: row.JobTitle,
        managerAccountId: row.ManagerAccountId
      },
      assignedModuleCount: Number(row.AssignedModuleCount)
    }))
  }

  async getUserModuleAccess(accountId: string) {
    const accounts = await this.database.query<{ AccountId: string; FullName: string; SystemRole?: string; ReadAllModules?: boolean }>(`
      SELECT AccountId, FullName${this.core8 ? ', SystemRole, ReadAllModules' : ''} FROM Account WHERE AccountId = :accountId
    `, { accountId })
    if (!accounts[0]) throw notFound('Account', accountId)

    const rows = await this.database.query<{
      ModuleId: string; ModuleCode: string; Title: string; IsCommon: boolean
      GrantSource: 'manual' | 'hrm' | 'system' | null
    }>(`
      SELECT module.ModuleId, module.ModuleCode, module.Title, module.IsCommon,
             accessRow.GrantSource
      FROM HrModule module
      LEFT JOIN AccountModuleAccess accessRow
        ON accessRow.ModuleId = module.ModuleId AND accessRow.AccountId = :accountId
        AND (accessRow.ValidFrom IS NULL OR accessRow.ValidFrom <= UTC_TIMESTAMP(3))
        AND (accessRow.ValidTo IS NULL OR accessRow.ValidTo > UTC_TIMESTAMP(3))
      WHERE module.Status = 'published'
      ORDER BY module.SortOrder, module.Title, accessRow.GrantSource
    `, { accountId })
    const modules = new Map<string, {
      id: string; code: string; title: string; common: boolean; sources: string[]
    }>()
    for (const row of rows) {
      const module = modules.get(row.ModuleId) ?? {
        id: row.ModuleId,
        code: row.ModuleCode,
        title: row.Title,
        common: Boolean(row.IsCommon),
        sources: []
      }
      if (row.GrantSource && !module.sources.includes(row.GrantSource)) module.sources.push(row.GrantSource)
      const globalAccess = this.core8 && (['ADMIN', 'SUPER_ADMIN'].includes(accounts[0].SystemRole ?? '') || Boolean(accounts[0].ReadAllModules))
      if ((module.common || globalAccess) && !module.sources.includes('system')) module.sources.push('system')
      modules.set(row.ModuleId, module)
    }
    const allModules = [...modules.values()]
    return {
      user: { id: accounts[0].AccountId, fullName: accounts[0].FullName },
      assignedModuleIds: allModules.filter((module) => module.sources.includes('manual')).map((module) => module.id),
      effectiveModuleIds: allModules.filter((module) => module.sources.length > 0).map((module) => module.id),
      modules: allModules
    }
  }

  async replaceUserModules(accountId: string, moduleIds: string[], actorAccountId: string) {
    const uniqueIds = [...new Set(moduleIds)]
    await this.database.transaction(async (runner) => {
      const accounts = await runner.query<{ AccountId: string }>(`
        SELECT AccountId FROM Account WHERE AccountId = :accountId FOR UPDATE
      `, { accountId })
      if (!accounts[0]) throw notFound('Account', accountId)

      let assignableIds: string[] = []
      if (uniqueIds.length > 0) {
        const parameters = Object.fromEntries(uniqueIds.map((id, index) => [`module${index}`, id]))
        const placeholders = uniqueIds.map((_, index) => `:module${index}`).join(', ')
        const existing = await runner.query<{ ModuleId: string; IsCommon: boolean }>(`
          SELECT ModuleId, IsCommon FROM HrModule
          WHERE Status = 'published' AND ModuleId IN (${placeholders})
        `, parameters)
        if (existing.length !== uniqueIds.length) {
          throw conflict('MODULE_NOT_FOUND', 'One or more moduleIds do not exist or are not published')
        }
        assignableIds = existing.filter((module) => !module.IsCommon).map((module) => module.ModuleId)
      }

      await runner.query(`
        DELETE FROM AccountModuleAccess WHERE AccountId = :accountId AND GrantSource = 'manual'
      `, { accountId })
      for (const moduleId of assignableIds) {
        await runner.query(`
          INSERT INTO AccountModuleAccess (
            AccountModuleAccessId, AccountId, ModuleId, GrantSource, GrantedBy
          ) VALUES (:id, :accountId, :moduleId, 'manual', :actorAccountId)
        `, { id: createId('module-access'), accountId, moduleId, actorAccountId })
      }
      await runner.query(`
        INSERT INTO AuditLog (EntityType, EntityId, Action, ActorAccountId, AfterJson)
        VALUES ('account', :accountId, 'replace-module-access', :actorAccountId, :afterJson)
      `, {
        accountId,
        actorAccountId,
        afterJson: JSON.stringify({ source: 'manual', moduleIds: assignableIds })
      })
    })
    return this.getUserModuleAccess(accountId)
  }

  async updateUser(accountId: string, body: UpdateUserBody, actorAccountId: string) {
    await this.database.transaction(async runner => {
      const [account] = await runner.query<{ AccountId: string; SystemRole: string; IsActive: boolean; DepartmentName: string | null; JobTitle: string | null }>(
        'SELECT AccountId, SystemRole, IsActive, DepartmentName, JobTitle FROM Account WHERE AccountId = :accountId FOR UPDATE', { accountId }
      )
      if (!account) throw notFound('Account', accountId)
      const nextRole = body.systemRole ?? account.SystemRole
      const nextActive = body.active ?? Boolean(account.IsActive)
      const nextDepartment = body.department === undefined ? account.DepartmentName : body.department?.trim() || null
      const nextJobTitle = body.jobTitle === undefined ? account.JobTitle : body.jobTitle?.trim() || null
      if (account.SystemRole === 'SUPER_ADMIN' && account.IsActive && (nextRole !== 'SUPER_ADMIN' || !nextActive)) {
        const [admins] = await runner.query<{ Total: number }>("SELECT COUNT(*) AS Total FROM Account WHERE SystemRole = 'SUPER_ADMIN' AND IsActive = 1")
        if (Number(admins?.Total) <= 1) throw conflict('LAST_SUPER_ADMIN', 'The last active super administrator cannot be disabled or demoted')
      }
      await runner.query(`UPDATE Account SET SystemRole = :role, IsActive = :active,
        DepartmentName = :department, JobTitle = :jobTitle WHERE AccountId = :accountId`, {
        accountId, role: nextRole, active: nextActive, department: nextDepartment, jobTitle: nextJobTitle
      })
      await runner.query(`INSERT INTO AuditLog (EntityType, EntityId, Action, ActorAccountId, BeforeJson, AfterJson)
        VALUES ('account', :accountId, 'update-account', :actor, :before, :after)`, {
        accountId, actor: actorAccountId,
        before: JSON.stringify({ systemRole: account.SystemRole, active: Boolean(account.IsActive), department: account.DepartmentName, jobTitle: account.JobTitle }),
        after: JSON.stringify({ systemRole: nextRole, active: nextActive, department: nextDepartment, jobTitle: nextJobTitle })
      })
    })
    return (await this.listUsers()).find(user => user.id === accountId)
  }
}

