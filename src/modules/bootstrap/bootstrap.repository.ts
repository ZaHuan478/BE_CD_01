import { AppError } from '../../common/errors.js'
import type { QueryRunner } from '../../database/database.js'
import { scopeRuntimeDatasets } from './dataset-scope.js'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

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

interface UiSeed {
  releaseId: string
  schemaVersion: number
  publishedAt: string
  datasets: Record<string, unknown>
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
const bundledSeedPath = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'database',
  'seeds',
  'ui-datasets.json'
)
let bundledSeedPromise: Promise<UiSeed> | null = null

function loadBundledSeed(): Promise<UiSeed> {
  bundledSeedPromise ??= readFile(bundledSeedPath, 'utf8')
    .then((content) => JSON.parse(content) as UiSeed)
    .catch((error) => {
      bundledSeedPromise = null
      throw error
    })
  return bundledSeedPromise
}

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
      FROM dbo.AppConfig
      WHERE ScopeType = 'system' AND ScopeId = '*' AND IsActive = 1
        AND ConfigKey = 'ui.release'
    `)
    const releaseRow = releaseRows.find((row) => row.ConfigKey === 'ui.release')
    if (!releaseRow) {
      throw new AppError(503, 'UI_DATA_NOT_SEEDED', 'Frontend datasets have not been seeded into SQL Server')
    }

    const [stats] = await this.database.query<StatsRow>(`
      SELECT
        (SELECT COUNT(*) FROM dbo.HrModule) AS Modules,
        (SELECT COUNT(*) FROM dbo.Sop) AS Sops,
        (SELECT COUNT(*) FROM dbo.SopVersion) AS Versions,
        (SELECT COUNT(*) FROM dbo.SopStep) AS Steps,
        (SELECT COUNT(*) FROM dbo.SopTransition) AS Transitions,
        (SELECT COUNT(*) FROM dbo.GuidanceArticle) AS Articles
    `)

    const release = parseJson<Record<string, unknown>>(releaseRow.ValueJson)
    const bundledSeed = await loadBundledSeed()
    const bundledReleaseMatches = release.releaseId === bundledSeed.releaseId
      && release.schemaVersion === bundledSeed.schemaVersion

    let datasets: Record<string, unknown>
    if (bundledReleaseMatches) {
      // The SQL rows are seeded from this exact versioned artifact. Reading the local
      // copy avoids transferring ~1.6 MB of NVARCHAR(MAX) data through TDS on every login.
      datasets = bundledSeed.datasets
    } else {
      const configs = await this.database.query<ConfigRow>(`
        SELECT ConfigKey, ValueJson
        FROM dbo.AppConfig
        WHERE ScopeType = 'system' AND ScopeId = '*' AND IsActive = 1
          AND ConfigKey LIKE 'ui.dataset.%'
        ORDER BY ConfigKey
      `)
      if (configs.length === 0) {
        throw new AppError(503, 'UI_DATA_NOT_SEEDED', 'Frontend datasets have not been seeded into SQL Server')
      }
      datasets = Object.fromEntries(configs.map((row) => [
        row.ConfigKey.slice('ui.dataset.'.length),
        parseJson<unknown>(row.ValueJson)
      ]))
    }

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
      source: 'sql-server' as const,
      release: source.release,
      datasets: scopeRuntimeDatasets(source.datasets, readableModuleIds),
      stats: source.stats
    }
  }

  async getPolicyAcknowledgement(accountId: string, policyId: string) {
    const [row] = await this.database.query<AcknowledgementRow>(`
      SELECT AcknowledgedAt
      FROM dbo.PolicyAcknowledgement
      WHERE AccountId = @accountId AND PolicyId = @policyId
    `, { accountId, policyId })
    return {
      acknowledged: Boolean(row),
      acknowledgedAt: row?.AcknowledgedAt ?? null
    }
  }

  async setPolicyAcknowledgement(accountId: string, policyId: string, acknowledged: boolean) {
    if (!acknowledged) {
      await this.database.query(`
        DELETE FROM dbo.PolicyAcknowledgement
        WHERE AccountId = @accountId AND PolicyId = @policyId
      `, { accountId, policyId })
      return { acknowledged: false, acknowledgedAt: null }
    }

    const [row] = await this.database.query<AcknowledgementRow>(`
      MERGE dbo.PolicyAcknowledgement AS target
      USING (SELECT @accountId AS AccountId, @policyId AS PolicyId) AS source
        ON target.AccountId = source.AccountId AND target.PolicyId = source.PolicyId
      WHEN MATCHED THEN
        UPDATE SET AcknowledgedAt = SYSUTCDATETIME(), UpdatedAt = SYSUTCDATETIME()
      WHEN NOT MATCHED THEN
        INSERT (AccountId, PolicyId) VALUES (@accountId, @policyId)
      OUTPUT inserted.AcknowledgedAt;
    `, { accountId, policyId })
    return { acknowledged: true, acknowledgedAt: row?.AcknowledgedAt ?? new Date() }
  }
}
