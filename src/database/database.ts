import mysql, { type Pool, type PoolConnection, type ResultSetHeader } from 'mysql2/promise'
import type { AppEnv, DatabaseProvider } from '../config/env.js'
import { SqlServerDatabase } from './sqlserver.database.js'

export type DatabaseParameter = string | number | boolean | Date | Buffer | null
export type DatabaseParameters = Record<string, DatabaseParameter>
// Compatibility aliases retained while repositories are moved module by module.
export type SqlParameter = DatabaseParameter
export type SqlParameters = DatabaseParameters

export interface QueryRunner {
  readonly provider?: DatabaseProvider
  query<T extends object>(statement: string, parameters?: DatabaseParameters): Promise<T[]>
}

export interface TransactionalDatabase extends QueryRunner {
  transaction<T>(operation: (runner: QueryRunner) => Promise<T>): Promise<T>
}

export interface ManagedDatabase extends TransactionalDatabase {
  connect(): Promise<void>
  close(): Promise<void>
}

function normalizeParameters(parameters: DatabaseParameters): DatabaseParameters {
  return Object.fromEntries(Object.entries(parameters).map(([name, value]) => [
    name,
    typeof value === 'boolean' ? Number(value) : value
  ]))
}

async function execute<T extends object>(
  runner: Pool | PoolConnection,
  statement: string,
  parameters: DatabaseParameters = {}
): Promise<T[]> {
  const [result] = await runner.execute(statement, normalizeParameters(parameters))
  if (Array.isArray(result)) return result as T[]
  return [result as ResultSetHeader as T]
}

export class MySqlDatabase implements ManagedDatabase {
  readonly provider = 'mysql' as const
  private readonly pool: Pool

  constructor(env: AppEnv) {
    this.pool = mysql.createPool({
      host: env.database.host,
      port: env.database.port,
      database: env.database.name,
      user: env.database.user,
      password: env.database.password,
      connectionLimit: env.database.poolMax,
      namedPlaceholders: true,
      decimalNumbers: true,
      supportBigNumbers: true,
      bigNumberStrings: true,
      timezone: 'Z',
      charset: 'utf8mb4'
    })
  }

  async connect(): Promise<void> {
    const connection = await this.pool.getConnection()
    connection.release()
  }

  async close(): Promise<void> {
    await this.pool.end()
  }

  async query<T extends object>(statement: string, parameters: DatabaseParameters = {}): Promise<T[]> {
    return execute<T>(this.pool, statement, parameters)
  }

  async transaction<T>(operation: (runner: QueryRunner) => Promise<T>): Promise<T> {
    const connection = await this.pool.getConnection()
    const runner: QueryRunner = {
      provider: this.provider,
      query: <TRow extends object>(statement: string, parameters: DatabaseParameters = {}) =>
        execute<TRow>(connection, statement, parameters)
    }
    try {
      await connection.beginTransaction()
      const result = await operation(runner)
      await connection.commit()
      return result
    } catch (error) {
      try { await connection.rollback() } catch { /* transaction already closed */ }
      throw error
    } finally {
      connection.release()
    }
  }
}

export class Database implements ManagedDatabase {
  readonly provider: DatabaseProvider
  private readonly implementation: ManagedDatabase

  constructor(env: AppEnv) {
    this.provider = env.database.provider ?? 'mysql'
    this.implementation = this.provider === 'sqlserver'
      ? new SqlServerDatabase(env.database)
      : new MySqlDatabase(env)
  }

  connect(): Promise<void> {
    return this.implementation.connect()
  }

  close(): Promise<void> {
    return this.implementation.close()
  }

  query<T extends object>(statement: string, parameters: DatabaseParameters = {}): Promise<T[]> {
    return this.implementation.query<T>(statement, parameters)
  }

  transaction<T>(operation: (runner: QueryRunner) => Promise<T>): Promise<T> {
    return this.implementation.transaction(operation)
  }
}
