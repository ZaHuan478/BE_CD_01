import { describe, expect, it } from 'vitest'
import type { DatabaseParameters, QueryRunner } from '../src/database/database.js'
import { CoreDocumentRepository } from '../src/repositories/core-document.repository.js'

describe('company policy repository access', () => {
  it('does not require a module assignment when reading published policies', async () => {
    const statements: string[] = []
    const database = { query: async <T extends object>(sql: string, _parameters: DatabaseParameters = {}) => {
      statements.push(sql)
      if (sql.includes('COUNT(*)')) return [{ Total: 0 }] as T[]
      return [] as T[]
    } } as QueryRunner

    await new CoreDocumentRepository(database).list([], { type: 'policy' })
    expect(statements[0]).toContain("d.DocumentType = 'policy' OR")
    expect(statements[0]).toContain("d.Status = 'published'")
    expect(statements[0]).not.toContain("WHERE 1=0")
  })
})
