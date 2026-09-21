import { createId } from '../common/ids.js'
import { conflict, forbidden, notFound } from '../common/errors.js'
import type { AuthPrincipal } from '../auth/types.js'
import { canAccessSop, hasPermission } from '../auth/authorization.js'
import { jsonValue } from '../repositories/core-document.repository.js'
import type { CreateSopBody } from '../schemas/sop.schemas.js'
import { validateGraph } from './sop.service.js'
import {
  SopWorkspaceRepository,
  type Action,
  type DraftRow,
  type State
} from '../repositories/sop-workspace.repository.js'
import type { IndexingService } from './rag/indexing.service.js'
import type { SopImportService } from './sop-import.service.js'

export type { Action, DraftRow, State }

const elevated = (p: AuthPrincipal) => p.systemRole === 'SUPER_ADMIN'

export function mayManageDraft(p: AuthPrincipal, permission: string, documentId: string | null, modules: string[]) {
  return elevated(p) || canAccessSop(p, permission, documentId ?? '', modules)
}

export function assertDraftAction(state: State, action: Action, author: string, editor: string, reviewer: string | null, actor: string) {
  const allowed: Record<Action, State[]> = {
    submit: ['draft'],
    review: ['submitted'],
    reject: ['submitted', 'reviewed'],
    publish: ['reviewed'],
    archive: ['published'],
    trash: ['draft'],
    restore: ['trash', 'archived']
  }
  if (!allowed[action].includes(state)) throw conflict('SOP_STATE_CONFLICT', 'Trạng thái đã thay đổi; hãy tải lại SOP trước khi thao tác')
  if (['review', 'publish'].includes(action) && [author, editor].includes(actor)) throw conflict('SOP_SELF_APPROVAL_FORBIDDEN', 'Người soạn hoặc sửa nội dung không được tự rà soát hay công bố bản này')
  if (action === 'publish' && reviewer === actor) throw conflict('SOP_SEPARATE_APPROVER_REQUIRED', 'Người công bố phải khác người rà soát')
}

/** Retain original source metadata and the legacy stepCode/checklist aliases used by workflow screens. */
export function publishedWorkspaceContent(original: Record<string, unknown>, preview: CreateSopBody) {
  return {
    ...original,
    ...preview,
    kind: 'sop',
    code: preview.code,
    title: preview.title,
    steps: preview.steps.map(step => ({ ...step, stepCode: step.code, fieldsChecklist: step.checklist ?? [] }))
  }
}

export function workspacePreview(doc: { Code: string; Title: string; Summary: string }, content: Record<string, any>, moduleIds: string[]): CreateSopBody {
  const steps = (Array.isArray(content.steps) ? content.steps : []).map((step: Record<string, any>, i: number) => ({
    id: String(step.id || step.stepCode || `step-${i + 1}`),
    stableKey: String(step.stableKey || step.id || step.stepCode || `step-${i + 1}`),
    code: String(step.code || step.stepCode || `STEP-${i + 1}`),
    title: String(step.title || `Bước ${i + 1}`),
    nodeKind: step.nodeKind || 'task',
    sortOrder: step.sortOrder ?? i + 1,
    description: step.description || '',
    actor: step.actor || '',
    timing: step.timing || '',
    location: step.location || '',
    typeCode: step.typeCode || 'N',
    checklist: step.checklist || step.fieldsChecklist || [],
    inputs: step.inputs || [],
    outputs: step.outputs || [],
    ...(step.positionX !== undefined ? { positionX: step.positionX, positionY: step.positionY } : {}),
    ...(step.sourceRefs ? { sourceRefs: step.sourceRefs } : {}),
    ...(step.imageUrl ? { imageUrl: step.imageUrl } : {}),
    ...(step.illustrationPreset ? { illustrationPreset: step.illustrationPreset } : {})
  }))

  return {
    code: doc.Code,
    title: doc.Title,
    definition: content.definition || doc.Summary || '',
    purpose: content.purpose || '',
    scope: content.scope || '',
    category: content.category || null,
    moduleIds,
    primaryModuleId: moduleIds.includes(content.primaryModuleId) ? content.primaryModuleId : moduleIds[0]!,
    changeLog: '',
    ...(content.sourceStructure ? { sourceStructure: content.sourceStructure } : {}),
    steps,
    transitions: Array.isArray(content.transitions) && content.transitions.length ? content.transitions :
      steps.slice(1).map((step: { id: string }, i: number) => ({ fromStepId: steps[i]!.id, toStepId: step.id, kind: 'normal', sortOrder: i + 1 }))
  }
}

export class SopWorkspaceService {
  constructor(
    private readonly repository: SopWorkspaceRepository,
    private readonly indexingService?: IndexingService,
    private readonly importService?: SopImportService
  ) {}

  private preview(row: DraftRow): CreateSopBody {
    return jsonValue(row.PreviewJson)
  }

  private editable(p: AuthPrincipal, row: DraftRow) {
    return mayManageDraft(p, row.DocumentId ? 'sop.edit' : 'sop.create', row.DocumentId, this.preview(row).moduleIds)
  }

  private visible(p: AuthPrincipal, row: DraftRow) {
    return this.editable(p, row) || ['sop.review', 'sop.publish'].some(permission => mayManageDraft(p, permission, row.DocumentId, this.preview(row).moduleIds))
  }

  private importState(status: 'needs_review' | 'accepted' | 'published' | 'failed' | 'archived'): State {
    if (status === 'accepted' || status === 'published' || status === 'archived') return status === 'accepted' ? 'submitted' : status
    return 'draft'
  }

  private importOutput(p: AuthPrincipal, item: Awaited<ReturnType<SopImportService['get']>>) {
    const state = item.status === 'accepted' && item.reviewedAt ? 'reviewed' : this.importState(item.status)
    const independent = item.createdBy !== p.accountId
    const canReview = hasPermission(p, 'sop.review') || Boolean(item.targetSopId && hasPermission(p, 'sop.review', 'sop', item.targetSopId))
    const canPublish = hasPermission(p, 'sop.publish') || Boolean(item.targetSopId && hasPermission(p, 'sop.publish', 'sop', item.targetSopId))
    const owner = item.createdBy === p.accountId
    return {
      id: item.id,
      source: 'import' as const,
      documentId: item.targetSopId,
      baseVersion: Number(item.targetVersionId ?? 0),
      revision: 1,
      state,
      preview: item.preview,
      createdBy: item.createdBy,
      editedBy: item.createdBy,
      reviewedBy: item.reviewedBy,
      publishedBy: null,
      note: item.reviewNote,
      updatedAt: item.updatedAt,
      permissions: {
        // A published import is immutable in place, but its owner may still
        // create a new revision after it has been archived.  Expose that
        // capability through the shared workspace contract so the UI does not
        // strand an archived conversion in a read-only state.
        edit: owner && ['needs_review', 'archived'].includes(item.status),
        review: canReview && independent && item.status === 'accepted' && !item.reviewedAt,
        publish: canPublish && independent && item.status === 'accepted' && Boolean(item.reviewedAt),
        reject: false,
        archive: owner || hasPermission(p, 'sop.archive') || Boolean(item.targetSopId && hasPermission(p, 'sop.archive', 'sop', item.targetSopId)),
        delete: false
      }
    }
  }

  private async getImported(p: AuthPrincipal, id: string) {
    if (!this.importService || !id.startsWith('import_')) return null
    try {
      return await this.importService.get(p, id)
    } catch (error) {
      if (error instanceof Error && 'statusCode' in error && (error as { statusCode?: number }).statusCode === 404) return null
      throw error
    }
  }

  private output(p: AuthPrincipal, row: DraftRow) {
    const preview = this.preview(row)
    const canReview = mayManageDraft(p, 'sop.review', row.DocumentId, preview.moduleIds)
    const canPublish = mayManageDraft(p, 'sop.publish', row.DocumentId, preview.moduleIds)
    const independent = ![row.CreatedBy, row.EditedBy].includes(p.accountId)
    return {
      id: row.DraftId,
      documentId: row.DocumentId,
      baseVersion: row.BaseVersion,
      revision: row.Revision,
      state: row.State,
      preview,
      createdBy: row.CreatedBy,
      editedBy: row.EditedBy,
      reviewedBy: row.ReviewedBy,
      publishedBy: row.PublishedBy,
      note: row.Note,
      updatedAt: row.UpdatedAt,
      permissions: {
        edit: this.editable(p, row),
        review: canReview && independent,
        publish: canPublish && independent && row.ReviewedBy !== p.accountId,
        reject: canReview || canPublish,
        archive: row.State === 'published' && (row.CreatedBy === p.accountId || mayManageDraft(p, 'sop.archive', row.DocumentId, preview.moduleIds)),
        delete: (p.systemRole === 'SUPER_ADMIN' || hasPermission(p, 'sop.delete')) && row.State === 'trash'
      }
    }
  }

  async list(p: AuthPrincipal, query: { q?: string; state?: string; page?: number; pageSize?: number }) {
    const rows = await this.repository.list()
    const q = query.q?.trim().toLocaleLowerCase('vi')
    const workspaceItems = rows.filter(row => this.visible(p, row) && (!query.state || row.State === query.state)
      && (!q || `${this.preview(row).title} ${this.preview(row).code}`.toLocaleLowerCase('vi').includes(q)))
      .map(row => this.output(p, row))
    const linkedDocuments = new Set(rows.map(row => row.DocumentId).filter((id): id is string => Boolean(id)))
    const importedItems = this.importService
      ? (await this.importService.list(p))
        .filter(item => !item.targetSopId || !linkedDocuments.has(item.targetSopId))
        .map(item => this.importOutput(p, item))
        .filter(item => !query.state || item.state === query.state)
        .filter(item => !q || `${item.preview.title} ${item.preview.code}`.toLocaleLowerCase('vi').includes(q))
      : []
    const visible = [...workspaceItems, ...importedItems].sort((left, right) => String(right.updatedAt).localeCompare(String(left.updatedAt)))
    const page = query.page ?? 1
    const pageSize = query.pageSize ?? 20
    return {
      data: visible.slice((page - 1) * pageSize, page * pageSize),
      pagination: { page, pageSize, total: visible.length }
    }
  }

  async get(p: AuthPrincipal, id: string) {
    const row = await this.repository.findDraftById(id)
    if (row) {
      if (!this.visible(p, row)) throw notFound('SOP draft', id)
      return this.output(p, row)
    }
    const imported = await this.getImported(p, id)
    if (!imported) throw notFound('SOP draft', id)
    return this.importOutput(p, imported)
  }

  async create(p: AuthPrincipal, input: { documentId?: string; preview?: CreateSopBody }) {
    const id = await this.repository.transaction(async runner => {
      let preview = input.preview
      let baseVersion = 0
      let original: Record<string, any> = {}

      if (input.documentId) {
        const doc = await this.repository.findPublishedDocument(input.documentId, runner)
        if (!doc) throw notFound('SOP', input.documentId)
        const moduleIds = await this.repository.findDocumentModules(input.documentId, runner)
        if (!mayManageDraft(p, 'sop.edit', input.documentId, moduleIds)) throw forbidden()
        const activeDraftId = await this.repository.findActiveDraftByDocumentId(input.documentId, runner)
        if (activeDraftId) return activeDraftId
        original = jsonValue(doc.ContentJson)
        baseVersion = doc.CurrentVersionNumber
        preview = workspacePreview(doc, original, moduleIds)
      }

      if (!preview) throw conflict('SOP_CONTENT_REQUIRED', 'Cần nội dung SOP hoặc quy trình nguồn')
      if (!input.documentId && !preview.moduleIds.every(module => mayManageDraft(p, 'sop.create', null, [module]))) throw forbidden()
      await this.repository.validateModules(preview.moduleIds, runner)

      const draftId = createId('draft')
      await this.repository.insertDraft({
        id: draftId,
        documentId: input.documentId ?? null,
        baseVersion,
        preview,
        original,
        actor: p.accountId
      }, runner)

      await this.repository.audit(draftId, p.accountId, 'create-draft', { documentId: input.documentId, baseVersion }, runner)
      return draftId
    })

    return this.get(p, id)
  }

  async save(p: AuthPrincipal, id: string, revision: number, preview: CreateSopBody) {
    const imported = await this.getImported(p, id)
    if (imported) {
      if (!this.importService) throw notFound('SOP draft', id)
      await this.importService.update(p, id, preview)
      return this.get(p, id)
    }
    await this.repository.transaction(async runner => {
      const row = await this.repository.findDraftById(id, true, runner)
      if (!row) throw notFound('SOP draft', id)
      if (!this.editable(p, row)) throw forbidden()
      if (row.State !== 'draft' || row.Revision !== revision) throw conflict('SOP_REVISION_CONFLICT', 'Bản nháp đã thay đổi hoặc đã gửi duyệt; hãy tải lại')
      const old = this.preview(row)
      if (row.DocumentId && old.code !== preview.code) throw conflict('SOP_CODE_IMMUTABLE', 'Giữ nguyên mã khi sửa SOP; tạo SOP mới nếu cần mã khác')
      for (const module of preview.moduleIds.filter(module => !old.moduleIds.includes(module))) {
        if (!mayManageDraft(p, 'sop.edit', null, [module])) throw forbidden('Bạn chưa được cấp quyền sửa trong phân hệ mới')
      }
      if (!preview.moduleIds.includes(preview.primaryModuleId)) throw conflict('SOP_PRIMARY_MODULE_INVALID', 'Phân hệ chính phải thuộc danh sách phân hệ')
      await this.repository.validateModules(preview.moduleIds, runner)
      await this.repository.updateDraftContent(id, preview, p.accountId, runner)
      await this.repository.audit(id, p.accountId, 'save-draft', { revision: revision + 1 }, runner)
    })

    return this.get(p, id)
  }

  async action(p: AuthPrincipal, id: string, revision: number, action: Action, note?: string) {
    const imported = await this.getImported(p, id)
    if (imported) {
      if (!this.importService) throw notFound('SOP draft', id)
      if (action === 'reject') throw conflict('IMPORT_REJECT_UNSUPPORTED', 'Hồ sơ chuyển hóa cần được rút về chỉnh sửa thay vì trả lại trực tiếp')
      if (action === 'submit') {
        await this.importService.accept(p, id)
        return this.get(p, id)
      }
      if (action === 'review') {
        await this.importService.review(p, id, note)
        return this.get(p, id)
      }
      if (action === 'publish') {
        await this.importService.publish(p, id)
        return this.get(p, id)
      }
      if (action === 'archive') {
        await this.importService.archive(p, id)
        return this.get(p, id)
      }
      if (action === 'restore') {
        const revised = await this.importService.revise(p, id)
        return this.importOutput(p, revised)
      }
      if (action === 'trash') {
        await this.importService.delete(p, id)
        return { ...this.importOutput(p, imported), state: 'trash' as const, updatedAt: new Date() }
      }
    }
    let changedDocumentId: string | null = null
    await this.repository.transaction(async runner => {
      const row = await this.repository.findDraftById(id, true, runner)
      if (!row) throw notFound('SOP draft', id)
      const preview = this.preview(row)
      if (!this.visible(p, row)) throw forbidden()
      if (row.Revision !== revision) throw conflict('SOP_REVISION_CONFLICT', 'SOP đã thay đổi; hãy tải lại trước khi thao tác')

      const permission = action === 'review' ? 'sop.review' : action === 'publish' ? 'sop.publish' : action === 'archive' ? 'sop.archive' : null
      const ownerArchive = action === 'archive' && row.State === 'published' && row.CreatedBy === p.accountId
      if (permission && !ownerArchive && !mayManageDraft(p, permission, row.DocumentId, preview.moduleIds)) throw forbidden()
      if (action === 'reject') {
        if (!['sop.review', 'sop.publish'].some(code => mayManageDraft(p, code, row.DocumentId, preview.moduleIds))) throw forbidden()
        if (!note?.trim()) throw conflict('SOP_REASON_REQUIRED', 'Hãy ghi lý do yêu cầu chỉnh sửa')
      } else if (!permission && !this.editable(p, row)) throw forbidden()

      assertDraftAction(row.State, action, row.CreatedBy, row.EditedBy, row.ReviewedBy, p.accountId)
      const states: Record<Action, State> = {
        submit: 'submitted',
        review: 'reviewed',
        reject: 'draft',
        publish: 'published',
        archive: 'archived',
        trash: 'trash',
        restore: 'draft'
      }

      if (['submit', 'publish'].includes(action)) {
        if (!preview.steps.length || !preview.title.trim() || !preview.code.trim()) throw conflict('SOP_INCOMPLETE', 'Cần mã, tên và ít nhất một bước trước khi gửi duyệt')
        validateGraph(preview)
        await this.repository.validateModules(preview.moduleIds, runner)
      }

      let documentId = row.DocumentId
      let version = row.BaseVersion

      if (action === 'publish') {
        const content = publishedWorkspaceContent(jsonValue(row.OriginalContentJson) ?? {}, preview)
        const pubResult = await this.repository.publishDocument({
          documentId,
          code: preview.code,
          title: preview.title,
          summary: preview.definition ?? '',
          content,
          moduleIds: preview.moduleIds,
          baseVersion: row.BaseVersion,
          author: row.CreatedBy,
          actor: p.accountId,
          workspaceDraftId: id
        }, runner)
        documentId = pubResult.documentId
        version = pubResult.version
        changedDocumentId = documentId
      }

      if (action === 'archive' && documentId) {
        await this.repository.archiveDocument(documentId, row.BaseVersion, runner)
        changedDocumentId = documentId
      }

      await this.repository.updateDraftStatus({
        id,
        state: states[action],
        documentId,
        version,
        reviewer: action === 'review' ? p.accountId : ['reject', 'restore'].includes(action) ? null : row.ReviewedBy,
        publisher: action === 'publish' ? p.accountId : row.PublishedBy,
        note: note?.trim() || null
      }, runner)

      await this.repository.audit(id, p.accountId, action, {
        documentId,
        version,
        note: note?.trim(),
        from: row.State,
        to: states[action]
      }, runner)
    })

    if (changedDocumentId && this.indexingService) {
      try {
        if (action === 'publish') await this.indexingService.markPending(changedDocumentId, 'auto_publish')
        if (action === 'archive') await this.indexingService.removeEntity(changedDocumentId)
      } catch {
        // Publishing is already committed. Index status can be reconciled from
        // the administration screen without returning a misleading 500.
      }
    }

    return this.get(p, id)
  }

  async archivePublishedDocument(p: AuthPrincipal, documentId: string, reason: string, expectedVersion: number) {
    if (!reason || !reason.trim()) throw conflict('SOP_REASON_REQUIRED', 'Lý do thu hồi là bắt buộc')
    let currentVersion = 0
    let sopCode = ''
    await this.repository.transaction(async runner => {
      const moduleIds = await this.repository.findDocumentModules(documentId, runner)
      const hasArchivePermission = mayManageDraft(p, 'sop.archive', documentId, moduleIds)
      const [ownerRow] = !hasArchivePermission && typeof (runner as { query?: unknown }).query === 'function'
        ? await runner.query<{ CreatedBy: string | null }>(
          `SELECT ${this.repository.provider === 'sqlserver' ? 'TOP 1 ' : ''}CreatedBy
           FROM KnowledgeDocumentVersion
           WHERE DocumentId = :id AND Status = 'published'
           ORDER BY VersionNumber DESC${this.repository.provider === 'sqlserver' ? '' : ' LIMIT 1'}`,
          { id: documentId }
        )
        : []
      const ownerArchive = ownerRow?.CreatedBy === p.accountId
      if (!ownerArchive && !hasArchivePermission) throw forbidden()

      const [doc] = await runner.query<{
        DocumentId: string
        Code: string
        Title: string
        Summary: string
        CurrentVersionNumber: number
        Status: string
        ContentJson: unknown
      }>(
        `SELECT ${this.repository.provider === 'sqlserver' ? 'TOP 1 ' : ''}DocumentId, Code, Title, Summary, CurrentVersionNumber, Status, ContentJson FROM KnowledgeDocument WHERE DocumentId = :id${this.repository.provider === 'sqlserver' ? '' : ' FOR UPDATE'}`,
        { id: documentId }
      )
      if (!doc) throw notFound('SOP', documentId)
      if (doc.Status !== 'published') {
        throw conflict('SOP_NOT_PUBLISHED', 'Chỉ tài liệu đang công bố mới được phép thu hồi')
      }
      if (doc.CurrentVersionNumber !== expectedVersion) {
        throw conflict('SOP_VERSION_CONFLICT', 'Phiên bản tài liệu đã thay đổi; hãy tải lại trước khi thu hồi')
      }

      currentVersion = doc.CurrentVersionNumber
      sopCode = doc.Code

      await runner.query("UPDATE KnowledgeDocument SET Status = 'archived' WHERE DocumentId = :id", { id: documentId })

      const existingDraft = await this.repository.findDraftByDocumentId(documentId, runner)
      if (existingDraft) {
        await runner.query(
          "UPDATE SopWorkspaceDraft SET State = 'archived', Note = :reason, BaseVersion = :version, UpdatedAt = CURRENT_TIMESTAMP(3) WHERE DraftId = :id",
          { id: existingDraft.DraftId, reason: reason.trim(), version: currentVersion }
        )
      } else {
        const draftId = createId('draft')
        const original = jsonValue(doc.ContentJson) ?? {}
        const preview = workspacePreview(doc, original, moduleIds)
        await this.repository.insertDraft({
          id: draftId,
          documentId,
          baseVersion: currentVersion,
          preview,
          original,
          actor: p.accountId
        }, runner)
        await runner.query(
          "UPDATE SopWorkspaceDraft SET State = 'archived', Note = :reason WHERE DraftId = :id",
          { id: draftId, reason: reason.trim() }
        )
      }

      await runner.query(
        `INSERT INTO AuditLog (EntityType, EntityId, Action, ActorAccountId, BeforeJson, AfterJson)
         VALUES ('knowledge-document', :documentId, 'archive', :actor, :before, :after)`,
        {
          documentId,
          actor: p.accountId,
          before: JSON.stringify({ documentId, version: currentVersion, status: doc.Status }),
          after: JSON.stringify({
            documentId,
            actor: p.accountId,
            action: 'archive',
            reason: reason.trim(),
            previousVersion: currentVersion,
            newStatus: 'archived'
          })
        }
      )
    })

    if (this.indexingService) {
      try {
        await this.indexingService.removeEntity(documentId)
      } catch {
        // Non-fatal index removal failure handled gracefully
      }
    }

    return {
      success: true,
      documentId,
      code: sopCode,
      version: currentVersion,
      status: 'archived',
      message: 'Đã thu hồi SOP khỏi Thư viện quy trình thành công'
    }
  }

  async permanentDelete(p: AuthPrincipal, id: string, confirmCode: string) {
    const isSuperAdmin = p.systemRole === 'SUPER_ADMIN'
    const hasDeleteCap = hasPermission(p, 'sop.delete')
    if (!isSuperAdmin && !hasDeleteCap) throw forbidden()

    let deletedCode = ''
    await this.repository.transaction(async runner => {
      const row = await this.repository.findDraftById(id, true, runner)
      if (!row) throw notFound('SOP draft', id)

      if (row.State === 'published') {
        throw conflict('SOP_PUBLISHED_CANNOT_DELETE', 'Không được phép xóa vĩnh viễn SOP đang công bố')
      }
      if (row.State !== 'trash') {
        throw conflict('SOP_NOT_IN_TRASH', 'Chỉ có thể xóa vĩnh viễn bản ghi đang ở trong Thùng rác')
      }

      const preview = this.preview(row)
      if (!confirmCode || confirmCode.trim().toUpperCase() !== preview.code.trim().toUpperCase()) {
        throw conflict('CONFIRM_CODE_MISMATCH', `Mã xác nhận "${confirmCode}" không khớp với mã SOP "${preview.code}"`)
      }

      deletedCode = preview.code

      await runner.query(
        `INSERT INTO AuditLog (EntityType, EntityId, Action, ActorAccountId, BeforeJson, AfterJson)
         VALUES ('sop-workspace', :id, 'permanent-delete', :actor, :before, NULL)`,
        {
          id,
          actor: p.accountId,
          before: JSON.stringify({
            draftId: id,
            documentId: row.DocumentId,
            code: preview.code,
            title: preview.title,
            state: row.State,
            revision: row.Revision
          })
        }
      )

      await this.repository.deleteDraft(id, runner)
    })

    return {
      success: true,
      id,
      code: deletedCode,
      message: 'Đã xóa vĩnh viễn hồ sơ SOP thành công'
    }
  }
}
