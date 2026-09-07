import { describe, expect, it } from 'vitest'
import { CoreAuthRepository } from '../src/repositories/core-auth.repository.js'
import type { QueryRunner } from '../src/database/database.js'

function databaseFor(role: 'USER' | 'CONTENT_EDITOR' | 'ADMIN'): QueryRunner {
  return {
    async query<T extends object>(statement: string): Promise<T[]> {
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
})
