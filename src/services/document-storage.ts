import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { basename, resolve } from 'node:path'
import { v2 as cloudinary } from 'cloudinary'
import type { AppEnv } from '../config/env.js'
import { AppError } from '../common/errors.js'

const PREFIX = 'cloudinary:'

function uploadFailure(providerStatus?: number): AppError {
  const message = providerStatus === 401 || providerStatus === 403
    ? 'Kho lưu trữ đám mây đang từ chối quyền tải lên. Quản trị viên cần kiểm tra API key và quyền ghi của tài khoản lưu trữ.'
    : 'Không thể tải tài liệu lên hệ thống lưu trữ. Vui lòng thử lại.'
  return new AppError(502, 'STORAGE_UPLOAD_FAILED', message, providerStatus ? { providerStatus } : undefined)
}

/** Access remains behind the authenticated document endpoints. */
export class DocumentStorage {
  constructor(private readonly env: AppEnv) {}

  private options() {
    const config = this.env.cloudinary
    if (!config?.enabled) throw new AppError(503, 'STORAGE_NOT_CONFIGURED', 'Hệ thống lưu trữ chưa được cấu hình')
    return { cloud_name: config.cloudName, api_key: config.apiKey, api_secret: config.apiSecret }
  }

  async put(fileName: string, buffer: Buffer): Promise<string> {
    if (!this.env.cloudinary?.enabled) {
      await mkdir(resolve(this.env.upload.directory), { recursive: true })
      await writeFile(resolve(this.env.upload.directory, basename(fileName)), buffer, { flag: 'wx' })
      return basename(fileName)
    }
    const publicId = `${this.env.cloudinary.folder.replace(/^\/+|\/+$/g, '')}/${basename(fileName)}`
    if ((PREFIX + publicId).length > 500) throw new AppError(400, 'STORAGE_KEY_TOO_LONG', 'Tên thư mục lưu trữ quá dài')
    return new Promise((accept, reject) => {
      const stream = cloudinary.uploader.upload_stream({
        ...this.options(), resource_type: 'raw', type: 'authenticated',
        public_id: publicId, overwrite: false, timeout: 60000
      }, (error, result) => {
        if (error || !result) return reject(uploadFailure(error?.http_code))
        accept(PREFIX + result.public_id)
      })
      stream.on('error', () => reject(uploadFailure()))
      stream.end(buffer)
    })
  }

  async read(key: string): Promise<Buffer> {
    if (!key.startsWith(PREFIX)) return readFile(resolve(this.env.upload.directory, basename(key)))
    const url = cloudinary.utils.private_download_url(key.slice(PREFIX.length), '', {
      ...this.options(), resource_type: 'raw', type: 'authenticated',
      expires_at: Math.floor(Date.now() / 1000) + 60
    })
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(60000) })
      if (!response.ok) throw new Error('Download failed')
      return Buffer.from(await response.arrayBuffer())
    } catch { throw new AppError(502, 'STORAGE_READ_FAILED', 'Không thể đọc tài liệu từ hệ thống lưu trữ.') }
  }

  async remove(key: string): Promise<void> {
    if (!key.startsWith(PREFIX)) {
      await rm(resolve(this.env.upload.directory, basename(key)), { force: true })
      return
    }
    try {
      const result = await cloudinary.uploader.destroy(key.slice(PREFIX.length), {
        ...this.options(), resource_type: 'raw', type: 'authenticated', invalidate: true
      })
      if (!['ok', 'not found'].includes(result.result)) throw new Error('Delete failed')
    } catch { throw new AppError(502, 'STORAGE_DELETE_FAILED', 'Không thể xóa tài liệu khỏi hệ thống lưu trữ.') }
  }

  async putMedia(importId: string, mediaId: string, extension: string, buffer: Buffer, _mimeType: string): Promise<{ storageKey: string; previewUrl: string }> {
    const ext = extension.replace(/^\./, '') || 'png'
    const cleanImportId = importId.replace(/[^a-zA-Z0-9_-]/g, '_')
    const cleanMediaId = mediaId.replace(/[^a-zA-Z0-9_-]/g, '_')
    const previewUrl = `/api/v1/sop-imports/${encodeURIComponent(importId)}/media/${encodeURIComponent(mediaId)}/preview`

    if (!this.env.cloudinary?.enabled) {
      const mediaDir = resolve(this.env.upload.directory, 'media', cleanImportId)
      await mkdir(mediaDir, { recursive: true })
      const filePath = resolve(mediaDir, `${cleanMediaId}.${ext}`)
      await writeFile(filePath, buffer)
      return {
        storageKey: `local:media/${cleanImportId}/${cleanMediaId}.${ext}`,
        previewUrl
      }
    }

    const folder = `${this.env.cloudinary.folder.replace(/^\/+|\/+$/g, '')}/sop-imports/${cleanImportId}/media`
    const publicId = `${folder}/${cleanMediaId}`
    return new Promise((accept, reject) => {
      const stream = cloudinary.uploader.upload_stream({
        ...this.options(),
        resource_type: 'image',
        type: 'authenticated',
        public_id: publicId,
        overwrite: true,
        timeout: 60000
      }, (error, result) => {
        if (error || !result) return reject(uploadFailure(error?.http_code))
        accept({
          storageKey: PREFIX + result.public_id,
          previewUrl
        })
      })
      stream.on('error', () => reject(uploadFailure()))
      stream.end(buffer)
    })
  }

  async readMedia(key: string, mimeTypeFallback = 'image/png'): Promise<{ buffer: Buffer; mimeType: string }> {
    if (key.startsWith('local:')) {
      const relativePath = key.slice('local:'.length)
      const fullPath = resolve(this.env.upload.directory, relativePath)
      const buffer = await readFile(fullPath)
      const ext = relativePath.split('.').pop()?.toLowerCase()
      const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : ext === 'webp' ? 'image/webp' : ext === 'svg' ? 'image/svg+xml' : 'image/png'
      return { buffer, mimeType: mime }
    }
    if (!key.startsWith(PREFIX)) {
      const fullPath = resolve(this.env.upload.directory, basename(key))
      const buffer = await readFile(fullPath)
      return { buffer, mimeType: mimeTypeFallback }
    }
    const publicId = key.slice(PREFIX.length)
    const url = cloudinary.utils.private_download_url(publicId, '', {
      ...this.options(),
      resource_type: 'image',
      type: 'authenticated',
      expires_at: Math.floor(Date.now() / 1000) + 120
    })
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(60000) })
      if (!response.ok) throw new Error('Download failed')
      const buffer = Buffer.from(await response.arrayBuffer())
      const contentType = response.headers.get('content-type') || mimeTypeFallback
      return { buffer, mimeType: contentType }
    } catch {
      throw new AppError(502, 'STORAGE_READ_FAILED', 'Không thể đọc hình ảnh từ hệ thống lưu trữ.')
    }
  }

  async removeMedia(key: string): Promise<void> {
    if (key.startsWith('local:')) {
      const relativePath = key.slice('local:'.length)
      await rm(resolve(this.env.upload.directory, relativePath), { force: true })
      return
    }
    if (!key.startsWith(PREFIX)) {
      await rm(resolve(this.env.upload.directory, basename(key)), { force: true })
      return
    }
    try {
      const publicId = key.slice(PREFIX.length)
      const result = await cloudinary.uploader.destroy(publicId, {
        ...this.options(),
        resource_type: 'image',
        type: 'authenticated',
        invalidate: true
      })
      if (!['ok', 'not found'].includes(result.result)) throw new Error('Delete failed')
    } catch {
      // Idempotent: log or ignore deletion failure
    }
  }
}
