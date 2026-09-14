export interface SqlServerStatement {
  statement: string
  ignoreDuplicate: boolean
}

function depthAt(statement: string, targetIndex: number): number {
  let depth = 0
  let quoted = false
  for (let index = 0; index < targetIndex; index += 1) {
    const char = statement[index]
    if (char === "'") {
      if (quoted && statement[index + 1] === "'") {
        index += 1
        continue
      }
      quoted = !quoted
      continue
    }
    if (quoted) continue
    if (char === '(') depth += 1
    else if (char === ')') depth -= 1
  }
  return depth
}

function selectForLimit(statement: string, limitIndex: number): number {
  const wantedDepth = depthAt(statement, limitIndex)
  const selectPattern = /\bSELECT\b/gi
  let selected = -1
  for (let match = selectPattern.exec(statement); match && match.index < limitIndex; match = selectPattern.exec(statement)) {
    if (depthAt(statement, match.index) === wantedDepth) selected = match.index
  }
  return selected
}

function convertLimits(statement: string): string {
  let converted = statement
  const pattern = /\bLIMIT\s+(:[A-Za-z_][A-Za-z0-9_]*|\d+)(?:\s+OFFSET\s+(:[A-Za-z_][A-Za-z0-9_]*|\d+))?/i
  for (let match = pattern.exec(converted); match; match = pattern.exec(converted)) {
    const index = match.index
    const limit = match[1]
    const offset = match[2]
    if (!limit) break
    if (offset) {
      converted = converted.slice(0, index)
        + `OFFSET ${offset} ROWS FETCH NEXT ${limit} ROWS ONLY`
        + converted.slice(index + match[0].length)
      continue
    }
    const selectIndex = selectForLimit(converted, index)
    if (selectIndex < 0) throw new Error('Cannot translate MySQL LIMIT without a matching SELECT')
    const afterSelect = selectIndex + 'SELECT'.length
    const distinct = /^\s+DISTINCT\b/i.exec(converted.slice(afterSelect))
    const insertAt = distinct ? afterSelect + distinct[0].length : afterSelect
    converted = converted.slice(0, insertAt) + ` TOP (${limit})` + converted.slice(insertAt, index)
      + converted.slice(index + match[0].length)
  }
  return converted
}

function convertJson(statement: string): string {
  let converted = statement
  converted = converted.replace(
    /JSON_LENGTH\s*\(\s*JSON_EXTRACT\s*\(\s*([^,()]+)\s*,\s*'([^']+)'\s*\)\s*\)/gi,
    "(SELECT COUNT(1) FROM OPENJSON(JSON_QUERY($1, '$2')))"
  )
  converted = converted.replace(
    /JSON_UNQUOTE\s*\(\s*JSON_EXTRACT\s*\(\s*([^,()]+)\s*,\s*'([^']+)'\s*\)\s*\)/gi,
    "JSON_VALUE($1, '$2')"
  )
  converted = converted.replace(
    /JSON_CONTAINS\s*\(\s*([^,()]+)\s*,\s*JSON_QUOTE\s*\(\s*(:[A-Za-z_][A-Za-z0-9_]*)\s*\)\s*\)/gi,
    'EXISTS (SELECT 1 FROM OPENJSON($1) AS jsonItem WHERE jsonItem.[value] = $2)'
  )
  converted = converted.replace(/JSON_EXTRACT\s*\(\s*([^,()]+)\s*,\s*'([^']+)'\s*\)/gi, "JSON_VALUE($1, '$2')")
  converted = converted.replace(/JSON_VALID\s*\(/gi, 'ISJSON(')
  return converted
}

function convertAggregates(statement: string): string {
  let converted = statement.replace(
    /GROUP_CONCAT\s*\(\s*(?:DISTINCT\s+)?(COALESCE\s*\([^)]*\))\s+SEPARATOR\s+'([^']*)'\s*\)/gi,
    "STRING_AGG(CONVERT(NVARCHAR(MAX), $1), N'$2')"
  )
  converted = converted.replace(
    /GROUP_CONCAT\s*\(\s*(?:DISTINCT\s+)?([^()]+?)\s+SEPARATOR\s+'([^']*)'\s*\)/gi,
    "STRING_AGG(CONVERT(NVARCHAR(MAX), $1), N'$2')"
  )
  return converted
}

function convertUpdateJoin(statement: string): string {
  return statement.replace(
    /UPDATE\s+([A-Za-z_][A-Za-z0-9_]*)\s+([A-Za-z_][A-Za-z0-9_]*)\s+INNER\s+JOIN\s+([\s\S]+?)\s+SET\s+([\s\S]+?)\s+WHERE\s+/i,
    (_match, table: string, alias: string, join: string, assignments: string) => {
      const unqualified = assignments.replace(new RegExp(`\\b${alias}\\.`, 'g'), '')
      return `UPDATE ${alias} SET ${unqualified} FROM ${table} ${alias} INNER JOIN ${join} WHERE `
    }
  )
}

/**
 * Translate the small MySQL SQL surface used by the repositories. Schema DDL is
 * intentionally excluded; SQL Server schema is created by the transfer command.
 */
export function translateSqlServerStatement(statement: string): SqlServerStatement {
  const ignoreDuplicate = /\bINSERT\s+IGNORE\b/i.test(statement)
  const lockForUpdate = /\bFOR\s+UPDATE\b/i.test(statement)
  let converted = statement.replace(/\bINSERT\s+IGNORE\b/gi, 'INSERT')
  converted = converted.replace(/\s+FOR\s+UPDATE\b/gi, '')
  if (lockForUpdate) {
    converted = converted.replace(
      /\bFROM\s+([A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)?)/i,
      'FROM $1 WITH (UPDLOCK, ROWLOCK)'
    )
  }
  converted = converted.replace(/\bUTC_TIMESTAMP\s*\(\s*3\s*\)/gi, 'SYSUTCDATETIME()')
  converted = converted.replace(/\bCURRENT_TIMESTAMP\s*\(\s*3\s*\)/gi, 'SYSUTCDATETIME()')
  converted = converted.replace(/\bDATABASE\s*\(\s*\)/gi, 'DB_NAME()')
  converted = converted.replace(/\bCAST\s*\(([^()]+)\s+AS\s+UNSIGNED\s*\)/gi, 'CAST($1 AS BIGINT)')
  converted = converted.replace(/\bTRUE\b/gi, '1').replace(/\bFALSE\b/gi, '0')
  converted = converted.replace(
    /([A-Za-z_][A-Za-z0-9_.]*)\s*<=>\s*(:[A-Za-z_][A-Za-z0-9_]*)/gi,
    '($1 = $2 OR ($1 IS NULL AND $2 IS NULL))'
  )
  converted = convertJson(converted)
  converted = convertAggregates(converted)
  converted = convertUpdateJoin(converted)
  converted = convertLimits(converted)
  converted = converted.replace(/(?<!:):([A-Za-z_][A-Za-z0-9_]*)/g, '@$1')
  return { statement: converted, ignoreDuplicate }
}

export function isSqlServerDuplicateError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const candidate = error as { number?: unknown; code?: unknown; originalError?: { info?: { number?: unknown } } }
  const number = Number(candidate.number ?? candidate.originalError?.info?.number)
  return number === 2601 || number === 2627 || candidate.code === 'EREQUEST' && (number === 2601 || number === 2627)
}
