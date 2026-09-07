import { afterEach, describe, expect, it } from 'vitest'
import { buildApp } from '../src/app.js'
import type { AppEnv } from '../src/config/env.js'
import type { QueryRunner, SqlParameters, TransactionalDatabase } from '../src/database/database.js'

class FakeDatabase implements TransactionalDatabase {
  async query<T extends object>(statement: string, parameters: SqlParameters = {}): Promise<T[]> {
    if (statement.includes('DATABASE()')) return [{ databaseName: 'hrm_sop' }] as T[]
    if (statement.includes('FROM AppConfig')) {
      return [
        {
          ConfigKey: 'ui.dataset.translations',
          ValueJson: JSON.stringify({ vi: { common: { title: 'Nhân sự' } } })
        },
        {
          ConfigKey: 'ui.release',
          ValueJson: JSON.stringify({ releaseId: 'test-release', schemaVersion: 1, publishedAt: '2026-01-01' })
        }
      ] as T[]
    }
    if (statement.includes('(SELECT COUNT(*) FROM HrModule)')) {
      return [{ Modules: 1, Sops: 2, Versions: 3, Steps: 4, Transitions: 5, Articles: 6 }] as T[]
    }
    if (statement.includes('INSERT INTO PolicyAcknowledgement')) return [{ affectedRows: 1 }] as T[]
    if (statement.includes('FROM PolicyAcknowledgement')) {
      return [{ AcknowledgedAt: new Date('2026-01-02T03:04:05.000Z') }] as T[]
    }
    if (statement.includes('SELECT a.AccountId, a.Username, a.FullName, a.Email')
      && statement.includes('LIMIT 1')) {
      if (String(parameters.identifier).toLowerCase() === 'admin.demo@hrm.local'
        || String(parameters.identifier).toLowerCase() === 'demo-admin') {
        return [{
          AccountId: 'demo-admin', Username: 'demo-admin', FullName: 'Lê Quản Trị',
          Email: 'admin.demo@hrm.local'
        }] as T[]
      }
      return []
    }
    if (statement.includes('a.EmployeeCode') && statement.includes('WHERE a.AccountId = :identity')) {
      return [{
        AccountId: 'demo-admin', Username: 'demo-admin', FullName: 'Lê Quản Trị',
        Email: 'admin.demo@hrm.local', SystemRole: 'ADMIN', EmployeeCode: 'ADMIN-001',
        CompanyName: 'LTA', DivisionName: 'Khối quản trị', DepartmentName: 'Phòng nhân sự',
        TeamName: null, JobTitle: 'Quản trị hệ thống', ManagerAccountId: null
      }] as T[]
    }
    if (statement.includes('SELECT ag.GroupId')) return [{ GroupId: 'group-admin' }] as T[]
    if (statement.includes('SELECT DISTINCT grantRow.PermissionCode')) {
      return [
        { PermissionCode: 'sop.read', ScopeType: 'system', ScopeId: '*' },
        { PermissionCode: 'permission.manage', ScopeType: 'system', ScopeId: '*' }
      ] as T[]
    }
    if (statement.includes("SELECT 'sop.read' AS PermissionCode")) {
      return [
        { PermissionCode: 'sop.read', ScopeType: 'module', ScopeId: 'ats' },
        { PermissionCode: 'sop.read', ScopeType: 'module', ScopeId: 'emp' }
      ] as T[]
    }
    if (statement.includes('a.SystemRole') && statement.includes('LEFT JOIN AccountGroup')) {
      return [{
        AccountId: 'demo-admin', Username: 'demo-admin', FullName: 'Lê Quản Trị',
        Email: 'admin.demo@hrm.local', SystemRole: 'ADMIN',
        GroupCode: 'ADMIN', GroupName: 'Quản trị hệ thống',
        GroupDescription: 'Toàn quyền cấu hình và quản trị hệ thống'
      }] as T[]
    }
    if (statement.includes('CROSS JOIN HrModule module')) {
      return [
        { AccountId: 'demo-admin', ModuleId: 'ats', ModuleCode: 'REC', ModuleTitle: 'Tuyển dụng' },
        { AccountId: 'demo-admin', ModuleId: 'emp', ModuleCode: 'EMP', ModuleTitle: 'Nhân sự' }
      ] as T[]
    }
    if (statement.includes('FROM MenuItem')) {
      return [
        {
          MenuItemId: 'menu-sops', ParentMenuItemId: null, MenuCode: 'SOPS', Title: 'SOPs',
          RoutePath: '/sops', IconName: 'BookOpen', RequiredPermissionCode: 'sop.read', SortOrder: 10
        },
        {
          MenuItemId: 'menu-hidden', ParentMenuItemId: null, MenuCode: 'ADMIN', Title: 'Admin',
          RoutePath: '/admin', IconName: 'Settings', RequiredPermissionCode: 'module.manage', SortOrder: 20
        }
      ] as T[]
    }
    if (statement.includes('FROM MenuModule')) return []
    if (statement.includes('COUNT(DISTINCT accessRow.ModuleId) AS AssignedModuleCount')) {
      return [{
        AccountId: 'demo-employee', EmployeeCode: 'EMP-001', Username: 'demo-employee',
        FullName: 'Nhân viên mẫu', Email: 'employee.demo@hrm.local', SystemRole: 'USER',
        IsActive: true, CompanyName: 'LTA', DivisionName: 'Khối vận hành',
        DepartmentName: 'Phòng vận hành', TeamName: null, JobTitle: 'Nhân viên',
        ManagerAccountId: null, AssignedModuleCount: 4
      }] as T[]
    }
    if (statement.includes('SELECT module.ModuleId, module.ModuleCode, module.Title, module.IsCommon')) {
      return [
        { ModuleId: 'common', ModuleCode: 'COMMON', Title: 'Thông tin chung', IsCommon: true, GrantSource: null },
        { ModuleId: 'emp', ModuleCode: 'EMP', Title: 'Hồ sơ nhân viên', IsCommon: false, GrantSource: 'manual' }
      ] as T[]
    }
    if (statement.includes('FROM HrModule') && statement.includes('ORDER BY SortOrder, Title')) {
      return [
        {
          ModuleId: 'common', ModuleCode: 'COMMON', Title: 'Thông tin chung', Description: null,
          ModuleType: 'foundation', Status: 'published', IsCommon: true, SortOrder: 0,
          CreatedAt: new Date('2026-01-01'), UpdatedAt: new Date('2026-01-01')
        },
        {
          ModuleId: 'emp', ModuleCode: 'EMP', Title: 'Hồ sơ nhân viên', Description: null,
          ModuleType: 'business', Status: 'published', IsCommon: false, SortOrder: 20,
          CreatedAt: new Date('2026-01-01'), UpdatedAt: new Date('2026-01-01')
        }
      ] as T[]
    }
    if (statement.includes('FROM Sop sop') && statement.includes('version.Definition')) {
      return [{
        Id: 'sop-emp-01', Code: 'SOP-EMP-01', Title: 'Cập nhật hồ sơ nhân viên',
        Excerpt: 'Hướng dẫn cập nhật hồ sơ', ModuleIds: 'emp', UpdatedAt: new Date('2026-01-01')
      }] as T[]
    }
    return []
  }

  async transaction<T>(operation: (runner: QueryRunner) => Promise<T>): Promise<T> {
    return operation(this)
  }
}

const env: AppEnv = {
  nodeEnv: 'test',
  host: '127.0.0.1',
  port: 3000,
  logLevel: 'silent',
  corsOrigins: ['http://localhost:5173'],
  authMode: 'development',
  developmentDemoPassword: '123456',
  upload: { directory: 'data/uploads/sop-imports-test', maxBytes: 10 * 1024 * 1024 },
  database: {
    host: 'unused', port: 3306, name: 'unused', user: 'unused', password: 'unused', poolMax: 1
  }
}

const openApps: Awaited<ReturnType<typeof buildApp>>[] = []

afterEach(async () => {
  await Promise.all(openApps.splice(0).map((app) => app.close()))
})

describe('application routes', () => {
  it('serves liveness and readiness independently', async () => {
    const app = await buildApp({ env, database: new FakeDatabase() })
    openApps.push(app)
    const live = await app.inject({ method: 'GET', url: '/health' })
    const ready = await app.inject({ method: 'GET', url: '/ready' })
    expect(live.statusCode).toBe(200)
    expect(live.json()).toEqual({ status: 'ok' })
    expect(ready.statusCode).toBe(200)
    expect(ready.json()).toEqual({ status: 'ready', database: 'hrm_sop' })
  })

  it('loads a development principal and filters menu by permission', async () => {
    const app = await buildApp({ env, database: new FakeDatabase() })
    openApps.push(app)
    const response = await app.inject({ method: 'GET', url: '/api/v1/me', headers: { 'x-user-id': 'demo-admin' } })
    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({
      accountId: 'demo-admin',
      groupIds: ['group-admin'],
      menuItems: [{ code: 'SOPS' }]
    })
  })

  it('returns demo role descriptions and readable modules for the login screen', async () => {
    const app = await buildApp({ env, database: new FakeDatabase() })
    openApps.push(app)
    const response = await app.inject({ method: 'GET', url: '/api/v1/auth/development-accounts' })
    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({
      items: [{
        id: 'demo-admin',
        email: 'admin.demo@hrm.local',
        roleTitle: 'Quản trị hệ thống',
        roleDescription: 'Toàn quyền cấu hình và quản trị hệ thống',
        groups: [{ code: 'ADMIN', name: 'Quản trị hệ thống' }],
        modules: [
          { id: 'ats', code: 'REC', title: 'Tuyển dụng' },
          { id: 'emp', code: 'EMP', title: 'Nhân sự' }
        ]
      }]
    })
  })

  it('authenticates a demo account by email and the configured password', async () => {
    const app = await buildApp({ env, database: new FakeDatabase() })
    openApps.push(app)
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/development-login',
      payload: { identifier: 'admin.demo@hrm.local', password: '123456' }
    })
    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({
      accountId: 'demo-admin',
      username: 'demo-admin',
      fullName: 'Lê Quản Trị',
      email: 'admin.demo@hrm.local'
    })
  })

  it('rejects invalid demo credentials with a generic error', async () => {
    const app = await buildApp({ env, database: new FakeDatabase() })
    openApps.push(app)
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/development-login',
      payload: { identifier: 'missing@hrm.local', password: 'wrong-password' }
    })
    expect(response.statusCode).toBe(401)
    expect(response.json()).toMatchObject({
      error: { code: 'AUTH_INVALID_CREDENTIALS', message: 'Tài khoản hoặc mật khẩu không đúng' }
    })
  })

  it('loads frontend compatibility datasets from the MySQL repository', async () => {
    const app = await buildApp({ env, database: new FakeDatabase() })
    openApps.push(app)
    const response = await app.inject({ method: 'GET', url: '/api/v1/bootstrap', headers: { 'x-user-id': 'demo-admin' } })
    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({
      source: 'mysql',
      release: { releaseId: 'test-release' },
      datasets: { translations: { vi: { common: { title: 'Nhân sự' } } } },
      stats: { modules: 1, sops: 2, articles: 6 }
    })
  })

  it('stores policy acknowledgements through the authenticated API', async () => {
    const app = await buildApp({ env, database: new FakeDatabase() })
    openApps.push(app)
    const response = await app.inject({
      method: 'PUT',
      url: '/api/v1/policy-acknowledgements/POL-001',
      headers: { 'x-user-id': 'demo-admin' },
      payload: { acknowledged: true }
    })
    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({
      acknowledged: true,
      acknowledgedAt: '2026-01-02T03:04:05.000Z'
    })
  })

  it('lists users for simple user-module administration', async () => {
    const app = await buildApp({ env, database: new FakeDatabase() })
    openApps.push(app)
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/users',
      headers: { 'x-user-id': 'demo-admin' }
    })
    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({
      data: [{ id: 'demo-employee', employeeCode: 'EMP-001', assignedModuleCount: 4 }]
    })
  })

  it('searches only through the authenticated knowledge API', async () => {
    const app = await buildApp({ env, database: new FakeDatabase() })
    openApps.push(app)
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/search?q=h%E1%BB%93%20s%C6%A1&moduleId=emp',
      headers: { 'x-user-id': 'demo-admin' }
    })
    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({
      data: [{ id: 'sop-emp-01', type: 'sop', moduleIds: ['emp'] }],
      meta: { total: 1 }
    })
  })

  it('returns a stable error contract for unknown routes', async () => {
    const app = await buildApp({ env, database: new FakeDatabase() })
    openApps.push(app)
    const response = await app.inject({ method: 'GET', url: '/missing' })
    expect(response.statusCode).toBe(404)
    expect(response.json()).toMatchObject({ error: { code: 'ROUTE_NOT_FOUND' } })
  })

  it('returns 401 instead of 500 when a JWT is missing', async () => {
    const jwtEnv: AppEnv = {
      ...env,
      authMode: 'jwt',
      jwtSecret: 'test-secret-that-is-not-used-outside-tests',
      jwtIssuer: 'test-issuer',
      jwtAudience: 'test-audience'
    }
    const app = await buildApp({ env: jwtEnv, database: new FakeDatabase() })
    openApps.push(app)
    const response = await app.inject({ method: 'GET', url: '/api/v1/me' })
    expect(response.statusCode).toBe(401)
    expect(response.json()).toMatchObject({ error: { code: 'AUTH_INVALID_TOKEN' } })
  })

  it('requires an explicit account in development mode', async () => {
    const app = await buildApp({ env, database: new FakeDatabase() })
    openApps.push(app)
    const response = await app.inject({ method: 'GET', url: '/api/v1/me' })
    expect(response.statusCode).toBe(401)
    expect(response.json()).toMatchObject({ error: { code: 'AUTH_DEVELOPMENT_USER_REQUIRED' } })
  })

  it('accepts the same-origin development session cookie used by direct API navigation', async () => {
    const app = await buildApp({ env, database: new FakeDatabase() })
    openApps.push(app)
    const response = await app.inject({ method: 'GET', url: '/api/v1/me', headers: { cookie: 'hrm_demo_account_id=demo-admin' } })
    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({ accountId: 'demo-admin' })
  })
})
