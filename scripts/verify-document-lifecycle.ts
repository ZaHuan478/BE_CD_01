import assert from 'node:assert/strict'
import { mkdir, writeFile, rm } from 'node:fs/promises'
import { resolve, basename } from 'node:path'
import { randomUUID } from 'node:crypto'
import { loadEnv } from '../src/config/env.js'
import { Database, type TransactionalDatabase } from '../src/database/database.js'
import { ensureSopImportSchema } from '../src/database/sop-import-schema.js'
import { SopImportRepository } from '../src/repositories/sop-import.repository.js'
import { buildApp } from '../src/app.js'

const env = loadEnv()
env.logLevel = 'silent'
const db = new Database(env)
const token = randomUUID()
const files = new Set<string>()
const rollback = new Error('ROLLBACK_LIFECYCLE_VERIFICATION')
let assertions = 0
try {
  await ensureSopImportSchema(db)
  await mkdir(resolve(env.upload.directory), { recursive: true })
  await db.transaction(async runner => {
    const isolated: TransactionalDatabase = { query: runner.query, transaction: operation => operation(runner) }
    const repo = new SopImportRepository(isolated)
    const app = await buildApp({ env, database: isolated })
    const request = async (actor: string, method: 'GET' | 'POST' | 'PUT' | 'DELETE', url: string, status = 200, payload?: object) => {
      const response = await app.inject({ method, url: `/api/v1${url}`, headers: { 'x-user-id': actor }, ...(payload ? { payload } : {}) })
      const expected = method === 'POST' && url.endsWith('/accept') && status === 200 ? 201 : status
      assert.equal(response.statusCode, expected, `${method} ${url}: ${response.body}`)
      assertions++
      return response.headers['content-type']?.includes('application/json') ? response.json() : response.body
    }
    const base = '/sop-imports/'
    const owner = 'demo-recruiter'
    const preview = { code: `TEST-${token}`, title: 'Lifecycle verification', primaryModuleId: 'ats', moduleIds: ['ats'], steps: [{ id: 'step-1', stableKey: 'step-1', code: 'STEP-01', title: 'Original step', nodeKind: 'task' as const, sortOrder: 1 }], transitions: [] }
    const storageKey = `verify-${token}.pdf`
    files.add(storageKey)
    await writeFile(resolve(env.upload.directory, storageKey), '%PDF-1.4\nVerification source', { flag: 'wx' })
    try {
      let item = await repo.create({ id: `verify-${token}`, storageKey, fileName: 'verification.pdf', mediaType: 'application/pdf', fileSize: 30, checksum: '0'.repeat(64), extractedText: 'Verification', preview, warnings: [], accountId: owner, audienceMode: 'module', departmentName: null, jobTitle: null })
      await request('demo-employee', 'POST', base + item.id + '/revise', 403)
      await request(owner, 'POST', base + item.id + '/accept')
      await request('admin', 'POST', base + item.id + '/review', 200, {})
      item = (await request(owner, 'POST', base + item.id + '/revise')).data
      assert.equal(item.reviewedAt, null)
      assert.equal(item.status, 'needs_review')
      await request(owner, 'POST', base + item.id + '/accept')
      await request('demo-admin', 'POST', base + item.id + '/publish', 409)
      await request('admin', 'POST', base + item.id + '/review', 200, {})
      item = (await request('demo-admin', 'POST', base + item.id + '/publish')).data
      await request(owner, 'DELETE', base + item.id, 409)
      await request('demo-manager', 'GET', base + item.id + '/source')
      let revision = (await request(owner, 'POST', base + item.id + '/revise')).data
      files.add(revision.storageKey)
      revision.preview.title = 'Updated title'
      revision.preview.steps[0].title = 'Updated step'
      await request(owner, 'PUT', base + revision.id, 200, revision.preview)
      await request(owner, 'POST', base + revision.id + '/accept')
      let current = (await request('demo-manager', 'GET', '/knowledge-documents/' + item.targetSopId)).data
      assert.equal(current.title, preview.title)
      await request('admin', 'POST', base + revision.id + '/review', 200, {})
      await request('demo-admin', 'POST', base + revision.id + '/publish')
      current = (await request('demo-manager', 'GET', '/knowledge-documents/' + item.targetSopId)).data
      assert.equal(current.title, 'Updated title')
      assert.equal(current.content.steps[0].title, 'Updated step')
      await request(owner, 'POST', base + item.id + '/archive')
      await request('demo-manager', 'GET', '/knowledge-documents/' + item.targetSopId)
      await request('demo-manager', 'POST', base + revision.id + '/archive', 403)
      await request(owner, 'POST', base + revision.id + '/archive')
      await request('demo-manager', 'GET', '/knowledge-documents/' + item.targetSopId, 404)
      await request('demo-manager', 'GET', base + revision.id + '/source', 403)
      await request('demo-manager', 'GET', base + item.id + '/source', 403)
      const draft = (await request(owner, 'POST', base + revision.id + '/revise')).data
      files.add(draft.storageKey)
      await request(owner, 'POST', base + draft.id + '/accept')
      await request(owner, 'DELETE', base + draft.id)
      await request(owner, 'GET', base + draft.id, 404)
      console.log(JSON.stringify({ verifiedRequests: assertions, contentUpdated: true, originalPreservedUntilApproval: true, archivedAccessBlocked: true, testData: 'rolled back' }))
    } finally { await app.close() }
    throw rollback
  })
} catch (error) { if (error !== rollback) throw error }
finally {
  await db.close()
  for (const file of files) await rm(resolve(env.upload.directory, basename(file)), { force: true })
}
