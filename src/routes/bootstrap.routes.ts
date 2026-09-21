import { BootstrapController } from '../controllers/bootstrap.controller.js'
import { BootstrapService } from '../services/bootstrap.service.js'
import { Type } from '@sinclair/typebox'
import type { FastifyPluginAsync } from 'fastify'
import type { AuthService } from '../services/auth.service.js'
import type { ModuleRepository } from '../repositories/module.repository.js'
import { BootstrapRepository } from '../repositories/bootstrap.repository.js'

interface PolicyParams { policyId: string }
interface PolicyBody { acknowledged: boolean }

const policyParamsSchema = Type.Object({
  policyId: Type.String({ minLength: 1, maxLength: 200 })
})
const policyBodySchema = Type.Object({ acknowledged: Type.Boolean() })

/**
 * [LEGACY: DEPRECATED - Only mounted when DB_MODEL=legacy]
 * Khi DB_MODEL=core8, các endpoint này được thay thế hoàn toàn bởi core8Routes và runtimeRoutes.
 */
export function bootstrapRoutes(
  authService: AuthService,
  repository: BootstrapRepository,
  moduleRepository: ModuleRepository
): FastifyPluginAsync {
  const controller = new BootstrapController(authService, new BootstrapService(repository, moduleRepository))
  return async (app) => {

    app.get('/bootstrap', {
      schema: { tags: ['Bootstrap (Legacy)'], deprecated: true, summary: 'Legacy compatibility only; use incremental knowledge reads' }
    }, (request) => controller.get(request))

    app.get<{ Params: PolicyParams }>('/policy-acknowledgements/:policyId', {
      schema: {
        tags: ['Bootstrap (Legacy)'],
        deprecated: true,
        summary: 'Get the current account policy acknowledgement (Legacy fallback)',
        params: policyParamsSchema
      }
    }, (request) => controller.acknowledgement(request))

    app.put<{ Params: PolicyParams; Body: PolicyBody }>('/policy-acknowledgements/:policyId', {
      schema: {
        tags: ['Bootstrap (Legacy)'],
        deprecated: true,
        summary: 'Set the current account policy acknowledgement (Legacy fallback)',
        params: policyParamsSchema,
        body: policyBodySchema
      }
    }, (request) => controller.setAcknowledgement(request))
  }
}
