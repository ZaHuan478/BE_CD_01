import type { QueryRunner } from './database.js'

/**
 * Idempotent schema definition for RAG, Semantic Indexing, and AI Chatbot.
 * Works seamlessly in both legacy and core8 database models.
 */
export async function ensureRagSchema(database: QueryRunner): Promise<void> {
  // 1. Tạo hoặc mở rộng bảng RagChunk
  await database.query(`
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
  `)

  // Kiểm tra và bổ sung các cột cần thiết cho RagChunk nếu bảng đã tồn tại từ trước
  const existingCols = await database.query<{ COLUMN_NAME: string }>(`
    SELECT COLUMN_NAME FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND LOWER(TABLE_NAME) = 'ragchunk'
  `)
  const colNames = new Set(existingCols.map((c) => c.COLUMN_NAME.toLowerCase()))

  if (!colNames.has('moduleid')) {
    await database.query(`ALTER TABLE RagChunk ADD COLUMN ModuleId VARCHAR(100) CHARACTER SET ascii NOT NULL DEFAULT 'common'`)
  }
  if (!colNames.has('moduleidsjson')) {
    await database.query('ALTER TABLE RagChunk ADD COLUMN ModuleIdsJson LONGTEXT NULL')
  }
  if (!colNames.has('iscommon')) {
    await database.query(`ALTER TABLE RagChunk ADD COLUMN IsCommon BOOLEAN NOT NULL DEFAULT FALSE`)
  }
  if (!colNames.has('title')) {
    await database.query(`ALTER TABLE RagChunk ADD COLUMN Title VARCHAR(500) NOT NULL DEFAULT ''`)
  }
  if (!colNames.has('embeddingjson')) {
    await database.query('ALTER TABLE RagChunk ADD COLUMN EmbeddingJson LONGTEXT NULL')
  }
  if (!colNames.has('embeddingmodel')) {
    await database.query('ALTER TABLE RagChunk ADD COLUMN EmbeddingModel VARCHAR(100) CHARACTER SET ascii NULL')
  }

  // 2. Bảng IndexDocumentState: Quản lý trạng thái chỉ mục từng tài liệu
  await database.query(`
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
  `)

  // 3. Bảng ChatSession: Quản lý phiên hội thoại
  await database.query(`
    CREATE TABLE IF NOT EXISTS ChatSession (
      SessionId VARCHAR(100) CHARACTER SET ascii NOT NULL PRIMARY KEY,
      AccountId VARCHAR(100) CHARACTER SET ascii NOT NULL,
      Title VARCHAR(300) NOT NULL DEFAULT 'Cuộc trò chuyện mới',
      CreatedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      UpdatedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      KEY IX_ChatSession_Account (AccountId, UpdatedAt DESC)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_vi_0900_ai_ci;
  `)

  // 4. Bảng ChatMessage: Lưu từng tin nhắn và nguồn trích dẫn
  await database.query(`
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
  `)

  // 5. Durable administration jobs. A restart can resume pending work.
  await database.query(`
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
  `)

  // 6. Thêm quyền rag.manage vào bảng Permission nếu có
  const permissionTable = await database.query<{ TABLE_NAME: string }>(`
    SELECT TABLE_NAME FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = DATABASE() AND LOWER(TABLE_NAME) = 'permission'
  `)
  if (permissionTable.length > 0) {
    await database.query(`
      INSERT INTO Permission (PermissionCode, PermissionName, Description)
      VALUES ('rag.manage', 'Quản trị RAG & Chỉ mục', 'Xem trạng thái, cấu trúc chunk và kích hoạt lập chỉ mục')
      ON DUPLICATE KEY UPDATE PermissionName = VALUES(PermissionName)
    `)

    // Gán quyền cho group-admin nếu bảng AccessGrant tồn tại
    const accessGrantTable = await database.query<{ TABLE_NAME: string }>(`
      SELECT TABLE_NAME FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE() AND LOWER(TABLE_NAME) = 'accessgrant'
    `)
    if (accessGrantTable.length > 0) {
      await database.query(`
        INSERT INTO AccessGrant (AccessGrantId, GroupId, PermissionCode, ScopeType, ScopeId)
        VALUES ('grant-admin-rag-manage', 'group-admin', 'rag.manage', 'system', '*')
        ON DUPLICATE KEY UPDATE AccessGrantId = VALUES(AccessGrantId)
      `)
    }
  }
}
