CREATE TABLE IF NOT EXISTS Account (
  AccountId VARCHAR(100) CHARACTER SET ascii NOT NULL PRIMARY KEY,
  ExternalSubject VARCHAR(200) NULL,
  EmployeeCode VARCHAR(100) NULL,
  Username VARCHAR(100) NOT NULL,
  FullName VARCHAR(200) NOT NULL,
  Email VARCHAR(320) NULL,
  SystemRole ENUM('USER', 'CONTENT_EDITOR', 'ADMIN') NOT NULL DEFAULT 'USER',
  CompanyName VARCHAR(250) NULL,
  DivisionName VARCHAR(250) NULL,
  DepartmentName VARCHAR(250) NULL,
  TeamName VARCHAR(250) NULL,
  JobTitle VARCHAR(250) NULL,
  ManagerAccountId VARCHAR(100) CHARACTER SET ascii NULL,
  IsActive BOOLEAN NOT NULL DEFAULT TRUE,
  CreatedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UpdatedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY UQ_Account_Username (Username),
  UNIQUE KEY UQ_Account_ExternalSubject (ExternalSubject),
  UNIQUE KEY UQ_Account_EmployeeCode (EmployeeCode),
  CONSTRAINT FK_Account_Manager FOREIGN KEY (ManagerAccountId) REFERENCES Account(AccountId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_vi_0900_ai_ci;

CREATE TABLE IF NOT EXISTS UserGroup (
  GroupId VARCHAR(100) CHARACTER SET ascii NOT NULL PRIMARY KEY,
  GroupCode VARCHAR(100) CHARACTER SET ascii NOT NULL,
  GroupName VARCHAR(200) NOT NULL,
  Description VARCHAR(1000) NULL,
  IsActive BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE KEY UQ_UserGroup_GroupCode (GroupCode)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_vi_0900_ai_ci;

CREATE TABLE IF NOT EXISTS AccountGroup (
  AccountId VARCHAR(100) CHARACTER SET ascii NOT NULL,
  GroupId VARCHAR(100) CHARACTER SET ascii NOT NULL,
  ValidFrom DATETIME(3) NULL,
  ValidTo DATETIME(3) NULL,
  PRIMARY KEY (AccountId, GroupId),
  CONSTRAINT FK_AccountGroup_Account FOREIGN KEY (AccountId) REFERENCES Account(AccountId) ON DELETE CASCADE,
  CONSTRAINT FK_AccountGroup_Group FOREIGN KEY (GroupId) REFERENCES UserGroup(GroupId) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_vi_0900_ai_ci;

CREATE TABLE IF NOT EXISTS Permission (
  PermissionCode VARCHAR(100) CHARACTER SET ascii NOT NULL PRIMARY KEY,
  PermissionName VARCHAR(200) NOT NULL,
  Description VARCHAR(1000) NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_vi_0900_ai_ci;

CREATE TABLE IF NOT EXISTS AccessGrant (
  AccessGrantId VARCHAR(100) CHARACTER SET ascii NOT NULL PRIMARY KEY,
  GroupId VARCHAR(100) CHARACTER SET ascii NOT NULL,
  PermissionCode VARCHAR(100) CHARACTER SET ascii NOT NULL,
  ScopeType ENUM('system', 'module', 'sop') NOT NULL,
  ScopeId VARCHAR(100) CHARACTER SET ascii NOT NULL,
  UNIQUE KEY UQ_AccessGrant (GroupId, PermissionCode, ScopeType, ScopeId),
  KEY IX_AccessGrant_GroupPermission (GroupId, PermissionCode, ScopeType, ScopeId),
  CONSTRAINT FK_AccessGrant_Group FOREIGN KEY (GroupId) REFERENCES UserGroup(GroupId) ON DELETE CASCADE,
  CONSTRAINT FK_AccessGrant_Permission FOREIGN KEY (PermissionCode) REFERENCES Permission(PermissionCode)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_vi_0900_ai_ci;

CREATE TABLE IF NOT EXISTS MenuItem (
  MenuItemId VARCHAR(100) CHARACTER SET ascii NOT NULL PRIMARY KEY,
  ParentMenuItemId VARCHAR(100) CHARACTER SET ascii NULL,
  MenuCode VARCHAR(100) CHARACTER SET ascii NOT NULL,
  Title VARCHAR(200) NOT NULL,
  RoutePath VARCHAR(500) NULL,
  IconName VARCHAR(100) NULL,
  RequiredPermissionCode VARCHAR(100) CHARACTER SET ascii NULL,
  SortOrder INT NOT NULL DEFAULT 0,
  IsVisible BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE KEY UQ_MenuItem_MenuCode (MenuCode),
  CONSTRAINT FK_MenuItem_Parent FOREIGN KEY (ParentMenuItemId) REFERENCES MenuItem(MenuItemId),
  CONSTRAINT FK_MenuItem_Permission FOREIGN KEY (RequiredPermissionCode) REFERENCES Permission(PermissionCode)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_vi_0900_ai_ci;

CREATE TABLE IF NOT EXISTS HrModule (
  ModuleId VARCHAR(100) CHARACTER SET ascii NOT NULL PRIMARY KEY,
  ModuleCode VARCHAR(100) CHARACTER SET ascii NOT NULL,
  Title VARCHAR(250) NOT NULL,
  Description TEXT NULL,
  ModuleType VARCHAR(100) NOT NULL,
  Status ENUM('draft', 'published', 'archived') NOT NULL DEFAULT 'published',
  IsCommon BOOLEAN NOT NULL DEFAULT FALSE,
  SortOrder INT NOT NULL DEFAULT 0,
  CreatedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UpdatedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY UQ_HrModule_ModuleCode (ModuleCode)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_vi_0900_ai_ci;

CREATE TABLE IF NOT EXISTS AccountModuleAccess (
  AccountModuleAccessId VARCHAR(100) CHARACTER SET ascii NOT NULL PRIMARY KEY,
  AccountId VARCHAR(100) CHARACTER SET ascii NOT NULL,
  ModuleId VARCHAR(100) CHARACTER SET ascii NOT NULL,
  GrantSource ENUM('manual', 'hrm', 'system') NOT NULL DEFAULT 'manual',
  ValidFrom DATETIME(3) NULL,
  ValidTo DATETIME(3) NULL,
  GrantedBy VARCHAR(100) CHARACTER SET ascii NULL,
  GrantedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY UQ_AccountModuleAccess (AccountId, ModuleId, GrantSource),
  KEY IX_AccountModuleAccess_Module (ModuleId, AccountId),
  CONSTRAINT FK_AccountModuleAccess_Account FOREIGN KEY (AccountId) REFERENCES Account(AccountId) ON DELETE CASCADE,
  CONSTRAINT FK_AccountModuleAccess_Module FOREIGN KEY (ModuleId) REFERENCES HrModule(ModuleId) ON DELETE CASCADE,
  CONSTRAINT FK_AccountModuleAccess_GrantedBy FOREIGN KEY (GrantedBy) REFERENCES Account(AccountId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_vi_0900_ai_ci;

CREATE TABLE IF NOT EXISTS MenuModule (
  MenuItemId VARCHAR(100) CHARACTER SET ascii NOT NULL,
  ModuleId VARCHAR(100) CHARACTER SET ascii NOT NULL,
  PRIMARY KEY (MenuItemId, ModuleId),
  KEY IX_MenuModule_ModuleId (ModuleId, MenuItemId),
  CONSTRAINT FK_MenuModule_MenuItem FOREIGN KEY (MenuItemId) REFERENCES MenuItem(MenuItemId) ON DELETE CASCADE,
  CONSTRAINT FK_MenuModule_Module FOREIGN KEY (ModuleId) REFERENCES HrModule(ModuleId) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_vi_0900_ai_ci;

CREATE TABLE IF NOT EXISTS Sop (
  SopId VARCHAR(100) CHARACTER SET ascii NOT NULL PRIMARY KEY,
  SopCode VARCHAR(100) CHARACTER SET ascii NOT NULL,
  Title VARCHAR(500) NOT NULL,
  Category VARCHAR(200) NULL,
  CurrentPublishedVersionId VARCHAR(100) CHARACTER SET ascii NULL,
  CreatedBy VARCHAR(100) CHARACTER SET ascii NULL,
  CreatedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UpdatedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY UQ_Sop_SopCode (SopCode),
  FULLTEXT KEY FT_Sop_Search (Title, Category),
  CONSTRAINT FK_Sop_CreatedBy FOREIGN KEY (CreatedBy) REFERENCES Account(AccountId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_vi_0900_ai_ci;

CREATE TABLE IF NOT EXISTS SopModule (
  SopId VARCHAR(100) CHARACTER SET ascii NOT NULL,
  ModuleId VARCHAR(100) CHARACTER SET ascii NOT NULL,
  IsPrimary BOOLEAN NOT NULL DEFAULT FALSE,
  RelationType VARCHAR(50) NOT NULL DEFAULT 'related',
  PRIMARY KEY (SopId, ModuleId),
  KEY IX_SopModule_ModuleId (ModuleId, SopId),
  CONSTRAINT FK_SopModule_Sop FOREIGN KEY (SopId) REFERENCES Sop(SopId) ON DELETE CASCADE,
  CONSTRAINT FK_SopModule_Module FOREIGN KEY (ModuleId) REFERENCES HrModule(ModuleId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_vi_0900_ai_ci;

CREATE TABLE IF NOT EXISTS SopVersion (
  SopVersionId VARCHAR(100) CHARACTER SET ascii NOT NULL PRIMARY KEY,
  SopId VARCHAR(100) CHARACTER SET ascii NOT NULL,
  VersionNumber INT NOT NULL,
  PublicationStatus ENUM('draft', 'in_review', 'rejected', 'published', 'archived') NOT NULL DEFAULT 'draft',
  Definition LONGTEXT NULL,
  Purpose LONGTEXT NULL,
  Scope LONGTEXT NULL,
  ChangeLog LONGTEXT NULL,
  ContentSnapshotJson LONGTEXT NULL,
  CreatedBy VARCHAR(100) CHARACTER SET ascii NULL,
  ReviewedBy VARCHAR(100) CHARACTER SET ascii NULL,
  PublishedBy VARCHAR(100) CHARACTER SET ascii NULL,
  CreatedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UpdatedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PublishedAt DATETIME(3) NULL,
  ValidFrom DATETIME(3) NULL,
  ValidTo DATETIME(3) NULL,
  RowVersion BIGINT UNSIGNED NOT NULL DEFAULT 1,
  PublishedSlot TINYINT GENERATED ALWAYS AS (CASE WHEN PublicationStatus = 'published' THEN 1 ELSE NULL END) STORED,
  UNIQUE KEY UQ_SopVersion_Number (SopId, VersionNumber),
  UNIQUE KEY UQ_SopVersion_OnePublished (SopId, PublishedSlot),
  KEY IX_SopVersion_SopId_Status (SopId, PublicationStatus, VersionNumber DESC),
  CONSTRAINT CK_SopVersion_SnapshotJson CHECK (ContentSnapshotJson IS NULL OR JSON_VALID(ContentSnapshotJson)),
  CONSTRAINT FK_SopVersion_Sop FOREIGN KEY (SopId) REFERENCES Sop(SopId),
  CONSTRAINT FK_SopVersion_CreatedBy FOREIGN KEY (CreatedBy) REFERENCES Account(AccountId),
  CONSTRAINT FK_SopVersion_ReviewedBy FOREIGN KEY (ReviewedBy) REFERENCES Account(AccountId),
  CONSTRAINT FK_SopVersion_PublishedBy FOREIGN KEY (PublishedBy) REFERENCES Account(AccountId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_vi_0900_ai_ci;

SET @current_version_fk_exists = (
  SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE()
    AND TABLE_NAME = 'Sop'
    AND CONSTRAINT_NAME = 'FK_Sop_CurrentVersion'
);
SET @current_version_fk_sql = IF(
  @current_version_fk_exists = 0,
  'ALTER TABLE Sop ADD CONSTRAINT FK_Sop_CurrentVersion FOREIGN KEY (CurrentPublishedVersionId) REFERENCES SopVersion(SopVersionId)',
  'SELECT 1'
);
PREPARE current_version_fk_statement FROM @current_version_fk_sql;
EXECUTE current_version_fk_statement;
DEALLOCATE PREPARE current_version_fk_statement;

CREATE TABLE IF NOT EXISTS SopStep (
  SopStepId VARCHAR(100) CHARACTER SET ascii NOT NULL PRIMARY KEY,
  SopVersionId VARCHAR(100) CHARACTER SET ascii NOT NULL,
  StableKey VARCHAR(100) CHARACTER SET ascii NOT NULL,
  StepCode VARCHAR(100) CHARACTER SET ascii NOT NULL,
  Title VARCHAR(500) NOT NULL,
  Objective LONGTEXT NULL,
  Description LONGTEXT NULL,
  Actor VARCHAR(300) NULL,
  Location VARCHAR(300) NULL,
  Timing VARCHAR(300) NULL,
  NodeKind ENUM('start', 'task', 'decision', 'parallel_fork', 'parallel_join', 'subprocess', 'end') NOT NULL DEFAULT 'task',
  TypeCode VARCHAR(20) NULL,
  SortOrder INT NOT NULL,
  ChecklistJson LONGTEXT NULL,
  UNIQUE KEY UQ_SopStep_StableKey (SopVersionId, StableKey),
  UNIQUE KEY UQ_SopStep_Code (SopVersionId, StepCode),
  KEY IX_SopStep_Version_Sort (SopVersionId, SortOrder),
  CONSTRAINT CK_SopStep_ChecklistJson CHECK (ChecklistJson IS NULL OR JSON_VALID(ChecklistJson)),
  CONSTRAINT FK_SopStep_Version FOREIGN KEY (SopVersionId) REFERENCES SopVersion(SopVersionId) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_vi_0900_ai_ci;

CREATE TABLE IF NOT EXISTS StepArtifact (
  StepArtifactId VARCHAR(100) CHARACTER SET ascii NOT NULL PRIMARY KEY,
  SopStepId VARCHAR(100) CHARACTER SET ascii NOT NULL,
  Direction ENUM('input', 'output') NOT NULL,
  Name VARCHAR(500) NOT NULL,
  Description LONGTEXT NULL,
  IsRequired BOOLEAN NOT NULL DEFAULT FALSE,
  SortOrder INT NOT NULL DEFAULT 0,
  MetadataJson LONGTEXT NULL,
  KEY IX_StepArtifact_Step (SopStepId, Direction, SortOrder),
  CONSTRAINT CK_StepArtifact_MetadataJson CHECK (MetadataJson IS NULL OR JSON_VALID(MetadataJson)),
  CONSTRAINT FK_StepArtifact_Step FOREIGN KEY (SopStepId) REFERENCES SopStep(SopStepId) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_vi_0900_ai_ci;

CREATE TABLE IF NOT EXISTS SopTransition (
  SopTransitionId VARCHAR(100) CHARACTER SET ascii NOT NULL PRIMARY KEY,
  SopVersionId VARCHAR(100) CHARACTER SET ascii NOT NULL,
  FromStepId VARCHAR(100) CHARACTER SET ascii NULL,
  ToStepId VARCHAR(100) CHARACTER SET ascii NULL,
  TransitionKind ENUM('normal', 'conditional', 'return', 'parallel_fork', 'parallel_join', 'subprocess') NOT NULL DEFAULT 'normal',
  ConditionText LONGTEXT NULL,
  BranchLabel VARCHAR(300) NULL,
  TargetSopId VARCHAR(100) CHARACTER SET ascii NULL,
  SortOrder INT NOT NULL DEFAULT 0,
  KEY IX_SopTransition_Version (SopVersionId, SortOrder),
  CONSTRAINT FK_SopTransition_Version FOREIGN KEY (SopVersionId) REFERENCES SopVersion(SopVersionId) ON DELETE CASCADE,
  CONSTRAINT FK_SopTransition_FromStep FOREIGN KEY (FromStepId) REFERENCES SopStep(SopStepId),
  CONSTRAINT FK_SopTransition_ToStep FOREIGN KEY (ToStepId) REFERENCES SopStep(SopStepId),
  CONSTRAINT FK_SopTransition_TargetSop FOREIGN KEY (TargetSopId) REFERENCES Sop(SopId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_vi_0900_ai_ci;

CREATE TABLE IF NOT EXISTS SopRelation (
  SopRelationId VARCHAR(100) CHARACTER SET ascii NOT NULL PRIMARY KEY,
  SourceSopId VARCHAR(100) CHARACTER SET ascii NOT NULL,
  TargetSopId VARCHAR(100) CHARACTER SET ascii NOT NULL,
  RelationType VARCHAR(50) NOT NULL,
  Notes LONGTEXT NULL,
  UNIQUE KEY UQ_SopRelation (SourceSopId, TargetSopId, RelationType),
  CONSTRAINT FK_SopRelation_Source FOREIGN KEY (SourceSopId) REFERENCES Sop(SopId) ON DELETE CASCADE,
  CONSTRAINT FK_SopRelation_Target FOREIGN KEY (TargetSopId) REFERENCES Sop(SopId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_vi_0900_ai_ci;

CREATE TABLE IF NOT EXISTS Document (
  DocumentId VARCHAR(100) CHARACTER SET ascii NOT NULL PRIMARY KEY,
  DocumentCode VARCHAR(100) CHARACTER SET ascii NOT NULL,
  Title VARCHAR(500) NOT NULL,
  AssetUrl VARCHAR(2000) NULL,
  MediaType VARCHAR(200) NULL,
  Checksum VARCHAR(128) CHARACTER SET ascii NULL,
  MetadataJson LONGTEXT NULL,
  UNIQUE KEY UQ_Document_Code (DocumentCode),
  FULLTEXT KEY FT_Document_Search (Title),
  CONSTRAINT CK_Document_MetadataJson CHECK (MetadataJson IS NULL OR JSON_VALID(MetadataJson))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_vi_0900_ai_ci;

CREATE TABLE IF NOT EXISTS DocumentLink (
  DocumentLinkId VARCHAR(100) CHARACTER SET ascii NOT NULL PRIMARY KEY,
  DocumentId VARCHAR(100) CHARACTER SET ascii NOT NULL,
  SopId VARCHAR(100) CHARACTER SET ascii NOT NULL,
  SopVersionId VARCHAR(100) CHARACTER SET ascii NULL,
  SopStepId VARCHAR(100) CHARACTER SET ascii NULL,
  LinkKind ENUM('source', 'form', 'template', 'reference', 'evidence') NOT NULL DEFAULT 'reference',
  SortOrder INT NOT NULL DEFAULT 0,
  KEY IX_DocumentLink_Sop (SopId, SopVersionId, SopStepId, SortOrder),
  CONSTRAINT FK_DocumentLink_Document FOREIGN KEY (DocumentId) REFERENCES Document(DocumentId) ON DELETE CASCADE,
  CONSTRAINT FK_DocumentLink_Sop FOREIGN KEY (SopId) REFERENCES Sop(SopId),
  CONSTRAINT FK_DocumentLink_Version FOREIGN KEY (SopVersionId) REFERENCES SopVersion(SopVersionId),
  CONSTRAINT FK_DocumentLink_Step FOREIGN KEY (SopStepId) REFERENCES SopStep(SopStepId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_vi_0900_ai_ci;

CREATE TABLE IF NOT EXISTS GlossaryTerm (
  GlossaryTermId VARCHAR(100) CHARACTER SET ascii NOT NULL PRIMARY KEY,
  Term VARCHAR(300) NOT NULL,
  Definition LONGTEXT NOT NULL,
  AliasesJson LONGTEXT NULL,
  ModuleId VARCHAR(100) CHARACTER SET ascii NULL,
  Status ENUM('draft', 'published', 'archived') NOT NULL DEFAULT 'draft',
  CreatedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UpdatedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  KEY IX_GlossaryTerm_Module (ModuleId, Status, Term),
  FULLTEXT KEY FT_GlossaryTerm_Search (Term, Definition),
  CONSTRAINT CK_GlossaryTerm_AliasesJson CHECK (AliasesJson IS NULL OR JSON_VALID(AliasesJson)),
  CONSTRAINT FK_GlossaryTerm_Module FOREIGN KEY (ModuleId) REFERENCES HrModule(ModuleId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_vi_0900_ai_ci;

CREATE TABLE IF NOT EXISTS GuidanceArticle (
  GuidanceArticleId VARCHAR(100) CHARACTER SET ascii NOT NULL PRIMARY KEY,
  ArticleCode VARCHAR(100) CHARACTER SET ascii NOT NULL,
  Title VARCHAR(500) NOT NULL,
  Content LONGTEXT NOT NULL,
  ModuleId VARCHAR(100) CHARACTER SET ascii NULL,
  SopId VARCHAR(100) CHARACTER SET ascii NULL,
  Status ENUM('draft', 'published', 'archived') NOT NULL DEFAULT 'draft',
  MetadataJson LONGTEXT NULL,
  CreatedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UpdatedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY UQ_GuidanceArticle_Code (ArticleCode),
  KEY IX_GuidanceArticle_Module (ModuleId, Status, Title),
  KEY IX_GuidanceArticle_Sop (SopId, Status),
  FULLTEXT KEY FT_GuidanceArticle_Search (Title, Content),
  CONSTRAINT CK_GuidanceArticle_MetadataJson CHECK (MetadataJson IS NULL OR JSON_VALID(MetadataJson)),
  CONSTRAINT FK_GuidanceArticle_Module FOREIGN KEY (ModuleId) REFERENCES HrModule(ModuleId),
  CONSTRAINT FK_GuidanceArticle_Sop FOREIGN KEY (SopId) REFERENCES Sop(SopId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_vi_0900_ai_ci;

CREATE TABLE IF NOT EXISTS RagChunk (
  RagChunkId VARCHAR(100) CHARACTER SET ascii NOT NULL PRIMARY KEY,
  SopId VARCHAR(100) CHARACTER SET ascii NOT NULL,
  SopVersionId VARCHAR(100) CHARACTER SET ascii NOT NULL,
  SopStepId VARCHAR(100) CHARACTER SET ascii NULL,
  ChunkType VARCHAR(50) NOT NULL,
  ChunkIndex INT NOT NULL,
  Content LONGTEXT NOT NULL,
  ContentHash VARCHAR(128) CHARACTER SET ascii NOT NULL,
  PublishedAt DATETIME(3) NOT NULL,
  MetadataJson LONGTEXT NULL,
  KEY IX_RagChunk_Source (SopVersionId, SopStepId, ChunkIndex),
  FULLTEXT KEY FT_RagChunk_Content (Content),
  CONSTRAINT CK_RagChunk_MetadataJson CHECK (MetadataJson IS NULL OR JSON_VALID(MetadataJson)),
  CONSTRAINT FK_RagChunk_Sop FOREIGN KEY (SopId) REFERENCES Sop(SopId) ON DELETE CASCADE,
  CONSTRAINT FK_RagChunk_Version FOREIGN KEY (SopVersionId) REFERENCES SopVersion(SopVersionId),
  CONSTRAINT FK_RagChunk_Step FOREIGN KEY (SopStepId) REFERENCES SopStep(SopStepId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_vi_0900_ai_ci;

CREATE TABLE IF NOT EXISTS PolicyAcknowledgement (
  AccountId VARCHAR(100) CHARACTER SET ascii NOT NULL,
  PolicyId VARCHAR(200) CHARACTER SET ascii NOT NULL,
  AcknowledgedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UpdatedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (AccountId, PolicyId),
  KEY IX_PolicyAcknowledgement_Policy (PolicyId, AcknowledgedAt DESC),
  CONSTRAINT FK_PolicyAcknowledgement_Account FOREIGN KEY (AccountId) REFERENCES Account(AccountId) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_vi_0900_ai_ci;

CREATE TABLE IF NOT EXISTS AuditLog (
  AuditLogId BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  EntityType VARCHAR(100) NOT NULL,
  EntityId VARCHAR(100) CHARACTER SET ascii NOT NULL,
  Action VARCHAR(100) NOT NULL,
  ActorAccountId VARCHAR(100) CHARACTER SET ascii NULL,
  BeforeJson LONGTEXT NULL,
  AfterJson LONGTEXT NULL,
  CorrelationId VARCHAR(100) CHARACTER SET ascii NULL,
  CreatedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY IX_AuditLog_Entity (EntityType, EntityId, CreatedAt DESC),
  CONSTRAINT CK_AuditLog_BeforeJson CHECK (BeforeJson IS NULL OR JSON_VALID(BeforeJson)),
  CONSTRAINT CK_AuditLog_AfterJson CHECK (AfterJson IS NULL OR JSON_VALID(AfterJson)),
  CONSTRAINT FK_AuditLog_Account FOREIGN KEY (ActorAccountId) REFERENCES Account(AccountId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_vi_0900_ai_ci;

CREATE TABLE IF NOT EXISTS AppConfig (
  ConfigKey VARCHAR(200) CHARACTER SET ascii NOT NULL,
  ScopeType VARCHAR(20) CHARACTER SET ascii NOT NULL DEFAULT 'system',
  ScopeId VARCHAR(100) CHARACTER SET ascii NOT NULL DEFAULT '*',
  ValueJson LONGTEXT NOT NULL,
  IsActive BOOLEAN NOT NULL DEFAULT TRUE,
  UpdatedBy VARCHAR(100) CHARACTER SET ascii NULL,
  UpdatedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  RowVersion BIGINT UNSIGNED NOT NULL DEFAULT 1,
  PRIMARY KEY (ConfigKey, ScopeType, ScopeId),
  CONSTRAINT CK_AppConfig_ValueJson CHECK (JSON_VALID(ValueJson)),
  CONSTRAINT FK_AppConfig_UpdatedBy FOREIGN KEY (UpdatedBy) REFERENCES Account(AccountId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_vi_0900_ai_ci;
