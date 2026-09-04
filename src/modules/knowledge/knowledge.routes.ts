import type { FastifyPluginAsync } from 'fastify'
import { canAccessSop, hasAnyPermission, hasPermission } from '../../auth/authorization.js'
import type { AuthService } from '../../auth/auth.service.js'
import { forbidden } from '../../common/errors.js'
import type { SopRepository } from '../sops/sop.repository.js'
import { KnowledgeRepository } from './knowledge.repository.js'
import {
  createDocumentSchema,
  createGuidanceSchema,
  createTermSchema,
  knowledgeQuerySchema,
  type CreateDocumentBody,
  type CreateGuidanceBody,
  type CreateTermBody,
  type KnowledgeQuery
} from './knowledge.schemas.js'

function canUseModule(principal: Parameters<typeof hasPermission>[0], permission: string, moduleId: string | null): boolean {
  return moduleId
    ? hasPermission(principal, permission, 'module', moduleId)
    : hasPermission(principal, permission)
}

export function knowledgeRoutes(
  authService: AuthService,
  repository: KnowledgeRepository,
  sopRepository: SopRepository
): FastifyPluginAsync {
  return async (app) => {
    app.get<{ Querystring: KnowledgeQuery }>('/documents', {
      schema: { tags: ['Knowledge'], summary: 'List document metadata visible to current account', querystring: knowledgeQuerySchema }
    }, async (request) => {
      const principal = await authService.authenticate(request)
      if (request.query.sopId) {
        const access = await sopRepository.getAccessContext(request.query.sopId)
        if (!canAccessSop(principal, 'sop.read', access.id, access.moduleIds)) throw forbidden()
      }
      const rows = await repository.listDocuments(request.query)
      const items = rows.filter((document) =>
        hasPermission(principal, 'sop.read')
        || document.sopIds.some((sopId) => canAccessSop(principal, 'sop.read', sopId, document.moduleIds))
      )
      return { items }
    })

    app.post<{ Body: CreateDocumentBody }>('/documents', {
      schema: { tags: ['Knowledge'], summary: 'Create document metadata and SOP links', body: createDocumentSchema }
    }, async (request, reply) => {
      const principal = await authService.authenticate(request)
      for (const link of request.body.links) {
        const access = await sopRepository.getAccessContext(link.sopId)
        if (!canAccessSop(principal, 'sop.edit', access.id, access.moduleIds)) throw forbidden()
      }
      return reply.code(201).send(await repository.createDocument(request.body, principal.accountId))
    })

    app.get<{ Querystring: KnowledgeQuery }>('/terms', {
      schema: { tags: ['Knowledge'], summary: 'List glossary terms', querystring: knowledgeQuerySchema }
    }, async (request) => {
      const principal = await authService.authenticate(request)
      const includeDrafts = request.query.includeDrafts === true && hasAnyPermission(principal, 'sop.edit')
      const rows = await repository.listTerms({ ...request.query, includeDrafts })
      const items = rows.filter((term) => term.status === 'published'
        ? canUseModule(principal, 'sop.read', term.moduleId)
        : canUseModule(principal, 'sop.edit', term.moduleId)
      )
      return { items }
    })

    app.post<{ Body: CreateTermBody }>('/terms', {
      schema: { tags: ['Knowledge'], summary: 'Create a glossary term', body: createTermSchema }
    }, async (request, reply) => {
      const principal = await authService.authenticate(request)
      if (!canUseModule(principal, 'sop.edit', request.body.moduleId ?? null)) throw forbidden()
      if (request.body.status === 'published'
        && !canUseModule(principal, 'sop.publish', request.body.moduleId ?? null)) throw forbidden()
      return reply.code(201).send(await repository.createTerm(request.body, principal.accountId))
    })

    app.get<{ Querystring: KnowledgeQuery }>('/guidance', {
      schema: { tags: ['Knowledge'], summary: 'List guidance articles', querystring: knowledgeQuerySchema }
    }, async (request) => {
      const principal = await authService.authenticate(request)
      const includeDrafts = request.query.includeDrafts === true && hasAnyPermission(principal, 'sop.edit')
      const rows = await repository.listGuidance({ ...request.query, includeDrafts })
      const items = rows.filter((article) => {
        const permission = article.status === 'published' ? 'sop.read' : 'sop.edit'
        if (article.sopId) return canAccessSop(principal, permission, article.sopId, article.moduleId ? [article.moduleId] : [])
        return canUseModule(principal, permission, article.moduleId)
      })
      return { items }
    })

    app.post<{ Body: CreateGuidanceBody }>('/guidance', {
      schema: { tags: ['Knowledge'], summary: 'Create a guidance article', body: createGuidanceSchema }
    }, async (request, reply) => {
      const principal = await authService.authenticate(request)
      if (request.body.sopId) {
        const access = await sopRepository.getAccessContext(request.body.sopId)
        if (!canAccessSop(principal, 'sop.edit', access.id, access.moduleIds)) throw forbidden()
      } else if (!canUseModule(principal, 'sop.edit', request.body.moduleId ?? null)) {
        throw forbidden()
      }
      if (request.body.status === 'published') {
        if (request.body.sopId) {
          const access = await sopRepository.getAccessContext(request.body.sopId)
          if (!canAccessSop(principal, 'sop.publish', access.id, access.moduleIds)) throw forbidden()
        } else if (!canUseModule(principal, 'sop.publish', request.body.moduleId ?? null)) {
          throw forbidden()
        }
      }
      return reply.code(201).send(await repository.createGuidance(request.body, principal.accountId))
    })
  }
}
