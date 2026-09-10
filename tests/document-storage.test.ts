import { Writable } from 'node:stream'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { v2 as cloudinary } from 'cloudinary'
import { DocumentStorage } from '../src/services/document-storage.js'
import { loadCloudinaryEnv, type AppEnv } from '../src/config/env.js'

const env = {
  upload: { directory: 'unused', maxBytes: 1000 },
  cloudinary: { enabled: true, cloudName: 'test', apiKey: 'key', apiSecret: 'secret', folder: 'hrm_documents' }
} as AppEnv

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.unstubAllGlobals() })

describe('Cloudinary storage', () => {
  it('uploads raw authenticated bytes without writing to disk', async () => {
    const bytes = Buffer.from('%PDF-test')
    let received: Buffer | undefined
    const upload = vi.spyOn(cloudinary.uploader, 'upload_stream').mockImplementation((options: any, callback: any) => {
      return new Writable({ write(chunk, _encoding, done) { received = chunk; done() }, final(done) { callback(null, { public_id: options.public_id }); done() } }) as any
    })
    expect(await new DocumentStorage(env).put('test.pdf', bytes)).toBe('cloudinary:hrm_documents/test.pdf')
    expect(received).toEqual(bytes)
    expect(upload.mock.calls[0]?.[0]).toMatchObject({ resource_type: 'raw', type: 'authenticated', overwrite: false })
  })

  it('does not expose provider errors or fall back to local disk after upload failure', async () => {
    vi.spyOn(cloudinary.uploader, 'upload_stream').mockImplementation((_options: any, callback: any) => {
      return new Writable({ write(_chunk, _encoding, done) { callback({ message: 'sensitive provider details' }); done() } }) as any
    })
    await expect(new DocumentStorage(env).put('test.docx', Buffer.from('test'))).rejects.toMatchObject({ code: 'STORAGE_UPLOAD_FAILED' })
  })

  it('reads via a short-lived authenticated API URL', async () => {
    const signed = vi.spyOn(cloudinary.utils, 'private_download_url').mockReturnValue('https://api.cloudinary.com/test')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('file bytes')))
    expect((await new DocumentStorage(env).read('cloudinary:hrm_documents/test.docx')).toString()).toBe('file bytes')
    expect(signed.mock.calls[0]?.[2]).toMatchObject({ resource_type: 'raw', type: 'authenticated' })
  })

  it('deletes the matching authenticated raw asset', async () => {
    const destroy = vi.spyOn(cloudinary.uploader, 'destroy').mockResolvedValue({ result: 'ok' })
    await new DocumentStorage(env).remove('cloudinary:hrm_documents/test.docx')
    expect(destroy).toHaveBeenCalledWith('hrm_documents/test.docx', expect.objectContaining({ resource_type: 'raw', type: 'authenticated' }))
  })
})

describe('Cloudinary environment', () => {
  it('prefers the complete individual credentials over URL credentials', () => {
    vi.stubEnv('CLOUDINARY_CLOUD_NAME', 'individual'); vi.stubEnv('CLOUDINARY_API_KEY', 'key'); vi.stubEnv('CLOUDINARY_API_SECRET', 'secret')
    vi.stubEnv('CLOUDINARY_URL', 'cloudinary://other:other@other')
    expect(loadCloudinaryEnv()).toMatchObject({ enabled: true, cloudName: 'individual', apiKey: 'key' })
  })
  it('uses URL only when no individual credential is set', () => {
    vi.stubEnv('CLOUDINARY_CLOUD_NAME', ''); vi.stubEnv('CLOUDINARY_API_KEY', ''); vi.stubEnv('CLOUDINARY_API_SECRET', '')
    vi.stubEnv('CLOUDINARY_URL', 'cloudinary://key:secret@url-cloud'); vi.stubEnv('CLOUDINARY_DOCUMENT_FOLDER', '')
    expect(loadCloudinaryEnv()).toMatchObject({ enabled: true, cloudName: 'url-cloud', folder: 'hrm_documents' })
  })
  it('rejects incomplete credentials instead of mixing two accounts', () => {
    vi.stubEnv('CLOUDINARY_CLOUD_NAME', 'individual'); vi.stubEnv('CLOUDINARY_API_KEY', ''); vi.stubEnv('CLOUDINARY_API_SECRET', '')
    expect(() => loadCloudinaryEnv()).toThrow('Cloudinary requires')
  })
})
