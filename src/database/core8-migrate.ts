import type { QueryRunner, TransactionalDatabase } from './database.js'
import { contentHash } from './normalize-knowledge.js'
import { core8Marker, core8Tables, legacyTables, tableExists } from './core8-schema.js'
import { planCore8, type Core8Snapshot } from './core8-plan.js'
import { jsonValue } from '../repositories/core-document.repository.js'

const digestRows = (rows: unknown[]) => contentHash(rows.map(row => contentHash(row)).sort())

export async function assertSourceUnchanged(database: QueryRunner, snapshot: Core8Snapshot, lock = false) {
  for (const table of Object.keys(snapshot.tables)) {
    if (![...core8Tables, ...legacyTables].includes(table as any) || table === 'SchemaMigration') continue
    const source = snapshot.tables[table] ?? []
    if (!await tableExists(database, table)) {
      if (source.length) throw new Error(`Source table missing: ${table}`)
      continue
    }
    const columns = source[0] ? Object.keys(source[0]) : []
    if (columns.some(column => !/^[a-zA-Z0-9_]+$/.test(column))) throw new Error('Invalid backup column')
    const current = JSON.parse(JSON.stringify(await database.query(`SELECT ${columns.length ? columns.map(column => '`' + column + '`').join(',') : '*'} FROM ${table}${lock ? ' FOR UPDATE' : ''}`))) as unknown[]
    if (digestRows(current) !== digestRows(source)) throw new Error(`Source changed since plan/backup: ${table}`)
  }
}

/** Additive conversion only. No legacy tables or content are deleted here. */
export async function applyCore8(database: TransactionalDatabase, snapshot: Core8Snapshot, acceptPermissionSimplification: boolean) {
  const plan = planCore8(snapshot)
  if (plan.report.blockers.length) throw new Error('Core8 plan has blockers: ' + plan.report.blockers.join('; '))
  if (plan.report.permissionChanges.length && !acceptPermissionSimplification) throw new Error('Review permissionChanges and explicitly pass --accept-permission-simplification')
  return database.transaction(async runner => {
    const existing = await runner.query('SELECT MigrationId FROM SchemaMigration WHERE MigrationId = :id', { id: core8Marker })
    if (existing.length) { await verifyCore8(runner, snapshot); return { alreadyApplied: true } }
    await assertSourceUnchanged(runner, snapshot, true)
    for (const account of plan.accounts) {
      await runner.query('UPDATE Account SET SystemRole = :role, ReadAllModules = :readAll WHERE AccountId = :id', { role: account.role, readAll: Number(account.readAll), id: account.id })
      const oldIds = new Set((snapshot.tables.AccountModuleAccess ?? []).map(row => row.AccountModuleAccessId))
      for (const link of account.links) if (!oldIds.has(link.AccountModuleAccessId)) await runner.query(`INSERT INTO AccountModuleAccess
        (AccountModuleAccessId, AccountId, ModuleId, GrantSource, ValidFrom, ValidTo, GrantedBy, GrantedAt)
        VALUES (:id, :account, :module, 'manual', :from, :to, NULL, :at)`, {
        id: link.AccountModuleAccessId, account: account.id, module: link.ModuleId,
        from: link.ValidFrom ? new Date(link.ValidFrom) : null, to: link.ValidTo ? new Date(link.ValidTo) : null,
        at: link.GrantedAt ? new Date(link.GrantedAt) : new Date()
      })
    }
    for (const document of plan.documents) {
      await runner.query(`INSERT INTO KnowledgeDocument
        (DocumentId, Code, Title, DocumentType, Summary, WorkflowId, SourceKey, Status, Visibility, SourceOrder, CurrentVersionNumber)
        VALUES (:id, :code, :title, :type, :summary, :workflow, :source, :status, :visibility, :order, :version)
        ON DUPLICATE KEY UPDATE Status = :status, Visibility = :visibility, SourceOrder = :order, CurrentVersionNumber = :version`, {
        id: document.id, code: document.code, title: document.title, type: document.type, summary: document.summary,
        workflow: document.workflowId, source: document.sourceKey, status: document.status, visibility: document.visibility,
        order: document.order, version: document.currentVersion
      })
      for (const version of document.versions) await runner.query(`INSERT INTO KnowledgeDocumentVersion
        (DocumentId, VersionNumber, Status, ContentJson, ContentHash, EffectiveFrom, EffectiveTo, CreatedBy, CreatedAt)
        VALUES (:id, :version, :status, :content, :hash, :from, :to, :actor, :at)`, {
        id: document.id, version: version.number, status: version.status, content: JSON.stringify(version.content), hash: contentHash(version.content),
        from: version.from ? new Date(version.from) : null, to: version.to ? new Date(version.to) : null,
        actor: version.createdBy, at: version.createdAt ? new Date(version.createdAt) : new Date()
      })
      for (const moduleId of document.moduleIds) await runner.query(`INSERT INTO KnowledgeDocumentModule (DocumentId, ModuleId)
        VALUES (:id, :module) ON DUPLICATE KEY UPDATE ModuleId = :module`, { id: document.id, module: moduleId })
    }
    for (const acknowledgement of plan.acknowledgements) await runner.query(`INSERT INTO AuditLog
      (EntityType, EntityId, Action, ActorAccountId, AfterJson, CreatedAt)
      VALUES ('policy-acknowledgement', :id, 'acknowledge', :actor, :after, :at)`, {
      id: acknowledgement.documentId, actor: acknowledgement.accountId, after: JSON.stringify({ version: acknowledgement.version, source: 'PolicyAcknowledgement' }),
      at: acknowledgement.createdAt ? new Date(acknowledgement.createdAt) : new Date()
    })
    await runner.query(`INSERT INTO AuditLog (EntityType, EntityId, Action, AfterJson)
      VALUES ('core8-migration', 'core8', 'apply', :report)`, { report: JSON.stringify(plan.report) })
    await verifyCore8(runner, snapshot)
    await runner.query('INSERT INTO SchemaMigration (MigrationId) VALUES (:id)', { id: core8Marker })
    await runner.query('INSERT INTO SchemaMigration (MigrationId) VALUES (:id)', { id: 'core8:source:' + plan.report.fingerprint })
    return { alreadyApplied: false, ...plan.report }
  })
}

export async function verifyCore8(database: QueryRunner, snapshot: Core8Snapshot) {
  const plan = planCore8(snapshot)
  const documents = await database.query<Record<string, any>>('SELECT * FROM KnowledgeDocument')
  const versions = await database.query<Record<string, any>>('SELECT * FROM KnowledgeDocumentVersion')
  const links = await database.query<{ DocumentId: string; ModuleId: string }>('SELECT DocumentId, ModuleId FROM KnowledgeDocumentModule')
  for (const doc of plan.documents) {
    const row = documents.find(row => row.DocumentId === doc.id)
    if (!row || row.Code !== doc.code || row.Title !== doc.title || row.DocumentType !== doc.type || row.Summary !== doc.summary
      || row.SourceKey !== doc.sourceKey || row.WorkflowId !== doc.workflowId || row.Visibility !== doc.visibility
      || row.Status !== doc.status || row.SourceOrder !== doc.order || row.CurrentVersionNumber !== doc.currentVersion) throw new Error(`Document verification failed: ${doc.id}`)
    if (links.filter(link => link.DocumentId === doc.id).map(link => link.ModuleId).sort().join(',') !== doc.moduleIds.join(',')) throw new Error(`Module links differ: ${doc.id}`)
    for (const version of doc.versions) {
      const saved = versions.find(row => row.DocumentId === doc.id && row.VersionNumber === version.number)
      const iso = (value: any) => value ? new Date(value).toISOString() : null
      if (!saved || saved.ContentHash !== contentHash(version.content) || contentHash(jsonValue(saved.ContentJson)) !== contentHash(version.content)
        || saved.Status !== version.status || iso(saved.EffectiveFrom) !== version.from || iso(saved.EffectiveTo) !== version.to
        || saved.CreatedBy !== version.createdBy) throw new Error(`Version verification failed: ${doc.id}/${version.number}`)
    }
  }
  for (const account of plan.accounts) {
    const [row] = await database.query<{ SystemRole: string; ReadAllModules: boolean }>('SELECT SystemRole, ReadAllModules FROM Account WHERE AccountId = :id', { id: account.id })
    if (!row || row.SystemRole !== account.role || Boolean(row.ReadAllModules) !== account.readAll) throw new Error(`Account role differs: ${account.id}`)
    const actual = await database.query<Record<string, any>>('SELECT * FROM AccountModuleAccess WHERE AccountId = :id', { id: account.id })
    for (const expected of account.links) {
      const saved = actual.find(row => row.AccountModuleAccessId === expected.AccountModuleAccessId)
      const iso = (v: any) => v ? new Date(v).toISOString() : null
      if (!saved || saved.ModuleId !== expected.ModuleId || saved.GrantSource !== expected.GrantSource
        || iso(saved.ValidFrom) !== iso(expected.ValidFrom) || iso(saved.ValidTo) !== iso(expected.ValidTo)) throw new Error(`User module access differs: ${account.id}`)
    }
  }
  for (const acknowledgement of plan.acknowledgements) {
    const rows = await database.query(`SELECT AuditLogId FROM AuditLog WHERE EntityType = 'policy-acknowledgement'
      AND EntityId = :id AND ActorAccountId = :actor AND Action = 'acknowledge'
      AND JSON_EXTRACT(AfterJson, '$.version') = :version`, { id: acknowledgement.documentId, actor: acknowledgement.accountId, version: acknowledgement.version })
    if (!rows.length) throw new Error('Policy acknowledgement was not preserved')
  }
  return { verified: true, documents: plan.documents.length, versions: plan.report.versions }
}
