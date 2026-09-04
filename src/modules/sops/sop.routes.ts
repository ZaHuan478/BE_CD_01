import type { FastifyPluginAsync } from 'fastify'
import { canAccessSop, hasAnyPermission, hasPermission } from '../../auth/authorization.js'
import type { AuthService } from '../../auth/auth.service.js'
import { requirePermission } from '../../auth/guards.js'
import { AppError, forbidden } from '../../common/errors.js'
import { SopRepository } from './sop.repository.js'
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
  type SopContentInput,
  type UpdateSopBody
} from './sop.schemas.js'

interface SopParams { sopId: string }
interface VersionParams { versionId: string }
interface DetailQuery { versionId?: string }
interface ListQuery { moduleId?: string; search?: string; includeDrafts?: boolean }

export function validateGraph(content: SopContentInput): void {
  const stepIds = new Set<string>()
  const stableKeys = new Set<string>()
  const stepCodes = new Set<string>()
  for (const step of content.steps) {
    if (stepIds.has(step.id)) throw new AppError(400, 'DUPLICATE_STEP_ID', `Duplicate step id: ${step.id}`)
    if (stableKeys.has(step.stableKey)) throw new AppError(400, 'DUPLICATE_STABLE_KEY', `Duplicate stableKey: ${step.stableKey}`)
    if (stepCodes.has(step.code)) throw new AppError(400, 'DUPLICATE_STEP_CODE', `Duplicate step code: ${step.code}`)
    stepIds.add(step.id)
    stableKeys.add(step.stableKey)
    stepCodes.add(step.code)
  }
  for (const transition of content.transitions) {
    if (transition.fromStepId && !stepIds.has(transition.fromStepId)) {
      throw new AppError(400, 'INVALID_TRANSITION', `Unknown fromStepId: ${transition.fromStepId}`)
    }
    if (transition.toStepId && !stepIds.has(transition.toStepId)) {
      throw new AppError(400, 'INVALID_TRANSITION', `Unknown toStepId: ${transition.toStepId}`)
    }
  }
}

function canManageSop(
  principal: Parameters<typeof canAccessSop>[0],
  permission: 'sop.edit' | 'sop.review' | 'sop.publish',
  sopId: string,
  moduleIds: string[]
): void {
  if (!canAccessSop(principal, permission, sopId, moduleIds)) {
    throw forbidden(`Permission ${permission} is required for this SOP`)
  }
}

export function sopRoutes(authService: AuthService, repository: SopRepository): FastifyPluginAsync {
  return async (app) => {
    app.get<{ Querystring: ListQuery }>('/sops', {
      schema: { tags: ['SOPs'], summary: 'List SOPs visible to current account', querystring: sopListQuerySchema }
    }, async (request) => {
      const principal = await authService.authenticate(request)
      const requestedDrafts = request.query.includeDrafts === true
      const includeDrafts = requestedDrafts && (
        hasAnyPermission(principal, 'sop.edit')
        || hasAnyPermission(principal, 'sop.review')
        || hasAnyPermission(principal, 'sop.publish')
      )
      const rows = await repository.list({
        moduleId: request.query.moduleId,
        search: request.query.search,
        includeDrafts
      })
      const items = rows.filter((sop) => {
        if (sop.publicationStatus === 'published') {
          return canAccessSop(principal, 'sop.read', sop.id, sop.moduleIds)
        }
        return canAccessSop(principal, 'sop.edit', sop.id, sop.moduleIds)
          || canAccessSop(principal, 'sop.review', sop.id, sop.moduleIds)
          || canAccessSop(principal, 'sop.publish', sop.id, sop.moduleIds)
      })
      return { items }
    })

    app.get<{ Params: SopParams; Querystring: DetailQuery }>('/sops/:sopId', {
      schema: {
        tags: ['SOPs'],
        summary: 'Get one SOP and a published or explicitly selected version',
        params: sopParamsSchema,
        querystring: sopDetailQuerySchema
      }
    }, async (request) => {
      const principal = await authService.authenticate(request)
      const access = await repository.getAccessContext(request.params.sopId)
      const detail = await repository.getDetail(request.params.sopId, request.query.versionId)
      if (detail.version.publicationStatus === 'published') {
        if (!canAccessSop(principal, 'sop.read', access.id, access.moduleIds)) {
          throw forbidden('Permission sop.read is required for this SOP')
        }
      } else if (!canAccessSop(principal, 'sop.edit', access.id, access.moduleIds)
        && !canAccessSop(principal, 'sop.review', access.id, access.moduleIds)
        && !canAccessSop(principal, 'sop.publish', access.id, access.moduleIds)) {
        throw forbidden('Draft versions require sop.edit, sop.review or sop.publish')
      }
      return detail
    })

    app.post<{ Body: CreateSopBody }>('/sops', {
      schema: { tags: ['SOPs'], summary: 'Create an SOP with its first draft', body: createSopSchema }
    }, async (request, reply) => {
      const principal = await authService.authenticate(request)
      validateGraph(request.body)
      const moduleIds = [...new Set(request.body.moduleIds)]
      const permitted = hasPermission(principal, 'sop.create')
        || moduleIds.every((moduleId) => hasPermission(principal, 'sop.create', 'module', moduleId))
      if (!permitted) requirePermission(principal, 'sop.create')
      const created = await repository.create(request.body, principal.accountId)
      const detail = await repository.getDetail(created.sopId, created.versionId)
      return reply.code(201).send(detail)
    })

    app.post<{ Params: SopParams }>('/sops/:sopId/drafts', {
      schema: { tags: ['SOPs'], summary: 'Create a new draft copied from the latest suitable version', params: sopParamsSchema }
    }, async (request, reply) => {
      const principal = await authService.authenticate(request)
      const access = await repository.getAccessContext(request.params.sopId)
      canManageSop(principal, 'sop.edit', access.id, access.moduleIds)
      const versionId = await repository.createDraft(access.id, principal.accountId)
      const detail = await repository.getDetail(access.id, versionId)
      return reply.code(201).send(detail)
    })

    app.patch<{ Params: SopParams; Body: UpdateSopBody }>('/sops/:sopId', {
      schema: {
        tags: ['SOPs'],
        summary: 'Update SOP title, category or module mappings',
        params: sopParamsSchema,
        body: updateSopSchema
      }
    }, async (request) => {
      const principal = await authService.authenticate(request)
      const access = await repository.getAccessContext(request.params.sopId)
      canManageSop(principal, 'sop.edit', access.id, access.moduleIds)
      await repository.updateSop(access.id, request.body, principal.accountId)
      const refreshed = await repository.getAccessContext(access.id)
      return refreshed
    })

    app.put<{ Params: VersionParams; Body: ReplaceSopVersionBody }>('/sop-versions/:versionId', {
      schema: {
        tags: ['SOP versions'],
        summary: 'Replace editable version content with optimistic concurrency',
        params: versionParamsSchema,
        body: replaceSopVersionSchema
      }
    }, async (request) => {
      const principal = await authService.authenticate(request)
      validateGraph(request.body)
      const sopId = await repository.getSopIdForVersion(request.params.versionId)
      const access = await repository.getAccessContext(sopId)
      canManageSop(principal, 'sop.edit', sopId, access.moduleIds)
      await repository.replaceVersion(request.params.versionId, request.body, principal.accountId)
      return repository.getDetail(sopId, request.params.versionId)
    })

    app.post<{ Params: VersionParams }>('/sop-versions/:versionId/submit', {
      schema: { tags: ['SOP versions'], summary: 'Submit a draft for review', params: versionParamsSchema }
    }, async (request, reply) => {
      const principal = await authService.authenticate(request)
      const sopId = await repository.getSopIdForVersion(request.params.versionId)
      const access = await repository.getAccessContext(sopId)
      canManageSop(principal, 'sop.edit', sopId, access.moduleIds)
      await repository.submitVersion(request.params.versionId, principal.accountId)
      return reply.code(204).send()
    })

    app.post<{ Params: VersionParams }>('/sop-versions/:versionId/publish', {
      schema: { tags: ['SOP versions'], summary: 'Publish a version and archive the previous version', params: versionParamsSchema }
    }, async (request, reply) => {
      const principal = await authService.authenticate(request)
      const sopId = await repository.getSopIdForVersion(request.params.versionId)
      const access = await repository.getAccessContext(sopId)
      canManageSop(principal, 'sop.publish', sopId, access.moduleIds)
      await repository.publishVersion(request.params.versionId, principal.accountId)
      return reply.code(204).send()
    })

    app.post<{ Params: VersionParams; Body: { reason: string } }>('/sop-versions/:versionId/reject', {
      schema: {
        tags: ['SOP versions'],
        summary: 'Reject a version in review and return it for editing',
        params: versionParamsSchema,
        body: rejectVersionSchema
      }
    }, async (request, reply) => {
      const principal = await authService.authenticate(request)
      const sopId = await repository.getSopIdForVersion(request.params.versionId)
      const access = await repository.getAccessContext(sopId)
      canManageSop(principal, 'sop.review', sopId, access.moduleIds)
      await repository.rejectVersion(request.params.versionId, request.body.reason, principal.accountId)
      return reply.code(204).send()
    })
  }
}
