import type { FastifyPluginAsync } from 'fastify'
import type { AuthService } from '../services/auth.service.js'
import type { ModuleRepository } from '../repositories/module.repository.js'
import { moduleParamsSchema } from '../schemas/module.schemas.js'
import { SopController } from '../controllers/sop.controller.js'
import { SopRepository } from '../repositories/sop.repository.js'
import { SopService, validateGraph } from '../services/sop.service.js'
import {
  createSopSchema,
  replaceSopVersionSchema,
  rejectVersionSchema,
  sopDetailQuerySchema,
  sopListQuerySchema,
  sopParamsSchema,
  updateSopSchema,
  versionParamsSchema,
  type CreateSopBody,
  type ReplaceSopVersionBody,
  type UpdateSopBody
} from '../schemas/sop.schemas.js'

interface SopParams { sopId: string }
interface VersionParams { versionId: string }
interface DetailQuery { versionId?: string }
interface ListQuery { moduleId?: string; search?: string; includeDrafts?: boolean }
export { validateGraph }

export function sopRoutes(
  authService: AuthService,
  repository: SopRepository,
  moduleRepository: ModuleRepository
): FastifyPluginAsync {
  const controller = new SopController(authService, new SopService(repository, moduleRepository))
  return async (app) => {
    app.get<{ Querystring: ListQuery }>('/sops', {
      schema: { tags: ['SOPs'], summary: 'List SOPs visible to current account', querystring: sopListQuerySchema }
    }, (request) => controller.list(request))

    app.get<{ Params: { moduleId: string }; Querystring: Omit<ListQuery, 'moduleId'> }>(
      '/modules/:moduleId/sops',
      {
        schema: {
          tags: ['SOPs'],
          summary: 'List SOPs visible to the current account in one module',
          params: moduleParamsSchema,
          querystring: sopListQuerySchema
        }
      },
      (request) => controller.listForModule(request)
    )

    app.get<{ Params: SopParams; Querystring: DetailQuery }>('/sops/:sopId', {
      schema: {
        tags: ['SOPs'],
        summary: 'Get one SOP and a published or explicitly selected version',
        params: sopParamsSchema,
        querystring: sopDetailQuerySchema
      }
    }, (request) => controller.get(request))

    app.post<{ Body: CreateSopBody }>('/sops', {
      schema: { tags: ['SOPs'], summary: 'Create an SOP with its first draft', body: createSopSchema }
    }, (request, reply) => controller.create(request, reply))

    app.post<{ Params: SopParams }>('/sops/:sopId/drafts', {
      schema: { tags: ['SOPs'], summary: 'Create a new draft copied from the latest suitable version', params: sopParamsSchema }
    }, (request, reply) => controller.createDraft(request, reply))

    app.patch<{ Params: SopParams; Body: UpdateSopBody }>('/sops/:sopId', {
      schema: {
        tags: ['SOPs'],
        summary: 'Update SOP title, category or module mappings',
        params: sopParamsSchema,
        body: updateSopSchema
      }
    }, (request) => controller.update(request))

    app.put<{ Params: VersionParams; Body: ReplaceSopVersionBody }>('/sop-versions/:versionId', {
      schema: {
        tags: ['SOP versions'],
        summary: 'Replace editable version content with optimistic concurrency',
        params: versionParamsSchema,
        body: replaceSopVersionSchema
      }
    }, (request) => controller.replaceVersion(request))

    app.post<{ Params: VersionParams }>('/sop-versions/:versionId/submit', {
      schema: { tags: ['SOP versions'], summary: 'Submit a draft for review', params: versionParamsSchema }
    }, (request, reply) => controller.submit(request, reply))

    app.post<{ Params: VersionParams }>('/sop-versions/:versionId/publish', {
      schema: { tags: ['SOP versions'], summary: 'Publish a version and archive the previous version', params: versionParamsSchema }
    }, (request, reply) => controller.publish(request, reply))

    app.post<{ Params: VersionParams; Body: { reason: string } }>('/sop-versions/:versionId/reject', {
      schema: {
        tags: ['SOP versions'],
        summary: 'Reject a version in review and return it for editing',
        params: versionParamsSchema,
        body: rejectVersionSchema
      }
    }, (request, reply) => controller.reject(request, reply))
  }
}
