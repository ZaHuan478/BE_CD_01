import { KnowledgeController } from '../controllers/knowledge.controller.js'
import { KnowledgeService } from '../services/knowledge.service.js'
import type { FastifyPluginAsync } from 'fastify'
import type { AuthService } from '../services/auth.service.js'
import type { SopRepository } from '../repositories/sop.repository.js'
import { KnowledgeRepository } from '../repositories/knowledge.repository.js'
import {
  createDocumentSchema,
  createGuidanceSchema,
  createTermSchema,
  knowledgeQuerySchema,
  type CreateDocumentBody,
  type CreateGuidanceBody,
  type CreateTermBody,
  type KnowledgeQuery
} from '../schemas/knowledge.schemas.js'

/**
 * [LEGACY: DEPRECATED - Only mounted when DB_MODEL=legacy]
 * Khi DB_MODEL=core8, các endpoint này được thay thế bởi userDocumentRoutes, systemGlossaryRoutes, và systemGuideRoutes.
 */
export function knowledgeRoutes(
  authService: AuthService,
  repository: KnowledgeRepository,
  sopRepository: SopRepository
): FastifyPluginAsync {
  const controller = new KnowledgeController(authService, new KnowledgeService(repository, sopRepository))
  return async (app) => {
    app.get<{ Querystring: KnowledgeQuery }>('/documents', {
      schema: {
        tags: ['Knowledge (Legacy)'],
        deprecated: true,
        summary: 'List document metadata visible to current account (Legacy fallback)',
        querystring: knowledgeQuerySchema
      }
    }, (request) => controller.listDocuments(request))

    app.post<{ Body: CreateDocumentBody }>('/documents', {
      schema: {
        tags: ['Knowledge (Legacy)'],
        deprecated: true,
        summary: 'Create document metadata and SOP links (Legacy fallback)',
        body: createDocumentSchema
      }
    }, (request, reply) => controller.createDocument(request, reply))

    app.get<{ Querystring: KnowledgeQuery }>('/terms', {
      schema: {
        tags: ['Knowledge (Legacy)'],
        deprecated: true,
        summary: 'List glossary terms (Legacy fallback)',
        querystring: knowledgeQuerySchema
      }
    }, (request) => controller.listTerms(request))

    app.post<{ Body: CreateTermBody }>('/terms', {
      schema: {
        tags: ['Knowledge (Legacy)'],
        deprecated: true,
        summary: 'Create a glossary term (Legacy fallback)',
        body: createTermSchema
      }
    }, (request, reply) => controller.createTerm(request, reply))

    app.get<{ Querystring: KnowledgeQuery }>('/guidance', {
      schema: {
        tags: ['Knowledge (Legacy)'],
        deprecated: true,
        summary: 'List guidance articles (Legacy fallback)',
        querystring: knowledgeQuerySchema
      }
    }, (request) => controller.listGuidance(request))

    app.post<{ Body: CreateGuidanceBody }>('/guidance', {
      schema: {
        tags: ['Knowledge (Legacy)'],
        deprecated: true,
        summary: 'Create a guidance article (Legacy fallback)',
        body: createGuidanceSchema
      }
    }, (request, reply) => controller.createGuidance(request, reply))
  }
}
