import type { FastifyPluginAsync } from 'fastify'
import type { QueryRunner } from '../../database/database.js'

interface HealthRow { databaseName: string }

export function healthRoutes(database: QueryRunner): FastifyPluginAsync {
  return async (app) => {
    app.get('/health', {
      schema: {
        tags: ['System'],
        summary: 'Liveness check',
        response: { 200: { type: 'object', properties: { status: { type: 'string' } } } }
      }
    }, async () => ({ status: 'ok' }))

    app.get('/ready', {
      schema: { tags: ['System'], summary: 'SQL Server readiness check' }
    }, async () => {
      const [row] = await database.query<HealthRow>('SELECT DB_NAME() AS databaseName')
      return { status: 'ready', database: row?.databaseName }
    })
  }
}

