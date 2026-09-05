import { authRoutes } from './routes/auth.routes.js'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import jwt from '@fastify/jwt'
import swagger from '@fastify/swagger'
import swaggerUi from '@fastify/swagger-ui'
import Fastify, { type FastifyError, type FastifyInstance } from 'fastify'
import { AuthRepository } from './repositories/auth.repository.js'
import { AuthService } from './services/auth.service.js'
import { AppError } from './common/errors.js'
import type { AppEnv } from './config/env.js'
import type { TransactionalDatabase } from './database/database.js'
import { AccessRepository } from './repositories/access.repository.js'
import { accessRoutes } from './routes/access.routes.js'
import { BootstrapRepository } from './repositories/bootstrap.repository.js'
import { bootstrapRoutes } from './routes/bootstrap.routes.js'
import { healthRoutes } from './routes/health.routes.js'
import { KnowledgeRepository } from './repositories/knowledge.repository.js'
import { knowledgeRoutes } from './routes/knowledge.routes.js'
import { MeRepository } from './repositories/me.repository.js'
import { meRoutes } from './routes/me.routes.js'
import { ModuleRepository } from './repositories/module.repository.js'
import { moduleRoutes } from './routes/module.routes.js'
import { SopRepository } from './repositories/sop.repository.js'
import { sopRoutes } from './routes/sop.routes.js'
import { SearchRepository } from './repositories/search.repository.js'
import { searchRoutes } from './routes/search.routes.js'
import { SearchService } from './services/search.service.js'

export interface AppDependencies {
  env: AppEnv
  database: TransactionalDatabase
}

function databaseErrorNumber(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null || !('errno' in error)) return undefined
  return typeof error.errno === 'number' ? error.errno : undefined
}

export async function buildApp({ env, database }: AppDependencies): Promise<FastifyInstance> {
  const app = Fastify({
    logger: { level: env.logLevel },
    requestIdHeader: 'x-request-id',
    genReqId: () => crypto.randomUUID()
  })

  await app.register(cors, {
    origin: env.corsOrigins,
    credentials: env.authMode === 'jwt',
    allowedHeaders: ['authorization', 'content-type', 'x-request-id', 'x-user-id']
  })
  await app.register(helmet, { contentSecurityPolicy: false })
  if (env.authMode === 'jwt') {
    await app.register(jwt, {
      secret: env.jwtSecret as string,
      verify: { allowedIss: env.jwtIssuer, allowedAud: env.jwtAudience }
    })
  }
  app.decorateRequest('principal', null)

  await app.register(swagger, {
    openapi: {
      info: {
        title: 'HRM SOP API',
        description: 'Versioned SOP knowledge API backed by MySQL',
        version: '0.1.0'
      },
      components: {
        securitySchemes: {
          bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
          developmentUser: { type: 'apiKey', in: 'header', name: 'x-user-id' }
        }
      }
    }
  })
  await app.register(swaggerUi, { routePrefix: '/docs' })

  app.setNotFoundHandler((request, reply) => {
    void reply.code(404).send({
      error: { code: 'ROUTE_NOT_FOUND', message: `Route ${request.method} ${request.url} was not found` },
      requestId: request.id
    })
  })

  app.setErrorHandler((error: FastifyError | AppError, request, reply) => {
    if (error instanceof AppError) {
      void reply.code(error.statusCode).send({
        error: { code: error.code, message: error.message, details: error.details },
        requestId: request.id
      })
      return
    }
    if (error.validation) {
      void reply.code(400).send({
        error: { code: 'VALIDATION_ERROR', message: error.message, details: error.validation },
        requestId: request.id
      })
      return
    }
    if (error.statusCode && error.statusCode >= 400 && error.statusCode < 500) {
      void reply.code(error.statusCode).send({
        error: { code: error.code || 'REQUEST_ERROR', message: error.message },
        requestId: request.id
      })
      return
    }
    if (databaseErrorNumber(error) === 1062) {
      void reply.code(409).send({
        error: { code: 'UNIQUE_CONSTRAINT', message: 'A record with the same unique value already exists' },
        requestId: request.id
      })
      return
    }
    if ([1451, 1452].includes(databaseErrorNumber(error) ?? 0)) {
      void reply.code(409).send({
        error: { code: 'REFERENCE_CONSTRAINT', message: 'The operation references missing or in-use data' },
        requestId: request.id
      })
      return
    }
    request.log.error({ err: error }, 'Unhandled request error')
    void reply.code(500).send({
      error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' },
      requestId: request.id
    })
  })

  const authRepository = new AuthRepository(database)
  const authService = new AuthService(env, authRepository)
  await app.register(healthRoutes(database))
  await app.register(async (api) => {
    if (env.authMode === 'development') await api.register(authRoutes(authService))
    const moduleRepository = new ModuleRepository(database)
    await api.register(bootstrapRoutes(authService, new BootstrapRepository(database), moduleRepository))
    await api.register(meRoutes(authService, new MeRepository(database), moduleRepository))
    await api.register(moduleRoutes(authService, moduleRepository))
    const sopRepository = new SopRepository(database)
    await api.register(sopRoutes(authService, sopRepository, moduleRepository))
    await api.register(searchRoutes(
      authService,
      new SearchService(new SearchRepository(database), moduleRepository)
    ))
    await api.register(knowledgeRoutes(authService, new KnowledgeRepository(database), sopRepository))
    await api.register(accessRoutes(authService, new AccessRepository(database)))
  }, { prefix: '/api/v1' })

  return app
}
