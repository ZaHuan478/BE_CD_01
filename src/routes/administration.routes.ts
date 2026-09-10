import type { FastifyPluginAsync } from 'fastify'
import { AdministrationController } from '../controllers/administration.controller.js'
import type { TransactionalDatabase } from '../database/database.js'
import { AdministrationRepository } from '../repositories/administration.repository.js'
import { auditQuerySchema, bootstrapSuperAdminSchema, createProfileSchema, replaceSopRolesSchema, replaceUserProfilesSchema, resourceParamsSchema, settingsSchema, updateProfileSchema, type AuditQuery, type BootstrapSuperAdminBody, type CreateProfileBody, type ReplaceSopRolesBody, type ReplaceUserProfilesBody, type SystemSettings, type UpdateProfileBody } from '../schemas/administration.schemas.js'
import { AdministrationService } from '../services/administration.service.js'
import type { AuthService } from '../services/auth.service.js'

interface IdParams { id: string }

export function administrationRoutes(auth: AuthService, database: TransactionalDatabase, core8: boolean): FastifyPluginAsync {
  const controller = new AdministrationController(auth, new AdministrationService(new AdministrationRepository(database, core8)))
  return async app => {
    app.post<{ Body: BootstrapSuperAdminBody }>('/admin/bootstrap-super-admin', { schema: { tags: ['Administration'], summary: 'Select the first Super Admin explicitly', body: bootstrapSuperAdminSchema } }, request => controller.bootstrapSuperAdmin(request))
    app.get<{ Querystring: AuditQuery }>('/admin/audit-logs', { schema: { tags: ['Administration'], summary: 'Search paginated audit events', querystring: auditQuerySchema } }, request => controller.audit(request))
    app.get('/admin/settings', { schema: { tags: ['Administration'], summary: 'Read SOP management settings' } }, request => controller.settings(request))
    app.put<{ Body: SystemSettings }>('/admin/settings', { schema: { tags: ['Administration'], summary: 'Persist SOP management settings', body: settingsSchema } }, request => controller.updateSettings(request))
    app.get('/admin/permission-profiles', { schema: { tags: ['Administration'], summary: 'List detailed permission profiles' } }, request => controller.profiles(request))
    app.post<{ Body: CreateProfileBody }>('/admin/permission-profiles', { schema: { tags: ['Administration'], summary: 'Create a permission profile', body: createProfileSchema } }, request => controller.createProfile(request))
    app.put<{ Params: IdParams; Body: UpdateProfileBody }>('/admin/permission-profiles/:id', { schema: { tags: ['Administration'], summary: 'Update a permission profile', params: resourceParamsSchema, body: updateProfileSchema } }, request => controller.updateProfile(request))
    app.get<{ Params: IdParams }>('/admin/users/:id/permission-profiles', { schema: { tags: ['Administration'], summary: 'Get permission profiles assigned to one user', params: resourceParamsSchema } }, request => controller.userProfiles(request))
    app.put<{ Params: IdParams; Body: ReplaceUserProfilesBody }>('/admin/users/:id/permission-profiles', { schema: { tags: ['Administration'], summary: 'Replace permission profiles assigned to one user', params: resourceParamsSchema, body: replaceUserProfilesSchema } }, request => controller.replaceUserProfiles(request))
    app.get('/admin/sop-resources', { schema: { tags: ['Administration'], summary: 'List SOP resources for responsibility assignment' } }, request => controller.sops(request))
    app.get<{ Params: IdParams }>('/admin/sop-resources/:id/roles', { schema: { tags: ['Administration'], summary: 'List SOP role assignments', params: resourceParamsSchema } }, request => controller.sopRoles(request))
    app.put<{ Params: IdParams; Body: ReplaceSopRolesBody }>('/admin/sop-resources/:id/roles', { schema: { tags: ['Administration'], summary: 'Replace SOP role assignments', params: resourceParamsSchema, body: replaceSopRolesSchema } }, request => controller.replaceSopRoles(request))
  }
}


