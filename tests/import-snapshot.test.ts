import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { convertValue, importSnapshotContent, importTables, parseSnapshot } from '../src/database/import-snapshot.js'
import type { Snapshot } from '../src/database/import-snapshot.js'
import type { DatabaseParameters, QueryRunner, TransactionalDatabase } from '../src/database/database.js'

const schema = readFileSync(new URL('../src/database/migrations/100_mysql_schema.mysql.sql', import.meta.url), 'utf8')
const columns = Object.fromEntries([...schema.matchAll(/CREATE TABLE IF NOT EXISTS (\w+) \(([\s\S]*?)\n\) ENGINE/g)]
  .map((match) => [match[1], [...match[2]!.matchAll(/^  (\w+) (VARCHAR|CHAR|DATETIME|BOOLEAN|ENUM|BIGINT|INT|TINYINT|TEXT|LONGTEXT)([^\n]*)/gm)]
    .map((column) => ({
      COLUMN_NAME: column[1], DATA_TYPE: column[2]!.toLowerCase(),
      EXTRA: column[3]!.includes('GENERATED ALWAYS') ? 'STORED GENERATED' :
        column[3]!.includes('DEFAULT CURRENT_TIMESTAMP') ? 'DEFAULT_GENERATED' : ''
    }))]))

function fixture(): Snapshot {
  return {
    formatVersion: 1, sourceDatabase: 'test-source', exportedAt: '2026-09-05T00:00:00Z',
    tables: {
      ...Object.fromEntries(importTables.map((table) => [table, []])),
      Account: [
        { AccountId: 'employee', Username: 'employee', FullName: 'Nhân viên', ManagerAccountId: 'manager', CreatedAt: '2026-01-01T00:00:00Z' },
        { AccountId: 'manager', Username: 'manager', FullName: 'Quản lý' }
      ],
      MenuItem: [
        { MenuItemId: 'child', MenuCode: 'child', Title: 'Con', ParentMenuItemId: 'parent' },
        { MenuItemId: 'parent', MenuCode: 'parent', Title: 'Cha' }
      ],
      AppConfig: [{ ConfigKey: 'ui.release', ScopeType: 'system', ScopeId: '*', ValueJson: '{"title":"Dữ liệu thật"}', RowVersion: 'AAAAAAAAB9E=' }]
    }
  }
}

class MemoryDatabase implements TransactionalDatabase {
  rows: Record<string, Record<string, unknown>[]> = Object.fromEntries(
    [...importTables, 'AccountModuleAccess', 'DataImport'].map((table) => [table, []])
  )
  failTable = ''
  rolledBack = false
  async query<T extends object>(sql: string, parameters: DatabaseParameters = {}): Promise<T[]> {
    if (sql === 'SELECT Checksum FROM DataImport') return this.rows.DataImport as T[]
    if (sql.includes('information_schema.COLUMNS')) return columns[String(parameters.table)] as T[]
    const count = sql.match(/SELECT COUNT\(\*\) AS Total FROM `(\w+)`/)
    if (count) return [{ Total: this.rows[count[1]!]!.length }] as T[]
    if (sql.startsWith('INSERT INTO DataImport')) {
      this.rows.DataImport!.push({ Checksum: parameters.checksum }); return []
    }
    const insert = sql.match(/INSERT INTO `(\w+)` \(([^)]+)\)/)
    if (insert) {
      if (insert[1] === this.failTable) throw new Error('Simulated insert failure')
      const names = insert[2]!.replaceAll('`', '').split(',')
      const row = Object.fromEntries(names.map((name, index) => [name, parameters['p' + index]]))
      this.rows[insert[1]!]!.push(row); return []
    }
    const update = sql.match(/UPDATE `(\w+)` SET `(\w+)`.*WHERE `(\w+)` = :id/)
    if (update) {
      if (update[1] === 'MenuItem') expect(sql).not.toContain('UpdatedAt')
      const row = this.rows[update[1]!]!.find((item) => item[update[3]!] === parameters.id)!
      row[update[2]!] = parameters.value; return []
    }
    throw new Error('Unexpected query: ' + sql)
  }
  async transaction<T>(operation: (runner: QueryRunner) => Promise<T>): Promise<T> {
    const before = structuredClone(this.rows)
    try { return await operation(this) } catch (error) {
      this.rows = before; this.rolledBack = true; throw error
    }
  }
}

describe('snapshot import', () => {
  it('preserves Unicode JSON, accepts default-generated dates, defers parent FKs and resets lock tokens', async () => {
    const db = new MemoryDatabase()
    const result = await importSnapshotContent(db, JSON.stringify(fixture()))
    expect(result.imported).toBe(true)
    expect(result.counts.Account).toBe(2)
    expect(db.rows.Account![0]!.ManagerAccountId).toBe('manager')
    expect(db.rows.Account![0]!.CreatedAt).toEqual(new Date('2026-01-01T00:00:00Z'))
    expect(db.rows.MenuItem![0]!.ParentMenuItemId).toBe('parent')
    expect(db.rows.AppConfig![0]).toMatchObject({ ValueJson: '{"title":"Dữ liệu thật"}', RowVersion: '1' })
    expect(db.rows.DataImport).toHaveLength(1)
  })
  it('skips the same snapshot on restart', async () => {
    const db = new MemoryDatabase()
    const content = JSON.stringify(fixture())
    await importSnapshotContent(db, content)
    expect((await importSnapshotContent(db, content)).imported).toBe(false)
    expect(db.rows.Account).toHaveLength(2)
  })
  it('refuses a different snapshot after an import', async () => {
    const db = new MemoryDatabase()
    await importSnapshotContent(db, JSON.stringify(fixture()))
    const next = fixture(); next.exportedAt = '2026-09-06T00:00:00Z'
    await expect(importSnapshotContent(db, JSON.stringify(next))).rejects.toThrow('different snapshot')
  })
  it('refuses existing destination data, including new direct module grants', async () => {
    const db = new MemoryDatabase()
    db.rows.AccountModuleAccess!.push({ AccountId: 'existing' })
    await expect(importSnapshotContent(db, JSON.stringify(fixture()))).rejects.toThrow('empty destination')
    expect(db.rows.Account).toHaveLength(0)
    expect(db.rows.AccountModuleAccess).toHaveLength(1)
  })
  it('rolls back all rows and does not record success on an insert failure', async () => {
    const db = new MemoryDatabase(); db.failTable = 'AppConfig'
    await expect(importSnapshotContent(db, JSON.stringify(fixture()))).rejects.toThrow('Simulated')
    expect(db.rolledBack).toBe(true)
    expect(db.rows.Account).toHaveLength(0)
    expect(db.rows.DataImport).toHaveLength(0)
  })
  it('rejects missing tables, unknown tables and unknown columns instead of dropping them', async () => {
    const missing = fixture(); delete missing.tables.Sop
    expect(() => parseSnapshot(JSON.stringify(missing))).toThrow('Missing snapshot table')
    const extra = fixture(); extra.tables.Unexpected = []
    expect(() => parseSnapshot(JSON.stringify(extra))).toThrow('Unsupported snapshot table')
    const invalid = fixture(); invalid.tables.Account![0]!.UnknownField = 'test'
    await expect(importSnapshotContent(new MemoryDatabase(), JSON.stringify(invalid))).rejects.toThrow('Unsupported destination column')
  })
  it('rejects generated columns and unsafe integer conversion', async () => {
    const invalid = fixture(); invalid.tables.SopVersion = [{ PublishedSlot: 1 }]
    await expect(importSnapshotContent(new MemoryDatabase(), JSON.stringify(invalid))).rejects.toThrow('Unsupported destination column')
    expect(() => convertValue({ COLUMN_NAME: 'AuditLogId', DATA_TYPE: 'bigint', EXTRA: '' }, Number.MAX_SAFE_INTEGER + 1)).toThrow('Unsafe')
    expect(convertValue({ COLUMN_NAME: 'AuditLogId', DATA_TYPE: 'bigint', EXTRA: '' }, '9007199254740993')).toBe('9007199254740993')
  })
})
