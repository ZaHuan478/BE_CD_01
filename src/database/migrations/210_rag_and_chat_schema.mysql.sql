-- 210_rag_and_chat_schema.mysql.sql
-- Mở rộng bảng RagChunk và bổ sung các bảng quản trị chỉ mục và Chatbot

CREATE TABLE IF NOT EXISTS RagChunk (
  RagChunkId VARCHAR(100) CHARACTER SET ascii NOT NULL PRIMARY KEY,
  SopId VARCHAR(100) CHARACTER SET ascii NOT NULL,
  SopVersionId VARCHAR(100) CHARACTER SET ascii NOT NULL,
  SopStepId VARCHAR(100) CHARACTER SET ascii NULL,
  ModuleId VARCHAR(100) CHARACTER SET ascii NOT NULL DEFAULT 'common',
  ModuleIdsJson LONGTEXT NULL,
  IsCommon BOOLEAN NOT NULL DEFAULT FALSE,
  ChunkType VARCHAR(50) NOT NULL,
  ChunkIndex INT NOT NULL,
  Title VARCHAR(500) NOT NULL DEFAULT '',
  Content LONGTEXT NOT NULL,
  ContentHash VARCHAR(128) CHARACTER SET ascii NOT NULL,
  PublishedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  MetadataJson LONGTEXT NULL,
  EmbeddingJson LONGTEXT NULL,
  EmbeddingModel VARCHAR(100) CHARACTER SET ascii NULL,
  CreatedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY IX_RagChunk_Source (SopVersionId, SopStepId, ChunkIndex),
  KEY IX_RagChunk_Module (ModuleId, IsCommon),
  FULLTEXT KEY FT_RagChunk_Content (Content)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_vi_0900_ai_ci;

CREATE TABLE IF NOT EXISTS IndexDocumentState (
  EntityId VARCHAR(100) CHARACTER SET ascii NOT NULL,
  EntityType VARCHAR(50) NOT NULL,
  VersionId VARCHAR(100) CHARACTER SET ascii NOT NULL,
  Title VARCHAR(500) NOT NULL DEFAULT '',
  ModuleId VARCHAR(100) CHARACTER SET ascii NOT NULL DEFAULT 'common',
  IndexStatus ENUM('pending', 'indexing', 'synced', 'failed', 'stale') NOT NULL DEFAULT 'pending',
  TotalChunks INT NOT NULL DEFAULT 0,
  IndexedChunks INT NOT NULL DEFAULT 0,
  ErrorMessage LONGTEXT NULL,
  TriggerSource ENUM('auto_publish', 'manual_sync', 'reindex_all') NOT NULL DEFAULT 'manual_sync',
  LastIndexedAt DATETIME(3) NULL,
  UpdatedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (EntityId, VersionId),
  KEY IX_IndexState_Status (IndexStatus)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_vi_0900_ai_ci;

CREATE TABLE IF NOT EXISTS ChatSession (
  SessionId VARCHAR(100) CHARACTER SET ascii NOT NULL PRIMARY KEY,
  AccountId VARCHAR(100) CHARACTER SET ascii NOT NULL,
  Title VARCHAR(300) NOT NULL DEFAULT 'Cuộc trò chuyện mới',
  CreatedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UpdatedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  KEY IX_ChatSession_Account (AccountId, UpdatedAt DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_vi_0900_ai_ci;

CREATE TABLE IF NOT EXISTS ChatMessage (
  MessageId VARCHAR(100) CHARACTER SET ascii NOT NULL PRIMARY KEY,
  SessionId VARCHAR(100) CHARACTER SET ascii NOT NULL,
  Role ENUM('user', 'assistant') NOT NULL,
  Content LONGTEXT NOT NULL,
  CitationsJson LONGTEXT NULL,
  CreatedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY IX_ChatMessage_Session (SessionId, CreatedAt ASC),
  CONSTRAINT FK_ChatMessage_Session FOREIGN KEY (SessionId) REFERENCES ChatSession(SessionId) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_vi_0900_ai_ci;

CREATE TABLE IF NOT EXISTS RagIndexJob (
  JobId VARCHAR(100) CHARACTER SET ascii NOT NULL PRIMARY KEY,
  Scope ENUM('all', 'module', 'sop') NOT NULL,
  TargetId VARCHAR(100) CHARACTER SET ascii NULL,
  Status ENUM('pending', 'running', 'succeeded', 'failed') NOT NULL DEFAULT 'pending',
  TotalItems INT NOT NULL DEFAULT 0,
  SucceededItems INT NOT NULL DEFAULT 0,
  FailedItems INT NOT NULL DEFAULT 0,
  ErrorMessage LONGTEXT NULL,
  RequestedBy VARCHAR(100) CHARACTER SET ascii NOT NULL,
  CreatedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  StartedAt DATETIME(3) NULL,
  FinishedAt DATETIME(3) NULL,
  KEY IX_RagIndexJob_Status (Status, CreatedAt)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_vi_0900_ai_ci;
