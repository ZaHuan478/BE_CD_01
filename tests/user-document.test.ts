import { Buffer } from 'node:buffer'
import { describe, expect, it } from 'vitest'
import type { DatabaseParameters, TransactionalDatabase } from '../src/database/database.js'
import { UserDocumentRepository } from '../src/repositories/user-document.repository.js'
import { UserDocumentService } from '../src/services/user-document.service.js'
import type { AppEnv } from '../src/config/env.js'
import type { AuthPrincipal } from '../src/auth/types.js'

class MemoryDatabase implements TransactionalDatabase {
  public rows: any[] = []

  async query<T extends object>(statement: string, parameters: DatabaseParameters = {}): Promise<T[]> {
    if (statement.includes('COUNT(*)') && statement.includes('Total')) {
      const filtered = this.filterRows(statement, parameters)
      return [{ Total: filtered.length }] as T[]
    }
    if (statement.includes('COUNT(*) AS totalFiles')) {
      const totalFiles = this.rows.length
      const totalBytes = this.rows.reduce((sum, r) => sum + Number(r.FileSize), 0)
      const activeCount = this.rows.filter(r => !r.DeletedAt).length
      const trashCount = this.rows.filter(r => !!r.DeletedAt).length
      const docxCount = this.rows.filter(r => r.MediaType.includes('word') || r.OriginalFileName.endsWith('.docx')).length
      const pdfCount = this.rows.filter(r => r.MediaType.includes('pdf') || r.OriginalFileName.endsWith('.pdf')).length
      const uploaderCount = new Set(this.rows.map(r => r.CreatedBy)).size
      return [{ totalFiles, totalBytes, activeCount, trashCount, docxCount, pdfCount, uploaderCount }] as T[]
    }
    if (statement.includes('FROM UserDocument ud') && !statement.includes('COUNT(*)')) {
      const filtered = this.filterRows(statement, parameters)
      return filtered.map(r => ({
        ...r,
        UploaderAccountId: r.CreatedBy,
        UploaderFullName: `Full Name of ${r.CreatedBy}`,
        UploaderUsername: r.CreatedBy,
        UploaderEmail: `${r.CreatedBy}@example.com`,
        UploaderEmployeeCode: `EMP-${r.CreatedBy}`,
        UploaderDepartmentName: 'Phòng Nhân sự',
        UploaderJobTitle: 'Chuyên viên',
        UploaderSystemRole: 'USER'
      })) as T[]
    }
    if (statement.includes('SELECT * FROM UserDocument')) {
      const filtered = this.filterRows(statement, parameters)
      return filtered as T[]
    }
    if (statement.includes('DELETE FROM UserDocument')) {
      const initial = this.rows.length
      this.rows = this.rows.filter(r => r.DocumentId !== parameters.id)
      return [{ affectedRows: initial - this.rows.length }] as T[]
    }
    if (statement.includes('INSERT INTO UserDocument')) {
      const newRow = {
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
      this.rows.push(newRow)
      return [{ affectedRows: 1 }] as T[]
    }
    if (statement.includes('UPDATE UserDocument') && statement.includes('SET DisplayName')) {
      const row = this.rows.find(r => r.DocumentId === parameters.id && (!parameters.accountId || r.CreatedBy === parameters.accountId) && !r.DeletedAt)
      if (row) {
        row.DisplayName = parameters.displayName
        row.UpdatedAt = new Date()
        return [{ affectedRows: 1 }] as T[]
      }
      return [{ affectedRows: 0 }] as T[]
    }
    if (statement.includes('UPDATE UserDocument') && statement.includes('SET DeletedAt = UTC_TIMESTAMP(3)')) {
      const row = this.rows.find(r => r.DocumentId === parameters.id && (!parameters.accountId || r.CreatedBy === parameters.accountId) && !r.DeletedAt)
      if (row) {
        row.DeletedAt = new Date()
        row.UpdatedAt = new Date()
        return [{ affectedRows: 1 }] as T[]
      }
      return [{ affectedRows: 0 }] as T[]
    }
    if (statement.includes('UPDATE UserDocument') && statement.includes('SET DeletedAt = NULL')) {
      const row = this.rows.find(r => r.DocumentId === parameters.id && (!parameters.accountId || r.CreatedBy === parameters.accountId) && r.DeletedAt)
      if (row) {
        row.DeletedAt = null
        row.UpdatedAt = new Date()
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

  private filterRows(statement: string, parameters: DatabaseParameters): any[] {
    let result = [...this.rows]
    if (statement.includes('DeletedAt IS NULL')) {
      result = result.filter(r => !r.DeletedAt)
    } else if (statement.includes('DeletedAt IS NOT NULL')) {
      result = result.filter(r => !!r.DeletedAt)
    }
    if (parameters.accountId) {
      result = result.filter(r => r.CreatedBy === parameters.accountId)
    }
    if (parameters.uploaderId) {
      result = result.filter(r => r.CreatedBy === parameters.uploaderId)
    }
    if (parameters.checksum) {
      result = result.filter(r => r.Checksum === parameters.checksum)
    }
    if (parameters.id) {
      result = result.filter(r => r.DocumentId === parameters.id)
    }
    if (parameters.searchPattern) {
      const search = String(parameters.searchPattern).replaceAll('%', '').toLowerCase()
      result = result.filter(r =>
        r.DisplayName.toLowerCase().includes(search) || r.OriginalFileName.toLowerCase().includes(search)
      )
    }
    if (statement.includes("MediaType LIKE '%pdf%'")) {
      result = result.filter(r => r.MediaType.includes('pdf'))
    }
    if (statement.includes("MediaType LIKE '%word%'")) {
      result = result.filter(r => r.MediaType.includes('word'))
    }
    return result
  }
}

const defaultOrg = {
  employeeCode: null,
  company: null,
  division: null,
  department: null,
  team: null,
  jobTitle: null,
  managerAccountId: null
}

const mockPrincipalA: AuthPrincipal = {
  accountId: 'user-a',
  username: 'usera',
  fullName: 'User A',
  email: 'usera@hrm.local',
  systemRole: 'USER',
  organization: { ...defaultOrg },
  groupIds: [],
  grants: []
}

const mockPrincipalB: AuthPrincipal = {
  accountId: 'user-b',
  username: 'userb',
  fullName: 'User B',
  email: 'userb@hrm.local',
  systemRole: 'USER',
  organization: { ...defaultOrg },
  groupIds: [],
  grants: []
}

const mockPrincipalAdmin: AuthPrincipal = {
  accountId: 'admin-1',
  username: 'admin',
  fullName: 'Admin User',
  email: 'admin@hrm.local',
  systemRole: 'ADMIN',
  organization: { ...defaultOrg },
  groupIds: [],
  grants: []
}

const mockEnv: AppEnv = {
  databaseModel: 'core8',
  nodeEnv: 'test',
  host: '127.0.0.1',
  port: 3000,
  logLevel: 'silent',
  corsOrigins: [],
  authMode: 'development',
  developmentDemoPassword: 'pass',
  cloudinary: { enabled: false, folder: 'hrm_documents' },
  upload: {
    directory: 'data/uploads/sop-imports',
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

describe('UserDocumentRepository & Service', () => {
  it('creates, renames, soft-deletes and restores personal documents', async () => {
    const db = new MemoryDatabase()
    const repository = new UserDocumentRepository(db)
    const service = new UserDocumentService(repository, mockEnv)

    // Create a document via repository
    const doc = await repository.create({
      id: 'udoc_123',
      fileName: 'test-doc.docx',
      displayName: 'Tài liệu thử nghiệm',
      storageKey: 'udoc_123.docx',
      mediaType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      fileSize: 1024,
      checksum: 'abc123hash',
      accountId: mockPrincipalA.accountId
    })

    expect(doc.id).toBe('udoc_123')
    expect(doc.displayName).toBe('Tài liệu thử nghiệm')
    expect(doc.format).toBe('docx')
    expect(doc.deletedAt).toBeNull()

    // List documents for user A
    const listA = await service.list(mockPrincipalA, {})
    expect(listA.total).toBe(1)
    expect(listA.items[0]?.displayName).toBe('Tài liệu thử nghiệm')

    // User B cannot see User A's document
    const listB = await service.list(mockPrincipalB, {})
    expect(listB.total).toBe(0)

    // Rename
    const renamed = await service.rename(mockPrincipalA, 'udoc_123', 'Tên tài liệu mới')
    expect(renamed.displayName).toBe('Tên tài liệu mới')

    // User B cannot rename User A's document
    await expect(service.rename(mockPrincipalB, 'udoc_123', 'Hacked')).rejects.toThrow()

    // Soft delete (move to trash)
    await service.delete(mockPrincipalA, 'udoc_123')
    const activeAfterDelete = await service.list(mockPrincipalA, { tab: 'active' })
    expect(activeAfterDelete.total).toBe(0)

    const trashList = await service.list(mockPrincipalA, { tab: 'trash' })
    expect(trashList.total).toBe(1)
    expect(trashList.items[0]?.deletedAt).not.toBeNull()

    // Restore from trash
    await service.restore(mockPrincipalA, 'udoc_123')
    const activeAfterRestore = await service.list(mockPrincipalA, { tab: 'active' })
    expect(activeAfterRestore.total).toBe(1)
  })

  it('validates file upload constraints: format, size, empty and duplicates', async () => {
    const db = new MemoryDatabase()
    const repository = new UserDocumentRepository(db)
    const service = new UserDocumentService(repository, mockEnv)

    // 1. Empty buffer
    await expect(service.upload(mockPrincipalA, {
      fileName: 'empty.pdf',
      buffer: Buffer.alloc(0)
    })).rejects.toThrow('Tệp tải lên không có nội dung')

    // 2. Too large (> 10MB)
    await expect(service.upload(mockPrincipalA, {
      fileName: 'large.pdf',
      buffer: Buffer.alloc(11 * 1024 * 1024)
    })).rejects.toThrow('vượt quá giới hạn cho phép')

    // 3. Unsupported extension / content
    await expect(service.upload(mockPrincipalA, {
      fileName: 'script.exe',
      buffer: Buffer.from('not a doc')
    })).rejects.toThrow('Chỉ chấp nhận tệp định dạng DOCX hoặc PDF')

    // 4. Fake PDF without magic bytes
    await expect(service.upload(mockPrincipalA, {
      fileName: 'fake.pdf',
      buffer: Buffer.from('hello world')
    })).rejects.toThrow('Chỉ chấp nhận tệp định dạng DOCX hoặc PDF')
  })

  it('allows administrator to list all documents, inspect stats, rename, trash, restore, and permanently delete', async () => {
    const db = new MemoryDatabase()
    const repository = new UserDocumentRepository(db)
    const service = new UserDocumentService(repository, mockEnv)

    // User A uploads a docx
    await repository.create({
      id: 'doc_a1',
      fileName: 'user_a_file.docx',
      displayName: 'Tài liệu nhân viên A',
      storageKey: 'doc_a1.docx',
      mediaType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      fileSize: 2048,
      checksum: 'hash_a1',
      accountId: mockPrincipalA.accountId
    })

    // User B uploads a pdf
    await repository.create({
      id: 'doc_b1',
      fileName: 'user_b_contract.pdf',
      displayName: 'Hợp đồng nhân viên B',
      storageKey: 'doc_b1.pdf',
      mediaType: 'application/pdf',
      fileSize: 4096,
      checksum: 'hash_b1',
      accountId: mockPrincipalB.accountId
    })

    // Regular user cannot call admin list
    await expect(service.listAdmin(mockPrincipalA, {})).rejects.toThrow('Chỉ quản trị viên')

    // Admin lists all documents across users
    const adminList = await service.listAdmin(mockPrincipalAdmin, {})
    expect(adminList.total).toBe(2)
    expect(adminList.stats.totalFiles).toBe(2)
    expect(adminList.stats.totalBytes).toBe(6144)
    expect(adminList.stats.docxCount).toBe(1)
    expect(adminList.stats.pdfCount).toBe(1)
    expect(adminList.stats.uploaderCount).toBe(2)

    // Admin gets document with uploader metadata
    const docWithUploader = await service.getAdmin(mockPrincipalAdmin, 'doc_a1')
    expect(docWithUploader.uploader.accountId).toBe(mockPrincipalA.accountId)
    expect(docWithUploader.uploader.fullName).toContain('user-a')

    // Admin renames document
    const renamed = await service.renameAdmin(mockPrincipalAdmin, 'doc_a1', 'Tên đã được Admin duyệt')
    expect(renamed.displayName).toBe('Tên đã được Admin duyệt')

    // Admin moves to trash
    await service.deleteAdmin(mockPrincipalAdmin, 'doc_a1')
    const trashList = await service.listAdmin(mockPrincipalAdmin, { tab: 'trash' })
    expect(trashList.total).toBe(1)

    // Admin restores
    await service.restoreAdmin(mockPrincipalAdmin, 'doc_a1')
    const activeList = await service.listAdmin(mockPrincipalAdmin, { tab: 'active' })
    expect(activeList.total).toBe(2)

    // Admin batch actions
    await service.batchActionAdmin(mockPrincipalAdmin, 'trash', ['doc_a1', 'doc_b1'])
    const trashAfterBatch = await service.listAdmin(mockPrincipalAdmin, { tab: 'trash' })
    expect(trashAfterBatch.total).toBe(2)

    // Admin permanent delete
    const permResult = await service.permanentDeleteAdmin(mockPrincipalAdmin, 'doc_a1')
    expect(permResult.success).toBe(true)

    const listAfterPerm = await service.listAdmin(mockPrincipalAdmin, { tab: 'all' })
    expect(listAfterPerm.total).toBe(1)
    expect(listAfterPerm.items[0]?.id).toBe('doc_b1')
  })
})
