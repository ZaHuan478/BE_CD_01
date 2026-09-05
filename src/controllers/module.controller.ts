import type { FastifyReply, FastifyRequest } from 'fastify'
import type { AuthService } from '../services/auth.service.js'
import type { ModuleService } from '../services/module.service.js'
import type { CreateModuleBody, UpdateModuleBody } from '../schemas/module.schemas.js'

interface ModuleParams { moduleId: string }

export class ModuleController {
  constructor(
    private readonly authService: AuthService,
    private readonly service: ModuleService
  ) {}

  async list(request: FastifyRequest) {
    return { items: await this.service.listReadable(await this.authService.authenticate(request)) }
  }

  async get(request: FastifyRequest<{ Params: ModuleParams }>) {
    return this.service.getReadable(await this.authService.authenticate(request), request.params.moduleId)
  }

  async create(request: FastifyRequest<{ Body: CreateModuleBody }>, reply: FastifyReply) {
    const data = await this.service.create(await this.authService.authenticate(request), request.body)
    return reply.code(201).send(data)
  }

  async update(request: FastifyRequest<{ Params: ModuleParams; Body: UpdateModuleBody }>) {
    return this.service.update(
      await this.authService.authenticate(request),
      request.params.moduleId,
      request.body
    )
  }
}
