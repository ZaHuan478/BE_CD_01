import { canAccessSop, hasAnyPermission, hasPermission } from '../auth/authorization.js'
import { canReadModule } from '../auth/module-access.js'
import type { AuthPrincipal } from '../auth/types.js'
import { requirePermission } from '../auth/guards.js'
import { AppError, forbidden } from '../common/errors.js'
import type { ModuleRepository } from '../repositories/module.repository.js'
import type { SopRepository } from '../repositories/sop.repository.js'
import type {
  CreateSopBody,
  ReplaceSopVersionBody,
  SopContentInput,
  UpdateSopBody
} from '../schemas/sop.schemas.js'

export function validateGraph(content: SopContentInput): void {
  const stepIds = new Set<string>()
  const stableKeys = new Set<string>()
  const stepCodes = new Set<string>()
  for (const step of content.steps) {
    if (stepIds.has(step.id)) throw new AppError(400, 'DUPLICATE_STEP_ID', `Duplicate step id: ${step.id}`)
    if (stableKeys.has(step.stableKey)) throw new AppError(400, 'DUPLICATE_STABLE_KEY', `Duplicate stableKey: ${step.stableKey}`)
    if (stepCodes.has(step.code)) throw new AppError(400, 'DUPLICATE_STEP_CODE', `Duplicate step code: ${step.code}`)
    stepIds.add(step.id)
    stableKeys.add(step.stableKey)
    stepCodes.add(step.code)
  }
  for (const transition of content.transitions) {
    if (transition.fromStepId && !stepIds.has(transition.fromStepId)) {
      throw new AppError(400, 'INVALID_TRANSITION', `Unknown fromStepId: ${transition.fromStepId}`)
    }
    if (transition.toStepId && !stepIds.has(transition.toStepId)) {
      throw new AppError(400, 'INVALID_TRANSITION', `Unknown toStepId: ${transition.toStepId}`)
    }
  }
}

export class SopService {
  constructor(
    private readonly repository: SopRepository,
    private readonly moduleRepository: ModuleRepository
  ) {}

  private authorizeManagement(
    principal: AuthPrincipal,
    permission: 'sop.edit' | 'sop.review' | 'sop.publish',
    sopId: string,
    moduleIds: string[]
  ): void {
    if (!canAccessSop(principal, permission, sopId, moduleIds)) {
      throw forbidden(`Permission ${permission} is required for this SOP`)
    }
  }

  async list(
    principal: AuthPrincipal,
    filters: { moduleId?: string; search?: string; includeDrafts?: boolean }
  ) {
    if (filters.moduleId && !(await canReadModule(principal, this.moduleRepository, filters.moduleId))) {
      requirePermission(principal, 'sop.read', 'module', filters.moduleId)
    }
    const includeDrafts = filters.includeDrafts === true && (
      hasAnyPermission(principal, 'sop.edit')
      || hasAnyPermission(principal, 'sop.review')
      || hasAnyPermission(principal, 'sop.publish')
    )
    const rows = await this.repository.list({
      moduleId: filters.moduleId,
      search: filters.search,
      includeDrafts
    })
    return rows.filter((sop) => {
      if (sop.publicationStatus === 'published') {
        return canAccessSop(principal, 'sop.read', sop.id, sop.moduleIds)
      }
      return canAccessSop(principal, 'sop.edit', sop.id, sop.moduleIds)
        || canAccessSop(principal, 'sop.review', sop.id, sop.moduleIds)
        || canAccessSop(principal, 'sop.publish', sop.id, sop.moduleIds)
    })
  }

  async get(principal: AuthPrincipal, sopId: string, versionId?: string) {
    const access = await this.repository.getAccessContext(sopId)
    const detail = await this.repository.getDetail(sopId, versionId)
    if (detail.version.publicationStatus === 'published') {
      if (!canAccessSop(principal, 'sop.read', access.id, access.moduleIds)) {
        throw forbidden('Permission sop.read is required for this SOP')
      }
    } else if (!canAccessSop(principal, 'sop.edit', access.id, access.moduleIds)
      && !canAccessSop(principal, 'sop.review', access.id, access.moduleIds)
      && !canAccessSop(principal, 'sop.publish', access.id, access.moduleIds)) {
      throw forbidden('Draft versions require sop.edit, sop.review or sop.publish')
    }
    return detail
  }

  async create(principal: AuthPrincipal, body: CreateSopBody) {
    validateGraph(body)
    const moduleIds = [...new Set(body.moduleIds)]
    const permitted = hasPermission(principal, 'sop.create')
      || moduleIds.every((moduleId) => hasPermission(principal, 'sop.create', 'module', moduleId))
    if (!permitted) requirePermission(principal, 'sop.create')
    const created = await this.repository.create(body, principal.accountId)
    return this.repository.getDetail(created.sopId, created.versionId)
  }

  async createDraft(principal: AuthPrincipal, sopId: string) {
    const access = await this.repository.getAccessContext(sopId)
    this.authorizeManagement(principal, 'sop.edit', access.id, access.moduleIds)
    const versionId = await this.repository.createDraft(access.id, principal.accountId)
    return this.repository.getDetail(access.id, versionId)
  }

  async update(principal: AuthPrincipal, sopId: string, body: UpdateSopBody) {
    const access = await this.repository.getAccessContext(sopId)
    this.authorizeManagement(principal, 'sop.edit', access.id, access.moduleIds)
    await this.repository.updateSop(access.id, body, principal.accountId)
    return this.repository.getAccessContext(access.id)
  }

  async replaceVersion(principal: AuthPrincipal, versionId: string, body: ReplaceSopVersionBody) {
    validateGraph(body)
    const sopId = await this.repository.getSopIdForVersion(versionId)
    const access = await this.repository.getAccessContext(sopId)
    this.authorizeManagement(principal, 'sop.edit', sopId, access.moduleIds)
    await this.repository.replaceVersion(versionId, body, principal.accountId)
    return this.repository.getDetail(sopId, versionId)
  }

  async submit(principal: AuthPrincipal, versionId: string): Promise<void> {
    await this.manageVersion(principal, versionId, 'sop.edit', () =>
      this.repository.submitVersion(versionId, principal.accountId))
  }

  async publish(principal: AuthPrincipal, versionId: string): Promise<void> {
    await this.manageVersion(principal, versionId, 'sop.publish', () =>
      this.repository.publishVersion(versionId, principal.accountId))
  }

  async reject(principal: AuthPrincipal, versionId: string, reason: string): Promise<void> {
    await this.manageVersion(principal, versionId, 'sop.review', () =>
      this.repository.rejectVersion(versionId, reason, principal.accountId))
  }

  private async manageVersion(
    principal: AuthPrincipal,
    versionId: string,
    permission: 'sop.edit' | 'sop.review' | 'sop.publish',
    operation: () => Promise<void>
  ): Promise<void> {
    const sopId = await this.repository.getSopIdForVersion(versionId)
    const access = await this.repository.getAccessContext(sopId)
    this.authorizeManagement(principal, permission, sopId, access.moduleIds)
    await operation()
  }
}
