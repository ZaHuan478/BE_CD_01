import type { Snapshot } from './import-snapshot.js'
import type { TransactionalDatabase } from './database.js'
import { core8Marker } from './core8-schema.js'
import { planCore8 } from './core8-plan.js'
import { contentHash } from './normalize-knowledge.js'

const asDate = (value: unknown) => value ? new Date(String(value)) : new Date()

/** Adds the repository snapshot to an empty core8 catalog. It never deletes or overwrites rows. */
export async function seedCore8Demo(database: TransactionalDatabase, snapshot: Snapshot, actorAccountId: string) {
  const plan = planCore8({ format: 'core8-backup-v1', database: 'demo-seed', tables: snapshot.tables })
  if (plan.report.blockers.length) throw new Error('Demo snapshot has blockers: ' + plan.report.blockers.join('; '))
  const receipt = 'core8:demo:' + contentHash(snapshot)
  const existingReceipt = await database.query('SELECT MigrationId FROM SchemaMigration WHERE MigrationId = :receipt', { receipt })
  if (existingReceipt.length) return { alreadySeeded: true, accounts: plan.accounts.length + 1, modules: snapshot.tables.HrModule?.length ?? 0, documents: plan.documents.length }

  return database.transaction(async runner => {
    const ready = await runner.query('SELECT MigrationId FROM SchemaMigration WHERE MigrationId = :marker', { marker: core8Marker })
    if (!ready.length) throw new Error('Run db:core8:setup before seeding demo data')
    const [actor] = await runner.query<{ SystemRole: string; IsActive: boolean }>('SELECT SystemRole, IsActive FROM Account WHERE AccountId = :actor FOR UPDATE', { actor: actorAccountId })
    if (!actor || actor.SystemRole !== 'ADMIN' || !actor.IsActive) throw new Error('Seed actor must be an active ADMIN account')
    for (const table of ['HrModule', 'AccountModuleAccess', 'KnowledgeDocument', 'KnowledgeDocumentModule', 'KnowledgeDocumentVersion']) {
      const [row] = await runner.query<{ Total: number }>(`SELECT COUNT(*) AS Total FROM ${table}`)
      if (Number(row?.Total) !== 0) throw new Error(`Demo seed requires an empty core8 catalog: ${table} contains data`)
    }

    for (const module of snapshot.tables.HrModule ?? []) await runner.query(`INSERT INTO HrModule
      (ModuleId, ModuleCode, Title, Description, ModuleType, Status, IsCommon, SortOrder, CreatedAt, UpdatedAt)
      VALUES (:id, :code, :title, :description, :type, :status, :common, :sortOrder, :createdAt, :updatedAt)`, {
      id: String(module.ModuleId), code: String(module.ModuleCode), title: String(module.Title),
      description: module.Description == null ? null : String(module.Description), type: String(module.ModuleType),
      status: String(module.Status), common: Boolean(module.IsCommon), sortOrder: Number(module.SortOrder ?? 0),
      createdAt: asDate(module.CreatedAt), updatedAt: asDate(module.UpdatedAt)
    })

    const accountPlans = new Map(plan.accounts.map(account => [account.id, account]))
    for (const account of snapshot.tables.Account ?? []) {
      const mapped = accountPlans.get(String(account.AccountId))!
      const conflicts = await runner.query('SELECT AccountId FROM Account WHERE AccountId = :id OR Username = :username', {
        id: String(account.AccountId), username: String(account.Username)
      })
      if (conflicts.length) throw new Error(`Demo account already exists: ${account.AccountId}`)
      await runner.query(`INSERT INTO Account
        (AccountId, ExternalSubject, Username, FullName, Email, SystemRole, ReadAllModules, IsActive, CreatedAt, UpdatedAt)
        VALUES (:id, :subject, :username, :name, :email, :role, :readAll, :active, :createdAt, :updatedAt)`, {
        id: String(account.AccountId), subject: account.ExternalSubject == null ? null : String(account.ExternalSubject),
        username: String(account.Username), name: String(account.FullName), email: account.Email == null ? null : String(account.Email),
        role: mapped.role, readAll: mapped.readAll, active: Boolean(account.IsActive),
        createdAt: asDate(account.CreatedAt), updatedAt: asDate(account.UpdatedAt)
      })
    }
    for (const account of plan.accounts) for (const link of account.links) await runner.query(`INSERT INTO AccountModuleAccess
      (AccountModuleAccessId, AccountId, ModuleId, GrantSource, ValidFrom, ValidTo, GrantedBy, GrantedAt)
      VALUES (:id, :account, :module, 'manual', :from, :to, :actor, :at)`, {
      id: String(link.AccountModuleAccessId), account: account.id, module: String(link.ModuleId),
      from: link.ValidFrom ? asDate(link.ValidFrom) : null, to: link.ValidTo ? asDate(link.ValidTo) : null,
      actor: actorAccountId, at: asDate(link.GrantedAt)
    })

    for (const document of plan.documents) {
      await runner.query(`INSERT INTO KnowledgeDocument
        (DocumentId, Code, Title, DocumentType, Summary, WorkflowId, SourceKey, Status, Visibility, SourceOrder, CurrentVersionNumber)
        VALUES (:id, :code, :title, :type, :summary, :workflow, :source, :status, :visibility, :sortOrder, :version)`, {
        id: document.id, code: document.code, title: document.title, type: document.type, summary: document.summary,
        workflow: document.workflowId, source: document.sourceKey, status: document.status,
        visibility: document.visibility, sortOrder: document.order, version: document.currentVersion
      })
      for (const version of document.versions) await runner.query(`INSERT INTO KnowledgeDocumentVersion
        (DocumentId, VersionNumber, Status, ContentJson, ContentHash, EffectiveFrom, EffectiveTo, CreatedBy, CreatedAt)
        VALUES (:id, :number, :status, :content, :hash, :from, :to, NULL, :createdAt)`, {
        id: document.id, number: version.number, status: version.status, content: JSON.stringify(version.content),
        hash: contentHash(version.content), from: version.from ? asDate(version.from) : null,
        to: version.to ? asDate(version.to) : null, createdAt: version.createdAt ? asDate(version.createdAt) : new Date()
      })
      for (const moduleId of document.moduleIds) await runner.query(
        'INSERT INTO KnowledgeDocumentModule (DocumentId, ModuleId) VALUES (:document, :module)', { document: document.id, module: moduleId }
      )
    }
    await runner.query(`INSERT INTO AuditLog (EntityType, EntityId, Action, ActorAccountId, AfterJson)
      VALUES ('core8-demo', 'repository-snapshot', 'seed', :actor, :details)`, {
      actor: actorAccountId, details: JSON.stringify({ accounts: plan.accounts.length, modules: snapshot.tables.HrModule?.length ?? 0, documents: plan.documents.length })
    })
    await runner.query('INSERT INTO SchemaMigration (MigrationId) VALUES (:receipt)', { receipt })
    return { alreadySeeded: false, accounts: plan.accounts.length + 1, modules: snapshot.tables.HrModule?.length ?? 0, documents: plan.documents.length }
  })
}
