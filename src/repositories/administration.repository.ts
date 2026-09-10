import { conflict, notFound } from '../common/errors.js'
import { createId } from '../common/ids.js'
import type { TransactionalDatabase } from '../database/database.js'
import type { AuditQuery, CreateProfileBody, ReplaceSopRolesBody, SystemSettings, UpdateProfileBody } from '../schemas/administration.schemas.js'

const defaultSettings: SystemSettings = {
  portalName: 'SOP Management',
  defaultPageSize: 20,
  reviewDueDays: 5,
  requireReviewBeforePublish: true,
  allowOwnerSelfApproval: false
}

function parseJson(value: string | null): unknown {
  if (!value) return null
  try { return JSON.parse(value) } catch { return null }
}

export class AdministrationRepository {
  constructor(private readonly database: TransactionalDatabase, private readonly core8: boolean) {}

  async listAudit(query: AuditQuery) {
    const page = query.page ?? 1
    const pageSize = query.pageSize ?? 20
    const clauses: string[] = []
    const parameters: Record<string, string | number> = { limit: pageSize, offset: (page - 1) * pageSize }
    if (query.search?.trim()) {
      clauses.push('(logRow.EntityId LIKE :search OR logRow.Action LIKE :search OR logRow.EntityType LIKE :search OR actor.FullName LIKE :search)')
      parameters.search = `%${query.search.trim()}%`
    }
    if (query.entityType) { clauses.push('logRow.EntityType = :entityType'); parameters.entityType = query.entityType }
    if (query.action) { clauses.push('logRow.Action = :action'); parameters.action = query.action }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''
    const [countRows, rows, entityTypes, actions] = await Promise.all([
      this.database.query<{ Total: number }>(`SELECT COUNT(*) AS Total FROM AuditLog logRow LEFT JOIN Account actor ON actor.AccountId = logRow.ActorAccountId ${where}`, parameters),
      this.database.query<{
        AuditLogId: string; EntityType: string; EntityId: string; Action: string; ActorAccountId: string | null
        ActorName: string | null; BeforeJson: string | null; AfterJson: string | null; CorrelationId: string | null; CreatedAt: Date
      }>(`SELECT logRow.AuditLogId, logRow.EntityType, logRow.EntityId, logRow.Action,
          logRow.ActorAccountId, actor.FullName AS ActorName, logRow.BeforeJson, logRow.AfterJson,
          logRow.CorrelationId, logRow.CreatedAt
        FROM AuditLog logRow LEFT JOIN Account actor ON actor.AccountId = logRow.ActorAccountId
        ${where} ORDER BY logRow.CreatedAt DESC, logRow.AuditLogId DESC LIMIT :limit OFFSET :offset`, parameters),
      this.database.query<{ Value: string }>('SELECT DISTINCT EntityType AS Value FROM AuditLog ORDER BY EntityType'),
      this.database.query<{ Value: string }>('SELECT DISTINCT Action AS Value FROM AuditLog ORDER BY Action')
    ])
    const total = Number(countRows[0]?.Total ?? 0)
    return {
      items: rows.map(row => ({
        id: String(row.AuditLogId), entityType: row.EntityType, entityId: row.EntityId, action: row.Action,
        actor: row.ActorAccountId ? { id: row.ActorAccountId, name: row.ActorName ?? row.ActorAccountId } : null,
        before: parseJson(row.BeforeJson), after: parseJson(row.AfterJson), correlationId: row.CorrelationId, createdAt: row.CreatedAt
      })),
      pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
      filters: { entityTypes: entityTypes.map(item => item.Value), actions: actions.map(item => item.Value) }
    }
  }

  async getSettings(): Promise<SystemSettings> {
    const [row] = await this.database.query<{ ValueJson: string }>(`SELECT ValueJson FROM AppConfig
      WHERE ConfigKey = 'sop.management' AND ScopeType = 'system' AND ScopeId = '*' AND IsActive = 1`)
    return row ? { ...defaultSettings, ...(parseJson(row.ValueJson) as Partial<SystemSettings>) } : defaultSettings
  }

  async updateSettings(settings: SystemSettings, actorAccountId: string) {
    const before = await this.getSettings()
    await this.database.transaction(async runner => {
      await runner.query(`INSERT INTO AppConfig (ConfigKey, ScopeType, ScopeId, ValueJson, IsActive, UpdatedBy)
        VALUES ('sop.management', 'system', '*', :value, TRUE, :actor)
        ON DUPLICATE KEY UPDATE ValueJson = :value, IsActive = TRUE, UpdatedBy = :actor,
          UpdatedAt = UTC_TIMESTAMP(3), RowVersion = RowVersion + 1`, { value: JSON.stringify(settings), actor: actorAccountId })
      await runner.query(`INSERT INTO AuditLog (EntityType, EntityId, Action, ActorAccountId, BeforeJson, AfterJson)
        VALUES ('app-config', 'sop.management', 'update-settings', :actor, :before, :after)`, {
        actor: actorAccountId, before: JSON.stringify(before), after: JSON.stringify(settings)
      })
    })
    return this.getSettings()
  }

  async listProfiles() {
    const [profiles, capabilities, memberships] = await Promise.all([
      this.database.query<{ Id: string; Code: string; Name: string; Description: string | null; IsSystem: boolean; Active: boolean }>(`
        SELECT PermissionProfileId AS Id, ProfileCode AS Code, ProfileName AS Name, Description,
          IsSystem, IsActive AS Active FROM PermissionProfile ORDER BY IsSystem DESC, ProfileName`),
      this.database.query<{ Id: string; Capability: string }>('SELECT PermissionProfileId AS Id, CapabilityCode AS Capability FROM PermissionProfileCapability ORDER BY CapabilityCode'),
      this.database.query<{ Id: string; Total: number }>('SELECT PermissionProfileId AS Id, COUNT(*) AS Total FROM AccountPermissionProfile GROUP BY PermissionProfileId')
    ])
    return profiles.map(profile => ({
      id: profile.Id, code: profile.Code, name: profile.Name, description: profile.Description,
      system: Boolean(profile.IsSystem), active: Boolean(profile.Active),
      capabilities: capabilities.filter(item => item.Id === profile.Id).map(item => item.Capability),
      memberCount: Number(memberships.find(item => item.Id === profile.Id)?.Total ?? 0)
    }))
  }

  async createProfile(body: CreateProfileBody, actorAccountId: string) {
    const id = createId('profile')
    await this.database.transaction(async runner => {
      await runner.query(`INSERT INTO PermissionProfile
        (PermissionProfileId, ProfileCode, ProfileName, Description)
        VALUES (:id, :code, :name, :description)`, { id, code: body.code, name: body.name, description: body.description ?? null })
      for (const capability of body.capabilities) await runner.query(`INSERT INTO PermissionProfileCapability
        (PermissionProfileId, CapabilityCode) VALUES (:id, :capability)`, { id, capability })
      await runner.query(`INSERT INTO AuditLog (EntityType, EntityId, Action, ActorAccountId, AfterJson)
        VALUES ('permission-profile', :id, 'create-profile', :actor, :after)`, { id, actor: actorAccountId, after: JSON.stringify(body) })
    })
    return (await this.listProfiles()).find(item => item.id === id)
  }

  async updateProfile(id: string, body: UpdateProfileBody, actorAccountId: string) {
    const before = (await this.listProfiles()).find(item => item.id === id)
    if (!before) throw notFound('Permission profile', id)
    await this.database.transaction(async runner => {
      await runner.query(`UPDATE PermissionProfile SET ProfileName = :name, Description = :description, IsActive = :active
        WHERE PermissionProfileId = :id`, { id, name: body.name, description: body.description ?? null, active: body.active })
      await runner.query('DELETE FROM PermissionProfileCapability WHERE PermissionProfileId = :id', { id })
      for (const capability of body.capabilities) await runner.query(`INSERT INTO PermissionProfileCapability
        (PermissionProfileId, CapabilityCode) VALUES (:id, :capability)`, { id, capability })
      await runner.query(`INSERT INTO AuditLog (EntityType, EntityId, Action, ActorAccountId, BeforeJson, AfterJson)
        VALUES ('permission-profile', :id, 'update-profile', :actor, :before, :after)`, {
        id, actor: actorAccountId, before: JSON.stringify(before), after: JSON.stringify(body)
      })
    })
    return (await this.listProfiles()).find(item => item.id === id)
  }

  async getUserProfiles(accountId: string) {
    const [account] = await this.database.query<{ AccountId: string }>('SELECT AccountId FROM Account WHERE AccountId = :accountId', { accountId })
    if (!account) throw notFound('Account', accountId)
    const rows = await this.database.query<{ ProfileId: string }>('SELECT PermissionProfileId AS ProfileId FROM AccountPermissionProfile WHERE AccountId = :accountId', { accountId })
    return { accountId, profileIds: rows.map(row => row.ProfileId) }
  }

  async replaceUserProfiles(accountId: string, profileIds: string[], actorAccountId: string) {
    const unique = [...new Set(profileIds)]
    await this.database.transaction(async runner => {
      const [account] = await runner.query<{ AccountId: string }>('SELECT AccountId FROM Account WHERE AccountId = :accountId', { accountId })
      if (!account) throw notFound('Account', accountId)
      if (unique.length) {
        const parameters = Object.fromEntries(unique.map((id, index) => [`id${index}`, id]))
        const placeholders = unique.map((_, index) => `:id${index}`).join(', ')
        const rows = await runner.query<{ Id: string }>(`SELECT PermissionProfileId AS Id FROM PermissionProfile WHERE IsActive = 1 AND PermissionProfileId IN (${placeholders})`, parameters)
        if (rows.length !== unique.length) throw conflict('PROFILE_NOT_FOUND', 'Một hoặc nhiều nhóm quyền không tồn tại hoặc đã ngừng hoạt động')
      }
      await runner.query('DELETE FROM AccountPermissionProfile WHERE AccountId = :accountId', { accountId })
      for (const id of unique) await runner.query(`INSERT INTO AccountPermissionProfile
        (AccountId, PermissionProfileId, AssignedBy) VALUES (:accountId, :id, :actor)`, { accountId, id, actor: actorAccountId })
      await runner.query(`INSERT INTO AuditLog (EntityType, EntityId, Action, ActorAccountId, AfterJson)
        VALUES ('account', :accountId, 'replace-permission-profiles', :actor, :after)`, {
        accountId, actor: actorAccountId, after: JSON.stringify({ profileIds: unique })
      })
    })
    return this.getUserProfiles(accountId)
  }

  async bootstrapSuperAdmin(accountId: string, actorAccountId: string) {
    return this.database.transaction(async runner => {
      const [existing] = await runner.query<{ AccountId: string }>("SELECT AccountId FROM Account WHERE SystemRole = 'SUPER_ADMIN' AND IsActive = 1 LIMIT 1 FOR UPDATE")
      if (existing) throw conflict('SUPER_ADMIN_EXISTS', 'Hệ thống đã có Super Admin')
      const [target] = await runner.query<{ AccountId: string; SystemRole: string; IsActive: boolean }>('SELECT AccountId, SystemRole, IsActive FROM Account WHERE AccountId = :accountId FOR UPDATE', { accountId })
      if (!target) throw notFound('Account', accountId)
      if (!target.IsActive || target.SystemRole !== 'ADMIN') throw conflict('INVALID_SUPER_ADMIN_TARGET', 'Tài khoản được chọn phải là một Admin đang hoạt động')
      await runner.query("UPDATE Account SET SystemRole = 'SUPER_ADMIN' WHERE AccountId = :accountId", { accountId })
      await runner.query(`INSERT INTO AuditLog (EntityType, EntityId, Action, ActorAccountId, BeforeJson, AfterJson)
        VALUES ('account', :accountId, 'bootstrap-super-admin', :actor, :before, :after)`, {
        accountId, actor: actorAccountId, before: JSON.stringify({ systemRole: 'ADMIN' }), after: JSON.stringify({ systemRole: 'SUPER_ADMIN' })
      })
      return { accountId, systemRole: 'SUPER_ADMIN' as const }
    })
  }
  async listSopResources() {
    if (this.core8) return this.database.query<{ id: string; code: string; title: string }>(`SELECT DocumentId AS id, Code AS code, Title AS title
      FROM KnowledgeDocument WHERE DocumentType IN ('procedure', 'policy') ORDER BY Title`)
    return this.database.query<{ id: string; code: string; title: string }>('SELECT SopId AS id, SopCode AS code, Title AS title FROM Sop ORDER BY Title')
  }

  async listSopRoles(sopId: string) {
    const assignments = await this.database.query<{ accountId: string; fullName: string; roleCode: 'VIEWER' | 'OWNER' | 'EDITOR' | 'REVIEWER' | 'APPROVER' }>(`
      SELECT roleRow.AccountId AS accountId, accountRow.FullName AS fullName, roleRow.RoleCode AS roleCode
      FROM SopRoleAssignment roleRow JOIN Account accountRow ON accountRow.AccountId = roleRow.AccountId
      WHERE roleRow.SopResourceId = :sopId ORDER BY roleRow.RoleCode, accountRow.FullName`, { sopId })
    return { sopId, assignments }
  }

  async replaceSopRoles(sopId: string, body: ReplaceSopRolesBody, actorAccountId: string) {
    const resources = await this.listSopResources()
    if (!resources.some(item => item.id === sopId)) throw notFound('SOP', sopId)
    const unique = [...new Map(body.assignments.map(item => [`${item.accountId}:${item.roleCode}`, item])).values()]
    await this.database.transaction(async runner => {
      for (const assignment of unique) {
        const [account] = await runner.query<{ AccountId: string }>('SELECT AccountId FROM Account WHERE AccountId = :id AND IsActive = 1', { id: assignment.accountId })
        if (!account) throw notFound('Active account', assignment.accountId)
      }
      await runner.query('DELETE FROM SopRoleAssignment WHERE SopResourceId = :sopId', { sopId })
      for (const assignment of unique) await runner.query(`INSERT INTO SopRoleAssignment
        (SopResourceId, AccountId, RoleCode, AssignedBy) VALUES (:sopId, :accountId, :roleCode, :actor)`, {
        sopId, accountId: assignment.accountId, roleCode: assignment.roleCode, actor: actorAccountId
      })
      await runner.query(`INSERT INTO AuditLog (EntityType, EntityId, Action, ActorAccountId, AfterJson)
        VALUES ('sop-role', :sopId, 'replace-sop-roles', :actor, :after)`, {
        sopId, actor: actorAccountId, after: JSON.stringify({ assignments: unique })
      })
    })
    return this.listSopRoles(sopId)
  }
}


