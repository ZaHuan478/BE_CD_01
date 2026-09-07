// Opt-in: ONLY a disposable MySQL instance, never the configured .env database.
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import mysql from 'mysql2/promise'
import { Database } from '../src/database/database.ts'
import { initializeDatabase } from '../src/database/initialize.ts'
import { captureCore8Source, planCore8 } from '../src/database/core8-plan.ts'
import { applyCore8, verifyCore8 } from '../src/database/core8-migrate.ts'
import { core8Tables, installCore8Schema } from '../src/database/core8-schema.ts'
import { contentHash, planKnowledge, normalizeKnowledge } from '../src/database/normalize-knowledge.ts'
import { buildApp } from '../src/app.ts'

const port = Number(process.env.ISOP_TEST_MYSQL_PORT)
if (!Number.isInteger(port) || port < 1024 || port === 3306) throw new Error('Set a non-default disposable ISOP_TEST_MYSQL_PORT')
const admin = await mysql.createConnection({ host: '127.0.0.1', port, user: 'root' })
const [[server]] = await admin.query('SELECT @@datadir AS datadir')
if (!/[/\\]isop-core8-test-[a-f0-9]+[/\\]?$/.test(server.datadir)) { await admin.end(); throw new Error('Not a disposable core8 test instance') }
const password = randomBytes(24).toString('hex')
await admin.query('ALTER USER CURRENT_USER() IDENTIFIED BY ?', [password])
const env = { nodeEnv: 'test', host: '127.0.0.1', port: 3000, logLevel: 'error', authMode: 'development', developmentDemoPassword: 'test-only', corsOrigins: [],
  database: { host: '127.0.0.1', port, name: 'core8_source_test', user: 'root', password, poolMax: 4, importSnapshot: 'data/import/legacy-snapshot.json' } }
const source = new Database(env)
const coreEnv = { ...env, databaseModel: 'core8', database: { ...env.database, name: 'core8_clean_test' } }
const clean = new Database(coreEnv)
const apps = []
let checks = 0
try {
  await admin.query('CREATE DATABASE core8_source_test CHARACTER SET utf8mb4 COLLATE utf8mb4_vi_0900_ai_ci')
  await admin.query('CREATE DATABASE core8_clean_test CHARACTER SET utf8mb4 COLLATE utf8mb4_vi_0900_ai_ci')
  await initializeDatabase(env)
  // Exercise the upgrade path from the previous normalized-document migration too.
  const normalized = await planKnowledge(source)
  await normalizeKnowledge(source, normalized.report.fingerprint)
  const snapshot = await captureCore8Source(source)
  const plan = planCore8(snapshot)
  assert.deepEqual(plan.report.blockers, [])
  const legacy = await buildApp({ database: source, env }); apps.push(legacy)
  const baseline = new Map()
  for (const user of ['demo-admin', 'demo-recruiter', 'demo-cb', 'demo-employee']) {
    const headers = { 'x-user-id': user }
    for (const url of ['/api/v1/me', '/api/v1/ui/workflows', '/api/v1/ui/datasets/policy.registry', '/api/v1/knowledge-documents?pageSize=100']) {
      const res = await legacy.inject({ url, headers }); assert.equal(res.statusCode, 200, res.body)
      baseline.set(user + url, res.json())
    }
  }
  await installCore8Schema(source)
  await applyCore8(source, snapshot, true)
  await verifyCore8(source, snapshot)
  assert.equal((await applyCore8(source, snapshot, true)).alreadyApplied, true)
  await installCore8Schema(source) // DDL is rerunnable.
  await installCore8Schema(clean)
  // Copy only the eight core tables to a NEW empty database. No legacy tables are deleted.
  for (const table of core8Tables) {
    const [columns] = await admin.query('SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? ORDER BY ORDINAL_POSITION', ['core8_clean_test', table])
    const names = columns.map(row => '`' + row.COLUMN_NAME + '`').join(',')
    await admin.query(`INSERT INTO core8_clean_test.${table} (${names}) SELECT ${names} FROM core8_source_test.${table}`)
  }
  const tables = await clean.query('SHOW TABLES')
  assert.equal(tables.length, 8)
  await initializeDatabase(coreEnv) // Must NOT create legacy tables or re-seed.
  assert.equal((await clean.query('SHOW TABLES')).length, 8)
  await assert.rejects(initializeDatabase({ ...coreEnv, databaseModel: 'legacy' }), /core8/)
  const app = await buildApp({ database: clean, env: coreEnv }); apps.push(app)
  const request = async (url, user = 'demo-admin', method = 'GET', payload, expected = 200) => {
    const res = await app.inject({ url: '/api/v1' + url, headers: { 'x-user-id': user }, method, payload })
    assert.equal(res.statusCode, expected, `${user} ${method} ${url}: ${res.body}`); checks++
    return res.json()
  }
  for (const user of ['demo-admin', 'demo-recruiter', 'demo-cb', 'demo-employee']) {
    const me = await request('/me', user)
    assert.deepEqual(me.modules.map(m => m.id).sort(), baseline.get(user + '/api/v1/me').modules.map(m => m.id).sort())
    for (const url of ['/ui/workflows', '/ui/datasets/policy.registry']) assert.deepEqual(await request(url, user), baseline.get(user + '/api/v1' + url))
    const list = await request('/knowledge-documents?pageSize=100', user)
    const canonical = body => ({ ...body, data: body.data.map(({ version, ...doc }) => ({ ...doc, moduleIds: [...doc.moduleIds].sort() })) })
    assert.equal(contentHash(canonical(list)), contentHash(canonical(baseline.get(user + '/api/v1/knowledge-documents?pageSize=100'))), 'Catalog content differs for ' + user)
    assert(!JSON.stringify(list).includes('ContentJson'))
  }
  for (const key of ['translations', 'sop.dictionary', 'page.businessNodes', 'coreOperations.config', 'crossFunctional.registry', 'masterData.catalog', 'lifecycle.journey', 'lifecycleStepper.modules', 'erd.clusters']) await request('/ui/datasets/' + key)
  await request('/ui/workflows/MODULE-PAY')
  await request('/admin/users'); await request('/accounts'); await request('/permissions'); await request('/auth/development-accounts')
  const access = await request('/admin/users/demo-admin/module-access')
  assert.equal(access.data.effectiveModuleIds.length, (await request('/me')).modules.length)
  for (const url of ['/bootstrap', '/groups', '/sops']) await request(url, 'demo-admin', 'GET', undefined, 404)
  const pay = plan.documents.find(d => d.visibility === 'module' && d.moduleIds.length === 1 && d.moduleIds[0] === 'pay')
  await request('/knowledge-documents/' + pay.id, 'demo-recruiter', 'GET', undefined, 404)
  await request('/admin/users/demo-recruiter/module-access', 'demo-admin', 'PUT', { moduleIds: ['pay'] })
  await request('/knowledge-documents/' + pay.id, 'demo-recruiter')
  await request('/admin/users/demo-recruiter/module-access', 'demo-admin', 'PUT', { moduleIds: [] })
  await request('/knowledge-documents/' + pay.id, 'demo-recruiter', 'GET', undefined, 403)
  await request('/admin/users/demo-recruiter/module-access', 'demo-admin', 'PUT', { moduleIds: baseline.get('demo-recruiter/api/v1/me').modules.map(module => module.id) })
  const ref = plan.documents.find(d => d.visibility === 'internal')
  await request('/knowledge-documents/' + ref.id, 'demo-admin', 'GET', undefined, 404)
  const body = { code: 'CORE8-TEST', title: 'Core8 guide', type: 'guide', summary: 'Test', moduleIds: ['pay'], content: { steps: [{ id: 's1', title: 'Read', checklist: ['Check'] }], attachments: [], relatedDocuments: [pay.id] } }
  await request('/knowledge-documents', 'demo-employee', 'POST', body, 403)
  const created = await request('/knowledge-documents', 'demo-admin', 'POST', body)
  assert.equal((await request('/knowledge-documents/' + created.id)).data.content.steps[0].id, 's1')
  await request('/knowledge-documents/' + created.id, 'demo-recruiter', 'GET', undefined, 404)
  const next = { expectedVersion: 1, content: { ...body.content, steps: [{ id: 's2', title: 'Changed' }] } }
  assert.equal((await request(`/knowledge-documents/${created.id}/versions`, 'demo-admin', 'POST', next)).version, 2)
  await request(`/knowledge-documents/${created.id}/versions`, 'demo-admin', 'POST', next, 409)
  assert.equal((await request(`/knowledge-documents/${created.id}/versions/1`)).content.steps[0].id, 's1')
  assert.equal((await request(`/knowledge-documents/${created.id}/versions`)).length, 2)
  assert.equal((await request('/knowledge-search?q=Core8&type=guide')).pagination.total, 1)
  const policy = plan.documents.find(d => d.type === 'policy')
  const policyId = policy.versions[0].content.id
  assert.equal((await request('/policy-acknowledgements/' + policyId, 'demo-admin', 'PUT', { acknowledged: true })).acknowledged, true)
  assert.equal((await request('/policy-acknowledgements/' + policyId)).acknowledged, true)
  assert.equal((await request('/policy-acknowledgements/' + policyId, 'demo-admin', 'PUT', { acknowledged: false })).acknowledged, false)
  await request(`/knowledge-documents/${policy.id}/versions`, 'demo-admin', 'POST', { expectedVersion: 1, content: policy.versions[0].content })
  assert.equal((await request('/policy-acknowledgements/' + policyId)).acknowledged, false)
  console.log(JSON.stringify({ coreTables: tables.length, documents: plan.report.businessDocuments, references: plan.report.referenceDocuments, versions: plan.report.versions, apiChecks: checks, sourceTablesRetained: true }, null, 2))
} finally {
  await Promise.all(apps.map(app => app.close()))
  await source.close(); await clean.close()
  try { await admin.query('SHUTDOWN') } finally { await admin.end() }
}
