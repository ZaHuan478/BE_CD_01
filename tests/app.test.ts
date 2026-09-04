import { afterEach, describe, expect, it } from 'vitest'
import { buildApp } from '../src/app.js'
import type { AppEnv } from '../src/config/env.js'
import type { QueryRunner, SqlParameters, TransactionalDatabase } from '../src/database/database.js'

class FakeDatabase implements TransactionalDatabase {
  async query<T extends object>(statement: string, parameters: SqlParameters = {}): Promise<T[]> {
    if (statement.includes('DB_NAME()')) return [{ databaseName: 'HrmSopKnowledge' }] as T[]
    if (statement.includes('FROM dbo.AppConfig')) {
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
    if (statement.includes('(SELECT COUNT(*) FROM dbo.HrModule)')) {
      return [{ Modules: 1, Sops: 2, Versions: 3, Steps: 4, Transitions: 5, Articles: 6 }] as T[]
    }
    if (statement.includes('MERGE dbo.PolicyAcknowledgement')) {
      return [{ AcknowledgedAt: new Date('2026-01-02T03:04:05.000Z') }] as T[]
    }
    if (statement.includes('FROM dbo.PolicyAcknowledgement')) return []
    if (statement.includes('SELECT TOP (1) a.AccountId')) {
      if (String(parameters.identifier).toLowerCase() === 'admin.demo@hrm.local'
        || String(parameters.identifier).toLowerCase() === 'demo-admin') {
        return [{
          AccountId: 'demo-admin', Username: 'demo-admin', FullName: 'Lê Quản Trị',
          Email: 'admin.demo@hrm.local'
        }] as T[]
      }
      return []
    }
    if (statement.includes('g.GroupCode IN')) {
      return [{
        AccountId: 'demo-admin', Username: 'demo-admin', FullName: 'Lê Quản Trị',
        Email: 'admin.demo@hrm.local',
        GroupCode: 'ADMIN', GroupName: 'Quản trị hệ thống',
        GroupDescription: 'Toàn quyền cấu hình và quản trị hệ thống'
      }] as T[]
    }
    if (statement.includes('INNER JOIN dbo.HrModule module')) {
      return [
        { AccountId: 'demo-admin', ModuleId: 'ats', ModuleCode: 'REC', ModuleTitle: 'Tuyển dụng' },
        { AccountId: 'demo-admin', ModuleId: 'emp', ModuleCode: 'EMP', ModuleTitle: 'Nhân sự' }
      ] as T[]
    }
    if (statement.includes('SELECT a.AccountId')) {
      return [{
        AccountId: 'demo-admin', Username: 'demo-admin', FullName: 'Demo Administrator', Email: null
      }] as T[]
    }
    if (statement.includes('SELECT ag.GroupId')) return [{ GroupId: 'group-admin' }] as T[]
    if (statement.includes('SELECT DISTINCT grantRow.PermissionCode')) {
      return [
        { PermissionCode: 'sop.read', ScopeType: 'system', ScopeId: '*' },
        { PermissionCode: 'permission.manage', ScopeType: 'system', ScopeId: '*' }
      ] as T[]
    }
    if (statement.includes('FROM dbo.MenuItem')) {
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
  sql: {
    server: 'unused', port: 1433, database: 'unused', user: 'unused', password: 'unused',
    encrypt: false, trustServerCertificate: true, poolMax: 1
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
    expect(ready.json()).toEqual({ status: 'ready', database: 'HrmSopKnowledge' })
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

  it('loads frontend datasets from the SQL Server repository', async () => {
    const app = await buildApp({ env, database: new FakeDatabase() })
    openApps.push(app)
    const response = await app.inject({ method: 'GET', url: '/api/v1/bootstrap', headers: { 'x-user-id': 'demo-admin' } })
    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({
      source: 'sql-server',
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
})
