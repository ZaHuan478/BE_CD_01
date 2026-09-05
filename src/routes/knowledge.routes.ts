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

export function knowledgeRoutes(
  authService: AuthService,
  repository: KnowledgeRepository,
  sopRepository: SopRepository
): FastifyPluginAsync {
  const controller = new KnowledgeController(authService, new KnowledgeService(repository, sopRepository))
  return async (app) => {
    app.get<{ Querystring: KnowledgeQuery }>('/documents', {
      schema: { tags: ['Knowledge'], summary: 'List document metadata visible to current account', querystring: knowledgeQuerySchema }
    }, (request) => controller.listDocuments(request))

    app.post<{ Body: CreateDocumentBody }>('/documents', {
      schema: { tags: ['Knowledge'], summary: 'Create document metadata and SOP links', body: createDocumentSchema }
    }, (request, reply) => controller.createDocument(request, reply))

    app.get<{ Querystring: KnowledgeQuery }>('/terms', {
      schema: { tags: ['Knowledge'], summary: 'List glossary terms', querystring: knowledgeQuerySchema }
    }, (request) => controller.listTerms(request))

    app.post<{ Body: CreateTermBody }>('/terms', {
      schema: { tags: ['Knowledge'], summary: 'Create a glossary term', body: createTermSchema }
    }, (request, reply) => controller.createTerm(request, reply))

    app.get<{ Querystring: KnowledgeQuery }>('/guidance', {
      schema: { tags: ['Knowledge'], summary: 'List guidance articles', querystring: knowledgeQuerySchema }
    }, (request) => controller.listGuidance(request))

    app.post<{ Body: CreateGuidanceBody }>('/guidance', {
      schema: { tags: ['Knowledge'], summary: 'Create a guidance article', body: createGuidanceSchema }
    }, (request, reply) => controller.createGuidance(request, reply))
  }
}
