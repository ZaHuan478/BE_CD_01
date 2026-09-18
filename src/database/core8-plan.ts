import { createHash } from 'node:crypto'
import type { QueryRunner } from './database.js'
import { core8Tables, legacyTables, tableExists } from './core8-schema.js'
import { buildKnowledgeCatalog } from '../common/knowledge-catalog.js'
import { contentHash } from './normalize-knowledge.js'
import { jsonValue } from '../repositories/core-document.repository.js'
import { isMasterDataCatalogEntry, isMasterDataCode } from '../common/procedure-classification.js'

export type Row = Record<string, any>
export type Core8Snapshot = { format: 'core8-backup-v1'; database: string; tables: Record<string, Row[]> }
export interface Core8Document {
  id: string; code: string; title: string; type: string; summary: string; workflowId: string | null; sourceKey: string
  moduleIds: string[]; visibility: 'module' | 'internal'; status: string; order: number; currentVersion: number
  versions: Array<{ number: number; content: Row; status: string; from: string | null; to: string | null; createdBy: string | null; createdAt: string | null }>
}
export function stableId(key: string) { return 'doc-' + createHash('sha256').update(key).digest('hex').slice(0, 32) }
export function snapshotHash(snapshot: Core8Snapshot) { return contentHash(snapshot) }
export async function captureCore8Source(database: QueryRunner): Promise<Core8Snapshot> {
  const [name] = await database.query<{ Name: string }>('SELECT DATABASE() AS Name')
  const tables: Record<string, Row[]> = {}
  for (const table of new Set([...core8Tables, ...legacyTables])) {
    if (await tableExists(database, table)) {
      const rows = JSON.parse(JSON.stringify(await database.query(`SELECT * FROM ${table}`))) as Row[]
      tables[table] = rows.sort((a, b) => contentHash(a).localeCompare(contentHash(b)))
    }
  }
  return { format: 'core8-backup-v1', database: name?.Name ?? '', tables }
}
const date = (value: unknown) => value ? new Date(String(value)).toISOString() : null

export function planCore8(snapshot: Core8Snapshot) {
  const t = (table: string): Row[] => snapshot.tables[table] ?? []
  const blockers: string[] = []
  const notes: string[] = []
  const configs = Object.fromEntries(t('AppConfig').filter(row => row.ScopeType === 'system' && row.ScopeId === '*' && row.IsActive)
    .map(row => [row.ConfigKey, jsonValue(row.ValueJson)]))
  const workflows = configs['ui.dataset.workflow.sopDatabase'] ?? {}
  const policies = configs['ui.dataset.policy.registry'] ?? []
  const originals = buildKnowledgeCatalog(workflows, policies)
  const documents: Core8Document[] = []
  let order = 0
  const make = (sourceKey: string, code: string, title: string, type: string, content: Row, moduleIds: string[], visibility: 'module' | 'internal' = 'module'): Core8Document => ({
    id: stableId(sourceKey), sourceKey, code, title, type, summary: String(content.description ?? content.summary ?? ''), workflowId: null,
    moduleIds: [...new Set(moduleIds)].sort(), visibility, status: 'published', order: order++, currentVersion: 1,
    versions: [{ number: 1, content, status: 'published', from: null, to: null, createdBy: null, createdAt: null }]
  })
  // Preserve workflow/process ordering, not hash order used in search lists.
  for (const [workflowId, entries] of Object.entries(workflows as Record<string, Row[]>)) for (const entry of entries) {
    const original = originals.find(doc => doc.workflowId === workflowId && doc.code === entry.sopCode)!
    const type = isMasterDataCatalogEntry(original.code, workflowId) ? 'catalog'
      : isMasterDataCode(original.code) ? 'guide' : 'procedure'
    const document = make(original.sourceKey, original.code, original.title, type, original.content, original.moduleIds)
    document.workflowId = workflowId
    documents.push(document)
  }
  for (const policy of policies as Row[]) {
    const original = originals.find(doc => doc.type === 'policy' && doc.content.id === policy.id)!
    const document = make(original.sourceKey, original.code, original.title, 'policy', original.content, original.moduleIds)
    // Existing policy status is retained in content. Do not invent legal/publication status during import.
    documents.push(document)
  }
  // Reference documents are explicitly internal and never appear in user catalog/search results.
  documents.push(make('reference:workflow.manifest', 'workflow.manifest', 'Workflow container order', 'reference', Object.keys(workflows) as unknown as Row, [], 'internal'))
  for (const [key, value] of Object.entries(configs)) {
    if (['ui.dataset.workflow.sopDatabase', 'ui.dataset.policy.registry'].includes(key)) continue
    const datasetKey = key.startsWith('ui.dataset.') ? key.slice('ui.dataset.'.length) : key
    documents.push(make(`reference:${datasetKey}`, datasetKey, datasetKey, 'reference', value as Row, [], 'internal'))
  }
  for (const row of t('AppConfig').filter(row => row.ScopeType !== 'system' || row.ScopeId !== '*' || !row.IsActive)) {
    const key = 'reference:archived-config:' + JSON.stringify([row.ConfigKey, row.ScopeType, row.ScopeId])
    documents.push(make(key, row.ConfigKey, row.ConfigKey, 'reference', row, [], 'internal'))
  }

  const sopModules = (id: string) => t('SopModule').filter(row => row.SopId === id).map(row => String(row.ModuleId))
  for (const sop of t('Sop')) {
    const versions = t('SopVersion').filter(row => row.SopId === sop.SopId).sort((a, b) => a.VersionNumber - b.VersionNumber)
    if (!versions.length) { blockers.push(`SOP ${sop.SopId} has no version`); continue }
    const document = make(`legacy:sop:${sop.SopId}`, sop.SopCode, sop.Title, 'procedure', {}, sopModules(sop.SopId))
    document.versions = versions.map(version => ({ number: version.VersionNumber, status: version.PublicationStatus,
      from: date(version.ValidFrom), to: date(version.ValidTo), createdBy: version.CreatedBy, createdAt: date(version.CreatedAt), content: {
        sopCode: sop.SopCode, sopTitle: sop.Title, sopCategory: sop.Category, description: version.Definition,
        purpose: version.Purpose, scope: version.Scope, changeLog: version.ChangeLog,
        steps: t('SopStep').filter(row => row.SopVersionId === version.SopVersionId).sort((a,b) => a.SortOrder - b.SortOrder).map(step => ({
          id: step.StableKey, stepCode: step.StepCode, title: step.Title, actor: step.Actor, location: step.Location, timing: step.Timing,
          typeCode: step.TypeCode, description: step.Description, objective: step.Objective, nodeKind: step.NodeKind,
          fieldsChecklist: step.ChecklistJson ? jsonValue(step.ChecklistJson) : [],
          artifacts: t('StepArtifact').filter(row => row.SopStepId === step.SopStepId).sort((a,b) => a.SortOrder - b.SortOrder),
          source: step
        })),
        transitions: t('SopTransition').filter(row => row.SopVersionId === version.SopVersionId).sort((a,b) => a.SortOrder - b.SortOrder),
        relatedDocuments: t('SopRelation').filter(row => row.SourceSopId === sop.SopId).map(row => stableId(`legacy:sop:${row.TargetSopId}`)),
        relations: t('SopRelation').filter(row => row.SourceSopId === sop.SopId),
        attachments: t('DocumentLink').filter(row => row.SopId === sop.SopId && (!row.SopVersionId || row.SopVersionId === version.SopVersionId))
          .map(link => ({ ...link, file: t('Document').find(row => row.DocumentId === link.DocumentId) })),
        source: { sop, version, moduleLinks: t('SopModule').filter(row => row.SopId === sop.SopId) }
      } }))
    const published = versions.find(row => row.SopVersionId === sop.CurrentPublishedVersionId)
    document.currentVersion = (published ?? versions.at(-1))!.VersionNumber
    document.status = published?.PublicationStatus ?? 'draft'
    documents.push(document)
  }
  for (const [table, type, idKey, codeKey, titleKey] of [
    ['GuidanceArticle', 'guide', 'GuidanceArticleId', 'ArticleCode', 'Title'],
    ['GlossaryTerm', 'glossary', 'GlossaryTermId', 'GlossaryTermId', 'Term']
  ]) for (const row of t(table!)) {
    const moduleIds = row.ModuleId ? [row.ModuleId] : row.SopId ? sopModules(row.SopId) : []
    // Unscoped old content needs an explicit business decision; never publish to every module by guessing.
    if (!moduleIds.length) blockers.push(`${table} ${row[idKey!]} needs a module assignment`)
    const document = make(`legacy:${table}:${row[idKey!]}`, row[codeKey!], row[titleKey!], type!, {
      body: row.Content ?? row.Definition, aliases: row.AliasesJson ? jsonValue(row.AliasesJson) : [], source: row
    }, moduleIds)
    document.status = row.Status
    document.versions[0]!.status = row.Status
    documents.push(document)
  }
  for (const file of t('Document')) if (!t('DocumentLink').some(row => row.DocumentId === file.DocumentId)) {
    documents.push(make(`reference:unlinked-file:${file.DocumentId}`, file.DocumentCode, file.Title, 'reference', { attachments: [file] }, [], 'internal'))
  }
  if (t('RagChunk').length) notes.push(`${t('RagChunk').length} derived RAG chunks retained in backup only; regenerate index if RAG is enabled`)
  const moduleIds = new Set(t('HrModule').map(row => String(row.ModuleId)))
  for (const document of documents) {
    if (document.visibility === 'module' && (!document.moduleIds.length || document.moduleIds.some(id => !moduleIds.has(id)))) blockers.push(`Missing module mapping: ${document.sourceKey}`)
  }
  // Refuse overwrite of normalized documents modified after the previous migration.
  for (const existing of t('KnowledgeDocument')) {
    const planned = documents.find(doc => doc.id === existing.DocumentId)
    if (!planned || (existing.ContentJson != null && contentHash(jsonValue(existing.ContentJson)) !== contentHash(planned.versions[0]!.content))) {
      blockers.push(`Normalized document changed or has no source mapping: ${existing.DocumentId}`)
    }
  }
  if (t('KnowledgeDocumentVersion').length) blockers.push('Version table is already populated; use verify for a completed migration, do not overwrite')

  const accounts = t('Account').map(account => {
    const memberships = t('AccountGroup').filter(row => row.AccountId === account.AccountId && t('UserGroup').some(group => group.GroupId === row.GroupId && group.IsActive))
    const grants: Row[] = memberships.flatMap(membership => t('AccessGrant').filter(grant => grant.GroupId === membership.GroupId).map(grant => ({ ...grant, ValidFrom: membership.ValidFrom, ValidTo: membership.ValidTo })))
    const isAdmin = account.SystemRole === 'ADMIN' || grants.some(grant => grant.PermissionCode === 'permission.manage' && grant.ScopeType === 'system' && grant.ScopeId === '*' && !grant.ValidFrom && !grant.ValidTo)
    let readAll = Boolean(account.ReadAllModules)
    const links = t('AccountModuleAccess').filter(row => row.AccountId === account.AccountId).map(row => ({ ...row }))
    const removedPermissions: string[] = []
    for (const grant of grants) {
      if (grant.PermissionCode !== 'sop.read') {
        if (!isAdmin) removedPermissions.push(`${grant.PermissionCode}:${grant.ScopeType}:${grant.ScopeId}`)
        continue
      }
      if (grant.ScopeType === 'sop') { blockers.push(`SOP-only grant for ${account.AccountId}: ${grant.ScopeId}; cannot widen to module access`); continue }
      if (grant.ScopeType === 'system') {
        if (grant.ValidFrom || grant.ValidTo) blockers.push(`Time-bounded global read grant for ${account.AccountId}; explicit mapping required`)
        else readAll = true
        continue
      }
      if (!moduleIds.has(grant.ScopeId)) { blockers.push(`Unknown granted module: ${grant.ScopeId}`); continue }
      const key = JSON.stringify([account.AccountId, grant.GroupId, grant.ScopeId, grant.ValidFrom, grant.ValidTo])
      const id = 'access-' + createHash('sha256').update(key).digest('hex').slice(0, 32)
      if (!links.some(row => row.AccountModuleAccessId === id)) links.push({ AccountModuleAccessId: id, AccountId: account.AccountId,
        ModuleId: grant.ScopeId, GrantSource: 'manual', ValidFrom: grant.ValidFrom ?? null, ValidTo: grant.ValidTo ?? null,
        GrantedBy: null, GrantedAt: account.CreatedAt })
    }
    return { id: String(account.AccountId), role: isAdmin ? 'ADMIN' : 'USER', readAll, links,
      removedPermissions: [...new Set(removedPermissions)].sort(), previousRole: account.SystemRole ?? 'USER' }
  })
  if (!accounts.some(account => account.role === 'ADMIN' && t('Account').find(row => row.AccountId === account.id)?.IsActive)) blockers.push('No active ADMIN after conversion')
  const acknowledgements = t('PolicyAcknowledgement').map(row => {
    const document = documents.find(doc => doc.type === 'policy' && doc.versions[0]?.content.id === row.PolicyId)
    if (!document) blockers.push(`Unmapped policy acknowledgement: ${row.PolicyId}`)
    return { accountId: row.AccountId, documentId: document?.id ?? '', version: document?.currentVersion ?? 1, createdAt: date(row.AcknowledgedAt) }
  })
  return { documents, accounts, acknowledgements, report: {
    fingerprint: snapshotHash(snapshot), coreTables: [...core8Tables], sourceCounts: Object.fromEntries(Object.entries(snapshot.tables).map(([table, rows]) => [table, rows.length])),
    businessDocuments: documents.filter(doc => doc.visibility === 'module').length,
    referenceDocuments: documents.filter(doc => doc.visibility === 'internal').length,
    versions: documents.reduce((sum, doc) => sum + doc.versions.length, 0),
    permissionChanges: accounts.filter(account => account.removedPermissions.length || account.previousRole !== account.role).map(({ links: _links, ...account }) => account),
    blockers: [...new Set(blockers)], notes
  } }
}
