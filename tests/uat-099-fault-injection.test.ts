import { describe, expect, it, beforeAll, afterAll } from 'vitest'
import { buildApp } from '../src/app.js'
import { loadEnv } from '../src/config/env.js'
import { Database } from '../src/database/database.js'
import type { FastifyInstance } from 'fastify'

describe('UAT-099: Fault Injection an toàn cho AI / RAG Provider', () => {
  let app: FastifyInstance
  let db: Database

  beforeAll(async () => {
    const env = loadEnv()
    db = new Database(env)
    app = await buildApp({ env, database: db })
    await app.ready()
  })

  afterAll(async () => {
    if (app) await app.close()
    if (db) await db.close()
  })

  it('Mô phỏng timeout qua header x-mock-fault: timeout -> Trả về 504 AI_TIMEOUT, không treo, giữ sessionId', async () => {
    const testSessionId = `test-session-timeout-${Date.now()}`
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/chat/completions',
      headers: {
        authorization: 'Bearer dev-token',
        'x-user-id': 'admin',
        'x-system-role': 'ADMIN',
        'x-mock-fault': 'timeout'
      },
      payload: {
        message: 'Kiểm tra mô phỏng timeout',
        sessionId: testSessionId
      }
    })

    expect(res.statusCode).toBe(504)
    const body = res.json()
    expect(body.error?.code).toBe('AI_TIMEOUT')
    expect(body.error?.message).toContain('Timeout mô phỏng UAT')
    expect(body.sessionId).toBe(testSessionId)
  })

  it('Mô phỏng lỗi provider qua header x-mock-fault: error -> Trả về 503 AI_PROVIDER_ERROR, giữ sessionId', async () => {
    const testSessionId = `test-session-error-${Date.now()}`
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/chat/completions',
      headers: {
        authorization: 'Bearer dev-token',
        'x-user-id': 'admin',
        'x-system-role': 'ADMIN',
        'x-mock-fault': 'error'
      },
      payload: {
        message: 'Kiểm tra mô phỏng sự cố AI',
        sessionId: testSessionId
      }
    })

    expect(res.statusCode).toBe(503)
    const body = res.json()
    expect(body.error?.code).toBe('AI_PROVIDER_ERROR')
    expect(body.error?.message).toContain('Lỗi nhà cung cấp mô phỏng UAT')
    expect(body.sessionId).toBe(testSessionId)
  })

  it('Thử lại (Retry) trên cùng sessionId khi không có fault header -> Thành công, không mất session', async () => {
    const testSessionId = `test-session-retry-${Date.now()}`
    // Bước 1: Gặp lỗi giả lập
    const failedRes = await app.inject({
      method: 'POST',
      url: '/api/v1/chat/completions',
      headers: {
        authorization: 'Bearer dev-token',
        'x-user-id': 'admin',
        'x-system-role': 'ADMIN',
        'x-mock-fault': 'error'
      },
      payload: {
        message: 'Quy trình tính lương ứng gồm các bước nào?',
        sessionId: testSessionId
      }
    })
    expect(failedRes.statusCode).toBe(503)

    // Bước 2: Thử lại (không có header mock fault)
    const successRes = await app.inject({
      method: 'POST',
      url: '/api/v1/chat/completions',
      headers: {
        authorization: 'Bearer dev-token',
        'x-user-id': 'admin',
        'x-system-role': 'ADMIN'
      },
      payload: {
        message: 'Quy trình tính lương ứng gồm các bước nào?',
        sessionId: testSessionId
      }
    })

    expect(successRes.statusCode).toBe(200)
    const body = successRes.json()
    expect(body.data.sessionId).toBe(testSessionId)
    expect(body.data.message).toBeTruthy()
    expect(body.data.citations.length).toBeGreaterThan(0)
  }, 45000)
})
