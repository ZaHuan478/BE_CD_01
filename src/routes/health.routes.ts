import type { FastifyPluginAsync } from 'fastify'
import type { QueryRunner } from '../database/database.js'

import { HealthRepository } from '../repositories/health.repository.js'
import { HealthService } from '../services/health.service.js'
import { HealthController } from '../controllers/health.controller.js'

export function healthRoutes(database: QueryRunner): FastifyPluginAsync {
  const controller = new HealthController(new HealthService(new HealthRepository(database)))
  return async (app) => {
    app.get('/health', {
      schema: {
        tags: ['System'],
        summary: 'Liveness check',
        response: { 200: { type: 'object', properties: { status: { type: 'string' } } } }
      }
    }, () => controller.live())

    app.get('/ready', {
      schema: { tags: ['System'], summary: 'MySQL readiness check' }
    }, () => controller.ready())
  }
}
