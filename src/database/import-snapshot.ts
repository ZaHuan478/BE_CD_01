import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import type { DatabaseParameter, DatabaseParameters, TransactionalDatabase } from './database.js'

export const importTables = [
  'Account', 'UserGroup', 'AccountGroup', 'Permission', 'AccessGrant', 'MenuItem',
  'HrModule', 'MenuModule', 'Sop', 'SopModule', 'SopVersion', 'SopStep',
  'StepArtifact', 'SopTransition', 'SopRelation', 'Document', 'DocumentLink',
  'GlossaryTerm', 'GuidanceArticle', 'RagChunk', 'PolicyAcknowledgement', 'AuditLog', 'AppConfig'
] as const

type SnapshotRow = Record<string, unknown>
export interface Snapshot {
  formatVersion: 1
  sourceDatabase: string
  exportedAt: string
  tables: Record<string, SnapshotRow[]>
}
interface Column { COLUMN_NAME: string; DATA_TYPE: string; EXTRA: string }
const deferred = [
  { table: 'Account', key: 'AccountId', column: 'ManagerAccountId' },
  { table: 'MenuItem', key: 'MenuItemId', column: 'ParentMenuItemId' },
  { table: 'Sop', key: 'SopId', column: 'CurrentPublishedVersionId' }
]

export function parseSnapshot(content: string): Snapshot {
  const snapshot = JSON.parse(content) as Snapshot
  if (snapshot?.formatVersion !== 1 || !snapshot.tables || typeof snapshot.tables !== 'object'
    || typeof snapshot.sourceDatabase !== 'string' || !Number.isFinite(Date.parse(snapshot.exportedAt))) {
    throw new Error('Invalid snapshot header')
  }
  for (const table of importTables) {
    if (!Array.isArray(snapshot.tables[table])) throw new Error('Missing snapshot table: ' + table)
    for (const row of snapshot.tables[table]) {
      if (!row || typeof row !== 'object' || Array.isArray(row)) throw new Error('Invalid row in ' + table)
    }
  }
  for (const table of Object.keys(snapshot.tables)) {
    if (!(importTables as readonly string[]).includes(table)) throw new Error('Unsupported snapshot table: ' + table)
  }
  return snapshot
}

export function convertValue(column: Column, value: unknown): DatabaseParameter {
  // Optimistic-lock tokens are engine-specific: begin a fresh counter in the destination.
  if (column.COLUMN_NAME === 'RowVersion') return '1'
  if (value === null) return null
  if (['datetime', 'timestamp', 'date'].includes(column.DATA_TYPE)) {
    if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) {
      throw new Error('Invalid date in ' + column.COLUMN_NAME)
    }
    return new Date(value)
  }
  if (!['string', 'number', 'boolean'].includes(typeof value)) {
    throw new Error('Unsupported value in ' + column.COLUMN_NAME)
  }
  if (typeof value === 'number' && (!Number.isFinite(value) || (Number.isInteger(value) && !Number.isSafeInteger(value)))) {
    throw new Error('Unsafe numeric value in ' + column.COLUMN_NAME)
  }
  return value as DatabaseParameter
}

/** Caller holds the initialization lock; all data and the import receipt commit together. */
export async function importSnapshot(database: TransactionalDatabase, path: string) {
  const content = await readFile(path, 'utf8')
  return importSnapshotContent(database, content)
}

export async function importSnapshotContent(database: TransactionalDatabase, content: string) {
  const snapshot = parseSnapshot(content)
  const checksum = createHash('sha256').update(content).digest('hex')
  const receipts = await database.query<{ Checksum: string }>('SELECT Checksum FROM DataImport')
  if (receipts.some((row) => row.Checksum === checksum)) return { imported: false, checksum, counts: {} }
  if (receipts.length) throw new Error('A different snapshot was already imported. Manual reconciliation is required.')

  const counts: Record<string, number> = {}
  await database.transaction(async (runner) => {
    // Never silently merge, overwrite, truncate, or ignore conflicting destination records.
    for (const table of [...importTables, 'AccountModuleAccess']) {
      const [row] = await runner.query<{ Total: number }>('SELECT COUNT(*) AS Total FROM `' + table + '`')
      if (Number(row?.Total) !== 0) throw new Error('Import requires an empty destination; table contains data: ' + table)
    }
    for (const table of importTables) {
      const columns = await runner.query<Column>(
        'SELECT COLUMN_NAME, DATA_TYPE, EXTRA FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :table',
        { table }
      )
      const writable = new Map(columns.filter((c) => !/(VIRTUAL|STORED) GENERATED/.test(c.EXTRA)).map((c) => [c.COLUMN_NAME, c]))
      const deferredColumn = deferred.find((item) => item.table === table)
      for (const row of snapshot.tables[table]!) {
        const parameters: DatabaseParameters = {}
        const names = Object.keys(row)
        if (!names.length) throw new Error('Empty snapshot row in ' + table)
        names.forEach((name, index) => {
          const column = writable.get(name)
          if (!column) throw new Error('Unsupported destination column: ' + table + '.' + name)
          parameters['p' + index] = deferredColumn?.column === name ? null : convertValue(column, row[name])
        })
        await runner.query(
          'INSERT INTO `' + table + '` (' + names.map((name) => '`' + name + '`').join(',') +
          ') VALUES (' + names.map((_, index) => ':p' + index).join(',') + ')', parameters
        )
      }
      counts[table] = snapshot.tables[table]!.length
    }
    for (const item of deferred) {
      for (const row of snapshot.tables[item.table]!) {
        if (row[item.column] == null) continue
        await runner.query(
          'UPDATE `' + item.table + '` SET `' + item.column + '` = :value' +
            (item.table === 'MenuItem' ? '' : ', UpdatedAt = UpdatedAt') + ' WHERE `' + item.key + '` = :id',
          { value: String(row[item.column]), id: String(row[item.key]) }
        )
      }
    }
    for (const table of importTables) {
      const [row] = await runner.query<{ Total: number }>('SELECT COUNT(*) AS Total FROM `' + table + '`')
      if (Number(row?.Total) !== counts[table]) throw new Error('Import count mismatch: ' + table)
    }
    await runner.query(
      'INSERT INTO DataImport (Checksum, SourceDatabase, ExportedAt, CountsJson) VALUES (:checksum, :source, :exportedAt, :counts)',
      { checksum, source: snapshot.sourceDatabase, exportedAt: new Date(snapshot.exportedAt), counts: JSON.stringify(counts) }
    )
  })
  return { imported: true, checksum, counts }
}
