// Opt-in integration check against a disposable local MySQL instance ONLY.
// Start it in a directory named isop-knowledge-test-*; never point this at a user DB.
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import mysql from 'mysql2/promise'
import { Database } from '../src/database/database.ts'
import { initializeDatabase } from '../src/database/initialize.ts'
import { planKnowledge, normalizeKnowledge, verifyKnowledge } from '../src/database/normalize-knowledge.ts'
import { buildApp } from '../src/app.ts'

const port = Number(process.env.ISOP_TEST_MYSQL_PORT)
if (!Number.isInteger(port) || port < 1024 || port === 3306) throw new Error('Set a non-default ISOP_TEST_MYSQL_PORT for the disposable test server')
const admin = await mysql.createConnection({ host: '127.0.0.1', port, user: 'root' })
const [[server]] = await admin.query('SELECT @@datadir AS datadir')
if (!/[/\\]isop-knowledge-test-[a-f0-9]+[/\\]?$/.test(server.datadir)) {
  await admin.end()
  throw new Error('Refusing to change a MySQL instance outside a disposable isop-knowledge-test-* directory')
}
const password = randomBytes(24).toString('hex')
await admin.query('ALTER USER CURRENT_USER() IDENTIFIED BY ?', [password])
await admin.query('CREATE DATABASE isop_knowledge_test CHARACTER SET utf8mb4 COLLATE utf8mb4_vi_0900_ai_ci')
const env = { nodeEnv: 'test', host: '127.0.0.1', port: 3000, logLevel: 'error', authMode: 'development', developmentDemoPassword: 'test-only', corsOrigins: [],
  database: { host: '127.0.0.1', port, name: 'isop_knowledge_test', user: 'root', password, poolMax: 4, importSnapshot: 'data/import/legacy-snapshot.json' } }
const database = new Database(env)
const apps = []
try {
  await initializeDatabase(env)
  await database.connect()
  const plan = await planKnowledge(database)
  assert.equal(plan.report.unresolved.length, 0)
  const applied = await normalizeKnowledge(database, plan.report.fingerprint)
  assert.equal(applied.imported, true)
  await verifyKnowledge(database, plan.documents)
  assert.equal((await normalizeKnowledge(database, plan.report.fingerprint)).imported, false)
  await assert.rejects(normalizeKnowledge(database, 'invalid-fingerprint'), /source changed/)
  const legacy = await buildApp({ database, env })
  const normalized = await buildApp({ database, env: { ...env, knowledgeReadSource: 'normalized' } })
  apps.push(legacy, normalized)
  let requests = 0
  const canonicalPage = body => ({ ...body, data: body.data.map(item => ({ ...item, moduleIds: [...item.moduleIds].sort() })) })
  for (const account of ['demo-admin', 'demo-recruiter', 'demo-cb', 'demo-employee']) {
    const headers = { 'x-user-id': account }
    for (const query of ['page=1&pageSize=100', 'page=2&pageSize=100', 'q=SOP&pageSize=20', 'moduleId=pay&pageSize=20']) {
      const url = '/api/v1/knowledge-documents?' + query
      const [left, right] = await Promise.all([legacy.inject({ url, headers }), normalized.inject({ url, headers })])
      assert.equal(left.statusCode, 200, left.body)
      assert.equal(right.statusCode, 200, `${account} ${query}: ${right.body}`)
      assert.deepEqual(canonicalPage(right.json()), canonicalPage(left.json()))
      assert(!right.body.includes('ContentJson'))
      requests += 2
    }
  }
  const pay = plan.documents.find(document => document.moduleIds.length === 1 && document.moduleIds[0] === 'pay')
  assert(pay)
  const restricted = await normalized.inject({ url: '/api/v1/knowledge-documents/' + pay.id, headers: { 'x-user-id': 'demo-recruiter' } })
  assert.equal(restricted.statusCode, 404)
  const headers = { 'x-user-id': 'demo-admin' }
  const [bootstrap, index, detail] = await Promise.all([
    legacy.inject({ url: '/api/v1/bootstrap', headers }),
    legacy.inject({ url: '/api/v1/ui/workflows', headers }),
    legacy.inject({ url: '/api/v1/ui/workflows/MODULE-PAY', headers })
  ])
  assert.equal(index.statusCode, 200, index.body)
  assert.equal(detail.statusCode, 200, detail.body)
  assert.equal(bootstrap.statusCode, 200)
  console.log(JSON.stringify({ verified: plan.report, apiChecks: requests + 4,
    responseBytes: { oldBootstrap: Buffer.byteLength(bootstrap.body), workflowIndex: Buffer.byteLength(index.body), payrollDetail: Buffer.byteLength(detail.body) } }, null, 2))
} finally {
  await Promise.all(apps.map(app => app.close()))
  await database.close()
  // Only the guarded disposable instance is shut down.
  try { await admin.query('SHUTDOWN') } finally { await admin.end() }
}
