import { describe, expect, it } from 'vitest'
import { readFile } from 'node:fs/promises'
import Fastify from 'fastify'
import { RuntimeRepository } from '../src/repositories/runtime.repository.js'
import { RuntimeService } from '../src/services/runtime.service.js'
import { runtimeRoutes } from '../src/routes/runtime.routes.js'
import { buildKnowledgeCatalog, workflowIndex } from '../src/common/knowledge-catalog.js'
import { contentHash } from '../src/database/normalize-knowledge.js'
import type { AuthPrincipal } from '../src/auth/types.js'
import type { ModuleRepository } from '../src/repositories/module.repository.js'
import type { AuthService } from '../src/services/auth.service.js'
import type { DatabaseParameters } from '../src/database/database.js'

const workflows = {
  'MODULE-PAY': [{ sopCode: 'SOP-PAY-01', sopTitle: 'Lương', description: 'Tính lương', steps: [{ stepCode: '1', title: 'Kiểm tra', description: 'private body' }] }],
  'LIFE-03': [{ sopCode: 'SOP-EMP-01', sopTitle: 'Nhân sự', description: 'Hồ sơ', steps: [] }]
}
const datasets: Record<string, unknown> = { 'workflow.sopDatabase': workflows, 'policy.registry': [], translations: {} }
const queries: string[] = []
const repository = new RuntimeRepository({ async query<T extends object>(sql: string, params: DatabaseParameters = {}): Promise<T[]> {
  queries.push(sql)
  const key = String(params.configKey).slice('ui.dataset.'.length)
  return key in datasets ? [{ ConfigKey: params.configKey, ValueJson: JSON.stringify(datasets[key]) }] as T[] : []
} })
const modules = { list: async () => ['pay', 'emp'].map(id => ({ id, status: 'published' })) } as unknown as ModuleRepository
const principal = { accountId: 'test-user', grants: [{ permissionCode: 'sop.read', scopeType: 'module', scopeId: 'emp' }] } as AuthPrincipal
const employeeWithoutSopGrant = {
  accountId: 'company-employee', username: 'employee', fullName: 'Nhân viên', email: null,
  systemRole: 'USER', organization: { employeeCode: 'NV-001', company: 'LTA', division: null,
    department: 'Kinh doanh', team: null, jobTitle: 'Chuyên viên', managerAccountId: null },
  groupIds: [], grants: []
} as AuthPrincipal

describe('incremental knowledge reads', () => {
  it('reads only the requested AppConfig key', async () => {
    queries.length = 0
    await repository.dataset('translations')
    expect(queries).toHaveLength(1)
    expect(queries[0]).toContain('ConfigKey = :configKey')
    expect(queries[0]).not.toContain('LIKE')
  })
  it('separates navigation metadata from full step content', () => {
    const index = workflowIndex(workflows)
    expect(JSON.stringify(index)).not.toContain('private body')
    expect(index['MODULE-PAY']).toHaveLength(1)
  })
  it('filters rights before pagination/count and hides forbidden document detail', async () => {
    const service = new RuntimeService(repository, modules)
    const page = await service.documents(principal, { page: 1, pageSize: 1 })
    expect(page.pagination.total).toBe(1)
    expect(page.data[0]?.code).toBe('SOP-EMP-01')
    expect(page.data[0]).not.toHaveProperty('content')
    const forbiddenId = buildKnowledgeCatalog(workflows, [])[0]!.id
    const payId = buildKnowledgeCatalog(workflows, []).find(doc => doc.code === 'SOP-PAY-01')!.id
    expect(forbiddenId).toMatch(/^doc-/)
    await expect(service.document(principal, payId)).rejects.toMatchObject({ statusCode: 404 })
    expect((await service.documents(principal, { q: 'Lương' })).data).toEqual([])
    await expect(service.workflow(principal, 'MODULE-PAY')).rejects.toMatchObject({ statusCode: 404 })
  })
  it('does not elevate a single SOP grant into a module-wide grant', async () => {
    const service = new RuntimeService(repository, modules)
    const sopPrincipal = { ...principal, grants: [{ permissionCode: 'sop.read', scopeType: 'sop' as const, scopeId: 'one-sop' }] }
    expect((await service.documents(sopPrincipal, {})).data).toEqual([])
    await expect(service.dataset(sopPrincipal, 'page.businessNodes')).rejects.toMatchObject({ statusCode: 403 })
  })
  it('makes company policies readable without SOP or module grants', async () => {
    const companyPolicy = {
      id: 'POL-COMPANY-01', code: 'POL-COMPANY-01', title: 'Nội quy công ty',
      summary: 'Áp dụng cho toàn bộ nhân viên', relatedSopCodes: ['SOP-PAY-01']
    }
    const policyRepository = {
      dataset: async (key: string) => key === 'workflow.sopDatabase' ? workflows
        : key === 'policy.registry' ? [companyPolicy] : {}
    } as RuntimeRepository
    const service = new RuntimeService(policyRepository, modules)

    expect(await service.dataset(employeeWithoutSopGrant, 'policy.registry')).toEqual({ data: [companyPolicy] })
    const page = await service.documents(employeeWithoutSopGrant, { type: 'policy' })
    expect(page.pagination.total).toBe(1)
    expect(page.data[0]).toMatchObject({ code: 'POL-COMPANY-01', type: 'policy' })
    expect((await service.document(employeeWithoutSopGrant, page.data[0]!.id)).data.content).toEqual(companyPolicy)
    await expect(service.dataset(employeeWithoutSopGrant, 'page.businessNodes')).rejects.toMatchObject({ statusCode: 403 })
  })
  it('bounds query parameters, allowlists datasets and prevents shared response caching', async () => {
    const app = Fastify()
    await app.register(runtimeRoutes({ authenticate: async () => principal } as unknown as AuthService, repository, modules))
    try {
      expect((await app.inject('/knowledge-documents?pageSize=101')).statusCode).toBe(400)
      expect((await app.inject('/knowledge-documents?page=0')).statusCode).toBe(400)
      expect((await app.inject('/ui/datasets/workflow.sopDatabase')).statusCode).toBe(400)
      const response = await app.inject('/knowledge-documents?page=1&pageSize=1')
      expect(response.statusCode).toBe(200)
      expect(response.headers['cache-control']).toBe('private, no-store')
      expect(response.json().pagination.total).toBe(1)
    } finally { await app.close() }
  })
  it('uses stable contextual IDs and canonical hashes', () => {
    const docs = buildKnowledgeCatalog(workflows, [])
    expect(buildKnowledgeCatalog(Object.fromEntries(Object.entries(workflows).reverse()), [])).toEqual(docs)
    expect(contentHash({ b: 2, a: [1, 2] })).toBe(contentHash({ a: [1, 2], b: 2 }))
    expect(contentHash([1, 2])).not.toBe(contentHash([2, 1]))
  })
  it('converts the local snapshot losslessly when available', async () => {
    let text: string
    try { text = await readFile(new URL('../data/import/legacy-snapshot.json', import.meta.url), 'utf8') } catch { return }
    const snapshot = JSON.parse(text)
    const configs = Object.fromEntries(snapshot.tables.AppConfig.map((row: { ConfigKey: string; ValueJson: string }) => [row.ConfigKey, JSON.parse(row.ValueJson)]))
    const source = configs['ui.dataset.workflow.sopDatabase']
    const policies = configs['ui.dataset.policy.registry']
    const docs = buildKnowledgeCatalog(source, policies)
    expect(docs.length).toBe(Object.values(source).reduce<number>((sum, entries) => sum + (entries as unknown[]).length, 0) + policies.length)
    expect(docs.every(doc => doc.moduleIds.length > 0)).toBe(true)
    for (const doc of docs) {
      const original = doc.workflowId ? source[doc.workflowId].find((item: { sopCode: string }) => item.sopCode === doc.code) : policies.find((item: { id: string }) => JSON.parse(doc.sourceKey)[1] === item.id)
      expect(contentHash(doc.content)).toBe(contentHash(original))
    }
  })
})
