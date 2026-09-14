import { describe, expect, it } from 'vitest'
import { assignMediaToSteps } from '../src/services/sop-media-assignment.js'
import type { SourceStructure, StepInput, SourceMedia } from '../src/schemas/sop.schemas.js'

describe('sop-media-assignment', () => {
  const sampleStructure: SourceStructure = {
    schemaVersion: 2,
    adapter: 'docx-html',
    outline: [
      { id: 'item-1', level: 1, markerKind: 'named_step', marker: '1', title: 'Bước 1: Chuẩn bị hồ sơ', semanticKind: 'main_step', sortOrder: 1, lineStart: 10, lineEnd: 50, confidence: 1 },
      { id: 'item-1-a', parentId: 'item-1', level: 2, markerKind: 'letter', marker: 'A', title: 'A. Thu thập giấy tờ', semanticKind: 'action', sortOrder: 2, lineStart: 15, lineEnd: 30, confidence: 0.9 },
      { id: 'item-1-a-1', parentId: 'item-1-a', level: 3, markerKind: 'number', marker: '1', title: '1. Bản sao CCCD', semanticKind: 'checklist', sortOrder: 3, lineStart: 18, lineEnd: 25, confidence: 0.9 },
      { id: 'item-2', level: 1, markerKind: 'named_step', marker: '2', title: 'Bước 2: Ký duyệt hợp đồng', semanticKind: 'main_step', sortOrder: 4, lineStart: 51, lineEnd: 100, confidence: 1 }
    ],
    stats: { pageCount: 2, itemCount: 4, lowConfidenceCount: 0, operationalStepCount: 2 }
  }

  const sampleSteps: StepInput[] = [
    {
      id: 'step-1',
      stableKey: 'source:item-1',
      code: 'STEP-001',
      title: 'Bước 1: Chuẩn bị hồ sơ',
      nodeKind: 'task',
      sortOrder: 1,
      sourceRefs: [{ page: 1, lineStart: 10, lineEnd: 50, text: 'Bước 1: Chuẩn bị hồ sơ' }]
    },
    {
      id: 'step-2',
      stableKey: 'source:item-2',
      code: 'STEP-002',
      title: 'Bước 2: Ký duyệt hợp đồng',
      nodeKind: 'task',
      sortOrder: 2,
      sourceRefs: [{ page: 2, lineStart: 51, lineEnd: 100, text: 'Bước 2: Ký duyệt hợp đồng' }]
    }
  ]

  it('assigns an image inside child item A > 1 to main Bước 1 with hierarchical subPath', () => {
    const candidate: SourceMedia = {
      id: 'media-1',
      kind: 'embedded_image',
      sourceOutlineItemId: 'item-1-a-1',
      paragraphIndex: 20,
      page: 1,
      storageKey: 'local:media/test/m1.png',
      previewUrl: '/api/v1/sop-imports/test/media/media-1/preview',
      mimeType: 'image/png',
      checksum: 'chk1',
      sortOrder: 1,
      confidence: 0.9,
      assignmentStatus: 'unassigned'
    }

    const result = assignMediaToSteps(sampleStructure, sampleSteps, [candidate])
    expect(result.assignedCount).toBe(1)
    expect(result.unassignedCount).toBe(0)

    const step1 = result.steps.find(s => s.id === 'step-1')!
    expect(step1.media).toHaveLength(1)
    expect(step1.media![0]?.sourceMediaId).toBe('media-1')
    expect(step1.media![0]?.sourceSubPath).toBe('Bước 1 > A > 1')
    expect(step1.media![0]?.role).toBe('cover')
    expect(step1.imageUrl).toBe(step1.media![0]?.url)
  })

  it('assigns an image between Step 1 and Step 2 by paragraph position to Step 1', () => {
    const candidate: SourceMedia = {
      id: 'media-2',
      kind: 'embedded_image',
      paragraphIndex: 35,
      page: 1,
      storageKey: 'local:media/test/m2.png',
      mimeType: 'image/png',
      checksum: 'chk2',
      sortOrder: 2,
      confidence: 0.85,
      assignmentStatus: 'unassigned'
    }

    const result = assignMediaToSteps(sampleStructure, sampleSteps, [candidate])
    const step1 = result.steps.find(s => s.id === 'step-1')!
    expect(step1.media).toHaveLength(1)
    expect(step1.media![0]?.sourceMediaId).toBe('media-2')
  })

  it('leaves low confidence media (< 0.75) unassigned', () => {
    const candidate: SourceMedia = {
      id: 'media-3',
      kind: 'embedded_image',
      page: 99, // Unmatched page
      paragraphIndex: 999, // Outside any step
      storageKey: 'local:media/test/m3.png',
      mimeType: 'image/png',
      checksum: 'chk3',
      sortOrder: 3,
      confidence: 0.3,
      assignmentStatus: 'unassigned'
    }

    const result = assignMediaToSteps(sampleStructure, sampleSteps, [candidate])
    expect(result.assignedCount).toBe(0)
    expect(result.unassignedCount).toBe(1)
    expect(result.media[0]?.assignmentStatus).toBe('unassigned')
  })

  it('ignores repeated logo images across document', () => {
    const candidate: SourceMedia = {
      id: 'media-logo',
      kind: 'embedded_image',
      page: 1,
      storageKey: 'local:media/test/logo.png',
      mimeType: 'image/png',
      checksum: 'logo-chk',
      sortOrder: 0,
      confidence: 0.9,
      assignmentStatus: 'ignored'
    }

    const result = assignMediaToSteps(sampleStructure, sampleSteps, [candidate])
    expect(result.assignedCount).toBe(0)
    expect(result.media[0]?.assignmentStatus).toBe('ignored')
  })

  it('re-analysis preserves manual user assignments from previousSteps', () => {
    const previousSteps: StepInput[] = [
      {
        ...sampleSteps[1]!, // User manually assigned media-1 to step-2
        media: [
          {
            id: 'manual-smed-1',
            sourceMediaId: 'media-1',
            storageKey: 'local:media/test/m1.png',
            url: '/api/v1/sop-imports/test/media/media-1/preview',
            caption: 'Ảnh người dùng tự chọn làm minh họa',
            role: 'illustration',
            sortOrder: 1,
            confidence: 1.0
          }
        ]
      }
    ]

    const candidate: SourceMedia = {
      id: 'media-1',
      kind: 'embedded_image',
      sourceOutlineItemId: 'item-1-a-1', // algorithmic would put in step-1
      paragraphIndex: 20,
      page: 1,
      storageKey: 'local:media/test/m1.png',
      mimeType: 'image/png',
      checksum: 'chk1',
      sortOrder: 1,
      confidence: 0.9,
      assignmentStatus: 'unassigned'
    }

    const result = assignMediaToSteps(sampleStructure, sampleSteps, [candidate], previousSteps)
    const step2 = result.steps.find(s => s.id === 'step-2')!
    expect(step2.media).toHaveLength(1)
    expect(step2.media![0]?.caption).toBe('Ảnh người dùng tự chọn làm minh họa')
    expect(step2.media![0]?.role).toBe('illustration')
  })

  it('remains backward compatible with older drafts where media is absent', () => {
    const legacyStep: StepInput = {
      id: 'legacy-1',
      stableKey: 'legacy:1',
      code: 'STEP-OLD',
      title: 'Bước cũ',
      nodeKind: 'task',
      sortOrder: 1,
      imageUrl: 'https://example.com/old-cover.png'
    }

    const result = assignMediaToSteps(sampleStructure, [legacyStep], [])
    expect(result.steps[0]?.imageUrl).toBe('https://example.com/old-cover.png')
    expect(result.steps[0]?.media).toBeUndefined()
  })
})
