import { authRoutes } from './routes/auth.routes.js'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import jwt from '@fastify/jwt'
import multipart from '@fastify/multipart'
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
import { sopImportRoutes } from './routes/sop-import.routes.js'
import { SopImportRepository } from './repositories/sop-import.repository.js'
import { UserDocumentRepository } from './repositories/user-document.repository.js'
import { SopImportService } from './services/sop-import.service.js'
import { SopService } from './services/sop.service.js'
import { SearchRepository } from './repositories/search.repository.js'
import { searchRoutes } from './routes/search.routes.js'
import { SearchService } from './services/search.service.js'
import { RuntimeRepository } from './repositories/runtime.repository.js'
import { runtimeRoutes } from './routes/runtime.routes.js'
import { KnowledgeReadRepository } from './repositories/knowledge-read.repository.js'
import { CoreDocumentRepository } from './repositories/core-document.repository.js'
import { Core8Repository } from './repositories/core8.repository.js'
import { core8Routes } from './routes/core8.routes.js'
import { administrationRoutes } from './routes/administration.routes.js'
import { userDocumentRoutes } from './routes/user-document.routes.js'
import { SopWorkspaceRepository } from './repositories/sop-workspace.repository.js'
import { sopWorkspaceRoutes } from './routes/sop-workspace.routes.js'
import { GeminiClient } from './services/rag/gemini.client.js'
import { IndexingService } from './services/rag/indexing.service.js'
import { RetrievalService } from './services/rag/retrieval.service.js'
import { ChatService } from './services/chat/chat.service.js'
import { ragRoutes } from './routes/rag.routes.js'
import { chatRoutes } from './routes/chat.routes.js'
import { SystemGuideRepository } from './repositories/system-guide.repository.js'
import { systemGuideRoutes } from './routes/system-guide.routes.js'
import { SystemGlossaryRepository } from './repositories/system-glossary.repository.js'
import { systemGlossaryRoutes } from './routes/system-glossary.routes.js'

export interface AppDependencies {
  env: AppEnv
  database: TransactionalDatabase
}

function databaseErrorNumber(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null) return undefined
  const candidate = error as { errno?: unknown; number?: unknown; originalError?: { info?: { number?: unknown } } }
  const value = candidate.errno ?? candidate.number ?? candidate.originalError?.info?.number
  return typeof value === 'number' ? value : undefined
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
  await app.register(multipart, {
    limits: { files: 1, fields: 8, parts: 9, fileSize: env.upload.maxBytes }
  })
  if (env.authMode === 'jwt') {
    await app.register(jwt, {
      secret: env.jwtSecret as string,
      verify: { allowedIss: env.jwtIssuer, allowedAud: env.jwtAudience }
    })
  }
  app.decorateRequest('principal', null)

  const core8 = env.databaseModel === 'core8'

  await app.register(swagger, {
    openapi: {
      info: {
        title: 'HRM SOP Knowledge & AI Platform API',
        description: `Hệ thống API Quản lý Tri thức Quy trình SOP & Trợ lý AI hỏi đáp RAG [Active DB: ${env.databaseModel} (${(env.database.provider ?? 'mysql').toUpperCase()}) | Auth: ${env.authMode} | RAG: ${env.gemini?.apiKey ? 'Gemini AI' : 'Mock/Local'}]`,
        version: '0.1.0'
      },
      servers: [
        { url: '/api/v1', description: 'Business API v1 Prefix' },
        { url: '/', description: 'Root & Health check endpoints' }
      ],
      tags: [
        { name: 'Core8', description: 'Tài liệu tri thức quy trình & Xác nhận chính sách (Chuẩn Core8 production)' },
        { name: 'SOP Workspace', description: 'Quản lý vòng đời SOP: bản nháp, revision, phê duyệt, lưu trữ và xóa' },
        { name: 'SOP imports', description: 'Chuyển đổi và nhập khẩu tài liệu DOCX/PDF sang SOP số hóa' },
        { name: 'Document conversions', description: 'Tiến trình chuyển đổi tài liệu và lịch sử import' },
        { name: 'AI Chatbot', description: 'Trợ lý hỏi đáp AI thông minh với RAG, trích dẫn nguồn và quản lý phiên hội thoại' },
        { name: 'Administration - RAG', description: 'Theo dõi chỉ mục ngữ nghĩa và kích hoạt Re-index tài liệu' },
        { name: 'Search', description: 'Tra cứu toàn văn tri thức quy trình SOP đa tiêu chí' },
        { name: 'Knowledge reads', description: 'Truy xuất cấu trúc quy trình, danh mục và bộ dữ liệu UI' },
        { name: 'Modules', description: 'Quản lý danh mục phân hệ chức năng hệ thống' },
        { name: 'Identity', description: 'Thông tin tài khoản hiện tại, vai trò và phân quyền menu' },
        { name: 'Access', description: 'Quản lý tài khoản, người dùng và phân quyền truy cập' },
        { name: 'Administration', description: 'Cấu hình hệ thống, quản trị phân quyền, gán vai trò SOP và Audit Logs' },
        { name: 'My documents', description: 'Tài liệu cá nhân của người dùng (tải lên, tra cứu, xem trước)' },
        { name: 'Administration Documents', description: 'Quản lý kho tài liệu người dùng cấp quản trị viên' },
        { name: 'System guides', description: 'Hướng dẫn sử dụng hệ thống cho người dùng cuối' },
        { name: 'Administration - System guides', description: 'Quản lý các bài viết và hướng dẫn sử dụng sản phẩm' },
        { name: 'System glossary', description: 'Tra cứu thuật ngữ chuyên ngành và từ viết tắt' },
        { name: 'Administration - System glossary', description: 'Quản lý danh mục thuật ngữ và từ viết tắt' },
        ...(core8 ? [] : [
          { name: 'SOPs (Legacy)', description: '[LEGACY] Quản lý SOP theo schema cũ (Chỉ khi DB_MODEL=legacy)' },
          { name: 'SOP versions (Legacy)', description: '[LEGACY] Quản lý phiên bản SOP schema cũ (Chỉ khi DB_MODEL=legacy)' },
          { name: 'Knowledge (Legacy)', description: '[LEGACY] Tài liệu tri thức schema cũ (Chỉ khi DB_MODEL=legacy)' },
          { name: 'Bootstrap (Legacy)', description: '[LEGACY] Khởi tạo tương thích schema cũ (Chỉ khi DB_MODEL=legacy)' },
          { name: 'Access (Legacy Groups)', description: '[LEGACY] Quản lý nhóm người dùng RBAC schema cũ' }
        ])
      ],
      components: {
        securitySchemes: {
          bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
          developmentUser: { type: 'apiKey', in: 'header', name: 'x-user-id' }
        }
      }
    }
  })
  await app.register(swaggerUi, {
    routePrefix: '/docs',
    uiConfig: {
      docExpansion: 'list',
      deepLinking: true,
      filter: true
    }
  })

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
    if ([1062, 2601, 2627].includes(databaseErrorNumber(error) ?? 0)) {
      void reply.code(409).send({
        error: { code: 'UNIQUE_CONSTRAINT', message: 'A record with the same unique value already exists' },
        requestId: request.id
      })
      return
    }
    if ([547, 1451, 1452].includes(databaseErrorNumber(error) ?? 0)) {
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

  const authRepository = new AuthRepository(database, core8)
  const authService = new AuthService(env, authRepository)
  await app.register(healthRoutes(database))
  await app.register(async (api) => {
    if (env.authMode === 'development') await api.register(authRoutes(authService))
    const moduleRepository = new ModuleRepository(database, core8)
    const geminiClient = new GeminiClient({
      apiKey: env.gemini?.apiKey,
      embeddingModel: env.gemini?.embeddingModel,
      embeddingDimension: env.gemini?.embeddingDimension,
      chatModel: env.gemini?.chatModel
    })
    const indexingService = new IndexingService(database, geminiClient, core8, env.rag?.chunkMaxTokens ?? 500)
    api.addHook('onListen', async () => { await indexingService.startWorker() })
    api.addHook('onClose', async () => { indexingService.stopWorker() })
    await api.register(runtimeRoutes(authService, new RuntimeRepository(database, core8), moduleRepository,
      core8 ? new CoreDocumentRepository(database) : env.knowledgeReadSource === 'normalized' ? new KnowledgeReadRepository(database) : undefined))
    if (!core8) await api.register(bootstrapRoutes(authService, new BootstrapRepository(database), moduleRepository))
    await api.register(meRoutes(authService, new MeRepository(database, core8), moduleRepository))
    await api.register(moduleRoutes(authService, moduleRepository))
    let legacySopService: SopService | undefined
    if (core8) {
      await api.register(core8Routes(authService, new Core8Repository(database), moduleRepository))
    } else {
      const sopRepository = new SopRepository(database)
      await api.register(sopRoutes(authService, sopRepository, moduleRepository))
      legacySopService = new SopService(sopRepository, moduleRepository)
      await api.register(knowledgeRoutes(authService, new KnowledgeRepository(database), sopRepository))
    }
    const sopImportService = new SopImportService(
      new SopImportRepository(database),
      new UserDocumentRepository(database),
      legacySopService,
      env,
      indexingService
    )
    await api.register(sopImportRoutes(authService, database, undefined, moduleRepository, env, indexingService, sopImportService))
    await api.register(searchRoutes(
      authService,
      new SearchService(new SearchRepository(database, core8), moduleRepository)
    ))
    await api.register(accessRoutes(authService, new AccessRepository(database, core8), core8))
    await api.register(administrationRoutes(authService, database, core8))
    await api.register(userDocumentRoutes(authService, database, env))
    await api.register(systemGuideRoutes(authService, new SystemGuideRepository(database)))
    await api.register(systemGlossaryRoutes(authService, new SystemGlossaryRepository(database)))
    // Khởi tạo các services cho AI RAG & Chatbot
    await api.register(sopWorkspaceRoutes(authService, new SopWorkspaceRepository(database), indexingService, sopImportService))
    const retrievalService = new RetrievalService(database, moduleRepository, geminiClient,
      env.rag?.topK ?? 5, env.rag?.similarityThreshold ?? 0.65)
    const chatService = new ChatService(database, retrievalService, geminiClient)

    await api.register(ragRoutes(authService, indexingService))
    await api.register(chatRoutes(authService, chatService))
  }, { prefix: '/api/v1' })

  return app
}
