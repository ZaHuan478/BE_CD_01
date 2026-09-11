import type { QueryRunner } from '../database/database.js'
import type { AuthPrincipal, PrincipalGrant } from '../auth/types.js'

const adminPermissions = ['sop.read', 'sop.create', 'sop.edit', 'sop.review', 'sop.publish', 'sop.archive', 'module.manage', 'knowledge.manage', 'rag.manage', 'audit.read', 'user.read']
const superAdminPermissions = [...adminPermissions, 'user.manage', 'permission.manage', 'settings.manage']
const sopRolePermissions: Record<string, string[]> = {
  VIEWER: ['sop.read'],
  OWNER: ['sop.read', 'sop.create', 'sop.edit'],
  EDITOR: ['sop.read', 'sop.edit'],
  REVIEWER: ['sop.read', 'sop.review'],
  APPROVER: ['sop.read', 'sop.publish']
}

export class CoreAuthRepository {
  constructor(private readonly database: QueryRunner) {}
  async findPrincipal(identity: { accountId?: string; externalSubject?: string }): Promise<AuthPrincipal | null> {
    const value = identity.accountId ?? identity.externalSubject
    if (!value) return null
    const [row] = await this.database.query<{
      AccountId: string; Username: string; FullName: string; Email: string | null
      SystemRole: AuthPrincipal['systemRole']; ReadAllModules: boolean
      EmployeeCode: string | null; CompanyName: string | null; DivisionName: string | null; DepartmentName: string | null
      TeamName: string | null; JobTitle: string | null; ManagerAccountId: string | null
    }>(`SELECT * FROM Account WHERE ${identity.accountId ? 'AccountId' : 'ExternalSubject'} = :identity AND IsActive = 1`, { identity: value })
    if (!row) return null
    const hasGlobalModuleAccess = ['ADMIN', 'SUPER_ADMIN'].includes(row.SystemRole) || Boolean(row.ReadAllModules)
    const [modules, profiles, profileCapabilities, sopRoles] = await Promise.all([
      this.database.query<{ ModuleId: string; CanContribute: boolean }>(`SELECT DISTINCT m.ModuleId,
        CASE WHEN a.AccountModuleAccessId IS NOT NULL THEN 1 ELSE 0 END AS CanContribute FROM HrModule m
        LEFT JOIN AccountModuleAccess a ON a.ModuleId = m.ModuleId AND a.AccountId = :accountId
          AND (a.ValidFrom IS NULL OR a.ValidFrom <= UTC_TIMESTAMP(3)) AND (a.ValidTo IS NULL OR a.ValidTo > UTC_TIMESTAMP(3))
        WHERE m.Status = 'published' AND (m.IsCommon = 1 OR a.AccountModuleAccessId IS NOT NULL OR :readAll = 1)`,
      { accountId: row.AccountId, readAll: hasGlobalModuleAccess }),
      this.database.query<{ ProfileId: string }>(`SELECT membership.PermissionProfileId AS ProfileId
        FROM AccountPermissionProfile membership JOIN PermissionProfile profile ON profile.PermissionProfileId = membership.PermissionProfileId
        WHERE membership.AccountId = :accountId AND profile.IsActive = 1`, { accountId: row.AccountId }),
      this.database.query<{ CapabilityCode: string }>(`SELECT DISTINCT capability.CapabilityCode
        FROM AccountPermissionProfile membership
        JOIN PermissionProfile profile ON profile.PermissionProfileId = membership.PermissionProfileId AND profile.IsActive = 1
        JOIN PermissionProfileCapability capability ON capability.PermissionProfileId = profile.PermissionProfileId
        WHERE membership.AccountId = :accountId`, { accountId: row.AccountId }),
      this.database.query<{ SopResourceId: string; RoleCode: string }>('SELECT SopResourceId, RoleCode FROM SopRoleAssignment WHERE AccountId = :accountId', { accountId: row.AccountId })
    ])
    const grants: PrincipalGrant[] = modules.flatMap(module => [
      { permissionCode: 'sop.read', scopeType: 'module' as const, scopeId: module.ModuleId },
      ...(row.SystemRole === 'CONTENT_EDITOR' && Boolean(module.CanContribute)
        ? [
            { permissionCode: 'sop.create', scopeType: 'module' as const, scopeId: module.ModuleId },
            { permissionCode: 'sop.edit', scopeType: 'module' as const, scopeId: module.ModuleId }
          ]
        : [])
    ])
    const rolePermissions = row.SystemRole === 'SUPER_ADMIN' ? superAdminPermissions : row.SystemRole === 'ADMIN' ? adminPermissions : []
    grants.push(...rolePermissions.map(permissionCode => ({ permissionCode, scopeType: 'system' as const, scopeId: '*' })))
    grants.push(...profileCapabilities.filter(item => item.CapabilityCode).map(item => ({ permissionCode: item.CapabilityCode, scopeType: 'system' as const, scopeId: '*' })))
    for (const assignment of sopRoles.filter(item => item.SopResourceId && sopRolePermissions[item.RoleCode])) grants.push(...(sopRolePermissions[assignment.RoleCode] ?? []).map(permissionCode => ({
      permissionCode, scopeType: 'sop' as const, scopeId: assignment.SopResourceId
    })))
    const uniqueGrants = [...new Map(grants.map(grant => [`${grant.permissionCode}:${grant.scopeType}:${grant.scopeId}`, grant])).values()]
    return { accountId: row.AccountId, username: row.Username, fullName: row.FullName, email: row.Email,
      systemRole: row.SystemRole, groupIds: profiles.map(profile => profile.ProfileId), grants: uniqueGrants, organization: {
        employeeCode: row.EmployeeCode, company: row.CompanyName, division: row.DivisionName, department: row.DepartmentName,
        team: row.TeamName, jobTitle: row.JobTitle, managerAccountId: row.ManagerAccountId
      } }
  }
  async listDevelopmentAccounts() {
    const rows = await this.database.query<{ AccountId: string }>('SELECT AccountId FROM Account WHERE IsActive = 1 ORDER BY FullName')
    const modules = await this.database.query<{ ModuleId: string; ModuleCode: string; Title: string }>("SELECT ModuleId, ModuleCode, Title FROM HrModule WHERE Status = 'published'")
    const memberships = await this.database.query<{
      AccountId: string; Code: string; Name: string; Description: string | null
    }>(`SELECT membership.AccountId, profile.ProfileCode AS Code, profile.ProfileName AS Name,
      profile.Description FROM AccountPermissionProfile membership
      JOIN PermissionProfile profile ON profile.PermissionProfileId = membership.PermissionProfileId
      WHERE profile.IsActive = 1 ORDER BY profile.IsSystem, profile.ProfileName`)
    return Promise.all(rows.map(async row => {
      const principal = (await this.findPrincipal({ accountId: row.AccountId }))!
      const groups = memberships.filter(item => item.AccountId === row.AccountId)
        .map(({ Code: code, Name: name, Description: description }) => ({ code, name, description }))
      return { id: principal.accountId, username: principal.username, fullName: principal.fullName, email: principal.email,
        roleTitle: principal.organization.jobTitle || (principal.systemRole === 'SUPER_ADMIN' ? 'Siêu quản trị hệ thống'
          : principal.systemRole === 'ADMIN' ? 'Quản trị nội dung SOP'
          : principal.systemRole === 'CONTENT_EDITOR' ? 'Biên tập nội dung' : 'Người dùng'),
        roleDescription: groups[0]?.description ?? 'Quyền xem theo phân hệ và trách nhiệm SOP được cấp.', groups, modules: modules.filter(module => principal.grants.some(grant =>
          grant.permissionCode === 'sop.read' && (grant.scopeType === 'system' || grant.scopeId === module.ModuleId)))
          .map(module => ({ id: module.ModuleId, code: module.ModuleCode, title: module.Title })) }
    }))
  }
}

