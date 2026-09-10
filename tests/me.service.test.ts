import { describe, expect, it } from 'vitest'
import type { AuthPrincipal } from '../src/auth/types.js'
import type { MeRepository } from '../src/repositories/me.repository.js'
import type { ModuleRepository } from '../src/repositories/module.repository.js'
import { MeService } from '../src/services/me.service.js'

const employee = {
  accountId: 'employee', username: 'employee', fullName: 'Nhân viên', email: null,
  systemRole: 'USER', organization: { employeeCode: 'NV-001', company: 'LTA', division: null,
    department: 'Kinh doanh', team: null, jobTitle: 'Chuyên viên', managerAccountId: null },
  groupIds: [], grants: []
} as AuthPrincipal

describe('current-user navigation', () => {
  it('always includes company policies for an authenticated employee', async () => {
    const repository = { listMenuItems: async () => [{
      id: 'menu-policies', parentId: null, code: 'policy-center', title: 'Quy định & Tuân thủ',
      routePath: '/employee-lifecycle/policies', iconName: 'ShieldCheck', requiredPermissionCode: 'sop.read',
      sortOrder: 30, moduleIds: ['pay']
    }, {
      id: 'menu-payroll', parentId: null, code: 'payroll', title: 'Lương', routePath: '/payroll',
      iconName: null, requiredPermissionCode: 'sop.read', sortOrder: 40, moduleIds: ['pay']
    }] } as unknown as MeRepository
    const modules = { list: async () => [], findModuleIdsForSops: async () => [] } as unknown as ModuleRepository

    const result = await new MeService(repository, modules).get(employee)
    expect(result.menuItems.map(item => item.code)).toEqual(['policy-center'])
  })

  it('exposes the admin workspace to Admin without Super Admin-only permission.manage', async () => {
    const admin = { ...employee, accountId: 'admin', systemRole: 'ADMIN', grants: [
      { permissionCode: 'sop.read', scopeType: 'system', scopeId: '*' }
    ] } as AuthPrincipal
    const repository = { listMenuItems: async () => [{
      id: 'menu-admin', parentId: null, code: 'ADMIN', title: 'Quản trị',
      routePath: '/employee-lifecycle/admin', iconName: 'Settings', requiredPermissionCode: 'permission.manage',
      sortOrder: 90, moduleIds: []
    }] } as unknown as MeRepository
    const modules = { list: async () => [], findModuleIdsForSops: async () => [] } as unknown as ModuleRepository

    const result = await new MeService(repository, modules).get(admin)
    expect(result.menuItems.map(item => item.code)).toEqual(['ADMIN'])
  })
})
