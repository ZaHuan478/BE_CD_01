import 'dotenv/config'
import { transferMySqlToSqlServer, type SqlServerTransferConfig, type TransferDatabaseConfig } from './sqlserver-transfer.js'

function value(primary: string, fallback?: string): string | undefined {
  return process.env[primary]?.trim() || (fallback ? process.env[fallback]?.trim() : undefined) || undefined
}

function required(primary: string, fallback?: string): string {
  const result = value(primary, fallback)
  if (!result) throw new Error(`${primary}${fallback ? ` (or ${fallback})` : ''} is required`)
  return result
}

function numberValue(primary: string, fallback: number, legacy?: string): number {
  const raw = value(primary, legacy)
  if (!raw) return fallback
  const result = Number(raw)
  if (!Number.isFinite(result)) throw new Error(`${primary} must be a number`)
  return result
}

function booleanValue(name: string, fallback: boolean): boolean {
  const raw = value(name)?.toLowerCase()
  if (!raw) return fallback
  if (raw === 'true' || raw === '1') return true
  if (raw === 'false' || raw === '0') return false
  throw new Error(`${name} must be true or false`)
}

function loadSource(): TransferDatabaseConfig {
  return {
    host: required('MYSQL_HOST', 'DB_HOST'),
    port: numberValue('MYSQL_PORT', 3306, 'DB_PORT'),
    database: required('MYSQL_DATABASE', 'DB_NAME'),
    user: required('MYSQL_USER', 'DB_USER'),
    password: required('MYSQL_PASSWORD', 'DB_PASSWORD'),
    poolMax: numberValue('MYSQL_POOL_MAX', 4, 'DB_POOL_MAX')
  }
}

function loadTarget(): SqlServerTransferConfig {
  return {
    host: required('SQLSERVER_HOST'),
    port: numberValue('SQLSERVER_PORT', 1433),
    database: required('SQLSERVER_DATABASE'),
    user: required('SQLSERVER_USER'),
    password: required('SQLSERVER_PASSWORD'),
    poolMax: numberValue('SQLSERVER_POOL_MAX', 4),
    encrypt: booleanValue('SQLSERVER_ENCRYPT', true),
    trustServerCertificate: booleanValue('SQLSERVER_TRUST_SERVER_CERTIFICATE', process.env.NODE_ENV !== 'production'),
    requestTimeoutMs: numberValue('SQLSERVER_TRANSFER_REQUEST_TIMEOUT_MS', 120_000),
    createDatabase: booleanValue('SQLSERVER_CREATE_DATABASE', false)
  }
}

try {
  const source = loadSource()
  const target = loadTarget()
  console.log(`Transferring MySQL ${source.host}:${source.port}/${source.database}`)
  console.log(`Target SQL Server ${target.host}:${target.port}/${target.database}`)
  const result = await transferMySqlToSqlServer(source, target, message => console.log(message))
  console.log(`Transfer verified: ${result.tables.length} tables, ${result.totalSourceRows} source rows, ${result.totalTargetRows} target rows`)
  const extras = result.tables.filter(table => table.status === 'target_has_extra')
  if (extras.length) {
    console.warn(`Target contains additional rows in: ${extras.map(table => table.table).join(', ')}`)
  }
} catch (error) {
  console.error('MySQL to SQL Server transfer failed:', error instanceof Error ? error.message : 'Unknown error')
  process.exitCode = 1
}
