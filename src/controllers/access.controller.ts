import type { FastifyReply, FastifyRequest } from 'fastify'
import type { AuthService } from '../services/auth.service.js'
import type { AccessService } from '../services/access.service.js'
import type {
  CreateAccountBody,
  CreateGroupBody,
  ReplaceAccountGroupsBody,
  ReplaceGroupGrantsBody,
  ReplaceUserModulesBody,
  UpdateUserBody
} from '../schemas/access.schemas.js'

interface IdParams { id: string }
interface UserListQuery { search?: string }

export class AccessController {
  constructor(
    private readonly authService: AuthService,
    private readonly service: AccessService
  ) {}

  async listPermissions(request: FastifyRequest) {
    return { items: await this.service.listPermissions(await this.authService.authenticate(request)) }
  }

  async listAccounts(request: FastifyRequest) {
    return { items: await this.service.listAccounts(await this.authService.authenticate(request)) }
  }

  async createAccount(request: FastifyRequest<{ Body: CreateAccountBody }>, reply: FastifyReply) {
    const data = await this.service.createAccount(await this.authService.authenticate(request), request.body)
    return reply.code(201).send(data)
  }

  async replaceAccountGroups(
    request: FastifyRequest<{ Params: IdParams; Body: ReplaceAccountGroupsBody }>,
    reply: FastifyReply
  ) {
    await this.service.replaceAccountGroups(
      await this.authService.authenticate(request),
      request.params.id,
      request.body.groupIds
    )
    return reply.code(204).send()
  }

  async listGroups(request: FastifyRequest) {
    return { items: await this.service.listGroups(await this.authService.authenticate(request)) }
  }

  async createGroup(request: FastifyRequest<{ Body: CreateGroupBody }>, reply: FastifyReply) {
    const data = await this.service.createGroup(await this.authService.authenticate(request), request.body)
    return reply.code(201).send(data)
  }

  async replaceGroupGrants(
    request: FastifyRequest<{ Params: IdParams; Body: ReplaceGroupGrantsBody }>,
    reply: FastifyReply
  ) {
    await this.service.replaceGroupGrants(
      await this.authService.authenticate(request),
      request.params.id,
      request.body
    )
    return reply.code(204).send()
  }

  async listUsers(request: FastifyRequest<{ Querystring: UserListQuery }>) {
    const data = await this.service.listUsers(
      await this.authService.authenticate(request),
      request.query.search
    )
    return { data, requestId: request.id }
  }

  async getUserModuleAccess(request: FastifyRequest<{ Params: IdParams }>) {
    const data = await this.service.getUserModuleAccess(
      await this.authService.authenticate(request),
      request.params.id
    )
    return { data, requestId: request.id }
  }

  async replaceUserModules(request: FastifyRequest<{
    Params: IdParams
    Body: ReplaceUserModulesBody
  }>) {
    const data = await this.service.replaceUserModules(
      await this.authService.authenticate(request),
      request.params.id,
      request.body
    )
    return { data, requestId: request.id }
  }

  async updateUser(request: FastifyRequest<{ Params: IdParams; Body: UpdateUserBody }>) {
    const data = await this.service.updateUser(
      await this.authService.authenticate(request), request.params.id, request.body
    )
    return { data, requestId: request.id }
  }
}
