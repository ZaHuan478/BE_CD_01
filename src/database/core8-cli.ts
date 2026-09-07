import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createHash } from 'node:crypto'
import mysql from 'mysql2/promise'
import { loadEnv } from '../config/env.js'
import type { QueryRunner, TransactionalDatabase, DatabaseParameters } from './database.js'
import { captureCore8Source, planCore8, snapshotHash, type Core8Snapshot } from './core8-plan.js'
import { installCore8Schema, core8Marker } from './core8-schema.js'
import { applyCore8, verifyCore8 } from './core8-migrate.js'
import { parseSnapshot } from './import-snapshot.js'
import { seedCore8Demo } from './core8-demo.js'

const args = process.argv.slice(2)
const option = (key: string) => args.find(arg => arg.startsWith(`--${key}=`))?.slice(key.length + 3)
const command = args[0] ?? 'plan'
const env = loadEnv()
const connection = await mysql.createConnection({ host: env.database.host, port: env.database.port, database: env.database.name,
  user: env.database.user, password: env.database.password, timezone: 'Z', namedPlaceholders: true,
  supportBigNumbers: true, bigNumberStrings: true, charset: 'utf8mb4' })
const database: TransactionalDatabase = {
  async query<T extends object>(sql: string, parameters: DatabaseParameters = {}): Promise<T[]> {
    const [rows] = await connection.execute(sql, parameters)
    return (Array.isArray(rows) ? rows : [rows]) as T[]
  },
  async transaction<T>(operation: (runner: QueryRunner) => Promise<T>): Promise<T> {
    await connection.beginTransaction()
    try { const result = await operation(database); await connection.commit(); return result }
    catch (error) { await connection.rollback(); throw error }
  }
}
let locked = false
const lockName = 'isop:core8:' + createHash('sha256').update(env.database.name).digest('hex').slice(0, 40)
try {
  if (!['plan', 'apply', 'verify', 'setup', 'seed-demo'].includes(command)) throw new Error('Use plan, apply, verify, setup or seed-demo')
  if (['apply', 'seed-demo'].includes(command) && !args.includes('--maintenance-window')) throw new Error('Stop BE/writers and pass --maintenance-window')
  const [lock] = await database.query<{ Acquired: number }>('SELECT GET_LOCK(:lock, 10) AS Acquired', { lock: lockName })
  if (Number(lock?.Acquired) !== 1) throw new Error('Another core8 operation is in progress')
  locked = true
  if (command === 'plan') {
    const source = await captureCore8Source(database)
    console.log(JSON.stringify(planCore8(source).report, null, 2))
    console.log('PLAN ONLY: database unchanged')
  } else if (command === 'seed-demo') {
    const snapshotPath = option('snapshot') ?? env.database.importSnapshot
    if (!snapshotPath) throw new Error('Supply --snapshot=<legacy snapshot path>')
    const snapshot = parseSnapshot(await readFile(resolve(snapshotPath), 'utf8'))
    console.log(JSON.stringify(await seedCore8Demo(database, snapshot, option('actor') ?? 'admin'), null, 2))
  } else if (command === 'setup') {
    const tables = await database.query('SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE()')
    if (tables.length) throw new Error('setup requires an empty database; use plan/apply for an existing database')
    const id = option('admin-id'), username = option('admin-username'), name = option('admin-name')
    if (!id || !username || !name || id.length > 100 || username.length > 100 || name.length > 200 || !/^[\x20-\x7e]+$/.test(id)) throw new Error('Supply valid --admin-id=, --admin-username= and --admin-name=')
    await installCore8Schema(database)
    await database.query("INSERT INTO Account (AccountId, Username, FullName, ExternalSubject, SystemRole) VALUES (:id, :username, :name, :subject, 'ADMIN')", { id, username, name, subject: option('admin-subject') ?? null })
    await database.query('INSERT INTO SchemaMigration (MigrationId) VALUES (:id)', { id: core8Marker })
    console.log('Created 8 core tables and the explicitly specified administrator. No demo content or demo password was inserted.')
  } else {
    const backup = option('backup')
    if (!backup) throw new Error('Supply --backup=<absolute path outside source control>')
    const backupPath = resolve(backup)
    if (command === 'apply') {
      const source = await captureCore8Source(database)
      const plan = planCore8(source)
      if (!option('fingerprint') || option('fingerprint') !== plan.report.fingerprint) throw new Error('Fingerprint mismatch; run a fresh plan')
      if (plan.report.blockers.length) throw new Error('Resolve plan blockers before applying: ' + plan.report.blockers.join('; '))
      if (plan.report.permissionChanges.length && !args.includes('--accept-permission-simplification')) throw new Error('Review permissionChanges and pass --accept-permission-simplification to accept the Admin/User mapping')
      // Exclusive creation: never overwrite an existing backup.
      await writeFile(backupPath, JSON.stringify(source), { flag: 'wx', mode: 0o600 })
      const reread = JSON.parse(await readFile(backupPath, 'utf8')) as Core8Snapshot
      if (snapshotHash(reread) !== plan.report.fingerprint) throw new Error('Backup verification failed')
      await installCore8Schema(database)
      const result = await applyCore8(database, source, args.includes('--accept-permission-simplification'))
      console.log(JSON.stringify({ ...result, backup: backupPath, next: 'verify, then switch DB_MODEL=core8. Legacy tables are retained; removal requires separate approval.' }, null, 2))
    } else {
      const source = JSON.parse(await readFile(backupPath, 'utf8')) as Core8Snapshot
      if (source.format !== 'core8-backup-v1' || source.database !== env.database.name) throw new Error('Backup belongs to a different format/database')
      const expected = option('fingerprint')
      if (!expected || snapshotHash(source) !== expected) throw new Error('Supply the original reviewed --fingerprint=; backup content does not match')
      const result = await verifyCore8(database, source)
      console.log(JSON.stringify(result, null, 2))
    }
  }
} catch (error) {
  console.error('Core8 operation failed:', error instanceof Error ? error.message : 'Unknown error')
  process.exitCode = 1
} finally {
  if (locked) await database.query('SELECT RELEASE_LOCK(:lock)', { lock: lockName })
  await connection.end()
}
