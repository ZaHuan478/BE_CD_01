import { buildApp } from '../src/app.js'
import { loadEnv } from '../src/config/env.js'
import { Database } from '../src/database/database.js'

const env = loadEnv()
const database = new Database(env)
const app = await buildApp({ env, database })
const headers = (accountId: string) => ({ 'x-user-id': accountId })

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

try {
  const [accounts] = await database.query<{ Total: number; MissingOrganization: number }>(`
    SELECT COUNT(*) AS Total,
      SUM(DepartmentName IS NULL OR JobTitle IS NULL OR EmployeeCode IS NULL) AS MissingOrganization
    FROM Account WHERE AccountId = 'admin' OR AccountId LIKE 'demo-%'
  `)
  const [memberships] = await database.query<{ AccountsWithProfiles: number }>(`
    SELECT COUNT(DISTINCT AccountId) AS AccountsWithProfiles FROM AccountPermissionProfile
    WHERE AccountId = 'admin' OR AccountId LIKE 'demo-%'
  `)
  const [documentCoverage] = await database.query<{
    Total: number; WithOwner: number; WithEditor: number; WithReviewer: number; WithApprover: number
  }>(`SELECT COUNT(*) AS Total,
      SUM(EXISTS(SELECT 1 FROM SopRoleAssignment roleRow WHERE roleRow.SopResourceId = document.DocumentId AND roleRow.RoleCode = 'OWNER')) AS WithOwner,
      SUM(EXISTS(SELECT 1 FROM SopRoleAssignment roleRow WHERE roleRow.SopResourceId = document.DocumentId AND roleRow.RoleCode = 'EDITOR')) AS WithEditor,
      SUM(EXISTS(SELECT 1 FROM SopRoleAssignment roleRow WHERE roleRow.SopResourceId = document.DocumentId AND roleRow.RoleCode = 'REVIEWER')) AS WithReviewer,
      SUM(EXISTS(SELECT 1 FROM SopRoleAssignment roleRow WHERE roleRow.SopResourceId = document.DocumentId AND roleRow.RoleCode = 'APPROVER')) AS WithApprover
    FROM KnowledgeDocument document WHERE document.DocumentType IN ('procedure', 'policy')`)
  const [imports] = await database.query<{ Total: number; Published: number; ReviewedByAdmin: number }>(`
    SELECT COUNT(*) AS Total, SUM(Status = 'published') AS Published,
      SUM(ReviewedBy = 'admin') AS ReviewedByAdmin FROM SopImportJob
  `)

  assert(Number(accounts?.Total) === 17, 'Expected 17 governed demo accounts')
  assert(Number(accounts?.MissingOrganization) === 0, 'Every demo account must have organization data')
  assert(Number(memberships?.AccountsWithProfiles) === 17, 'Every demo account must have a permission profile')
  assert(Number(documentCoverage?.Total) > 0, 'No governed documents found')
  for (const key of ['WithOwner', 'WithEditor', 'WithReviewer', 'WithApprover'] as const) {
    assert(Number(documentCoverage?.[key]) === Number(documentCoverage?.Total), `Missing ${key} assignments`)
  }
  assert(Number(imports?.Total) === 6 && Number(imports?.Published) === 6 && Number(imports?.ReviewedByAdmin) === 6,
    'The six imported documents must be published and reviewed by admin')

  const sourceMatrix = [
    ['SOP-ONB-01', 'demo-recruiter', 'demo-employee'],
    ['CFG-09', 'demo-it', 'demo-employee'],
    ['SOP-PAY-05', 'demo-payroll-manager', 'demo-employee'],
    ['SOP-ADM-01', 'demo-clerical', 'demo-employee'],
    ['SOP-EMP-06', 'demo-legal', 'demo-employee'],
    ['SOP-EMP-16', 'demo-clerical', 'demo-employee']
  ] as const
  const sourceChecks = []
  for (const [code, allowedAccount, deniedAccount] of sourceMatrix) {
    const [item] = await database.query<{ Id: string }>(`SELECT importJob.SopImportJobId AS Id
      FROM SopImportJob importJob JOIN KnowledgeDocument document ON document.DocumentId = importJob.TargetSopId
      WHERE document.Code = :code`, { code })
    assert(item, `Missing import for ${code}`)
    const [allowed, denied] = await Promise.all([
      app.inject({ method: 'GET', url: `/api/v1/sop-imports/${item.Id}/source`, headers: headers(allowedAccount) }),
      app.inject({ method: 'GET', url: `/api/v1/sop-imports/${item.Id}/source`, headers: headers(deniedAccount) })
    ])
    assert(allowed.statusCode === 200, `${allowedAccount} should read ${code} source`)
    assert(denied.statusCode === 403, `${deniedAccount} must not read ${code} source`)
    sourceChecks.push({ code, allowedAccount, allowed: allowed.statusCode, deniedAccount, denied: denied.statusCode })
  }

  const developmentAccounts = await app.inject({ method: 'GET', url: '/api/v1/auth/development-accounts' })
  assert(developmentAccounts.statusCode === 200, 'Development account catalog failed')
  const catalog = developmentAccounts.json().items as Array<{ id: string; roleTitle: string; groups: unknown[]; modules: unknown[] }>
  assert(catalog.length === 17, 'Development account catalog must expose every governed position')
  assert(catalog.every(account => account.roleTitle && account.groups.length), 'Every login account needs a role title and permission group')

  console.log(JSON.stringify({
    accounts,
    profilesAssigned: memberships?.AccountsWithProfiles,
    documentCoverage,
    imports,
    sourceChecks,
    loginCatalog: catalog.map(account => ({ id: account.id, roleTitle: account.roleTitle, groups: account.groups.length, modules: account.modules.length }))
  }, null, 2))
} finally {
  await app.close()
  await database.close()
}
