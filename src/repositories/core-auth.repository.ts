import type { QueryRunner } from '../database/database.js'
import type { AuthPrincipal, PrincipalGrant } from '../auth/types.js'

const adminPermissions = ['sop.read', 'sop.create', 'sop.update', 'sop.publish', 'sop.archive', 'module.manage', 'permission.manage', 'knowledge.manage']
export class CoreAuthRepository {
  constructor(private readonly database: QueryRunner) {}
  async findPrincipal(identity: { accountId?: string; externalSubject?: string }): Promise<AuthPrincipal | null> {
    const value = identity.accountId ?? identity.externalSubject
    if (!value) return null
    const [row] = await this.database.query<{
      AccountId: string; Username: string; FullName: string; Email: string | null; SystemRole: 'USER' | 'CONTENT_EDITOR' | 'ADMIN'; ReadAllModules: boolean
      EmployeeCode: string | null; CompanyName: string | null; DivisionName: string | null; DepartmentName: string | null
      TeamName: string | null; JobTitle: string | null; ManagerAccountId: string | null
    }>(`SELECT * FROM Account WHERE ${identity.accountId ? 'AccountId' : 'ExternalSubject'} = :identity AND IsActive = 1`, { identity: value })
    if (!row) return null
    const modules = await this.database.query<{ ModuleId: string; CanContribute: boolean }>(`SELECT DISTINCT m.ModuleId,
      CASE WHEN a.AccountModuleAccessId IS NOT NULL THEN 1 ELSE 0 END AS CanContribute FROM HrModule m
      LEFT JOIN AccountModuleAccess a ON a.ModuleId = m.ModuleId AND a.AccountId = :accountId
        AND (a.ValidFrom IS NULL OR a.ValidFrom <= UTC_TIMESTAMP(3)) AND (a.ValidTo IS NULL OR a.ValidTo > UTC_TIMESTAMP(3))
      WHERE m.Status = 'published' AND (m.IsCommon = 1 OR a.AccountModuleAccessId IS NOT NULL OR :readAll = 1)`,
    { accountId: row.AccountId, readAll: row.SystemRole === 'ADMIN' || Boolean(row.ReadAllModules) })
    const grants: PrincipalGrant[] = modules.flatMap(module => [
      { permissionCode: 'sop.read', scopeType: 'module' as const, scopeId: module.ModuleId },
      ...(row.SystemRole === 'CONTENT_EDITOR' && Boolean(module.CanContribute)
        ? [{ permissionCode: 'sop.create', scopeType: 'module' as const, scopeId: module.ModuleId }]
        : [])
    ])
    if (row.SystemRole === 'ADMIN') grants.push(...adminPermissions.map(permissionCode => ({ permissionCode, scopeType: 'system' as const, scopeId: '*' })))
    return { accountId: row.AccountId, username: row.Username, fullName: row.FullName, email: row.Email,
      systemRole: row.SystemRole, groupIds: [], grants, organization: {
        employeeCode: row.EmployeeCode, company: row.CompanyName, division: row.DivisionName, department: row.DepartmentName,
        team: row.TeamName, jobTitle: row.JobTitle, managerAccountId: row.ManagerAccountId
      } }
  }
  async listDevelopmentAccounts() {
    const rows = await this.database.query<{ AccountId: string }>('SELECT AccountId FROM Account WHERE IsActive = 1 ORDER BY FullName')
    const modules = await this.database.query<{ ModuleId: string; ModuleCode: string; Title: string }>("SELECT ModuleId, ModuleCode, Title FROM HrModule WHERE Status = 'published'")
    return Promise.all(rows.map(async row => {
      const principal = (await this.findPrincipal({ accountId: row.AccountId }))!
      return { id: principal.accountId, username: principal.username, fullName: principal.fullName, email: principal.email,
        roleTitle: principal.systemRole === 'ADMIN' ? 'Quản trị hệ thống'
          : principal.systemRole === 'CONTENT_EDITOR' ? 'Biên tập nội dung' : 'Người dùng',
        roleDescription: 'Quyền xem theo phân hệ được cấp.', groups: [], modules: modules.filter(module => principal.grants.some(grant =>
          grant.permissionCode === 'sop.read' && (grant.scopeType === 'system' || grant.scopeId === module.ModuleId)))
          .map(module => ({ id: module.ModuleId, code: module.ModuleCode, title: module.Title })) }
    }))
  }
}
