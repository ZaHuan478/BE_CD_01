import sql from 'mssql'
import type { AppEnv } from '../config/env.js'

export type SqlParameter = string | number | boolean | Date | Buffer | null
export type SqlParameters = Record<string, SqlParameter>

export interface QueryRunner {
  query<T extends object>(statement: string, parameters?: SqlParameters): Promise<T[]>
}

export interface TransactionalDatabase extends QueryRunner {
  transaction<T>(operation: (runner: QueryRunner) => Promise<T>): Promise<T>
}

function bindParameters(request: sql.Request, parameters: SqlParameters): void {
  for (const [name, value] of Object.entries(parameters)) request.input(name, value)
}

export class Database implements TransactionalDatabase {
  private readonly pool: sql.ConnectionPool

  constructor(env: AppEnv) {
    this.pool = new sql.ConnectionPool({
      server: env.sql.server,
      port: env.sql.port,
      database: env.sql.database,
      user: env.sql.user,
      password: env.sql.password,
      options: {
        encrypt: env.sql.encrypt,
        trustServerCertificate: env.sql.trustServerCertificate,
        enableArithAbort: true
      },
      pool: {
        max: env.sql.poolMax,
        min: 0,
        idleTimeoutMillis: 30_000
      }
    })
  }

  async connect(): Promise<void> {
    if (!this.pool.connected) await this.pool.connect()
  }

  async close(): Promise<void> {
    if (this.pool.connected) await this.pool.close()
  }

  async query<T extends object>(statement: string, parameters: SqlParameters = {}): Promise<T[]> {
    await this.connect()
    const request = this.pool.request()
    bindParameters(request, parameters)
    const result = await request.query<T>(statement)
    return result.recordset
  }

  async transaction<T>(operation: (runner: QueryRunner) => Promise<T>): Promise<T> {
    await this.connect()
    const transaction = new sql.Transaction(this.pool)
    await transaction.begin(sql.ISOLATION_LEVEL.READ_COMMITTED)
    const runner: QueryRunner = {
      query: async <TRow extends object>(statement: string, parameters: SqlParameters = {}) => {
        const request = new sql.Request(transaction)
        bindParameters(request, parameters)
        const result = await request.query<TRow>(statement)
        return result.recordset
      }
    }
    try {
      const result = await operation(runner)
      await transaction.commit()
      return result
    } catch (error) {
      try { await transaction.rollback() } catch { /* transaction already closed */ }
      throw error
    }
  }
}
