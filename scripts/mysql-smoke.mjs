import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import mysql from 'mysql2/promise'
import { initializeDatabase } from '../dist/database/initialize.js'
import { Database } from '../dist/database/database.js'
import { buildApp } from '../dist/app.js'
import { importSnapshotContent } from '../dist/database/import-snapshot.js'

// Opt-in only. Uses dedicated NEW test schemas; never drops or empties an existing schema.
const port = Number(process.env.TEST_DB_PORT)
const name = process.env.TEST_DB_NAME
assert(port > 0 && /^isop_test_[a-z0-9_]+$/.test(name ?? ''), 'Set TEST_DB_PORT and a NEW TEST_DB_NAME=isop_test_...')
const credentials = { host: '127.0.0.1', port, user: process.env.TEST_DB_USER ?? 'root', password: process.env.TEST_DB_PASSWORD ?? '' }
const admin = await mysql.createConnection(credentials)
const env = {
  nodeEnv: 'test', host: '127.0.0.1', port: 0, logLevel: 'silent', corsOrigins: [],
  authMode: 'development', developmentDemoPassword: 'smoke-test-only',
  database: { ...credentials, name, poolMax: 2, importSnapshot: 'data/import/legacy-snapshot.json', seedDemo: false }
}
try {
  await admin.query('CREATE DATABASE `' + name + '` CHARACTER SET utf8mb4')
  await initializeDatabase(env)
  await initializeDatabase(env)
  const db = new Database(env)
  const app = await buildApp({ env, database: db })
  try {
    const snapshot = JSON.parse(await readFile(env.database.importSnapshot, 'utf8'))
    for (const [table, rows] of Object.entries(snapshot.tables)) {
      const [result] = await db.query('SELECT COUNT(*) AS total FROM `' + table + '`')
      assert.equal(Number(result.total), rows.length, table + ' count differs')
    }
    const [receipt] = await db.query('SELECT COUNT(*) AS total FROM DataImport')
    assert.equal(Number(receipt.total), 1, 'Restart must not import twice')
    const configs = await db.query('SELECT ConfigKey, ScopeType, ScopeId, ValueJson FROM AppConfig')
    for (const config of configs) {
      const source = snapshot.tables.AppConfig.find((row) => row.ConfigKey === config.ConfigKey && row.ScopeType === config.ScopeType && row.ScopeId === config.ScopeId)
      assert.equal(config.ValueJson, source.ValueJson, 'Persisted JSON changed')
    }
    assert.equal((await app.inject({ method: 'GET', url: '/ready' })).statusCode, 200)
    const accountsResponse = await app.inject({ method: 'GET', url: '/api/v1/auth/development-accounts' })
    assert.equal(accountsResponse.statusCode, 200, accountsResponse.body)
    const accountItems = accountsResponse.json().items
    for (const account of snapshot.tables.Account.filter((row) => row.IsActive)) {
      const response = await app.inject({ method: 'GET', url: '/api/v1/me', headers: { 'x-user-id': account.AccountId } })
      assert.equal(response.statusCode, 200, '/me: ' + response.body)
      assert.deepEqual(
        accountItems.find((item) => item.id === account.AccountId).modules.map((module) => module.id).sort(),
        response.json().modules.filter((module) => module.status === 'published').map((module) => module.id).sort(),
        'Login picker must preserve effective source group access'
      )
      const bootstrap = await app.inject({ method: 'GET', url: '/api/v1/bootstrap', headers: { 'x-user-id': account.AccountId } })
      assert.equal(bootstrap.statusCode, 200, '/bootstrap: ' + bootstrap.body)
      const search = await app.inject({ method: 'GET', url: '/api/v1/search?q=quy', headers: { 'x-user-id': account.AccountId } })
      assert.equal(search.statusCode, 200, '/search: ' + search.body)
    }
    console.log('PASS: actual snapshot counts, exact JSON, repeat startup, readiness, and identity/bootstrap/search for all active accounts')
  } finally {
    await app.close()
    await db.close()
  }
  const rollbackName = name + '_rollback'
  await admin.query('CREATE DATABASE `' + rollbackName + '` CHARACTER SET utf8mb4')
  const rollbackEnv = { ...env, database: { ...env.database, name: rollbackName } }
  await initializeDatabase(rollbackEnv, true)
  const rollbackDb = new Database(rollbackEnv)
  try {
    const invalid = JSON.parse(await readFile(env.database.importSnapshot, 'utf8'))
    invalid.tables.AppConfig[0].UpdatedBy = 'nonexistent-smoke-account'
    await assert.rejects(() => importSnapshotContent(rollbackDb, JSON.stringify(invalid)), /foreign key/i)
    const [empty] = await rollbackDb.query('SELECT (SELECT COUNT(*) FROM Account) AS accounts, (SELECT COUNT(*) FROM DataImport) AS receipts')
    assert.equal(Number(empty.accounts), 0, 'Failed import must roll back accounts')
    assert.equal(Number(empty.receipts), 0, 'Failed import must not record success')
    await rollbackDb.query("INSERT INTO Account (AccountId, Username, FullName) VALUES ('existing', 'existing', 'Smoke test')")
    await assert.rejects(() => importSnapshotContent(rollbackDb, JSON.stringify(invalid)), /empty destination/)
    console.log('PASS: actual FK-error rollback and nonempty-destination protection')
  } finally { await rollbackDb.close() }
  const demoName = name + '_demo'
  await admin.query('CREATE DATABASE `' + demoName + '` CHARACTER SET utf8mb4')
  const demoEnv = { ...env, database: { ...env.database, name: demoName, importSnapshot: '', seedDemo: true } }
  await initializeDatabase(demoEnv)
  await initializeDatabase(demoEnv)
  const demoDb = new Database(demoEnv)
  try {
    const [counts] = await demoDb.query('SELECT (SELECT COUNT(*) FROM Account) AS accounts, (SELECT COUNT(*) FROM HrModule) AS modules')
    assert.equal(Number(counts.accounts), 2)
    assert.equal(Number(counts.modules), 10)
    console.log('PASS: separate demo setup and repeat startup')
  } finally { await demoDb.close() }
} finally { await admin.end() }
