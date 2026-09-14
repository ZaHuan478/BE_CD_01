import type { QueryRunner } from './database.js'

/**
 * Additive schema and safe reconciliation for UserDocument.
 * Operates safely in both core8 and legacy database configurations.
 */
export async function ensureUserDocumentSchema(database: QueryRunner): Promise<void> {
  await database.query(`CREATE TABLE IF NOT EXISTS UserDocument (
    DocumentId VARCHAR(100) CHARACTER SET ascii NOT NULL PRIMARY KEY,
    OriginalFileName VARCHAR(500) NOT NULL,
    DisplayName VARCHAR(500) NOT NULL,
    StorageKey VARCHAR(500) CHARACTER SET ascii NOT NULL,
    MediaType VARCHAR(200) NOT NULL,
    FileSize BIGINT UNSIGNED NOT NULL,
    Checksum CHAR(64) CHARACTER SET ascii NOT NULL,
    CreatedBy VARCHAR(100) CHARACTER SET ascii NOT NULL,
    CreatedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    UpdatedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    DeletedAt DATETIME(3) NULL,
    SourceImportJobId VARCHAR(100) CHARACTER SET ascii NULL,
    KEY IX_UserDocument_Creator (CreatedBy, DeletedAt, CreatedAt DESC),
    KEY IX_UserDocument_Checksum (Checksum, CreatedBy),
    KEY IX_UserDocument_StorageKey (StorageKey),
    CONSTRAINT FK_UserDocument_Creator FOREIGN KEY (CreatedBy) REFERENCES Account(AccountId)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_vi_0900_ai_ci`)

  // Check if SopImportJob exists; if so, safely import legacy files for users
  const sopImportJobs = await database.query<{ TABLE_NAME: string }>(`
    SELECT TABLE_NAME FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = DATABASE() AND LOWER(TABLE_NAME) = 'sopimportjob'
  `)
  if (sopImportJobs.length > 0) {
    await database.query(`
      INSERT INTO UserDocument (
        DocumentId, OriginalFileName, DisplayName, StorageKey, MediaType, FileSize, Checksum, CreatedBy, CreatedAt, UpdatedAt, DeletedAt, SourceImportJobId
      )
      SELECT
        j.SopImportJobId, j.OriginalFileName, j.OriginalFileName, j.StorageKey, j.MediaType, j.FileSize, j.Checksum, j.CreatedBy, j.CreatedAt, j.UpdatedAt, NULL, j.SopImportJobId
      FROM SopImportJob j
      WHERE NOT EXISTS (
        SELECT 1 FROM UserDocument ud WHERE ud.SourceImportJobId = j.SopImportJobId OR ud.DocumentId = j.SopImportJobId
      )
        AND NOT EXISTS (
          SELECT 1
          FROM AuditLog audit
          WHERE audit.EntityType = 'user-document'
            AND audit.Action = 'admin-permanent-delete'
            AND JSON_VALID(audit.BeforeJson) = 1
            AND (
              JSON_UNQUOTE(JSON_EXTRACT(audit.BeforeJson, '$.sourceImportJobId')) = j.SopImportJobId
              OR JSON_UNQUOTE(JSON_EXTRACT(audit.BeforeJson, '$.storageKey')) = j.StorageKey
            )
        )
    `)

    // Persist the reverse link for records imported from the old conversion
    // table. A permanent delete deliberately clears this field; the audit
    // exclusion above then prevents the source document from being recreated
    // on the next backend startup.
    await database.query(`
      UPDATE SopImportJob job
      JOIN UserDocument document ON document.SourceImportJobId = job.SopImportJobId
      SET job.SourceDocumentId = document.DocumentId,
          job.UpdatedAt = UTC_TIMESTAMP(3)
      WHERE job.SourceDocumentId IS NULL
    `)

    // Reconcile indexes created before source-deletion propagation existed.
    // Stale rows remain available to Audit Log but disappear from the RAG
    // dashboard and are rejected by retrieval queries.
    await database.query(`
      UPDATE IndexDocumentState state
      INNER JOIN SopImportJob job ON job.TargetSopId = state.EntityId
        AND state.VersionId = CONCAT('v', job.TargetVersionId)
      LEFT JOIN UserDocument sourceDocument ON sourceDocument.DocumentId = job.SourceDocumentId
      SET state.IndexStatus = 'stale', state.UpdatedAt = UTC_TIMESTAMP(3)
      WHERE (job.SourceDocumentId IS NOT NULL
          AND (sourceDocument.DocumentId IS NULL OR sourceDocument.DeletedAt IS NOT NULL))
         OR EXISTS (
          SELECT 1 FROM AuditLog deletedSource
          WHERE deletedSource.EntityType = 'user-document'
            AND deletedSource.Action = 'admin-permanent-delete'
            AND JSON_VALID(deletedSource.BeforeJson) = 1
            AND (
              JSON_UNQUOTE(JSON_EXTRACT(deletedSource.BeforeJson, '$.sourceImportJobId')) = job.SopImportJobId
              OR JSON_UNQUOTE(JSON_EXTRACT(deletedSource.BeforeJson, '$.storageKey')) = job.StorageKey
            )
        )
    `)
  }
}
