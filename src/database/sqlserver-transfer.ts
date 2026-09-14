import mysql, { type RowDataPacket } from 'mysql2/promise'
import sql, { type config as SqlServerConfig } from 'mssql'

interface SourceColumn extends RowDataPacket {
  TABLE_NAME: string
  COLUMN_NAME: string
  ORDINAL_POSITION: number
  DATA_TYPE: string
  COLUMN_TYPE: string
  CHARACTER_MAXIMUM_LENGTH: number | null
  NUMERIC_PRECISION: number | null
  NUMERIC_SCALE: number | null
  IS_NULLABLE: 'YES' | 'NO'
  COLUMN_DEFAULT: string | number | null
  EXTRA: string
  CHARACTER_SET_NAME: string | null
}

interface SourceIndex extends RowDataPacket {
  TABLE_NAME: string
  INDEX_NAME: string
  NON_UNIQUE: number
  SEQ_IN_INDEX: number
  COLUMN_NAME: string
  INDEX_TYPE: string
}

interface SourceForeignKey extends RowDataPacket {
  TABLE_NAME: string
  CONSTRAINT_NAME: string
  COLUMN_NAME: string
  ORDINAL_POSITION: number
  REFERENCED_TABLE_NAME: string
  REFERENCED_COLUMN_NAME: string
  UPDATE_RULE: string
  DELETE_RULE: string
}

interface SourceCheck extends RowDataPacket {
  TABLE_NAME: string
  CONSTRAINT_NAME: string
  CHECK_CLAUSE: string
}

export interface TransferDatabaseConfig {
  host: string
  port: number
  database: string
  user: string
  password: string
  poolMax: number
}

export interface SqlServerTransferConfig extends TransferDatabaseConfig {
  encrypt: boolean
  trustServerCertificate: boolean
  requestTimeoutMs: number
  createDatabase: boolean
}

export interface TransferResult {
  tables: Array<{ table: string; sourceRows: number; targetRows: number; status: 'exact' | 'target_has_extra' }>
  totalSourceRows: number
  totalTargetRows: number
}

const CORE8_TABLE_NAMES = [
  'Account', 'UserGroup', 'AccountGroup', 'Permission', 'AccessGrant', 'MenuItem',
  'HrModule', 'AccountModuleAccess', 'MenuModule', 'Sop', 'SopModule', 'SopVersion',
  'SopStep', 'StepArtifact', 'SopTransition', 'SopRelation', 'Document', 'DocumentLink',
  'GlossaryTerm', 'GuidanceArticle', 'RagChunk', 'RagIndexJob', 'IndexDocumentState',
  'ChatSession', 'ChatMessage', 'PolicyAcknowledgement', 'AuditLog', 'AppConfig',
  'DataImport', 'SchemaMigration', 'KnowledgeDocument', 'KnowledgeDocumentModule',
  'KnowledgeDocumentVersion', 'SopImportJob', 'UserDocument', 'UserDocumentScope',
  'PermissionProfile', 'PermissionProfileCapability', 'AccountPermissionProfile',
  'SopRoleAssignment', 'SopWorkspaceDraft', 'SystemGlossaryTerm',
  'SystemGlossaryTermVersion', 'SystemGuideVersionTerm', 'SystemGuide',
  'SystemGuideVersion', 'SystemGuideTour', 'UserGuideProgress'
] as const

const canonicalTableNames = new Map(CORE8_TABLE_NAMES.map(name => [name.toLowerCase(), name]))

export function canonicalSqlServerTableName(sourceTableName: string): string {
  return canonicalTableNames.get(sourceTableName.toLowerCase()) ?? sourceTableName
}

function identifier(value: string): string {
  return `[${value.replaceAll(']', ']]')}]`
}

function mysqlIdentifier(value: string): string {
  return `\`${value.replaceAll('`', '``')}\``
}

function constraintName(prefix: string, value: string): string {
  return identifier(`${prefix}_${value}`.slice(0, 128))
}

export function translateMySqlCheckClause(checkClause: string): string {
  return checkClause
    .replace(/`([^`]+)`/g, '[$1]')
    .replace(/json_valid\s*\(([^()]*)\)/gi, '(ISJSON($1) = 1)')
}

function sqlServerType(column: SourceColumn): string {
  const type = column.DATA_TYPE.toLowerCase()
  const unsigned = /\bunsigned\b/i.test(column.COLUMN_TYPE)
  const length = Number(column.CHARACTER_MAXIMUM_LENGTH ?? 0)
  switch (type) {
    case 'char':
    case 'varchar': {
      const base = column.CHARACTER_SET_NAME === 'ascii' ? 'VARCHAR' : 'NVARCHAR'
      return `${base}(${length > 0 && length <= (base === 'VARCHAR' ? 8000 : 4000) ? length : 'MAX'})`
    }
    case 'tinytext': return 'NVARCHAR(255)'
    case 'text':
    case 'mediumtext':
    case 'longtext':
    case 'json': return 'NVARCHAR(MAX)'
    case 'tinyint':
      if (/tinyint\s*\(\s*1\s*\)/i.test(column.COLUMN_TYPE)) return 'BIT'
      return unsigned ? 'TINYINT' : 'SMALLINT'
    case 'smallint': return unsigned ? 'INT' : 'SMALLINT'
    case 'mediumint': return 'INT'
    case 'int':
    case 'integer': return unsigned ? 'BIGINT' : 'INT'
    case 'bigint': return unsigned ? 'DECIMAL(20,0)' : 'BIGINT'
    case 'decimal':
    case 'numeric': return `DECIMAL(${column.NUMERIC_PRECISION ?? 38},${column.NUMERIC_SCALE ?? 0})`
    case 'float': return 'REAL'
    case 'double':
    case 'real': return 'FLOAT'
    case 'date': return 'DATE'
    case 'datetime':
    case 'timestamp': return 'DATETIME2(3)'
    case 'time': return 'TIME(3)'
    case 'year': return 'SMALLINT'
    case 'binary': return `BINARY(${Math.max(1, length)})`
    case 'varbinary': return length > 0 && length <= 8000 ? `VARBINARY(${length})` : 'VARBINARY(MAX)'
    case 'tinyblob':
    case 'blob':
    case 'mediumblob':
    case 'longblob': return 'VARBINARY(MAX)'
    case 'enum':
    case 'set': return 'NVARCHAR(255)'
    default: throw new Error(`Unsupported MySQL type ${column.COLUMN_TYPE} on ${column.TABLE_NAME}.${column.COLUMN_NAME}`)
  }
}

function sqlServerDefault(column: SourceColumn): string {
  if (column.COLUMN_DEFAULT === null) return ''
  const raw = String(column.COLUMN_DEFAULT).trim()
  if (/^current_timestamp(?:\(\d+\))?$/i.test(raw)) return ' DEFAULT SYSUTCDATETIME()'
  if (/^b?'[01]'$/i.test(raw) && sqlServerType(column) === 'BIT') return ` DEFAULT ${raw.includes('1') ? '1' : '0'}`
  if (/^-?\d+(?:\.\d+)?$/.test(raw)) return ` DEFAULT ${raw}`
  if (/^null$/i.test(raw)) return ''
  const unquoted = raw.replace(/^'(.*)'$/s, '$1').replaceAll("''", "'")
  return ` DEFAULT N'${unquoted.replaceAll("'", "''")}'`
}

function groupBy<T>(rows: T[], key: (row: T) => string): Map<string, T[]> {
  const grouped = new Map<string, T[]>()
  for (const row of rows) grouped.set(key(row), [...(grouped.get(key(row)) ?? []), row])
  return grouped
}

function sqlServerConnection(config: SqlServerTransferConfig, database = config.database): SqlServerConfig {
  return {
    server: config.host,
    port: config.port,
    database,
    user: config.user,
    password: config.password,
    requestTimeout: config.requestTimeoutMs,
    pool: { min: 0, max: config.poolMax },
    options: {
      encrypt: config.encrypt,
      trustServerCertificate: config.trustServerCertificate,
      enableArithAbort: true,
      useUTC: true
    }
  }
}

async function ensureTargetDatabase(config: SqlServerTransferConfig): Promise<void> {
  if (!/^[A-Za-z0-9_]+$/.test(config.database)) {
    throw new Error('SQLSERVER_DATABASE may only contain letters, digits, and underscores')
  }
  const pool = await new sql.ConnectionPool(sqlServerConnection(config, 'master')).connect()
  try {
    const existing = await pool.request().input('database', config.database)
      .query<{ Existing: number }>('SELECT CASE WHEN DB_ID(@database) IS NULL THEN 0 ELSE 1 END AS Existing')
    if (Number(existing.recordset[0]?.Existing) === 1) return
    if (!config.createDatabase) {
      throw new Error(`SQL Server database ${config.database} does not exist; create it or set SQLSERVER_CREATE_DATABASE=true`)
    }
    await pool.request().query(`CREATE DATABASE ${identifier(config.database)} COLLATE Latin1_General_100_CI_AI_SC`)
  } finally {
    await pool.close()
  }
}

async function assertTargetCompatibility(target: sql.ConnectionPool): Promise<void> {
  const result = await target.request().query<{ ProductMajorVersion: number; CollationName: string }>(`
    SELECT CAST(SERVERPROPERTY('ProductMajorVersion') AS INT) AS ProductMajorVersion,
      CAST(DATABASEPROPERTYEX(DB_NAME(), 'Collation') AS NVARCHAR(128)) AS CollationName`)
  const row = result.recordset[0]
  if (!row || Number(row.ProductMajorVersion) < 14) {
    throw new Error('SQL Server 2017 or newer is required')
  }
  if (!/_CI_/i.test(row.CollationName)) {
    throw new Error(`SQL Server database collation must be case-insensitive; current collation is ${row.CollationName}`)
  }
}

function normalizedRowValue(value: unknown): string | number | boolean | Date | Buffer | null {
  if (value === undefined || value === null) return null
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' || value instanceof Date || Buffer.isBuffer(value)) {
    return value
  }
  if (typeof value === 'bigint') return value.toString()
  return JSON.stringify(value)
}

async function createTables(
  target: sql.ConnectionPool,
  columnsByTable: Map<string, SourceColumn[]>,
  primaryByTable: Map<string, SourceIndex[]>,
  checksByTable: Map<string, SourceCheck[]>
): Promise<void> {
  for (const [table, columns] of columnsByTable) {
    const targetTable = canonicalSqlServerTableName(table)
    const definitions = columns.sort((left, right) => left.ORDINAL_POSITION - right.ORDINAL_POSITION).map(column => {
      const identity = /auto_increment/i.test(column.EXTRA) ? ' IDENTITY(1,1)' : ''
      const nullable = column.IS_NULLABLE === 'YES' ? ' NULL' : ' NOT NULL'
      return `${identifier(column.COLUMN_NAME)} ${sqlServerType(column)}${identity}${nullable}${sqlServerDefault(column)}`
    })
    const primary = (primaryByTable.get(table) ?? []).sort((left, right) => left.SEQ_IN_INDEX - right.SEQ_IN_INDEX)
    if (primary.length) {
      definitions.push(`CONSTRAINT ${constraintName('PK', targetTable)} PRIMARY KEY (${primary.map(row => identifier(row.COLUMN_NAME)).join(', ')})`)
    }
    for (const column of columns.filter(column => column.DATA_TYPE.toLowerCase() === 'enum')) {
      const values = [...column.COLUMN_TYPE.matchAll(/'((?:[^'\\]|\\.)*)'/g)].map(match => match[1]?.replaceAll("\\'", "'") ?? '')
      if (values.length) {
        definitions.push(`CONSTRAINT ${constraintName('CK_ENUM', `${targetTable}_${column.COLUMN_NAME}`)} CHECK (` +
          `${identifier(column.COLUMN_NAME)} IN (${values.map(value => `N'${value.replaceAll("'", "''")}'`).join(', ')}))`)
      }
    }
    for (const check of checksByTable.get(table) ?? []) {
      const clause = translateMySqlCheckClause(check.CHECK_CLAUSE)
      definitions.push(`CONSTRAINT ${identifier(check.CONSTRAINT_NAME)} CHECK (${clause})`)
    }
    const ddl = `IF OBJECT_ID(N'dbo.${targetTable.replaceAll("'", "''")}', N'U') IS NULL\nBEGIN\n  CREATE TABLE dbo.${identifier(targetTable)} (\n    ${definitions.join(',\n    ')}\n  );\nEND`
    try {
      await target.request().query(ddl)
    } catch (error) {
      throw new Error(`Failed to create SQL Server table ${targetTable}: ${error instanceof Error ? error.message : String(error)}`, { cause: error })
    }
  }
}

async function copyTable(
  source: mysql.Pool,
  target: sql.ConnectionPool,
  table: string,
  columns: SourceColumn[],
  keys: SourceIndex[]
): Promise<number> {
  const [sourceRows] = await source.query<RowDataPacket[]>(`SELECT * FROM ${mysqlIdentifier(table)}`)
  if (!sourceRows.length) return 0
  const targetTable = canonicalSqlServerTableName(table)
  const orderedColumns = columns.sort((left, right) => left.ORDINAL_POSITION - right.ORDINAL_POSITION)
  const keyNames = keys.sort((left, right) => left.SEQ_IN_INDEX - right.SEQ_IN_INDEX).map(row => row.COLUMN_NAME)
  if (!keyNames.length) throw new Error(`Table ${table} has no primary or unique key; refusing a non-idempotent copy`)
  const identityColumn = orderedColumns.find(column => /auto_increment/i.test(column.EXTRA))
  const updateColumns = orderedColumns.filter(column => !keyNames.includes(column.COLUMN_NAME) && column !== identityColumn)
  const batchSize = Math.max(1, Math.min(20, Math.floor(900 / Math.max(1, orderedColumns.length))))
  for (let offset = 0; offset < sourceRows.length; offset += batchSize) {
    const rows = sourceRows.slice(offset, offset + batchSize)
    const transaction = new sql.Transaction(target)
    await transaction.begin()
    try {
      const request = new sql.Request(transaction)
      const statements = rows.map((row, rowIndex) => {
        const parameterFor = new Map<string, string>()
        orderedColumns.forEach((column, columnIndex) => {
          const parameter = `r${rowIndex}c${columnIndex}`
          parameterFor.set(column.COLUMN_NAME, `@${parameter}`)
          request.input(parameter, normalizedRowValue(row[column.COLUMN_NAME]))
        })
        const predicate = keyNames.map(name => {
          const parameter = parameterFor.get(name)
          return `(target.${identifier(name)} = ${parameter} OR (target.${identifier(name)} IS NULL AND ${parameter} IS NULL))`
        }).join(' AND ')
        const update = updateColumns.length
          ? `UPDATE target SET ${updateColumns.map(column => `${identifier(column.COLUMN_NAME)} = ${parameterFor.get(column.COLUMN_NAME)}`).join(', ')}\nFROM dbo.${identifier(targetTable)} AS target WHERE ${predicate};\n`
          : ''
        const guard = updateColumns.length ? 'IF @@ROWCOUNT = 0' : `IF NOT EXISTS (SELECT 1 FROM dbo.${identifier(targetTable)} AS target WHERE ${predicate})`
        const insert = `INSERT INTO dbo.${identifier(targetTable)} (${orderedColumns.map(column => identifier(column.COLUMN_NAME)).join(', ')})\n  VALUES (${orderedColumns.map(column => parameterFor.get(column.COLUMN_NAME)).join(', ')});`
        return `${update}${guard}\nBEGIN\n  ${insert}\nEND`
      })
      const write = statements.join('\n')
      if (identityColumn) {
        await request.query(`SET IDENTITY_INSERT dbo.${identifier(targetTable)} ON;
BEGIN TRY
  ${write}
  SET IDENTITY_INSERT dbo.${identifier(targetTable)} OFF;
END TRY
BEGIN CATCH
  SET IDENTITY_INSERT dbo.${identifier(targetTable)} OFF;
  THROW;
END CATCH`)
      } else {
        await request.query(write)
      }
      await transaction.commit()
    } catch (error) {
      try { await transaction.rollback() } catch { /* retain original failure */ }
      throw new Error(
        `Failed to copy MySQL table ${table} at rows ${offset + 1}-${offset + rows.length}: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error }
      )
    }
  }
  return sourceRows.length
}

async function createIndexes(target: sql.ConnectionPool, indexes: SourceIndex[], columnsByTable: Map<string, SourceColumn[]>): Promise<void> {
  const groups = groupBy(indexes.filter(index => index.INDEX_NAME !== 'PRIMARY' && index.INDEX_TYPE !== 'FULLTEXT'), row => `${row.TABLE_NAME}\u0000${row.INDEX_NAME}`)
  for (const rows of groups.values()) {
    const first = rows[0]
    if (!first) continue
    const targetTable = canonicalSqlServerTableName(first.TABLE_NAME)
    const columns = rows.sort((left, right) => left.SEQ_IN_INDEX - right.SEQ_IN_INDEX).map(row => identifier(row.COLUMN_NAME))
    const unique = Number(first.NON_UNIQUE) === 0
    const nullable = new Set((columnsByTable.get(first.TABLE_NAME) ?? []).filter(column => column.IS_NULLABLE === 'YES').map(column => column.COLUMN_NAME))
    const nullableKeys = rows.filter(row => nullable.has(row.COLUMN_NAME)).map(row => `${identifier(row.COLUMN_NAME)} IS NOT NULL`)
    const filter = unique && nullableKeys.length ? ` WHERE ${nullableKeys.join(' AND ')}` : ''
    const ddl = `IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.${targetTable.replaceAll("'", "''")}') AND name = @name)\n` +
      `CREATE ${unique ? 'UNIQUE ' : ''}INDEX ${identifier(first.INDEX_NAME)} ON dbo.${identifier(targetTable)} (${columns.join(', ')})${filter}`
    await target.request().input('name', first.INDEX_NAME).query(ddl)
  }
}

async function createForeignKeys(target: sql.ConnectionPool, foreignKeys: SourceForeignKey[]): Promise<void> {
  const groups = groupBy(foreignKeys, row => `${row.TABLE_NAME}\u0000${row.CONSTRAINT_NAME}`)
  for (const rows of groups.values()) {
    const first = rows[0]
    if (!first) continue
    const targetTable = canonicalSqlServerTableName(first.TABLE_NAME)
    const referencedTable = canonicalSqlServerTableName(first.REFERENCED_TABLE_NAME)
    const ordered = rows.sort((left, right) => left.ORDINAL_POSITION - right.ORDINAL_POSITION)
    const local = ordered.map(row => identifier(row.COLUMN_NAME)).join(', ')
    const referenced = ordered.map(row => identifier(row.REFERENCED_COLUMN_NAME)).join(', ')
    const onDelete = ['CASCADE', 'SET NULL', 'NO ACTION'].includes(first.DELETE_RULE) ? first.DELETE_RULE : 'NO ACTION'
    const onUpdate = ['CASCADE', 'SET NULL', 'NO ACTION'].includes(first.UPDATE_RULE) ? first.UPDATE_RULE : 'NO ACTION'
    const ddl = `IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = @name)\n` +
      `ALTER TABLE dbo.${identifier(targetTable)} WITH CHECK ADD CONSTRAINT ${identifier(first.CONSTRAINT_NAME)} ` +
      `FOREIGN KEY (${local}) REFERENCES dbo.${identifier(referencedTable)} (${referenced}) ` +
      `ON DELETE ${onDelete} ON UPDATE ${onUpdate}`
    await target.request().input('name', first.CONSTRAINT_NAME).query(ddl)
  }
}

export async function transferMySqlToSqlServer(
  sourceConfig: TransferDatabaseConfig,
  targetConfig: SqlServerTransferConfig,
  onProgress: (message: string) => void = () => undefined
): Promise<TransferResult> {
  await ensureTargetDatabase(targetConfig)
  const source = mysql.createPool({
    host: sourceConfig.host, port: sourceConfig.port, database: sourceConfig.database,
    user: sourceConfig.user, password: sourceConfig.password, connectionLimit: sourceConfig.poolMax,
    decimalNumbers: true, supportBigNumbers: true, bigNumberStrings: true, timezone: 'Z'
  })
  const target = await new sql.ConnectionPool(sqlServerConnection(targetConfig)).connect()
  try {
    await assertTargetCompatibility(target)
    const [columns] = await source.query<SourceColumn[]>(`SELECT TABLE_NAME, COLUMN_NAME, ORDINAL_POSITION, DATA_TYPE,
      COLUMN_TYPE, CHARACTER_MAXIMUM_LENGTH, NUMERIC_PRECISION, NUMERIC_SCALE, IS_NULLABLE,
      COLUMN_DEFAULT, EXTRA, CHARACTER_SET_NAME
      FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? ORDER BY TABLE_NAME, ORDINAL_POSITION`, [sourceConfig.database])
    const [indexes] = await source.query<SourceIndex[]>(`SELECT TABLE_NAME, INDEX_NAME, NON_UNIQUE, SEQ_IN_INDEX, COLUMN_NAME, INDEX_TYPE
      FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = ? ORDER BY TABLE_NAME, INDEX_NAME, SEQ_IN_INDEX`, [sourceConfig.database])
    const [foreignKeys] = await source.query<SourceForeignKey[]>(`SELECT k.TABLE_NAME, k.CONSTRAINT_NAME, k.COLUMN_NAME, k.ORDINAL_POSITION,
      k.REFERENCED_TABLE_NAME, k.REFERENCED_COLUMN_NAME, r.UPDATE_RULE, r.DELETE_RULE
      FROM information_schema.KEY_COLUMN_USAGE k
      JOIN information_schema.REFERENTIAL_CONSTRAINTS r
        ON r.CONSTRAINT_SCHEMA = k.CONSTRAINT_SCHEMA AND r.CONSTRAINT_NAME = k.CONSTRAINT_NAME
      WHERE k.CONSTRAINT_SCHEMA = ? AND k.REFERENCED_TABLE_NAME IS NOT NULL
      ORDER BY k.TABLE_NAME, k.CONSTRAINT_NAME, k.ORDINAL_POSITION`, [sourceConfig.database])
    const [checks] = await source.query<SourceCheck[]>(`SELECT tc.TABLE_NAME, tc.CONSTRAINT_NAME, cc.CHECK_CLAUSE
      FROM information_schema.TABLE_CONSTRAINTS tc
      JOIN information_schema.CHECK_CONSTRAINTS cc
        ON cc.CONSTRAINT_SCHEMA = tc.CONSTRAINT_SCHEMA AND cc.CONSTRAINT_NAME = tc.CONSTRAINT_NAME
      WHERE tc.CONSTRAINT_SCHEMA = ? AND tc.CONSTRAINT_TYPE = 'CHECK'
      ORDER BY tc.TABLE_NAME, tc.CONSTRAINT_NAME`, [sourceConfig.database])
    if (!columns.length) throw new Error(`MySQL database ${sourceConfig.database} has no tables`)
    const columnsByTable = groupBy(columns, row => row.TABLE_NAME)
    const primaryByTable = groupBy(indexes.filter(index => index.INDEX_NAME === 'PRIMARY'), row => row.TABLE_NAME)
    const uniqueByTable = groupBy(indexes.filter(index => Number(index.NON_UNIQUE) === 0), row => row.TABLE_NAME)
    const checksByTable = groupBy(checks, row => row.TABLE_NAME)
    onProgress(`Creating ${columnsByTable.size} SQL Server tables`)
    await createTables(target, columnsByTable, primaryByTable, checksByTable)
    const tableResults: TransferResult['tables'] = []
    for (const [table, tableColumns] of columnsByTable) {
      const key = primaryByTable.get(table) ?? uniqueByTable.get(table)?.filter(row => row.INDEX_NAME === uniqueByTable.get(table)?.[0]?.INDEX_NAME) ?? []
      const targetTable = canonicalSqlServerTableName(table)
      onProgress(`Copying ${targetTable}`)
      const sourceRows = await copyTable(source, target, table, tableColumns, key)
      const targetCount = await target.request().query<{ Total: number }>(`SELECT COUNT_BIG(*) AS Total FROM dbo.${identifier(targetTable)}`)
      const targetRows = Number(targetCount.recordset[0]?.Total ?? 0)
      if (targetRows < sourceRows) throw new Error(`Verification failed for ${targetTable}: source=${sourceRows}, target=${targetRows}`)
      tableResults.push({ table: targetTable, sourceRows, targetRows, status: targetRows === sourceRows ? 'exact' : 'target_has_extra' })
    }
    onProgress('Creating indexes')
    await createIndexes(target, indexes, columnsByTable)
    onProgress('Creating foreign keys')
    await createForeignKeys(target, foreignKeys)
    if ([...columnsByTable.keys()].some(table => table.toLowerCase() === 'schemamigration')) {
      await target.request().input('id', 'sqlserver:baseline-transferred').query(`
        IF NOT EXISTS (SELECT 1 FROM dbo.SchemaMigration WHERE MigrationId = @id)
          INSERT INTO dbo.SchemaMigration (MigrationId) VALUES (@id)`)
    }
    return {
      tables: tableResults,
      totalSourceRows: tableResults.reduce((sum, table) => sum + table.sourceRows, 0),
      totalTargetRows: tableResults.reduce((sum, table) => sum + table.targetRows, 0)
    }
  } finally {
    await Promise.allSettled([source.end(), target.close()])
  }
}
