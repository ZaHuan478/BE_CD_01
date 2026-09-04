import { conflict, notFound } from '../../common/errors.js'
import { createId } from '../../common/ids.js'
import type { TransactionalDatabase } from '../../database/database.js'
import type {
  CreateAccountBody,
  CreateGroupBody,
  ReplaceGroupGrantsBody
} from './access.schemas.js'

export class AccessRepository {
  constructor(private readonly database: TransactionalDatabase) {}

  async listPermissions() {
    return this.database.query<{ permissionCode: string; permissionName: string; description: string | null }>(`
      SELECT PermissionCode AS permissionCode, PermissionName AS permissionName, Description AS description
      FROM dbo.Permission ORDER BY PermissionCode
    `)
  }

  async listAccounts() {
    const [rows, memberships] = await Promise.all([
      this.database.query<{
      AccountId: string; ExternalSubject: string | null; Username: string; FullName: string
      Email: string | null; IsActive: boolean
    }>(`
      SELECT a.AccountId, a.ExternalSubject, a.Username, a.FullName, a.Email, a.IsActive
      FROM dbo.Account a ORDER BY a.FullName
      `),
      this.database.query<{ AccountId: string; GroupId: string }>(`
        SELECT AccountId, GroupId FROM dbo.AccountGroup ORDER BY AccountId, GroupId
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
      INSERT INTO dbo.Account (AccountId, ExternalSubject, Username, FullName, Email, IsActive)
      VALUES (@accountId, @externalSubject, @username, @fullName, @email, @active)
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
      SELECT GroupId, GroupCode, GroupName, Description, IsActive FROM dbo.UserGroup ORDER BY GroupName
    `)
    const grants = await this.database.query<{
      GroupId: string; PermissionCode: string; ScopeType: 'system' | 'module' | 'sop'; ScopeId: string
    }>(`
      SELECT GroupId, PermissionCode, ScopeType, ScopeId FROM dbo.AccessGrant
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
      INSERT INTO dbo.UserGroup (GroupId, GroupCode, GroupName, Description)
      VALUES (@groupId, @code, @name, @description)
    `, { groupId, code: body.code, name: body.name, description: body.description ?? null })
    return (await this.listGroups()).find((group) => group.id === groupId)
  }

  async replaceAccountGroups(accountId: string, groupIds: string[], actorAccountId: string): Promise<void> {
    const uniqueIds = [...new Set(groupIds)]
    await this.database.transaction(async (runner) => {
      const accounts = await runner.query<{ AccountId: string }>(
        'SELECT AccountId FROM dbo.Account WHERE AccountId = @accountId', { accountId }
      )
      if (!accounts[0]) throw notFound('Account', accountId)
      if (uniqueIds.length > 0) {
        const parameters = Object.fromEntries(uniqueIds.map((id, index) => [`group${index}`, id]))
        const placeholders = uniqueIds.map((_, index) => `@group${index}`).join(', ')
        const existing = await runner.query<{ GroupId: string }>(`
          SELECT GroupId FROM dbo.UserGroup WHERE GroupId IN (${placeholders})
        `, parameters)
        if (existing.length !== uniqueIds.length) throw conflict('GROUP_NOT_FOUND', 'One or more groups do not exist')
      }
      await runner.query('DELETE FROM dbo.AccountGroup WHERE AccountId = @accountId', { accountId })
      for (const groupId of uniqueIds) {
        await runner.query(`
          INSERT INTO dbo.AccountGroup (AccountId, GroupId) VALUES (@accountId, @groupId)
        `, { accountId, groupId })
      }
      await runner.query(`
        INSERT INTO dbo.AuditLog (EntityType, EntityId, Action, ActorAccountId, AfterJson)
        VALUES ('account', @accountId, 'replace-groups', @actorAccountId, @afterJson)
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
        'SELECT GroupId FROM dbo.UserGroup WHERE GroupId = @groupId', { groupId }
      )
      if (!groups[0]) throw notFound('Group', groupId)
      for (const grant of deduplicated) {
        if (grant.scopeType === 'module') {
          const rows = await runner.query<{ Id: string }>(
            'SELECT ModuleId AS Id FROM dbo.HrModule WHERE ModuleId = @scopeId', { scopeId: grant.scopeId }
          )
          if (!rows[0]) throw notFound('Module scope', grant.scopeId)
        }
        if (grant.scopeType === 'sop') {
          const rows = await runner.query<{ Id: string }>(
            'SELECT SopId AS Id FROM dbo.Sop WHERE SopId = @scopeId', { scopeId: grant.scopeId }
          )
          if (!rows[0]) throw notFound('SOP scope', grant.scopeId)
        }
      }
      await runner.query('DELETE FROM dbo.AccessGrant WHERE GroupId = @groupId', { groupId })
      for (const grant of deduplicated) {
        await runner.query(`
          INSERT INTO dbo.AccessGrant (AccessGrantId, GroupId, PermissionCode, ScopeType, ScopeId)
          VALUES (@grantId, @groupId, @permissionCode, @scopeType, @scopeId)
        `, {
          grantId: createId('grant'),
          groupId,
          permissionCode: grant.permissionCode,
          scopeType: grant.scopeType,
          scopeId: grant.scopeId
        })
      }
      await runner.query(`
        INSERT INTO dbo.AuditLog (EntityType, EntityId, Action, ActorAccountId, AfterJson)
        VALUES ('group', @groupId, 'replace-grants', @actorAccountId, @afterJson)
      `, { groupId, actorAccountId, afterJson: JSON.stringify({ grants: deduplicated }) })
    })
  }
}
