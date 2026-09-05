import { requirePermission } from '../auth/guards.js'
import type { AuthPrincipal } from '../auth/types.js'
import type { AccessRepository } from '../repositories/access.repository.js'
import type {
  CreateAccountBody,
  CreateGroupBody,
  ReplaceGroupGrantsBody,
  ReplaceUserModulesBody
} from '../schemas/access.schemas.js'

export class AccessService {
  constructor(private readonly repository: AccessRepository) {}

  private authorize(principal: AuthPrincipal): void {
    requirePermission(principal, 'permission.manage')
  }

  listPermissions(principal: AuthPrincipal) {
    this.authorize(principal)
    return this.repository.listPermissions()
  }

  listAccounts(principal: AuthPrincipal) {
    this.authorize(principal)
    return this.repository.listAccounts()
  }

  createAccount(principal: AuthPrincipal, body: CreateAccountBody) {
    this.authorize(principal)
    return this.repository.createAccount(body)
  }

  async replaceAccountGroups(principal: AuthPrincipal, accountId: string, groupIds: string[]): Promise<void> {
    this.authorize(principal)
    await this.repository.replaceAccountGroups(accountId, groupIds, principal.accountId)
  }

  listGroups(principal: AuthPrincipal) {
    this.authorize(principal)
    return this.repository.listGroups()
  }

  createGroup(principal: AuthPrincipal, body: CreateGroupBody) {
    this.authorize(principal)
    return this.repository.createGroup(body)
  }

  async replaceGroupGrants(
    principal: AuthPrincipal,
    groupId: string,
    body: ReplaceGroupGrantsBody
  ): Promise<void> {
    this.authorize(principal)
    await this.repository.replaceGroupGrants(groupId, body, principal.accountId)
  }

  listUsers(principal: AuthPrincipal, search?: string) {
    this.authorize(principal)
    return this.repository.listUsers(search)
  }

  getUserModuleAccess(principal: AuthPrincipal, accountId: string) {
    this.authorize(principal)
    return this.repository.getUserModuleAccess(accountId)
  }

  replaceUserModules(principal: AuthPrincipal, accountId: string, body: ReplaceUserModulesBody) {
    this.authorize(principal)
    return this.repository.replaceUserModules(accountId, body.moduleIds, principal.accountId)
  }
}
