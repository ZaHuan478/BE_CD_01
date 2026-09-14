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
import type { CreateDocumentConversionBody, SopImportUpload, UpdateSopImportBody, UpdateMediaBody, CropMediaBody } from '../schemas/sop-import.schemas.js'
import type { SopService } from './sop.service.js'
import { extractSopPreview } from './sop-import.extractor.js'
import { validateGraph } from './sop.service.js'
import { buildMermaidSource, inspectSopGraph } from './sop-flowchart.js'
import type { IndexingService } from './rag/indexing.service.js'
import type { StepInput, SourceMedia, StepMedia } from '../schemas/sop.schemas.js'
import { extractAndUploadMedia } from './sop-media-extractor.js'
import { assignMediaToSteps } from './sop-media-assignment.js'
import { PDFParse } from 'pdf-parse'

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

function mergeStepEnrichment(previous: StepInput[], extracted: StepInput[]): StepInput[] {
  const byStableKey = new Map(previous.map(step => [step.stableKey, step]))
  const byTitle = new Map(previous.map(step => [step.title.trim().toLocaleLowerCase('vi'), step]))
  return extracted.map(step => {
    const old = byStableKey.get(step.stableKey) ?? byTitle.get(step.title.trim().toLocaleLowerCase('vi'))
    if (!old) return step
    return {
      ...step,
      actor: old.actor || step.actor,
      location: old.location || step.location,
      timing: old.timing || step.timing,
      imageUrl: old.imageUrl || step.imageUrl,
      illustrationPreset: old.illustrationPreset || step.illustrationPreset,
      media: old.media?.length ? old.media : step.media,
      inputs: old.inputs?.length ? old.inputs : step.inputs,
      outputs: old.outputs?.length ? old.outputs : step.outputs,
      positionX: old.positionX,
      positionY: old.positionY
    }
  })
}

export class SopImportService {
  constructor(
    private readonly repository: SopImportRepository,
    private readonly userDocumentRepository: UserDocumentRepository,
    private readonly sopService: SopService | undefined,
    private readonly env: AppEnv,
    private readonly indexingService?: IndexingService,
    private readonly documentStorage?: DocumentStorage
  ) {}

  private get storage() { return this.documentStorage ?? new DocumentStorage(this.env) }

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
      const extracted = await extractSopPreview({
        ...input,
        importId: id,
        storage: this.storage,
        fileName: basename(input.fileName)
      })
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
    const id = createId('import')
    const extracted = await extractSopPreview({
      ...upload,
      importId: id,
      storage: this.storage,
      fileName: basename(upload.fileName)
    })
    const audience = resolveAudience(principal, upload.audienceMode)
    return this.repository.create({
      id,
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

  async reprocess(principal: AuthPrincipal, id: string) {
    const item = await this.get(principal, id)
    if (item.createdBy !== principal.accountId) throw forbidden('Chỉ người tạo mới có thể phân tích lại tài liệu nguồn')
    if (item.status !== 'needs_review') {
      throw new AppError(409, 'IMPORT_NOT_EDITABLE', 'SOP đã gửi duyệt hoặc công bố; hãy tạo bản chỉnh sửa trước khi phân tích lại')
    }
    const buffer = await this.storage.read(item.storageKey)
    const extracted = await extractSopPreview({
      buffer,
      mediaType: item.file.mediaType,
      fileName: item.file.name,
      code: item.preview.code,
      title: item.preview.title,
      category: item.preview.category ?? undefined,
      primaryModuleId: item.preview.primaryModuleId,
      importId: id,
      storage: this.storage,
      previousSteps: item.preview.steps
    })
    const preview = {
      ...extracted.preview,
      moduleIds: item.preview.moduleIds,
      primaryModuleId: item.preview.primaryModuleId,
      steps: mergeStepEnrichment(item.preview.steps, extracted.preview.steps)
    }
    return this.repository.replaceDraftExtraction(id, {
      extractedText: extracted.extractedText,
      preview,
      warnings: extracted.warnings,
      accountId: principal.accountId
    })
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
    if (item.preview.sourceStructure?.media) {
      for (const media of item.preview.sourceStructure.media) {
        try {
          await this.storage.removeMedia(media.storageKey)
        } catch {
          // ignore cleanup errors
        }
      }
    }
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
    const revisionId = createId('import')
    // A conversion created from “Tài liệu của tôi” shares the source object's
    // storage key. Keep that relationship on the revision so the document list
    // opens the latest editable import instead of the already-published one.
    // Standalone uploads still receive an independent storage object.
    const sharesSourceDocument = Boolean(item.sourceDocumentId)
    const source = sharesSourceDocument ? null : await this.source(principal, id)
    const storageKey = source
      ? await this.storage.put(`${revisionId}${extname(item.file.name)}`, source.buffer)
      : item.storageKey
    try {
      return await this.repository.create({
        id: revisionId, storageKey, fileName: item.file.name, mediaType: item.file.mediaType,
        fileSize: source?.buffer.length ?? item.file.size, checksum: item.file.checksum, extractedText: item.extractedText,
        preview: { ...item.preview, changeLog: `Chỉnh sửa từ hồ sơ ${id}, phiên bản ${item.targetVersionId ?? ''}` },
        warnings: [...item.warnings, 'Bản chỉnh sửa giữ file nguồn cũ để đối chiếu. Nội dung hiệu chỉnh sẽ được duyệt lại.'],
        accountId: principal.accountId, audienceMode: item.audience.mode,
        departmentName: item.audience.department, jobTitle: item.audience.jobTitle,
        sourceDocumentId: item.sourceDocumentId
      })
    } catch (error) {
      if (!sharesSourceDocument) await this.storage.remove(storageKey)
      throw error
    }
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
    const published = await this.repository.get(id)
    // This only writes a local pending status. Embeddings are created later by
    // an explicit administrator re-index action.
    if (published.targetSopId && this.indexingService) {
      try { await this.indexingService.markPending(published.targetSopId, 'auto_publish') } catch { /* reconcile from admin */ }
    }
    return published
  }

  async getMedia(principal: AuthPrincipal, id: string) {
    const item = await this.get(principal, id)
    const allMedia: SourceMedia[] = item.preview.sourceStructure?.media ?? []
    const steps = item.preview.steps ?? []

    const mediaToStep = new Map<string, { stepStableKey: string; stepTitle: string }>()
    for (const s of steps) {
      const key = s.stableKey || s.title
      if (s.media) {
        for (const sm of s.media) {
          if (sm.sourceMediaId) {
            mediaToStep.set(sm.sourceMediaId, { stepStableKey: key, stepTitle: s.title })
          }
        }
      }
    }

    const assigned = allMedia
      .filter(m => m.assignmentStatus === 'assigned' || mediaToStep.has(m.id))
      .map(m => {
        const stepInfo = mediaToStep.get(m.id)
        return {
          ...m,
          previewUrl: `/api/v1/sop-imports/${id}/media/${m.id}/preview`,
          stepStableKey: stepInfo?.stepStableKey,
          stepTitle: stepInfo?.stepTitle
        }
      })

    const unassigned = allMedia
      .filter(m => m.assignmentStatus !== 'assigned' && m.assignmentStatus !== 'ignored' && !mediaToStep.has(m.id))
      .map(m => ({
        ...m,
        previewUrl: `/api/v1/sop-imports/${id}/media/${m.id}/preview`
      }))

    const ignored = allMedia
      .filter(m => m.assignmentStatus === 'ignored')
      .map(m => ({
        ...m,
        previewUrl: `/api/v1/sop-imports/${id}/media/${m.id}/preview`
      }))

    return {
      media: allMedia.map(m => ({
        ...m,
        previewUrl: `/api/v1/sop-imports/${id}/media/${m.id}/preview`
      })),
      assigned,
      unassigned,
      ignored
    }
  }

  async getMediaPreview(principal: AuthPrincipal, id: string, mediaId: string) {
    const item = await this.get(principal, id)
    const media = item.preview.sourceStructure?.media?.find(m => m.id === mediaId)
    if (!media) {
      let fallbackStorageKey: string | undefined
      for (const step of item.preview.steps ?? []) {
        const sm = step.media?.find(m => m.id === mediaId || m.sourceMediaId === mediaId)
        if (sm) {
          fallbackStorageKey = sm.storageKey
          break
        }
      }
      if (!fallbackStorageKey) throw new AppError(404, 'MEDIA_NOT_FOUND', 'Không tìm thấy hình ảnh')
      const buffer = await this.storage.readMedia(fallbackStorageKey)
      return { buffer, mimeType: 'image/png' }
    }
    const buffer = await this.storage.readMedia(media.storageKey)
    return { buffer, mimeType: media.mimeType }
  }

  async updateMedia(principal: AuthPrincipal, id: string, mediaId: string, body: UpdateMediaBody) {
    const item = await this.get(principal, id)
    if (item.createdBy !== principal.accountId && !['ADMIN', 'SUPER_ADMIN'].includes(principal.systemRole)) {
      throw forbidden('Chỉ người tạo mới có thể chỉnh sửa hình ảnh')
    }
    if (item.status !== 'needs_review') {
      throw new AppError(409, 'IMPORT_NOT_EDITABLE', 'SOP đã gửi duyệt hoặc công bố; không thể chỉnh sửa')
    }

    const allMedia = [...(item.preview.sourceStructure?.media ?? [])]
    const mediaIndex = allMedia.findIndex(m => m.id === mediaId)
    if (mediaIndex < 0 || !allMedia[mediaIndex]) {
      throw new AppError(404, 'MEDIA_NOT_FOUND', 'Không tìm thấy hình ảnh')
    }
    const targetMedia: SourceMedia = { ...allMedia[mediaIndex]! }

    if (body.caption !== undefined) {
      targetMedia.caption = body.caption || undefined
    }

    if (body.isIgnored === true) {
      targetMedia.assignmentStatus = 'ignored'
    } else if (body.isIgnored === false && targetMedia.assignmentStatus === 'ignored') {
      targetMedia.assignmentStatus = 'unassigned'
    }

    let steps = [...(item.preview.steps ?? [])]

    if (body.targetStepStableKey !== undefined) {
      if (body.targetStepStableKey === null) {
        steps = steps.map(s => {
          const filtered = (s.media ?? []).filter(m => m.sourceMediaId !== mediaId && m.id !== mediaId)
          const newCover = filtered.find(m => m.role === 'cover')
          return {
            ...s,
            media: filtered,
            imageUrl: newCover ? (newCover.url || `/api/v1/sop-imports/${id}/media/${newCover.sourceMediaId || newCover.id}/preview`) : (s.imageUrl?.includes(mediaId) ? undefined : s.imageUrl)
          }
        })
        targetMedia.assignmentStatus = targetMedia.assignmentStatus === 'ignored' ? 'ignored' : 'unassigned'
      } else {
        const targetStepKey = body.targetStepStableKey
        steps = steps.map(s => {
          const key = s.stableKey || s.title
          if (key === targetStepKey) {
            let mediaList = [...(s.media ?? [])]
            const existingIdx = mediaList.findIndex(m => m.sourceMediaId === mediaId || m.id === mediaId)
            const existing = existingIdx >= 0 ? mediaList[existingIdx] : undefined
            const role = body.role ?? (body.setAsCover ? 'cover' : (existing ? existing.role : (mediaList.length === 0 ? 'cover' : 'illustration')))
            if (role === 'cover' || body.setAsCover) {
              mediaList = mediaList.map(m => m.role === 'cover' ? { ...m, role: 'illustration' as const } : m)
            }
            const updatedStepMedia: StepMedia = {
              id: existing ? existing.id : createId('smed'),
              sourceMediaId: mediaId,
              storageKey: targetMedia.storageKey,
              url: `/api/v1/sop-imports/${id}/media/${mediaId}/preview`,
              caption: body.caption !== undefined ? (body.caption || undefined) : targetMedia.caption,
              role: (role === 'cover' || body.setAsCover) ? 'cover' : role,
              sourcePage: targetMedia.page,
              sortOrder: body.sortOrder ?? (existing ? existing.sortOrder : mediaList.length + 1),
              confidence: targetMedia.confidence
            }
            if (existingIdx >= 0) {
              mediaList[existingIdx] = updatedStepMedia
            } else {
              mediaList.push(updatedStepMedia)
            }
            const coverMedia = mediaList.find(m => m.role === 'cover')
            return {
              ...s,
              media: mediaList,
              imageUrl: coverMedia ? (coverMedia.url || `/api/v1/sop-imports/${id}/media/${coverMedia.sourceMediaId || coverMedia.id}/preview`) : s.imageUrl
            }
          } else {
            const filtered = (s.media ?? []).filter(m => m.sourceMediaId !== mediaId && m.id !== mediaId)
            const newCover = filtered.find(m => m.role === 'cover')
            return {
              ...s,
              media: filtered,
              imageUrl: newCover ? (newCover.url || `/api/v1/sop-imports/${id}/media/${newCover.sourceMediaId || newCover.id}/preview`) : (s.imageUrl?.includes(mediaId) ? undefined : s.imageUrl)
            }
          }
        })
        targetMedia.assignmentStatus = 'assigned'
      }
    } else {
      steps = steps.map(s => {
        const mediaList = [...(s.media ?? [])]
        const existingIdx = mediaList.findIndex(m => m.sourceMediaId === mediaId || m.id === mediaId)
        if (existingIdx >= 0) {
          let updatedList = [...mediaList]
          const existing = updatedList[existingIdx]
          if (existing) {
            const role = body.role ?? (body.setAsCover ? 'cover' : existing.role)
            if (role === 'cover' || body.setAsCover) {
              updatedList = updatedList.map(m => m.role === 'cover' ? { ...m, role: 'illustration' as const } : m)
            }
            updatedList[existingIdx] = {
              id: existing.id,
              sourceMediaId: existing.sourceMediaId,
              storageKey: existing.storageKey,
              url: existing.url,
              sourcePage: existing.sourcePage,
              sourceSubPath: existing.sourceSubPath,
              confidence: existing.confidence,
              caption: body.caption !== undefined ? (body.caption || undefined) : existing.caption,
              role: (role === 'cover' || body.setAsCover) ? 'cover' : role,
              sortOrder: body.sortOrder ?? existing.sortOrder
            }
          }
          const coverMedia = updatedList.find(m => m.role === 'cover')
          return {
            ...s,
            media: updatedList,
            imageUrl: coverMedia ? (coverMedia.url || `/api/v1/sop-imports/${id}/media/${coverMedia.sourceMediaId || coverMedia.id}/preview`) : s.imageUrl
          }
        }
        return s
      })
    }

    allMedia[mediaIndex] = targetMedia

    const sourceStructure = item.preview.sourceStructure
      ? { ...item.preview.sourceStructure, media: allMedia }
      : undefined

    const updatedPreview = {
      ...item.preview,
      steps,
      sourceStructure
    }

    await this.repository.updatePreview(id, updatedPreview, principal.accountId)
    return this.get(principal, id)
  }

  async cropMedia(principal: AuthPrincipal, id: string, body: CropMediaBody) {
    const item = await this.get(principal, id)
    if (item.createdBy !== principal.accountId && !['ADMIN', 'SUPER_ADMIN'].includes(principal.systemRole)) {
      throw forbidden('Chỉ người tạo mới có thể cắt ảnh từ tài liệu nguồn')
    }
    if (item.status !== 'needs_review') {
      throw new AppError(409, 'IMPORT_NOT_EDITABLE', 'SOP đã gửi duyệt hoặc công bố; không thể chỉnh sửa')
    }

    let imageBuffer: Buffer
    let mimeType = 'image/png'

    if (body.imageDataUrl) {
      const match = body.imageDataUrl.match(/^data:image\/([a-zA-Z0-9+]+);base64,(.+)$/)
      if (!match || !match[1] || !match[2]) throw new AppError(400, 'INVALID_IMAGE_DATA', 'Dữ liệu ảnh không hợp lệ')
      mimeType = `image/${match[1]}`
      imageBuffer = Buffer.from(match[2], 'base64')
    } else {
      const fileBuffer = await this.storage.read(item.storageKey)
      const parser = new PDFParse(fileBuffer)
      try {
        const shot = await parser.getScreenshot({ partial: [body.page], imageBuffer: true, scale: 2.0 })
        const pageShot = shot.pages?.[0]
        if (!pageShot || !pageShot.data) throw new AppError(400, 'CROP_PAGE_FAILED', `Không thể trích xuất trang ${body.page}`)
        const { createCanvas, loadImage } = await import('@napi-rs/canvas')
        const fullImage = await loadImage(pageShot.data)
        const scaleX = fullImage.width / (pageShot.width || fullImage.width)
        const scaleY = fullImage.height / (pageShot.height || fullImage.height)
        const sx = body.boundingBox.x * scaleX
        const sy = body.boundingBox.y * scaleY
        const sw = body.boundingBox.width * scaleX
        const sh = body.boundingBox.height * scaleY
        const canvas = createCanvas(Math.max(1, Math.round(sw)), Math.max(1, Math.round(sh)))
        const ctx = canvas.getContext('2d')
        ctx.drawImage(fullImage, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height)
        imageBuffer = canvas.toBuffer('image/png')
      } finally {
        await parser.destroy().catch(() => {})
      }
    }

    const cropId = createId('crop')
    const checksum = createHash('sha256').update(imageBuffer).digest('hex')
    const ext = mimeType === 'image/jpeg' ? 'jpg' : 'png'
    const { storageKey } = await this.storage.putMedia(id, cropId, ext, imageBuffer, mimeType)

    const sourceMedia: SourceMedia = {
      id: cropId,
      kind: 'page_crop',
      page: body.page,
      boundingBox: body.boundingBox,
      storageKey,
      mimeType,
      checksum,
      caption: body.caption,
      sortOrder: (item.preview.sourceStructure?.media?.length ?? 0) + 1,
      confidence: 1.0,
      assignmentStatus: 'assigned'
    }

    const stepMedia: StepMedia = {
      id: createId('smed'),
      sourceMediaId: cropId,
      storageKey,
      url: `/api/v1/sop-imports/${id}/media/${cropId}/preview`,
      caption: body.caption,
      role: body.role || 'illustration',
      sourcePage: body.page,
      sortOrder: 1,
      confidence: 1.0
    }

    const steps = item.preview.steps.map(s => {
      const key = s.stableKey || s.title
      if (key === body.targetStepStableKey) {
        let mediaList = [...(s.media ?? [])]
        if (stepMedia.role === 'cover') {
          mediaList = mediaList.map(m => m.role === 'cover' ? { ...m, role: 'illustration' as const } : m)
        }
        mediaList.push(stepMedia)
        return {
          ...s,
          media: mediaList,
          imageUrl: stepMedia.role === 'cover' ? stepMedia.url : s.imageUrl
        }
      }
      return s
    })

    const sourceStructure = item.preview.sourceStructure
      ? {
          ...item.preview.sourceStructure,
          media: [...(item.preview.sourceStructure.media ?? []), sourceMedia]
        }
      : undefined

    const updatedPreview = {
      ...item.preview,
      steps,
      sourceStructure
    }

    await this.repository.updatePreview(id, updatedPreview, principal.accountId)
    return {
      media: sourceMedia,
      stepMedia
    }
  }

  async reextractMedia(principal: AuthPrincipal, id: string) {
    const item = await this.get(principal, id)
    if (item.createdBy !== principal.accountId && !['ADMIN', 'SUPER_ADMIN'].includes(principal.systemRole)) {
      throw forbidden('Chỉ người tạo mới có thể trích xuất lại ảnh')
    }
    if (item.status !== 'needs_review') {
      throw new AppError(409, 'IMPORT_NOT_EDITABLE', 'SOP đã gửi duyệt hoặc công bố; không thể chỉnh sửa')
    }
    const buffer = await this.storage.read(item.storageKey)
    const baseStructure = item.preview.sourceStructure ?? {
      schemaVersion: 2 as const,
      adapter: 'plain-text' as const,
      outline: [],
      stats: { pageCount: 1, itemCount: 0, lowConfidenceCount: 0, operationalStepCount: item.preview.steps.length }
    }

    const extractedMedia = await extractAndUploadMedia(
      buffer,
      item.file.mediaType,
      id,
      this.storage,
      baseStructure.outline
    )

    const { steps } = assignMediaToSteps(
      baseStructure,
      item.preview.steps,
      extractedMedia,
      item.preview.steps
    )

    const updatedSourceStructure = {
      ...baseStructure,
      media: extractedMedia
    }

    const updatedPreview = {
      ...item.preview,
      steps,
      sourceStructure: updatedSourceStructure
    }

    await this.repository.updatePreview(id, updatedPreview, principal.accountId)
    return this.get(principal, id)
  }
}




