import type { FastifyPluginAsync } from 'fastify'
import type { AppEnv } from '../config/env.js'
import { UserDocumentController } from '../controllers/user-document.controller.js'
import type { TransactionalDatabase } from '../database/database.js'
import { UserDocumentRepository } from '../repositories/user-document.repository.js'
import {
  batchActionDocumentsSchema,
  listAdminDocumentsQuerySchema,
  listUserDocumentsQuerySchema,
  renameUserDocumentSchema,
  userDocumentParamsSchema,
  type BatchActionDocumentsBody,
  type ListAdminDocumentsQuery,
  type ListUserDocumentsQuery,
  type RenameUserDocumentBody,
  type UserDocumentParams
} from '../schemas/user-document.schemas.js'
import type { AuthService } from '../services/auth.service.js'
import { UserDocumentService } from '../services/user-document.service.js'

export function userDocumentRoutes(
  auth: AuthService,
  database: TransactionalDatabase,
  env: AppEnv
): FastifyPluginAsync {
  const controller = new UserDocumentController(
    auth,
    new UserDocumentService(new UserDocumentRepository(database), env)
  )

  return async (app) => {
    app.get<{ Querystring: ListUserDocumentsQuery }>('/my-documents', {
      schema: {
        tags: ['My documents'],
        summary: 'List personal documents belonging to the authenticated account',
        querystring: listUserDocumentsQuerySchema
      }
    }, request => controller.list(request))

    app.post('/my-documents', {
      schema: {
        tags: ['My documents'],
        summary: 'Upload DOCX or PDF personal document',
        consumes: ['multipart/form-data']
      }
    }, (request, reply) => controller.upload(request, reply))

    app.get<{ Params: UserDocumentParams }>('/my-documents/:documentId', {
      schema: {
        tags: ['My documents'],
        summary: 'Get details of a personal document',
        params: userDocumentParamsSchema
      }
    }, request => controller.get(request))

    app.patch<{ Params: UserDocumentParams; Body: RenameUserDocumentBody }>('/my-documents/:documentId', {
      schema: {
        tags: ['My documents'],
        summary: 'Rename display name of a personal document',
        params: userDocumentParamsSchema,
        body: renameUserDocumentSchema
      }
    }, request => controller.rename(request))

    app.delete<{ Params: UserDocumentParams }>('/my-documents/:documentId', {
      schema: {
        tags: ['My documents'],
        summary: 'Move personal document to trash (soft delete)',
        params: userDocumentParamsSchema
      }
    }, request => controller.delete(request))

    app.post<{ Params: UserDocumentParams }>('/my-documents/:documentId/restore', {
      schema: {
        tags: ['My documents'],
        summary: 'Restore personal document from trash',
        params: userDocumentParamsSchema
      }
    }, request => controller.restore(request))

    app.get<{ Params: UserDocumentParams; Querystring: { download?: string } }>('/my-documents/:documentId/file', {
      schema: {
        tags: ['My documents'],
        summary: 'View inline or download personal document',
        params: userDocumentParamsSchema
      }
    }, (request, reply) => controller.file(request, reply))

    // --- Admin Document Management Routes ---

    app.get<{ Querystring: ListAdminDocumentsQuery }>('/admin/documents', {
      schema: {
        tags: ['Administration Documents'],
        summary: 'List all user documents across system with search and statistics',
        querystring: listAdminDocumentsQuerySchema
      }
    }, request => controller.listAdmin(request))

    app.get<{ Params: UserDocumentParams }>('/admin/documents/:documentId', {
      schema: {
        tags: ['Administration Documents'],
        summary: 'Get document details including uploader information',
        params: userDocumentParamsSchema
      }
    }, request => controller.getAdmin(request))

    app.get<{ Params: UserDocumentParams; Querystring: { download?: string } }>('/admin/documents/:documentId/file', {
      schema: {
        tags: ['Administration Documents'],
        summary: 'View inline or download any user document as administrator',
        params: userDocumentParamsSchema
      }
    }, (request, reply) => controller.fileAdmin(request, reply))

    app.patch<{ Params: UserDocumentParams; Body: RenameUserDocumentBody }>('/admin/documents/:documentId', {
      schema: {
        tags: ['Administration Documents'],
        summary: 'Rename any user document as administrator',
        params: userDocumentParamsSchema,
        body: renameUserDocumentSchema
      }
    }, request => controller.renameAdmin(request))

    app.delete<{ Params: UserDocumentParams }>('/admin/documents/:documentId', {
      schema: {
        tags: ['Administration Documents'],
        summary: 'Move user document to trash as administrator',
        params: userDocumentParamsSchema
      }
    }, request => controller.deleteAdmin(request))

    app.post<{ Params: UserDocumentParams }>('/admin/documents/:documentId/restore', {
      schema: {
        tags: ['Administration Documents'],
        summary: 'Restore user document from trash as administrator',
        params: userDocumentParamsSchema
      }
    }, request => controller.restoreAdmin(request))

    app.delete<{ Params: UserDocumentParams }>('/admin/documents/:documentId/permanent', {
      schema: {
        tags: ['Administration Documents'],
        summary: 'Permanently delete user document and purge physical file as administrator',
        params: userDocumentParamsSchema
      }
    }, request => controller.permanentDeleteAdmin(request))

    app.post<{ Body: BatchActionDocumentsBody }>('/admin/documents/batch-action', {
      schema: {
        tags: ['Administration Documents'],
        summary: 'Batch trash, restore, or permanently delete documents',
        body: batchActionDocumentsSchema
      }
    }, request => controller.batchActionAdmin(request))
  }
}
