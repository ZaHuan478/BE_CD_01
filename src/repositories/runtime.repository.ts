import type { QueryRunner } from '../database/database.js'
import { AppError } from '../common/errors.js'
import { CoreDocumentRepository } from './core-document.repository.js'

/** Transitional reader: fetch one persisted dataset, never the entire bootstrap. */
export class RuntimeRepository {
  constructor(private readonly database: QueryRunner, private readonly core8 = false) {}

  async dataset(key: string): Promise<unknown> {
    if (this.core8) return new CoreDocumentRepository(this.database).dataset(key)
    const rows = await this.database.query<{ ConfigKey: string; ValueJson: string }>(`
      SELECT ConfigKey, ValueJson FROM AppConfig
      WHERE ScopeType = 'system' AND ScopeId = '*' AND IsActive = 1
        AND ConfigKey = :configKey
    `, { configKey: `ui.dataset.${key}` })
    const row = rows.find(item => item.ConfigKey === `ui.dataset.${key}`)
    if (!row) throw new AppError(503, 'DATASET_NOT_AVAILABLE', `Dataset ${key} has not been imported`)
    return typeof row.ValueJson === 'string' ? JSON.parse(row.ValueJson) : row.ValueJson
  }
}
