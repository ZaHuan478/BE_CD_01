import { loadEnv } from '../src/config/env.js'
import { Database } from '../src/database/database.js'
import { isMasterDataCatalogEntry } from '../src/common/procedure-classification.js'

interface Candidate {
  DocumentId: string
  Code: string
  Title: string
  WorkflowId: string | null
  ContentJson: unknown
}

const apply = process.argv.includes('--apply')
const database = new Database(loadEnv())

function contentOf(value: unknown): Record<string, unknown> {
  return typeof value === 'string' ? JSON.parse(value) as Record<string, unknown>
    : (value ?? {}) as Record<string, unknown>
}

try {
  await database.connect()
  const rows = await database.query<Candidate>(`SELECT d.DocumentId, d.Code, d.Title, d.WorkflowId, v.ContentJson
    FROM KnowledgeDocument d
    JOIN KnowledgeDocumentVersion v ON v.DocumentId = d.DocumentId
      AND v.VersionNumber = d.CurrentVersionNumber
    WHERE d.DocumentType = 'procedure' AND d.Status = 'published'
    ORDER BY d.Code, d.DocumentId`)
  const candidates = rows.filter(row => isMasterDataCatalogEntry(row.Code, row.WorkflowId))
  const invalid = candidates.filter(row => {
    const steps = contentOf(row.ContentJson).steps
    return !Array.isArray(steps) || steps.length !== 1
  })
  if (invalid.length) throw new Error(`Refusing to reclassify multi-step procedures: ${invalid.map(row => row.Code).join(', ')}`)

  console.log(JSON.stringify({
    mode: apply ? 'apply' : 'preview',
    publishedProceduresBefore: rows.length,
    catalogEntries: candidates.map(({ DocumentId, Code, Title }) => ({ id: DocumentId, code: Code, title: Title })),
    publishedProceduresAfter: rows.length - candidates.length
  }, null, 2))

  if (apply && candidates.length) {
    await database.transaction(async runner => {
      for (const row of candidates) {
        const changed = await runner.query<{ affectedRows: number }>(`UPDATE KnowledgeDocument
          SET DocumentType = 'catalog', UpdatedAt = UTC_TIMESTAMP(3)
          WHERE DocumentId = :id AND DocumentType = 'procedure' AND Status = 'published'`, { id: row.DocumentId })
        if (Number(changed[0]?.affectedRows ?? 0) !== 1) throw new Error(`Document changed during reclassification: ${row.DocumentId}`)
        await runner.query(`INSERT INTO AuditLog (EntityType, EntityId, Action, BeforeJson, AfterJson)
          VALUES ('knowledge-document', :id, 'reclassify-master-data-catalog', :before, :after)`, {
          id: row.DocumentId,
          before: JSON.stringify({ code: row.Code, documentType: 'procedure', workflowId: row.WorkflowId }),
          after: JSON.stringify({ code: row.Code, documentType: 'catalog', reason: 'Master Data definition is not a process' })
        })
      }
    })
    console.log(`Reclassified ${candidates.length} Master Data entries as catalog; no documents deleted.`)
  }
} finally {
  await database.close()
}
