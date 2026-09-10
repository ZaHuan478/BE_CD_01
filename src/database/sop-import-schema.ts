import type { QueryRunner } from './database.js'

/** Additive feature schema shared by legacy and core8 deployments. */
export async function ensureSopImportSchema(database: QueryRunner): Promise<void> {
  await database.query(`CREATE TABLE IF NOT EXISTS SopImportJob (
    SopImportJobId VARCHAR(100) CHARACTER SET ascii NOT NULL PRIMARY KEY,
    Status ENUM('needs_review', 'accepted', 'published', 'failed', 'archived') NOT NULL DEFAULT 'needs_review',
    OriginalFileName VARCHAR(500) NOT NULL,
    StorageKey VARCHAR(500) CHARACTER SET ascii NOT NULL,
    MediaType VARCHAR(200) NOT NULL,
    FileSize BIGINT UNSIGNED NOT NULL,
    Checksum CHAR(64) CHARACTER SET ascii NOT NULL,
    ExtractedText LONGTEXT NOT NULL,
    PreviewJson LONGTEXT NOT NULL,
    WarningsJson LONGTEXT NULL,
    TargetSopId VARCHAR(100) CHARACTER SET ascii NULL,
    TargetVersionId VARCHAR(100) CHARACTER SET ascii NULL,
    AudienceMode ENUM('personal', 'department', 'job_title', 'department_job_title', 'module') NOT NULL DEFAULT 'personal',
    DepartmentName VARCHAR(255) NULL,
    JobTitle VARCHAR(255) NULL,
    SourceDocumentId VARCHAR(100) CHARACTER SET ascii NULL,
    CreatedBy VARCHAR(100) CHARACTER SET ascii NOT NULL,
    CreatedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    UpdatedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    AcceptedAt DATETIME(3) NULL,
    UNIQUE KEY UQ_SopImportJob_StorageKey (StorageKey),
    KEY IX_SopImportJob_Creator (CreatedBy, CreatedAt DESC),
    KEY IX_SopImportJob_Checksum (Checksum, CreatedBy),
    KEY IX_SopImportJob_SourceDocument (SourceDocumentId),
    CONSTRAINT CK_SopImportJob_PreviewJson CHECK (JSON_VALID(PreviewJson)),
    CONSTRAINT CK_SopImportJob_WarningsJson CHECK (WarningsJson IS NULL OR JSON_VALID(WarningsJson)),
    CONSTRAINT FK_SopImportJob_Creator FOREIGN KEY (CreatedBy) REFERENCES Account(AccountId)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_vi_0900_ai_ci`)
  for (const [column, definition] of [
    ['ReviewedBy', 'VARCHAR(100) CHARACTER SET ascii NULL'],
    ['ReviewedAt', 'DATETIME(3) NULL'],
    ['ReviewNote', 'VARCHAR(1000) NULL'],
    ['AudienceMode', "ENUM('personal', 'department', 'job_title', 'department_job_title', 'module') NOT NULL DEFAULT 'personal'"],
    ['DepartmentName', 'VARCHAR(255) NULL'],
    ['JobTitle', 'VARCHAR(255) NULL'],
    ['SourceDocumentId', 'VARCHAR(100) CHARACTER SET ascii NULL']
  ] as const) {
    const rows = await database.query(`SELECT COLUMN_NAME FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND LOWER(TABLE_NAME) = 'sopimportjob' AND COLUMN_NAME = :column`, { column })
    if (!rows.length) await database.query(`ALTER TABLE SopImportJob ADD COLUMN ${column} ${definition}`)
  }
  await database.query("ALTER TABLE SopImportJob MODIFY Status ENUM('needs_review', 'accepted', 'published', 'failed', 'archived') NOT NULL DEFAULT 'needs_review'")
  await database.query("ALTER TABLE SopImportJob MODIFY AudienceMode ENUM('personal', 'department', 'job_title', 'department_job_title', 'module') NOT NULL DEFAULT 'personal'")
  const sourceIndexes = await database.query(`SELECT INDEX_NAME FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND LOWER(TABLE_NAME) = 'sopimportjob'
      AND INDEX_NAME = 'IX_SopImportJob_SourceDocument'`)
  if (!sourceIndexes.length) {
    await database.query('CREATE INDEX IX_SopImportJob_SourceDocument ON SopImportJob (SourceDocumentId)')
  }

  await database.query(`CREATE TABLE IF NOT EXISTS UserDocumentScope (
    DocumentId VARCHAR(100) CHARACTER SET ascii NOT NULL PRIMARY KEY,
    CreatedBy VARCHAR(100) CHARACTER SET ascii NOT NULL,
    AudienceMode ENUM('personal', 'department', 'job_title', 'department_job_title', 'module') NOT NULL DEFAULT 'personal',
    DepartmentName VARCHAR(255) NULL,
    JobTitle VARCHAR(255) NULL,
    CreatedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    KEY IX_UserDocumentScope_Creator (CreatedBy),
    KEY IX_UserDocumentScope_Department (DepartmentName),
    KEY IX_UserDocumentScope_JobTitle (JobTitle)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_vi_0900_ai_ci`)
  await database.query("ALTER TABLE UserDocumentScope MODIFY AudienceMode ENUM('personal', 'department', 'job_title', 'department_job_title', 'module') NOT NULL DEFAULT 'personal'")
}

