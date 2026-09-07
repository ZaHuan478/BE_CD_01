import type { DatabaseParameters, QueryRunner } from '../database/database.js'
import type { CatalogQuery } from '../schemas/runtime.schemas.js'
import { notFound } from '../common/errors.js'

interface DocumentRow {
  DocumentId: string; Code: string; Title: string; DocumentType: 'procedure' | 'policy'
  Summary: string; WorkflowId: string | null; ContentJson?: unknown
}
const columns = 'd.DocumentId, d.Code, d.Title, d.DocumentType, d.Summary, d.WorkflowId'

/** Canonical document reads after a verified import; filtering happens inside MySQL. */
export class KnowledgeReadRepository {
  constructor(private readonly database: QueryRunner) {}
  private scope(moduleIds: string[]) {
    const parameters: DatabaseParameters = Object.fromEntries(moduleIds.map((id, index) => [`module${index}`, id]))
    const placeholders = moduleIds.map((_, index) => `:module${index}`).join(', ')
    return { parameters, sql: moduleIds.length ? `EXISTS (SELECT 1 FROM KnowledgeDocumentModule dm
      WHERE dm.DocumentId = d.DocumentId AND dm.ModuleId IN (${placeholders}))` : '1 = 0' }
  }
  private async summaries(rows: DocumentRow[], readableModules: string[]) {
    if (!rows.length) return []
    const parameters = Object.fromEntries(rows.map((row, index) => [`doc${index}`, row.DocumentId]))
    const links = await this.database.query<{ DocumentId: string; ModuleId: string }>(`
      SELECT DocumentId, ModuleId FROM KnowledgeDocumentModule
      WHERE DocumentId IN (${rows.map((_, index) => `:doc${index}`).join(', ')})`, parameters)
    return rows.map(row => ({ id: row.DocumentId, code: row.Code, title: row.Title, type: row.DocumentType,
      summary: row.Summary, workflowId: row.WorkflowId,
      moduleIds: links.filter(link => link.DocumentId === row.DocumentId && readableModules.includes(link.ModuleId)).map(link => link.ModuleId).sort() }))
  }
  async list(moduleIds: string[], query: CatalogQuery) {
    const scope = this.scope(moduleIds)
    const conditions = [scope.sql]
    if (query.moduleId) {
      conditions.push('EXISTS (SELECT 1 FROM KnowledgeDocumentModule selected WHERE selected.DocumentId = d.DocumentId AND selected.ModuleId = :selectedModule)')
      scope.parameters.selectedModule = query.moduleId
      if (!moduleIds.includes(query.moduleId)) conditions.push('1 = 0')
    }
    if (query.type) { conditions.push('d.DocumentType = :type'); scope.parameters.type = query.type }
    if (query.q?.trim()) {
      conditions.push("CONCAT_WS(' ', d.Code, d.Title, d.Summary, CAST(d.ContentJson AS CHAR CHARACTER SET utf8mb4)) COLLATE utf8mb4_vi_0900_ai_ci LIKE :search ESCAPE '='")
      scope.parameters.search = '%' + query.q.trim().replace(/[=%_]/g, char => '=' + char) + '%'
    }
    const where = conditions.join(' AND ')
    const [count] = await this.database.query<{ Total: number }>(`SELECT COUNT(*) AS Total FROM KnowledgeDocument d WHERE ${where}`, scope.parameters)
    const page = query.page ?? 1
    const pageSize = query.pageSize ?? 20
    // Both values are validated integers in the route schema, not raw SQL input.
    const rows = await this.database.query<DocumentRow>(`SELECT ${columns} FROM KnowledgeDocument d
      WHERE ${where} ORDER BY d.DocumentId LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`, scope.parameters)
    return { data: await this.summaries(rows, moduleIds), pagination: { page, pageSize, total: Number(count?.Total ?? 0) } }
  }
  async get(moduleIds: string[], id: string) {
    const scope = this.scope(moduleIds)
    const rows = await this.database.query<DocumentRow>(`SELECT ${columns}, d.ContentJson FROM KnowledgeDocument d
      WHERE d.DocumentId = :id AND ${scope.sql}`, { ...scope.parameters, id })
    if (!rows[0]) throw notFound('Document', id)
    const [summary] = await this.summaries(rows, moduleIds)
    const raw = rows[0].ContentJson
    return { data: { ...summary, content: typeof raw === 'string' ? JSON.parse(raw) : raw } }
  }
}
