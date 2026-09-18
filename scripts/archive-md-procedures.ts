import { loadEnv } from '../src/config/env.js'
import { Database } from '../src/database/database.js'
import { isMasterDataCode } from '../src/common/procedure-classification.js'

interface DocumentRow {
  DocumentId: string
  Code: string
  Title: string
  CurrentVersionNumber: number
}

const apply = process.argv.includes('--apply')
const database = new Database(loadEnv())

try {
  await database.connect()
  const rows = await database.query<DocumentRow>(`SELECT DocumentId, Code, Title, CurrentVersionNumber
    FROM KnowledgeDocument
    WHERE DocumentType = 'procedure' AND Status = 'published'
    ORDER BY Code, DocumentId`)
  const targets = rows.filter(row => isMasterDataCode(row.Code))
  console.log(JSON.stringify({
    mode: apply ? 'apply' : 'preview',
    publishedProceduresBefore: rows.length,
    archive: targets.map(({ DocumentId, Code, Title }) => ({ id: DocumentId, code: Code, title: Title })),
    publishedProceduresAfter: rows.length - targets.length
  }, null, 2))

  if (apply && targets.length) {
    await database.transaction(async runner => {
      for (const row of targets) {
        const updated = await runner.query<{ affectedRows: number }>(`UPDATE KnowledgeDocument
          SET Status = 'archived', UpdatedAt = UTC_TIMESTAMP(3)
          WHERE DocumentId = :id AND DocumentType = 'procedure' AND Status = 'published'
            AND CurrentVersionNumber = :version`, { id: row.DocumentId, version: row.CurrentVersionNumber })
        if (Number(updated[0]?.affectedRows ?? 0) !== 1) throw new Error(`Document changed during archive: ${row.DocumentId}`)
        await runner.query(`UPDATE KnowledgeDocumentVersion
          SET Status = 'archived', EffectiveTo = UTC_TIMESTAMP(3)
          WHERE DocumentId = :id AND VersionNumber = :version AND Status = 'published'`, {
          id: row.DocumentId, version: row.CurrentVersionNumber
        })
        await runner.query(`INSERT INTO AuditLog (EntityType, EntityId, Action, BeforeJson, AfterJson)
          VALUES ('knowledge-document', :id, 'archive-md-procedure', :before, :after)`, {
          id: row.DocumentId,
          before: JSON.stringify({ code: row.Code, title: row.Title, type: 'procedure', status: 'published' }),
          after: JSON.stringify({ type: 'procedure', status: 'archived', reason: 'Remove all MD codes from process library' })
        })
      }
    })
    console.log(`Archived ${targets.length} MD procedures; content and versions remain recoverable.`)
  }
} finally {
  await database.close()
}
