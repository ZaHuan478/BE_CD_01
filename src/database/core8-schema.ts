import { readFile } from 'node:fs/promises'
import type { QueryRunner } from './database.js'

export const core8Tables = ['Account', 'HrModule', 'AccountModuleAccess', 'KnowledgeDocument', 'KnowledgeDocumentModule', 'KnowledgeDocumentVersion', 'AuditLog', 'SchemaMigration'] as const
export const legacyTables = ['RagChunk', 'DocumentLink', 'SopRelation', 'StepArtifact', 'SopTransition', 'SopStep', 'GuidanceArticle', 'GlossaryTerm', 'Document', 'SopModule', 'SopVersion', 'Sop', 'PolicyAcknowledgement', 'MenuModule', 'MenuItem', 'AccessGrant', 'AccountGroup', 'UserGroup', 'Permission', 'AppConfig', 'DataImport'] as const
export const core8Marker = 'core8:verified'

export async function tableExists(database: QueryRunner, table: string): Promise<boolean> {
  if (database.provider === 'sqlserver') {
    const rows = await database.query<{ Name: string }>(`SELECT TABLE_NAME AS Name FROM information_schema.TABLES
      WHERE TABLE_CATALOG = DB_NAME() AND LOWER(TABLE_NAME) = LOWER(:table)`, { table })
    return rows.length > 0
  }
  const rows = await database.query<{ Name: string }>(`SELECT TABLE_NAME AS Name FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = DATABASE() AND LOWER(TABLE_NAME) = LOWER(:table)`, { table })
  return rows.length > 0
}

/** Idempotent additive DDL; intentionally never drops legacy tables. */
export async function installCore8Schema(database: QueryRunner): Promise<void> {
  const baseline = await readFile(new URL('./migrations/100_mysql_schema.mysql.sql', import.meta.url), 'utf8')
  for (const table of ['Account', 'HrModule', 'AccountModuleAccess', 'AuditLog']) {
    const statement = baseline.match(new RegExp(`CREATE TABLE IF NOT EXISTS ${table} \\([\\s\\S]*?;`))?.[0]
    if (!statement) throw new Error(`Missing baseline for ${table}`)
    await database.query(statement)
  }
  await database.query(`CREATE TABLE IF NOT EXISTS SchemaMigration (
    MigrationId VARCHAR(200) CHARACTER SET ascii NOT NULL PRIMARY KEY,
    AppliedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)) ENGINE=InnoDB`)
  await database.query(`CREATE TABLE IF NOT EXISTS KnowledgeDocument (
    DocumentId VARCHAR(100) CHARACTER SET ascii NOT NULL PRIMARY KEY,
    Code VARCHAR(200) NOT NULL, Title VARCHAR(1000) NOT NULL, DocumentType VARCHAR(32) NOT NULL,
    Summary TEXT NOT NULL, WorkflowId VARCHAR(100) CHARACTER SET ascii NULL,
    SourceKey VARCHAR(500) NOT NULL, Status VARCHAR(32) NOT NULL DEFAULT 'published',
    Visibility VARCHAR(32) NOT NULL DEFAULT 'module', SourceOrder INT NOT NULL DEFAULT 0,
    CurrentVersionNumber INT NOT NULL DEFAULT 1,
    CreatedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    UpdatedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    UNIQUE KEY UQ_KnowledgeDocument_Source (SourceKey), KEY IX_KnowledgeDocument_Workflow (WorkflowId)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_vi_0900_ai_ci`)
  await database.query(`CREATE TABLE IF NOT EXISTS KnowledgeDocumentModule (
    DocumentId VARCHAR(100) CHARACTER SET ascii NOT NULL, ModuleId VARCHAR(100) CHARACTER SET ascii NOT NULL,
    PRIMARY KEY (DocumentId, ModuleId), KEY IX_KnowledgeDocumentModule_Module (ModuleId, DocumentId),
    CONSTRAINT FK_KnowledgeDocumentModule_Document FOREIGN KEY (DocumentId) REFERENCES KnowledgeDocument(DocumentId),
    CONSTRAINT FK_KnowledgeDocumentModule_Module FOREIGN KEY (ModuleId) REFERENCES HrModule(ModuleId)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_vi_0900_ai_ci`)
  await database.query(`CREATE TABLE IF NOT EXISTS KnowledgeDocumentVersion (
    DocumentId VARCHAR(100) CHARACTER SET ascii NOT NULL, VersionNumber INT NOT NULL,
    Status VARCHAR(32) NOT NULL DEFAULT 'published', ContentJson JSON NOT NULL, ContentHash CHAR(64) CHARACTER SET ascii NOT NULL,
    EffectiveFrom DATETIME(3) NULL, EffectiveTo DATETIME(3) NULL, CreatedBy VARCHAR(100) CHARACTER SET ascii NULL,
    CreatedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (DocumentId, VersionNumber),
    CONSTRAINT FK_KnowledgeVersion_Document FOREIGN KEY (DocumentId) REFERENCES KnowledgeDocument(DocumentId),
    CONSTRAINT FK_KnowledgeVersion_Account FOREIGN KEY (CreatedBy) REFERENCES Account(AccountId),
    CONSTRAINT CK_KnowledgeVersion_Number CHECK (VersionNumber >= 1),
    CONSTRAINT CK_KnowledgeVersion_Dates CHECK (EffectiveTo IS NULL OR EffectiveFrom IS NULL OR EffectiveTo > EffectiveFrom)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_vi_0900_ai_ci`)
  for (const [table, column, definition] of [
    ['Account', 'ReadAllModules', 'BOOLEAN NOT NULL DEFAULT FALSE'],
    ['KnowledgeDocument', 'Status', "VARCHAR(32) NOT NULL DEFAULT 'published'"],
    ['KnowledgeDocument', 'Visibility', "VARCHAR(32) NOT NULL DEFAULT 'module'"],
    ['KnowledgeDocument', 'SourceOrder', 'INT NOT NULL DEFAULT 0'],
    ['KnowledgeDocument', 'CurrentVersionNumber', 'INT NOT NULL DEFAULT 1']
  ]) {
    const rows = await database.query(`SELECT COLUMN_NAME FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND LOWER(TABLE_NAME) = LOWER(:table) AND COLUMN_NAME = :column`, { table: table!, column: column! })
    if (!rows.length) await database.query(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`)
  }
  await database.query('ALTER TABLE KnowledgeDocument MODIFY DocumentType VARCHAR(32) NOT NULL')
  // Preserve separate time windows inherited from multiple groups in the same table.
  const uniqueAccess = await database.query(`SELECT INDEX_NAME FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE()
    AND LOWER(TABLE_NAME) = 'accountmoduleaccess' AND INDEX_NAME = 'UQ_AccountModuleAccess'`)
  if (uniqueAccess.length) await database.query('ALTER TABLE AccountModuleAccess ADD INDEX IX_AccountModuleAccess_Account (AccountId, ModuleId), DROP INDEX UQ_AccountModuleAccess')
  // Transitional columns from migration 130 must not force writes to two content sources.
  for (const column of ['ContentJson', 'ContentHash']) {
    const rows = await database.query(`SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE()
      AND LOWER(TABLE_NAME) = 'knowledgedocument' AND COLUMN_NAME = :column`, { column })
    if (rows.length) await database.query(`ALTER TABLE KnowledgeDocument MODIFY ${column} ${column === 'ContentJson' ? 'JSON' : 'CHAR(64) CHARACTER SET ascii'} NULL`)
  }
}

export async function assertCore8Ready(database: QueryRunner): Promise<void> {
  const rows = await database.query('SELECT MigrationId FROM SchemaMigration WHERE MigrationId = :id', { id: core8Marker })
  if (!rows.length) throw new Error('Core8 data is not verified. Run db:core8:plan and db:core8:apply first, or db:core8:setup for an empty DB.')
}
