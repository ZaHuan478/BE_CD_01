import { hasAnyPermission, hasPermission } from '../auth/authorization.js'
import type { AuthPrincipal } from '../auth/types.js'
import { forbidden, notFound } from '../common/errors.js'
import { scopeRuntimeDatasets } from '../common/dataset-scope.js'
import { buildKnowledgeCatalog, isObject, summarizeDocument, workflowIndex } from '../common/knowledge-catalog.js'
import type { RuntimeRepository } from '../repositories/runtime.repository.js'
import type { ModuleRepository } from '../repositories/module.repository.js'
import type { CatalogQuery } from '../schemas/runtime.schemas.js'
import type { KnowledgeReadRepository } from '../repositories/knowledge-read.repository.js'

export class RuntimeService {
  constructor(private readonly repository: RuntimeRepository, private readonly modules: ModuleRepository,
    private readonly normalized?: Pick<KnowledgeReadRepository, 'list' | 'get'>) {}

  private async readableModules(principal: AuthPrincipal): Promise<string[]> {
    if (!hasAnyPermission(principal, 'sop.read')) throw forbidden('Permission sop.read is required')
    // A grant for one SOP must not elevate access to every document in its module.
    return (await this.modules.list()).filter(module => module.status === 'published'
      && hasPermission(principal, 'sop.read', 'module', module.id)).map(module => module.id)
  }

  private async scoped(key: string, principal: AuthPrincipal): Promise<unknown> {
    const moduleIds = await this.readableModules(principal)
    if (!moduleIds.length && key !== 'translations') throw forbidden('A published module read grant is required')
    return scopeRuntimeDatasets({ [key]: await this.repository.dataset(key) }, moduleIds)[key]
  }

  async dataset(principal: AuthPrincipal, key: string) {
    return { data: await this.scoped(key, principal) }
  }

  async workflows(principal: AuthPrincipal) {
    return { data: workflowIndex(await this.scoped('workflow.sopDatabase', principal)) }
  }

  async workflow(principal: AuthPrincipal, id: string) {
    const workflows = await this.scoped('workflow.sopDatabase', principal)
    if (!isObject(workflows) || !Object.hasOwn(workflows, id)) throw notFound('Workflow', id)
    return { data: workflows[id] }
  }

  private async catalog(principal: AuthPrincipal) {
    const moduleIds = await this.readableModules(principal)
    const [workflows, policies] = await Promise.all([
      this.repository.dataset('workflow.sopDatabase'), this.repository.dataset('policy.registry')
    ])
    return buildKnowledgeCatalog(workflows, policies)
      .filter(document => document.moduleIds.some(id => moduleIds.includes(id)))
      .map(document => ({ ...document, moduleIds: document.moduleIds.filter(id => moduleIds.includes(id)) }))
  }

  async documents(principal: AuthPrincipal, query: CatalogQuery) {
    if (this.normalized) return this.normalized.list(await this.readableModules(principal), query)
    const normalize = (text: string) => text.toLocaleLowerCase('vi').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd')
    const q = normalize(query.q?.trim() ?? '')
    // Authorization precedes filtering, counting and pagination.
    const documents = (await this.catalog(principal)).filter(document =>
      (!query.moduleId || document.moduleIds.includes(query.moduleId))
      && (!query.type || document.type === query.type)
      && (!q || normalize([document.code, document.title, document.summary, JSON.stringify(document.content)].join(' ')).includes(q)))
    const page = query.page ?? 1
    const pageSize = query.pageSize ?? 20
    return { data: documents.slice((page - 1) * pageSize, page * pageSize).map(summarizeDocument),
      pagination: { page, pageSize, total: documents.length } }
  }

  async document(principal: AuthPrincipal, id: string) {
    if (this.normalized) return this.normalized.get(await this.readableModules(principal), id)
    const document = (await this.catalog(principal)).find(item => item.id === id)
    if (!document) throw notFound('Document', id)
    return { data: { ...summarizeDocument(document), content: document.content } }
  }
}
