import { AppError } from '../common/errors.js'
import type { QueryRunner } from '../database/database.js'
import { scopeRuntimeDatasets } from '../common/dataset-scope.js'

interface ConfigRow {
  ConfigKey: string
  ValueJson: string
}

interface AcknowledgementRow {
  AcknowledgedAt: Date
}

interface StatsRow {
  Modules: number
  Sops: number
  Versions: number
  Steps: number
  Transitions: number
  Articles: number
}

interface BootstrapSource {
  release: Record<string, unknown>
  datasets: Record<string, unknown>
  stats: {
    modules: number
    sops: number
    versions: number
    steps: number
    transitions: number
    articles: number
  }
}

const sourceCacheTtlMs = 5 * 60 * 1000
function parseJson<T>(value: string): T {
  return JSON.parse(value) as T
}

export class BootstrapRepository {
  private sourceCache: BootstrapSource | null = null
  private sourceCacheExpiresAt = 0
  private sourcePromise: Promise<BootstrapSource> | null = null

  constructor(private readonly database: QueryRunner) {}

  private async loadSource(): Promise<BootstrapSource> {
    const releaseRows = await this.database.query<ConfigRow>(`
      SELECT ConfigKey, ValueJson
      FROM AppConfig
      WHERE ScopeType = 'system' AND ScopeId = '*' AND IsActive = 1
        AND ConfigKey = 'ui.release'
    `)
    const releaseRow = releaseRows.find((row) => row.ConfigKey === 'ui.release')
    if (!releaseRow) {
      throw new AppError(503, 'UI_DATA_NOT_SEEDED', 'Frontend compatibility datasets have not been seeded into MySQL')
    }

    const [stats] = await this.database.query<StatsRow>(`
      SELECT
        (SELECT COUNT(*) FROM HrModule) AS Modules,
        (SELECT COUNT(*) FROM Sop) AS Sops,
        (SELECT COUNT(*) FROM SopVersion) AS Versions,
        (SELECT COUNT(*) FROM SopStep) AS Steps,
        (SELECT COUNT(*) FROM SopTransition) AS Transitions,
        (SELECT COUNT(*) FROM GuidanceArticle) AS Articles
    `)

    const release = parseJson<Record<string, unknown>>(releaseRow.ValueJson)
    // Always use persisted content; matching release IDs do not prove identical datasets.
    const configs = await this.database.query<ConfigRow>(`
      SELECT ConfigKey, ValueJson
      FROM AppConfig
      WHERE ScopeType = 'system' AND ScopeId = '*' AND IsActive = 1
        AND ConfigKey LIKE 'ui.dataset.%'
      ORDER BY ConfigKey
    `)
    if (configs.length === 0) {
      throw new AppError(503, 'UI_DATA_NOT_SEEDED', 'Frontend compatibility datasets have not been seeded into MySQL')
    }
    const datasets = Object.fromEntries(configs
      .filter((row) => row.ConfigKey.startsWith('ui.dataset.'))
      .map((row) => [
        row.ConfigKey.slice('ui.dataset.'.length), parseJson<unknown>(row.ValueJson)
      ]))

    return {
      release,
      datasets,
      stats: {
        modules: stats?.Modules ?? 0,
        sops: stats?.Sops ?? 0,
        versions: stats?.Versions ?? 0,
        steps: stats?.Steps ?? 0,
        transitions: stats?.Transitions ?? 0,
        articles: stats?.Articles ?? 0
      }
    }
  }

  private getSource(): Promise<BootstrapSource> {
    if (this.sourceCache && Date.now() < this.sourceCacheExpiresAt) {
      return Promise.resolve(this.sourceCache)
    }
    if (this.sourcePromise) return this.sourcePromise

    this.sourcePromise = this.loadSource()
      .then((source) => {
        this.sourceCache = source
        this.sourceCacheExpiresAt = Date.now() + sourceCacheTtlMs
        return source
      })
      .finally(() => {
        this.sourcePromise = null
      })
    return this.sourcePromise
  }

  async getBootstrap(readableModuleIds: string[]) {
    const source = await this.getSource()
    return {
      source: 'mysql' as const,
      release: source.release,
      datasets: scopeRuntimeDatasets(source.datasets, readableModuleIds),
      stats: source.stats
    }
  }

  async getPolicyAcknowledgement(accountId: string, policyId: string) {
    const [row] = await this.database.query<AcknowledgementRow>(`
      SELECT AcknowledgedAt
      FROM PolicyAcknowledgement
      WHERE AccountId = :accountId AND PolicyId = :policyId
    `, { accountId, policyId })
    return {
      acknowledged: Boolean(row),
      acknowledgedAt: row?.AcknowledgedAt ?? null
    }
  }

  async setPolicyAcknowledgement(accountId: string, policyId: string, acknowledged: boolean) {
    if (!acknowledged) {
      await this.database.query(`
        DELETE FROM PolicyAcknowledgement
        WHERE AccountId = :accountId AND PolicyId = :policyId
      `, { accountId, policyId })
      return { acknowledged: false, acknowledgedAt: null }
    }

    await this.database.query(`
      INSERT INTO PolicyAcknowledgement (AccountId, PolicyId, AcknowledgedAt, UpdatedAt)
      VALUES (:accountId, :policyId, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))
      ON DUPLICATE KEY UPDATE
        AcknowledgedAt = UTC_TIMESTAMP(3), UpdatedAt = UTC_TIMESTAMP(3)
    `, { accountId, policyId })
    const [row] = await this.database.query<AcknowledgementRow>(`
      SELECT AcknowledgedAt FROM PolicyAcknowledgement
      WHERE AccountId = :accountId AND PolicyId = :policyId
    `, { accountId, policyId })
    return { acknowledged: true, acknowledgedAt: row?.AcknowledgedAt ?? new Date() }
  }
}
