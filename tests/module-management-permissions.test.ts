import { describe, expect, it, vi } from 'vitest'
import { ModuleService } from '../src/services/module.service.js'
import type { AuthPrincipal } from '../src/auth/types.js'
import type { ModuleRepository } from '../src/repositories/module.repository.js'

const body = { code: 'NEW', title: 'Phân hệ mới', moduleType: 'business' }
const principal = (systemRole: AuthPrincipal['systemRole'], manage = false): AuthPrincipal => ({
  accountId: `account-${systemRole.toLowerCase()}`,
  username: systemRole.toLowerCase(),
  fullName: systemRole,
  email: null,
  systemRole,
  groupIds: [],
  grants: manage ? [{ permissionCode: 'module.manage', scopeType: 'system', scopeId: '*' }] : [],
  organization: { employeeCode: null, company: null, division: null, department: null, team: null, jobTitle: null, managerAccountId: null }
})

describe('module management permissions', () => {
  it('blocks regular users and content editors from creating modules', () => {
    const repository = { create: vi.fn() } as unknown as ModuleRepository
    const service = new ModuleService(repository)
    expect(() => service.create(principal('USER'), body)).toThrow(/module\.manage/)
    expect(() => service.create(principal('CONTENT_EDITOR'), body)).toThrow(/module\.manage/)
    expect(repository.create).not.toHaveBeenCalled()
  })

  it('allows an administrator carrying module.manage to create modules', async () => {
    const create = vi.fn().mockResolvedValue({ id: 'mod-new' })
    const service = new ModuleService({ create } as unknown as ModuleRepository)
    await expect(service.create(principal('ADMIN', true), body)).resolves.toEqual({ id: 'mod-new' })
    expect(create).toHaveBeenCalledOnce()
  })
})
