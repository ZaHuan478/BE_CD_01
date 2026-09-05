import { canAccessSop, hasAnyPermission, hasPermission } from '../auth/authorization.js'
import type { AuthPrincipal } from '../auth/types.js'
import { forbidden } from '../common/errors.js'
import type { SopRepository } from '../repositories/sop.repository.js'
import type { KnowledgeRepository } from '../repositories/knowledge.repository.js'
import type { CreateDocumentBody, CreateGuidanceBody, CreateTermBody, KnowledgeQuery } from '../schemas/knowledge.schemas.js'

function canUseModule(principal: Parameters<typeof hasPermission>[0], permission: string, moduleId: string | null): boolean {
  return moduleId
    ? hasPermission(principal, permission, 'module', moduleId)
    : hasPermission(principal, permission)
}

export class KnowledgeService {
  constructor(private readonly repository: KnowledgeRepository, private readonly sopRepository: SopRepository) {}
  async listDocuments(principal: AuthPrincipal, query: KnowledgeQuery) {
    if (query.sopId) {
      const access = await this.sopRepository.getAccessContext(query.sopId)
      if (!canAccessSop(principal, 'sop.read', access.id, access.moduleIds)) throw forbidden()
    }
    const rows = await this.repository.listDocuments(query)
    const items = rows.filter((document) =>
      hasPermission(principal, 'sop.read')
      || document.sopIds.some((sopId) => canAccessSop(principal, 'sop.read', sopId, document.moduleIds))
    )
    return { items }
  }
  async createDocument(principal: AuthPrincipal, body: CreateDocumentBody) {
    for (const link of body.links) {
      const access = await this.sopRepository.getAccessContext(link.sopId)
      if (!canAccessSop(principal, 'sop.edit', access.id, access.moduleIds)) throw forbidden()
    }
    return await this.repository.createDocument(body, principal.accountId)
  }
  async listTerms(principal: AuthPrincipal, query: KnowledgeQuery) {
    const includeDrafts = query.includeDrafts === true && hasAnyPermission(principal, 'sop.edit')
    const rows = await this.repository.listTerms({ ...query, includeDrafts })
    const items = rows.filter((term) => term.status === 'published'
      ? canUseModule(principal, 'sop.read', term.moduleId)
      : canUseModule(principal, 'sop.edit', term.moduleId)
    )
    return { items }
  }
  async createTerm(principal: AuthPrincipal, body: CreateTermBody) {
    if (!canUseModule(principal, 'sop.edit', body.moduleId ?? null)) throw forbidden()
    if (body.status === 'published'
      && !canUseModule(principal, 'sop.publish', body.moduleId ?? null)) throw forbidden()
    return await this.repository.createTerm(body, principal.accountId)
  }
  async listGuidance(principal: AuthPrincipal, query: KnowledgeQuery) {
    const includeDrafts = query.includeDrafts === true && hasAnyPermission(principal, 'sop.edit')
    const rows = await this.repository.listGuidance({ ...query, includeDrafts })
    const items = rows.filter((article) => {
      const permission = article.status === 'published' ? 'sop.read' : 'sop.edit'
      if (article.sopId) return canAccessSop(principal, permission, article.sopId, article.moduleId ? [article.moduleId] : [])
      return canUseModule(principal, permission, article.moduleId)
    })
    return { items }
  }
  async createGuidance(principal: AuthPrincipal, body: CreateGuidanceBody) {
    if (body.sopId) {
      const access = await this.sopRepository.getAccessContext(body.sopId)
      if (!canAccessSop(principal, 'sop.edit', access.id, access.moduleIds)) throw forbidden()
    } else if (!canUseModule(principal, 'sop.edit', body.moduleId ?? null)) {
      throw forbidden()
    }
    if (body.status === 'published') {
      if (body.sopId) {
        const access = await this.sopRepository.getAccessContext(body.sopId)
        if (!canAccessSop(principal, 'sop.publish', access.id, access.moduleIds)) throw forbidden()
      } else if (!canUseModule(principal, 'sop.publish', body.moduleId ?? null)) {
        throw forbidden()
      }
    }
    return await this.repository.createGuidance(body, principal.accountId)
  }
}
