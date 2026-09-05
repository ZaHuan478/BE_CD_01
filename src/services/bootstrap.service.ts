import { hasAnyPermission } from '../auth/authorization.js'
import { listReadableModules } from '../auth/module-access.js'
import type { AuthPrincipal } from '../auth/types.js'
import { forbidden } from '../common/errors.js'
import type { BootstrapRepository } from '../repositories/bootstrap.repository.js'
import type { ModuleRepository } from '../repositories/module.repository.js'
export class BootstrapService {
  constructor(private readonly repository: BootstrapRepository, private readonly moduleRepository: ModuleRepository) {}
  private authorize(principal: AuthPrincipal) {
    if (!hasAnyPermission(principal, 'sop.read')) throw forbidden('Permission sop.read is required')
  }
  async get(principal: AuthPrincipal) {
    this.authorize(principal)
    const modules = await listReadableModules(principal, this.moduleRepository)
    return this.repository.getBootstrap(modules.map(module => module.id))
  }
  acknowledgement(principal: AuthPrincipal, policyId: string) {
    this.authorize(principal)
    return this.repository.getPolicyAcknowledgement(principal.accountId, policyId)
  }
  setAcknowledgement(principal: AuthPrincipal, policyId: string, acknowledged: boolean) {
    this.authorize(principal)
    return this.repository.setPolicyAcknowledgement(principal.accountId, policyId, acknowledged)
  }
}
