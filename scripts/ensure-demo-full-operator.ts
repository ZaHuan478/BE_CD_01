import { loadEnv } from '../src/config/env.js'
import { Database } from '../src/database/database.js'
import { CoreAuthRepository } from '../src/repositories/core-auth.repository.js'

const accountId = 'demo-sop-operator'
const profileId = 'profile-sop-full-operator'
const profileCode = 'SOP_FULL_OPERATOR'
const businessCapabilities = [
  'sop.read',
  'sop.create',
  'sop.edit',
  'sop.review',
  'sop.publish',
  'sop.archive',
  'knowledge.manage'
] as const
const administrationCapabilities = [
  'module.manage',
  'rag.manage',
  'audit.read',
  'user.read',
  'user.manage',
  'permission.manage',
  'settings.manage'
] as const

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

const env = loadEnv()
if (env.nodeEnv === 'production') {
  throw new Error('Creating a development operator account is forbidden in production')
}

const database = new Database(env)

try {
  const existingCandidates = await database.query<{ AccountId: string; Username: string }>(`
    SELECT account.AccountId, account.Username
    FROM Account account
    WHERE account.IsActive = TRUE
      AND account.SystemRole IN ('USER', 'CONTENT_EDITOR')
      AND account.ReadAllModules = TRUE
      AND NOT EXISTS (
        SELECT 1
        FROM AccountPermissionProfile membership
        JOIN PermissionProfileCapability capability
          ON capability.PermissionProfileId = membership.PermissionProfileId
        WHERE membership.AccountId = account.AccountId
          AND capability.CapabilityCode IN (${administrationCapabilities.map((_, index) => `:admin${index}`).join(', ')})
      )
      AND (
        SELECT COUNT(DISTINCT capability.CapabilityCode)
        FROM AccountPermissionProfile membership
        JOIN PermissionProfile profile
          ON profile.PermissionProfileId = membership.PermissionProfileId AND profile.IsActive = TRUE
        JOIN PermissionProfileCapability capability
          ON capability.PermissionProfileId = profile.PermissionProfileId
        WHERE membership.AccountId = account.AccountId
          AND capability.CapabilityCode IN (${businessCapabilities.map((_, index) => `:business${index}`).join(', ')})
      ) = :requiredCapabilities
    ORDER BY account.CreatedAt
    LIMIT 1
  `, {
    ...Object.fromEntries(administrationCapabilities.map((capability, index) => [`admin${index}`, capability])),
    ...Object.fromEntries(businessCapabilities.map((capability, index) => [`business${index}`, capability])),
    requiredCapabilities: businessCapabilities.length
  })

  if (!existingCandidates[0]) {
    await database.transaction(async runner => {
      await runner.query(`
        INSERT INTO PermissionProfile (
          PermissionProfileId, ProfileCode, ProfileName, Description, IsSystem, IsActive
        ) VALUES (
          :profileId, :profileCode, 'Vận hành SOP toàn diện',
          'Toàn quyền nghiệp vụ trên mọi phân hệ; không có quyền quản trị hệ thống.', TRUE, TRUE
        )
        ON DUPLICATE KEY UPDATE
          ProfileName = 'Vận hành SOP toàn diện',
          Description = 'Toàn quyền nghiệp vụ trên mọi phân hệ; không có quyền quản trị hệ thống.',
          IsSystem = TRUE,
          IsActive = TRUE
      `, { profileId, profileCode })

      await runner.query(
        'DELETE FROM PermissionProfileCapability WHERE PermissionProfileId = :profileId',
        { profileId }
      )
      for (const capability of businessCapabilities) {
        await runner.query(`
          INSERT INTO PermissionProfileCapability (PermissionProfileId, CapabilityCode)
          VALUES (:profileId, :capability)
        `, { profileId, capability })
      }

      await runner.query(`
        INSERT INTO Account (
          AccountId, ExternalSubject, EmployeeCode, Username, FullName, Email, SystemRole,
          CompanyName, DivisionName, DepartmentName, TeamName, JobTitle,
          ReadAllModules, IsActive
        ) VALUES (
          :accountId, :accountId, 'SOP-OPS-001', :accountId, 'Chuyên viên vận hành SOP toàn diện',
          'sop.operator@hrm.local', 'CONTENT_EDITOR', 'LTA', 'Khối Nhân sự',
          'Phòng Quản trị SOP', 'Vận hành SOP', 'Chuyên viên vận hành SOP', TRUE, TRUE
        )
        ON DUPLICATE KEY UPDATE
          FullName = 'Chuyên viên vận hành SOP toàn diện',
          Email = 'sop.operator@hrm.local',
          SystemRole = 'CONTENT_EDITOR',
          CompanyName = 'LTA',
          DivisionName = 'Khối Nhân sự',
          DepartmentName = 'Phòng Quản trị SOP',
          TeamName = 'Vận hành SOP',
          JobTitle = 'Chuyên viên vận hành SOP',
          ReadAllModules = TRUE,
          IsActive = TRUE
      `, { accountId })

      // This seed-owned account receives only the business profile. A legacy
      // AccountGroup table is optional in core8, so clean it only when present.
      const legacyGroups = await runner.query<{ Name: string }>(`
        SELECT TABLE_NAME AS Name FROM information_schema.TABLES
        WHERE TABLE_SCHEMA = DATABASE() AND LOWER(TABLE_NAME) = 'accountgroup'
      `)
      if (legacyGroups.length) {
        await runner.query('DELETE FROM AccountGroup WHERE AccountId = :accountId', { accountId })
      }
      await runner.query('DELETE FROM AccountPermissionProfile WHERE AccountId = :accountId', { accountId })
      await runner.query(`
        INSERT INTO AccountPermissionProfile (AccountId, PermissionProfileId, AssignedBy)
        VALUES (:accountId, :profileId, 'demo-admin')
      `, { accountId, profileId })

      await runner.query(`
        DELETE FROM AccountModuleAccess
        WHERE AccountId = :accountId AND GrantSource = 'manual'
      `, { accountId })
      await runner.query(`
        INSERT INTO AccountModuleAccess (
          AccountModuleAccessId, AccountId, ModuleId, GrantSource, GrantedBy
        )
        SELECT CONCAT('demo-access-sop-operator-', ModuleId), :accountId, ModuleId, 'manual', 'demo-admin'
        FROM HrModule
        WHERE Status = 'published'
      `, { accountId })

      await runner.query(`
        INSERT INTO AuditLog (EntityType, EntityId, Action, ActorAccountId, AfterJson)
        VALUES ('account', :accountId, 'seed-full-sop-operator', 'demo-admin', :afterJson)
      `, {
        accountId,
        afterJson: JSON.stringify({
          systemRole: 'CONTENT_EDITOR',
          readAllModules: true,
          profileCode,
          capabilities: businessCapabilities,
          excludedAdministrationCapabilities: administrationCapabilities
        })
      })
    })
  }

  const selectedAccountId = existingCandidates[0]?.AccountId ?? accountId
  const principal = await new CoreAuthRepository(database).findPrincipal({ accountId: selectedAccountId })
  assert(principal, 'The full SOP operator account cannot be loaded')
  assert(!['ADMIN', 'SUPER_ADMIN'].includes(principal.systemRole), 'The operator must not be an administrator')
  for (const capability of businessCapabilities) {
    assert(principal.grants.some(grant => grant.permissionCode === capability), `Missing business capability: ${capability}`)
  }
  for (const capability of administrationCapabilities) {
    assert(!principal.grants.some(grant => grant.permissionCode === capability), `Administrative capability leaked: ${capability}`)
  }

  const [moduleCoverage] = await database.query<{ Total: number; Readable: number; Writable: number }>(`
    SELECT
      COUNT(*) AS Total,
      SUM(EXISTS (
        SELECT 1 FROM AccountModuleAccess accessRow
        WHERE accessRow.AccountId = :accountId AND accessRow.ModuleId = module.ModuleId
      ) OR module.IsCommon = TRUE OR account.ReadAllModules = TRUE) AS Readable,
      SUM(EXISTS (
        SELECT 1 FROM AccountModuleAccess accessRow
        WHERE accessRow.AccountId = :accountId AND accessRow.ModuleId = module.ModuleId
      )) AS Writable
    FROM HrModule module
    JOIN Account account ON account.AccountId = :accountId
    WHERE module.Status = 'published'
  `, { accountId: selectedAccountId })
  assert(Number(moduleCoverage?.Total) === Number(moduleCoverage?.Readable), 'Not every published module is readable')
  assert(Number(moduleCoverage?.Total) === Number(moduleCoverage?.Writable), 'Not every published module is writable')

  console.log(JSON.stringify({
    created: !existingCandidates[0],
    account: {
      id: principal.accountId,
      username: principal.username,
      fullName: principal.fullName,
      systemRole: principal.systemRole
    },
    moduleCoverage,
    businessCapabilities: businessCapabilities.filter(capability =>
      principal.grants.some(grant => grant.permissionCode === capability)
    ),
    administrationCapabilities: administrationCapabilities.filter(capability =>
      principal.grants.some(grant => grant.permissionCode === capability)
    )
  }, null, 2))
} finally {
  await database.close()
}
