import { describe, expect, it, beforeAll, afterAll } from 'vitest'
import { loadEnv } from '../src/config/env.js'
import { Database } from '../src/database/database.js'
import { ModuleRepository } from '../src/repositories/module.repository.js'
import { GeminiClient } from '../src/services/rag/gemini.client.js'
import { RetrievalService } from '../src/services/rag/retrieval.service.js'
import { CoreAuthRepository } from '../src/repositories/core-auth.repository.js'
import { ChatService } from '../src/services/chat/chat.service.js'
import { ChatRepository } from '../src/repositories/chat.repository.js'
import { PromptBuilder } from '../src/services/chat/prompt.builder.js'
import { CitationParser } from '../src/services/chat/citation.parser.js'
import type { AuthPrincipal } from '../src/auth/types.js'

describe('UAT-095 (DEF-UAT-004): AI và RAG Chat Tra cứu SOP Nghiệp vụ', () => {
  let db: Database
  let principal: AuthPrincipal
  let chatService: ChatService

  beforeAll(async () => {
    const env = loadEnv()
    db = new Database(env)
    await db.connect()

    const authRepo = new CoreAuthRepository(db)
    const p = await authRepo.findPrincipal({ accountId: 'admin' })
    if (!p) throw new Error('Account admin not found')
    principal = p

    const moduleRepo = new ModuleRepository(db)
    const geminiClient = new GeminiClient(env.gemini)
    const retrievalService = new RetrievalService(db, moduleRepo, geminiClient)
    chatService = new ChatService(
      db,
      retrievalService,
      geminiClient
    )
  }, 30000)

  afterAll(async () => {
    if (db) await db.close()
  })

  it('Câu hỏi 1: Lập hợp đồng lao động lần đầu -> Có câu trả lời chi tiết và citations mở được', async () => {
    const res = await chatService.completeChat(principal, {
      message: 'Quy trình lập Hợp đồng lao động lần đầu cho nhân viên mới thực hiện như thế nào?'
    })

    expect(res.message).toBeTruthy()
    expect(res.message).not.toContain('chưa có hướng dẫn cụ thể về vấn đề này')
    expect(res.citations.length).toBeGreaterThan(0)
    expect(res.citations[0]!.sopCode).toBeDefined()
    expect(res.citations[0]!.routeUrl).toMatch(/^\/employee-lifecycle\/knowledge-documents\//)
  }, 45000)

  it('Câu hỏi 2: Quy trình tính lương ứng -> Có câu trả lời chi tiết và citations mở được', async () => {
    const res = await chatService.completeChat(principal, {
      message: 'Quy trình tính lương ứng gồm các bước nào?'
    })

    expect(res.message).toBeTruthy()
    expect(res.message).not.toContain('chưa có hướng dẫn cụ thể về vấn đề này')
    expect(res.citations.length).toBeGreaterThan(0)
    expect(res.citations[0]!.sopCode).toBeDefined()
    expect(res.citations[0]!.routeUrl).toMatch(/^\/employee-lifecycle\/knowledge-documents\//)
  }, 45000)

  it('Câu hỏi 3: Quy trình chấm công vào ra hằng ngày -> Có câu trả lời chi tiết và citations mở được', async () => {
    const res = await chatService.completeChat(principal, {
      message: 'Quy trình chấm công vào ra hằng ngày gồm những bước nào?'
    })

    expect(res.message).toBeTruthy()
    expect(res.message).not.toContain('chưa có hướng dẫn cụ thể về vấn đề này')
    expect(res.citations.length).toBeGreaterThan(0)
    expect(res.citations[0]!.sopCode).toBeDefined()
    expect(res.citations[0]!.routeUrl).toMatch(/^\/employee-lifecycle\/knowledge-documents\//)
  }, 45000)
})
