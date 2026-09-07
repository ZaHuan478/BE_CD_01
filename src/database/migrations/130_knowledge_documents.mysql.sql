-- Additive transition. Account, HrModule and AccountModuleAccess remain canonical.
-- No legacy table or data is dropped by this migration.
CREATE TABLE IF NOT EXISTS KnowledgeDocument (
  DocumentId VARCHAR(100) CHARACTER SET ascii NOT NULL PRIMARY KEY,
  Code VARCHAR(200) NOT NULL,
  Title VARCHAR(1000) NOT NULL,
  DocumentType ENUM('procedure', 'policy') NOT NULL,
  Summary TEXT NOT NULL,
  WorkflowId VARCHAR(100) CHARACTER SET ascii NULL,
  SourceKey VARCHAR(500) NOT NULL,
  ContentJson JSON NOT NULL,
  ContentHash CHAR(64) CHARACTER SET ascii NOT NULL,
  CreatedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UpdatedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY UQ_KnowledgeDocument_Source (SourceKey),
  KEY IX_KnowledgeDocument_Type (DocumentType, DocumentId),
  KEY IX_KnowledgeDocument_Workflow (WorkflowId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_vi_0900_ai_ci;

CREATE TABLE IF NOT EXISTS KnowledgeDocumentModule (
  DocumentId VARCHAR(100) CHARACTER SET ascii NOT NULL,
  ModuleId VARCHAR(100) CHARACTER SET ascii NOT NULL,
  PRIMARY KEY (DocumentId, ModuleId),
  KEY IX_KnowledgeDocumentModule_Module (ModuleId, DocumentId),
  CONSTRAINT FK_KnowledgeDocumentModule_Document FOREIGN KEY (DocumentId) REFERENCES KnowledgeDocument(DocumentId),
  CONSTRAINT FK_KnowledgeDocumentModule_Module FOREIGN KEY (ModuleId) REFERENCES HrModule(ModuleId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_vi_0900_ai_ci;
