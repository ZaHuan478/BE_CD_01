import { buildApp } from './app.js'
import { loadEnv } from './config/env.js'
import { Database } from './database/database.js'

import { initializeDatabase } from './database/initialize.js'
import { assertCore8Ready, tableExists, core8Marker } from './database/core8-schema.js'
import { ensureSopImportSchema } from './database/sop-import-schema.js'
import { ensureAdministrationSchema } from './database/administration-schema.js'
import { ensureHruxSopLibrary } from './database/hrux-sop-library.js'
import { ensureUserDocumentSchema } from './database/user-document-schema.js'
import { ensureModuleNavigationSchema } from './database/module-navigation-schema.js'
import { ensureRagSchema } from './database/rag-schema.js'
import { ensureSopWorkspaceSchema } from './database/sop-workspace-schema.js'
import { ensureSystemGuideSchema } from './database/system-guide-schema.js'
import { ensureSystemGlossarySchema } from './database/system-glossary-schema.js'
import { ensureCompleteModuleCatalog, ensureCompleteModuleRagScopes } from './database/complete-module-catalog.js'

const env = loadEnv()
const database = new Database(env)
const app = await buildApp({ env, database })

const shutdown = async (signal: string): Promise<void> => {
  app.log.info({ signal }, 'Shutting down')
  await app.close()
  await database.close()
  process.exit(0)
}

process.once('SIGINT', () => { void shutdown('SIGINT') })
process.once('SIGTERM', () => { void shutdown('SIGTERM') })

try {
  if (env.database.initializeOnStart) await initializeDatabase(env)
  await database.connect()
  if (!await tableExists(database, 'SchemaMigration')) {
    const instruction = env.database.provider === 'sqlserver'
      ? 'Run npm run db:transfer:mysql-to-sqlserver first.'
      : 'Run npm run db:setup first.'
    throw new Error(`Database schema is not initialized. ${instruction}`)
  }
  if (env.databaseModel === 'core8') await assertCore8Ready(database)
  else {
    const marker = await database.query('SELECT MigrationId FROM SchemaMigration WHERE MigrationId = :id', { id: core8Marker })
    if (marker.length) throw new Error('This database uses core8. Set DB_MODEL=core8 before starting the backend.')
  }
  // Runtime schema helpers currently contain MySQL DDL. SQL Server receives the
  // equivalent schema from the explicit transfer command and must never run them.
  if (env.database.provider !== 'sqlserver') {
    await ensureSopImportSchema(database)
    await ensureAdministrationSchema(database)
    await ensureUserDocumentSchema(database)
    await ensureModuleNavigationSchema(database)
    await ensureCompleteModuleCatalog(database)
    await ensureRagSchema(database)
    await ensureCompleteModuleRagScopes(database)
    await ensureSopWorkspaceSchema(database)
    await ensureSystemGuideSchema(database)
    await ensureSystemGlossarySchema(database)
    if (env.databaseModel === 'core8') await ensureHruxSopLibrary(database)
  }
  app.log.info(
    { database: env.database.name, databaseModel: env.databaseModel, databaseProvider: database.provider },
    'Connect database successfully'
  )
  await app.listen({ host: env.host, port: env.port })
  app.log.info(
    { host: env.host, port: env.port },
    'Backend started successfully'
  )
} catch (error) {
  app.log.error(error)
  await database.close()
  process.exit(1)
}
