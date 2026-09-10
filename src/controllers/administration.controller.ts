import type { FastifyRequest } from 'fastify'
import type { AuthService } from '../services/auth.service.js'
import type { AdministrationService } from '../services/administration.service.js'
import type { AuditQuery, BootstrapSuperAdminBody, CreateProfileBody, ReplaceSopRolesBody, ReplaceUserProfilesBody, SystemSettings, UpdateProfileBody } from '../schemas/administration.schemas.js'

interface IdParams { id: string }

export class AdministrationController {
  constructor(private readonly auth: AuthService, private readonly service: AdministrationService) {}
  async audit(request: FastifyRequest<{ Querystring: AuditQuery }>) { return this.service.listAudit(await this.auth.authenticate(request), request.query) }
  async settings(request: FastifyRequest) { return { data: await this.service.getSettings(await this.auth.authenticate(request)) } }
  async updateSettings(request: FastifyRequest<{ Body: SystemSettings }>) { return { data: await this.service.updateSettings(await this.auth.authenticate(request), request.body) } }
  async profiles(request: FastifyRequest) { return { data: await this.service.listProfiles(await this.auth.authenticate(request)) } }
  async createProfile(request: FastifyRequest<{ Body: CreateProfileBody }>) { return { data: await this.service.createProfile(await this.auth.authenticate(request), request.body) } }
  async updateProfile(request: FastifyRequest<{ Params: IdParams; Body: UpdateProfileBody }>) { return { data: await this.service.updateProfile(await this.auth.authenticate(request), request.params.id, request.body) } }
  async userProfiles(request: FastifyRequest<{ Params: IdParams }>) { return { data: await this.service.getUserProfiles(await this.auth.authenticate(request), request.params.id) } }
  async replaceUserProfiles(request: FastifyRequest<{ Params: IdParams; Body: ReplaceUserProfilesBody }>) { return { data: await this.service.replaceUserProfiles(await this.auth.authenticate(request), request.params.id, request.body.profileIds) } }
  async bootstrapSuperAdmin(request: FastifyRequest<{ Body: BootstrapSuperAdminBody }>) { return { data: await this.service.bootstrapSuperAdmin(await this.auth.authenticate(request), request.body.accountId) } }
  async sops(request: FastifyRequest) { return { data: await this.service.listSopResources(await this.auth.authenticate(request)) } }
  async sopRoles(request: FastifyRequest<{ Params: IdParams }>) { return { data: await this.service.listSopRoles(await this.auth.authenticate(request), request.params.id) } }
  async replaceSopRoles(request: FastifyRequest<{ Params: IdParams; Body: ReplaceSopRolesBody }>) { return { data: await this.service.replaceSopRoles(await this.auth.authenticate(request), request.params.id, request.body) } }
}

