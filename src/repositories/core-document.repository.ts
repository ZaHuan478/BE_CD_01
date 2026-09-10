import type { DatabaseParameters, QueryRunner } from '../database/database.js'
import { notFound } from '../common/errors.js'
import type { CatalogQuery } from '../schemas/runtime.schemas.js'
import type { AuthPrincipal } from '../auth/types.js'

export function jsonValue(value: unknown): any { return typeof value === 'string' ? JSON.parse(value) : value }
const currentJoin = 'JOIN KnowledgeDocumentVersion v ON v.DocumentId = d.DocumentId AND v.VersionNumber = d.CurrentVersionNumber'
export const publishedWhere = "d.Status = 'published' AND v.Status = 'published' AND (v.EffectiveFrom IS NULL OR v.EffectiveFrom <= UTC_TIMESTAMP(3)) AND (v.EffectiveTo IS NULL OR v.EffectiveTo > UTC_TIMESTAMP(3))"

export class CoreDocumentRepository {
  constructor(private readonly database: QueryRunner) {}
  private scope(moduleIds: string[]) {
    const parameters: DatabaseParameters = Object.fromEntries(moduleIds.map((id, index) => [`m${index}`, id]))
    return { parameters, sql: moduleIds.length ? `EXISTS (SELECT 1 FROM KnowledgeDocumentModule dm WHERE dm.DocumentId = d.DocumentId
      AND dm.ModuleId IN (${moduleIds.map((_, i) => `:m${i}`).join(',')}))` : '1=0' }
  }
  private audience(principal?: AuthPrincipal) {
    if (!principal || ['ADMIN', 'SUPER_ADMIN'].includes(principal.systemRole)) return { parameters: {}, sql: '1=1' }
    const parameters: DatabaseParameters = {
      audienceAccountId: principal.accountId,
      audienceDepartment: principal.organization.department?.trim() ?? '',
      audienceJobTitle: principal.organization.jobTitle?.trim() ?? ''
    }
    return { parameters, sql: `(NOT EXISTS (
      SELECT 1 FROM UserDocumentScope unrestricted WHERE unrestricted.DocumentId = d.DocumentId
    ) OR EXISTS (
      SELECT 1 FROM UserDocumentScope audience WHERE audience.DocumentId = d.DocumentId AND (
        audience.CreatedBy = :audienceAccountId
        OR audience.AudienceMode = 'module'
        OR (audience.AudienceMode = 'department' AND :audienceDepartment <> '' AND audience.DepartmentName = :audienceDepartment)
        OR (audience.AudienceMode = 'job_title' AND :audienceJobTitle <> '' AND audience.JobTitle = :audienceJobTitle)
        OR (audience.AudienceMode = 'department_job_title' AND :audienceDepartment <> '' AND :audienceJobTitle <> ''
          AND audience.DepartmentName = :audienceDepartment AND audience.JobTitle = :audienceJobTitle)
      )
    ))` }
  }
  private async map(rows: Record<string, any>[], moduleIds: string[]) {
    if (!rows.length) return []
    const links = await this.database.query<{ DocumentId: string; ModuleId: string }>(`SELECT DocumentId, ModuleId FROM KnowledgeDocumentModule
      WHERE DocumentId IN (${rows.map((_, i) => `:d${i}`).join(',')})`, Object.fromEntries(rows.map((row, i) => [`d${i}`, row.DocumentId])))
    return rows.map(row => ({ id: row.DocumentId, code: row.Code, title: row.Title, type: row.DocumentType,
      summary: row.Summary, workflowId: row.WorkflowId, version: row.CurrentVersionNumber,
      moduleIds: links.filter(link => link.DocumentId === row.DocumentId && moduleIds.includes(link.ModuleId)).map(link => link.ModuleId).sort(),
      ...(row.ContentJson !== undefined ? { content: jsonValue(row.ContentJson) } : {}) }))
  }
  async list(moduleIds: string[], query: CatalogQuery, principal?: AuthPrincipal) {
    const scope = this.scope(moduleIds)
    const audience = this.audience(principal)
    Object.assign(scope.parameters, audience.parameters)
    const readable = `(d.DocumentType = 'policy' OR (${scope.sql} AND ${audience.sql}))`
    const conditions = [readable, publishedWhere, "d.Visibility = 'module'"]
    if (query.moduleId) {
      if (!moduleIds.includes(query.moduleId)) conditions.push('1=0')
      conditions.push('EXISTS (SELECT 1 FROM KnowledgeDocumentModule dm WHERE dm.DocumentId = d.DocumentId AND dm.ModuleId = :selected)')
      scope.parameters.selected = query.moduleId
    }
    if (query.type) { conditions.push('d.DocumentType = :type'); scope.parameters.type = query.type }
    if (query.q?.trim()) {
      conditions.push("CONCAT_WS(' ', d.Code, d.Title, d.Summary, CAST(v.ContentJson AS CHAR CHARACTER SET utf8mb4)) COLLATE utf8mb4_vi_0900_ai_ci LIKE :q ESCAPE '='")
      scope.parameters.q = '%' + query.q.trim().replace(/[=%_]/g, c => '=' + c) + '%'
    }
    const from = `FROM KnowledgeDocument d ${currentJoin} WHERE ${conditions.join(' AND ')}`
    const [count] = await this.database.query<{ Total: number }>(`SELECT COUNT(*) AS Total ${from}`, scope.parameters)
    const page = query.page ?? 1, pageSize = query.pageSize ?? 20
    const rows = await this.database.query<Record<string, any>>(`SELECT d.DocumentId, d.Code, d.Title, d.DocumentType, d.Summary, d.WorkflowId,
      d.CurrentVersionNumber ${from} ORDER BY d.DocumentId LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`, scope.parameters)
    // Explicit projection; transitional legacy content columns must not leak into list responses.
    return { data: await this.map(rows.map(({ ContentJson: _content, ...row }) => row), moduleIds), pagination: { page, pageSize, total: Number(count?.Total ?? 0) } }
  }
  async get(moduleIds: string[], id: string, principal?: AuthPrincipal) {
    const scope = this.scope(moduleIds)
    const audience = this.audience(principal)
    Object.assign(scope.parameters, audience.parameters)
    const rows = await this.database.query<Record<string, any>>(`SELECT d.DocumentId, d.Code, d.Title, d.DocumentType, d.Summary, d.WorkflowId,
      d.CurrentVersionNumber, v.ContentJson FROM KnowledgeDocument d ${currentJoin}
      WHERE d.DocumentId = :id AND d.Visibility = 'module' AND ${publishedWhere}
        AND (d.DocumentType = 'policy' OR (${scope.sql} AND ${audience.sql}))`, { ...scope.parameters, id })
    if (!rows.length) throw notFound('Document', id)
    const data = (await this.map(rows, moduleIds))[0]!
    const content = data.content
    if (Array.isArray(content?.relatedDocuments)) {
      const visible = await this.database.query<{ DocumentId: string }>(`SELECT d.DocumentId FROM KnowledgeDocument d ${currentJoin}
        WHERE d.Visibility = 'module' AND ${publishedWhere}
          AND (d.DocumentType = 'policy' OR (${scope.sql} AND ${audience.sql}))`, scope.parameters)
      const ids = new Set(visible.map(row => row.DocumentId))
      content.relatedDocuments = content.relatedDocuments.filter((ref: unknown) => typeof ref === 'string' && ids.has(ref))
    }
    return { data: { ...data, content } }
  }

  async dataset(key: string): Promise<unknown> {
    if (key === 'workflow.sopDatabase' || key === 'policy.registry') {
      const rows = await this.database.query<{ WorkflowId: string | null; ContentJson: unknown }>(`SELECT d.WorkflowId, v.ContentJson
        FROM KnowledgeDocument d ${currentJoin} WHERE d.DocumentType = :type AND d.Visibility = 'module' AND ${publishedWhere}
        ORDER BY d.SourceOrder, d.DocumentId`, { type: key === 'policy.registry' ? 'policy' : 'procedure' })
      if (key === 'policy.registry') return rows.map(row => jsonValue(row.ContentJson))
      const workflows: Record<string, unknown[]> = {}
      const manifest = await this.reference('workflow.manifest') as string[]
      for (const id of manifest) workflows[id] = []
      for (const row of rows) if (row.WorkflowId) (workflows[row.WorkflowId] ??= []).push(jsonValue(row.ContentJson))
      return workflows
    }
    return this.reference(key)
  }
  private async reference(key: string): Promise<unknown> {
    const [row] = await this.database.query<{ ContentJson: unknown }>(`SELECT v.ContentJson FROM KnowledgeDocument d ${currentJoin}
      WHERE d.SourceKey = :source AND d.Visibility = 'internal' AND d.DocumentType = 'reference'`, { source: `reference:${key}` })
    if (!row) throw notFound('Reference dataset', key)
    return jsonValue(row.ContentJson)
  }
}
