import { conflict, notFound } from '../common/errors.js'
import { createId } from '../common/ids.js'
import type { TransactionalDatabase } from '../database/database.js'
import { contentHash } from '../database/normalize-knowledge.js'
import type { CreateSopBody } from '../schemas/sop.schemas.js'

interface ImportRow {
  SopImportJobId: string
  Status: 'needs_review' | 'accepted' | 'published' | 'failed'
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
  CreatedBy: string
  CreatedAt: Date
  UpdatedAt: Date
  AcceptedAt: Date | null
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
    createdBy: row.CreatedBy,
    createdAt: row.CreatedAt,
    updatedAt: row.UpdatedAt,
    acceptedAt: row.AcceptedAt
  }
}

export class SopImportRepository {
  constructor(private readonly database: TransactionalDatabase) {}

  async findDuplicate(checksum: string, accountId: string) {
    const [row] = await this.database.query<ImportRow>(`
      SELECT * FROM SopImportJob WHERE Checksum = :checksum AND CreatedBy = :accountId
      ORDER BY CreatedAt DESC LIMIT 1
    `, { checksum, accountId })
    return row ? mapRow(row) : null
  }

  async create(input: {
    id: string; fileName: string; storageKey: string; mediaType: string; fileSize: number
    checksum: string; extractedText: string; preview: CreateSopBody; warnings: string[]; accountId: string
  }) {
    await this.database.transaction(async (runner) => {
      await runner.query(`INSERT INTO SopImportJob (
        SopImportJobId, Status, OriginalFileName, StorageKey, MediaType, FileSize, Checksum,
        ExtractedText, PreviewJson, WarningsJson, CreatedBy
      ) VALUES (
        :id, 'needs_review', :fileName, :storageKey, :mediaType, :fileSize, :checksum,
        :extractedText, :previewJson, :warningsJson, :accountId
      )`, {
        id: input.id,
        fileName: input.fileName,
        storageKey: input.storageKey,
        mediaType: input.mediaType,
        fileSize: input.fileSize,
        checksum: input.checksum,
        extractedText: input.extractedText,
        accountId: input.accountId,
        previewJson: JSON.stringify(input.preview),
        warningsJson: JSON.stringify(input.warnings)
      })
      await runner.query(`INSERT INTO AuditLog (EntityType, EntityId, Action, ActorAccountId, AfterJson)
        VALUES ('sop-import', :id, 'upload', :accountId, :afterJson)`, {
        id: input.id, accountId: input.accountId,
        afterJson: JSON.stringify({ fileName: input.fileName, checksum: input.checksum, mediaType: input.mediaType })
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

  async listAll() {
    const rows = await this.database.query<ImportRow>('SELECT * FROM SopImportJob ORDER BY CreatedAt DESC LIMIT 200')
    return rows.map(mapRow)
  }

  async get(id: string) {
    const [row] = await this.database.query<ImportRow>('SELECT * FROM SopImportJob WHERE SopImportJobId = :id', { id })
    if (!row) throw notFound('SOP import', id)
    return mapRow(row)
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

      const documentId = createId('doc')
      const versionNumber = 1
      const content = {
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
        sourceDocument: {
          importId: id,
          fileName: row.OriginalFileName,
          mediaType: row.MediaType,
          fileSize: Number(row.FileSize),
          checksum: row.Checksum,
          downloadUrl: `/api/v1/sop-imports/${id}/source`
        }
      }
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
      await runner.query(`INSERT INTO KnowledgeDocumentVersion (
        DocumentId, VersionNumber, Status, ContentJson, ContentHash, CreatedBy
      ) VALUES (:documentId, :versionNumber, 'draft', :content, :hash, :accountId)`, {
        documentId, versionNumber, content: JSON.stringify(content), hash: contentHash(content), accountId
      })
      for (const moduleId of new Set(preview.moduleIds)) {
        await runner.query('INSERT INTO KnowledgeDocumentModule (DocumentId, ModuleId) VALUES (:documentId, :moduleId)', { documentId, moduleId })
      }
      await runner.query(`UPDATE SopImportJob SET Status = 'accepted', TargetSopId = :documentId,
        TargetVersionId = :versionId, AcceptedAt = UTC_TIMESTAMP(3), UpdatedAt = UTC_TIMESTAMP(3)
        WHERE SopImportJobId = :id`, { id, documentId, versionId: String(versionNumber) })
      await runner.query(`INSERT INTO AuditLog (EntityType, EntityId, Action, ActorAccountId, AfterJson)
        VALUES ('sop-import', :id, 'accept-as-draft', :accountId, :afterJson)`, {
        id, accountId, afterJson: JSON.stringify({ documentId, versionNumber, model: 'core8' })
      })
      await runner.query(`INSERT INTO AuditLog (EntityType, EntityId, Action, ActorAccountId, AfterJson)
        VALUES ('knowledge-document', :documentId, 'create-draft-from-import', :accountId, :afterJson)`, {
        documentId, accountId, afterJson: JSON.stringify({ importId: id, versionNumber, moduleIds: preview.moduleIds })
      })
      return { id: documentId, version: { id: String(versionNumber), versionNumber, status: 'draft' as const } }
    })
  }

  async publishCore8(id: string, accountId: string) {
    return this.database.transaction(async runner => {
      const [row] = await runner.query<ImportRow>('SELECT * FROM SopImportJob WHERE SopImportJobId = :id FOR UPDATE', { id })
      if (!row) throw notFound('SOP import', id)
      if (row.Status !== 'accepted' || !row.TargetSopId || !row.TargetVersionId) {
        throw conflict('IMPORT_NOT_AWAITING_APPROVAL', 'Import is not awaiting approval')
      }
      const versionNumber = Number(row.TargetVersionId)
      const documents = await runner.query<{ Status: string }>(`
        SELECT Status FROM KnowledgeDocument WHERE DocumentId = :documentId FOR UPDATE
      `, { documentId: row.TargetSopId })
      if (!documents[0] || documents[0].Status !== 'draft') {
        throw conflict('DRAFT_NOT_AVAILABLE', 'The imported draft is not available for publication')
      }
      await runner.query("UPDATE KnowledgeDocumentVersion SET Status = 'published' WHERE DocumentId = :documentId AND VersionNumber = :versionNumber AND Status = 'draft'", {
        documentId: row.TargetSopId, versionNumber
      })
      await runner.query("UPDATE KnowledgeDocument SET Status = 'published', UpdatedAt = UTC_TIMESTAMP(3) WHERE DocumentId = :documentId", {
        documentId: row.TargetSopId
      })
      await runner.query("UPDATE SopImportJob SET Status = 'published', UpdatedAt = UTC_TIMESTAMP(3) WHERE SopImportJobId = :id", { id })
      await runner.query(`INSERT INTO AuditLog (EntityType, EntityId, Action, ActorAccountId, AfterJson)
        VALUES ('knowledge-document', :documentId, 'publish-imported-draft', :accountId, :afterJson)`, {
        documentId: row.TargetSopId, accountId, afterJson: JSON.stringify({ importId: id, versionNumber })
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
