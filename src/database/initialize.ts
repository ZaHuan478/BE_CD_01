import { createHash } from 'node:crypto'
import mysql from 'mysql2/promise'
import type { AppEnv } from '../config/env.js'
import type { DatabaseParameters, TransactionalDatabase } from './database.js'
import { importSnapshot } from './import-snapshot.js'
import { runMigrations } from './migration-runner.js'
import { seedUi } from './seed-ui.js'
import { assertCore8Ready } from './core8-schema.js'
import { ensureSopImportSchema } from './sop-import-schema.js'
import { ensureAdministrationSchema } from './administration-schema.js'
import { ensureHruxSopLibrary } from './hrux-sop-library.js'
import { ensureUserDocumentSchema } from './user-document-schema.js'
import { ensureModuleNavigationSchema } from './module-navigation-schema.js'
import { ensureCompleteModuleCatalog } from './complete-module-catalog.js'
import { ensureSystemGuideSchema } from './system-guide-schema.js'
import { ensureSystemGlossarySchema } from './system-glossary-schema.js'
import { SqlServerDatabase } from './sqlserver.database.js'
import { tableExists } from './core8-schema.js'

export async function initializeDatabase(env: AppEnv, schemaOnly = false): Promise<void> {
  if (env.database.provider === 'sqlserver') {
    const database = new SqlServerDatabase(env.database)
    try {
      await database.connect()
      if (!await tableExists(database, 'SchemaMigration')) {
        throw new Error('SQL Server schema is empty. Run npm run db:transfer:mysql-to-sqlserver before starting the backend.')
      }
    } finally {
      await database.close()
    }
    return
  }
  const pool = mysql.createPool({
    host: env.database.host, port: env.database.port, database: env.database.name,
    user: env.database.user, password: env.database.password,
    connectionLimit: 1, multipleStatements: true, namedPlaceholders: true,
    timezone: 'Z', charset: 'utf8mb4', supportBigNumbers: true, bigNumberStrings: true
  })
  try {
    const connection = await pool.getConnection()
    const lock = 'isop:init:' + createHash('sha256').update(env.database.name).digest('hex').slice(0, 40)
    let locked = false
    try {
      const [rows] = await connection.execute<mysql.RowDataPacket[]>('SELECT GET_LOCK(?, 30) AS acquired', [lock])
      if (Number(rows[0]?.acquired) !== 1) throw new Error('Another database initialization is in progress')
      locked = true
      const database: TransactionalDatabase = {
        async query<T extends object>(statement: string, parameters: DatabaseParameters = {}): Promise<T[]> {
          const [result] = await connection.execute(statement, parameters)
          return (Array.isArray(result) ? result : [result]) as T[]
        },
        async transaction<T>(operation: (runner: TransactionalDatabase) => Promise<T>): Promise<T> {
          try {
            await connection.beginTransaction()
            const result = await operation(database)
            await connection.commit()
            return result
          } catch (error) {
            try { await connection.rollback() } catch { /* retain original failure */ }
            throw error
          }
        }
      }
      if (env.databaseModel === 'core8') {
        await assertCore8Ready(database)
        await ensureSopImportSchema(database)
        await ensureAdministrationSchema(database)
        await ensureUserDocumentSchema(database)
        await ensureModuleNavigationSchema(database)
        await ensureCompleteModuleCatalog(database)
        await ensureSystemGuideSchema(database)
        await ensureSystemGlossarySchema(database)
        await ensureHruxSopLibrary(database)
        return
      }
      const [coreMarker] = await connection.query<mysql.RowDataPacket[]>(`SELECT TABLE_NAME FROM information_schema.TABLES
        WHERE TABLE_SCHEMA = DATABASE() AND LOWER(TABLE_NAME) = 'schemamigration'`)
      if (coreMarker.length) {
        const [ready] = await connection.execute<mysql.RowDataPacket[]>("SELECT MigrationId FROM SchemaMigration WHERE MigrationId = 'core8:verified'")
        if (ready.length) throw new Error('This DB uses core8. Set DB_MODEL=core8; legacy seed/import is disabled.')
      }
      await runMigrations(connection)
      await ensureSopImportSchema(database)
      await ensureAdministrationSchema(database)
      await ensureUserDocumentSchema(database)
      await ensureModuleNavigationSchema(database)
      await ensureCompleteModuleCatalog(database)
      await ensureSystemGuideSchema(database)
      await ensureSystemGlossarySchema(database)
      if (schemaOnly) return
      if (env.database.importSnapshot) {
        const result = await importSnapshot(database, env.database.importSnapshot)
        console.log(result.imported ? 'Snapshot imported and counts verified' : 'Snapshot already imported; skipped', result.counts)
        // No demo seed after import: preserve source users, modules, access grants, and UI JSON exactly.
      } else if (env.database.seedDemo) {
        if (env.nodeEnv === 'production') throw new Error('Demo seeding is forbidden in production')
        await runMigrations(connection, true)
        await seedUi(database)
      }
    } finally {
      if (locked) await connection.execute('SELECT RELEASE_LOCK(?)', [lock])
      connection.release()
    }
  } finally {
    await pool.end()
  }
}


