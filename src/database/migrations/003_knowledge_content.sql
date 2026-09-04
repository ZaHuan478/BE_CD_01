CREATE TABLE dbo.DocumentLink (
  DocumentLinkId NVARCHAR(100) NOT NULL CONSTRAINT PK_DocumentLink PRIMARY KEY,
  DocumentId NVARCHAR(100) NOT NULL,
  SopId NVARCHAR(100) NOT NULL,
  SopVersionId NVARCHAR(100) NULL,
  SopStepId NVARCHAR(100) NULL,
  LinkKind NVARCHAR(30) NOT NULL CONSTRAINT DF_DocumentLink_Kind DEFAULT 'reference',
  SortOrder INT NOT NULL CONSTRAINT DF_DocumentLink_SortOrder DEFAULT 0,
  CONSTRAINT CK_DocumentLink_Kind CHECK (LinkKind IN ('reference', 'template', 'form', 'evidence', 'policy')),
  CONSTRAINT FK_DocumentLink_Document FOREIGN KEY (DocumentId) REFERENCES dbo.Document(DocumentId) ON DELETE CASCADE,
  CONSTRAINT FK_DocumentLink_Sop FOREIGN KEY (SopId) REFERENCES dbo.Sop(SopId),
  CONSTRAINT FK_DocumentLink_Version FOREIGN KEY (SopVersionId) REFERENCES dbo.SopVersion(SopVersionId),
  CONSTRAINT FK_DocumentLink_Step FOREIGN KEY (SopStepId) REFERENCES dbo.SopStep(SopStepId)
);

CREATE TABLE dbo.GlossaryTerm (
  GlossaryTermId NVARCHAR(100) NOT NULL CONSTRAINT PK_GlossaryTerm PRIMARY KEY,
  Term NVARCHAR(300) NOT NULL,
  Definition NVARCHAR(MAX) NOT NULL,
  AliasesJson NVARCHAR(MAX) NULL,
  ModuleId NVARCHAR(100) NULL,
  Status NVARCHAR(20) NOT NULL CONSTRAINT DF_GlossaryTerm_Status DEFAULT 'published',
  CreatedAt DATETIME2(3) NOT NULL CONSTRAINT DF_GlossaryTerm_CreatedAt DEFAULT SYSUTCDATETIME(),
  UpdatedAt DATETIME2(3) NOT NULL CONSTRAINT DF_GlossaryTerm_UpdatedAt DEFAULT SYSUTCDATETIME(),
  CONSTRAINT CK_GlossaryTerm_AliasesJson CHECK (AliasesJson IS NULL OR ISJSON(AliasesJson) = 1),
  CONSTRAINT CK_GlossaryTerm_Status CHECK (Status IN ('draft', 'published', 'archived')),
  CONSTRAINT FK_GlossaryTerm_Module FOREIGN KEY (ModuleId) REFERENCES dbo.HrModule(ModuleId)
);

CREATE TABLE dbo.GuidanceArticle (
  GuidanceArticleId NVARCHAR(100) NOT NULL CONSTRAINT PK_GuidanceArticle PRIMARY KEY,
  ArticleCode NVARCHAR(100) NOT NULL,
  Title NVARCHAR(500) NOT NULL,
  Content NVARCHAR(MAX) NOT NULL,
  ModuleId NVARCHAR(100) NULL,
  SopId NVARCHAR(100) NULL,
  Status NVARCHAR(20) NOT NULL CONSTRAINT DF_GuidanceArticle_Status DEFAULT 'draft',
  MetadataJson NVARCHAR(MAX) NULL,
  CreatedAt DATETIME2(3) NOT NULL CONSTRAINT DF_GuidanceArticle_CreatedAt DEFAULT SYSUTCDATETIME(),
  UpdatedAt DATETIME2(3) NOT NULL CONSTRAINT DF_GuidanceArticle_UpdatedAt DEFAULT SYSUTCDATETIME(),
  CONSTRAINT UQ_GuidanceArticle_Code UNIQUE (ArticleCode),
  CONSTRAINT CK_GuidanceArticle_Status CHECK (Status IN ('draft', 'published', 'archived')),
  CONSTRAINT CK_GuidanceArticle_MetadataJson CHECK (MetadataJson IS NULL OR ISJSON(MetadataJson) = 1),
  CONSTRAINT FK_GuidanceArticle_Module FOREIGN KEY (ModuleId) REFERENCES dbo.HrModule(ModuleId),
  CONSTRAINT FK_GuidanceArticle_Sop FOREIGN KEY (SopId) REFERENCES dbo.Sop(SopId)
);

CREATE INDEX IX_DocumentLink_Sop ON dbo.DocumentLink(SopId, SopVersionId, SopStepId, SortOrder);
CREATE INDEX IX_GlossaryTerm_Module ON dbo.GlossaryTerm(ModuleId, Status, Term);
CREATE INDEX IX_GuidanceArticle_Module ON dbo.GuidanceArticle(ModuleId, Status, Title);
CREATE INDEX IX_GuidanceArticle_Sop ON dbo.GuidanceArticle(SopId, Status);

