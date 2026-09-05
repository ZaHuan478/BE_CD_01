import type { FastifyRequest } from 'fastify'
import type { AuthService } from '../services/auth.service.js'
import type { SearchService } from '../services/search.service.js'
import type { SearchQuery } from '../schemas/search.schemas.js'
export class SearchController {
  constructor(private readonly auth: AuthService, private readonly service: SearchService) {}
  async search(request: FastifyRequest<{ Querystring: SearchQuery }>) {
    const data = await this.service.search(await this.auth.authenticate(request), request.query)
    return { data, meta: { total: data.length, limit: request.query.limit ?? 20 }, requestId: request.id }
  }
}
