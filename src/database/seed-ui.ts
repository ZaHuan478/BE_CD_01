import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import sql from 'mssql'
import { loadEnv } from '../config/env.js'

interface UiSeed {
  releaseId: string
  schemaVersion: number
  publishedAt: string
  datasets: Record<string, unknown>
}

const env = loadEnv()
const seedPath = join(dirname(fileURLToPath(import.meta.url)), 'seeds', 'ui-datasets.json')
const seed = JSON.parse(await readFile(seedPath, 'utf8')) as UiSeed
const pool = await new sql.ConnectionPool({
  server: env.sql.server,
  port: env.sql.port,
  database: env.sql.database,
  user: env.sql.user,
  password: env.sql.password,
  requestTimeout: 120_000,
  connectionTimeout: 30_000,
  options: {
    encrypt: env.sql.encrypt,
    trustServerCertificate: env.sql.trustServerCertificate,
    enableArithAbort: true
  }
}).connect()

try {
  const values: Array<[string, unknown]> = [
    ['ui.release', {
      releaseId: seed.releaseId,
      schemaVersion: seed.schemaVersion,
      publishedAt: seed.publishedAt
    }],
    ...Object.entries(seed.datasets).map(([key, value]) => [`ui.dataset.${key}`, value] as [string, unknown])
  ]

  for (const [configKey, value] of values) {
    console.log(`Seeding ${configKey}`)
    await pool.request()
      .input('configKey', sql.NVarChar(200), configKey)
      .input('valueJson', sql.NVarChar(sql.MAX), JSON.stringify(value))
      .query(`
        UPDATE dbo.AppConfig
        SET ValueJson = @valueJson, IsActive = 1,
          UpdatedBy = 'demo-admin', UpdatedAt = SYSUTCDATETIME()
        WHERE ConfigKey = @configKey AND ScopeType = 'system' AND ScopeId = '*';

        IF @@ROWCOUNT = 0
          INSERT INTO dbo.AppConfig
            (ConfigKey, ScopeType, ScopeId, ValueJson, IsActive, UpdatedBy)
          VALUES (@configKey, 'system', '*', @valueJson, 1, 'demo-admin');
      `)
  }

  console.log(`Seeded ${Object.keys(seed.datasets).length} frontend datasets into SQL Server`)
} finally {
  await pool.close()
}
