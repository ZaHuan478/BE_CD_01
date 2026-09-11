import type { QueryRunner } from '../database/database.js'
import type { Citation } from '../schemas/rag.schemas.js'

export interface ChatSessionRecord {
  SessionId: string
  AccountId: string
  Title: string
  CreatedAt: Date
  UpdatedAt: Date
}

export interface ChatMessageRecord {
  MessageId: string
  SessionId: string
  Role: 'user' | 'assistant'
  Content: string
  CitationsJson: string | null
  CreatedAt: Date
}

export class ChatRepository {
  constructor(private readonly database: QueryRunner) {}

  async createSession(sessionId: string, accountId: string, title = 'Cuộc trò chuyện mới'): Promise<void> {
    await this.database.query(`
      INSERT INTO ChatSession (SessionId, AccountId, Title)
      VALUES (:sessionId, :accountId, :title)
    `, { sessionId, accountId, title })
  }

  async getSessionOwner(sessionId: string): Promise<string | null> {
    const [row] = await this.database.query<{ AccountId: string }>(`
      SELECT AccountId FROM ChatSession WHERE SessionId = :sessionId
    `, { sessionId })
    return row?.AccountId ?? null
  }

  async getSession(sessionId: string, accountId: string): Promise<ChatSessionRecord | null> {
    const [row] = await this.database.query<ChatSessionRecord>(`
      SELECT * FROM ChatSession WHERE SessionId = :sessionId AND AccountId = :accountId
    `, { sessionId, accountId })
    return row || null
  }

  async listSessions(accountId: string, limit = 50): Promise<ChatSessionRecord[]> {
    return this.database.query<ChatSessionRecord>(`
      SELECT * FROM ChatSession WHERE AccountId = :accountId ORDER BY UpdatedAt DESC LIMIT :limit
    `, { accountId, limit })
  }

  async updateSessionTitle(sessionId: string, title: string): Promise<void> {
    await this.database.query(`
      UPDATE ChatSession SET Title = :title, UpdatedAt = CURRENT_TIMESTAMP(3) WHERE SessionId = :sessionId
    `, { sessionId, title })
  }

  async deleteSession(sessionId: string, accountId: string): Promise<void> {
    await this.database.query(`
      DELETE FROM ChatSession WHERE SessionId = :sessionId AND AccountId = :accountId
    `, { sessionId, accountId })
  }

  async saveMessage(params: {
    messageId: string
    sessionId: string
    role: 'user' | 'assistant'
    content: string
    citations?: Citation[]
  }): Promise<void> {
    const citationsJson = params.citations ? JSON.stringify(params.citations) : null
    await this.database.query(`
      INSERT INTO ChatMessage (MessageId, SessionId, Role, Content, CitationsJson)
      VALUES (:messageId, :sessionId, :role, :content, :citationsJson)
    `, {
      messageId: params.messageId,
      sessionId: params.sessionId,
      role: params.role,
      content: params.content,
      citationsJson
    })

    // Cập nhật UpdatedAt của session
    await this.database.query(`
      UPDATE ChatSession SET UpdatedAt = CURRENT_TIMESTAMP(3) WHERE SessionId = :sessionId
    `, { sessionId: params.sessionId })
  }

  async getMessages(sessionId: string, limit = 50): Promise<ChatMessageRecord[]> {
    return this.database.query<ChatMessageRecord>(`
      SELECT * FROM (
        SELECT * FROM ChatMessage WHERE SessionId = :sessionId ORDER BY CreatedAt DESC LIMIT :limit
      ) recent_messages ORDER BY CreatedAt ASC
    `, { sessionId, limit })
  }
}
