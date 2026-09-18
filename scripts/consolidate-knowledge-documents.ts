import { loadEnv } from '../src/config/env.js'
import { Database, type QueryRunner } from '../src/database/database.js'
import { contentHash } from '../src/database/normalize-knowledge.js'

interface DocumentRow {
  DocumentId: string
  Code: string
  Title: string
  WorkflowId: string | null
  SourceKey: string
  Status: string
  Summary: string
  ContentJson: unknown
  CurrentVersionNumber: number
  CreatedBy: string | null
  CreatedAt: Date
}

interface DuplicatePlan {
  code: string
  keep: DocumentRow
  archive: DocumentRow[]
}

const apply = process.argv.includes('--apply')
const env = loadEnv()
const database = new Database(env)
const verifiedTestDocumentIds = new Set([
  'doc_61034ed0-a66d-4fec-a8a2-89c05b10fc7d'
])
const verifiedGuideMappings = [
  {
    documentId: 'doc_4c59b3f2-cdc4-4f59-84c3-e410ea1dd745',
    targetSopCode: 'SOP-EMP-06',
    title: 'Hướng dẫn lập hợp đồng lao động lần đầu cho nhân viên mới',
    moduleIds: ['emp']
  },
  {
    documentId: 'doc_9c74f6b6-1af6-4984-8010-7af47be9a8b3',
    targetSopCode: 'SOP-ATT-01',
    title: 'Hướng dẫn thiết lập ca làm việc và phân ca cho nhân viên mới',
    moduleIds: ['emp', 'att']
  }
] as const

function jsonValue(value: unknown): Record<string, unknown> {
  if (typeof value === 'string') return JSON.parse(value) as Record<string, unknown>
  return (value ?? {}) as Record<string, unknown>
}

function contentScore(row: DocumentRow): number {
  const content = jsonValue(row.ContentJson)
  const textLength = JSON.stringify(content).length
  const preferredWorkflow = row.WorkflowId?.startsWith('MODULE-') ? 100_000
    : row.WorkflowId?.startsWith('CF-') ? 50_000
      : 0
  const sourcePenalty = /^workspace:|^uat:|test/i.test(row.SourceKey) ? -200_000 : 0
  return textLength + preferredWorkflow + sourcePenalty
}

function isExplicitTestDocument(row: DocumentRow): boolean {
  const identity = `${row.Code} ${row.SourceKey}`.toUpperCase()
  return verifiedTestDocumentIds.has(row.DocumentId)
    || /(^|[^A-Z])UAT([^A-Z]|$)|(^|[^A-Z])TEST([^A-Z]|$)|1789448007434/.test(identity)
}

function chooseCanonical(rows: DocumentRow[]): DocumentRow {
  return [...rows].sort((a, b) => contentScore(b) - contentScore(a)
    || a.DocumentId.localeCompare(b.DocumentId))[0]!
}

async function loadDocuments(runner: QueryRunner): Promise<DocumentRow[]> {
  return runner.query<DocumentRow>(`SELECT d.DocumentId, d.Code, d.Title, d.WorkflowId, d.SourceKey,
    d.Status, d.Summary, d.CreatedAt, d.CurrentVersionNumber, v.ContentJson, v.CreatedBy
    FROM KnowledgeDocument d
    JOIN KnowledgeDocumentVersion v ON v.DocumentId = d.DocumentId
      AND v.VersionNumber = d.CurrentVersionNumber
    WHERE d.DocumentType = 'procedure' AND d.Status = 'published'
    ORDER BY d.Code, d.DocumentId`)
}

async function publishReplacementVersion(
  runner: QueryRunner,
  row: DocumentRow,
  content: Record<string, unknown>
): Promise<number> {
  const version = Number(row.CurrentVersionNumber) + 1
  await runner.query(`UPDATE KnowledgeDocumentVersion SET Status = 'archived', EffectiveTo = UTC_TIMESTAMP(3)
    WHERE DocumentId = :id AND VersionNumber = :currentVersion`, {
    id: row.DocumentId,
    currentVersion: row.CurrentVersionNumber
  })
  await runner.query(`INSERT INTO KnowledgeDocumentVersion
    (DocumentId, VersionNumber, Status, ContentJson, ContentHash, CreatedBy)
    VALUES (:id, :version, 'published', :content, :hash, :createdBy)`, {
    id: row.DocumentId,
    version,
    content: JSON.stringify(content),
    hash: contentHash(content),
    createdBy: row.CreatedBy
  })
  return version
}

async function convertProcedureToRelatedGuide(
  runner: QueryRunner,
  source: DocumentRow,
  target: DocumentRow,
  mapping: typeof verifiedGuideMappings[number]
): Promise<void> {
  const sourceContent = {
    ...jsonValue(source.ContentJson),
    kind: 'guide',
    relatedSopCode: mapping.targetSopCode
  }
  const sourceVersion = await publishReplacementVersion(runner, source, sourceContent)
  await runner.query(`UPDATE KnowledgeDocument SET DocumentType = 'guide', Title = :title,
    Summary = :summary, WorkflowId = NULL, CurrentVersionNumber = :version
    WHERE DocumentId = :id`, {
    id: source.DocumentId,
    title: mapping.title,
    summary: `Hướng dẫn thao tác chi tiết liên quan đến ${target.Title}.`,
    version: sourceVersion
  })
  for (const moduleId of mapping.moduleIds) {
    await runner.query(`INSERT IGNORE INTO KnowledgeDocumentModule (DocumentId, ModuleId)
      VALUES (:id, :moduleId)`, { id: source.DocumentId, moduleId })
  }

  const targetContent = jsonValue(target.ContentJson)
  const relatedDocuments = Array.isArray(targetContent.relatedDocuments)
    ? targetContent.relatedDocuments.filter(id => typeof id === 'string') as string[]
    : []
  if (!relatedDocuments.includes(source.DocumentId)) relatedDocuments.push(source.DocumentId)
  const targetVersion = await publishReplacementVersion(runner, target, {
    ...targetContent,
    relatedDocuments
  })
  await runner.query(`UPDATE KnowledgeDocument SET CurrentVersionNumber = :version
    WHERE DocumentId = :id`, { id: target.DocumentId, version: targetVersion })
  await runner.query(`INSERT INTO AuditLog
    (EntityType, EntityId, Action, BeforeJson, AfterJson)
    VALUES ('knowledge-document', :id, 'reclassify-related-guide', :before, :after)`, {
    id: source.DocumentId,
    before: JSON.stringify({ documentType: 'procedure', code: source.Code }),
    after: JSON.stringify({ documentType: 'guide', relatedSopCode: target.Code, targetDocumentId: target.DocumentId })
  })
}

async function referencesFor(runner: QueryRunner, documentId: string) {
  const tables = runner.provider === 'sqlserver'
    ? await runner.query<{ TABLE_NAME: string; COLUMN_NAME: string }>(`SELECT
        OBJECT_NAME(fkc.parent_object_id) AS TABLE_NAME,
        COL_NAME(fkc.parent_object_id, fkc.parent_column_id) AS COLUMN_NAME
      FROM sys.foreign_key_columns fkc
      WHERE OBJECT_NAME(fkc.referenced_object_id) = 'KnowledgeDocument'
        AND COL_NAME(fkc.referenced_object_id, fkc.referenced_column_id) = 'DocumentId'
      ORDER BY TABLE_NAME, COLUMN_NAME`)
    : await runner.query<{ TABLE_NAME: string; COLUMN_NAME: string }>(`SELECT TABLE_NAME, COLUMN_NAME
      FROM information_schema.KEY_COLUMN_USAGE
      WHERE REFERENCED_TABLE_SCHEMA = DATABASE()
        AND REFERENCED_TABLE_NAME = 'KnowledgeDocument'
        AND REFERENCED_COLUMN_NAME = 'DocumentId'
      ORDER BY TABLE_NAME, COLUMN_NAME`)
  const counts: Array<{ table: string; column: string; count: number }> = []
  for (const item of tables) {
    const table = runner.provider === 'sqlserver' ? `[${item.TABLE_NAME}]` : `\`${item.TABLE_NAME}\``
    const column = runner.provider === 'sqlserver' ? `[${item.COLUMN_NAME}]` : `\`${item.COLUMN_NAME}\``
    const [result] = await runner.query<{ Total: number }>(
      `SELECT COUNT(*) AS Total FROM ${table} WHERE ${column} = :id`,
      { id: documentId }
    )
    if (Number(result?.Total ?? 0) > 0) {
      counts.push({ table: item.TABLE_NAME, column: item.COLUMN_NAME, count: Number(result!.Total) })
    }
  }
  return counts
}

async function archiveDuplicate(runner: QueryRunner, plan: DuplicatePlan): Promise<void> {
  for (const duplicate of plan.archive) {
    const modules = await runner.query<{ ModuleId: string }>(
      'SELECT ModuleId FROM KnowledgeDocumentModule WHERE DocumentId = :id',
      { id: duplicate.DocumentId }
    )
    for (const module of modules) {
      await runner.query(`INSERT IGNORE INTO KnowledgeDocumentModule (DocumentId, ModuleId)
        VALUES (:keepId, :moduleId)`, { keepId: plan.keep.DocumentId, moduleId: module.ModuleId })
    }
    await runner.query(`UPDATE KnowledgeDocument SET Status = 'archived'
      WHERE DocumentId = :id AND Status = 'published'`, { id: duplicate.DocumentId })
    await runner.query(`UPDATE KnowledgeDocumentVersion SET Status = 'archived', EffectiveTo = UTC_TIMESTAMP(3)
      WHERE DocumentId = :id AND Status = 'published'`, { id: duplicate.DocumentId })
    await runner.query(`INSERT INTO AuditLog
      (EntityType, EntityId, Action, BeforeJson, AfterJson)
      VALUES ('knowledge-document', :id, 'consolidate-duplicate', :before, :after)`, {
      id: duplicate.DocumentId,
      before: JSON.stringify({ status: duplicate.Status, code: duplicate.Code, workflowId: duplicate.WorkflowId }),
      after: JSON.stringify({ status: 'archived', canonicalDocumentId: plan.keep.DocumentId })
    })
  }
}

async function deleteTestDocument(runner: QueryRunner, row: DocumentRow): Promise<void> {
  const references = await referencesFor(runner, row.DocumentId)
  const unexpected = references.filter(ref => ![
    'KnowledgeDocumentModule', 'KnowledgeDocumentVersion', 'SopWorkspaceDraft'
  ].includes(ref.table))
  if (unexpected.length) {
    throw new Error(`Cannot safely delete ${row.DocumentId}; references: ${JSON.stringify(unexpected)}`)
  }
  await runner.query(`INSERT INTO AuditLog
    (EntityType, EntityId, Action, BeforeJson, AfterJson)
    VALUES ('knowledge-document', :id, 'delete-test-document', :before, :after)`, {
    id: row.DocumentId,
    before: JSON.stringify({
      code: row.Code,
      title: row.Title,
      workflowId: row.WorkflowId,
      sourceKey: row.SourceKey,
      createdBy: row.CreatedBy
    }),
    after: JSON.stringify({ deleted: true, reason: 'Explicit UAT/test data' })
  })
  await runner.query('DELETE FROM SopWorkspaceDraft WHERE DocumentId = :id', { id: row.DocumentId })
  await runner.query('DELETE FROM KnowledgeDocumentModule WHERE DocumentId = :id', { id: row.DocumentId })
  await runner.query('DELETE FROM KnowledgeDocumentVersion WHERE DocumentId = :id', { id: row.DocumentId })
  await runner.query('DELETE FROM KnowledgeDocument WHERE DocumentId = :id', { id: row.DocumentId })
}

try {
  await database.connect()
  const documents = await loadDocuments(database)
  const testDocuments = documents.filter(isExplicitTestDocument)
  const productionDocuments = documents.filter(row => !testDocuments.includes(row))
  const groups = Map.groupBy(productionDocuments, row => row.Code.trim().toLocaleUpperCase('vi'))
  const duplicatePlans: DuplicatePlan[] = []
  for (const [code, rows] of groups) {
    if (rows.length < 2) continue
    const keep = chooseCanonical(rows)
    duplicatePlans.push({ code, keep, archive: rows.filter(row => row.DocumentId !== keep.DocumentId) })
  }
  const guidePlans = verifiedGuideMappings.flatMap(mapping => {
    const source = productionDocuments.find(row => row.DocumentId === mapping.documentId)
    const target = productionDocuments.find(row => row.Code === mapping.targetSopCode)
    return source && target ? [{ mapping, source, target }] : []
  })

  console.log(JSON.stringify({
    mode: apply ? 'apply' : 'preview',
    publishedProcedures: documents.length,
    explicitTestDocuments: testDocuments.map(row => ({
      id: row.DocumentId, code: row.Code, title: row.Title, sourceKey: row.SourceKey, createdBy: row.CreatedBy
    })),
    duplicateGroups: duplicatePlans.map(plan => ({
      code: plan.code,
      keep: { id: plan.keep.DocumentId, workflowId: plan.keep.WorkflowId, score: contentScore(plan.keep) },
      archive: plan.archive.map(row => ({ id: row.DocumentId, workflowId: row.WorkflowId, score: contentScore(row) }))
    })),
    reclassifyAsRelatedGuides: guidePlans.map(plan => ({
      id: plan.source.DocumentId,
      fromCode: plan.source.Code,
      targetSopCode: plan.target.Code,
      newTitle: plan.mapping.title
    })),
    resultingPublishedProcedures: documents.length - testDocuments.length
      - duplicatePlans.reduce((total, plan) => total + plan.archive.length, 0) - guidePlans.length
  }, null, 2))

  if (apply) {
    await database.transaction(async runner => {
      for (const plan of duplicatePlans) await archiveDuplicate(runner, plan)
      for (const row of testDocuments) await deleteTestDocument(runner, row)
      for (const plan of guidePlans) {
        await convertProcedureToRelatedGuide(runner, plan.source, plan.target, plan.mapping)
      }
    })
    console.log('Consolidation completed successfully.')
  }
} finally {
  await database.close()
}
