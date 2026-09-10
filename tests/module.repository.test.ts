import { describe, expect, it } from 'vitest'
import { ModuleRepository } from '../src/repositories/module.repository.js'
import type { DatabaseParameters, QueryRunner } from '../src/database/database.js'

describe('SOP-scoped module lookup', () => {
  it.each([true, false])('uses the correct relation for core8=%s', async core8 => {
    const calls: { statement: string; parameters?: DatabaseParameters }[] = []
    const database: QueryRunner = {
      async query<T extends object>(statement: string, parameters?: DatabaseParameters): Promise<T[]> {
        calls.push({ statement, parameters })
        return [{ ModuleId: 'emp' }] as T[]
      }
    }
    const repository = new ModuleRepository(database, core8)
    expect(await repository.findModuleIdsForSops([])).toEqual([])
    expect(calls).toHaveLength(0)
    expect(await repository.findModuleIdsForSops(['doc-1', 'doc-2'])).toEqual(['emp'])
    expect(calls[0]?.statement).toContain(core8 ? 'FROM KnowledgeDocumentModule' : 'FROM SopModule')
    expect(calls[0]?.statement).toContain(core8 ? 'WHERE DocumentId IN' : 'WHERE SopId IN')
    expect(calls[0]?.parameters).toEqual({ sop0: 'doc-1', sop1: 'doc-2' })
  })
})
