import type { QueryRunner } from './database.js'

/** Additive navigation metadata. Re-running never overwrites an administrator's choices. */
export async function ensureModuleNavigationSchema(database: QueryRunner): Promise<void> {
  for (const [column, definition] of [
    ['BusinessCluster', "VARCHAR(32) NOT NULL DEFAULT 'core'"],
    ['IconKey', "VARCHAR(32) NOT NULL DEFAULT 'layers'"]
  ]) {
    const rows = await database.query(`SELECT COLUMN_NAME FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND LOWER(TABLE_NAME) = 'hrmodule' AND COLUMN_NAME = :column`, { column: column! })
    if (rows.length) continue
    await database.query(`ALTER TABLE HrModule ADD COLUMN ${column} ${definition}`)
    if (column === 'BusinessCluster') {
      await database.query("UPDATE HrModule SET BusinessCluster = 'platform' WHERE ModuleId = 'common'")
    }
  }
}
