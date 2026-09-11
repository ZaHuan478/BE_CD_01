import { createId } from '../common/ids.js'
import { conflict, forbidden, notFound } from '../common/errors.js'
import type { AuthPrincipal } from '../auth/types.js'
import { canAccessSop } from '../auth/authorization.js'
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

export type { Action, DraftRow, State }

const elevated = (p: AuthPrincipal) => ['ADMIN', 'SUPER_ADMIN'].includes(p.systemRole)

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
    steps,
    transitions: Array.isArray(content.transitions) && content.transitions.length ? content.transitions :
      steps.slice(1).map((step: { id: string }, i: number) => ({ fromStepId: steps[i]!.id, toStepId: step.id, kind: 'normal', sortOrder: i + 1 }))
  }
}

export class SopWorkspaceService {
  constructor(
    private readonly repository: SopWorkspaceRepository,
    private readonly indexingService?: IndexingService
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
        archive: mayManageDraft(p, 'sop.archive', row.DocumentId, preview.moduleIds)
      }
    }
  }

  async list(p: AuthPrincipal, query: { q?: string; state?: string; page?: number; pageSize?: number }) {
    const rows = await this.repository.list()
    const q = query.q?.trim().toLocaleLowerCase('vi')
    const visible = rows.filter(row => this.visible(p, row) && (!query.state || row.State === query.state)
      && (!q || `${this.preview(row).title} ${this.preview(row).code}`.toLocaleLowerCase('vi').includes(q)))
    const page = query.page ?? 1
    const pageSize = query.pageSize ?? 20
    return {
      data: visible.slice((page - 1) * pageSize, page * pageSize).map(row => this.output(p, row)),
      pagination: { page, pageSize, total: visible.length }
    }
  }

  async get(p: AuthPrincipal, id: string) {
    const row = await this.repository.findDraftById(id)
    if (!row || !this.visible(p, row)) throw notFound('SOP draft', id)
    return this.output(p, row)
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
    let changedDocumentId: string | null = null
    await this.repository.transaction(async runner => {
      const row = await this.repository.findDraftById(id, true, runner)
      if (!row) throw notFound('SOP draft', id)
      const preview = this.preview(row)
      if (!this.visible(p, row)) throw forbidden()
      if (row.Revision !== revision) throw conflict('SOP_REVISION_CONFLICT', 'SOP đã thay đổi; hãy tải lại trước khi thao tác')

      const permission = action === 'review' ? 'sop.review' : action === 'publish' ? 'sop.publish' : action === 'archive' ? 'sop.archive' : null
      if (permission && !mayManageDraft(p, permission, row.DocumentId, preview.moduleIds)) throw forbidden()
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
}
