import fs from 'node:fs'
import { describe, it, expect } from 'vitest'
import { extractDocument } from '../src/services/sop-import.extractor.js'
import { assignMediaToSteps } from '../src/services/sop-media-assignment.js'

describe('Real-world PDF End-to-End Verification', () => {
  const pdfPath = 'D:\\LTA_HRUX\\HRMS_Doc\\HƯỚNG DẪN LÀM HỢP ĐỒNG LAO ĐỘNG.pdf'

  it('extracts real UI images, preserves step hierarchy, and deterministically assigns media', async () => {
    if (!fs.existsSync(pdfPath)) {
      console.warn('PDF not found, skipping real file test')
      return
    }

    const buffer = fs.readFileSync(pdfPath)
    expect(buffer.length).toBeGreaterThan(10000)

    const result = await extractDocument({
      buffer,
      mediaType: 'application/pdf',
      fileName: 'HƯỚNG DẪN LÀM HỢP ĐỒNG LAO ĐỘNG.pdf',
      code: 'SOP-HDLD-01',
      title: 'HƯỚNG DẪN LÀM HỢP ĐỒNG LAO ĐỘNG',
      primaryModuleId: 'emp-01',
      importId: 'e2e-real-test-01'
    })

    const preview = result.preview

    // 1. Text extraction & pages
    expect(result.extractedText.length).toBeGreaterThan(500)
    expect(preview.sourceStructure?.outline).toBeDefined()

    // 2. Extracted Media Candidates
    const media = preview.sourceStructure?.media ?? []
    expect(media.length).toBeGreaterThanOrEqual(4)
    for (const m of media) {
      expect(m.id).toBeDefined()
      expect(m.storageKey).toBeDefined()
      expect(m.page).toBeGreaterThanOrEqual(1)
      expect(m.page).toBeLessThanOrEqual(5)
      expect(m.checksum).toHaveLength(64)
    }

    // 3. Document Hierarchy: only explicit "Bước N" become main steps
    const outline = preview.sourceStructure!.outline
    const mainSteps = outline.filter(o => o.semanticKind === 'main_step')
    expect(mainSteps.length).toBeGreaterThanOrEqual(2)

    // Sub-items remain child/nested items
    const subItems = outline.filter(o => o.semanticKind !== 'main_step')
    expect(subItems.length).toBeGreaterThan(0)

    // 4. Step generation & media assignment
    const steps = preview.steps
    expect(steps.length).toBe(mainSteps.length)

    // Steps should receive media
    const stepsWithMedia = steps.filter(s => (s.media?.length ?? 0) > 0)
    expect(stepsWithMedia.length).toBeGreaterThan(0)

    // Steps with media should have cover
    for (const s of stepsWithMedia) {
      const cover = s.media?.find(m => m.role === 'cover')
      expect(cover).toBeDefined()
      expect(s.imageUrl).toBeDefined()
    }

    // 5. Re-analysis persistence
    // Modify one step media manually
    const targetStep = stepsWithMedia[0]!
    targetStep.media![0]!.caption = 'Custom user caption'
    targetStep.media![0]!.role = 'form'

    const reassigned = assignMediaToSteps(
      preview.sourceStructure!,
      steps,
      media,
      steps
    )

    const reassignedTarget = reassigned.steps.find(s => s.id === targetStep.id)!
    expect(reassignedTarget.media![0]!.caption).toBe('Custom user caption')
    expect(reassignedTarget.media![0]!.role).toBe('form')
  })
})
