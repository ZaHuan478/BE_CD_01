import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { TransactionalDatabase } from './database.js'

interface UiSeed {
  releaseId: string
  schemaVersion: number
  publishedAt: string
  datasets: Record<string, unknown>
}

const seedPath = join(dirname(fileURLToPath(import.meta.url)), 'seeds', 'ui-datasets.json')
const seed = JSON.parse(await readFile(seedPath, 'utf8')) as UiSeed
export async function seedUi(database: TransactionalDatabase): Promise<void> {
  const values: Array<[string, unknown]> = [
    ['ui.release', {
      releaseId: seed.releaseId,
      schemaVersion: seed.schemaVersion,
      publishedAt: seed.publishedAt
    }],
    ...Object.entries(seed.datasets).map(([key, value]) => [`ui.dataset.${key}`, value] as [string, unknown])
  ]

  await database.transaction(async (runner) => {
    for (const [configKey, value] of values) {
      await runner.query(`
        INSERT INTO AppConfig (ConfigKey, ScopeType, ScopeId, ValueJson, IsActive, UpdatedBy)
        VALUES (:configKey, 'system', '*', :valueJson, 1, 'demo-admin')
        ON DUPLICATE KEY UPDATE ConfigKey = ConfigKey
      `, { configKey, valueJson: JSON.stringify(value) })
    }
  })

  console.log(`Seeded ${Object.keys(seed.datasets).length} compatibility UI datasets into MySQL`)
}
