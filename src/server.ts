import { buildApp } from './app.js'
import { loadEnv } from './config/env.js'
import { Database } from './database/database.js'

import { initializeDatabase } from './database/initialize.js'

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
  await app.listen({ host: env.host, port: env.port })
} catch (error) {
  app.log.error(error)
  await database.close()
  process.exit(1)
}
