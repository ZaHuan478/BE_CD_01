import type { FastifyRequest, FastifyReply } from 'fastify'
import type { AuthService } from '../services/auth.service.js'
import type { ChatService } from '../services/chat/chat.service.js'
import type { ChatCompletionRequest } from '../schemas/rag.schemas.js'

export class ChatController {
  constructor(
    private readonly auth: AuthService,
    private readonly chatService: ChatService
  ) {}

  async complete(
    request: FastifyRequest<{ Body: ChatCompletionRequest }>,
    reply: FastifyReply
  ) {
    const principal = await this.auth.authenticate(request)

    // Nếu client yêu cầu Server-Sent Events (Streaming)
    if (request.body.stream) {
      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive'
      })

      for await (const chunk of this.chatService.completeChatStream(principal, request.body)) {
        reply.raw.write(`data: ${JSON.stringify(chunk)}\n\n`)
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
