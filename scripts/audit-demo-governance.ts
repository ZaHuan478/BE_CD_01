import { loadEnv } from '../src/config/env.js'
import { Database } from '../src/database/database.js'

const database = new Database(loadEnv())
try {
  const [accounts, profiles, memberships, modules, roles, documents, imports] = await Promise.all([
    database.query(`SELECT AccountId, Username, FullName, Email, SystemRole, CompanyName, DivisionName,
      DepartmentName, TeamName, JobTitle, ManagerAccountId, IsActive, ReadAllModules
      FROM Account ORDER BY SystemRole DESC, AccountId`),
    database.query(`SELECT profile.PermissionProfileId, profile.ProfileCode, profile.ProfileName,
      GROUP_CONCAT(capability.CapabilityCode ORDER BY capability.CapabilityCode) AS Capabilities
      FROM PermissionProfile profile LEFT JOIN PermissionProfileCapability capability
        ON capability.PermissionProfileId = profile.PermissionProfileId
      WHERE profile.IsActive = 1 GROUP BY profile.PermissionProfileId ORDER BY profile.ProfileCode`),
    database.query(`SELECT membership.AccountId, profile.ProfileCode
      FROM AccountPermissionProfile membership JOIN PermissionProfile profile
        ON profile.PermissionProfileId = membership.PermissionProfileId
      ORDER BY membership.AccountId, profile.ProfileCode`),
    database.query(`SELECT accessRow.AccountId, GROUP_CONCAT(module.ModuleId ORDER BY module.SortOrder) AS Modules
      FROM AccountModuleAccess accessRow JOIN HrModule module ON module.ModuleId = accessRow.ModuleId
      WHERE (accessRow.ValidFrom IS NULL OR accessRow.ValidFrom <= UTC_TIMESTAMP())
        AND (accessRow.ValidTo IS NULL OR accessRow.ValidTo > UTC_TIMESTAMP())
      GROUP BY accessRow.AccountId ORDER BY accessRow.AccountId`),
    database.query(`SELECT roleRow.SopResourceId, document.Code, roleRow.AccountId, roleRow.RoleCode
      FROM SopRoleAssignment roleRow LEFT JOIN KnowledgeDocument document
        ON document.DocumentId = roleRow.SopResourceId
      ORDER BY document.Code, roleRow.RoleCode, roleRow.AccountId`),
    database.query(`SELECT document.DocumentId, document.Code, document.Title, document.DocumentType,
      document.Status, document.CurrentVersionNumber,
      GROUP_CONCAT(moduleRow.ModuleId ORDER BY moduleRow.ModuleId) AS Modules
      FROM KnowledgeDocument document LEFT JOIN KnowledgeDocumentModule moduleRow
        ON moduleRow.DocumentId = document.DocumentId
      GROUP BY document.DocumentId ORDER BY document.DocumentType, document.Code`),
    database.query(`SELECT SopImportJobId, OriginalFileName, Status, TargetSopId, TargetVersionId,
      AudienceMode, DepartmentName, JobTitle, CreatedBy, ReviewedBy
      FROM SopImportJob ORDER BY CreatedAt`)
  ])
  console.log(JSON.stringify({ accounts, profiles, memberships, modules, roles, documents, imports }, null, 2))
} finally {
  await database.close()
}
