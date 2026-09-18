import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { buildApp } from '../src/app.js'
import { loadEnv } from '../src/config/env.js'
import { Database } from '../src/database/database.js'
import type { FastifyInstance } from 'fastify'

describe('UAT Search Suite (UAT-053, UAT-054, UAT-055, UAT-056)', () => {
  let app: FastifyInstance
  let db: Database

  beforeAll(async () => {
    const env = loadEnv()
    db = new Database(env)
    app = await buildApp({ env, database: db })
  })

  afterAll(async () => {
    await app.close()
    await db.close()
  })

  // UAT-053: Global SOP Search - Tìm theo tên hoặc mã SOP
  it('UAT-053: should return valid results and not 404 for global SOP search', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/search?q=PAY-01',
      headers: { 'x-user-id': 'admin' }
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.data).toBeInstanceOf(Array)
    expect(body.data.length).toBeGreaterThan(0)
    const item = body.data.find((d: any) => d.code === 'SOP-PAY-01')
    expect(item).toBeDefined()
    expect(item.type).toBe('sop')
    expect(item.title).toContain('tính lương ứng')
    expect(item.moduleIds).toContain('pay')
  })

  // UAT-054: Tìm kiếm Tiếng Việt có dấu và không dấu
  it('UAT-054: should return consistent results for queries with and without Vietnamese diacritics', async () => {
    const resWithAccent = await app.inject({
      method: 'GET',
      url: '/api/v1/search?q=' + encodeURIComponent('Hợp đồng'),
      headers: { 'x-user-id': 'admin' }
    })
    const resWithoutAccent = await app.inject({
      method: 'GET',
      url: '/api/v1/search?q=' + encodeURIComponent('Hop dong'),
      headers: { 'x-user-id': 'admin' }
    })
    expect(resWithAccent.statusCode).toBe(200)
    expect(resWithoutAccent.statusCode).toBe(200)
    const dataAccent = JSON.parse(resWithAccent.body).data
    const dataNoAccent = JSON.parse(resWithoutAccent.body).data
    expect(dataAccent.length).toBeGreaterThan(0)
    expect(dataNoAccent.length).toBeGreaterThan(0)
    // Both forms should match the primary contract documents
    const codesAccent = new Set(dataAccent.map((d: any) => d.code))
    const codesNoAccent = new Set(dataNoAccent.map((d: any) => d.code))
    const intersection = [...codesAccent].filter((c) => codesNoAccent.has(c))
    expect(intersection.length).toBeGreaterThan(0)
  })

  // UAT-055: Tìm kiếm Phân quyền - chỉ trả trong phạm vi được cấp
  it('UAT-055: should forbid access to unauthorized module search', async () => {
    // When querying a specific module not in the principal's readable scope, it must return 403
    // Or when searching globally, items strictly outside user's readable modules are filtered
    const resForbiddenModule = await app.inject({
      method: 'GET',
      url: '/api/v1/search?q=tuy%E1%BB%83n%20d%E1%BB%A5ng&moduleId=non_existent_or_forbidden',
      headers: { 'x-user-id': 'demo-recruiter' }
    })
    expect(resForbiddenModule.statusCode).toBe(403)
  })

  // UAT-056: Tìm kiếm Trạng thái rỗng
  it('UAT-056: should return empty data array with 200 OK for non-existent keyword', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/search?q=khong_the_tim_thay_tu_khoa_nay_12345',
      headers: { 'x-user-id': 'admin' }
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.data).toEqual([])
    expect(body.meta.total).toBe(0)
  })
})
