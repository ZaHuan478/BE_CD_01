import { describe, expect, it } from 'vitest'
import { canAccessSop, hasPermission } from '../src/auth/authorization.js'
import type { AuthPrincipal } from '../src/auth/types.js'

const principal: AuthPrincipal = {
  accountId: 'account-1', username: 'user', fullName: 'User', email: null, groupIds: ['group-1'],
  grants: [
    { permissionCode: 'sop.read', scopeType: 'module', scopeId: 'module-1' },
    { permissionCode: 'sop.edit', scopeType: 'sop', scopeId: 'sop-2' }
  ]
}

describe('scoped authorization', () => {
  it('inherits module read access into SOPs', () => {
    expect(canAccessSop(principal, 'sop.read', 'sop-1', ['module-1'])).toBe(true)
    expect(canAccessSop(principal, 'sop.read', 'sop-1', ['module-2'])).toBe(false)
  })

  it('keeps edit grants separate from read grants', () => {
    expect(hasPermission(principal, 'sop.edit', 'sop', 'sop-2')).toBe(true)
    expect(hasPermission(principal, 'sop.read', 'sop', 'sop-2')).toBe(false)
  })
})

