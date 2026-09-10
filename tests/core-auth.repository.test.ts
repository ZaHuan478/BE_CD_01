import { describe, expect, it } from 'vitest'
import { CoreAuthRepository } from '../src/repositories/core-auth.repository.js'
import type { QueryRunner } from '../src/database/database.js'

function databaseFor(role: 'USER' | 'CONTENT_EDITOR' | 'ADMIN' | 'SUPER_ADMIN'): QueryRunner {
  return {
    async query<T extends object>(statement: string): Promise<T[]> {
      if (statement.includes('PermissionProfile') || statement.includes('SopRoleAssignment')) return [] as T[]
      if (statement.includes('FROM Account WHERE')) return [{
        AccountId: 'account-1', Username: 'user', FullName: 'User', Email: null,
        SystemRole: role, ReadAllModules: false, EmployeeCode: null, CompanyName: null,
        DivisionName: null, DepartmentName: null, TeamName: null, JobTitle: null,
        ManagerAccountId: null
      }] as T[]
      return [{ ModuleId: 'emp', CanContribute: true }] as T[]
    }
  }
}

describe('core8 SOP import permissions', () => {
  it('keeps ordinary users read-only and gives content editors scoped creation', async () => {
    const user = await new CoreAuthRepository(databaseFor('USER')).findPrincipal({ accountId: 'account-1' })
    const editor = await new CoreAuthRepository(databaseFor('CONTENT_EDITOR')).findPrincipal({ accountId: 'account-1' })

    expect(user?.grants).toEqual([{ permissionCode: 'sop.read', scopeType: 'module', scopeId: 'emp' }])
    expect(editor?.grants).toContainEqual({ permissionCode: 'sop.create', scopeType: 'module', scopeId: 'emp' })
    expect(editor?.grants).not.toContainEqual({ permissionCode: 'sop.create', scopeType: 'system', scopeId: '*' })
  })
  it('separates content administration from system administration', async () => {
    const admin = await new CoreAuthRepository(databaseFor('ADMIN')).findPrincipal({ accountId: 'account-1' })
    const superAdmin = await new CoreAuthRepository(databaseFor('SUPER_ADMIN')).findPrincipal({ accountId: 'account-1' })
    expect(admin?.grants).toContainEqual({ permissionCode: 'sop.publish', scopeType: 'system', scopeId: '*' })
    expect(admin?.grants).not.toContainEqual({ permissionCode: 'settings.manage', scopeType: 'system', scopeId: '*' })
    expect(superAdmin?.grants).toContainEqual({ permissionCode: 'settings.manage', scopeType: 'system', scopeId: '*' })
    expect(superAdmin?.grants).toContainEqual({ permissionCode: 'user.manage', scopeType: 'system', scopeId: '*' })
  })

  it('gives a document viewer read access without review or publication rights', async () => {
    const database: QueryRunner = {
      async query<T extends object>(statement: string): Promise<T[]> {
        if (statement.includes('FROM Account WHERE')) return [{
          AccountId: 'auditor', Username: 'auditor', FullName: 'Auditor', Email: null,
          SystemRole: 'USER', ReadAllModules: false, EmployeeCode: null, CompanyName: null,
          DivisionName: null, DepartmentName: null, TeamName: null, JobTitle: null,
          ManagerAccountId: null
        }] as T[]
        if (statement.includes('SopRoleAssignment')) return [{ SopResourceId: 'doc-1', RoleCode: 'VIEWER' }] as T[]
        if (statement.includes('PermissionProfile')) return [] as T[]
        return [] as T[]
      }
    }
    const viewer = await new CoreAuthRepository(database).findPrincipal({ accountId: 'auditor' })
    expect(viewer?.grants).toContainEqual({ permissionCode: 'sop.read', scopeType: 'sop', scopeId: 'doc-1' })
    expect(viewer?.grants.some(grant => ['sop.review', 'sop.publish'].includes(grant.permissionCode))).toBe(false)
  })
})


