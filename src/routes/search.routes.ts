import { SearchController } from '../controllers/search.controller.js'
import type { FastifyPluginAsync } from 'fastify'
import type { AuthService } from '../services/auth.service.js'
import type { SearchService } from '../services/search.service.js'
import { searchQuerySchema, type SearchQuery } from '../schemas/search.schemas.js'

export function searchRoutes(authService: AuthService, service: SearchService): FastifyPluginAsync {
  const controller = new SearchController(authService, service)
  return async (app) => {
    app.get<{ Querystring: SearchQuery }>('/search', {
      schema: {
        tags: ['Search'],
        summary: 'Search published SOP knowledge visible to the current account',
        querystring: searchQuerySchema
      }
    }, (request) => controller.search(request))
  }
}
