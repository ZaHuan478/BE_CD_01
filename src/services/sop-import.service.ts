import { createHash } from 'node:crypto'
import { DocumentStorage } from './document-storage.js'
import { basename, extname } from 'node:path'
import { hasPermission } from '../auth/authorization.js'
import type { AuthPrincipal } from '../auth/types.js'
import { AppError, forbidden } from '../common/errors.js'
import { createId } from '../common/ids.js'
import type { AppEnv } from '../config/env.js'
import type { SopImportRepository } from '../repositories/sop-import.repository.js'
import type { UserDocumentRepository } from '../repositories/user-document.repository.js'
import type { CreateDocumentConversionBody, SopImportUpload, UpdateSopImportBody } from '../schemas/sop-import.schemas.js'
import type { SopService } from './sop.service.js'
import { extractSopPreview } from './sop-import.extractor.js'
import { validateGraph } from './sop.service.js'
import { buildMermaidSource, inspectSopGraph } from './sop-flowchart.js'

const DOCX_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
type AudienceMode = NonNullable<SopImportUpload['audienceMode']>

function canDraftForModule(principal: AuthPrincipal, moduleId: string): boolean {
  return hasPermission(principal, 'sop.create')
    || hasPermission(principal, 'sop.create', 'module', moduleId)
    || hasPermission(principal, 'sop.read')
    || hasPermission(principal, 'sop.read', 'module', moduleId)
}

function resolveAudience(principal: AuthPrincipal, requested?: AudienceMode) {
  const departmentName = principal.organization.department?.trim() || null
  const jobTitle = principal.organization.jobTitle?.trim() || null
  let mode: AudienceMode = requested ?? (departmentName && jobTitle
    ? 'department_job_title'
    : departmentName ? 'department' : jobTitle ? 'job_title' : 'personal')
  if ((mode === 'department' || mode === 'department_job_title') && !departmentName) mode = jobTitle ? 'job_title' : 'personal'
  if ((mode === 'job_title' || mode === 'department_job_title') && !jobTitle) mode = departmentName ? 'department' : 'personal'
  return { mode, departmentName, jobTitle }
}

function audienceAllows(principal: AuthPrincipal, audience: { mode: AudienceMode; department: string | null; jobTitle: string | null }) {
  if (audience.mode === 'module') return true
  if (audience.mode === 'personal') return false
  const sameDepartment = Boolean(audience.department && principal.organization.department?.trim() === audience.department)
  const sameJobTitle = Boolean(audience.jobTitle && principal.organization.jobTitle?.trim() === audience.jobTitle)
  if (audience.mode === 'department') return sameDepartment
  if (audience.mode === 'job_title') return sameJobTitle
  return sameDepartment && sameJobTitle
}

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
    private readonly userDocumentRepository: UserDocumentRepository,
    private readonly sopService: SopService | undefined,
    private readonly env: AppEnv
  ) {}

  private get storage() { return new DocumentStorage(this.env) }

  async upload(principal: AuthPrincipal, input: SopImportUpload) {
    if (!canDraftForModule(principal, input.primaryModuleId)) {
      throw forbidden('Bạn cần quyền đọc phân hệ để tạo tài liệu nghiệp vụ cho phân hệ này')
    }
    const kind = validateFile(input, this.env.upload.maxBytes)
    const checksum = createHash('sha256').update(input.buffer).digest('hex')
    const duplicate = await this.repository.findDuplicate(checksum, principal.accountId)
    if (duplicate) throw new AppError(409, 'DUPLICATE_UPLOAD', `Tệp này đã được tải lên trong hồ sơ ${duplicate.id}`)

    const id = createId('import')
    const storageKey = await this.storage.put(`${id}.${kind}`, input.buffer)
    try {
      const extracted = await extractSopPreview({ ...input, fileName: basename(input.fileName) })
      const audience = resolveAudience(principal, input.audienceMode)
      return await this.repository.create({
        id, fileName: basename(input.fileName), storageKey, mediaType: input.mediaType,
        fileSize: input.buffer.length, checksum, extractedText: extracted.extractedText,
        preview: extracted.preview, warnings: extracted.warnings, accountId: principal.accountId,
        audienceMode: audience.mode, departmentName: audience.departmentName, jobTitle: audience.jobTitle
      })
    } catch (error) {
      await this.storage.remove(storageKey)
      throw error
    }
  }

  async createFromDocument(principal: AuthPrincipal, input: CreateDocumentConversionBody) {
    if (!canDraftForModule(principal, input.primaryModuleId)) {
      throw forbidden('Bạn cần quyền đọc phân hệ để chuyển hóa tài liệu cho phân hệ này')
    }

    const document = await this.userDocumentRepository.get(input.documentId, principal.accountId)
    if (document.deletedAt) {
      throw new AppError(409, 'SOURCE_DOCUMENT_DELETED', 'Tài liệu nguồn đang ở trong thùng rác')
    }

    const linked = await this.repository.findBySourceDocument(document.id, principal.accountId)
    if (linked) return linked

    if (document.sourceImportJobId) {
      try {
        const existing = await this.repository.get(document.sourceImportJobId)
        if (existing.createdBy === principal.accountId) {
          return this.repository.linkSourceDocument(document.id, existing.id, principal.accountId)
        }
      } catch {
        // A stale legacy link is repaired by creating a new conversion below.
      }
    }

    const duplicate = await this.repository.findDuplicate(document.checksum, principal.accountId)
    if (duplicate?.storageKey === document.storageKey) {
      return this.repository.linkSourceDocument(document.id, duplicate.id, principal.accountId)
    }

    const buffer = await this.storage.read(document.storageKey)
    const upload: SopImportUpload = {
      buffer,
      fileName: document.originalFileName,
      mediaType: document.mediaType,
      code: input.code,
      title: input.title,
      category: input.category,
      primaryModuleId: input.primaryModuleId,
      audienceMode: input.audienceMode
    }
    validateFile(upload, this.env.upload.maxBytes)
    const extracted = await extractSopPreview({ ...upload, fileName: basename(upload.fileName) })
    const audience = resolveAudience(principal, upload.audienceMode)
    return this.repository.create({
      id: createId('import'),
      fileName: basename(upload.fileName),
      storageKey: document.storageKey,
      mediaType: upload.mediaType,
      fileSize: document.fileSize,
      checksum: document.checksum,
      extractedText: extracted.extractedText,
      preview: extracted.preview,
      warnings: extracted.warnings,
      accountId: principal.accountId,
      audienceMode: audience.mode,
      departmentName: audience.departmentName,
      jobTitle: audience.jobTitle,
      sourceDocumentId: document.id
    })
  }

  async list(principal: AuthPrincipal) {
    if (['ADMIN', 'SUPER_ADMIN'].includes(principal.systemRole)) return this.repository.listAll()
    const items = await this.repository.listForActor(
      principal.accountId,
      principal.organization.department?.trim() || null,
      principal.organization.jobTitle?.trim() || null
    )
    const currentItems = this.env.databaseModel === 'core8'
      ? await Promise.all(items.map(async item => ({ item, current: await this.repository.isCurrentPublished(item.targetSopId, item.targetVersionId) })))
      : items.map(item => ({ item, current: item.status === 'published' }))
    return currentItems.filter(({ item, current }) => item.createdBy === principal.accountId
      || (item.targetSopId && (hasPermission(principal, 'sop.review', 'sop', item.targetSopId) || hasPermission(principal, 'sop.publish', 'sop', item.targetSopId)))
      || hasPermission(principal, 'sop.review')
      || hasPermission(principal, 'sop.publish')
      || (item.status === 'published' && current && audienceAllows(principal, item.audience)
        && item.preview.moduleIds.some(moduleId => hasPermission(principal, 'sop.read') || hasPermission(principal, 'sop.read', 'module', moduleId)))).map(({ item }) => item)
  }

  async get(principal: AuthPrincipal, id: string) {
    const item = await this.repository.get(id)
    const current = this.env.databaseModel !== 'core8' || await this.repository.isCurrentPublished(item.targetSopId, item.targetVersionId)
    const scopedRead = item.status === 'published' && current && item.targetSopId ? hasPermission(principal, 'sop.read', 'sop', item.targetSopId) : false
    const scopedReview = item.targetSopId ? hasPermission(principal, 'sop.review', 'sop', item.targetSopId) || hasPermission(principal, 'sop.publish', 'sop', item.targetSopId) : false
    const sharedRead = item.status === 'published' && current && audienceAllows(principal, item.audience)
      && item.preview.moduleIds.some(moduleId => hasPermission(principal, 'sop.read') || hasPermission(principal, 'sop.read', 'module', moduleId))
    if (item.createdBy !== principal.accountId && !['ADMIN', 'SUPER_ADMIN'].includes(principal.systemRole) && !hasPermission(principal, 'sop.review') && !hasPermission(principal, 'sop.publish') && !scopedRead && !scopedReview && !sharedRead) throw forbidden()
    return item
  }

  async update(principal: AuthPrincipal, id: string, body: UpdateSopImportBody) {
    validateGraph(body)
    const item = await this.get(principal, id)
    const moduleIds = [...new Set(body.moduleIds)]
    if (!moduleIds.includes(body.primaryModuleId)) throw new AppError(400, 'PRIMARY_MODULE_INVALID', 'Phân hệ chính phải nằm trong danh sách phân hệ')
    const permitted = moduleIds.every((moduleId) => canDraftForModule(principal, moduleId))
    if (!permitted || item.createdBy !== principal.accountId) throw forbidden()
    return this.repository.updatePreview(id, body, principal.accountId)
  }

  async flow(principal: AuthPrincipal, id: string) {
    const item = await this.get(principal, id)
    return {
      steps: item.preview.steps,
      transitions: item.preview.transitions,
      mermaid: buildMermaidSource(item.preview),
      validation: inspectSopGraph(item.preview)
    }
  }

  async validateFlow(principal: AuthPrincipal, id: string, body: UpdateSopImportBody) {
    await this.get(principal, id)
    return {
      mermaid: buildMermaidSource(body),
      validation: inspectSopGraph(body)
    }
  }

  async delete(principal: AuthPrincipal, id: string) {
    const item = await this.get(principal, id)
    if (item.createdBy !== principal.accountId) throw forbidden('Chỉ người tạo mới có thể xóa bản nháp này')
    if (item.status === 'accepted') {
      this.requireCore8()
      await this.repository.withdrawCore8(id, principal.accountId)
    }
    const deleted = await this.repository.deleteDraft(id, principal.accountId)
    if (!deleted.sourceDocumentId) await this.storage.remove(deleted.storageKey)
    return { id }
  }

  private requireCore8() {
    if (this.env.databaseModel !== 'core8') throw new AppError(409, 'CORE8_REQUIRED', 'Chức năng vòng đời tài liệu này yêu cầu database core8')
  }

  async revise(principal: AuthPrincipal, id: string) {
    this.requireCore8()
    const item = await this.get(principal, id)
    if (item.createdBy !== principal.accountId) throw forbidden('Chỉ người tạo mới có thể tạo bản chỉnh sửa từ hồ sơ này')
    if (item.status === 'accepted') return this.repository.withdrawCore8(id, principal.accountId)
    if (!['published', 'archived'].includes(item.status)) throw new AppError(409, 'IMPORT_NOT_REVISIONABLE', 'Bản nháp hiện tại đã có thể chỉnh sửa')
    const source = await this.source(principal, id)
    const revisionId = createId('import')
    const storageKey = await this.storage.put(`${revisionId}${extname(item.file.name)}`, source.buffer)
    try {
      return await this.repository.create({
        id: revisionId, storageKey, fileName: item.file.name, mediaType: item.file.mediaType,
        fileSize: source.buffer.length, checksum: item.file.checksum, extractedText: item.extractedText,
        preview: { ...item.preview, changeLog: `Chỉnh sửa từ hồ sơ ${id}, phiên bản ${item.targetVersionId ?? ''}` },
        warnings: [...item.warnings, 'Bản chỉnh sửa giữ file nguồn cũ để đối chiếu. Nội dung hiệu chỉnh sẽ được duyệt lại.'],
        accountId: principal.accountId, audienceMode: item.audience.mode,
        departmentName: item.audience.department, jobTitle: item.audience.jobTitle
      })
    } catch (error) { await this.storage.remove(storageKey); throw error }
  }

  async archive(principal: AuthPrincipal, id: string) {
    this.requireCore8()
    const item = await this.get(principal, id)
    if (item.createdBy !== principal.accountId && !hasPermission(principal, 'sop.archive')
      && !(item.targetSopId && hasPermission(principal, 'sop.archive', 'sop', item.targetSopId))) throw forbidden()
    return this.repository.archiveCore8(id, principal.accountId)
  }

  async accept(principal: AuthPrincipal, id: string) {
    const item = await this.get(principal, id)
    if (item.createdBy !== principal.accountId) throw forbidden()
    if (this.env.databaseModel === 'core8') {
      if (!hasPermission(principal, 'sop.edit') && !await this.repository.canReviseCode(item.preview.code, principal.accountId)) {
        throw forbidden('Mã SOP đã tồn tại; cần quyền Owner hoặc Editor của SOP để tạo phiên bản mới')
      }
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
    const buffer = await this.storage.read(item.storageKey)
    return { buffer, fileName: item.file.name, mediaType: item.file.mediaType }
  }

  async review(principal: AuthPrincipal, id: string, note?: string) {
    const item = await this.repository.get(id)
    const canReview = hasPermission(principal, 'sop.review') || (item.targetSopId ? hasPermission(principal, 'sop.review', 'sop', item.targetSopId) : false)
    if (!canReview) throw forbidden('Quyền Reviewer của SOP là bắt buộc để xác nhận rà soát')
    return this.repository.review(id, principal.accountId, note)
  }
  async publish(principal: AuthPrincipal, id: string) {
    const item = await this.repository.get(id)
    const canPublish = hasPermission(principal, 'sop.publish') || (item.targetSopId ? hasPermission(principal, 'sop.publish', 'sop', item.targetSopId) : false)
    if (!canPublish) throw forbidden('Quyền phê duyệt SOP là bắt buộc để công bố tài liệu')
    const governance = await this.repository.governanceSettings()
    if (governance.requireReviewBeforePublish && !item.reviewedAt) throw new AppError(409, 'SOP_REVIEW_REQUIRED', 'SOP phải được Reviewer xác nhận trước khi công bố')
    if (!governance.allowOwnerSelfApproval && item.createdBy === principal.accountId) throw new AppError(409, 'SOP_SELF_APPROVAL_FORBIDDEN', 'Owner không được tự phê duyệt SOP theo cấu hình hiện tại')
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




