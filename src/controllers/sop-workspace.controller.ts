import type { FastifyRequest } from 'fastify'
import type { AuthService } from '../services/auth.service.js'
import type { SopWorkspaceService } from '../services/sop-workspace.service.js'
import type { CreateSopBody } from '../schemas/sop.schemas.js'
import type { Action } from '../repositories/sop-workspace.repository.js'

export class SopWorkspaceController {
  constructor(
    private readonly auth: AuthService,
    private readonly service: SopWorkspaceService
  ) {}

  async list(request: FastifyRequest<{ Querystring: { q?: string; state?: string; page?: number; pageSize?: number } }>) {
    const principal = await this.auth.authenticate(request)
    return this.service.list(principal, request.query)
  }

  async create(request: FastifyRequest<{ Body: { documentId?: string; preview?: CreateSopBody } }>) {
    const principal = await this.auth.authenticate(request)
    const result = await this.service.create(principal, request.body)
    return { data: result }
  }

  async get(request: FastifyRequest<{ Params: { id: string } }>) {
    const principal = await this.auth.authenticate(request)
    const result = await this.service.get(principal, request.params.id)
    return { data: result }
  }

  async save(request: FastifyRequest<{ Params: { id: string }; Body: { revision: number; preview: CreateSopBody } }>) {
    const principal = await this.auth.authenticate(request)
    const result = await this.service.save(principal, request.params.id, request.body.revision, request.body.preview)
    return { data: result }
  }

  async action(request: FastifyRequest<{ Params: { id: string }; Body: { revision: number; action: Action; note?: string } }>) {
    const principal = await this.auth.authenticate(request)
    const result = await this.service.action(principal, request.params.id, request.body.revision, request.body.action, request.body.note)
    return { data: result }
  }

  async archiveDocument(request: FastifyRequest<{ Params: { documentId: string }; Body: { reason: string; expectedVersion: number } }>) {
    const principal = await this.auth.authenticate(request)
    const result = await this.service.archivePublishedDocument(
      principal,
      request.params.documentId,
      request.body.reason,
      request.body.expectedVersion
    )
    return { data: result }
  }

  async permanentDelete(request: FastifyRequest<{ Params: { id: string }; Querystring: { confirmCode?: string }; Body?: { confirmCode?: string } }>) {
    const principal = await this.auth.authenticate(request)
    const confirmCode = request.body?.confirmCode ?? request.query?.confirmCode ?? ''
    const result = await this.service.permanentDelete(principal, request.params.id, confirmCode)
    return { data: result }
  }
}
