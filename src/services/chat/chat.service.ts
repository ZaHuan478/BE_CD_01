import crypto from 'node:crypto'
import type { AuthPrincipal } from '../../auth/types.js'
import type { QueryRunner } from '../../database/database.js'
import { ChatRepository } from '../../repositories/chat.repository.js'
import { RetrievalService } from '../rag/retrieval.service.js'
import { GeminiClient, type ChatMessageInput } from '../rag/gemini.client.js'
import { PromptBuilder } from './prompt.builder.js'
import { CitationParser } from './citation.parser.js'
import type { ChatCompletionRequest, ChatCompletionResponse } from '../../schemas/rag.schemas.js'
import { forbidden } from '../../common/errors.js'

export class ChatService {
  private readonly chatRepository: ChatRepository
  private readonly promptBuilder = new PromptBuilder()
  private readonly citationParser = new CitationParser()

  constructor(
    database: QueryRunner,
    private readonly retrievalService: RetrievalService,
    private readonly geminiClient: GeminiClient
  ) {
    this.chatRepository = new ChatRepository(database)
  }

  async listSessions(principal: AuthPrincipal) {
    const rows = await this.chatRepository.listSessions(principal.accountId)
    return rows.map((r) => ({
      sessionId: r.SessionId,
      title: r.Title,
      createdAt: r.CreatedAt.toISOString(),
      updatedAt: r.UpdatedAt.toISOString()
    }))
  }

  async getSessionMessages(principal: AuthPrincipal, sessionId: string) {
    const session = await this.chatRepository.getSession(sessionId, principal.accountId)
    if (!session) throw forbidden('Không tìm thấy phiên trò chuyện hoặc bạn không có quyền xem.')

    const rows = await this.chatRepository.getMessages(sessionId)
    return Promise.all(rows.map(async (m) => {
      let citations = []
      if (m.CitationsJson) {
        try {
          citations = JSON.parse(m.CitationsJson)
        } catch {
          // ignore
        }
      }
      if (m.Role === 'assistant' && Array.isArray(citations) && citations.length) {
        const allowed = await Promise.all((citations as Array<{ sopId?: string }>).map(citation =>
          citation.sopId ? this.retrievalService.canReadDocument(principal, citation.sopId) : Promise.resolve(false)))
        if (allowed.some(value => !value)) {
          return {
            messageId: m.MessageId,
            role: m.Role,
            content: 'Nội dung này không còn khả dụng theo quyền truy cập hiện tại của bạn.',
            citations: [],
            createdAt: m.CreatedAt.toISOString()
          }
        }
      }
      return {
        messageId: m.MessageId,
        role: m.Role,
        content: m.Content,
        citations,
        createdAt: m.CreatedAt.toISOString()
      }
    }))
  }

  async deleteSession(principal: AuthPrincipal, sessionId: string) {
    await this.chatRepository.deleteSession(sessionId, principal.accountId)
  }

  async completeChat(
    principal: AuthPrincipal,
    request: ChatCompletionRequest
  ): Promise<ChatCompletionResponse> {
    const sessionId = request.sessionId || crypto.randomUUID()

    // Đảm bảo session tồn tại
    const owner = await this.chatRepository.getSessionOwner(sessionId)
    if (owner && owner !== principal.accountId) throw forbidden('Không tìm thấy phiên trò chuyện hoặc bạn không có quyền xem.')
    const existing = await this.chatRepository.getSession(sessionId, principal.accountId)
    if (!existing) {
      const shortTitle = request.message.slice(0, 40) + (request.message.length > 40 ? '...' : '')
      await this.chatRepository.createSession(sessionId, principal.accountId, shortTitle)
    }

    // 1. Lưu tin nhắn người dùng
    const userMsgId = crypto.randomUUID()
    await this.chatRepository.saveMessage({
      messageId: userMsgId,
      sessionId,
      role: 'user',
      content: request.message
    })

    // 2. Lấy lịch sử hội thoại gần nhất (tối đa 4 tin nhắn gần nhất)
    const historyRows = await this.chatRepository.getMessages(sessionId, 6)
    const chatHistory: ChatMessageInput[] = historyRows.filter(h => h.Role === 'user').map((h) => ({
      role: 'user',
      text: h.Content
    }))

    // 3. Tìm kiếm ngữ cảnh phù hợp (đã qua lọc quyền RBAC)
    const contextChunks = await this.retrievalService.retrieveRelevantChunks(
      principal,
      request.message,
      request.moduleId
    )

    // 4. Xây dựng System Instruction & Ngữ cảnh
    const systemInstruction = this.promptBuilder.buildSystemInstruction(contextChunks)

    // 5. Gọi Google Gemini sinh câu trả lời
    let rawAnswer = ''
    if (contextChunks.length === 0) {
      rawAnswer = 'Hiện tại trong các quy trình bạn được phép truy cập chưa có hướng dẫn cụ thể về vấn đề này.'
    } else if (this.geminiClient.isConfigured()) {
      try {
        rawAnswer = await this.geminiClient.generateChat(systemInstruction, chatHistory)
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err)
        console.error('Lỗi gọi Gemini generateChat:', errMsg)
        rawAnswer = 'Xin lỗi, hiện tại hệ thống AI đang quá tải hoặc gặp sự cố kết nối. Vui lòng thử lại sau giây lát.'
      }
    } else {
      rawAnswer = 'Trợ lý AI chưa được cấu hình. Vui lòng liên hệ quản trị viên.'
    }

    // 6. Bóc tách và định dạng trích dẫn nguồn
    const { cleanText, citations } = this.citationParser.parseCitations(rawAnswer, contextChunks)

    // 7. Lưu tin nhắn trợ lý AI vào DB
    const assistantMsgId = crypto.randomUUID()
    await this.chatRepository.saveMessage({
      messageId: assistantMsgId,
      sessionId,
      role: 'assistant',
      content: cleanText,
      citations
    })

    return {
      sessionId,
      message: cleanText,
      citations
    }
  }

  async *completeChatStream(
    principal: AuthPrincipal,
    request: ChatCompletionRequest
  ): AsyncGenerator<{ type: 'token' | 'done'; token?: string; citations?: unknown; sessionId?: string }, void, unknown> {
    const sessionId = request.sessionId || crypto.randomUUID()

    const owner = await this.chatRepository.getSessionOwner(sessionId)
    if (owner && owner !== principal.accountId) throw forbidden('Không tìm thấy phiên trò chuyện hoặc bạn không có quyền xem.')
    const existing = await this.chatRepository.getSession(sessionId, principal.accountId)
    if (!existing) {
      const shortTitle = request.message.slice(0, 40) + (request.message.length > 40 ? '...' : '')
      await this.chatRepository.createSession(sessionId, principal.accountId, shortTitle)
    }

    const userMsgId = crypto.randomUUID()
    await this.chatRepository.saveMessage({
      messageId: userMsgId,
      sessionId,
      role: 'user',
      content: request.message
    })

    const historyRows = await this.chatRepository.getMessages(sessionId, 6)
    const chatHistory: ChatMessageInput[] = historyRows.filter(h => h.Role === 'user').map((h) => ({
      role: 'user',
      text: h.Content
    }))

    const contextChunks = await this.retrievalService.retrieveRelevantChunks(
      principal,
      request.message,
      request.moduleId
    )

    const systemInstruction = this.promptBuilder.buildSystemInstruction(contextChunks)

    let fullRawText = ''
    let emittedLength = 0
    const streamSafeText = (raw: string) => {
      let clean = raw.replace(/\[SOURCE_ID:[^\]]+\]/g, '')
      const unfinishedTag = clean.lastIndexOf('[SOURCE')
      if (unfinishedTag >= 0 && !clean.slice(unfinishedTag).includes(']')) clean = clean.slice(0, unfinishedTag)
      return clean
    }
    const emitNewText = (raw: string) => {
      const safe = streamSafeText(raw)
      const token = safe.slice(emittedLength)
      emittedLength = safe.length
      return token
    }
    if (contextChunks.length === 0) {
      fullRawText = 'Hiện tại trong các quy trình bạn được phép truy cập chưa có hướng dẫn cụ thể về vấn đề này.'
      yield { type: 'token', token: emitNewText(fullRawText) }
    } else if (this.geminiClient.isConfigured()) {
      try {
        for await (const chunk of this.geminiClient.generateChatStream(systemInstruction, chatHistory)) {
          fullRawText += chunk
          const token = emitNewText(fullRawText)
          if (token) yield { type: 'token', token }
        }
      } catch (err) {
        console.error('Lỗi stream:', err)
        const interruption = ' (Có lỗi gián đoạn kết nối streaming)'
        fullRawText += interruption
        const token = emitNewText(fullRawText)
        if (token) yield { type: 'token', token }
      }
    } else {
      fullRawText = 'Trợ lý AI chưa được cấu hình. Vui lòng liên hệ quản trị viên.'
      yield { type: 'token', token: emitNewText(fullRawText) }
    }

    const { cleanText, citations } = this.citationParser.parseCitations(fullRawText, contextChunks)
    const finalToken = cleanText.slice(emittedLength)
    if (finalToken) yield { type: 'token', token: finalToken }

    const assistantMsgId = crypto.randomUUID()
    await this.chatRepository.saveMessage({
      messageId: assistantMsgId,
      sessionId,
      role: 'assistant',
      content: cleanText,
      citations
    })

    yield { type: 'done', citations, sessionId }
  }
}
