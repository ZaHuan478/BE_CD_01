import { buildApp } from './app.js'
import { loadEnv } from './config/env.js'
import { Database } from './database/database.js'

import { initializeDatabase } from './database/initialize.js'
import { assertCore8Ready, tableExists, core8Marker } from './database/core8-schema.js'
import { ensureSopImportSchema } from './database/sop-import-schema.js'

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
  if (env.databaseModel === 'core8') await assertCore8Ready(database)
  else if (await tableExists(database, 'SchemaMigration')) {
    const marker = await database.query('SELECT MigrationId FROM SchemaMigration WHERE MigrationId = :id', { id: core8Marker })
    if (marker.length) throw new Error('This database uses core8. Set DB_MODEL=core8 before starting the backend.')
  }
  await ensureSopImportSchema(database)
  await app.listen({ host: env.host, port: env.port })
} catch (error) {
  app.log.error(error)
  await database.close()
  process.exit(1)
}
