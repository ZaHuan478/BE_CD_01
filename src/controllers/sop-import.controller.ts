import type { FastifyReply, FastifyRequest } from 'fastify'
import { AppError } from '../common/errors.js'
import type { CreateDocumentConversionBody, ReviewSopImportBody, UpdateSopImportBody } from '../schemas/sop-import.schemas.js'
import type { AuthService } from '../services/auth.service.js'
import type { SopImportService } from '../services/sop-import.service.js'

interface ImportParams { importId: string }

function contentDisposition(fileName: string): string {
  const ascii = fileName.replace(/[^\x20-\x7E]+/g, '_').replace(/["\\]/g, '_')
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`
}

export class SopImportController {
  constructor(private readonly auth: AuthService, private readonly service: SopImportService) {}

  async createFromDocument(request: FastifyRequest<{ Body: CreateDocumentConversionBody }>, reply: FastifyReply) {
    const data = await this.service.createFromDocument(await this.auth.authenticate(request), request.body)
    return reply.code(201).send({ data, requestId: request.id })
  }

  async upload(request: FastifyRequest, reply: FastifyReply) {
    if (!request.isMultipart()) throw new AppError(415, 'MULTIPART_REQUIRED', 'Yêu cầu phải dùng multipart/form-data')
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
    if (!uploaded) throw new AppError(400, 'FILE_REQUIRED', 'Vui lòng chọn một tệp DOCX hoặc PDF')
    for (const name of ['code', 'title', 'primaryModuleId']) {
      if (!fields[name]?.trim()) throw new AppError(400, 'IMPORT_FIELD_REQUIRED', `Thiếu trường ${name}`)
    }
    const audienceModes = ['personal', 'department', 'job_title', 'department_job_title', 'module'] as const
    const audienceMode = fields.audienceMode
    if (audienceMode && !audienceModes.includes(audienceMode as typeof audienceModes[number])) {
      throw new AppError(400, 'AUDIENCE_MODE_INVALID', 'Phạm vi người xem tài liệu không hợp lệ')
    }
    const data = await this.service.upload(await this.auth.authenticate(request), {
      ...uploaded,
      code: fields.code!,
      title: fields.title!,
      category: fields.category,
      primaryModuleId: fields.primaryModuleId!,
      audienceMode: audienceMode as typeof audienceModes[number] | undefined
    })
    return reply.code(201).send({ data, requestId: request.id })
  }

  async list(request: FastifyRequest) {
    return { data: await this.service.list(await this.auth.authenticate(request)), requestId: request.id }
  }

  async get(request: FastifyRequest<{ Params: ImportParams }>) {
    return { data: await this.service.get(await this.auth.authenticate(request), request.params.importId), requestId: request.id }
  }

  async update(request: FastifyRequest<{ Params: ImportParams; Body: UpdateSopImportBody }>) {
    return { data: await this.service.update(await this.auth.authenticate(request), request.params.importId, request.body), requestId: request.id }
  }

  async flow(request: FastifyRequest<{ Params: ImportParams }>) {
    return { data: await this.service.flow(await this.auth.authenticate(request), request.params.importId), requestId: request.id }
  }

  async validateFlow(request: FastifyRequest<{ Params: ImportParams; Body: UpdateSopImportBody }>) {
    return { data: await this.service.validateFlow(await this.auth.authenticate(request), request.params.importId, request.body), requestId: request.id }
  }

  async delete(request: FastifyRequest<{ Params: ImportParams }>) {
    return { data: await this.service.delete(await this.auth.authenticate(request), request.params.importId), requestId: request.id }
  }

  async accept(request: FastifyRequest<{ Params: ImportParams }>, reply: FastifyReply) {
    const data = await this.service.accept(await this.auth.authenticate(request), request.params.importId)
    return reply.code(201).send({ data, requestId: request.id })
  }

  async revise(request: FastifyRequest<{ Params: ImportParams }>) {
    return { data: await this.service.revise(await this.auth.authenticate(request), request.params.importId) }
  }

  async archive(request: FastifyRequest<{ Params: ImportParams }>) {
    return { data: await this.service.archive(await this.auth.authenticate(request), request.params.importId) }
  }

  async review(request: FastifyRequest<{ Params: ImportParams; Body: ReviewSopImportBody }>) {
    return { data: await this.service.review(await this.auth.authenticate(request), request.params.importId, request.body.note), requestId: request.id }
  }
  async publish(request: FastifyRequest<{ Params: ImportParams }>) {
    return { data: await this.service.publish(await this.auth.authenticate(request), request.params.importId), requestId: request.id }
  }

  async source(request: FastifyRequest<{ Params: ImportParams }>, reply: FastifyReply) {
    const source = await this.service.source(await this.auth.authenticate(request), request.params.importId)
    return reply.header('content-type', source.mediaType)
      .header('cache-control', 'private, no-store')
      .header('x-content-type-options', 'nosniff')
      .header('content-disposition', contentDisposition(source.fileName))
      .send(source.buffer)
  }
}

