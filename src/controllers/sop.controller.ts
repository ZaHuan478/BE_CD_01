import type { FastifyReply, FastifyRequest } from 'fastify'
import type { AuthService } from '../services/auth.service.js'
import type { SopService } from '../services/sop.service.js'
import type { CreateSopBody, ReplaceSopVersionBody, UpdateSopBody } from '../schemas/sop.schemas.js'

interface SopParams { sopId: string }
interface ModuleParams { moduleId: string }
interface VersionParams { versionId: string }
interface DetailQuery { versionId?: string }
interface ListQuery { moduleId?: string; search?: string; includeDrafts?: boolean }

export class SopController {
  constructor(
    private readonly authService: AuthService,
    private readonly service: SopService
  ) {}

  async list(request: FastifyRequest<{ Querystring: ListQuery }>) {
    return { items: await this.service.list(await this.authService.authenticate(request), request.query) }
  }

  async listForModule(request: FastifyRequest<{ Params: ModuleParams; Querystring: Omit<ListQuery, 'moduleId'> }>) {
    const data = await this.service.list(await this.authService.authenticate(request), {
      ...request.query,
      moduleId: request.params.moduleId
    })
    return { data, requestId: request.id }
  }

  get(request: FastifyRequest<{ Params: SopParams; Querystring: DetailQuery }>) {
    return this.authService.authenticate(request).then((principal) =>
      this.service.get(principal, request.params.sopId, request.query.versionId))
  }

  async create(request: FastifyRequest<{ Body: CreateSopBody }>, reply: FastifyReply) {
    const data = await this.service.create(await this.authService.authenticate(request), request.body)
    return reply.code(201).send(data)
  }

  async createDraft(request: FastifyRequest<{ Params: SopParams }>, reply: FastifyReply) {
    const data = await this.service.createDraft(
      await this.authService.authenticate(request),
      request.params.sopId
    )
    return reply.code(201).send(data)
  }

  update(request: FastifyRequest<{ Params: SopParams; Body: UpdateSopBody }>) {
    return this.authService.authenticate(request).then((principal) =>
      this.service.update(principal, request.params.sopId, request.body))
  }

  replaceVersion(request: FastifyRequest<{ Params: VersionParams; Body: ReplaceSopVersionBody }>) {
    return this.authService.authenticate(request).then((principal) =>
      this.service.replaceVersion(principal, request.params.versionId, request.body))
  }

  async submit(request: FastifyRequest<{ Params: VersionParams }>, reply: FastifyReply) {
    await this.service.submit(await this.authService.authenticate(request), request.params.versionId)
    return reply.code(204).send()
  }

  async publish(request: FastifyRequest<{ Params: VersionParams }>, reply: FastifyReply) {
    await this.service.publish(await this.authService.authenticate(request), request.params.versionId)
    return reply.code(204).send()
  }

  async reject(
    request: FastifyRequest<{ Params: VersionParams; Body: { reason: string } }>,
    reply: FastifyReply
  ) {
    await this.service.reject(
      await this.authService.authenticate(request),
      request.params.versionId,
      request.body.reason
    )
    return reply.code(204).send()
  }
}
