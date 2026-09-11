export interface GeminiClientOptions {
  apiKey?: string
  embeddingModel?: string
  embeddingDimension?: number
  chatModel?: string
}

export interface ChatMessageInput {
  role: 'user' | 'model'
  text: string
}

export class GeminiClient {
  private readonly apiKey?: string
  private readonly embeddingModel: string
  private readonly embeddingDimension: number
  private readonly chatModel: string
  private readonly baseUrl = 'https://generativelanguage.googleapis.com/v1beta'

  constructor(options: GeminiClientOptions) {
    this.apiKey = options.apiKey
    this.embeddingModel = (options.embeddingModel || 'gemini-embedding-001').replace(/^models\//, '')
    this.embeddingDimension = options.embeddingDimension || 768
    this.chatModel = (options.chatModel || 'gemini-2.5-flash').replace(/^models\//, '')
  }

  isConfigured(): boolean {
    return Boolean(this.apiKey && this.apiKey.length > 0)
  }

  getEmbeddingModel(): string {
    return this.embeddingModel
  }

  private getHeaders(): Record<string, string> {
    if (!this.apiKey) {
      throw new Error('GEMINI_API_KEY chưa được cấu hình. Vui lòng kiểm tra biến môi trường.')
    }
    return {
      'Content-Type': 'application/json',
      'x-goog-api-key': this.apiKey
    }
  }

  private async fetchWithRetry(url: string, init: RequestInit, retries = 3, delayMs = 1000): Promise<Response> {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const res = await fetch(url, { ...init, signal: AbortSignal.timeout(30_000) })
        if (res.status === 429 || (res.status >= 500 && res.status < 600)) {
          if (attempt === retries) return res
          const retryAfter = Number(res.headers.get('retry-after'))
          const backoff = Number.isFinite(retryAfter) && retryAfter > 0
            ? retryAfter * 1000
            : delayMs * Math.pow(2, attempt - 1) + Math.floor(Math.random() * 250)
          await new Promise((r) => setTimeout(r, backoff))
          continue
        }
        return res
      } catch (err) {
        if (attempt === retries) {
          const reason = err instanceof Error ? err.message : String(err)
          throw new Error(`Không thể kết nối Gemini API sau ${retries} lần thử: ${reason}`)
        }
        await new Promise((r) => setTimeout(r, delayMs * Math.pow(2, attempt - 1)))
      }
    }
    throw new Error('Yêu cầu Gemini API thất bại sau nhiều lần thử.')
  }

  private async apiError(operation: string, response: Response): Promise<Error> {
    // Google responses can contain request details. Return only the public status/message;
    // the API key is sent as a header and is never copied to application logs.
    let message = response.statusText || 'Yêu cầu bị từ chối'
    try {
      const payload = await response.json() as { error?: { message?: string; status?: string } }
      message = payload.error?.message || payload.error?.status || message
    } catch { /* response is not JSON */ }
    return new Error(`Gemini ${operation} lỗi (${response.status}): ${message.slice(0, 500)}`)
  }

  private normalize(values: number[]): number[] {
    if (values.length !== this.embeddingDimension) {
      throw new Error(`Gemini trả về vector ${values.length} chiều; cấu hình yêu cầu ${this.embeddingDimension} chiều`)
    }
    // gemini-embedding-001 requires normalization when output dimensionality is reduced.
    if (this.embeddingModel !== 'gemini-embedding-001' || this.embeddingDimension === 3072) return values
    const norm = Math.sqrt(values.reduce((sum, value) => sum + value * value, 0))
    if (!Number.isFinite(norm) || norm === 0) throw new Error('Gemini trả về embedding không hợp lệ')
    return values.map(value => value / norm)
  }

  async embedText(text: string, taskType: 'RETRIEVAL_DOCUMENT' | 'RETRIEVAL_QUERY' = 'RETRIEVAL_DOCUMENT'): Promise<number[]> {
    const url = `${this.baseUrl}/models/${this.embeddingModel}:embedContent`
    const body = {
      model: `models/${this.embeddingModel}`,
      content: {
        parts: [{ text: text.trim() }]
      },
      taskType,
      outputDimensionality: this.embeddingDimension
    }

    const res = await this.fetchWithRetry(url, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(body)
    })

    if (!res.ok) {
      throw await this.apiError('embedContent', res)
    }

    const data = await res.json() as { embedding?: { values?: number[] } }
    if (!data.embedding?.values) {
      throw new Error('Gemini embedContent không trả về vector values.')
    }

    return this.normalize(data.embedding.values)
  }

  async batchEmbedTexts(
    texts: string[],
    taskType: 'RETRIEVAL_DOCUMENT' | 'RETRIEVAL_QUERY' = 'RETRIEVAL_DOCUMENT'
  ): Promise<number[][]> {
    if (texts.length === 0) return []
    const chunkSize = 100
    const results: number[][] = []

    for (let i = 0; i < texts.length; i += chunkSize) {
      const slice = texts.slice(i, i + chunkSize)
      const url = `${this.baseUrl}/models/${this.embeddingModel}:batchEmbedContents`
      const body = {
        requests: slice.map((t) => ({
          model: `models/${this.embeddingModel}`,
          content: { parts: [{ text: t.trim() }] },
          taskType,
          outputDimensionality: this.embeddingDimension
        }))
      }

      const res = await this.fetchWithRetry(url, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(body)
      })

      if (!res.ok) {
        throw await this.apiError('batchEmbedContents', res)
      }

      const data = await res.json() as { embeddings?: Array<{ values?: number[] }> }
      if (!data.embeddings || data.embeddings.length !== slice.length) {
        throw new Error('Gemini batchEmbedContents trả về số lượng embeddings không khớp.')
      }

      for (const item of data.embeddings) {
        if (!item.values) throw new Error('Phần tử embedding thiếu vector values.')
      }
      for (const item of data.embeddings) {
        results.push(this.normalize(item.values!))
      }
    }

    return results
  }

  async generateChat(
    systemInstruction: string,
    messages: ChatMessageInput[]
  ): Promise<string> {
    const url = `${this.baseUrl}/models/${this.chatModel}:generateContent`
    const body = {
      systemInstruction: {
        parts: [{ text: systemInstruction }]
      },
      contents: messages.map((m) => ({
        role: m.role,
        parts: [{ text: m.text }]
      })),
      generationConfig: {
        temperature: 0.2,
        topP: 0.95,
        maxOutputTokens: 2048,
        thinkingConfig: { thinkingBudget: 0 }
      }
    }

    const res = await this.fetchWithRetry(url, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(body)
    })

    if (!res.ok) {
      throw await this.apiError('generateContent', res)
    }

    const data = await res.json() as {
      candidates?: Array<{
        content?: {
          parts?: Array<{ text?: string }>
        }
      }>
    }

    const answer = data.candidates?.[0]?.content?.parts?.[0]?.text
    if (!answer) {
      throw new Error('Gemini generateContent không sinh được nội dung phản hồi.')
    }

    return answer
  }

  async *generateChatStream(
    systemInstruction: string,
    messages: ChatMessageInput[]
  ): AsyncGenerator<string, void, unknown> {
    const url = `${this.baseUrl}/models/${this.chatModel}:streamGenerateContent?alt=sse`
    const body = {
      systemInstruction: {
        parts: [{ text: systemInstruction }]
      },
      contents: messages.map((m) => ({
        role: m.role,
        parts: [{ text: m.text }]
      })),
      generationConfig: {
        temperature: 0.2,
        topP: 0.95,
        maxOutputTokens: 2048,
        thinkingConfig: { thinkingBudget: 0 }
      }
    }

    const res = await this.fetchWithRetry(url, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(body)
    })

    if (!res.ok) {
      throw await this.apiError('streamGenerateContent', res)
    }

    if (!res.body) {
      throw new Error('Response body rỗng, không thể stream.')
    }

    const reader = res.body.getReader()
    const decoder = new TextDecoder('utf-8')
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed || !trimmed.startsWith('data: ')) continue
        const jsonStr = trimmed.slice(6)
        if (jsonStr === '[DONE]') return

        try {
          const parsed = JSON.parse(jsonStr) as {
            candidates?: Array<{
              content?: {
                parts?: Array<{ text?: string }>
              }
            }>
          }
          const textChunk = parsed.candidates?.[0]?.content?.parts?.[0]?.text
          if (textChunk) {
            yield textChunk
          }
        } catch {
          // Bỏ qua dòng json không hợp lệ
        }
      }
    }
  }
}
