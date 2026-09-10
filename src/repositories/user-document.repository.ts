import { conflict, notFound } from '../common/errors.js'
import type { DatabaseParameters, TransactionalDatabase } from '../database/database.js'

export interface UserDocumentRow {
  DocumentId: string
  OriginalFileName: string
  DisplayName: string
  StorageKey: string
  MediaType: string
  FileSize: string | number
  Checksum: string
  CreatedBy: string
  CreatedAt: Date
  UpdatedAt: Date
  DeletedAt: Date | null
  SourceImportJobId: string | null
}

export interface UserDocumentItem {
  id: string
  originalFileName: string
  displayName: string
  storageKey: string
  mediaType: string
  format: 'docx' | 'pdf'
  fileSize: number
  checksum: string
  createdBy: string
  createdAt: Date
  updatedAt: Date
  deletedAt: Date | null
  sourceImportJobId: string | null
}

export function mapUserDocumentRow(row: UserDocumentRow): UserDocumentItem {
  const isPdf = row.MediaType.includes('pdf') || row.OriginalFileName.toLowerCase().endsWith('.pdf')
  return {
    id: row.DocumentId,
    originalFileName: row.OriginalFileName,
    displayName: row.DisplayName,
    storageKey: row.StorageKey,
    mediaType: row.MediaType,
    format: isPdf ? 'pdf' : 'docx',
    fileSize: Number(row.FileSize),
    checksum: row.Checksum,
    createdBy: row.CreatedBy,
    createdAt: row.CreatedAt,
    updatedAt: row.UpdatedAt,
    deletedAt: row.DeletedAt,
    sourceImportJobId: row.SourceImportJobId
  }
}

export interface ListUserDocumentsOptions {
  search?: string
  format?: 'all' | 'docx' | 'pdf'
  tab?: 'active' | 'trash'
  page?: number
  pageSize?: number
}

export interface ListUserDocumentsResult {
  items: UserDocumentItem[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

export interface AdminUserDocumentRow extends UserDocumentRow {
  UploaderAccountId?: string | null
  UploaderFullName?: string | null
  UploaderUsername?: string | null
  UploaderEmail?: string | null
  UploaderEmployeeCode?: string | null
  UploaderDepartmentName?: string | null
  UploaderJobTitle?: string | null
  UploaderSystemRole?: string | null
}

export interface AdminUserDocumentItem extends UserDocumentItem {
  uploader: {
    accountId: string
    fullName: string
    username: string
    email: string | null
    employeeCode: string | null
    departmentName: string | null
    jobTitle: string | null
    systemRole: string
  }
}

export interface AdminDocumentStats {
  totalFiles: number
  totalBytes: number
  activeCount: number
  trashCount: number
  docxCount: number
  pdfCount: number
  uploaderCount: number
}

export interface ListAdminDocumentsOptions {
  search?: string
  format?: 'all' | 'docx' | 'pdf'
  tab?: 'active' | 'trash' | 'all'
  uploaderId?: string
  sortBy?: 'createdAt' | 'fileSize' | 'displayName' | 'uploader'
  sortOrder?: 'asc' | 'desc'
  page?: number
  pageSize?: number
}

export interface ListAdminDocumentsResult {
  items: AdminUserDocumentItem[]
  total: number
  page: number
  pageSize: number
  totalPages: number
  stats: AdminDocumentStats
}

export function mapAdminUserDocumentRow(row: AdminUserDocumentRow): AdminUserDocumentItem {
  const base = mapUserDocumentRow(row)
  return {
    ...base,
    uploader: {
      accountId: row.UploaderAccountId || row.CreatedBy,
      fullName: row.UploaderFullName || row.CreatedBy,
      username: row.UploaderUsername || row.CreatedBy,
      email: row.UploaderEmail || null,
      employeeCode: row.UploaderEmployeeCode || null,
      departmentName: row.UploaderDepartmentName || null,
      jobTitle: row.UploaderJobTitle || null,
      systemRole: row.UploaderSystemRole || 'USER'
    }
  }
}

export class UserDocumentRepository {
  constructor(private readonly database: TransactionalDatabase) {}

  async findDuplicate(checksum: string, accountId: string): Promise<UserDocumentItem | null> {
    const [row] = await this.database.query<UserDocumentRow>(`
      SELECT * FROM UserDocument
      WHERE Checksum = :checksum AND CreatedBy = :accountId AND DeletedAt IS NULL
      ORDER BY CreatedAt DESC LIMIT 1
    `, { checksum, accountId })
    return row ? mapUserDocumentRow(row) : null
  }

  async get(id: string, accountId: string): Promise<UserDocumentItem> {
    const [row] = await this.database.query<UserDocumentRow>(`
      SELECT * FROM UserDocument
      WHERE DocumentId = :id AND CreatedBy = :accountId
    `, { id, accountId })
    if (!row) throw notFound('Tài liệu cá nhân', id)
    return mapUserDocumentRow(row)
  }

  async create(input: {
    id: string
    fileName: string
    displayName?: string
    storageKey: string
    mediaType: string
    fileSize: number
    checksum: string
    accountId: string
  }): Promise<UserDocumentItem> {
    const displayName = (input.displayName?.trim() || input.fileName).slice(0, 500)
    await this.database.transaction(async (runner) => {
      await runner.query(`
        INSERT INTO UserDocument (
          DocumentId, OriginalFileName, DisplayName, StorageKey, MediaType,
          FileSize, Checksum, CreatedBy
        ) VALUES (
          :id, :fileName, :displayName, :storageKey, :mediaType,
          :fileSize, :checksum, :accountId
        )
      `, {
        id: input.id,
        fileName: input.fileName,
        displayName,
        storageKey: input.storageKey,
        mediaType: input.mediaType,
        fileSize: input.fileSize,
        checksum: input.checksum,
        accountId: input.accountId
      })

      await runner.query(`
        INSERT INTO AuditLog (EntityType, EntityId, Action, ActorAccountId, AfterJson)
        VALUES ('user-document', :id, 'upload', :accountId, :afterJson)
      `, {
        id: input.id,
        accountId: input.accountId,
        afterJson: JSON.stringify({
          fileName: input.fileName,
          displayName,
          fileSize: input.fileSize,
          mediaType: input.mediaType,
          checksum: input.checksum
        })
      })
    })

    return this.get(input.id, input.accountId)
  }

  async rename(id: string, accountId: string, displayName: string): Promise<UserDocumentItem> {
    const trimmed = displayName.trim().slice(0, 500)
    if (!trimmed) throw conflict('INVALID_NAME', 'Tên tài liệu không được để trống')

    const result = await this.database.query<{ affectedRows: number }>(`
      UPDATE UserDocument
      SET DisplayName = :displayName, UpdatedAt = UTC_TIMESTAMP(3)
      WHERE DocumentId = :id AND CreatedBy = :accountId AND DeletedAt IS NULL
    `, { id, accountId, displayName: trimmed })

    if (!result[0]?.affectedRows) {
      throw notFound('Tài liệu cá nhân', id)
    }

    await this.database.query(`
      INSERT INTO AuditLog (EntityType, EntityId, Action, ActorAccountId, AfterJson)
      VALUES ('user-document', :id, 'rename', :accountId, :afterJson)
    `, {
      id,
      accountId,
      afterJson: JSON.stringify({ displayName: trimmed })
    })

    return this.get(id, accountId)
  }

  async softDelete(id: string, accountId: string): Promise<UserDocumentItem> {
    const result = await this.database.query<{ affectedRows: number }>(`
      UPDATE UserDocument
      SET DeletedAt = UTC_TIMESTAMP(3), UpdatedAt = UTC_TIMESTAMP(3)
      WHERE DocumentId = :id AND CreatedBy = :accountId AND DeletedAt IS NULL
    `, { id, accountId })

    if (!result[0]?.affectedRows) {
      throw notFound('Tài liệu cá nhân', id)
    }

    await this.database.query(`
      INSERT INTO AuditLog (EntityType, EntityId, Action, ActorAccountId)
      VALUES ('user-document', :id, 'trash', :accountId)
    `, { id, accountId })

    return this.get(id, accountId)
  }

  async restore(id: string, accountId: string): Promise<UserDocumentItem> {
    const result = await this.database.query<{ affectedRows: number }>(`
      UPDATE UserDocument
      SET DeletedAt = NULL, UpdatedAt = UTC_TIMESTAMP(3)
      WHERE DocumentId = :id AND CreatedBy = :accountId AND DeletedAt IS NOT NULL
    `, { id, accountId })

    if (!result[0]?.affectedRows) {
      throw notFound('Tài liệu trong thùng rác', id)
    }

    await this.database.query(`
      INSERT INTO AuditLog (EntityType, EntityId, Action, ActorAccountId)
      VALUES ('user-document', :id, 'restore', :accountId)
    `, { id, accountId })

    return this.get(id, accountId)
  }

  async list(accountId: string, options: ListUserDocumentsOptions = {}): Promise<ListUserDocumentsResult> {
    const page = Math.max(1, Number(options.page) || 1)
    const pageSize = Math.min(100, Math.max(1, Number(options.pageSize) || 10))
    const offset = (page - 1) * pageSize
    const tab = options.tab === 'trash' ? 'trash' : 'active'

    const conditions: string[] = ['CreatedBy = :accountId']
    const params: DatabaseParameters = { accountId, limit: pageSize, offset }

    if (tab === 'trash') {
      conditions.push('DeletedAt IS NOT NULL')
    } else {
      conditions.push('DeletedAt IS NULL')
    }

    if (options.format === 'pdf') {
      conditions.push("(MediaType LIKE '%pdf%' OR OriginalFileName LIKE '%.pdf')")
    } else if (options.format === 'docx') {
      conditions.push("(MediaType LIKE '%word%' OR OriginalFileName LIKE '%.docx')")
    }

    if (options.search?.trim()) {
      params.searchPattern = `%${options.search.trim()}%`
      conditions.push('(DisplayName LIKE :searchPattern OR OriginalFileName LIKE :searchPattern)')
    }

    const whereClause = conditions.join(' AND ')

    const [countResult] = await this.database.query<{ Total: number | string }>(`
      SELECT COUNT(*) AS Total FROM UserDocument WHERE ${whereClause}
    `, params)
    const total = Number(countResult?.Total ?? 0)

    const rows = await this.database.query<UserDocumentRow>(`
      SELECT * FROM UserDocument
      WHERE ${whereClause}
      ORDER BY CreatedAt DESC
      LIMIT :limit OFFSET :offset
    `, params)

    const items = rows.map(mapUserDocumentRow)
    const totalPages = Math.ceil(total / pageSize) || 1

    return {
      items,
      total,
      page,
      pageSize,
      totalPages
    }
  }

  async listAdmin(options: ListAdminDocumentsOptions = {}): Promise<ListAdminDocumentsResult> {
    const page = Math.max(1, Number(options.page) || 1)
    const pageSize = Math.min(100, Math.max(1, Number(options.pageSize) || 10))
    const offset = (page - 1) * pageSize
    const tab = options.tab || 'active'

    const conditions: string[] = []
    const params: DatabaseParameters = { limit: pageSize, offset }

    if (tab === 'trash') {
      conditions.push('ud.DeletedAt IS NOT NULL')
    } else if (tab === 'active') {
      conditions.push('ud.DeletedAt IS NULL')
    }

    if (options.format === 'pdf') {
      conditions.push("(ud.MediaType LIKE '%pdf%' OR ud.OriginalFileName LIKE '%.pdf')")
    } else if (options.format === 'docx') {
      conditions.push("(ud.MediaType LIKE '%word%' OR ud.OriginalFileName LIKE '%.docx')")
    }

    if (options.uploaderId?.trim()) {
      params.uploaderId = options.uploaderId.trim()
      conditions.push('ud.CreatedBy = :uploaderId')
    }

    if (options.search?.trim()) {
      params.searchPattern = `%${options.search.trim()}%`
      conditions.push('(ud.DisplayName LIKE :searchPattern OR ud.OriginalFileName LIKE :searchPattern OR acc.FullName LIKE :searchPattern OR acc.Username LIKE :searchPattern OR acc.Email LIKE :searchPattern OR acc.EmployeeCode LIKE :searchPattern)')
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''

    let orderColumn = 'ud.CreatedAt'
    if (options.sortBy === 'fileSize') orderColumn = 'ud.FileSize'
    else if (options.sortBy === 'displayName') orderColumn = 'ud.DisplayName'
    else if (options.sortBy === 'uploader') orderColumn = 'acc.FullName'

    const sortDir = options.sortOrder?.toUpperCase() === 'ASC' ? 'ASC' : 'DESC'

    const [countResult] = await this.database.query<{ Total: number | string }>(`
      SELECT COUNT(*) AS Total
      FROM UserDocument ud
      LEFT JOIN Account acc ON acc.AccountId = ud.CreatedBy
      ${whereClause}
    `, params)
    const total = Number(countResult?.Total ?? 0)

    const rows = await this.database.query<AdminUserDocumentRow>(`
      SELECT
        ud.DocumentId, ud.OriginalFileName, ud.DisplayName, ud.StorageKey,
        ud.MediaType, ud.FileSize, ud.Checksum, ud.CreatedBy, ud.CreatedAt,
        ud.UpdatedAt, ud.DeletedAt, ud.SourceImportJobId,
        acc.AccountId AS UploaderAccountId, acc.FullName AS UploaderFullName,
        acc.Username AS UploaderUsername, acc.Email AS UploaderEmail,
        acc.EmployeeCode AS UploaderEmployeeCode, acc.DepartmentName AS UploaderDepartmentName,
        acc.JobTitle AS UploaderJobTitle, acc.SystemRole AS UploaderSystemRole
      FROM UserDocument ud
      LEFT JOIN Account acc ON acc.AccountId = ud.CreatedBy
      ${whereClause}
      ORDER BY ${orderColumn} ${sortDir}
      LIMIT :limit OFFSET :offset
    `, params)

    const [statsResult] = await this.database.query<{
      totalFiles: number | string
      totalBytes: number | string
      activeCount: number | string
      trashCount: number | string
      docxCount: number | string
      pdfCount: number | string
      uploaderCount: number | string
    }>(`
      SELECT
        COUNT(*) AS totalFiles,
        COALESCE(SUM(FileSize), 0) AS totalBytes,
        COUNT(CASE WHEN DeletedAt IS NULL THEN 1 END) AS activeCount,
        COUNT(CASE WHEN DeletedAt IS NOT NULL THEN 1 END) AS trashCount,
        COUNT(CASE WHEN (MediaType LIKE '%word%' OR OriginalFileName LIKE '%.docx') THEN 1 END) AS docxCount,
        COUNT(CASE WHEN (MediaType LIKE '%pdf%' OR OriginalFileName LIKE '%.pdf') THEN 1 END) AS pdfCount,
        COUNT(DISTINCT CreatedBy) AS uploaderCount
      FROM UserDocument
    `)

    const stats: AdminDocumentStats = {
      totalFiles: Number(statsResult?.totalFiles ?? 0),
      totalBytes: Number(statsResult?.totalBytes ?? 0),
      activeCount: Number(statsResult?.activeCount ?? 0),
      trashCount: Number(statsResult?.trashCount ?? 0),
      docxCount: Number(statsResult?.docxCount ?? 0),
      pdfCount: Number(statsResult?.pdfCount ?? 0),
      uploaderCount: Number(statsResult?.uploaderCount ?? 0)
    }

    const items = rows.map(mapAdminUserDocumentRow)
    const totalPages = Math.ceil(total / pageSize) || 1

    return {
      items,
      total,
      page,
      pageSize,
      totalPages,
      stats
    }
  }

  async getAdmin(id: string): Promise<AdminUserDocumentItem> {
    const [row] = await this.database.query<AdminUserDocumentRow>(`
      SELECT
        ud.DocumentId, ud.OriginalFileName, ud.DisplayName, ud.StorageKey,
        ud.MediaType, ud.FileSize, ud.Checksum, ud.CreatedBy, ud.CreatedAt,
        ud.UpdatedAt, ud.DeletedAt, ud.SourceImportJobId,
        acc.AccountId AS UploaderAccountId, acc.FullName AS UploaderFullName,
        acc.Username AS UploaderUsername, acc.Email AS UploaderEmail,
        acc.EmployeeCode AS UploaderEmployeeCode, acc.DepartmentName AS UploaderDepartmentName,
        acc.JobTitle AS UploaderJobTitle, acc.SystemRole AS UploaderSystemRole
      FROM UserDocument ud
      LEFT JOIN Account acc ON acc.AccountId = ud.CreatedBy
      WHERE ud.DocumentId = :id
    `, { id })
    if (!row) throw notFound('Tài liệu', id)
    return mapAdminUserDocumentRow(row)
  }

  async renameAdmin(id: string, displayName: string, actorAccountId: string): Promise<AdminUserDocumentItem> {
    const trimmed = displayName.trim().slice(0, 500)
    if (!trimmed) throw conflict('INVALID_NAME', 'Tên tài liệu không được để trống')

    const result = await this.database.query<{ affectedRows: number }>(`
      UPDATE UserDocument
      SET DisplayName = :displayName, UpdatedAt = UTC_TIMESTAMP(3)
      WHERE DocumentId = :id
    `, { id, displayName: trimmed })

    if (!result[0]?.affectedRows) {
      throw notFound('Tài liệu', id)
    }

    await this.database.query(`
      INSERT INTO AuditLog (EntityType, EntityId, Action, ActorAccountId, AfterJson)
      VALUES ('user-document', :id, 'admin-rename', :actorAccountId, :afterJson)
    `, {
      id,
      actorAccountId,
      afterJson: JSON.stringify({ displayName: trimmed })
    })

    return this.getAdmin(id)
  }

  async softDeleteAdmin(id: string, actorAccountId: string): Promise<AdminUserDocumentItem> {
    const result = await this.database.query<{ affectedRows: number }>(`
      UPDATE UserDocument
      SET DeletedAt = UTC_TIMESTAMP(3), UpdatedAt = UTC_TIMESTAMP(3)
      WHERE DocumentId = :id AND DeletedAt IS NULL
    `, { id })

    if (!result[0]?.affectedRows) {
      throw notFound('Tài liệu', id)
    }

    await this.database.query(`
      INSERT INTO AuditLog (EntityType, EntityId, Action, ActorAccountId)
      VALUES ('user-document', :id, 'admin-trash', :actorAccountId)
    `, { id, actorAccountId })

    return this.getAdmin(id)
  }

  async restoreAdmin(id: string, actorAccountId: string): Promise<AdminUserDocumentItem> {
    const result = await this.database.query<{ affectedRows: number }>(`
      UPDATE UserDocument
      SET DeletedAt = NULL, UpdatedAt = UTC_TIMESTAMP(3)
      WHERE DocumentId = :id AND DeletedAt IS NOT NULL
    `, { id })

    if (!result[0]?.affectedRows) {
      throw notFound('Tài liệu trong thùng rác', id)
    }

    await this.database.query(`
      INSERT INTO AuditLog (EntityType, EntityId, Action, ActorAccountId)
      VALUES ('user-document', :id, 'admin-restore', :actorAccountId)
    `, { id, actorAccountId })

    return this.getAdmin(id)
  }

  async permanentDeleteAdmin(id: string, actorAccountId: string): Promise<{ id: string; storageKey: string }> {
    const doc = await this.getAdmin(id)
    if (doc.sourceImportJobId) {
      throw conflict('DOCUMENT_HAS_CONVERSION', 'Tài liệu đang được dùng làm nguồn cho một SOP; hãy xóa hồ sơ chuyển hóa trước')
    }

    const result = await this.database.query<{ affectedRows: number }>(`
      DELETE FROM UserDocument WHERE DocumentId = :id
    `, { id })

    if (!result[0]?.affectedRows) {
      throw notFound('Tài liệu', id)
    }

    await this.database.query(`
      INSERT INTO AuditLog (EntityType, EntityId, Action, ActorAccountId, BeforeJson)
      VALUES ('user-document', :id, 'admin-permanent-delete', :actorAccountId, :beforeJson)
    `, {
      id,
      actorAccountId,
      beforeJson: JSON.stringify({
        displayName: doc.displayName,
        originalFileName: doc.originalFileName,
        storageKey: doc.storageKey,
        fileSize: doc.fileSize,
        checksum: doc.checksum,
        createdBy: doc.createdBy
      })
    })

    return { id, storageKey: doc.storageKey }
  }

  async batchActionAdmin(
    action: 'trash' | 'restore' | 'permanentDelete',
    ids: string[],
    actorAccountId: string
  ): Promise<{ affectedCount: number; deletedStorageKeys?: string[] }> {
    if (!ids.length) return { affectedCount: 0 }

    if (action === 'trash') {
      let count = 0
      for (const id of ids) {
        try {
          await this.softDeleteAdmin(id, actorAccountId)
          count++
        } catch { /* skip */ }
      }
      return { affectedCount: count }
    }

    if (action === 'restore') {
      let count = 0
      for (const id of ids) {
        try {
          await this.restoreAdmin(id, actorAccountId)
          count++
        } catch { /* skip */ }
      }
      return { affectedCount: count }
    }

    if (action === 'permanentDelete') {
      let count = 0
      const deletedStorageKeys: string[] = []
      for (const id of ids) {
        try {
          const res = await this.permanentDeleteAdmin(id, actorAccountId)
          deletedStorageKeys.push(res.storageKey)
          count++
        } catch { /* skip */ }
      }
      return { affectedCount: count, deletedStorageKeys }
    }

    return { affectedCount: 0 }
  }
}
