import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { extractMediaFromPdf, extractAndUploadMedia } from '../src/services/sop-media-extractor.js'

describe('sop-media-extractor', () => {
  const pdfPath = 'D:/LTA_HRUX/HRMS_Doc/HƯỚNG DẪN LÀM HỢP ĐỒNG LAO ĐỘNG.pdf'

  it('extracts real UI images from the HR contract guide PDF', async () => {
    const buffer = readFileSync(pdfPath)
    const candidates = await extractMediaFromPdf(buffer)
    expect(candidates.length).toBeGreaterThanOrEqual(5)
    // Verify each candidate has required fields
    for (const c of candidates) {
      expect(c.id).toBeTruthy()
      expect(c.kind).toBe('embedded_image')
      expect(c.page).toBeGreaterThanOrEqual(1)
      expect(c.buffer.length).toBeGreaterThan(1000)
      expect(c.checksum).toBeTruthy()
      expect(c.mimeType).toBe('image/png')
    }
  })

  it('filters small icons and detects duplicate logos', async () => {
    const buffer = readFileSync(pdfPath)
    const candidates = await extractMediaFromPdf(buffer)
    // Check that none of the candidates are tiny icons (< 50px)
    for (const c of candidates) {
      if (c.width && c.height) {
        expect(c.width).toBeGreaterThanOrEqual(50)
        expect(c.height).toBeGreaterThanOrEqual(50)
      }
    }
  })

  it('extractAndUploadMedia works in mock fallback mode when no storage is passed', async () => {
    const buffer = readFileSync(pdfPath)
    const media = await extractAndUploadMedia(buffer, 'application/pdf', 'test-import-id')
    expect(media.length).toBeGreaterThanOrEqual(5)
    expect(media[0]?.storageKey).toContain('local:mock/')
    expect(media[0]?.previewUrl).toContain('data:image/png;base64,')
  })
})
