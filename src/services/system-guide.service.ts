import { hasAnyPermission } from '../auth/authorization.js'
import type { AuthPrincipal } from '../auth/types.js'
import { forbidden, notFound } from '../common/errors.js'
import type { SystemGuideRepository } from '../repositories/system-guide.repository.js'
import type { CreateSystemGuideBody, SystemGuideProgressBody, UpdateSystemGuideBody } from '../schemas/system-guide.schemas.js'

export class SystemGuideService {
  constructor(private readonly repository: SystemGuideRepository) {}

  private isAdmin(principal: AuthPrincipal) {
    return principal.systemRole === 'ADMIN' || principal.systemRole === 'SUPER_ADMIN'
  }

  private access(guide: ReturnType<SystemGuideRepository['mapGuide']>, principal: AuthPrincipal) {
    if (guide.audienceMode === 'ADMIN') return this.isAdmin(principal)
    if (guide.audienceMode === 'ALL') return true
    return !guide.requiredPermission || hasAnyPermission(principal, guide.requiredPermission) || this.isAdmin(principal)
  }

  async list(principal: AuthPrincipal) {
    const rows = await this.repository.listPublished()
    const progress = new Map((await this.repository.progress(principal.accountId)).map(row => [row.GuideId, this.repository.mapProgress(row)]))
    const tours = await this.repository.tours(rows.map(row => row.GuideId))
    return rows.map(row => {
      const guide = this.repository.mapGuide(row)
      const available = this.access(guide, principal)
      return {
        ...guide,
        content: available ? guide.content : null,
        available,
        progress: progress.get(guide.id) ?? null,
        tour: available ? tours.filter(step => step.GuideId === guide.id).map(step => ({
          id: step.TourStepId, anchor: step.HelpAnchorId, title: step.Title, description: step.Description,
          routePath: step.RoutePath, sortOrder: Number(step.SortOrder)
        })) : []
      }
    })
  }

  async get(principal: AuthPrincipal, slug: string) {
    const row = await this.repository.findPublishedBySlug(slug)
    if (!row) throw notFound('System guide', slug)
    const guide = this.repository.mapGuide(row)
    if (!this.access(guide, principal)) throw forbidden('Tài khoản chưa có quyền mở hướng dẫn thao tác này')
    const progress = (await this.repository.progress(principal.accountId)).find(item => item.GuideId === guide.id)
    const tours = await this.repository.tours([guide.id])
    return { ...guide, available: true, progress: progress ? this.repository.mapProgress(progress) : null, tour: tours.map(step => ({ id: step.TourStepId, anchor: step.HelpAnchorId, title: step.Title, description: step.Description, routePath: step.RoutePath, sortOrder: Number(step.SortOrder) })) }
  }

  async saveProgress(principal: AuthPrincipal, guideId: string, body: SystemGuideProgressBody) {
    const row = await this.repository.saveProgress(principal.accountId, guideId, body)
    if (!row) throw notFound('System guide', guideId)
    return this.repository.mapProgress(row)
  }

  async listAdmin(principal: AuthPrincipal) {
    this.assertAdmin(principal)
    const rows = await this.repository.listAdmin()
    const tours = await this.repository.tours(rows.map(row => row.GuideId))
    return rows.map(row => {
      const guide = this.repository.mapGuide(row)
      return { ...guide, tour: tours.filter(step => step.GuideId === guide.id).map(step => ({
        id: step.TourStepId, anchor: step.HelpAnchorId, title: step.Title, description: step.Description,
        routePath: step.RoutePath, sortOrder: Number(step.SortOrder)
      })) }
    })
  }

  async create(principal: AuthPrincipal, body: CreateSystemGuideBody) {
    this.assertAdmin(principal)
    const id = await this.repository.create(body, principal.accountId)
    return { id }
  }

  async update(principal: AuthPrincipal, id: string, body: UpdateSystemGuideBody) {
    this.assertAdmin(principal)
    if (!await this.repository.update(id, body, principal.accountId)) throw notFound('System guide', id)
    return { id }
  }

  async publish(principal: AuthPrincipal, id: string) {
    this.assertAdmin(principal)
    if (!await this.repository.publish(id, principal.accountId)) throw notFound('Draft system guide', id)
    return { id, status: 'published' as const }
  }

  async archive(principal: AuthPrincipal, id: string) {
    this.assertAdmin(principal)
    if (!await this.repository.archive(id, principal.accountId)) throw notFound('System guide', id)
    return { id, status: 'archived' as const }
  }

  private assertAdmin(principal: AuthPrincipal) {
    if (!this.isAdmin(principal)) throw forbidden('Chỉ Admin hoặc Super Admin được quản lý hướng dẫn hệ thống')
  }
}
