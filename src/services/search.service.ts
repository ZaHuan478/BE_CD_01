import type { AuthPrincipal } from '../auth/types.js'
import { listReadableModules } from '../auth/module-access.js'
import { forbidden } from '../common/errors.js'
import type { ModuleRepository } from '../repositories/module.repository.js'
import type { SearchRepository } from '../repositories/search.repository.js'
import type { SearchQuery } from '../schemas/search.schemas.js'

export class SearchService {
  constructor(
    private readonly repository: SearchRepository,
    private readonly moduleRepository: ModuleRepository
  ) {}

  async search(principal: AuthPrincipal, query: SearchQuery) {
    const readableModules = await listReadableModules(principal, this.moduleRepository)
    const readableIds = new Set(readableModules.map((module) => module.id))
    if (query.moduleId && !readableIds.has(query.moduleId)) {
      throw forbidden('You do not have access to the requested module')
    }
    const rows = await this.repository.search(query.q.trim())
    return rows
      .filter((row) => row.moduleIds.length === 0 || row.moduleIds.some((moduleId) => readableIds.has(moduleId)))
      .filter((row) => !query.moduleId || row.moduleIds.includes(query.moduleId))
      .filter((row) => !query.type || query.type === 'all' || row.type === query.type)
      .slice(0, query.limit ?? 20)
  }
}
