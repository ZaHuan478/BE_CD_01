import type { FastifyReply, FastifyRequest } from 'fastify'
import type { AuthService } from '../services/auth.service.js'
import type { SystemGlossaryService } from '../services/system-glossary.service.js'
import type {
  AssociateGuideTermsBody,
  CreateGlossaryTermBody,
  GlossarySearchQuery,
  UpdateGlossaryTermBody
} from '../schemas/system-glossary.schemas.js'

interface SlugParams {
  slug: string
}

interface IdParams {
  id: string
}

export class SystemGlossaryController {
  constructor(
    private readonly auth: AuthService,
    private readonly service: SystemGlossaryService
  ) {}

  async list(request: FastifyRequest<{ Querystring: GlossarySearchQuery }>) {
    await this.auth.authenticate(request)
    const result = await this.service.listPublic(request.query)
    return { data: result, requestId: request.id }
  }

  async detail(request: FastifyRequest<{ Params: SlugParams }>) {
    await this.auth.authenticate(request)
    const term = await this.service.getBySlug(request.params.slug)
    return { data: term, requestId: request.id }
  }

  async byGuide(request: FastifyRequest<{ Params: IdParams }>) {
    await this.auth.authenticate(request)
    const terms = await this.service.getTermsForGuide(request.params.id)
    return { data: terms, requestId: request.id }
  }

  async adminList(
    request: FastifyRequest<{
      Querystring: { q?: string; category?: string; status?: string }
    }>
  ) {
    const principal = await this.auth.authenticate(request)
    const items = await this.service.listAdmin(principal, request.query)
    return { data: items, requestId: request.id }
  }

  async adminDetail(request: FastifyRequest<{ Params: IdParams }>) {
    const principal = await this.auth.authenticate(request)
    const term = await this.service.getAdminById(principal, request.params.id)
    return { data: term, requestId: request.id }
  }

  async create(request: FastifyRequest<{ Body: CreateGlossaryTermBody }>, reply: FastifyReply) {
    const principal = await this.auth.authenticate(request)
    const created = await this.service.create(principal, request.body)
    reply.status(201)
    return { data: created, requestId: request.id }
  }

  async update(request: FastifyRequest<{ Params: IdParams; Body: UpdateGlossaryTermBody }>) {
    const principal = await this.auth.authenticate(request)
    const result = await this.service.update(principal, request.params.id, request.body)
    return { data: result, requestId: request.id }
  }

  async publish(request: FastifyRequest<{ Params: IdParams }>) {
    const principal = await this.auth.authenticate(request)
    const result = await this.service.publish(principal, request.params.id)
    return { data: result, requestId: request.id }
  }

  async archive(request: FastifyRequest<{ Params: IdParams }>) {
    const principal = await this.auth.authenticate(request)
    const result = await this.service.archive(principal, request.params.id)
    return { data: result, requestId: request.id }
  }

  async associateGuide(request: FastifyRequest<{ Body: AssociateGuideTermsBody }>) {
    const principal = await this.auth.authenticate(request)
    const result = await this.service.associateGuideTerms(
      principal,
      request.body.guideId,
      request.body.guideVersionNumber ?? 1,
      request.body.termIds
    )
    return { data: result, requestId: request.id }
  }
}
