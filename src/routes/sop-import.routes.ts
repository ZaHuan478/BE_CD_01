import type { FastifyPluginAsync } from 'fastify'
import type { AppEnv } from '../config/env.js'
import { SopImportController } from '../controllers/sop-import.controller.js'
import type { TransactionalDatabase } from '../database/database.js'
import type { ModuleRepository } from '../repositories/module.repository.js'
import { SopImportRepository } from '../repositories/sop-import.repository.js'
import { UserDocumentRepository } from '../repositories/user-document.repository.js'
import type { SopRepository } from '../repositories/sop.repository.js'
import { createDocumentConversionSchema, reviewSopImportSchema, sopImportParamsSchema, updateSopImportSchema, mediaParamsSchema, updateMediaBodySchema, cropMediaBodySchema, type CreateDocumentConversionBody, type ReviewSopImportBody, type UpdateSopImportBody, type UpdateMediaBody, type CropMediaBody } from '../schemas/sop-import.schemas.js'
import type { AuthService } from '../services/auth.service.js'
import { SopImportService } from '../services/sop-import.service.js'
import { SopService } from '../services/sop.service.js'
import type { IndexingService } from '../services/rag/indexing.service.js'

interface ImportParams { importId: string }
interface MediaParams { importId: string; mediaId: string }

export function sopImportRoutes(
  auth: AuthService,
  database: TransactionalDatabase,
  sopRepository: SopRepository | undefined,
  moduleRepository: ModuleRepository,
  env: AppEnv,
  indexingService?: IndexingService
): FastifyPluginAsync {
  const controller = new SopImportController(auth, new SopImportService(
    new SopImportRepository(database), new UserDocumentRepository(database),
    sopRepository ? new SopService(sopRepository, moduleRepository) : undefined, env, indexingService
  ))
  return async (app) => {
    app.post<{ Body: CreateDocumentConversionBody }>('/document-conversions', {
      schema: {
        tags: ['Document conversions'],
        summary: 'Create or reopen an SOP conversion from a document in My Documents',
        body: createDocumentConversionSchema
      }
    }, (request, reply) => controller.createFromDocument(request, reply))
    app.post<{ Params: ImportParams }>('/sop-imports/:importId/revise', {
      schema: { tags: ['SOP imports'], params: sopImportParamsSchema, summary: 'Withdraw a pending draft or create a revision from a published import' }
    }, request => controller.revise(request))
    app.post<{ Params: ImportParams }>('/sop-imports/:importId/archive', {
      schema: { tags: ['SOP imports'], params: sopImportParamsSchema, summary: 'Archive an obsolete published import while preserving history' }
    }, request => controller.archive(request))
    app.get('/sop-imports', {
      schema: { tags: ['SOP imports'], summary: 'List document imports created by the current account' }
    }, request => controller.list(request))
    app.post('/sop-imports', {
      schema: { tags: ['SOP imports'], summary: 'Upload DOCX/PDF and create a structured SOP preview', consumes: ['multipart/form-data'] }
    }, (request, reply) => controller.upload(request, reply))
    app.get<{ Params: ImportParams }>('/sop-imports/:importId', {
      schema: { tags: ['SOP imports'], summary: 'Get one import preview', params: sopImportParamsSchema }
    }, request => controller.get(request))
    app.put<{ Params: ImportParams; Body: UpdateSopImportBody }>('/sop-imports/:importId', {
      schema: { tags: ['SOP imports'], summary: 'Save a corrected SOP preview', params: sopImportParamsSchema, body: updateSopImportSchema }
    }, request => controller.update(request))
    app.post<{ Params: ImportParams }>('/sop-imports/:importId/reprocess', {
      schema: { tags: ['SOP imports'], summary: 'Re-extract the owned draft with the current document-structure parser', params: sopImportParamsSchema }
    }, request => controller.reprocess(request))
    app.get<{ Params: ImportParams }>('/sop-imports/:importId/flow', {
      schema: { tags: ['SOP imports'], summary: 'Build a Mermaid flowchart from an existing import', params: sopImportParamsSchema }
    }, request => controller.flow(request))
    app.post<{ Params: ImportParams; Body: UpdateSopImportBody }>('/sop-imports/:importId/flow/validate', {
      schema: { tags: ['SOP imports'], summary: 'Validate a corrected flow and return Mermaid source', params: sopImportParamsSchema, body: updateSopImportSchema }
    }, request => controller.validateFlow(request))
    app.delete<{ Params: ImportParams }>('/sop-imports/:importId', {
      schema: { tags: ['SOP imports'], summary: 'Delete an owned import while it is still a draft', params: sopImportParamsSchema }
    }, request => controller.delete(request))
    app.post<{ Params: ImportParams }>('/sop-imports/:importId/accept', {
      schema: { tags: ['SOP imports'], summary: 'Accept an import and create an SOP draft', params: sopImportParamsSchema }
    }, (request, reply) => controller.accept(request, reply))
    app.post<{ Params: ImportParams; Body: ReviewSopImportBody }>('/sop-imports/:importId/review', {
      schema: { tags: ['SOP imports'], summary: 'Confirm review of an imported SOP draft', params: sopImportParamsSchema, body: reviewSopImportSchema }
    }, request => controller.review(request))
    app.post<{ Params: ImportParams }>('/sop-imports/:importId/publish', {
      schema: { tags: ['SOP imports'], summary: 'Approve and publish an imported SOP draft', params: sopImportParamsSchema }
    }, request => controller.publish(request))
    app.get<{ Params: ImportParams }>('/sop-imports/:importId/source', {
      schema: { tags: ['SOP imports'], summary: 'Download the immutable source document', params: sopImportParamsSchema }
    }, (request, reply) => controller.source(request, reply))

    app.get<{ Params: ImportParams }>('/sop-imports/:importId/media', {
      schema: { tags: ['SOP imports'], summary: 'Get assigned, unassigned and ignored media for import', params: sopImportParamsSchema }
    }, request => controller.getMedia(request))
    app.get<{ Params: MediaParams }>('/sop-imports/:importId/media/:mediaId/preview', {
      schema: { tags: ['SOP imports'], summary: 'Get media preview buffer with access control', params: mediaParamsSchema }
    }, (request, reply) => controller.getMediaPreview(request, reply))
    app.patch<{ Params: MediaParams; Body: UpdateMediaBody }>('/sop-imports/:importId/media/:mediaId', {
      schema: { tags: ['SOP imports'], summary: 'Update media assignment, caption, role, cover or sortOrder', params: mediaParamsSchema, body: updateMediaBodySchema }
    }, request => controller.updateMedia(request))
    app.post<{ Params: ImportParams; Body: CropMediaBody }>('/sop-imports/:importId/media/crops', {
      schema: { tags: ['SOP imports'], summary: 'Create a page crop and assign to step', params: sopImportParamsSchema, body: cropMediaBodySchema }
    }, (request, reply) => controller.cropMedia(request, reply))
    app.post<{ Params: ImportParams }>('/sop-imports/:importId/media/reextract', {
      schema: { tags: ['SOP imports'], summary: 'Re-extract images from source document without losing step edits', params: sopImportParamsSchema }
    }, request => controller.reextractMedia(request))
  }
}


