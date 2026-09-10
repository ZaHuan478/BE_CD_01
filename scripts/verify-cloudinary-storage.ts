import { randomUUID } from 'node:crypto'
import { loadEnv } from '../src/config/env.js'
import { DocumentStorage } from '../src/services/document-storage.js'

const env = loadEnv()
if (!env.cloudinary.enabled) throw new Error('Cloudinary is not configured')
const storage = new DocumentStorage(env)
let key: string | undefined
try {
  const bytes = Buffer.from('%PDF-1.4\n% Synthetic Cloudinary storage verification\n%%EOF\n')
  key = await storage.put(`storage-check-${randomUUID()}.pdf`, bytes)
  const downloaded = await storage.read(key)
  if (!bytes.equals(downloaded)) throw new Error('File bytes changed')
  console.log('Cloudinary upload and authenticated download: PASS')
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Cloudinary verification failed')
  process.exitCode = 1
} finally {
  if (key) {
    try { await storage.remove(key); console.log('Cloudinary cleanup: PASS') }
    catch { console.error('Cloudinary cleanup failed for test asset:', key); process.exitCode = 1 }
  }
}
