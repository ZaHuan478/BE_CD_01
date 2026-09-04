import { Type } from '@sinclair/typebox'
import type { FastifyPluginAsync, FastifyRequest } from 'fastify'
import { hasAnyPermission } from '../../auth/authorization.js'
import { listReadableModules } from '../../auth/module-access.js'
import type { AuthService } from '../../auth/auth.service.js'
import { forbidden } from '../../common/errors.js'
import type { ModuleRepository } from '../modules/module.repository.js'
import { BootstrapRepository } from './bootstrap.repository.js'

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
  return async (app) => {
    const authenticateReader = async (request: FastifyRequest) => {
      const principal = await authService.authenticate(request)
      if (!hasAnyPermission(principal, 'sop.read')) throw forbidden('Permission sop.read is required')
      return principal
    }

    app.get('/bootstrap', {
      schema: { tags: ['Frontend'], summary: 'Load frontend runtime datasets from SQL Server' }
    }, async (request) => {
      const principal = await authenticateReader(request)
      const modules = await listReadableModules(principal, moduleRepository)
      return repository.getBootstrap(modules.map((module) => module.id))
    })

    app.get<{ Params: PolicyParams }>('/policy-acknowledgements/:policyId', {
      schema: {
        tags: ['Frontend'],
        summary: 'Get the current account policy acknowledgement',
        params: policyParamsSchema
      }
    }, async (request) => {
      const principal = await authenticateReader(request)
      return repository.getPolicyAcknowledgement(principal.accountId, request.params.policyId)
    })

    app.put<{ Params: PolicyParams; Body: PolicyBody }>('/policy-acknowledgements/:policyId', {
      schema: {
        tags: ['Frontend'],
        summary: 'Set the current account policy acknowledgement',
        params: policyParamsSchema,
        body: policyBodySchema
      }
    }, async (request) => {
      const principal = await authenticateReader(request)
      return repository.setPolicyAcknowledgement(
        principal.accountId,
        request.params.policyId,
        request.body.acknowledged
      )
    })
  }
}
