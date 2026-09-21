import type { QueryRunner, TransactionalDatabase } from '../database/database.js'
import { contentHash } from '../database/normalize-knowledge.js'
import { createId } from '../common/ids.js'
import { conflict } from '../common/errors.js'
import { isMasterDataCode, isProcedureDefinition } from '../common/procedure-classification.js'

export type State = 'draft' | 'submitted' | 'reviewed' | 'published' | 'archived' | 'trash'
export type Action = 'submit' | 'review' | 'reject' | 'publish' | 'archive' | 'trash' | 'restore'

export interface DraftRow {
  DraftId: string
  DocumentId: string | null
  BaseVersion: number
  Revision: number
  State: State
  PreviewJson: unknown
  OriginalContentJson: unknown
  CreatedBy: string
  EditedBy: string
  ReviewedBy: string | null
  PublishedBy: string | null
  Note: string | null
  UpdatedAt: Date
}

export class SopWorkspaceRepository {
  constructor(private readonly db: TransactionalDatabase) {}

  get provider(): TransactionalDatabase['provider'] {
    return this.db.provider
  }

  private lock(alias: string): string {
    return this.db.provider === 'sqlserver' ? `${alias} WITH (UPDLOCK, ROWLOCK)` : alias
  }

  private forUpdate(): string {
    return this.db.provider === 'sqlserver' ? '' : ' FOR UPDATE'
  }

  async list(): Promise<DraftRow[]> {
    return this.db.query<DraftRow>('SELECT * FROM SopWorkspaceDraft ORDER BY UpdatedAt DESC')
  }

  async findDraftById(id: string, lock = false, runner: QueryRunner = this.db): Promise<DraftRow | null> {
    const [row] = await runner.query<DraftRow>(
      `SELECT ${this.db.provider === 'sqlserver' ? 'TOP 1 ' : ''}* FROM ${this.lock('SopWorkspaceDraft')} WHERE DraftId = :id${lock ? this.forUpdate() : ''}`,
      { id }
    )
    return row ?? null
  }

  async findActiveDraftByDocumentId(documentId: string, runner: QueryRunner = this.db): Promise<string | null> {
    const rows = await runner.query<{ DraftId: string }>(
      "SELECT DraftId FROM SopWorkspaceDraft WHERE DocumentId = :id AND State IN ('draft', 'submitted', 'reviewed')",
      { id: documentId }
    )
    return rows[0]?.DraftId ?? null
  }

  async findPublishedDocument(id: string, runner: QueryRunner = this.db) {
    const [doc] = await runner.query<{
      DocumentId: string
      Code: string
      Title: string
      Summary: string
      CurrentVersionNumber: number
      ContentJson: unknown
    }>(
      `SELECT ${this.db.provider === 'sqlserver' ? 'TOP 1 ' : ''}d.*, v.ContentJson
       FROM ${this.lock('KnowledgeDocument d')}
       JOIN KnowledgeDocumentVersion v ON v.DocumentId = d.DocumentId AND v.VersionNumber = d.CurrentVersionNumber
       WHERE d.DocumentId = :id AND d.Visibility = 'module' AND d.DocumentType = 'procedure'${this.forUpdate()}`,
      { id }
    )
    return doc ?? null
  }

  async findDocumentModules(id: string, runner: QueryRunner = this.db): Promise<string[]> {
    const links = await runner.query<{ ModuleId: string }>(
      'SELECT ModuleId FROM KnowledgeDocumentModule WHERE DocumentId = :id',
      { id }
    )
    return links.map(link => link.ModuleId)
  }

  async validateModules(ids: string[], runner: QueryRunner = this.db): Promise<void> {
    if (!ids.length) throw conflict('SOP_MODULE_REQUIRED', 'Hãy chọn ít nhất một phân hệ')
    for (const id of new Set(ids)) {
      const rows = await runner.query("SELECT ModuleId FROM HrModule WHERE ModuleId = :id AND Status = 'published'", { id })
      if (!rows.length) throw conflict('SOP_MODULE_UNAVAILABLE', 'Phân hệ đã ngừng sử dụng hoặc không tồn tại')
    }
  }

  async audit(id: string, actor: string, action: string, data: unknown, runner: QueryRunner = this.db): Promise<void> {
    await runner.query(
      `INSERT INTO AuditLog (EntityType, EntityId, Action, ActorAccountId, AfterJson)
       VALUES ('sop-workspace', :id, :action, :actor, :data)`,
      { id, action, actor, data: JSON.stringify(data) }
    )
  }

  async transaction<T>(work: (runner: QueryRunner) => Promise<T>): Promise<T> {
    return this.db.transaction(work)
  }

  async insertDraft(draft: {
    id: string
    documentId: string | null
    baseVersion: number
    preview: unknown
    original: unknown
    actor: string
  }, runner: QueryRunner = this.db): Promise<void> {
    await runner.query(
      `INSERT INTO SopWorkspaceDraft (DraftId, DocumentId, BaseVersion, PreviewJson, OriginalContentJson, CreatedBy, EditedBy)
       VALUES (:id, :documentId, :base, :preview, :original, :actor, :actor)`,
      {
        id: draft.id,
        documentId: draft.documentId,
        base: draft.baseVersion,
        preview: JSON.stringify(draft.preview),
        original: JSON.stringify(draft.original),
        actor: draft.actor
      }
    )
  }

  async updateDraftContent(id: string, preview: unknown, actor: string, runner: QueryRunner = this.db): Promise<void> {
    await runner.query(
      `UPDATE SopWorkspaceDraft SET PreviewJson = :preview, Revision = Revision + 1, EditedBy = :actor,
       ReviewedBy = NULL WHERE DraftId = :id`,
      { id, preview: JSON.stringify(preview), actor }
    )
  }

  async publishDocument(params: {
    documentId: string | null
    code: string
    title: string
    summary: string
    content: Record<string, unknown>
    moduleIds: string[]
    baseVersion: number
    author: string
    actor: string
    workspaceDraftId: string
  }, runner: QueryRunner = this.db): Promise<{ documentId: string; version: number }> {
    if (isMasterDataCode(params.code)) {
      throw conflict('MASTER_DATA_NOT_PROCEDURE', 'Tài liệu mã MD thuộc Master Data, không được công bố trong Thư viện quy trình.')
    }
    if (!isProcedureDefinition(params.content)) {
      throw conflict('PROCEDURE_STEPS_REQUIRED', 'SOP cần ít nhất hai bước nghiệp vụ khác nhau.')
    }
    let documentId = params.documentId
    let version = params.baseVersion

    if (documentId) {
      const [doc] = await runner.query<{ CurrentVersionNumber: number }>(
        `SELECT ${this.db.provider === 'sqlserver' ? 'TOP 1 ' : ''}CurrentVersionNumber FROM ${this.lock('KnowledgeDocument')} WHERE DocumentId = :id${this.forUpdate()}`,
        { id: documentId }
      )
      if (!doc || doc.CurrentVersionNumber !== params.baseVersion) {
        throw conflict('SOP_BASE_VERSION_CHANGED', 'Đã có phiên bản mới được công bố; hãy tạo lại bản sửa từ phiên bản hiện hành')
      }
    } else {
      documentId = createId('doc')
      const duplicate = await runner.query(
        `SELECT ${this.db.provider === 'sqlserver' ? 'TOP 1 ' : ''}DocumentId FROM ${this.lock('KnowledgeDocument')} WHERE Code = :code${this.forUpdate()}`,
        { code: params.code }
      )
      if (duplicate.length) throw conflict('SOP_CODE_EXISTS', 'Mã SOP đã tồn tại; hãy sửa SOP hiện có hoặc đổi mã')
      await runner.query(
        `INSERT INTO KnowledgeDocument (DocumentId, Code, Title, DocumentType, Summary, SourceKey, Status)
         VALUES (:id, :code, :title, 'procedure', :summary, :source, 'draft')`,
        { id: documentId, code: params.code, title: params.title, summary: params.summary, source: `workspace:${params.workspaceDraftId}` }
      )
    }

    const [last] = await runner.query<{ LastVersion: number }>(
      'SELECT MAX(VersionNumber) AS LastVersion FROM KnowledgeDocumentVersion WHERE DocumentId = :id',
      { id: documentId }
    )
    version = Number(last?.LastVersion ?? 0) + 1

    await runner.query(
      `INSERT INTO KnowledgeDocumentVersion (DocumentId, VersionNumber, Status, ContentJson, ContentHash, CreatedBy)
       VALUES (:id, :version, 'published', :content, :hash, :actor)`,
      { id: documentId, version, content: JSON.stringify(params.content), hash: contentHash(params.content), actor: params.actor }
    )

    await runner.query(
      "UPDATE KnowledgeDocument SET Code = :code, Title = :title, Summary = :summary, CurrentVersionNumber = :version, Status = 'published' WHERE DocumentId = :id",
      { id: documentId, code: params.code, title: params.title, summary: params.summary, version }
    )

    await runner.query('DELETE FROM KnowledgeDocumentModule WHERE DocumentId = :id', { id: documentId })
    for (const module of new Set(params.moduleIds)) {
      await runner.query('INSERT INTO KnowledgeDocumentModule (DocumentId, ModuleId) VALUES (:id, :module)', { id: documentId, module })
    }

    await runner.query(
      `INSERT IGNORE INTO SopRoleAssignment (SopResourceId, AccountId, RoleCode, AssignedBy)
       VALUES (:id, :author, 'OWNER', :actor)`,
      { id: documentId, author: params.author, actor: params.actor }
    )

    return { documentId, version }
  }

  async archiveDocument(documentId: string, baseVersion: number, runner: QueryRunner = this.db): Promise<void> {
    const [doc] = await runner.query<{ CurrentVersionNumber: number }>(
      `SELECT ${this.db.provider === 'sqlserver' ? 'TOP 1 ' : ''}CurrentVersionNumber FROM ${this.lock('KnowledgeDocument')} WHERE DocumentId = :id${this.forUpdate()}`,
      { id: documentId }
    )
    if (doc?.CurrentVersionNumber !== baseVersion) {
      throw conflict('SOP_BASE_VERSION_CHANGED', 'Bản này đã có phiên bản mới; không thể thu hồi phiên bản hiện hành từ hồ sơ cũ')
    }
    await runner.query("UPDATE KnowledgeDocument SET Status = 'archived' WHERE DocumentId = :id", { id: documentId })
  }

  async updateDraftStatus(params: {
    id: string
    state: State
    documentId: string | null
    version: number
    reviewer: string | null
    publisher: string | null
    note: string | null
  }, runner: QueryRunner = this.db): Promise<void> {
    await runner.query(
      `UPDATE SopWorkspaceDraft SET State = :state, Revision = Revision + 1, DocumentId = :documentId,
       BaseVersion = :version, ReviewedBy = :reviewer, PublishedBy = :publisher, Note = :note WHERE DraftId = :id`,
      {
        id: params.id,
        state: params.state,
        documentId: params.documentId,
        version: params.version,
        reviewer: params.reviewer,
        publisher: params.publisher,
        note: params.note
      }
    )
  }

  async findDraftByDocumentId(documentId: string, runner: QueryRunner = this.db): Promise<DraftRow | null> {
    const [row] = await runner.query<DraftRow>(
      `SELECT ${this.db.provider === 'sqlserver' ? 'TOP 1 ' : ''}* FROM ${this.lock('SopWorkspaceDraft')} WHERE DocumentId = :id ORDER BY UpdatedAt DESC${this.db.provider === 'sqlserver' ? '' : ' LIMIT 1'}`,
      { id: documentId }
    )
    return row ?? null
  }

  async deleteDraft(id: string, runner: QueryRunner = this.db): Promise<void> {
    await runner.query('DELETE FROM SopWorkspaceDraft WHERE DraftId = :id', { id })
  }
}
