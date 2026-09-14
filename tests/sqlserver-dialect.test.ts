import { describe, expect, it } from 'vitest'
import { translateSqlServerStatement } from '../src/database/sqlserver-dialect.js'

describe('SQL Server repository dialect', () => {
  it('translates nested and top-level MySQL limits', () => {
    const nested = translateSqlServerStatement(`SELECT s.SopId FROM Sop s
      JOIN SopVersion v ON v.SopVersionId = (
        SELECT candidate.SopVersionId FROM SopVersion candidate
        WHERE candidate.SopId = s.SopId ORDER BY candidate.VersionNumber DESC LIMIT 1
      ) ORDER BY s.Title LIMIT 100`)
    expect(nested.statement).toContain('SELECT TOP (1) candidate.SopVersionId')
    expect(nested.statement).toContain('SELECT TOP (100) s.SopId')
    expect(nested.statement).not.toMatch(/\bLIMIT\b/i)
  })

  it('uses OFFSET FETCH for pagination parameters', () => {
    const result = translateSqlServerStatement('SELECT * FROM UserDocument ORDER BY CreatedAt DESC LIMIT :limit OFFSET :offset')
    expect(result.statement).toBe('SELECT * FROM UserDocument ORDER BY CreatedAt DESC OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY')
  })

  it('translates JSON, aggregate, timestamp, and null-safe operations', () => {
    const result = translateSqlServerStatement(`SELECT
      GROUP_CONCAT(DISTINCT COALESCE(module.ModuleId, fallback.ModuleId) SEPARATOR '|') AS ModuleIds
      FROM RagChunk chunk
      WHERE JSON_VALID(chunk.MetadataJson) = 1
        AND JSON_UNQUOTE(JSON_EXTRACT(chunk.MetadataJson, '$.actor')) = :actor
        AND JSON_LENGTH(JSON_EXTRACT(chunk.MetadataJson, '$.items')) > 0
        AND JSON_CONTAINS(chunk.ModuleIdsJson, JSON_QUOTE(:moduleId))
        AND chunk.TargetId <=> :targetId
        AND chunk.CreatedAt <= UTC_TIMESTAMP(3)
        AND DATABASE() = :databaseName`)
    expect(result.statement).toContain("STRING_AGG(CONVERT(NVARCHAR(MAX), COALESCE(module.ModuleId, fallback.ModuleId)), N'|')")
    expect(result.statement).toContain('ISJSON(chunk.MetadataJson)')
    expect(result.statement).toContain("JSON_VALUE(chunk.MetadataJson, '$.actor') = @actor")
    expect(result.statement).toContain("OPENJSON(JSON_QUERY(chunk.MetadataJson, '$.items'))")
    expect(result.statement).toContain('OPENJSON(chunk.ModuleIdsJson)')
    expect(result.statement).toContain('(chunk.TargetId = @targetId OR (chunk.TargetId IS NULL AND @targetId IS NULL))')
    expect(result.statement).toContain('SYSUTCDATETIME()')
    expect(result.statement).toContain('DB_NAME() = @databaseName')
  })

  it('translates joined updates and duplicate-tolerant inserts', () => {
    const update = translateSqlServerStatement(`UPDATE IndexDocumentState state
      INNER JOIN SopImportJob job ON job.TargetSopId = state.EntityId
      SET state.IndexStatus = 'stale', state.UpdatedAt = UTC_TIMESTAMP(3)
      WHERE job.SourceDocumentId = :documentId`)
    expect(update.statement).toContain("UPDATE state SET IndexStatus = 'stale'")
    expect(update.statement).toContain('FROM IndexDocumentState state INNER JOIN SopImportJob job')
    const insert = translateSqlServerStatement('INSERT IGNORE INTO SopRoleAssignment (SopResourceId) VALUES (:id)')
    expect(insert.ignoreDuplicate).toBe(true)
    expect(insert.statement).toBe('INSERT INTO SopRoleAssignment (SopResourceId) VALUES (@id)')
    const locked = translateSqlServerStatement('SELECT * FROM KnowledgeDocument WHERE DocumentId = :id LIMIT 1 FOR UPDATE')
    expect(locked.statement).toContain('FROM KnowledgeDocument WITH (UPDLOCK, ROWLOCK)')
    expect(locked.statement).toContain('SELECT TOP (1) *')
  })
})
