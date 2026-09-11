import { describe, expect, it } from 'vitest'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildApp } from '../src/app.js'
import type { AppEnv } from '../src/config/env.js'
import type { DatabaseParameters, TransactionalDatabase } from '../src/database/database.js'

class MemoryIntegrationDatabase implements TransactionalDatabase {
  public userDocs: any[] = [
    {
      DocumentId: 'legacy-doc-1',
      OriginalFileName: 'Tai-lieu-cu-cua-HR.pdf',
      DisplayName: 'Tai-lieu-cu-cua-HR.pdf',
      StorageKey: 'legacy-doc-1.pdf',
      MediaType: 'application/pdf',
      FileSize: 12345,
      Checksum: 'legacy-checksum-1',
      CreatedBy: 'demo-hr',
      CreatedAt: new Date('2026-01-01T00:00:00Z'),
      UpdatedAt: new Date('2026-01-01T00:00:00Z'),
      DeletedAt: null,
      SourceImportJobId: 'import-legacy-1'
    }
  ]

  async query<T extends object>(statement: string, parameters: DatabaseParameters = {}): Promise<T[]> {
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
    if (statement.includes('FROM Account') && statement.includes(':identity')) {
      const id = String(parameters.identity || parameters.identifier || 'demo-hr')
      return [{
        AccountId: id,
        Username: id,
        FullName: `User ${id}`,
        Email: `${id}@hrm.local`,
        SystemRole: 'USER',
        ReadAllModules: true,
        EmployeeCode: 'EMP-001',
        CompanyName: 'LTA',
        DivisionName: 'Khối nhân sự',
        DepartmentName: 'Phòng nhân sự',
        TeamName: null,
        JobTitle: 'Chuyên viên nhân sự',
        ManagerAccountId: null
      }] as T[]
    }
    if (statement.includes('FROM HrModule')) {
      return [{ ModuleId: 'emp', CanContribute: true }] as T[]
    }
    if (statement.includes('SELECT a.AccountId, a.Username, a.FullName, a.Email') && statement.includes('LIMIT 1')) {
      const id = String(parameters.identifier || parameters.identity)
      return [{
        AccountId: id,
        Username: id,
        FullName: `User ${id}`,
        Email: `${id}@hrm.local`
      }] as T[]
    }
    if (statement.includes('a.EmployeeCode') && statement.includes('WHERE a.AccountId = :identity')) {
      const id = String(parameters.identity)
      return [{
        AccountId: id,
        Username: id,
        FullName: `User ${id}`,
        Email: `${id}@hrm.local`,
        SystemRole: 'USER',
        EmployeeCode: 'EMP-001',
        CompanyName: 'LTA',
        DivisionName: 'Khối nhân sự',
        DepartmentName: 'Phòng nhân sự',
        TeamName: null,
        JobTitle: 'Chuyên viên nhân sự',
        ManagerAccountId: null
      }] as T[]
    }
    if (statement.includes('SELECT ag.GroupId')) return [] as T[]
    if (statement.includes('SELECT DISTINCT grantRow.PermissionCode')) {
      return [{ PermissionCode: 'sop.read', ScopeType: 'system', ScopeId: '*' }] as T[]
    }
    if (statement.includes("SELECT 'sop.read' AS PermissionCode")) {
      return [{ PermissionCode: 'sop.read', ScopeType: 'module', ScopeId: 'emp' }] as T[]
    }
    if (statement.includes('a.SystemRole') && statement.includes('LEFT JOIN AccountGroup')) {
      const id = String(parameters.identity || 'demo-user')
      return [{
        AccountId: id,
        Username: id,
        FullName: `User ${id}`,
        Email: `${id}@hrm.local`,
        SystemRole: 'USER',
        GroupCode: 'USER',
        GroupName: 'Người dùng',
        GroupDescription: 'Nhân viên hệ thống'
      }] as T[]
    }
    if (statement.includes('CROSS JOIN HrModule module')) {
      return [{ AccountId: 'user-a', ModuleId: 'emp', ModuleCode: 'EMP', ModuleTitle: 'Nhân sự' }] as T[]
    }
    if (statement.includes('FROM MenuItem')) {
      return [] as T[]
    }
    if (statement.includes('FROM MenuModule')) return [] as T[]
    if (statement.includes('SELECT module.ModuleId, module.ModuleCode, module.Title, module.IsCommon')) {
      return [{ ModuleId: 'emp', ModuleCode: 'EMP', Title: 'Hồ sơ nhân sự', IsCommon: false, GrantSource: 'manual' }] as T[]
    }

    // UserDocument queries
    if (statement.includes('SELECT COUNT(*) AS Total FROM UserDocument')) {
      const list = this.filterUserDocs(statement, parameters)
      return [{ Total: list.length }] as T[]
    }
    if (statement.includes('SELECT * FROM UserDocument')) {
      const list = this.filterUserDocs(statement, parameters)
      return list as T[]
    }
    if (statement.includes('INSERT INTO UserDocument')) {
      const doc = {
        DocumentId: parameters.id,
        OriginalFileName: parameters.fileName,
        DisplayName: parameters.displayName,
        StorageKey: parameters.storageKey,
        MediaType: parameters.mediaType,
        FileSize: parameters.fileSize,
        Checksum: parameters.checksum,
        CreatedBy: parameters.accountId,
        CreatedAt: new Date(),
        UpdatedAt: new Date(),
        DeletedAt: null,
        SourceImportJobId: null
      }
      this.userDocs.push(doc)
      return [{ affectedRows: 1 }] as T[]
    }
    if (statement.includes('UPDATE UserDocument') && statement.includes('SET DisplayName')) {
      const doc = this.userDocs.find(d => d.DocumentId === parameters.id && d.CreatedBy === parameters.accountId && !d.DeletedAt)
      if (doc) {
        doc.DisplayName = parameters.displayName
        doc.UpdatedAt = new Date()
        return [{ affectedRows: 1 }] as T[]
      }
      return [{ affectedRows: 0 }] as T[]
    }
    if (statement.includes('UPDATE UserDocument') && statement.includes('SET DeletedAt = UTC_TIMESTAMP(3)')) {
      const doc = this.userDocs.find(d => d.DocumentId === parameters.id && d.CreatedBy === parameters.accountId && !d.DeletedAt)
      if (doc) {
        doc.DeletedAt = new Date()
        doc.UpdatedAt = new Date()
        return [{ affectedRows: 1 }] as T[]
      }
      return [{ affectedRows: 0 }] as T[]
    }
    if (statement.includes('UPDATE UserDocument') && statement.includes('SET DeletedAt = NULL')) {
      const doc = this.userDocs.find(d => d.DocumentId === parameters.id && d.CreatedBy === parameters.accountId && d.DeletedAt)
      if (doc) {
        doc.DeletedAt = null
        doc.UpdatedAt = new Date()
        return [{ affectedRows: 1 }] as T[]
      }
      return [{ affectedRows: 0 }] as T[]
    }
    if (statement.includes('INSERT INTO AuditLog')) {
      return [{ affectedRows: 1 }] as T[]
    }

    return [] as T[]
  }

  async transaction<T>(operation: (runner: TransactionalDatabase) => Promise<T>): Promise<T> {
    return operation(this)
  }

  private filterUserDocs(statement: string, parameters: DatabaseParameters): any[] {
    let result = [...this.userDocs]
    if (parameters.accountId) {
      result = result.filter(d => d.CreatedBy === parameters.accountId)
    }
    if (statement.includes('DeletedAt IS NOT NULL')) {
      result = result.filter(d => d.DeletedAt !== null)
    } else if (statement.includes('DeletedAt IS NULL')) {
      result = result.filter(d => d.DeletedAt === null)
    }
    if (parameters.checksum) {
      result = result.filter(d => d.Checksum === parameters.checksum)
    }
    if (parameters.id) {
      result = result.filter(d => d.DocumentId === parameters.id)
    }
    if (parameters.searchPattern) {
      const s = String(parameters.searchPattern).replaceAll('%', '').toLowerCase()
      result = result.filter(d => d.DisplayName.toLowerCase().includes(s) || d.OriginalFileName.toLowerCase().includes(s))
    }
    if (statement.includes("MediaType LIKE '%pdf%'")) {
      result = result.filter(d => d.MediaType.includes('pdf'))
    }
    if (statement.includes("MediaType LIKE '%word%'")) {
      result = result.filter(d => d.MediaType.includes('word'))
    }
    return result
  }
}

const mockEnv: AppEnv = {
  databaseModel: 'core8',
  nodeEnv: 'test',
  host: '127.0.0.1',
  port: 3000,
  logLevel: 'silent',
  corsOrigins: ['http://localhost:5173'],
  authMode: 'development',
  developmentDemoPassword: 'pass',
  cloudinary: { enabled: false, folder: 'hrm_documents' },
  upload: {
    directory: join(tmpdir(), `hrm-sop-user-documents-${process.pid}`),
    maxBytes: 10 * 1024 * 1024
  },
  database: {
    host: '127.0.0.1',
    port: 3306,
    name: 'hrm_test',
    user: 'root',
    password: '',
    poolMax: 1
  }
}

describe('My Documents End-to-End API Suite', () => {
  it('lists existing legacy documents for demo-hr', async () => {
    const database = new MemoryIntegrationDatabase()
    const app = await buildApp({ env: mockEnv, database })

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/my-documents',
      headers: { 'x-user-id': 'demo-hr' }
    })

    expect(response.statusCode).toBe(200)
    const json = response.json()
    expect(json.data.total).toBe(1)
    expect(json.data.items[0].displayName).toBe('Tai-lieu-cu-cua-HR.pdf')
    expect(json.data.items[0].format).toBe('pdf')
  })

  it('prohibits User B from seeing or mutating User A documents', async () => {
    const database = new MemoryIntegrationDatabase()
    const app = await buildApp({ env: mockEnv, database })

    // User B tries to view demo-hr legacy doc
    const responseGet = await app.inject({
      method: 'GET',
      url: '/api/v1/my-documents/legacy-doc-1',
      headers: { 'x-user-id': 'user-b' }
    })
    expect(responseGet.statusCode).toBe(404)

    // User B tries to rename demo-hr doc
    const responseRename = await app.inject({
      method: 'PATCH',
      url: '/api/v1/my-documents/legacy-doc-1',
      headers: { 'x-user-id': 'user-b', 'content-type': 'application/json' },
      payload: JSON.stringify({ displayName: 'Hacked' })
    })
    expect(responseRename.statusCode).toBe(404)

    // User B tries to soft-delete demo-hr doc
    const responseDelete = await app.inject({
      method: 'DELETE',
      url: '/api/v1/my-documents/legacy-doc-1',
      headers: { 'x-user-id': 'user-b' }
    })
    expect(responseDelete.statusCode).toBe(404)
  })

  it('supports renaming, soft deleting, and restoring a personal document', async () => {
    const database = new MemoryIntegrationDatabase()
    const app = await buildApp({ env: mockEnv, database })

    // 1. Rename
    const renameRes = await app.inject({
      method: 'PATCH',
      url: '/api/v1/my-documents/legacy-doc-1',
      headers: { 'x-user-id': 'demo-hr', 'content-type': 'application/json' },
      payload: JSON.stringify({ displayName: 'Quy chế công tác 2026' })
    })
    expect(renameRes.statusCode).toBe(200)
    expect(renameRes.json().data.displayName).toBe('Quy chế công tác 2026')

    // 2. Soft delete (move to trash)
    const deleteRes = await app.inject({
      method: 'DELETE',
      url: '/api/v1/my-documents/legacy-doc-1',
      headers: { 'x-user-id': 'demo-hr' }
    })
    expect(deleteRes.statusCode).toBe(200)

    // 3. Document is no longer in active list
    const activeRes = await app.inject({
      method: 'GET',
      url: '/api/v1/my-documents?tab=active',
      headers: { 'x-user-id': 'demo-hr' }
    })
    expect(activeRes.json().data.total).toBe(0)

    // 4. Document appears in trash list
    const trashRes = await app.inject({
      method: 'GET',
      url: '/api/v1/my-documents?tab=trash',
      headers: { 'x-user-id': 'demo-hr' }
    })
    expect(trashRes.json().data.total).toBe(1)
    expect(trashRes.json().data.items[0].displayName).toBe('Quy chế công tác 2026')

    // 5. Restore document
    const restoreRes = await app.inject({
      method: 'POST',
      url: '/api/v1/my-documents/legacy-doc-1/restore',
      headers: { 'x-user-id': 'demo-hr' }
    })
    expect(restoreRes.statusCode).toBe(200)

    // 6. Document is back in active list
    const restoredActiveRes = await app.inject({
      method: 'GET',
      url: '/api/v1/my-documents?tab=active',
      headers: { 'x-user-id': 'demo-hr' }
    })
    expect(restoredActiveRes.json().data.total).toBe(1)
  })

  it('uploads a document without SOP fields and enforces duplicate validation', async () => {
    const database = new MemoryIntegrationDatabase()
    const app = await buildApp({ env: mockEnv, database })

    const boundary = '----WebKitFormBoundary7MA4YWxkTrZu0gW'
    const pdfContent = Buffer.from('%PDF-1.5 test content for personal doc')
    const payload = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="my-doc.pdf"\r\nContent-Type: application/pdf\r\n\r\n`),
      pdfContent,
      Buffer.from(`\r\n--${boundary}--\r\n`)
    ])

    const uploadRes = await app.inject({
      method: 'POST',
      url: '/api/v1/my-documents',
      headers: {
        'x-user-id': 'demo-hr',
        'content-type': `multipart/form-data; boundary=${boundary}`
      },
      payload
    })

    expect(uploadRes.statusCode, uploadRes.body).toBe(201)
    const json = uploadRes.json()
    expect(json.data.displayName).toBe('my-doc.pdf')
    expect(json.data.format).toBe('pdf')
    expect(json.data.createdBy).toBe('demo-hr')

    // Duplicate upload check
    const dupRes = await app.inject({
      method: 'POST',
      url: '/api/v1/my-documents',
      headers: {
        'x-user-id': 'demo-hr',
        'content-type': `multipart/form-data; boundary=${boundary}`
      },
      payload
    })
    expect(dupRes.statusCode).toBe(409)
    expect(dupRes.json().error.code).toBe('DUPLICATE_UPLOAD')
  })
})
