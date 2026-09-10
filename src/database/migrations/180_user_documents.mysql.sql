-- UserDocument table for storing and viewing personal Word/PDF documents without SOP workflow
CREATE TABLE IF NOT EXISTS UserDocument (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_vi_0900_ai_ci;

-- Migrate existing uploads from SopImportJob if not already present
INSERT INTO UserDocument (
  DocumentId, OriginalFileName, DisplayName, StorageKey, MediaType, FileSize, Checksum, CreatedBy, CreatedAt, UpdatedAt, DeletedAt, SourceImportJobId
)
SELECT
  j.SopImportJobId, j.OriginalFileName, j.OriginalFileName, j.StorageKey, j.MediaType, j.FileSize, j.Checksum, j.CreatedBy, j.CreatedAt, j.UpdatedAt, NULL, j.SopImportJobId
FROM SopImportJob j
WHERE NOT EXISTS (
  SELECT 1 FROM UserDocument ud WHERE ud.SourceImportJobId = j.SopImportJobId OR ud.DocumentId = j.SopImportJobId
);
