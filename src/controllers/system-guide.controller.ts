import type { FastifyRequest } from 'fastify'
import type { AuthService } from '../services/auth.service.js'
import type { SystemGuideService } from '../services/system-guide.service.js'
import type { CreateSystemGuideBody, SystemGuideProgressBody, UpdateSystemGuideBody } from '../schemas/system-guide.schemas.js'

interface IdParams { id: string }

export class SystemGuideController {
  constructor(private readonly auth: AuthService, private readonly service: SystemGuideService) {}

  async list(request: FastifyRequest) {
    const principal = await this.auth.authenticate(request)
    return { data: await this.service.list(principal), requestId: request.id }
  }

  async detail(request: FastifyRequest<{ Params: IdParams }>) {
    const principal = await this.auth.authenticate(request)
    return { data: await this.service.get(principal, request.params.id), requestId: request.id }
  }

  async progress(request: FastifyRequest<{ Params: IdParams; Body: SystemGuideProgressBody }>) {
    const principal = await this.auth.authenticate(request)
    return { data: await this.service.saveProgress(principal, request.params.id, request.body), requestId: request.id }
  }

  async adminList(request: FastifyRequest) {
    const principal = await this.auth.authenticate(request)
    return { data: await this.service.listAdmin(principal), requestId: request.id }
  }

  async create(request: FastifyRequest<{ Body: CreateSystemGuideBody }>) {
    const principal = await this.auth.authenticate(request)
    return { data: await this.service.create(principal, request.body), requestId: request.id }
  }

  async update(request: FastifyRequest<{ Params: IdParams; Body: UpdateSystemGuideBody }>) {
    const principal = await this.auth.authenticate(request)
    return { data: await this.service.update(principal, request.params.id, request.body), requestId: request.id }
  }

  async publish(request: FastifyRequest<{ Params: IdParams }>) {
    const principal = await this.auth.authenticate(request)
    return { data: await this.service.publish(principal, request.params.id), requestId: request.id }
  }

  async archive(request: FastifyRequest<{ Params: IdParams }>) {
    const principal = await this.auth.authenticate(request)
    return { data: await this.service.archive(principal, request.params.id), requestId: request.id }
  }
}

