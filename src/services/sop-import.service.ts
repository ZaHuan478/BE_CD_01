import { createHash } from 'node:crypto'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { basename, extname, resolve } from 'node:path'
import { hasPermission } from '../auth/authorization.js'
import type { AuthPrincipal } from '../auth/types.js'
import { AppError, forbidden } from '../common/errors.js'
import { createId } from '../common/ids.js'
import type { AppEnv } from '../config/env.js'
import type { SopImportRepository } from '../repositories/sop-import.repository.js'
import type { SopImportUpload, UpdateSopImportBody } from '../schemas/sop-import.schemas.js'
import type { SopService } from './sop.service.js'
import { extractSopPreview } from './sop-import.extractor.js'
import { validateGraph } from './sop.service.js'

const DOCX_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

function validateFile(input: SopImportUpload, maxBytes: number): 'docx' | 'pdf' {
  if (!input.buffer.length) throw new AppError(400, 'EMPTY_UPLOAD', 'Tệp tải lên không có nội dung')
  if (input.buffer.length > maxBytes) throw new AppError(413, 'UPLOAD_TOO_LARGE', `Tệp vượt quá giới hạn ${Math.round(maxBytes / 1024 / 1024)} MB`)
  const extension = extname(input.fileName).toLocaleLowerCase()
  const isPdf = extension === '.pdf' && input.buffer.subarray(0, 5).toString('ascii') === '%PDF-'
  const isDocx = extension === '.docx' && input.buffer[0] === 0x50 && input.buffer[1] === 0x4b
  if (!isPdf && !isDocx) throw new AppError(400, 'UNSUPPORTED_DOCUMENT', 'Chỉ chấp nhận DOCX hoặc PDF hợp lệ')
  input.mediaType = isPdf ? 'application/pdf' : DOCX_TYPE
  return isPdf ? 'pdf' : 'docx'
}

export class SopImportService {
  constructor(
    private readonly repository: SopImportRepository,
    private readonly sopService: SopService | undefined,
    private readonly env: AppEnv
  ) {}

  async upload(principal: AuthPrincipal, input: SopImportUpload) {
    const permitted = hasPermission(principal, 'sop.create')
      || hasPermission(principal, 'sop.create', 'module', input.primaryModuleId)
    if (!permitted) throw forbidden('Permission sop.create is required for this module')
    const kind = validateFile(input, this.env.upload.maxBytes)
    const checksum = createHash('sha256').update(input.buffer).digest('hex')
    const duplicate = await this.repository.findDuplicate(checksum, principal.accountId)
    if (duplicate) throw new AppError(409, 'DUPLICATE_UPLOAD', `Tệp này đã được tải lên trong hồ sơ ${duplicate.id}`)

    const id = createId('import')
    const storageKey = `${id}.${kind}`
    const uploadDirectory = resolve(this.env.upload.directory)
    const storagePath = resolve(uploadDirectory, storageKey)
    await mkdir(uploadDirectory, { recursive: true })
    await writeFile(storagePath, input.buffer, { flag: 'wx' })
    try {
      const extracted = await extractSopPreview({ ...input, fileName: basename(input.fileName) })
      return await this.repository.create({
        id, fileName: basename(input.fileName), storageKey, mediaType: input.mediaType,
        fileSize: input.buffer.length, checksum, extractedText: extracted.extractedText,
        preview: extracted.preview, warnings: extracted.warnings, accountId: principal.accountId
      })
    } catch (error) {
      await rm(storagePath, { force: true })
      throw error
    }
  }

  list(principal: AuthPrincipal) {
    return principal.systemRole === 'ADMIN' ? this.repository.listAll() : this.repository.list(principal.accountId)
  }

  async get(principal: AuthPrincipal, id: string) {
    const item = await this.repository.get(id)
    if (item.createdBy !== principal.accountId && principal.systemRole !== 'ADMIN' && !hasPermission(principal, 'sop.review')) throw forbidden()
    return item
  }

  async update(principal: AuthPrincipal, id: string, body: UpdateSopImportBody) {
    validateGraph(body)
    const item = await this.get(principal, id)
    const moduleIds = [...new Set(body.moduleIds)]
    if (!moduleIds.includes(body.primaryModuleId)) throw new AppError(400, 'PRIMARY_MODULE_INVALID', 'Phân hệ chính phải nằm trong danh sách phân hệ')
    const permitted = hasPermission(principal, 'sop.create')
      || moduleIds.every((moduleId) => hasPermission(principal, 'sop.create', 'module', moduleId))
    if (!permitted || item.createdBy !== principal.accountId) throw forbidden()
    return this.repository.updatePreview(id, body, principal.accountId)
  }

  async accept(principal: AuthPrincipal, id: string) {
    const item = await this.get(principal, id)
    if (item.createdBy !== principal.accountId) throw forbidden()
    if (this.env.databaseModel === 'core8') {
      const created = await this.repository.acceptCore8(id, principal.accountId)
      return { import: await this.repository.get(id), sop: created }
    }
    if (!this.sopService) throw new Error('Legacy SOP service is not configured')
    const created = await this.sopService.create(principal, item.preview)
    await this.repository.accept(id, created.id, created.version.id, principal.accountId)
    return { import: await this.repository.get(id), sop: created }
  }

  async source(principal: AuthPrincipal, id: string) {
    const item = await this.get(principal, id)
    const buffer = await readFile(resolve(this.env.upload.directory, basename(item.storageKey)))
    return { buffer, fileName: item.file.name, mediaType: item.file.mediaType }
  }

  async publish(principal: AuthPrincipal, id: string) {
    if (principal.systemRole !== 'ADMIN') throw forbidden('Admin role is required to publish an imported SOP')
    const item = await this.repository.get(id)
    if (item.status !== 'accepted' || !item.targetVersionId) {
      throw new AppError(409, 'IMPORT_NOT_AWAITING_APPROVAL', 'Bản nhập chưa ở trạng thái chờ phê duyệt')
    }
    if (this.env.databaseModel === 'core8') {
      await this.repository.publishCore8(id, principal.accountId)
    } else {
      if (!this.sopService) throw new Error('Legacy SOP service is not configured')
      await this.sopService.submit(principal, item.targetVersionId)
      await this.sopService.publish(principal, item.targetVersionId)
      await this.repository.markPublished(id, principal.accountId)
    }
    return this.repository.get(id)
  }
}
