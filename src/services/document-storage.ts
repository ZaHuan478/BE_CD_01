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
}
