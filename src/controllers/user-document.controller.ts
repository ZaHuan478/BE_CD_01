import type { FastifyReply, FastifyRequest } from 'fastify'
import { AppError } from '../common/errors.js'
import type {
  BatchActionDocumentsBody,
  ListAdminDocumentsQuery,
  ListUserDocumentsQuery,
  RenameUserDocumentBody,
  UserDocumentParams
} from '../schemas/user-document.schemas.js'
import type { AuthService } from '../services/auth.service.js'
import type { UserDocumentService } from '../services/user-document.service.js'

function contentDisposition(fileName: string, isDownload = false): string {
  const ascii = fileName.replace(/[^\x20-\x7E]+/g, '_').replace(/["\\]/g, '_')
  const disposition = isDownload ? 'attachment' : 'inline'
  return `${disposition}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`
}

export class UserDocumentController {
  constructor(
    private readonly auth: AuthService,
    private readonly service: UserDocumentService
  ) {}

  async upload(request: FastifyRequest, reply: FastifyReply) {
    if (!request.isMultipart()) {
      throw new AppError(415, 'MULTIPART_REQUIRED', 'Yêu cầu phải dùng multipart/form-data')
    }
    const fields: Record<string, string> = {}
    let uploaded: { fileName: string; mediaType: string; buffer: Buffer } | null = null

    for await (const part of request.parts()) {
      if (part.type === 'file') {
        if (part.fieldname !== 'file' || uploaded) {
          part.file.resume()
          continue
        }
        uploaded = { fileName: part.filename, mediaType: part.mimetype, buffer: await part.toBuffer() }
      } else {
        fields[part.fieldname] = String(part.value)
      }
    }

    if (!uploaded) {
      throw new AppError(400, 'FILE_REQUIRED', 'Vui lòng chọn một tệp DOCX hoặc PDF')
    }

    const principal = await this.auth.authenticate(request)
    const data = await this.service.upload(principal, {
      fileName: uploaded.fileName,
      buffer: uploaded.buffer,
      displayName: fields.displayName || fields.name
    })

    return reply.code(201).send({ data, requestId: request.id })
  }

  async list(request: FastifyRequest<{ Querystring: ListUserDocumentsQuery }>) {
    const principal = await this.auth.authenticate(request)
    const data = await this.service.list(principal, request.query)
    return { data, requestId: request.id }
  }

  async get(request: FastifyRequest<{ Params: UserDocumentParams }>) {
    const principal = await this.auth.authenticate(request)
    const data = await this.service.get(principal, request.params.documentId)
    return { data, requestId: request.id }
  }

  async rename(request: FastifyRequest<{ Params: UserDocumentParams; Body: RenameUserDocumentBody }>) {
    const principal = await this.auth.authenticate(request)
    const data = await this.service.rename(principal, request.params.documentId, request.body.displayName)
    return { data, requestId: request.id }
  }

  async delete(request: FastifyRequest<{ Params: UserDocumentParams }>) {
    const principal = await this.auth.authenticate(request)
    const data = await this.service.delete(principal, request.params.documentId)
    return { data, requestId: request.id }
  }

  async restore(request: FastifyRequest<{ Params: UserDocumentParams }>) {
    const principal = await this.auth.authenticate(request)
    const data = await this.service.restore(principal, request.params.documentId)
    return { data, requestId: request.id }
  }

  async file(
    request: FastifyRequest<{ Params: UserDocumentParams; Querystring: { download?: string } }>,
    reply: FastifyReply
  ) {
    const principal = await this.auth.authenticate(request)
    const fileData = await this.service.file(principal, request.params.documentId)
    const isDownload = request.query?.download === 'true' || request.query?.download === '1'
    const fileName = fileData.displayName || fileData.fileName

    return reply
      .header('content-type', fileData.mediaType)
      .header('cache-control', 'private, no-store')
      .header('x-content-type-options', 'nosniff')
      .header('content-disposition', contentDisposition(fileName, isDownload))
      .send(fileData.buffer)
  }

  // --- Admin endpoints ---

  async listAdmin(request: FastifyRequest<{ Querystring: ListAdminDocumentsQuery }>) {
    const principal = await this.auth.authenticate(request)
    const data = await this.service.listAdmin(principal, request.query)
    return { data, requestId: request.id }
  }

  async getAdmin(request: FastifyRequest<{ Params: UserDocumentParams }>) {
    const principal = await this.auth.authenticate(request)
    const data = await this.service.getAdmin(principal, request.params.documentId)
    return { data, requestId: request.id }
  }

  async fileAdmin(
    request: FastifyRequest<{ Params: UserDocumentParams; Querystring: { download?: string } }>,
    reply: FastifyReply
  ) {
    const principal = await this.auth.authenticate(request)
    const fileData = await this.service.fileAdmin(principal, request.params.documentId)
    const isDownload = request.query?.download === 'true' || request.query?.download === '1'
    const fileName = fileData.displayName || fileData.fileName

    return reply
      .header('content-type', fileData.mediaType)
      .header('cache-control', 'private, no-store')
      .header('x-content-type-options', 'nosniff')
      .header('content-disposition', contentDisposition(fileName, isDownload))
      .send(fileData.buffer)
  }

  async renameAdmin(request: FastifyRequest<{ Params: UserDocumentParams; Body: RenameUserDocumentBody }>) {
    const principal = await this.auth.authenticate(request)
    const data = await this.service.renameAdmin(principal, request.params.documentId, request.body.displayName)
    return { data, requestId: request.id }
  }

  async deleteAdmin(request: FastifyRequest<{ Params: UserDocumentParams }>) {
    const principal = await this.auth.authenticate(request)
    const data = await this.service.deleteAdmin(principal, request.params.documentId)
    return { data, requestId: request.id }
  }

  async restoreAdmin(request: FastifyRequest<{ Params: UserDocumentParams }>) {
    const principal = await this.auth.authenticate(request)
    const data = await this.service.restoreAdmin(principal, request.params.documentId)
    return { data, requestId: request.id }
  }

  async permanentDeleteAdmin(request: FastifyRequest<{ Params: UserDocumentParams }>) {
    const principal = await this.auth.authenticate(request)
    const data = await this.service.permanentDeleteAdmin(principal, request.params.documentId)
    return { data, requestId: request.id }
  }

  async batchActionAdmin(request: FastifyRequest<{ Body: BatchActionDocumentsBody }>) {
    const principal = await this.auth.authenticate(request)
    const data = await this.service.batchActionAdmin(principal, request.body.action, request.body.documentIds)
    return { data, requestId: request.id }
  }
}
