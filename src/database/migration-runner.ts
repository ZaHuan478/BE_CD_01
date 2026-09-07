import { readdir, readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { PoolConnection, RowDataPacket } from 'mysql2/promise'

export async function runMigrations(connection: PoolConnection, includeDemo = false): Promise<void> {
  const directory = join(dirname(fileURLToPath(import.meta.url)), 'migrations')
  await connection.query(`
    CREATE TABLE IF NOT EXISTS SchemaMigration (
      MigrationId VARCHAR(200) CHARACTER SET ascii NOT NULL PRIMARY KEY,
      AppliedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
    ) ENGINE=InnoDB
  `)
  const [core8] = await connection.execute<RowDataPacket[]>("SELECT MigrationId FROM SchemaMigration WHERE MigrationId = 'core8:verified'")
  if (core8.length) throw new Error('Legacy migrations are disabled for a verified core8 database')
  const files = (await readdir(directory)).filter((file) => file.endsWith('.mysql.sql')).sort()
  for (const file of files) {
    if (file === '110_mysql_core_seed.mysql.sql' && !includeDemo) continue
    const [rows] = await connection.execute<RowDataPacket[]>(
      'SELECT MigrationId FROM SchemaMigration WHERE MigrationId = ?', [file]
    )
    if (rows.length) continue
    // MySQL DDL auto-commits. Schema migrations must be rerunnable; do not promise rollback.
    const isDemoSeed = file === '110_mysql_core_seed.mysql.sql'
    try {
      if (isDemoSeed) await connection.beginTransaction()
      await connection.query(await readFile(join(directory, file), 'utf8'))
      await connection.execute('INSERT INTO SchemaMigration (MigrationId) VALUES (?)', [file])
      if (isDemoSeed) await connection.commit()
      console.log('Applied ' + file)
    } catch (error) {
      if (isDemoSeed) await connection.rollback()
      throw error
    }
  }
}
