import type { AuthPrincipal } from '../auth/types.js'
import { forbidden } from '../common/errors.js'
import type { Core8Repository } from '../repositories/core8.repository.js'
import type { CoreDocumentBody, CoreVersionBody } from '../schemas/core8.schemas.js'
import type { ModuleRepository } from '../repositories/module.repository.js'
import { hasPermission } from '../auth/authorization.js'

export class Core8Service {
  constructor(private readonly repository: Core8Repository, private readonly modules: ModuleRepository) {}
  private admin(principal: AuthPrincipal) { if (!['ADMIN', 'SUPER_ADMIN'].includes(principal.systemRole)) throw forbidden('Admin role is required') }
  create(principal: AuthPrincipal, body: CoreDocumentBody) { this.admin(principal); return this.repository.create(body, principal.accountId) }
  addVersion(principal: AuthPrincipal, id: string, body: CoreVersionBody) { this.admin(principal); return this.repository.addVersion(id, body, principal.accountId) }
  versions(principal: AuthPrincipal, id: string) { this.admin(principal); return this.repository.versions(id) }
  version(principal: AuthPrincipal, id: string, version: number) { this.admin(principal); return this.repository.version(id, version) }
  async acknowledgement(principal: AuthPrincipal, policyId: string, acknowledged?: boolean) {
    const modules = (await this.modules.list()).filter(module => module.status === 'published' && hasPermission(principal, 'sop.read', 'module', module.id)).map(module => module.id)
    const policy = await this.repository.policy(modules, policyId)
    return acknowledged === undefined
      ? this.repository.acknowledgement(principal.accountId, policy.DocumentId, policy.CurrentVersionNumber)
      : this.repository.setAcknowledgement(principal.accountId, policy.DocumentId, policy.CurrentVersionNumber, acknowledged)
  }
}

