import type { QueryRunner } from './database.js'

/** Separate editorial revisions from the immutable, currently published version. */
export async function ensureSopWorkspaceSchema(db: QueryRunner): Promise<void> {
  await db.query(`CREATE TABLE IF NOT EXISTS SopWorkspaceDraft (
    DraftId VARCHAR(100) CHARACTER SET ascii NOT NULL PRIMARY KEY,
    DocumentId VARCHAR(100) CHARACTER SET ascii NULL,
    BaseVersion INT NOT NULL DEFAULT 0,
    Revision INT NOT NULL DEFAULT 1,
    State VARCHAR(30) NOT NULL DEFAULT 'draft',
    PreviewJson JSON NOT NULL,
    OriginalContentJson JSON NULL,
    CreatedBy VARCHAR(100) CHARACTER SET ascii NOT NULL,
    EditedBy VARCHAR(100) CHARACTER SET ascii NOT NULL,
    ReviewedBy VARCHAR(100) CHARACTER SET ascii NULL,
    PublishedBy VARCHAR(100) CHARACTER SET ascii NULL,
    Note TEXT NULL,
    CreatedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    UpdatedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    KEY IX_SopWorkspace_Document (DocumentId, State),
    KEY IX_SopWorkspace_Owner (CreatedBy, State),
    CONSTRAINT FK_SopWorkspace_Document FOREIGN KEY (DocumentId) REFERENCES KnowledgeDocument(DocumentId),
    CONSTRAINT FK_SopWorkspace_Author FOREIGN KEY (CreatedBy) REFERENCES Account(AccountId)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_vi_0900_ai_ci`)
}
