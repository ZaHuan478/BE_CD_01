import { describe, expect, it } from 'vitest'
import type { DatabaseParameters, QueryRunner } from '../src/database/database.js'
import { ensureUserDocumentSchema } from '../src/database/user-document-schema.js'

class CapturingDatabase implements QueryRunner {
  statements: string[] = []

  async query<T extends object>(statement: string, _parameters: DatabaseParameters = {}): Promise<T[]> {
    this.statements.push(statement)
    if (statement.includes('information_schema.TABLES')) {
      return [{ TABLE_NAME: 'SopImportJob' }] as T[]
    }
    return []
  }
}

describe('UserDocument schema reconciliation', () => {
  it('does not recreate permanently deleted conversion sources and persists legacy links', async () => {
    const database = new CapturingDatabase()

    await ensureUserDocumentSchema(database)

    const backfill = database.statements.find(statement => statement.includes('INSERT INTO UserDocument'))
    expect(backfill).toContain("audit.Action = 'admin-permanent-delete'")
    expect(backfill).toContain("JSON_EXTRACT(audit.BeforeJson, '$.sourceImportJobId')")
    expect(backfill).toContain("JSON_EXTRACT(audit.BeforeJson, '$.storageKey')")

    const linkUpdate = database.statements.find(statement =>
      statement.includes('UPDATE SopImportJob job') && statement.includes('document.SourceImportJobId')
    )
    expect(linkUpdate).toContain('SET job.SourceDocumentId = document.DocumentId')
    expect(linkUpdate).toContain('WHERE job.SourceDocumentId IS NULL')

    const staleReconciliation = database.statements.find(statement =>
      statement.includes('UPDATE IndexDocumentState state')
    )
    expect(staleReconciliation).toContain("SET state.IndexStatus = 'stale'")
    expect(staleReconciliation).toContain('sourceDocument.DeletedAt IS NOT NULL')
    expect(staleReconciliation).toContain("deletedSource.Action = 'admin-permanent-delete'")
  })
})
