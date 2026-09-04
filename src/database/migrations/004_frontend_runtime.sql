CREATE TABLE dbo.PolicyAcknowledgement (
  AccountId NVARCHAR(100) NOT NULL,
  PolicyId NVARCHAR(200) NOT NULL,
  AcknowledgedAt DATETIME2(3) NOT NULL CONSTRAINT DF_PolicyAcknowledgement_AcknowledgedAt DEFAULT SYSUTCDATETIME(),
  UpdatedAt DATETIME2(3) NOT NULL CONSTRAINT DF_PolicyAcknowledgement_UpdatedAt DEFAULT SYSUTCDATETIME(),
  CONSTRAINT PK_PolicyAcknowledgement PRIMARY KEY (AccountId, PolicyId),
  CONSTRAINT FK_PolicyAcknowledgement_Account FOREIGN KEY (AccountId)
    REFERENCES dbo.Account(AccountId) ON DELETE CASCADE
);

CREATE INDEX IX_PolicyAcknowledgement_PolicyId
  ON dbo.PolicyAcknowledgement(PolicyId, AcknowledgedAt DESC);
