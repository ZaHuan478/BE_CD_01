import 'dotenv/config'

export type AuthMode = 'development' | 'jwt'

function numberValue(name: string, fallback: number): number {
  const raw = process.env[name]
  if (!raw) return fallback
  const parsed = Number(raw)
  if (!Number.isFinite(parsed)) throw new Error(`${name} must be a number`)
  return parsed
}

function boundedNumber(name: string, fallback: number, minimum: number, maximum: number): number {
  const value = numberValue(name, fallback)
  if (value < minimum || value > maximum) throw new Error(`${name} must be between ${minimum} and ${maximum}`)
  return value
}

function required(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`${name} is required`)
  return value
}

export interface AppEnv {
  databaseModel?: 'legacy' | 'core8'
  knowledgeReadSource?: 'legacy' | 'normalized'
  nodeEnv: string
  host: string
  port: number
  logLevel: string
  corsOrigins: string[]
  authMode: AuthMode
  developmentDemoPassword: string
  jwtSecret?: string
  jwtIssuer?: string
  jwtAudience?: string
  upload: {
    directory: string
    maxBytes: number
  }
  cloudinary: {
    cloudName?: string
    apiKey?: string
    apiSecret?: string
    folder: string
    enabled: boolean
  }
  gemini: {
    apiKey?: string
    embeddingModel: string
    embeddingDimension: number
    chatModel: string
  }
  rag: {
    topK: number
    similarityThreshold: number
    chunkMaxTokens: number
  }
  database: {
    host: string
    port: number
    name: string
    user: string
    password: string
    poolMax: number
    initializeOnStart?: boolean
    importSnapshot?: string
    seedDemo?: boolean
  }
}

export function loadCloudinaryEnv(): AppEnv['cloudinary'] {
  let cloudName = process.env.CLOUDINARY_CLOUD_NAME?.trim() || undefined
  let apiKey = process.env.CLOUDINARY_API_KEY?.trim() || undefined
  let apiSecret = process.env.CLOUDINARY_API_SECRET?.trim() || undefined
  // Treat credentials as one set; never mix individual variables with URL credentials.
  if (!cloudName && !apiKey && !apiSecret && process.env.CLOUDINARY_URL?.trim()) {
    try {
      const url = new URL(process.env.CLOUDINARY_URL.trim())
      if (url.protocol !== 'cloudinary:') throw new Error()
      cloudName = url.hostname || undefined
      apiKey = decodeURIComponent(url.username) || undefined
      apiSecret = decodeURIComponent(url.password) || undefined
    } catch { throw new Error('CLOUDINARY_URL is invalid') }
  }
  if ((cloudName || apiKey || apiSecret) && !(cloudName && apiKey && apiSecret)) {
    throw new Error('Cloudinary requires CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET together')
  }
  const folder = process.env.CLOUDINARY_DOCUMENT_FOLDER?.trim() || 'hrm_documents'
  if (!/^[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*$/.test(folder) || folder.length > 350) {
    throw new Error('CLOUDINARY_DOCUMENT_FOLDER must be an ASCII folder path (letters, digits, underscores or hyphens), at most 350 characters')
  }
  return {
    cloudName, apiKey, apiSecret,
    folder,
    enabled: Boolean(cloudName && apiKey && apiSecret)
  }
}

export function loadEnv(): AppEnv {
  const cloudinary = loadCloudinaryEnv()
  const databaseModel = process.env.DB_MODEL ?? 'legacy'
  if (databaseModel !== 'legacy' && databaseModel !== 'core8') throw new Error('DB_MODEL must be legacy or core8')
  const knowledgeReadSource = process.env.KNOWLEDGE_READ_SOURCE ?? 'legacy'
  if (knowledgeReadSource !== 'legacy' && knowledgeReadSource !== 'normalized') throw new Error('KNOWLEDGE_READ_SOURCE must be legacy or normalized')
  const authMode = (process.env.AUTH_MODE ?? 'development') as AuthMode
  if (!['development', 'jwt'].includes(authMode)) {
    throw new Error('AUTH_MODE must be development or jwt')
  }
  if (process.env.NODE_ENV === 'production' && authMode === 'development') {
    throw new Error('AUTH_MODE=development is forbidden in production')
  }

  const jwtSecret = process.env.JWT_SECRET?.trim()
  if (authMode === 'jwt' && (!jwtSecret || jwtSecret === 'change-me-outside-source-control')) {
    throw new Error('A non-placeholder JWT_SECRET is required when AUTH_MODE=jwt')
  }
  const jwtIssuer = process.env.JWT_ISSUER?.trim()
  const jwtAudience = process.env.JWT_AUDIENCE?.trim()
  if (process.env.NODE_ENV === 'production' && authMode === 'jwt' && (!jwtIssuer || !jwtAudience)) {
    throw new Error('JWT_ISSUER and JWT_AUDIENCE are required for JWT auth in production')
  }

  return {
    cloudinary,
    databaseModel,
    knowledgeReadSource,
    nodeEnv: process.env.NODE_ENV ?? 'development',
    host: process.env.HOST ?? '127.0.0.1',
    port: numberValue('PORT', 3000),
    logLevel: process.env.LOG_LEVEL ?? 'info',
    corsOrigins: (process.env.CORS_ORIGINS ?? 'http://localhost:5173')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
    authMode,
    developmentDemoPassword: process.env.DEVELOPMENT_DEMO_PASSWORD ?? '123456',
    jwtSecret,
    jwtIssuer,
    jwtAudience,
    upload: {
      directory: process.env.SOP_UPLOAD_DIR ?? 'data/uploads/sop-imports',
      maxBytes: numberValue('SOP_UPLOAD_MAX_BYTES', 10 * 1024 * 1024)
    },
    gemini: {
      apiKey: process.env.GEMINI_API_KEY?.trim() || undefined,
      embeddingModel: process.env.GEMINI_EMBEDDING_MODEL?.trim() || 'gemini-embedding-001',
      embeddingDimension: boundedNumber('GEMINI_EMBEDDING_DIMENSION', 768, 128, 3072),
      chatModel: process.env.GEMINI_CHAT_MODEL?.trim() || 'gemini-2.5-flash'
    },
    rag: {
      topK: boundedNumber('RAG_TOP_K', 5, 1, 20),
      similarityThreshold: boundedNumber('RAG_SIMILARITY_THRESHOLD', 0.65, 0, 1),
      chunkMaxTokens: boundedNumber('RAG_CHUNK_MAX_TOKENS', 500, 100, 2000)
    },
    database: {
      host: required('DB_HOST'),
      port: numberValue('DB_PORT', 3306),
      name: required('DB_NAME'),
      user: required('DB_USER'),
      password: required('DB_PASSWORD'),
      poolMax: numberValue('DB_POOL_MAX', 10),
      initializeOnStart: (process.env.DB_INITIALIZE_ON_START ?? (process.env.NODE_ENV === 'production' ? 'false' : 'true')) === 'true',
      importSnapshot: process.env.DB_IMPORT_SNAPSHOT ?? (process.env.NODE_ENV === 'production' ? '' : 'data/import/legacy-snapshot.json'),
      seedDemo: process.env.DB_SEED_DEMO === 'true'
    }
  }
}
