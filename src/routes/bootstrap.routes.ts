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

export function bootstrapRoutes(
  authService: AuthService,
  repository: BootstrapRepository,
  moduleRepository: ModuleRepository
): FastifyPluginAsync {
  const controller = new BootstrapController(authService, new BootstrapService(repository, moduleRepository))
  return async (app) => {

    app.get('/bootstrap', {
      schema: { tags: ['Frontend'], summary: 'Load temporary compatibility datasets from MySQL' }
    }, (request) => controller.get(request))

    app.get<{ Params: PolicyParams }>('/policy-acknowledgements/:policyId', {
      schema: {
        tags: ['Frontend'],
        summary: 'Get the current account policy acknowledgement',
        params: policyParamsSchema
      }
    }, (request) => controller.acknowledgement(request))

    app.put<{ Params: PolicyParams; Body: PolicyBody }>('/policy-acknowledgements/:policyId', {
      schema: {
        tags: ['Frontend'],
        summary: 'Set the current account policy acknowledgement',
        params: policyParamsSchema,
        body: policyBodySchema
      }
    }, (request) => controller.setAcknowledgement(request))
  }
}
