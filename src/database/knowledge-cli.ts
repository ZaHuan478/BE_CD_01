import { readFile } from 'node:fs/promises'
import { Database, type QueryRunner } from './database.js'
import { loadEnv } from '../config/env.js'
import { normalizeKnowledge, planKnowledge, verifyKnowledge } from './normalize-knowledge.js'

const args = process.argv.slice(2)
const apply = args.includes('--apply')
const verify = args.includes('--verify')
const snapshotIndex = args.indexOf('--snapshot')
let database: Database | undefined
try {
  if (apply && verify) throw new Error('Choose --apply or --verify, not both')
  let reader: QueryRunner
  if (snapshotIndex >= 0) {
    if (apply || verify) throw new Error('--snapshot is for an offline plan only; apply/verify must read the live source')
    const filename = args[snapshotIndex + 1]
    if (!filename || filename.startsWith('--')) throw new Error('--snapshot requires a filename')
    const snapshot = JSON.parse(await readFile(filename, 'utf8')) as { tables: Record<string, Record<string, unknown>[]> }
    reader = { async query<T extends object>(sql: string, parameters = {}): Promise<T[]> {
      const values = parameters as Record<string, unknown>
      if (sql.includes('FROM AppConfig')) return (snapshot.tables.AppConfig ?? []).filter(row =>
        row.ConfigKey === values.configKey && row.ScopeType === 'system' && row.ScopeId === '*' && row.IsActive) as T[]
      if (sql.includes('FROM HrModule')) return (snapshot.tables.HrModule ?? []) as T[]
      throw new Error('Unexpected query in offline plan')
    } }
  } else {
    database = new Database(loadEnv())
    await database.connect()
    reader = database
  }
  const plan = await planKnowledge(reader)
  console.log(JSON.stringify(plan.report, null, 2))
  if (apply) {
    const fingerprint = args.find(arg => arg.startsWith('--fingerprint='))?.slice('--fingerprint='.length)
    if (!fingerprint) throw new Error('--apply requires --fingerprint=<fingerprint from the reviewed live plan>')
    console.log(await normalizeKnowledge(database!, fingerprint))
  } else if (verify) {
    await verifyKnowledge(reader, plan.documents)
    console.log('Verified content, metadata, IDs and module links; legacy data remains untouched')
  } else console.log('PLAN ONLY: no rows were written; no tables or permissions were removed')
} catch (error) {
  console.error('Knowledge migration failed:', error instanceof Error ? error.message : 'Unknown error')
  process.exitCode = 1
} finally {
  await database?.close()
}
