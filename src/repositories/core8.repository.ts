import type { QueryRunner, TransactionalDatabase } from '../database/database.js'
import type { CoreDocumentBody, CoreVersionBody } from '../schemas/core8.schemas.js'
import { createId } from '../common/ids.js'
import { conflict, notFound } from '../common/errors.js'
import { contentHash } from '../database/normalize-knowledge.js'
import { jsonValue, publishedWhere } from './core-document.repository.js'
import { isMasterDataCode, isProcedureDefinition } from '../common/procedure-classification.js'

export class Core8Repository {
  constructor(private readonly database: TransactionalDatabase) {}
  private async validateReferences(runner: QueryRunner, content: Record<string, unknown>) {
    const refs = content.relatedDocuments
    if (refs === undefined) return
    if (!Array.isArray(refs) || refs.length > 100 || refs.some(id => typeof id !== 'string')) throw conflict('INVALID_RELATED_DOCUMENTS', 'relatedDocuments must be an array of up to 100 document IDs')
    for (const id of new Set(refs)) {
      const rows = await runner.query("SELECT DocumentId FROM KnowledgeDocument WHERE DocumentId = :id AND Visibility = 'module'", { id: id as string })
      if (!rows.length) throw notFound('Related document', id as string)
    }
  }
  private validateDates(body: { effectiveFrom?: string; effectiveTo?: string }) {
    if (body.effectiveFrom && body.effectiveTo && new Date(body.effectiveTo) <= new Date(body.effectiveFrom)) throw conflict('INVALID_EFFECTIVE_DATES', 'effectiveTo must be after effectiveFrom')
    if (body.effectiveFrom && new Date(body.effectiveFrom).getTime() > Date.now()) throw conflict('SCHEDULED_PUBLICATION_UNSUPPORTED', 'This endpoint publishes immediately; future scheduling is not supported')
    if (body.effectiveTo && new Date(body.effectiveTo).getTime() <= Date.now()) throw conflict('INVALID_EFFECTIVE_DATES', 'A newly published version must not already be expired')
  }
  private async audit(runner: QueryRunner, id: string, action: string, actor: string, after: unknown) {
    await runner.query(`INSERT INTO AuditLog (EntityType, EntityId, Action, ActorAccountId, AfterJson)
      VALUES ('knowledge-document', :id, :action, :actor, :after)`, { id, action, actor, after: JSON.stringify(after) })
  }
  async create(body: CoreDocumentBody, actor: string) {
    if (body.type === 'procedure' && isMasterDataCode(body.code)) {
      throw conflict('MASTER_DATA_NOT_PROCEDURE', 'Tài liệu mã MD thuộc Master Data, không được công bố trong Thư viện quy trình.')
    }
    if (body.type === 'procedure' && !isProcedureDefinition(body.content)) {
      throw conflict('PROCEDURE_STEPS_REQUIRED', 'SOP cần ít nhất hai bước nghiệp vụ khác nhau; danh mục hoặc mô tả một bước không thuộc Thư viện quy trình.')
    }
    this.validateDates(body)
    return this.database.transaction(async runner => {
      const id = createId('doc')
      await this.validateReferences(runner, body.content)
      for (const moduleId of body.moduleIds) {
        const rows = await runner.query("SELECT ModuleId FROM HrModule WHERE ModuleId = :id AND Status = 'published'", { id: moduleId })
        if (!rows.length) throw notFound('Module', moduleId)
      }
      await runner.query(`INSERT INTO KnowledgeDocument (DocumentId, Code, Title, DocumentType, Summary, SourceKey)
        VALUES (:id, :code, :title, :type, :summary, :source)`, { id, code: body.code, title: body.title, type: body.type, summary: body.summary, source: `native:${id}` })
      await this.insertVersion(runner, id, 1, body, actor)
      for (const moduleId of new Set(body.moduleIds)) await runner.query('INSERT INTO KnowledgeDocumentModule (DocumentId, ModuleId) VALUES (:id, :moduleId)', { id, moduleId })
      await this.audit(runner, id, 'create', actor, { version: 1, moduleIds: body.moduleIds })
      return { id, version: 1 }
    })
  }
  private async insertVersion(runner: QueryRunner, id: string, version: number, body: { content: Record<string, unknown>; effectiveFrom?: string; effectiveTo?: string }, actor: string) {
    await runner.query(`INSERT INTO KnowledgeDocumentVersion (DocumentId, VersionNumber, ContentJson, ContentHash, EffectiveFrom, EffectiveTo, CreatedBy)
      VALUES (:id, :version, :content, :hash, :from, :to, :actor)`, { id, version, content: JSON.stringify(body.content), hash: contentHash(body.content),
      from: body.effectiveFrom ? new Date(body.effectiveFrom) : null, to: body.effectiveTo ? new Date(body.effectiveTo) : null, actor })
  }
  async addVersion(id: string, body: CoreVersionBody, actor: string) {
    this.validateDates(body)
    return this.database.transaction(async runner => {
      const [row] = await runner.query<{ CurrentVersionNumber: number; DocumentType: string; Code: string }>("SELECT CurrentVersionNumber, DocumentType, Code FROM KnowledgeDocument WHERE DocumentId = :id AND Visibility = 'module' FOR UPDATE", { id })
      if (!row) throw notFound('Document', id)
      if (row.CurrentVersionNumber !== body.expectedVersion) throw conflict('VERSION_CONFLICT', 'Document changed; refresh before publishing a new version')
      if (row.DocumentType === 'procedure' && isMasterDataCode(row.Code)) {
        throw conflict('MASTER_DATA_NOT_PROCEDURE', 'Tài liệu mã MD thuộc Master Data, không được công bố trong Thư viện quy trình.')
      }
      if (row.DocumentType === 'procedure' && !isProcedureDefinition(body.content)) {
        throw conflict('PROCEDURE_STEPS_REQUIRED', 'SOP cần ít nhất hai bước nghiệp vụ khác nhau.')
      }
      await this.validateReferences(runner, body.content)
      const [latest] = await runner.query<{ LastVersion: number }>('SELECT MAX(VersionNumber) AS LastVersion FROM KnowledgeDocumentVersion WHERE DocumentId = :id', { id })
      const version = Number(latest?.LastVersion ?? row.CurrentVersionNumber) + 1
      await this.insertVersion(runner, id, version, body, actor)
      await runner.query("UPDATE KnowledgeDocument SET CurrentVersionNumber = :version, Status = 'published', UpdatedAt = UTC_TIMESTAMP(3) WHERE DocumentId = :id", { version, id })
      await this.audit(runner, id, 'publish-version', actor, { version })
      return { id, version }
    })
  }
  async versions(id: string) {
    const docs = await this.database.query("SELECT DocumentId FROM KnowledgeDocument WHERE DocumentId = :id AND Visibility = 'module'", { id })
    if (!docs.length) throw notFound('Document', id)
    return this.database.query(`SELECT VersionNumber AS version, Status AS status, EffectiveFrom AS effectiveFrom,
      EffectiveTo AS effectiveTo, CreatedBy AS createdBy, CreatedAt AS createdAt
      FROM KnowledgeDocumentVersion WHERE DocumentId = :id ORDER BY VersionNumber DESC`, { id })
  }
  async version(id: string, version: number) {
    const [row] = await this.database.query<{ ContentJson: unknown }>(`SELECT v.ContentJson FROM KnowledgeDocumentVersion v
      JOIN KnowledgeDocument d ON d.DocumentId = v.DocumentId WHERE d.DocumentId = :id AND d.Visibility = 'module' AND v.VersionNumber = :version`, { id, version })
    if (!row) throw notFound('Document version')
    return { id, version, content: jsonValue(row.ContentJson) }
  }
  async policy(principalModuleIds: string[], policyId: string) {
    const rows = await this.database.query<{ DocumentId: string; CurrentVersionNumber: number; ContentJson: unknown; ModuleId: string }>(`
      SELECT d.DocumentId, d.CurrentVersionNumber, v.ContentJson, dm.ModuleId FROM KnowledgeDocument d
      JOIN KnowledgeDocumentVersion v ON v.DocumentId = d.DocumentId AND v.VersionNumber = d.CurrentVersionNumber
      JOIN KnowledgeDocumentModule dm ON dm.DocumentId = d.DocumentId
      WHERE d.DocumentType = 'policy' AND d.Visibility = 'module' AND ${publishedWhere}`)
    const row = rows.find(row => principalModuleIds.includes(row.ModuleId) && (row.DocumentId === policyId || jsonValue(row.ContentJson)?.id === policyId))
    if (!row) throw notFound('Policy', policyId)
    return row
  }
  async acknowledgement(accountId: string, documentId: string, version: number) {
    const [row] = await this.database.query<{ Action: string; CreatedAt: Date }>(`SELECT Action, CreatedAt FROM AuditLog
      WHERE EntityType = 'policy-acknowledgement' AND EntityId = :id AND ActorAccountId = :accountId
      AND JSON_EXTRACT(AfterJson, '$.version') = :version ORDER BY AuditLogId DESC LIMIT 1`, { id: documentId, accountId, version })
    return { acknowledged: row?.Action === 'acknowledge', acknowledgedAt: row?.Action === 'acknowledge' ? row.CreatedAt : null, version }
  }
  async setAcknowledgement(accountId: string, documentId: string, version: number, acknowledged: boolean) {
    await this.database.transaction(async runner => {
      const [row] = await runner.query<{ CurrentVersionNumber: number }>('SELECT CurrentVersionNumber FROM KnowledgeDocument WHERE DocumentId = :id FOR UPDATE', { id: documentId })
      if (!row || row.CurrentVersionNumber !== version) throw conflict('VERSION_CONFLICT', 'Policy changed; read the current version before acknowledging')
      await runner.query(`INSERT INTO AuditLog (EntityType, EntityId, Action, ActorAccountId, AfterJson)
        VALUES ('policy-acknowledgement', :id, :action, :accountId, :after)`, { id: documentId, action: acknowledged ? 'acknowledge' : 'revoke', accountId, after: JSON.stringify({ version }) })
    })
    return this.acknowledgement(accountId, documentId, version)
  }
}
