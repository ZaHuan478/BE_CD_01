import type { FastifyRequest, FastifyReply } from 'fastify'
import type { AuthService } from '../services/auth.service.js'
import type { ChatService } from '../services/chat/chat.service.js'
import type { ChatCompletionRequest } from '../schemas/rag.schemas.js'
import { AppError } from '../common/errors.js'

export class ChatController {
  constructor(
    private readonly auth: AuthService,
    private readonly chatService: ChatService
  ) {}

  async complete(
    request: FastifyRequest<{ Body: ChatCompletionRequest; Querystring: { mockFault?: string } }>,
    reply: FastifyReply
  ) {
    const principal = await this.auth.authenticate(request)
    const mockFault = ((request.headers['x-mock-fault'] as string | undefined) || request.query.mockFault || (request.body as any)?.mockFault)?.toLowerCase()

    if (mockFault === 'timeout') {
      const sessionId = request.body.sessionId || crypto.randomUUID()
      if (request.body.stream) {
        reply.raw.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache, no-transform',
          Connection: 'keep-alive'
        })
        reply.raw.write(`data: ${JSON.stringify({ type: 'error', code: 'AI_TIMEOUT', message: 'Dịch vụ AI phản hồi quá thời gian quy định (Timeout mô phỏng UAT). Bạn có thể nhấn Thử lại.', sessionId })}\n\n`)
        reply.raw.write('data: [DONE]\n\n')
        reply.raw.end()
        return
      }
      return reply.code(504).send({
        error: {
          code: 'AI_TIMEOUT',
          message: 'Dịch vụ AI phản hồi quá thời gian quy định (Timeout mô phỏng UAT). Vui lòng thử lại.'
        },
        sessionId
      })
    }

    if (mockFault === 'error') {
      const sessionId = request.body.sessionId || crypto.randomUUID()
      if (request.body.stream) {
        reply.raw.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache, no-transform',
          Connection: 'keep-alive'
        })
        reply.raw.write(`data: ${JSON.stringify({ type: 'error', code: 'AI_PROVIDER_ERROR', message: 'Dịch vụ AI hiện không sẵn sàng (Lỗi nhà cung cấp mô phỏng UAT). Bạn có thể nhấn Thử lại.', sessionId })}\n\n`)
        reply.raw.write('data: [DONE]\n\n')
        reply.raw.end()
        return
      }
      return reply.code(503).send({
        error: {
          code: 'AI_PROVIDER_ERROR',
          message: 'Dịch vụ AI hiện không sẵn sàng (Lỗi nhà cung cấp mô phỏng UAT). Vui lòng thử lại sau giây lát.'
        },
        sessionId
      })
    }

    // Nếu client yêu cầu Server-Sent Events (Streaming)
    if (request.body.stream) {
      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive'
      })

      try {
        for await (const chunk of this.chatService.completeChatStream(principal, request.body)) {
          reply.raw.write(`data: ${JSON.stringify(chunk)}\n\n`)
        }
      } catch (error) {
        const isKnownError = error instanceof AppError
        const message = isKnownError
          ? error.message
          : 'Không thể hoàn tất câu trả lời AI. Vui lòng thử lại sau.'
        const code = isKnownError ? error.code : 'AI_CHAT_ERROR'
        reply.raw.write(`data: ${JSON.stringify({ type: 'error', code, message })}\n\n`)
      }
      reply.raw.write(`data: [DONE]\n\n`)
      reply.raw.end()
      return
    }

    // JSON response thông thường
    const result = await this.chatService.completeChat(principal, request.body)
    return { data: result, requestId: request.id }
  }

  async listSessions(request: FastifyRequest) {
    const principal = await this.auth.authenticate(request)
    const sessions = await this.chatService.listSessions(principal)
    return { data: sessions, requestId: request.id }
  }

  async getMessages(request: FastifyRequest<{ Params: { id: string } }>) {
    const principal = await this.auth.authenticate(request)
    const messages = await this.chatService.getSessionMessages(principal, request.params.id)
    return { data: messages, requestId: request.id }
  }

  async deleteSession(request: FastifyRequest<{ Params: { id: string } }>) {
    const principal = await this.auth.authenticate(request)
    await this.chatService.deleteSession(principal, request.params.id)
    return { data: { success: true }, requestId: request.id }
  }
}
