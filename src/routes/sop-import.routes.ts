import type { FastifyPluginAsync } from 'fastify'
import type { AppEnv } from '../config/env.js'
import { SopImportController } from '../controllers/sop-import.controller.js'
import type { TransactionalDatabase } from '../database/database.js'
import type { ModuleRepository } from '../repositories/module.repository.js'
import { SopImportRepository } from '../repositories/sop-import.repository.js'
import type { SopRepository } from '../repositories/sop.repository.js'
import { sopImportParamsSchema, updateSopImportSchema, type UpdateSopImportBody } from '../schemas/sop-import.schemas.js'
import type { AuthService } from '../services/auth.service.js'
import { SopImportService } from '../services/sop-import.service.js'
import { SopService } from '../services/sop.service.js'

interface ImportParams { importId: string }

export function sopImportRoutes(
  auth: AuthService,
  database: TransactionalDatabase,
  sopRepository: SopRepository | undefined,
  moduleRepository: ModuleRepository,
  env: AppEnv
): FastifyPluginAsync {
  const controller = new SopImportController(auth, new SopImportService(
    new SopImportRepository(database), sopRepository ? new SopService(sopRepository, moduleRepository) : undefined, env
  ))
  return async (app) => {
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
    app.post<{ Params: ImportParams }>('/sop-imports/:importId/accept', {
      schema: { tags: ['SOP imports'], summary: 'Accept an import and create an SOP draft', params: sopImportParamsSchema }
    }, (request, reply) => controller.accept(request, reply))
    app.post<{ Params: ImportParams }>('/sop-imports/:importId/publish', {
      schema: { tags: ['SOP imports'], summary: 'Approve and publish an imported SOP draft', params: sopImportParamsSchema }
    }, request => controller.publish(request))
    app.get<{ Params: ImportParams }>('/sop-imports/:importId/source', {
      schema: { tags: ['SOP imports'], summary: 'Download the immutable source document', params: sopImportParamsSchema }
    }, (request, reply) => controller.source(request, reply))
  }
}
