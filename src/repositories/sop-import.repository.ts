import { conflict, notFound } from '../common/errors.js'
import { createId } from '../common/ids.js'
import type { TransactionalDatabase } from '../database/database.js'
import { contentHash } from '../database/normalize-knowledge.js'
import type { CreateSopBody } from '../schemas/sop.schemas.js'

interface ImportRow {
  SopImportJobId: string
  Status: 'needs_review' | 'accepted' | 'published' | 'failed' | 'archived'
  OriginalFileName: string
  StorageKey: string
  MediaType: string
  FileSize: string | number
  Checksum: string
  ExtractedText: string
  PreviewJson: string
  WarningsJson: string | null
  TargetSopId: string | null
  TargetVersionId: string | null
  AudienceMode: 'personal' | 'department' | 'job_title' | 'department_job_title' | 'module'
  DepartmentName: string | null
  JobTitle: string | null
  CreatedBy: string
  CreatedAt: Date
  UpdatedAt: Date
  AcceptedAt: Date | null
  ReviewedBy: string | null
  ReviewedAt: Date | null
  ReviewNote: string | null
  SourceDocumentId: string | null
}

function mapRow(row: ImportRow) {
  return {
    id: row.SopImportJobId,
    status: row.Status,
    file: { name: row.OriginalFileName, mediaType: row.MediaType, size: Number(row.FileSize), checksum: row.Checksum },
    storageKey: row.StorageKey,
    extractedText: row.ExtractedText,
    preview: JSON.parse(row.PreviewJson) as CreateSopBody,
    warnings: row.WarningsJson ? JSON.parse(row.WarningsJson) as string[] : [],
    targetSopId: row.TargetSopId,
    targetVersionId: row.TargetVersionId,
    audience: {
      mode: row.AudienceMode,
      department: row.DepartmentName,
      jobTitle: row.JobTitle
    },
    createdBy: row.CreatedBy,
    createdAt: row.CreatedAt,
    updatedAt: row.UpdatedAt,
    acceptedAt: row.AcceptedAt,
    reviewedBy: row.ReviewedBy,
    reviewedAt: row.ReviewedAt,
    reviewNote: row.ReviewNote,
    sourceDocumentId: row.SourceDocumentId
  }
}

export class SopImportRepository {
  constructor(private readonly database: TransactionalDatabase) {}

  async findDuplicate(checksum: string, accountId: string) {
    const [row] = await this.database.query<ImportRow>(`
      SELECT * FROM SopImportJob WHERE Checksum = :checksum AND CreatedBy = :accountId AND Status <> 'archived'
      ORDER BY CreatedAt DESC LIMIT 1
    `, { checksum, accountId })
    return row ? mapRow(row) : null
  }

  async findBySourceDocument(documentId: string, accountId: string) {
    const [row] = await this.database.query<ImportRow>(`
      SELECT * FROM SopImportJob
      WHERE SourceDocumentId = :documentId AND CreatedBy = :accountId
      ORDER BY CreatedAt DESC LIMIT 1
    `, { documentId, accountId })
    return row ? mapRow(row) : null
  }

  async linkSourceDocument(documentId: string, importId: string, accountId: string) {
    await this.database.transaction(async runner => {
      const importResult = await runner.query<{ affectedRows: number }>(`UPDATE SopImportJob
        SET SourceDocumentId = COALESCE(SourceDocumentId, :documentId)
        WHERE SopImportJobId = :importId AND CreatedBy = :accountId`, { documentId, importId, accountId })
      const documentResult = await runner.query<{ affectedRows: number }>(`UPDATE UserDocument
        SET SourceImportJobId = :importId, UpdatedAt = UTC_TIMESTAMP(3)
        WHERE DocumentId = :documentId AND CreatedBy = :accountId AND DeletedAt IS NULL`, {
        documentId, importId, accountId
      })
      if (!importResult[0]?.affectedRows || !documentResult[0]?.affectedRows) {
        throw conflict('DOCUMENT_CONVERSION_LINK_FAILED', 'Không thể liên kết tài liệu với hồ sơ chuyển hóa')
      }
    })
    return this.get(importId)
  }

  async create(input: {
    id: string; fileName: string; storageKey: string; mediaType: string; fileSize: number
    checksum: string; extractedText: string; preview: CreateSopBody; warnings: string[]; accountId: string
    audienceMode: ImportRow['AudienceMode']; departmentName: string | null; jobTitle: string | null
    sourceDocumentId?: string | null
  }) {
    await this.database.transaction(async (runner) => {
      await runner.query(`INSERT INTO SopImportJob (
        SopImportJobId, Status, OriginalFileName, StorageKey, MediaType, FileSize, Checksum,
        ExtractedText, PreviewJson, WarningsJson, AudienceMode, DepartmentName, JobTitle, CreatedBy,
        SourceDocumentId
      ) VALUES (
        :id, 'needs_review', :fileName, :storageKey, :mediaType, :fileSize, :checksum,
        :extractedText, :previewJson, :warningsJson, :audienceMode, :departmentName, :jobTitle, :accountId,
        :sourceDocumentId
      )`, {
        id: input.id,
        fileName: input.fileName,
        storageKey: input.storageKey,
        mediaType: input.mediaType,
        fileSize: input.fileSize,
        checksum: input.checksum,
        extractedText: input.extractedText,
        accountId: input.accountId,
        audienceMode: input.audienceMode,
        departmentName: input.departmentName,
        jobTitle: input.jobTitle,
        previewJson: JSON.stringify(input.preview),
        warningsJson: JSON.stringify(input.warnings),
        sourceDocumentId: input.sourceDocumentId ?? null
      })
      if (input.sourceDocumentId) {
        const linkResult = await runner.query<{ affectedRows: number }>(`UPDATE UserDocument
          SET SourceImportJobId = :id, UpdatedAt = UTC_TIMESTAMP(3)
          WHERE DocumentId = :sourceDocumentId AND CreatedBy = :accountId AND DeletedAt IS NULL`, {
          id: input.id,
          sourceDocumentId: input.sourceDocumentId,
          accountId: input.accountId
        })
        if (!linkResult[0]?.affectedRows) {
          throw conflict('SOURCE_DOCUMENT_NOT_AVAILABLE', 'Tài liệu nguồn không còn khả dụng để chuyển hóa')
        }
      }
      await runner.query(`INSERT INTO AuditLog (EntityType, EntityId, Action, ActorAccountId, AfterJson)
        VALUES ('sop-import', :id, :action, :accountId, :afterJson)`, {
        id: input.id, accountId: input.accountId,
        action: input.sourceDocumentId ? 'create-from-document' : 'upload',
        afterJson: JSON.stringify({
          fileName: input.fileName,
          checksum: input.checksum,
          mediaType: input.mediaType,
          audienceMode: input.audienceMode,
          department: input.departmentName,
          jobTitle: input.jobTitle,
          sourceDocumentId: input.sourceDocumentId ?? null
        })
      })
    })
    return this.get(input.id)
  }

  async list(accountId: string) {
    const rows = await this.database.query<ImportRow>(`
      SELECT * FROM SopImportJob WHERE CreatedBy = :accountId ORDER BY CreatedAt DESC LIMIT 50
    `, { accountId })
    return rows.map(mapRow)
  }

  async listForActor(accountId: string, departmentName: string | null, jobTitle: string | null) {
    const rows = await this.database.query<ImportRow>(`
      SELECT job.* FROM SopImportJob job
      WHERE job.CreatedBy = :accountId OR EXISTS (
        SELECT 1 FROM SopRoleAssignment roleRow
        WHERE roleRow.SopResourceId = job.TargetSopId AND roleRow.AccountId = :accountId
      ) OR (job.Status = 'published' AND EXISTS (
        SELECT 1 FROM UserDocumentScope audience
        WHERE audience.DocumentId = job.TargetSopId AND (
          audience.AudienceMode = 'module'
          OR (audience.AudienceMode = 'department' AND :departmentName <> '' AND audience.DepartmentName = :departmentName)
          OR (audience.AudienceMode = 'job_title' AND :jobTitle <> '' AND audience.JobTitle = :jobTitle)
          OR (audience.AudienceMode = 'department_job_title' AND :departmentName <> '' AND :jobTitle <> ''
            AND audience.DepartmentName = :departmentName AND audience.JobTitle = :jobTitle)
        )
      )) ORDER BY job.CreatedAt DESC LIMIT 100
    `, { accountId, departmentName: departmentName ?? '', jobTitle: jobTitle ?? '' })
    return rows.map(mapRow)
  }
  async listAll() {
    const rows = await this.database.query<ImportRow>('SELECT * FROM SopImportJob ORDER BY CreatedAt DESC LIMIT 200')
    return rows.map(mapRow)
  }

  async get(id: string) {
    const [row] = await this.database.query<ImportRow>('SELECT * FROM SopImportJob WHERE SopImportJobId = :id', { id })
    if (!row) throw notFound('SOP import', id)
    return mapRow(row)
  }

  async isCurrentPublished(documentId: string | null, versionId: string | null) {
    if (!documentId || !versionId) return false
    const rows = await this.database.query("SELECT DocumentId FROM KnowledgeDocument WHERE DocumentId = :id AND Status = 'published' AND CurrentVersionNumber = :version", { id: documentId, version: Number(versionId) })
    return rows.length > 0
  }

  async updatePreview(id: string, preview: CreateSopBody, accountId: string) {
    const result = await this.database.query<{ affectedRows: number }>(`UPDATE SopImportJob
      SET PreviewJson = :previewJson, UpdatedAt = UTC_TIMESTAMP(3)
      WHERE SopImportJobId = :id AND CreatedBy = :accountId AND Status = 'needs_review'`, {
      id, accountId, previewJson: JSON.stringify(preview)
    })
    if (!result[0]?.affectedRows) throw conflict('IMPORT_NOT_EDITABLE', 'Import is not editable or does not belong to this account')
    await this.database.query(`INSERT INTO AuditLog (EntityType, EntityId, Action, ActorAccountId, AfterJson)
      VALUES ('sop-import', :id, 'update-preview', :accountId, :afterJson)`, {
      id, accountId, afterJson: JSON.stringify({ code: preview.code, steps: preview.steps.length })
    })
    return this.get(id)
  }

  async withdrawCore8(id: string, accountId: string) {
    await this.database.transaction(async runner => {
      const [row] = await runner.query<ImportRow>('SELECT * FROM SopImportJob WHERE SopImportJobId = :id AND CreatedBy = :accountId FOR UPDATE', { id, accountId })
      if (!row) throw notFound('SOP import', id)
      if (row.Status !== 'accepted' || !row.TargetSopId || !row.TargetVersionId) throw conflict('IMPORT_NOT_EDITABLE', 'Chỉ có thể rút bản đang chờ duyệt')
      const result = await runner.query<{ affectedRows: number }>("UPDATE KnowledgeDocumentVersion SET Status = 'archived' WHERE DocumentId = :documentId AND VersionNumber = :version AND Status = 'draft'", { documentId: row.TargetSopId, version: Number(row.TargetVersionId) })
      if (!result[0]?.affectedRows) throw conflict('DRAFT_NOT_AVAILABLE', 'Bản nháp đã thay đổi; hãy tải lại')
      await runner.query("UPDATE SopImportJob SET Status = 'needs_review', ReviewedBy = NULL, ReviewedAt = NULL, ReviewNote = NULL, AcceptedAt = NULL WHERE SopImportJobId = :id", { id })
      await runner.query("INSERT INTO AuditLog (EntityType, EntityId, Action, ActorAccountId) VALUES ('sop-import', :id, 'withdraw-for-edit', :accountId)", { id, accountId })
    })
    return this.get(id)
  }

  async archiveCore8(id: string, accountId: string) {
    await this.database.transaction(async runner => {
      const [row] = await runner.query<ImportRow>('SELECT * FROM SopImportJob WHERE SopImportJobId = :id FOR UPDATE', { id })
      if (!row) throw notFound('SOP import', id)
      if (row.Status !== 'published' || !row.TargetSopId) throw conflict('IMPORT_NOT_PUBLISHED', 'Chỉ lưu trữ tài liệu đã công bố')
      const [document] = await runner.query<{ CurrentVersionNumber: number }>('SELECT CurrentVersionNumber FROM KnowledgeDocument WHERE DocumentId = :documentId FOR UPDATE', { documentId: row.TargetSopId })
      if (Number(document?.CurrentVersionNumber) === Number(row.TargetVersionId)) {
        await runner.query("UPDATE KnowledgeDocument SET Status = 'archived' WHERE DocumentId = :documentId", { documentId: row.TargetSopId })
      }
      await runner.query("UPDATE SopImportJob SET Status = 'archived' WHERE SopImportJobId = :id", { id })
      await runner.query("INSERT INTO AuditLog (EntityType, EntityId, Action, ActorAccountId, AfterJson) VALUES ('sop-import', :id, 'archive', :accountId, :after)", { id, accountId, after: JSON.stringify({ documentId: row.TargetSopId, version: row.TargetVersionId }) })
    })
    return this.get(id)
  }

  async canReviseCode(code: string, accountId: string) {
    const [document] = await this.database.query<{ DocumentId: string }>('SELECT DocumentId FROM KnowledgeDocument WHERE Code = :code', { code })
    if (!document) return true
    const roles = await this.database.query(`SELECT AccountId FROM SopRoleAssignment WHERE SopResourceId = :id AND AccountId = :accountId AND RoleCode IN ('OWNER', 'EDITOR')`, { id: document.DocumentId, accountId })
    const owners = await this.database.query('SELECT CreatedBy FROM UserDocumentScope WHERE DocumentId = :id AND CreatedBy = :accountId', { id: document.DocumentId, accountId })
    return roles.length > 0 || owners.length > 0
  }

  async deleteDraft(id: string, accountId: string) {
    return this.database.transaction(async (runner) => {
      const [row] = await runner.query<ImportRow>(`
        SELECT * FROM SopImportJob WHERE SopImportJobId = :id AND CreatedBy = :accountId FOR UPDATE
      `, { id, accountId })
      if (!row) throw notFound('SOP import', id)
      if (row.Status !== 'needs_review') {
        throw conflict('IMPORT_NOT_DELETABLE', 'Chỉ có thể xóa tài liệu khi còn là bản nháp chưa gửi duyệt')
      }
      if (row.SourceDocumentId) {
        await runner.query(`UPDATE UserDocument
          SET SourceImportJobId = NULL, UpdatedAt = UTC_TIMESTAMP(3)
          WHERE DocumentId = :documentId AND SourceImportJobId = :id`, {
          documentId: row.SourceDocumentId,
          id
        })
      }
      await runner.query('DELETE FROM SopImportJob WHERE SopImportJobId = :id', { id })
      await runner.query(`INSERT INTO AuditLog (EntityType, EntityId, Action, ActorAccountId, BeforeJson)
        VALUES ('sop-import', :id, 'delete-draft', :accountId, :beforeJson)`, {
        id,
        accountId,
        beforeJson: JSON.stringify({ fileName: row.OriginalFileName, checksum: row.Checksum })
      })
      return { storageKey: row.StorageKey, sourceDocumentId: row.SourceDocumentId }
    })
  }

  async accept(id: string, sopId: string, versionId: string, accountId: string) {
    return this.database.transaction(async (runner) => {
      const rows = await runner.query<ImportRow>(`
        SELECT * FROM SopImportJob WHERE SopImportJobId = :id AND CreatedBy = :accountId FOR UPDATE
      `, { id, accountId })
      const row = rows[0]
      if (!row) throw notFound('SOP import', id)
      if (row.Status !== 'needs_review') throw conflict('IMPORT_ALREADY_ACCEPTED', 'Import has already been accepted')

      const preview = JSON.parse(row.PreviewJson) as CreateSopBody
      const documentId = createId('doc')
      await runner.query(`INSERT INTO Document (
        DocumentId, DocumentCode, Title, AssetUrl, MediaType, Checksum, MetadataJson
      ) VALUES (:documentId, :code, :title, :assetUrl, :mediaType, :checksum, :metadataJson)`, {
        documentId,
        code: `${preview.code}-SOURCE-${Date.now()}`,
        title: row.OriginalFileName,
        assetUrl: `/api/v1/sop-imports/${id}/source`,
        mediaType: row.MediaType,
        checksum: row.Checksum,
        metadataJson: JSON.stringify({ source: 'sop-import', importId: id, fileSize: Number(row.FileSize) })
      })
      await runner.query(`INSERT INTO DocumentLink (
        DocumentLinkId, DocumentId, SopId, SopVersionId, LinkKind, SortOrder
      ) VALUES (:linkId, :documentId, :sopId, :versionId, 'source', 0)`, {
        linkId: createId('doclink'), documentId, sopId, versionId
      })
      await runner.query(`UPDATE SopImportJob SET Status = 'accepted', TargetSopId = :sopId,
        TargetVersionId = :versionId, AcceptedAt = UTC_TIMESTAMP(3), UpdatedAt = UTC_TIMESTAMP(3)
        WHERE SopImportJobId = :id`, { id, sopId, versionId })
      await runner.query(`INSERT INTO AuditLog (EntityType, EntityId, Action, ActorAccountId, AfterJson)
        VALUES ('sop-import', :id, 'accept-as-draft', :accountId, :afterJson)`, {
        id, accountId, afterJson: JSON.stringify({ sopId, versionId, documentId })
      })
      return { documentId }
    })
  }

  async acceptCore8(id: string, accountId: string) {
    return this.database.transaction(async (runner) => {
      const [row] = await runner.query<ImportRow>(`
        SELECT * FROM SopImportJob WHERE SopImportJobId = :id AND CreatedBy = :accountId FOR UPDATE
      `, { id, accountId })
      if (!row) throw notFound('SOP import', id)
      if (row.Status !== 'needs_review') throw conflict('IMPORT_ALREADY_ACCEPTED', 'Import has already been accepted')

      const preview = JSON.parse(row.PreviewJson) as CreateSopBody
      for (const moduleId of new Set(preview.moduleIds)) {
        const modules = await runner.query("SELECT ModuleId FROM HrModule WHERE ModuleId = :moduleId AND Status = 'published'", { moduleId })
        if (!modules.length) throw notFound('Module', moduleId)
      }

      const sourceDocument = {
        importId: id,
        fileName: row.OriginalFileName,
        mediaType: row.MediaType,
        fileSize: Number(row.FileSize),
        checksum: row.Checksum,
        downloadUrl: `/api/v1/sop-imports/${id}/source`
      }
      const extractedContent = {
        kind: 'sop',
        category: preview.category ?? null,
        primaryModuleId: preview.primaryModuleId,
        moduleIds: preview.moduleIds,
        definition: preview.definition ?? null,
        purpose: preview.purpose ?? null,
        scope: preview.scope ?? null,
        changeLog: preview.changeLog ?? null,
        steps: preview.steps,
        transitions: preview.transitions,
        access: {
          classification: 'Nội bộ',
          sopViewers: row.AudienceMode === 'module'
            ? ['Người dùng có quyền đọc phân hệ']
            : row.AudienceMode === 'personal'
            ? ['Người tạo tài liệu']
            : row.AudienceMode === 'department'
              ? [`Nhân sự thuộc phòng ban ${row.DepartmentName ?? 'được đồng bộ từ hồ sơ'}`]
              : row.AudienceMode === 'job_title'
                ? [`Nhân sự có chức danh ${row.JobTitle ?? 'được đồng bộ từ hồ sơ'}`]
                : [`Nhân sự có chức danh ${row.JobTitle ?? 'tương ứng'} thuộc phòng ban ${row.DepartmentName ?? 'tương ứng'}`],
          recordViewers: ['Người tạo tài liệu', 'Reviewer', 'Approver'],
          excluded: ['Người ngoài phạm vi được chọn']
        },
        audience: {
          mode: row.AudienceMode,
          department: row.DepartmentName,
          jobTitle: row.JobTitle,
          ownerAccountId: row.CreatedBy
        },
        sourceDocument
      }
      const [existing] = await runner.query<{
        DocumentId: string; DocumentType: string; CurrentVersionNumber: number
      }>('SELECT DocumentId, DocumentType, CurrentVersionNumber FROM KnowledgeDocument WHERE Code = :code FOR UPDATE', { code: preview.code })
      if (existing && existing.DocumentType !== 'procedure') {
        throw conflict('DOCUMENT_CODE_IN_USE', `Mã ${preview.code} đang thuộc một loại tài liệu khác`)
      }
      const documentId = existing?.DocumentId ?? createId('doc')
      let versionNumber = 1
      let content: Record<string, unknown> = extractedContent
      if (existing) {
        const [pending] = await runner.query<{ VersionNumber: number }>(`
          SELECT VersionNumber FROM KnowledgeDocumentVersion
          WHERE DocumentId = :documentId AND Status = 'draft' LIMIT 1 FOR UPDATE
        `, { documentId })
        if (pending) throw conflict('DOCUMENT_DRAFT_EXISTS', `SOP ${preview.code} đã có một phiên bản nháp đang chờ duyệt`)
        const [latest] = await runner.query<{ LastVersion: number }>(`
          SELECT MAX(VersionNumber) AS LastVersion FROM KnowledgeDocumentVersion WHERE DocumentId = :documentId
        `, { documentId })
        versionNumber = Number(latest?.LastVersion ?? existing.CurrentVersionNumber) + 1
        const [current] = await runner.query<{ ContentJson: unknown }>(`
          SELECT ContentJson FROM KnowledgeDocumentVersion
          WHERE DocumentId = :documentId AND VersionNumber = :versionNumber
        `, { documentId, versionNumber: existing.CurrentVersionNumber })
        const currentContent = typeof current?.ContentJson === 'string' ? JSON.parse(current.ContentJson) : current?.ContentJson
        if (currentContent && typeof currentContent === 'object' && !Array.isArray(currentContent)) {
          content = { ...currentContent as Record<string, unknown>, ...extractedContent }
        }
      } else {
        await runner.query(`INSERT INTO KnowledgeDocument (
          DocumentId, Code, Title, DocumentType, Summary, SourceKey, Status, Visibility, CurrentVersionNumber
        ) VALUES (:documentId, :code, :title, 'procedure', :summary, :sourceKey, 'draft', 'module', :versionNumber)`, {
          documentId,
          code: preview.code,
          title: preview.title,
          summary: preview.purpose ?? preview.scope ?? '',
          sourceKey: `sop-import:${id}`,
          versionNumber
        })
      }
      await runner.query(`INSERT INTO KnowledgeDocumentVersion (
        DocumentId, VersionNumber, Status, ContentJson, ContentHash, CreatedBy
      ) VALUES (:documentId, :versionNumber, 'draft', :content, :hash, :accountId)`, {
        documentId, versionNumber, content: JSON.stringify(content), hash: contentHash(content), accountId
      })
      for (const moduleId of existing ? [] : new Set(preview.moduleIds)) {
        await runner.query('INSERT IGNORE INTO KnowledgeDocumentModule (DocumentId, ModuleId) VALUES (:documentId, :moduleId)', { documentId, moduleId })
      }
      if (!existing) {
        await runner.query(`INSERT INTO UserDocumentScope (
          DocumentId, CreatedBy, AudienceMode, DepartmentName, JobTitle
        ) VALUES (:documentId, :accountId, :audienceMode, :departmentName, :jobTitle)`, {
          documentId,
          accountId,
          audienceMode: row.AudienceMode,
          departmentName: row.DepartmentName,
          jobTitle: row.JobTitle
        })
      }
      await runner.query(`UPDATE SopImportJob SET Status = 'accepted', TargetSopId = :documentId,
        TargetVersionId = :versionId, AcceptedAt = UTC_TIMESTAMP(3), UpdatedAt = UTC_TIMESTAMP(3)
        WHERE SopImportJobId = :id`, { id, documentId, versionId: String(versionNumber) })
      await runner.query(`INSERT INTO AuditLog (EntityType, EntityId, Action, ActorAccountId, AfterJson)
        VALUES ('sop-import', :id, 'accept-as-draft', :accountId, :afterJson)`, {
        id, accountId, afterJson: JSON.stringify({ documentId, versionNumber, model: 'core8', existingDocument: Boolean(existing) })
      })
      await runner.query(`INSERT IGNORE INTO SopRoleAssignment (SopResourceId, AccountId, RoleCode, AssignedBy)
        VALUES (:documentId, :accountId, 'OWNER', :accountId)`, { documentId, accountId })
      await runner.query(`INSERT INTO AuditLog (EntityType, EntityId, Action, ActorAccountId, AfterJson)
        VALUES ('knowledge-document', :documentId, :action, :accountId, :afterJson)`, {
        documentId, accountId, action: existing ? 'create-draft-version-from-import' : 'create-draft-from-import',
        afterJson: JSON.stringify({ importId: id, versionNumber, moduleIds: preview.moduleIds })
      })
      return { id: documentId, version: { id: String(versionNumber), versionNumber, status: 'draft' as const } }
    })
  }

  async review(id: string, reviewerAccountId: string, note?: string) {
    const result = await this.database.query<{ affectedRows: number }>(`UPDATE SopImportJob
      SET ReviewedBy = :reviewer, ReviewedAt = UTC_TIMESTAMP(3), ReviewNote = :note, UpdatedAt = UTC_TIMESTAMP(3)
      WHERE SopImportJobId = :id AND Status = 'accepted'`, { id, reviewer: reviewerAccountId, note: note?.trim() || null })
    if (!result[0]?.affectedRows) throw conflict('IMPORT_NOT_REVIEWABLE', 'Bản nháp chưa ở trạng thái có thể rà soát')
    await this.database.query(`INSERT INTO AuditLog (EntityType, EntityId, Action, ActorAccountId, AfterJson)
      VALUES ('sop-import', :id, 'review-approved', :reviewer, :after)`, {
      id, reviewer: reviewerAccountId, after: JSON.stringify({ note: note?.trim() || null })
    })
    return this.get(id)
  }

  async governanceSettings() {
    const [row] = await this.database.query<{ ValueJson: string }>(`SELECT ValueJson FROM AppConfig
      WHERE ConfigKey = 'sop.management' AND ScopeType = 'system' AND ScopeId = '*' AND IsActive = 1`)
    if (!row) return { requireReviewBeforePublish: true, allowOwnerSelfApproval: false }
    try {
      const value = JSON.parse(row.ValueJson)
      return { requireReviewBeforePublish: value.requireReviewBeforePublish !== false, allowOwnerSelfApproval: value.allowOwnerSelfApproval === true }
    } catch { return { requireReviewBeforePublish: true, allowOwnerSelfApproval: false } }
  }
  async publishCore8(id: string, accountId: string) {
    return this.database.transaction(async runner => {
      const [row] = await runner.query<ImportRow>('SELECT * FROM SopImportJob WHERE SopImportJobId = :id FOR UPDATE', { id })
      if (!row) throw notFound('SOP import', id)
      if (row.Status !== 'accepted' || !row.TargetSopId || !row.TargetVersionId) {
        throw conflict('IMPORT_NOT_AWAITING_APPROVAL', 'Import is not awaiting approval')
      }
      const versionNumber = Number(row.TargetVersionId)
      const preview = JSON.parse(row.PreviewJson) as CreateSopBody
      const documents = await runner.query<{ Status: string; CurrentVersionNumber: number }>(`
        SELECT Status, CurrentVersionNumber FROM KnowledgeDocument WHERE DocumentId = :documentId FOR UPDATE
      `, { documentId: row.TargetSopId })
      if (!documents[0]) {
        throw conflict('DRAFT_NOT_AVAILABLE', 'The imported draft is not available for publication')
      }
      const versionResult = await runner.query<{ affectedRows: number }>("UPDATE KnowledgeDocumentVersion SET Status = 'published' WHERE DocumentId = :documentId AND VersionNumber = :versionNumber AND Status = 'draft'", {
        documentId: row.TargetSopId, versionNumber
      })
      if (!versionResult[0]?.affectedRows) throw conflict('DRAFT_NOT_AVAILABLE', 'The imported draft version is not available for publication')
      await runner.query("UPDATE KnowledgeDocument SET Status = 'published', Title = :title, Summary = :summary, CurrentVersionNumber = :versionNumber, UpdatedAt = UTC_TIMESTAMP(3) WHERE DocumentId = :documentId", {
        documentId: row.TargetSopId, versionNumber, title: preview.title, summary: preview.purpose ?? preview.scope ?? ''
      })
      await runner.query('DELETE FROM KnowledgeDocumentModule WHERE DocumentId = :documentId', { documentId: row.TargetSopId })
      for (const moduleId of new Set(preview.moduleIds)) await runner.query('INSERT INTO KnowledgeDocumentModule (DocumentId, ModuleId) VALUES (:documentId, :moduleId)', { documentId: row.TargetSopId, moduleId })
      await runner.query("UPDATE SopImportJob SET Status = 'published', UpdatedAt = UTC_TIMESTAMP(3) WHERE SopImportJobId = :id", { id })
      await runner.query(`INSERT INTO AuditLog (EntityType, EntityId, Action, ActorAccountId, AfterJson)
        VALUES ('knowledge-document', :documentId, 'publish-imported-draft', :accountId, :afterJson)`, {
        documentId: row.TargetSopId, accountId, afterJson: JSON.stringify({ importId: id, versionNumber, previousVersionNumber: documents[0].CurrentVersionNumber })
      })
      await runner.query(`INSERT INTO AuditLog (EntityType, EntityId, Action, ActorAccountId, AfterJson)
        VALUES ('sop-import', :id, 'approve-and-publish', :accountId, :afterJson)`, {
        id, accountId, afterJson: JSON.stringify({ documentId: row.TargetSopId, versionNumber })
      })
    })
  }

  async markPublished(id: string, accountId: string) {
    const result = await this.database.query<{ affectedRows: number }>(`
      UPDATE SopImportJob SET Status = 'published', UpdatedAt = UTC_TIMESTAMP(3)
      WHERE SopImportJobId = :id AND Status = 'accepted'
    `, { id })
    if (!result[0]?.affectedRows) throw conflict('IMPORT_NOT_AWAITING_APPROVAL', 'Import is not awaiting approval')
    await this.database.query(`INSERT INTO AuditLog (EntityType, EntityId, Action, ActorAccountId, AfterJson)
      VALUES ('sop-import', :id, 'approve-and-publish', :accountId, :afterJson)`, {
      id, accountId, afterJson: JSON.stringify({ model: 'legacy' })
    })
  }
}




