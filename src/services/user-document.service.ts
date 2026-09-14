import { createHash } from 'node:crypto'
import { DocumentStorage } from './document-storage.js'
import { basename, extname } from 'node:path'
import type { AuthPrincipal } from '../auth/types.js'
import { AppError, forbidden } from '../common/errors.js'
import { createId } from '../common/ids.js'
import type { AppEnv } from '../config/env.js'
import type {
  ListAdminDocumentsOptions,
  ListUserDocumentsOptions,
  UserDocumentRepository
} from '../repositories/user-document.repository.js'

const DOCX_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

function validateDocumentFile(fileName: string, buffer: Buffer, maxBytes: number): { kind: 'docx' | 'pdf'; mediaType: string } {
  if (!buffer || buffer.length === 0) {
    throw new AppError(400, 'EMPTY_UPLOAD', 'Tệp tải lên không có nội dung')
  }
  if (buffer.length > maxBytes) {
    const maxMb = Math.round(maxBytes / (1024 * 1024))
    throw new AppError(413, 'UPLOAD_TOO_LARGE', `Dung lượng tệp vượt quá giới hạn cho phép (${maxMb} MB)`)
  }

  const extension = extname(fileName).toLowerCase()
  const isPdf = extension === '.pdf' && buffer.subarray(0, 5).toString('ascii') === '%PDF-'
  const isDocx = extension === '.docx' && buffer.length >= 4 && buffer[0] === 0x50 && buffer[1] === 0x4b

  if (!isPdf && !isDocx) {
    throw new AppError(400, 'UNSUPPORTED_DOCUMENT', 'Chỉ chấp nhận tệp định dạng DOCX hoặc PDF hợp lệ')
  }

  return {
    kind: isPdf ? 'pdf' : 'docx',
    mediaType: isPdf ? 'application/pdf' : DOCX_TYPE
  }
}

export class UserDocumentService {
  constructor(
    private readonly repository: UserDocumentRepository,
    private readonly env: AppEnv
  ) {}

  private get storage() { return new DocumentStorage(this.env) }

  private requireAdmin(principal: AuthPrincipal) {
    if (!['ADMIN', 'SUPER_ADMIN'].includes(principal.systemRole)) {
      throw forbidden('Chỉ quản trị viên mới có quyền quản lý tài liệu hệ thống')
    }
  }

  async upload(
    principal: AuthPrincipal,
    input: { fileName: string; buffer: Buffer; displayName?: string }
  ) {
    const safeFileName = basename(input.fileName)
    const { kind, mediaType } = validateDocumentFile(safeFileName, input.buffer, this.env.upload.maxBytes)

    const checksum = createHash('sha256').update(input.buffer).digest('hex')
    const duplicate = await this.repository.findDuplicate(checksum, principal.accountId)
    if (duplicate) {
      throw new AppError(409, 'DUPLICATE_UPLOAD', `Tệp này đã tồn tại trong kho tài liệu của bạn (tên: “${duplicate.displayName}”)`)
    }

    const id = createId('udoc')
    const storageKey = await this.storage.put(`${id}.${kind}`, input.buffer)

    const initialDisplayName = input.displayName?.trim() || safeFileName

    try {
      return await this.repository.create({
        id,
        fileName: safeFileName,
        displayName: initialDisplayName,
        storageKey,
        mediaType,
        fileSize: input.buffer.length,
        checksum,
        accountId: principal.accountId
      })
    } catch (error) {
      await this.storage.remove(storageKey)
      throw error
    }
  }

  async list(principal: AuthPrincipal, options: ListUserDocumentsOptions) {
    return this.repository.list(principal.accountId, options)
  }

  async get(principal: AuthPrincipal, id: string) {
    return this.repository.get(id, principal.accountId)
  }

  async rename(principal: AuthPrincipal, id: string, displayName: string) {
    const trimmed = displayName?.trim()
    if (!trimmed) {
      throw new AppError(400, 'INVALID_NAME', 'Tên hiển thị của tài liệu không được để trống')
    }
    return this.repository.rename(id, principal.accountId, trimmed)
  }

  async delete(principal: AuthPrincipal, id: string) {
    return this.repository.softDelete(id, principal.accountId)
  }

  async restore(principal: AuthPrincipal, id: string) {
    return this.repository.restore(id, principal.accountId)
  }

  async file(principal: AuthPrincipal, id: string) {
    const document = await this.repository.get(id, principal.accountId)
    const buffer = await this.storage.read(document.storageKey)
    return {
      buffer,
      fileName: document.originalFileName,
      displayName: document.displayName,
      mediaType: document.mediaType
    }
  }

  // --- Admin operations ---

  async listAdmin(principal: AuthPrincipal, options: ListAdminDocumentsOptions) {
    this.requireAdmin(principal)
    return this.repository.listAdmin(options)
  }

  async getAdmin(principal: AuthPrincipal, id: string) {
    this.requireAdmin(principal)
    return this.repository.getAdmin(id)
  }

  async fileAdmin(principal: AuthPrincipal, id: string) {
    this.requireAdmin(principal)
    const document = await this.repository.getAdmin(id)
    const buffer = await this.storage.read(document.storageKey)
    return {
      buffer,
      fileName: document.originalFileName,
      displayName: document.displayName,
      mediaType: document.mediaType
    }
  }

  async renameAdmin(principal: AuthPrincipal, id: string, displayName: string) {
    this.requireAdmin(principal)
    const trimmed = displayName?.trim()
    if (!trimmed) {
      throw new AppError(400, 'INVALID_NAME', 'Tên hiển thị của tài liệu không được để trống')
    }
    return this.repository.renameAdmin(id, trimmed, principal.accountId)
  }

  async deleteAdmin(principal: AuthPrincipal, id: string) {
    this.requireAdmin(principal)
    return this.repository.softDeleteAdmin(id, principal.accountId)
  }

  async restoreAdmin(principal: AuthPrincipal, id: string) {
    this.requireAdmin(principal)
    return this.repository.restoreAdmin(id, principal.accountId)
  }

  async permanentDeleteAdmin(principal: AuthPrincipal, id: string) {
    this.requireAdmin(principal)
    const { storageKey, shouldRemoveStorage } = await this.repository.permanentDeleteAdmin(id, principal.accountId)
    if (shouldRemoveStorage && storageKey) {
      await this.storage.remove(storageKey)
    }
    return { id, success: true }
  }

  async batchActionAdmin(
    principal: AuthPrincipal,
    action: 'trash' | 'restore' | 'permanentDelete',
    documentIds: string[]
  ) {
    this.requireAdmin(principal)
    const result = await this.repository.batchActionAdmin(action, documentIds, principal.accountId)
    if (result.deletedStorageKeys && result.deletedStorageKeys.length > 0) {
      for (const storageKey of result.deletedStorageKeys) {
        await this.storage.remove(storageKey)
      }
    }
    return { affectedCount: result.affectedCount }
  }
}
