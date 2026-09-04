CREATE TABLE dbo.Account (
  AccountId NVARCHAR(100) NOT NULL CONSTRAINT PK_Account PRIMARY KEY,
  ExternalSubject NVARCHAR(200) NULL,
  Username NVARCHAR(100) NOT NULL,
  FullName NVARCHAR(200) NOT NULL,
  Email NVARCHAR(320) NULL,
  IsActive BIT NOT NULL CONSTRAINT DF_Account_IsActive DEFAULT 1,
  CreatedAt DATETIME2(3) NOT NULL CONSTRAINT DF_Account_CreatedAt DEFAULT SYSUTCDATETIME(),
  UpdatedAt DATETIME2(3) NOT NULL CONSTRAINT DF_Account_UpdatedAt DEFAULT SYSUTCDATETIME(),
  CONSTRAINT UQ_Account_Username UNIQUE (Username)
);

CREATE UNIQUE INDEX UX_Account_ExternalSubject
  ON dbo.Account(ExternalSubject)
  WHERE ExternalSubject IS NOT NULL;

CREATE TABLE dbo.UserGroup (
  GroupId NVARCHAR(100) NOT NULL CONSTRAINT PK_UserGroup PRIMARY KEY,
  GroupCode NVARCHAR(100) NOT NULL,
  GroupName NVARCHAR(200) NOT NULL,
  Description NVARCHAR(1000) NULL,
  IsActive BIT NOT NULL CONSTRAINT DF_UserGroup_IsActive DEFAULT 1,
  CONSTRAINT UQ_UserGroup_GroupCode UNIQUE (GroupCode)
);

CREATE TABLE dbo.AccountGroup (
  AccountId NVARCHAR(100) NOT NULL,
  GroupId NVARCHAR(100) NOT NULL,
  ValidFrom DATETIME2(3) NULL,
  ValidTo DATETIME2(3) NULL,
  CONSTRAINT PK_AccountGroup PRIMARY KEY (AccountId, GroupId),
  CONSTRAINT FK_AccountGroup_Account FOREIGN KEY (AccountId) REFERENCES dbo.Account(AccountId) ON DELETE CASCADE,
  CONSTRAINT FK_AccountGroup_Group FOREIGN KEY (GroupId) REFERENCES dbo.UserGroup(GroupId) ON DELETE CASCADE
);

CREATE TABLE dbo.Permission (
  PermissionCode NVARCHAR(100) NOT NULL CONSTRAINT PK_Permission PRIMARY KEY,
  PermissionName NVARCHAR(200) NOT NULL,
  Description NVARCHAR(1000) NULL
);

CREATE TABLE dbo.AccessGrant (
  AccessGrantId NVARCHAR(100) NOT NULL CONSTRAINT PK_AccessGrant PRIMARY KEY,
  GroupId NVARCHAR(100) NOT NULL,
  PermissionCode NVARCHAR(100) NOT NULL,
  ScopeType NVARCHAR(20) NOT NULL,
  ScopeId NVARCHAR(100) NOT NULL,
  CONSTRAINT CK_AccessGrant_ScopeType CHECK (ScopeType IN ('system', 'module', 'sop')),
  CONSTRAINT FK_AccessGrant_Group FOREIGN KEY (GroupId) REFERENCES dbo.UserGroup(GroupId) ON DELETE CASCADE,
  CONSTRAINT FK_AccessGrant_Permission FOREIGN KEY (PermissionCode) REFERENCES dbo.Permission(PermissionCode),
  CONSTRAINT UQ_AccessGrant UNIQUE (GroupId, PermissionCode, ScopeType, ScopeId)
);

CREATE TABLE dbo.MenuItem (
  MenuItemId NVARCHAR(100) NOT NULL CONSTRAINT PK_MenuItem PRIMARY KEY,
  ParentMenuItemId NVARCHAR(100) NULL,
  MenuCode NVARCHAR(100) NOT NULL,
  Title NVARCHAR(200) NOT NULL,
  RoutePath NVARCHAR(500) NULL,
  IconName NVARCHAR(100) NULL,
  RequiredPermissionCode NVARCHAR(100) NULL,
  SortOrder INT NOT NULL CONSTRAINT DF_MenuItem_SortOrder DEFAULT 0,
  IsVisible BIT NOT NULL CONSTRAINT DF_MenuItem_IsVisible DEFAULT 1,
  CONSTRAINT UQ_MenuItem_MenuCode UNIQUE (MenuCode),
  CONSTRAINT FK_MenuItem_Parent FOREIGN KEY (ParentMenuItemId) REFERENCES dbo.MenuItem(MenuItemId),
  CONSTRAINT FK_MenuItem_Permission FOREIGN KEY (RequiredPermissionCode) REFERENCES dbo.Permission(PermissionCode)
);

CREATE TABLE dbo.HrModule (
  ModuleId NVARCHAR(100) NOT NULL CONSTRAINT PK_HrModule PRIMARY KEY,
  ModuleCode NVARCHAR(100) NOT NULL,
  Title NVARCHAR(250) NOT NULL,
  Description NVARCHAR(MAX) NULL,
  ModuleType NVARCHAR(100) NOT NULL,
  Status NVARCHAR(20) NOT NULL CONSTRAINT DF_HrModule_Status DEFAULT 'published',
  SortOrder INT NOT NULL CONSTRAINT DF_HrModule_SortOrder DEFAULT 0,
  CreatedAt DATETIME2(3) NOT NULL CONSTRAINT DF_HrModule_CreatedAt DEFAULT SYSUTCDATETIME(),
  UpdatedAt DATETIME2(3) NOT NULL CONSTRAINT DF_HrModule_UpdatedAt DEFAULT SYSUTCDATETIME(),
  CONSTRAINT UQ_HrModule_ModuleCode UNIQUE (ModuleCode),
  CONSTRAINT CK_HrModule_Status CHECK (Status IN ('draft', 'published', 'archived'))
);

CREATE TABLE dbo.Sop (
  SopId NVARCHAR(100) NOT NULL CONSTRAINT PK_Sop PRIMARY KEY,
  SopCode NVARCHAR(100) NOT NULL,
  Title NVARCHAR(500) NOT NULL,
  Category NVARCHAR(200) NULL,
  CurrentPublishedVersionId NVARCHAR(100) NULL,
  CreatedBy NVARCHAR(100) NULL,
  CreatedAt DATETIME2(3) NOT NULL CONSTRAINT DF_Sop_CreatedAt DEFAULT SYSUTCDATETIME(),
  UpdatedAt DATETIME2(3) NOT NULL CONSTRAINT DF_Sop_UpdatedAt DEFAULT SYSUTCDATETIME(),
  CONSTRAINT UQ_Sop_SopCode UNIQUE (SopCode),
  CONSTRAINT FK_Sop_CreatedBy FOREIGN KEY (CreatedBy) REFERENCES dbo.Account(AccountId)
);

CREATE TABLE dbo.SopModule (
  SopId NVARCHAR(100) NOT NULL,
  ModuleId NVARCHAR(100) NOT NULL,
  IsPrimary BIT NOT NULL CONSTRAINT DF_SopModule_IsPrimary DEFAULT 0,
  RelationType NVARCHAR(50) NOT NULL CONSTRAINT DF_SopModule_RelationType DEFAULT 'related',
  CONSTRAINT PK_SopModule PRIMARY KEY (SopId, ModuleId),
  CONSTRAINT FK_SopModule_Sop FOREIGN KEY (SopId) REFERENCES dbo.Sop(SopId) ON DELETE CASCADE,
  CONSTRAINT FK_SopModule_Module FOREIGN KEY (ModuleId) REFERENCES dbo.HrModule(ModuleId)
);

CREATE TABLE dbo.SopVersion (
  SopVersionId NVARCHAR(100) NOT NULL CONSTRAINT PK_SopVersion PRIMARY KEY,
  SopId NVARCHAR(100) NOT NULL,
  VersionNumber INT NOT NULL,
  PublicationStatus NVARCHAR(20) NOT NULL CONSTRAINT DF_SopVersion_Status DEFAULT 'draft',
  Definition NVARCHAR(MAX) NULL,
  Purpose NVARCHAR(MAX) NULL,
  Scope NVARCHAR(MAX) NULL,
  ChangeLog NVARCHAR(MAX) NULL,
  ContentSnapshotJson NVARCHAR(MAX) NULL,
  CreatedBy NVARCHAR(100) NULL,
  ReviewedBy NVARCHAR(100) NULL,
  PublishedBy NVARCHAR(100) NULL,
  CreatedAt DATETIME2(3) NOT NULL CONSTRAINT DF_SopVersion_CreatedAt DEFAULT SYSUTCDATETIME(),
  UpdatedAt DATETIME2(3) NOT NULL CONSTRAINT DF_SopVersion_UpdatedAt DEFAULT SYSUTCDATETIME(),
  PublishedAt DATETIME2(3) NULL,
  ValidFrom DATETIME2(3) NULL,
  ValidTo DATETIME2(3) NULL,
  RowVersion ROWVERSION NOT NULL,
  CONSTRAINT UQ_SopVersion UNIQUE (SopId, VersionNumber),
  CONSTRAINT CK_SopVersion_Status CHECK (PublicationStatus IN ('draft', 'in_review', 'rejected', 'published', 'archived')),
  CONSTRAINT CK_SopVersion_SnapshotJson CHECK (ContentSnapshotJson IS NULL OR ISJSON(ContentSnapshotJson) = 1),
  CONSTRAINT FK_SopVersion_Sop FOREIGN KEY (SopId) REFERENCES dbo.Sop(SopId),
  CONSTRAINT FK_SopVersion_CreatedBy FOREIGN KEY (CreatedBy) REFERENCES dbo.Account(AccountId),
  CONSTRAINT FK_SopVersion_ReviewedBy FOREIGN KEY (ReviewedBy) REFERENCES dbo.Account(AccountId),
  CONSTRAINT FK_SopVersion_PublishedBy FOREIGN KEY (PublishedBy) REFERENCES dbo.Account(AccountId)
);

ALTER TABLE dbo.Sop ADD CONSTRAINT FK_Sop_CurrentVersion
  FOREIGN KEY (CurrentPublishedVersionId) REFERENCES dbo.SopVersion(SopVersionId);

CREATE UNIQUE INDEX UX_SopVersion_OnePublished
  ON dbo.SopVersion(SopId)
  WHERE PublicationStatus = 'published';

CREATE TABLE dbo.SopStep (
  SopStepId NVARCHAR(100) NOT NULL CONSTRAINT PK_SopStep PRIMARY KEY,
  SopVersionId NVARCHAR(100) NOT NULL,
  StableKey NVARCHAR(100) NOT NULL,
  StepCode NVARCHAR(100) NOT NULL,
  Title NVARCHAR(500) NOT NULL,
  Objective NVARCHAR(MAX) NULL,
  Description NVARCHAR(MAX) NULL,
  Actor NVARCHAR(300) NULL,
  Location NVARCHAR(300) NULL,
  Timing NVARCHAR(300) NULL,
  NodeKind NVARCHAR(30) NOT NULL CONSTRAINT DF_SopStep_NodeKind DEFAULT 'task',
  TypeCode NVARCHAR(20) NULL,
  SortOrder INT NOT NULL,
  ChecklistJson NVARCHAR(MAX) NULL,
  CONSTRAINT UQ_SopStep_StableKey UNIQUE (SopVersionId, StableKey),
  CONSTRAINT UQ_SopStep_Code UNIQUE (SopVersionId, StepCode),
  CONSTRAINT CK_SopStep_NodeKind CHECK (NodeKind IN ('start', 'task', 'decision', 'parallel_fork', 'parallel_join', 'subprocess', 'end')),
  CONSTRAINT CK_SopStep_ChecklistJson CHECK (ChecklistJson IS NULL OR ISJSON(ChecklistJson) = 1),
  CONSTRAINT FK_SopStep_Version FOREIGN KEY (SopVersionId) REFERENCES dbo.SopVersion(SopVersionId) ON DELETE CASCADE
);

CREATE TABLE dbo.StepArtifact (
  StepArtifactId NVARCHAR(100) NOT NULL CONSTRAINT PK_StepArtifact PRIMARY KEY,
  SopStepId NVARCHAR(100) NOT NULL,
  Direction NVARCHAR(10) NOT NULL,
  Name NVARCHAR(500) NOT NULL,
  Description NVARCHAR(MAX) NULL,
  IsRequired BIT NOT NULL CONSTRAINT DF_StepArtifact_IsRequired DEFAULT 0,
  SortOrder INT NOT NULL CONSTRAINT DF_StepArtifact_SortOrder DEFAULT 0,
  MetadataJson NVARCHAR(MAX) NULL,
  CONSTRAINT CK_StepArtifact_Direction CHECK (Direction IN ('input', 'output')),
  CONSTRAINT CK_StepArtifact_MetadataJson CHECK (MetadataJson IS NULL OR ISJSON(MetadataJson) = 1),
  CONSTRAINT FK_StepArtifact_Step FOREIGN KEY (SopStepId) REFERENCES dbo.SopStep(SopStepId) ON DELETE CASCADE
);

CREATE TABLE dbo.SopTransition (
  SopTransitionId NVARCHAR(100) NOT NULL CONSTRAINT PK_SopTransition PRIMARY KEY,
  SopVersionId NVARCHAR(100) NOT NULL,
  FromStepId NVARCHAR(100) NULL,
  ToStepId NVARCHAR(100) NULL,
  TransitionKind NVARCHAR(30) NOT NULL CONSTRAINT DF_SopTransition_Kind DEFAULT 'normal',
  ConditionText NVARCHAR(MAX) NULL,
  BranchLabel NVARCHAR(300) NULL,
  TargetSopId NVARCHAR(100) NULL,
  SortOrder INT NOT NULL CONSTRAINT DF_SopTransition_SortOrder DEFAULT 0,
  CONSTRAINT CK_SopTransition_Kind CHECK (TransitionKind IN ('normal', 'conditional', 'return', 'parallel_fork', 'parallel_join', 'subprocess')),
  CONSTRAINT FK_SopTransition_Version FOREIGN KEY (SopVersionId) REFERENCES dbo.SopVersion(SopVersionId) ON DELETE CASCADE,
  CONSTRAINT FK_SopTransition_FromStep FOREIGN KEY (FromStepId) REFERENCES dbo.SopStep(SopStepId),
  CONSTRAINT FK_SopTransition_ToStep FOREIGN KEY (ToStepId) REFERENCES dbo.SopStep(SopStepId),
  CONSTRAINT FK_SopTransition_TargetSop FOREIGN KEY (TargetSopId) REFERENCES dbo.Sop(SopId)
);

CREATE TABLE dbo.SopRelation (
  SopRelationId NVARCHAR(100) NOT NULL CONSTRAINT PK_SopRelation PRIMARY KEY,
  SourceSopId NVARCHAR(100) NOT NULL,
  TargetSopId NVARCHAR(100) NOT NULL,
  RelationType NVARCHAR(50) NOT NULL,
  Notes NVARCHAR(MAX) NULL,
  CONSTRAINT UQ_SopRelation UNIQUE (SourceSopId, TargetSopId, RelationType),
  CONSTRAINT FK_SopRelation_Source FOREIGN KEY (SourceSopId) REFERENCES dbo.Sop(SopId) ON DELETE CASCADE,
  CONSTRAINT FK_SopRelation_Target FOREIGN KEY (TargetSopId) REFERENCES dbo.Sop(SopId)
);

CREATE TABLE dbo.Document (
  DocumentId NVARCHAR(100) NOT NULL CONSTRAINT PK_Document PRIMARY KEY,
  DocumentCode NVARCHAR(100) NOT NULL,
  Title NVARCHAR(500) NOT NULL,
  AssetUrl NVARCHAR(2000) NULL,
  MediaType NVARCHAR(200) NULL,
  Checksum NVARCHAR(128) NULL,
  MetadataJson NVARCHAR(MAX) NULL,
  CONSTRAINT UQ_Document_Code UNIQUE (DocumentCode),
  CONSTRAINT CK_Document_MetadataJson CHECK (MetadataJson IS NULL OR ISJSON(MetadataJson) = 1)
);

CREATE TABLE dbo.RagChunk (
  RagChunkId NVARCHAR(100) NOT NULL CONSTRAINT PK_RagChunk PRIMARY KEY,
  SopId NVARCHAR(100) NOT NULL,
  SopVersionId NVARCHAR(100) NOT NULL,
  SopStepId NVARCHAR(100) NULL,
  ChunkType NVARCHAR(50) NOT NULL,
  ChunkIndex INT NOT NULL,
  Content NVARCHAR(MAX) NOT NULL,
  ContentHash NVARCHAR(128) NOT NULL,
  PublishedAt DATETIME2(3) NOT NULL,
  MetadataJson NVARCHAR(MAX) NULL,
  CONSTRAINT FK_RagChunk_Sop FOREIGN KEY (SopId) REFERENCES dbo.Sop(SopId) ON DELETE CASCADE,
  CONSTRAINT FK_RagChunk_Version FOREIGN KEY (SopVersionId) REFERENCES dbo.SopVersion(SopVersionId),
  CONSTRAINT FK_RagChunk_Step FOREIGN KEY (SopStepId) REFERENCES dbo.SopStep(SopStepId),
  CONSTRAINT CK_RagChunk_MetadataJson CHECK (MetadataJson IS NULL OR ISJSON(MetadataJson) = 1)
);

CREATE TABLE dbo.AuditLog (
  AuditLogId BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_AuditLog PRIMARY KEY,
  EntityType NVARCHAR(100) NOT NULL,
  EntityId NVARCHAR(100) NOT NULL,
  Action NVARCHAR(100) NOT NULL,
  ActorAccountId NVARCHAR(100) NULL,
  BeforeJson NVARCHAR(MAX) NULL,
  AfterJson NVARCHAR(MAX) NULL,
  CorrelationId NVARCHAR(100) NULL,
  CreatedAt DATETIME2(3) NOT NULL CONSTRAINT DF_AuditLog_CreatedAt DEFAULT SYSUTCDATETIME(),
  CONSTRAINT FK_AuditLog_Account FOREIGN KEY (ActorAccountId) REFERENCES dbo.Account(AccountId),
  CONSTRAINT CK_AuditLog_BeforeJson CHECK (BeforeJson IS NULL OR ISJSON(BeforeJson) = 1),
  CONSTRAINT CK_AuditLog_AfterJson CHECK (AfterJson IS NULL OR ISJSON(AfterJson) = 1)
);

CREATE TABLE dbo.AppConfig (
  ConfigKey NVARCHAR(200) NOT NULL,
  ScopeType NVARCHAR(20) NOT NULL CONSTRAINT DF_AppConfig_ScopeType DEFAULT 'system',
  ScopeId NVARCHAR(100) NOT NULL CONSTRAINT DF_AppConfig_ScopeId DEFAULT '*',
  ValueJson NVARCHAR(MAX) NOT NULL,
  IsActive BIT NOT NULL CONSTRAINT DF_AppConfig_IsActive DEFAULT 1,
  UpdatedBy NVARCHAR(100) NULL,
  UpdatedAt DATETIME2(3) NOT NULL CONSTRAINT DF_AppConfig_UpdatedAt DEFAULT SYSUTCDATETIME(),
  RowVersion ROWVERSION NOT NULL,
  CONSTRAINT PK_AppConfig PRIMARY KEY (ConfigKey, ScopeType, ScopeId),
  CONSTRAINT CK_AppConfig_ValueJson CHECK (ISJSON(ValueJson) = 1),
  CONSTRAINT FK_AppConfig_UpdatedBy FOREIGN KEY (UpdatedBy) REFERENCES dbo.Account(AccountId)
);

CREATE INDEX IX_SopModule_ModuleId ON dbo.SopModule(ModuleId, SopId);
CREATE INDEX IX_SopVersion_SopId_Status ON dbo.SopVersion(SopId, PublicationStatus, VersionNumber DESC);
CREATE INDEX IX_SopStep_Version_Sort ON dbo.SopStep(SopVersionId, SortOrder);
CREATE INDEX IX_SopTransition_Version ON dbo.SopTransition(SopVersionId, SortOrder);
CREATE INDEX IX_StepArtifact_Step ON dbo.StepArtifact(SopStepId, Direction, SortOrder);
CREATE INDEX IX_AccessGrant_GroupPermission ON dbo.AccessGrant(GroupId, PermissionCode, ScopeType, ScopeId);
CREATE INDEX IX_RagChunk_Source ON dbo.RagChunk(SopVersionId, SopStepId, ChunkIndex);
CREATE INDEX IX_AuditLog_Entity ON dbo.AuditLog(EntityType, EntityId, CreatedAt DESC);
