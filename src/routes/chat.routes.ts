import type { FastifyPluginAsync } from 'fastify'
import type { AuthService } from '../services/auth.service.js'
import type { ChatService } from '../services/chat/chat.service.js'
import { ChatController } from '../controllers/chat.controller.js'
import { chatCompletionRequestSchema, type ChatCompletionRequest } from '../schemas/rag.schemas.js'

export function chatRoutes(
  authService: AuthService,
  chatService: ChatService
): FastifyPluginAsync {
  const controller = new ChatController(authService, chatService)

  return async (app) => {
    app.post<{ Body: ChatCompletionRequest; Querystring: { mockFault?: string } }>('/chat/completions', {
      schema: {
        tags: ['AI Chatbot'],
        summary: 'Gửi câu hỏi tới Trợ lý AI và nhận câu trả lời có trích dẫn nguồn (Hỗ trợ SSE streaming)',
        body: chatCompletionRequestSchema
      }
    }, (request, reply) => controller.complete(request, reply))

    app.get('/chat/sessions', {
      schema: {
        tags: ['AI Chatbot'],
        summary: 'Danh sách các phiên hội thoại của người dùng hiện tại'
      }
    }, (request) => controller.listSessions(request))

    app.get<{ Params: { id: string } }>('/chat/sessions/:id', {
      schema: {
        tags: ['AI Chatbot'],
        summary: 'Lịch sử tin nhắn của một phiên hội thoại'
      }
    }, (request) => controller.getMessages(request))

    app.delete<{ Params: { id: string } }>('/chat/sessions/:id', {
      schema: {
        tags: ['AI Chatbot'],
        summary: 'Xóa một phiên hội thoại'
      }
    }, (request) => controller.deleteSession(request))
  }
}
