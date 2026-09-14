import 'dotenv/config'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import mysql, { type PoolConnection, type RowDataPacket } from 'mysql2/promise'

const KEEP_ACCOUNT_IDS = ['demo-hr', 'demo-recruiter', 'admin', 'demo-admin'] as const
const CONTENT_OWNER_ID = 'demo-hr'
const AUDIT_ACTOR_ID = 'demo-admin'

type AccountRow = RowDataPacket & {
  AccountId: string
  Username: string
  FullName: string
  SystemRole: string
  IsActive: number
}

const placeholders = (values: readonly unknown[]) => values.map(() => '?').join(', ')

async function rows(connection: PoolConnection, statement: string, parameters: unknown[] = []) {
  const [result] = await connection.query<RowDataPacket[]>(statement, parameters)
  return result
}

async function tableExists(connection: PoolConnection, tableName: string) {
  const result = await rows(connection, `SELECT 1 FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = DATABASE() AND LOWER(TABLE_NAME) = LOWER(?) LIMIT 1`, [tableName])
  return result.length > 0
}

async function backupRows(connection: PoolConnection, removedIds: string[]) {
  const removed = placeholders(removedIds)
  const queries: Array<[string, string, unknown[]]> = [
    ['accounts', `SELECT * FROM Account WHERE AccountId IN (${removed})`, removedIds],
    ['affectedManagers', `SELECT * FROM Account WHERE ManagerAccountId IN (${removed})`, removedIds],
    ['moduleAccess', `SELECT * FROM AccountModuleAccess WHERE AccountId IN (${removed}) OR GrantedBy IN (${removed})`, [...removedIds, ...removedIds]],
    ['permissionProfiles', `SELECT * FROM AccountPermissionProfile WHERE AccountId IN (${removed}) OR AssignedBy IN (${removed})`, [...removedIds, ...removedIds]],
    ['sopRoles', `SELECT * FROM SopRoleAssignment WHERE AccountId IN (${removed}) OR AssignedBy IN (${removed})`, [...removedIds, ...removedIds]],
    ['guideProgress', `SELECT * FROM UserGuideProgress WHERE AccountId IN (${removed})`, removedIds],
    ['auditLogReferences', `SELECT * FROM AuditLog WHERE ActorAccountId IN (${removed})`, removedIds],
    ['knowledgeVersions', `SELECT * FROM KnowledgeDocumentVersion WHERE CreatedBy IN (${removed})`, removedIds],
    ['importJobs', `SELECT * FROM SopImportJob WHERE CreatedBy IN (${removed})`, removedIds],
    ['workspaceDrafts', `SELECT * FROM SopWorkspaceDraft WHERE CreatedBy IN (${removed})`, removedIds],
    ['userDocuments', `SELECT * FROM UserDocument WHERE CreatedBy IN (${removed})`, removedIds],
    ['appConfig', `SELECT * FROM AppConfig WHERE UpdatedBy IN (${removed})`, removedIds]
  ]

  const backup: Record<string, unknown[]> = {}
  for (const [key, statement, parameters] of queries) {
    const tableMatch = statement.match(/FROM\s+([A-Za-z0-9_]+)/i)
    if (tableMatch && !await tableExists(connection, tableMatch[1])) continue
    backup[key] = await rows(connection, statement, parameters)
  }

  if (await tableExists(connection, 'ChatSession')) {
    backup.chatSessions = await rows(connection, `SELECT * FROM ChatSession WHERE AccountId IN (${removed})`, removedIds)
    if (await tableExists(connection, 'ChatMessage')) {
      backup.chatMessages = await rows(connection, `SELECT message.* FROM ChatMessage message
        JOIN ChatSession session ON session.SessionId = message.SessionId
        WHERE session.AccountId IN (${removed})`, removedIds)
    }
  }
  return backup
}

async function updateReference(
  connection: PoolConnection,
  table: string,
  column: string,
  removedIds: string[],
  replacement: string | null
) {
  if (!await tableExists(connection, table)) return 0
  const statement = `UPDATE \`${table}\` SET \`${column}\` = ? WHERE \`${column}\` IN (${placeholders(removedIds)})`
  const [result] = await connection.query<mysql.ResultSetHeader>(statement, [replacement, ...removedIds])
  return result.affectedRows
}

async function main() {
  const apply = process.argv.includes('--apply')
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    charset: 'utf8mb4',
    timezone: 'Z'
  })

  try {
    const accounts = await rows(connection, 'SELECT AccountId, Username, FullName, SystemRole, IsActive FROM Account ORDER BY AccountId') as AccountRow[]
    const keep = accounts.filter(account => KEEP_ACCOUNT_IDS.includes(account.AccountId as typeof KEEP_ACCOUNT_IDS[number]))
    const removed = accounts.filter(account => !KEEP_ACCOUNT_IDS.includes(account.AccountId as typeof KEEP_ACCOUNT_IDS[number]))
    const missingKeepAccounts = KEEP_ACCOUNT_IDS.filter(id => !keep.some(account => account.AccountId === id && Boolean(account.IsActive)))
    if (missingKeepAccounts.length) throw new Error(`Missing active UAT accounts: ${missingKeepAccounts.join(', ')}`)

    console.log(JSON.stringify({
      mode: apply ? 'apply' : 'preview',
      keep: keep.map(({ AccountId, Username, FullName, SystemRole }) => ({ AccountId, Username, FullName, SystemRole })),
      remove: removed.map(({ AccountId, Username, FullName, SystemRole }) => ({ AccountId, Username, FullName, SystemRole }))
    }, null, 2))
    if (!apply || !removed.length) return

    const removedIds = removed.map(account => account.AccountId)
    await connection.beginTransaction()
    try {
      await connection.query(`SELECT AccountId FROM Account WHERE AccountId IN (${placeholders([...KEEP_ACCOUNT_IDS, ...removedIds])}) FOR UPDATE`, [...KEEP_ACCOUNT_IDS, ...removedIds])
      const backup = await backupRows(connection, removedIds)
      const timestamp = new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-')
      const backupPath = resolve('..', '..', '.codex_tmp', 'account-backups', `account-prune-${timestamp}.json`)
      await mkdir(dirname(backupPath), { recursive: true })
      await writeFile(backupPath, JSON.stringify({
        createdAt: new Date().toISOString(),
        database: process.env.DB_NAME,
        keptAccountIds: KEEP_ACCOUNT_IDS,
        removedAccountIds: removedIds,
        data: backup
      }, null, 2), 'utf8')

      const transferredReferences = {
        accountManagers: await updateReference(connection, 'Account', 'ManagerAccountId', removedIds, null),
        moduleGrantors: await updateReference(connection, 'AccountModuleAccess', 'GrantedBy', removedIds, null),
        profileAssigners: await updateReference(connection, 'AccountPermissionProfile', 'AssignedBy', removedIds, null),
        sopRoleAssigners: await updateReference(connection, 'SopRoleAssignment', 'AssignedBy', removedIds, null),
        configEditors: await updateReference(connection, 'AppConfig', 'UpdatedBy', removedIds, null),
        auditActors: await updateReference(connection, 'AuditLog', 'ActorAccountId', removedIds, null),
        knowledgeVersions: await updateReference(connection, 'KnowledgeDocumentVersion', 'CreatedBy', removedIds, CONTENT_OWNER_ID),
        importJobs: await updateReference(connection, 'SopImportJob', 'CreatedBy', removedIds, CONTENT_OWNER_ID),
        workspaceDrafts: await updateReference(connection, 'SopWorkspaceDraft', 'CreatedBy', removedIds, CONTENT_OWNER_ID),
        userDocuments: await updateReference(connection, 'UserDocument', 'CreatedBy', removedIds, CONTENT_OWNER_ID)
      }

      let deletedChatSessions = 0
      if (await tableExists(connection, 'ChatSession')) {
        const [result] = await connection.query<mysql.ResultSetHeader>(
          `DELETE FROM ChatSession WHERE AccountId IN (${placeholders(removedIds)})`, removedIds
        )
        deletedChatSessions = result.affectedRows
      }

      const [deleteResult] = await connection.query<mysql.ResultSetHeader>(
        `DELETE FROM Account WHERE AccountId IN (${placeholders(removedIds)})`, removedIds
      )
      await connection.query(`INSERT INTO AuditLog
        (EntityType, EntityId, Action, ActorAccountId, AfterJson)
        VALUES ('account-maintenance', 'uat-account-set', 'prune', ?, ?)`, [
        AUDIT_ACTOR_ID,
        JSON.stringify({
          keptAccountIds: KEEP_ACCOUNT_IDS,
          removedAccountIds: removedIds,
          transferredReferences,
          deletedChatSessions,
          backupPath
        })
      ])
      await connection.commit()
      console.log(JSON.stringify({
        applied: true,
        deletedAccounts: deleteResult.affectedRows,
        deletedChatSessions,
        transferredReferences,
        backupPath
      }, null, 2))
    } catch (error) {
      await connection.rollback()
      throw error
    }
  } finally {
    await connection.end()
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
