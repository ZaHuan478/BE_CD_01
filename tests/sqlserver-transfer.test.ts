import { describe, expect, it } from 'vitest'
import { canonicalSqlServerTableName, translateMySqlCheckClause } from '../src/database/sqlserver-transfer.js'

describe('MySQL to SQL Server schema translation', () => {
  it('turns JSON_VALID into a boolean SQL Server check expression', () => {
    expect(translateMySqlCheckClause('json_valid(`ValueJson`)'))
      .toBe('(ISJSON([ValueJson]) = 1)')
  })

  it('preserves nullable JSON check semantics', () => {
    expect(translateMySqlCheckClause('((`AfterJson` is null) or json_valid(`AfterJson`))'))
      .toBe('(([AfterJson] is null) or (ISJSON([AfterJson]) = 1))')
  })

  it('converts identifiers in ordinary checks', () => {
    expect(translateMySqlCheckClause('(`VersionNumber` >= 1)'))
      .toBe('([VersionNumber] >= 1)')
  })

  it('restores canonical Core8 table casing lost by MySQL on Windows', () => {
    expect(canonicalSqlServerTableName('ragindexjob')).toBe('RagIndexJob')
    expect(canonicalSqlServerTableName('accountpermissionprofile')).toBe('AccountPermissionProfile')
    expect(canonicalSqlServerTableName('custom_table')).toBe('custom_table')
  })
})
