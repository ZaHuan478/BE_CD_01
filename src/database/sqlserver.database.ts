import sql, { type ConnectionPool, type Transaction } from 'mssql'
import type { DatabaseConfig } from '../config/env.js'
import type {
  DatabaseParameters,
  ManagedDatabase,
  QueryRunner
} from './database.js'
import { isSqlServerDuplicateError, translateSqlServerStatement } from './sqlserver-dialect.js'

function bindParameters(request: sql.Request, parameters: DatabaseParameters): void {
  for (const [name, value] of Object.entries(parameters)) {
    request.input(name, typeof value === 'boolean' ? Number(value) : value)
  }
}

async function execute<T extends object>(
  runner: ConnectionPool | Transaction,
  statement: string,
  parameters: DatabaseParameters = {}
): Promise<T[]> {
  const translated = translateSqlServerStatement(statement)
  const request = runner.request()
  bindParameters(request, parameters)
  try {
    const result = await request.query<T>(translated.statement)
    if (result.recordset) return Array.from(result.recordset)
    const affectedRows = result.rowsAffected.reduce((sum, value) => sum + value, 0)
    return [{ affectedRows } as T]
  } catch (error) {
    if (translated.ignoreDuplicate && isSqlServerDuplicateError(error)) {
      return [{ affectedRows: 0 } as T]
    }
    throw error
  }
}

export class SqlServerDatabase implements ManagedDatabase {
  readonly provider = 'sqlserver' as const
  private readonly pool: ConnectionPool

  constructor(config: DatabaseConfig) {
    this.pool = new sql.ConnectionPool({
      server: config.host,
      port: config.port,
      database: config.name,
      user: config.user,
      password: config.password,
      requestTimeout: config.requestTimeoutMs ?? 30_000,
      pool: { min: 0, max: config.poolMax },
      options: {
        encrypt: config.encrypt ?? true,
        trustServerCertificate: config.trustServerCertificate ?? false,
        enableArithAbort: true,
        useUTC: true
      }
    })
  }

  async connect(): Promise<void> {
    if (!this.pool.connected) await this.pool.connect()
  }

  async close(): Promise<void> {
    if (this.pool.connected || this.pool.connecting) await this.pool.close()
  }

  async query<T extends object>(statement: string, parameters: DatabaseParameters = {}): Promise<T[]> {
    await this.connect()
    return execute<T>(this.pool, statement, parameters)
  }

  async transaction<T>(operation: (runner: QueryRunner) => Promise<T>): Promise<T> {
    await this.connect()
    const transaction = new sql.Transaction(this.pool)
    await transaction.begin()
    const runner: QueryRunner = {
      provider: this.provider,
      query: <TRow extends object>(statement: string, parameters: DatabaseParameters = {}) =>
        execute<TRow>(transaction, statement, parameters)
    }
    try {
      const result = await operation(runner)
      await transaction.commit()
      return result
    } catch (error) {
      try { await transaction.rollback() } catch { /* retain original failure */ }
      throw error
    }
  }
}
