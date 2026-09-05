import 'dotenv/config'

export type AuthMode = 'development' | 'jwt'

function numberValue(name: string, fallback: number): number {
  const raw = process.env[name]
  if (!raw) return fallback
  const parsed = Number(raw)
  if (!Number.isFinite(parsed)) throw new Error(`${name} must be a number`)
  return parsed
}

function required(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`${name} is required`)
  return value
}

export interface AppEnv {
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

export function loadEnv(): AppEnv {
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
