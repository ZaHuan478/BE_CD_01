import { readdir, readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import sql from 'mssql'
import { loadEnv } from '../config/env.js'

const env = loadEnv()
const migrationsDirectory = join(dirname(fileURLToPath(import.meta.url)), 'migrations')
const files = (await readdir(migrationsDirectory)).filter((file) => file.endsWith('.sql')).sort()
const pool = await new sql.ConnectionPool({
  server: env.sql.server,
  port: env.sql.port,
  database: env.sql.database,
  user: env.sql.user,
  password: env.sql.password,
  options: {
    encrypt: env.sql.encrypt,
    trustServerCertificate: env.sql.trustServerCertificate,
    enableArithAbort: true
  }
}).connect()

try {
  await pool.request().batch(`
    IF OBJECT_ID(N'dbo.SchemaMigration', N'U') IS NULL
    BEGIN
      CREATE TABLE dbo.SchemaMigration (
        MigrationId NVARCHAR(200) NOT NULL PRIMARY KEY,
        AppliedAt DATETIME2(3) NOT NULL CONSTRAINT DF_SchemaMigration_AppliedAt DEFAULT SYSUTCDATETIME()
      );
    END
  `)

  for (const file of files) {
    const exists = await pool.request().input('migrationId', sql.NVarChar(200), file).query<{ Count: number }>(
      'SELECT COUNT(*) AS Count FROM dbo.SchemaMigration WHERE MigrationId = @migrationId'
    )
    if ((exists.recordset[0]?.Count ?? 0) > 0) continue

    const migration = await readFile(join(migrationsDirectory, file), 'utf8')
    const transaction = new sql.Transaction(pool)
    await transaction.begin()
    try {
      for (const batch of migration.split(/^\s*GO\s*$/gim).filter((value) => value.trim())) {
        await new sql.Request(transaction).batch(batch)
      }
      await new sql.Request(transaction)
        .input('migrationId', sql.NVarChar(200), file)
        .query('INSERT INTO dbo.SchemaMigration(MigrationId) VALUES (@migrationId)')
      await transaction.commit()
      console.log(`Applied ${file}`)
    } catch (error) {
      await transaction.rollback()
      throw error
    }
  }
} finally {
  await pool.close()
}
