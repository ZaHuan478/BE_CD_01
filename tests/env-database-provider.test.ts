import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { loadEnv } from '../src/config/env.js'

const keys = [
  'NODE_ENV', 'AUTH_MODE', 'DB_PROVIDER', 'DB_HOST', 'DB_PORT', 'DB_NAME', 'DB_USER', 'DB_PASSWORD', 'DB_POOL_MAX',
  'MYSQL_HOST', 'MYSQL_PORT', 'MYSQL_DATABASE', 'MYSQL_USER', 'MYSQL_PASSWORD', 'MYSQL_POOL_MAX',
  'SQLSERVER_HOST', 'SQLSERVER_PORT', 'SQLSERVER_DATABASE', 'SQLSERVER_USER', 'SQLSERVER_PASSWORD',
  'SQLSERVER_POOL_MAX', 'SQLSERVER_ENCRYPT', 'SQLSERVER_TRUST_SERVER_CERTIFICATE', 'SQLSERVER_REQUEST_TIMEOUT_MS'
] as const

let original: Record<string, string | undefined>

beforeEach(() => {
  original = Object.fromEntries(keys.map(key => [key, process.env[key]]))
  for (const key of keys) delete process.env[key]
  process.env.NODE_ENV = 'test'
  process.env.AUTH_MODE = 'development'
})

afterEach(() => {
  for (const key of keys) {
    const value = original[key]
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
})

describe('database provider environment', () => {
  it('keeps legacy DB_* variables compatible with MySQL', () => {
    process.env.DB_PROVIDER = 'mysql'
    process.env.DB_HOST = 'mysql.local'
    process.env.DB_PORT = '3307'
    process.env.DB_NAME = 'hrm_sop'
    process.env.DB_USER = 'app'
    process.env.DB_PASSWORD = 'secret'
    const env = loadEnv()
    expect(env.database).toMatchObject({
      provider: 'mysql', host: 'mysql.local', port: 3307, name: 'hrm_sop', user: 'app'
    })
  })

  it('loads an independent SQL Server configuration', () => {
    process.env.DB_PROVIDER = 'sqlserver'
    process.env.SQLSERVER_HOST = 'sqlserver.local'
    process.env.SQLSERVER_PORT = '1444'
    process.env.SQLSERVER_DATABASE = 'hrm_sop_sqlserver'
    process.env.SQLSERVER_USER = 'sop_app'
    process.env.SQLSERVER_PASSWORD = 'secret'
    process.env.SQLSERVER_ENCRYPT = 'false'
    process.env.SQLSERVER_TRUST_SERVER_CERTIFICATE = 'true'
    const env = loadEnv()
    expect(env.database).toMatchObject({
      provider: 'sqlserver', host: 'sqlserver.local', port: 1444, name: 'hrm_sop_sqlserver',
      user: 'sop_app', encrypt: false, trustServerCertificate: true, initializeOnStart: false
    })
  })
})
