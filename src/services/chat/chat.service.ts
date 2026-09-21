import crypto from 'node:crypto'
import type { AuthPrincipal } from '../../auth/types.js'
import type { QueryRunner } from '../../database/database.js'
import { ChatRepository } from '../../repositories/chat.repository.js'
import { RetrievalService } from '../rag/retrieval.service.js'
import { GeminiClient, type ChatMessageInput } from '../rag/gemini.client.js'
import { PromptBuilder } from './prompt.builder.js'
import { CitationParser } from './citation.parser.js'
import type { ChatAction, ChatCompletionRequest, ChatCompletionResponse, Citation } from '../../schemas/rag.schemas.js'
import { forbidden } from '../../common/errors.js'
import { classifyChatIntent, type ChatIntent } from './intent.router.js'

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

  /**
   * Keep the assistant useful when the external LLM is unavailable. This is
   * deliberately extractive: it only returns text already retrieved through
   * the RBAC- and version-filtered RAG pipeline, and appends source tags so
   * citations remain available to the user.
   */
  private buildGroundedFallback(contextChunks: Array<{ chunkId: string; title: string; content: string }>): string {
    const sources = contextChunks.slice(0, 3).map((chunk) => {
      const excerpt = chunk.content.trim().slice(0, 720)
      return `- ${chunk.title}: ${excerpt} [SOURCE_ID:${chunk.chunkId}]`
    })
    return [
      'Dịch vụ AI bên ngoài hiện không khả dụng; dưới đây là nội dung trích xuất trực tiếp từ các SOP bạn được phép xem:',
      ...sources
    ].join('\n')
  }

  private buildActions(citations: Citation[], intent: ChatIntent): ChatAction[] {
    if (intent === 'OUT_OF_SCOPE') return []
    return citations.slice(0, 3).map(citation => ({
      type: 'OPEN_SOP' as const,
      label: citation.stepTitle
        ? `${citation.stepCode ? `${citation.stepCode}: ` : ''}${citation.stepTitle}`
        : citation.sopTitle,
      routeUrl: citation.routeUrl,
      sopId: citation.sopId,
      ...(citation.stepId ? { stepId: citation.stepId } : {})
    }))
  }

  private buildOutOfScopeReply(): string {
    return 'Tôi là trợ lý AI của iSOP, hỗ trợ tra cứu quy trình, chính sách, biểu mẫu, người chịu trách nhiệm và thời hạn xử lý. Câu hỏi hiện tại nằm ngoài phạm vi dữ liệu SOP được cấp phép.'
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
    return Promise.all(rows.map(async (m, rowIndex) => {
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
      const previousUserMessage = rows.slice(0, rowIndex)
        .reverse()
        .find(row => row.Role === 'user')
      const messageIntent = classifyChatIntent(previousUserMessage?.Content || m.Content)
      return {
        messageId: m.MessageId,
        role: m.Role,
        content: m.Content,
        citations,
        ...(m.Role === 'assistant'
          ? {
              intent: messageIntent,
              actions: this.buildActions(citations, messageIntent)
            }
          : {}),
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
    const intent = classifyChatIntent(request.message)

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
    const contextChunks = intent === 'OUT_OF_SCOPE'
      ? []
      : await this.retrievalService.retrieveRelevantChunks(principal, request.message, request.moduleId)

    // 4. Xây dựng System Instruction & Ngữ cảnh
    const systemInstruction = this.promptBuilder.buildSystemInstruction(contextChunks)

    // 5. Gọi Google Gemini sinh câu trả lời
    let rawAnswer = ''
    if (intent === 'OUT_OF_SCOPE') {
      rawAnswer = this.buildOutOfScopeReply()
    } else if (contextChunks.length === 0) {
      rawAnswer = 'Hiện tại trong các quy trình bạn được phép truy cập chưa có hướng dẫn cụ thể về vấn đề này.'
    } else if (this.geminiClient.isConfigured()) {
      try {
        rawAnswer = await this.geminiClient.generateChat(systemInstruction, chatHistory)
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err)
        console.error('Lỗi gọi Gemini generateChat:', errMsg)
        rawAnswer = this.buildGroundedFallback(contextChunks)
      }
    } else {
      rawAnswer = this.buildGroundedFallback(contextChunks)
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

    const actions = this.buildActions(citations, intent)
    return {
      sessionId,
      message: cleanText,
      citations,
      intent,
      actions
    }
  }

  async *completeChatStream(
    principal: AuthPrincipal,
    request: ChatCompletionRequest
  ): AsyncGenerator<{
    type: 'progress' | 'token' | 'done'
    stage?: 'retrieving' | 'generating' | 'saving'
    message?: string
    token?: string
    citations?: Citation[]
    actions?: ChatAction[]
    intent?: ChatIntent
    sessionId?: string
  }, void, unknown> {
    const sessionId = request.sessionId || crypto.randomUUID()
    const intent = classifyChatIntent(request.message)

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

    const contextChunks = intent === 'OUT_OF_SCOPE'
      ? []
      : await this.retrievalService.retrieveRelevantChunks(principal, request.message, request.moduleId)

    yield {
      type: 'progress',
      stage: 'retrieving',
      message: contextChunks.length
        ? `Đã tìm thấy ${contextChunks.length} nguồn phù hợp trong phạm vi quyền truy cập.`
        : 'Chưa tìm thấy nguồn phù hợp trong phạm vi quyền truy cập.'
    }

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
    if (intent === 'OUT_OF_SCOPE') {
      fullRawText = this.buildOutOfScopeReply()
      yield { type: 'token', token: emitNewText(fullRawText) }
    } else if (contextChunks.length === 0) {
      fullRawText = 'Hiện tại trong các quy trình bạn được phép truy cập chưa có hướng dẫn cụ thể về vấn đề này.'
      yield { type: 'token', token: emitNewText(fullRawText) }
    } else if (this.geminiClient.isConfigured()) {
      yield { type: 'progress', stage: 'generating', message: 'Đang tổng hợp câu trả lời có dẫn chứng.' }
      try {
        for await (const chunk of this.geminiClient.generateChatStream(systemInstruction, chatHistory)) {
          fullRawText += chunk
          const token = emitNewText(fullRawText)
          if (token) yield { type: 'token', token }
        }
      } catch (err) {
        console.error('Lỗi stream:', err)
        const fallback = this.buildGroundedFallback(contextChunks)
        // Some provider tokens may already have reached the client. Append the
        // extractive fallback instead of replacing the prefix, otherwise the
        // client-side cursor would skip the beginning of the fallback text.
        fullRawText = fullRawText.trim() ? `${fullRawText}\n\n${fallback}` : fallback
        const token = emitNewText(fullRawText)
        if (token) yield { type: 'token', token }
      }
    } else {
      fullRawText = this.buildGroundedFallback(contextChunks)
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

    const actions = this.buildActions(citations, intent)
    yield { type: 'progress', stage: 'saving', message: 'Đã lưu câu trả lời vào phiên trò chuyện.' }
    yield { type: 'done', citations, actions, intent, sessionId }
  }
}
