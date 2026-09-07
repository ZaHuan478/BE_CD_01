import { createHash } from 'node:crypto'
import type { TransactionalDatabase, QueryRunner } from './database.js'
import { buildKnowledgeCatalog, type KnowledgeDocument } from '../common/knowledge-catalog.js'
import { RuntimeRepository } from '../repositories/runtime.repository.js'

export function contentHash(value: unknown): string {
  // JSON columns may reorder object keys, so compare canonical JSON rather than raw text.
  const canonical = (item: unknown): unknown => {
    if (Array.isArray(item)) return item.map(canonical)
    if (typeof item === 'object' && item !== null) return Object.fromEntries(
      Object.entries(item).sort(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => [key, canonical(entry)]))
    return item
  }
  return createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex')
}

export async function planKnowledge(database: QueryRunner) {
  const runtime = new RuntimeRepository(database)
  const [workflows, policies, modules] = await Promise.all([
    runtime.dataset('workflow.sopDatabase'), runtime.dataset('policy.registry'),
    database.query<{ ModuleId: string }>('SELECT ModuleId FROM HrModule')
  ])
  const documents = buildKnowledgeCatalog(workflows, policies)
  const moduleIds = new Set(modules.map(module => module.ModuleId))
  const unresolved = documents.filter(document => !document.moduleIds.length || document.moduleIds.some(id => !moduleIds.has(id)))
  return { documents, report: {
    documents: documents.length,
    procedures: documents.filter(document => document.type === 'procedure').length,
    policies: documents.filter(document => document.type === 'policy').length,
    links: documents.reduce((sum, document) => sum + document.moduleIds.length, 0),
    unresolved: unresolved.map(document => ({ id: document.id, sourceKey: document.sourceKey })),
    fingerprint: contentHash(documents)
  } }
}

export async function verifyKnowledge(database: QueryRunner, documents: KnowledgeDocument[]): Promise<void> {
  const rows = await database.query<{ DocumentId: string; Code: string; Title: string; DocumentType: string; Summary: string; WorkflowId: string | null; SourceKey: string; ContentJson: unknown; ContentHash: string }>(
    'SELECT DocumentId, Code, Title, DocumentType, Summary, WorkflowId, SourceKey, ContentJson, ContentHash FROM KnowledgeDocument')
  const links = await database.query<{ DocumentId: string; ModuleId: string }>('SELECT DocumentId, ModuleId FROM KnowledgeDocumentModule')
  if (rows.length !== documents.length || links.length !== documents.reduce((sum, document) => sum + document.moduleIds.length, 0)) throw new Error('Knowledge row/link counts do not match the source')
  for (const document of documents) {
    const row = rows.find(item => item.DocumentId === document.id)
    const rawContent = row?.ContentJson
    const content = typeof rawContent === 'string' ? JSON.parse(rawContent) : rawContent
    const expectedModules = [...document.moduleIds].sort().join(',')
    const actualModules = links.filter(link => link.DocumentId === document.id).map(link => link.ModuleId).sort().join(',')
    if (!row || row.Code !== document.code || row.Title !== document.title || row.DocumentType !== document.type
      || row.Summary !== document.summary || row.WorkflowId !== document.workflowId || row.SourceKey !== document.sourceKey
      || row.ContentHash !== contentHash(document.content) || contentHash(content) !== contentHash(document.content)
      || actualModules !== expectedModules) throw new Error(`Knowledge verification failed for ${document.id}`)
  }
}

/** Explicit invocation only. Never overwrite a populated target or infer permission changes. */
export async function normalizeKnowledge(database: TransactionalDatabase, expectedFingerprint: string) {
  return database.transaction(async transaction => {
    // Lock source rows during conversion; deterministic primary keys also reject concurrent inserts.
    await transaction.query(`SELECT ConfigKey FROM AppConfig WHERE ScopeType = 'system' AND ScopeId = '*'
      AND ConfigKey IN ('ui.dataset.workflow.sopDatabase', 'ui.dataset.policy.registry') FOR UPDATE`)
    const plan = await planKnowledge(transaction)
    if (plan.report.fingerprint !== expectedFingerprint) throw new Error('Knowledge source changed; run the plan again')
    if (plan.report.unresolved.length) throw new Error('Unresolved document/module mappings; no data was written')
    const [count] = await transaction.query<{ Total: number }>('SELECT COUNT(*) AS Total FROM KnowledgeDocument')
    if (Number(count?.Total ?? 0) > 0) {
      await verifyKnowledge(transaction, plan.documents)
      return { ...plan.report, imported: false }
    }
    for (const document of plan.documents) {
      await transaction.query(`INSERT INTO KnowledgeDocument
        (DocumentId, Code, Title, DocumentType, Summary, WorkflowId, SourceKey, ContentJson, ContentHash)
        VALUES (:id, :code, :title, :type, :summary, :workflowId, :sourceKey, :content, :hash)`, {
        id: document.id, code: document.code, title: document.title, type: document.type,
        summary: document.summary, workflowId: document.workflowId, sourceKey: document.sourceKey,
        content: JSON.stringify(document.content), hash: contentHash(document.content)
      })
      for (const moduleId of document.moduleIds) await transaction.query(`
        INSERT INTO KnowledgeDocumentModule (DocumentId, ModuleId) VALUES (:id, :moduleId)
      `, { id: document.id, moduleId })
    }
    await verifyKnowledge(transaction, plan.documents)
    return { ...plan.report, imported: true }
  })
}
