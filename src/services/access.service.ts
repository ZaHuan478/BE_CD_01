import { hasPermission } from '../auth/authorization.js'
import { requirePermission } from '../auth/guards.js'
import type { AuthPrincipal } from '../auth/types.js'
import { forbidden } from '../common/errors.js'
import type { AccessRepository } from '../repositories/access.repository.js'
import type { CreateAccountBody, CreateGroupBody, ReplaceGroupGrantsBody, ReplaceUserModulesBody, UpdateUserBody } from '../schemas/access.schemas.js'

export class AccessService {
  constructor(private readonly repository: AccessRepository) {}

  listPermissions(principal: AuthPrincipal) { requirePermission(principal, 'permission.manage'); return this.repository.listPermissions() }
  listAccounts(principal: AuthPrincipal) { requirePermission(principal, 'user.read'); return this.repository.listAccounts() }
  createAccount(principal: AuthPrincipal, body: CreateAccountBody) { if (principal.systemRole !== 'SUPER_ADMIN') throw forbidden('Chỉ Super Admin được tạo tài khoản'); requirePermission(principal, 'user.manage'); return this.repository.createAccount(body) }
  async replaceAccountGroups(principal: AuthPrincipal, accountId: string, groupIds: string[]) {
    requirePermission(principal, 'permission.manage'); await this.repository.replaceAccountGroups(accountId, groupIds, principal.accountId)
  }
  listGroups(principal: AuthPrincipal) { requirePermission(principal, 'permission.manage'); return this.repository.listGroups() }
  createGroup(principal: AuthPrincipal, body: CreateGroupBody) { requirePermission(principal, 'permission.manage'); return this.repository.createGroup(body) }
  async replaceGroupGrants(principal: AuthPrincipal, groupId: string, body: ReplaceGroupGrantsBody) {
    requirePermission(principal, 'permission.manage'); await this.repository.replaceGroupGrants(groupId, body, principal.accountId)
  }
  listUsers(principal: AuthPrincipal, search?: string) { requirePermission(principal, 'user.read'); return this.repository.listUsers(search) }
  getUserModuleAccess(principal: AuthPrincipal, accountId: string) { requirePermission(principal, 'user.read'); return this.repository.getUserModuleAccess(accountId) }
  replaceUserModules(principal: AuthPrincipal, accountId: string, body: ReplaceUserModulesBody) {
    if (principal.systemRole !== 'SUPER_ADMIN') throw forbidden('Chỉ Super Admin được thay đổi quyền phân hệ')
    requirePermission(principal, 'user.manage')
    return this.repository.replaceUserModules(accountId, body.moduleIds, principal.accountId)
  }
  async updateUser(principal: AuthPrincipal, accountId: string, body: UpdateUserBody) {
    requirePermission(principal, 'user.manage')
    if (accountId === principal.accountId && (body.active === false || (body.systemRole && body.systemRole !== principal.systemRole))) {
      throw forbidden('Không thể tự khóa hoặc tự thay đổi vai trò hệ thống')
    }
    if (principal.systemRole !== 'SUPER_ADMIN' || !hasPermission(principal, 'user.manage')) {
      throw forbidden('Chỉ Super Admin được thay đổi tài khoản và vai trò hệ thống')
    }
    return this.repository.updateUser(accountId, body, principal.accountId)
  }
}

