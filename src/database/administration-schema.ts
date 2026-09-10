import type { QueryRunner } from './database.js'

const defaultProfiles = [
  ['SOP_OWNER', 'Chủ sở hữu SOP', 'Chịu trách nhiệm nội dung và vòng đời của SOP'],
  ['SOP_EDITOR', 'Biên tập SOP', 'Soạn thảo và cập nhật nội dung SOP'],
  ['SOP_REVIEWER', 'Rà soát SOP', 'Kiểm tra nội dung và yêu cầu chỉnh sửa'],
  ['SOP_APPROVER', 'Phê duyệt SOP', 'Phê duyệt và công bố SOP']
] as const

const defaultCapabilities: Record<string, string[]> = {
  SOP_OWNER: ['sop.read', 'sop.create', 'sop.edit'],
  SOP_EDITOR: ['sop.read', 'sop.edit'],
  SOP_REVIEWER: ['sop.read', 'sop.review'],
  SOP_APPROVER: ['sop.read', 'sop.publish']
}

/** Additive administration schema shared by legacy and core8 databases. */
export async function ensureAdministrationSchema(database: QueryRunner): Promise<void> {
  const [roleColumn] = await database.query<{ COLUMN_TYPE: string }>(`SELECT COLUMN_TYPE
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND LOWER(TABLE_NAME) = 'account' AND COLUMN_NAME = 'SystemRole'`)
  if (roleColumn && !roleColumn.COLUMN_TYPE.includes('SUPER_ADMIN')) {
    await database.query("ALTER TABLE Account MODIFY SystemRole ENUM('USER', 'CONTENT_EDITOR', 'ADMIN', 'SUPER_ADMIN') NOT NULL DEFAULT 'USER'")
  }

  await database.query(`CREATE TABLE IF NOT EXISTS PermissionProfile (
    PermissionProfileId VARCHAR(100) CHARACTER SET ascii NOT NULL PRIMARY KEY,
    ProfileCode VARCHAR(100) CHARACTER SET ascii NOT NULL,
    ProfileName VARCHAR(200) NOT NULL,
    Description VARCHAR(1000) NULL,
    IsSystem BOOLEAN NOT NULL DEFAULT FALSE,
    IsActive BOOLEAN NOT NULL DEFAULT TRUE,
    CreatedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    UpdatedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    UNIQUE KEY UQ_PermissionProfile_Code (ProfileCode)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_vi_0900_ai_ci`)
  await database.query(`CREATE TABLE IF NOT EXISTS PermissionProfileCapability (
    PermissionProfileId VARCHAR(100) CHARACTER SET ascii NOT NULL,
    CapabilityCode VARCHAR(100) CHARACTER SET ascii NOT NULL,
    PRIMARY KEY (PermissionProfileId, CapabilityCode),
    CONSTRAINT FK_ProfileCapability_Profile FOREIGN KEY (PermissionProfileId)
      REFERENCES PermissionProfile(PermissionProfileId) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_vi_0900_ai_ci`)
  await database.query(`CREATE TABLE IF NOT EXISTS AccountPermissionProfile (
    AccountId VARCHAR(100) CHARACTER SET ascii NOT NULL,
    PermissionProfileId VARCHAR(100) CHARACTER SET ascii NOT NULL,
    AssignedBy VARCHAR(100) CHARACTER SET ascii NULL,
    AssignedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (AccountId, PermissionProfileId),
    CONSTRAINT FK_AccountProfile_Account FOREIGN KEY (AccountId) REFERENCES Account(AccountId) ON DELETE CASCADE,
    CONSTRAINT FK_AccountProfile_Profile FOREIGN KEY (PermissionProfileId) REFERENCES PermissionProfile(PermissionProfileId) ON DELETE CASCADE,
    CONSTRAINT FK_AccountProfile_Assigner FOREIGN KEY (AssignedBy) REFERENCES Account(AccountId)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_vi_0900_ai_ci`)
  await database.query(`CREATE TABLE IF NOT EXISTS SopRoleAssignment (
    SopResourceId VARCHAR(100) CHARACTER SET ascii NOT NULL,
    AccountId VARCHAR(100) CHARACTER SET ascii NOT NULL,
    RoleCode ENUM('VIEWER', 'OWNER', 'EDITOR', 'REVIEWER', 'APPROVER') NOT NULL,
    AssignedBy VARCHAR(100) CHARACTER SET ascii NULL,
    AssignedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (SopResourceId, AccountId, RoleCode),
    KEY IX_SopRole_Account (AccountId, SopResourceId),
    CONSTRAINT FK_SopRole_Account FOREIGN KEY (AccountId) REFERENCES Account(AccountId) ON DELETE CASCADE,
    CONSTRAINT FK_SopRole_Assigner FOREIGN KEY (AssignedBy) REFERENCES Account(AccountId)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_vi_0900_ai_ci`)
  await database.query("ALTER TABLE SopRoleAssignment MODIFY RoleCode ENUM('VIEWER', 'OWNER', 'EDITOR', 'REVIEWER', 'APPROVER') NOT NULL")
  await database.query(`CREATE TABLE IF NOT EXISTS AppConfig (
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
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_vi_0900_ai_ci`)

  for (const [code, name, description] of defaultProfiles) {
    await database.query(`INSERT INTO PermissionProfile
      (PermissionProfileId, ProfileCode, ProfileName, Description, IsSystem)
      VALUES (:id, :code, :name, :description, TRUE)
      ON DUPLICATE KEY UPDATE ProfileName = :name, Description = :description, IsSystem = TRUE`, {
      id: `profile-${code.toLocaleLowerCase()}`, code, name, description
    })
    for (const capability of defaultCapabilities[code] ?? []) {
      await database.query(`INSERT IGNORE INTO PermissionProfileCapability (PermissionProfileId, CapabilityCode)
        SELECT PermissionProfileId, :capability FROM PermissionProfile WHERE ProfileCode = :code`, { code, capability })
    }
  }
}
