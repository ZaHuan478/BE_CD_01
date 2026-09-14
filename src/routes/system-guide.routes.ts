import type { FastifyPluginAsync } from 'fastify'
import { SystemGuideController } from '../controllers/system-guide.controller.js'
import type { SystemGuideRepository } from '../repositories/system-guide.repository.js'
import {
  createSystemGuideSchema, systemGuideParamsSchema, systemGuideProgressSchema, updateSystemGuideSchema,
  type CreateSystemGuideBody, type SystemGuideProgressBody, type UpdateSystemGuideBody
} from '../schemas/system-guide.schemas.js'
import type { AuthService } from '../services/auth.service.js'
import { SystemGuideService } from '../services/system-guide.service.js'

interface IdParams { id: string }

export function systemGuideRoutes(auth: AuthService, repository: SystemGuideRepository): FastifyPluginAsync {
  const controller = new SystemGuideController(auth, new SystemGuideService(repository))
  return async app => {
    app.get('/system-guides', { schema: { tags: ['System guides'], summary: 'List published product guides for the current user' } }, request => controller.list(request))
    app.get<{ Params: IdParams }>('/system-guides/:id', { schema: { tags: ['System guides'], summary: 'Read one published product guide', params: systemGuideParamsSchema } }, request => controller.detail(request))
    app.put<{ Params: IdParams; Body: SystemGuideProgressBody }>('/system-guides/:id/progress', { schema: { tags: ['System guides'], summary: 'Save current user guide progress', params: systemGuideParamsSchema, body: systemGuideProgressSchema } }, request => controller.progress(request))

    app.get('/admin/system-guides', { schema: { tags: ['Administration - System guides'], summary: 'List every product guide' } }, request => controller.adminList(request))
    app.post<{ Body: CreateSystemGuideBody }>('/admin/system-guides', { schema: { tags: ['Administration - System guides'], summary: 'Create a draft product guide', body: createSystemGuideSchema } }, request => controller.create(request))
    app.patch<{ Params: IdParams; Body: UpdateSystemGuideBody }>('/admin/system-guides/:id', { schema: { tags: ['Administration - System guides'], summary: 'Update product guide metadata and draft content', params: systemGuideParamsSchema, body: updateSystemGuideSchema } }, request => controller.update(request))
    app.post<{ Params: IdParams }>('/admin/system-guides/:id/publish', { schema: { tags: ['Administration - System guides'], summary: 'Publish latest product guide draft', params: systemGuideParamsSchema } }, request => controller.publish(request))
    app.post<{ Params: IdParams }>('/admin/system-guides/:id/archive', { schema: { tags: ['Administration - System guides'], summary: 'Archive a product guide', params: systemGuideParamsSchema } }, request => controller.archive(request))
  }
}

