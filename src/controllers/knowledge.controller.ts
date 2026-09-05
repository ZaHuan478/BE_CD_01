import type { FastifyRequest, FastifyReply } from 'fastify'
import type { AuthService } from '../services/auth.service.js'
import type { KnowledgeService } from '../services/knowledge.service.js'
import type { CreateDocumentBody, CreateGuidanceBody, CreateTermBody, KnowledgeQuery } from '../schemas/knowledge.schemas.js'
export class KnowledgeController {
  constructor(private readonly auth: AuthService, private readonly service: KnowledgeService) {}
  async listDocuments(request: FastifyRequest<{ Querystring: KnowledgeQuery }>) {
    const result = await this.service.listDocuments(await this.auth.authenticate(request), request.query)
    return result
  }
  async createDocument(request: FastifyRequest<{ Body: CreateDocumentBody }>, reply: FastifyReply) {
    const result = await this.service.createDocument(await this.auth.authenticate(request), request.body)
    return reply.code(201).send(result)
  }
  async listTerms(request: FastifyRequest<{ Querystring: KnowledgeQuery }>) {
    const result = await this.service.listTerms(await this.auth.authenticate(request), request.query)
    return result
  }
  async createTerm(request: FastifyRequest<{ Body: CreateTermBody }>, reply: FastifyReply) {
    const result = await this.service.createTerm(await this.auth.authenticate(request), request.body)
    return reply.code(201).send(result)
  }
  async listGuidance(request: FastifyRequest<{ Querystring: KnowledgeQuery }>) {
    const result = await this.service.listGuidance(await this.auth.authenticate(request), request.query)
    return result
  }
  async createGuidance(request: FastifyRequest<{ Body: CreateGuidanceBody }>, reply: FastifyReply) {
    const result = await this.service.createGuidance(await this.auth.authenticate(request), request.body)
    return reply.code(201).send(result)
  }
}
