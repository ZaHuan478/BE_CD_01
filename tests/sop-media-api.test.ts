import { describe, expect, it } from 'vitest'
import { SopImportService } from '../src/services/sop-import.service.js'
import type { SopImportRepository } from '../src/repositories/sop-import.repository.js'
import type { UserDocumentRepository } from '../src/repositories/user-document.repository.js'
import type { AuthPrincipal } from '../src/auth/types.js'
import type { AppEnv } from '../src/config/env.js'
import { AppError } from '../src/common/errors.js'

describe('sop-media-api', () => {
  const ownerPrincipal: AuthPrincipal = {
    accountId: 'acc-owner',
    username: 'owner',
    email: 'owner@example.com',
    fullName: 'Owner User',
    systemRole: 'USER',
    organization: {
      employeeCode: 'EMP-01',
      company: 'HR',
      division: 'HR',
      department: 'HR',
      team: 'HR',
      jobTitle: 'Specialist',
      managerAccountId: null
    },
    groupIds: [],
    grants: [
      { permissionCode: 'sop.create', scopeType: 'system', scopeId: '*' },
      { permissionCode: 'sop.edit', scopeType: 'system', scopeId: '*' }
    ]
  }

  const otherPrincipal: AuthPrincipal = {
    accountId: 'acc-stranger',
    username: 'stranger',
    email: 'stranger@example.com',
    fullName: 'Stranger User',
    systemRole: 'USER',
    organization: {
      employeeCode: 'EMP-02',
      company: 'Sales',
      division: 'Sales',
      department: 'Sales',
      team: 'Sales',
      jobTitle: 'Sales',
      managerAccountId: null
    },
    groupIds: [],
    grants: []
  }

  const fakeItem = {
    id: 'import-123',
    status: 'needs_review' as const,
    createdBy: 'acc-owner',
    file: { name: 'test.pdf', mediaType: 'application/pdf', size: 1000, checksum: 'chk' },
    storageKey: 'local:test.pdf',
    extractedText: 'Bước 1: Test step',
    preview: {
      code: 'SOP-01',
      title: 'Quy trình mẫu',
      category: 'HR',
      primaryModuleId: 'mod-hr',
      moduleIds: ['mod-hr'],
      changeLog: 'Initial',
      steps: [
        {
          id: 'step-1',
          stableKey: 'step-1-key',
          code: 'STEP-1',
          title: 'Bước 1: Test step',
          nodeKind: 'task' as const,
          media: [
            {
              id: 'smed-1',
              sourceMediaId: 'med-1',
              storageKey: 'local:media/import-123/med-1.png',
              url: '/api/v1/sop-imports/import-123/media/med-1/preview',
              caption: 'Ảnh bước 1',
              role: 'cover' as const,
              sortOrder: 1,
              confidence: 0.95
            }
          ],
          imageUrl: '/api/v1/sop-imports/import-123/media/med-1/preview'
        },
        {
          id: 'step-2',
          stableKey: 'step-2-key',
          code: 'STEP-2',
          title: 'Bước 2: In kết quả',
          nodeKind: 'task' as const,
          media: []
        }
      ],
      transitions: [],
      sourceStructure: {
        schemaVersion: 2 as const,
        adapter: 'pdf-layout' as const,
        outline: [],
        stats: { pageCount: 1, itemCount: 1, lowConfidenceCount: 0, operationalStepCount: 2 },
        media: [
          {
            id: 'med-1',
            kind: 'embedded_image' as const,
            storageKey: 'local:media/import-123/med-1.png',
            mimeType: 'image/png',
            checksum: 'chk1',
            sortOrder: 1,
            confidence: 0.95,
            assignmentStatus: 'assigned' as const
          },
          {
            id: 'med-2',
            kind: 'embedded_image' as const,
            storageKey: 'local:media/import-123/med-2.png',
            mimeType: 'image/png',
            checksum: 'chk2',
            sortOrder: 2,
            confidence: 0.8,
            assignmentStatus: 'unassigned' as const
          }
        ]
      }
    },
    warnings: [],
    audience: { mode: 'personal' as const, department: null, jobTitle: null }
  }

  let updatedPreviewCaptured: any = null

  const mockRepo = {
    get: async (id: string) => {
      if (id === 'import-123') return fakeItem
      throw new AppError(404, 'NOT_FOUND', 'Not found')
    },
    isCurrentPublished: async () => true,
    updatePreview: async (_id: string, preview: any) => {
      updatedPreviewCaptured = preview
      return { ...fakeItem, preview }
    }
  } as unknown as SopImportRepository

  const mockStorage = {
    readMedia: async (_key: string) => Buffer.from('FAKE_IMAGE_DATA'),
    putMedia: async () => ({ storageKey: 'local:media/import-123/crop-1.png', previewUrl: '/api/v1/sop-imports/import-123/media/crop-1/preview' }),
    removeMedia: async () => {}
  }

  const fakeEnv = {
    databaseModel: 'core8'
  } as unknown as AppEnv

  const service = new SopImportService(
    mockRepo,
    {} as unknown as UserDocumentRepository,
    undefined,
    fakeEnv,
    undefined,
    mockStorage as any
  )

  it('GET media returns assigned, unassigned and ignored media list', async () => {
    const result = await service.getMedia(ownerPrincipal, 'import-123')
    expect(result.assigned).toHaveLength(1)
    expect(result.assigned[0]?.id).toBe('med-1')
    expect(result.assigned[0]?.stepStableKey).toBe('step-1-key')
    expect(result.unassigned).toHaveLength(1)
    expect(result.unassigned[0]?.id).toBe('med-2')
  })

  it('PATCH media assigns an unassigned media to step 2 as cover', async () => {
    await service.updateMedia(ownerPrincipal, 'import-123', 'med-2', {
      targetStepStableKey: 'step-2-key',
      caption: 'Ảnh minh họa bước 2',
      setAsCover: true
    })

    expect(updatedPreviewCaptured).not.toBeNull()
    const step2 = updatedPreviewCaptured.steps.find((s: any) => s.id === 'step-2')
    expect(step2.media).toHaveLength(1)
    expect(step2.media[0].sourceMediaId).toBe('med-2')
    expect(step2.media[0].role).toBe('cover')
    expect(step2.imageUrl).toContain('med-2')
  })

  it('GET media preview reads binary with access control', async () => {
    const preview = await service.getMediaPreview(ownerPrincipal, 'import-123', 'med-1')
    expect(preview.mimeType).toBe('image/png')
    expect(preview.buffer.toString()).toBe('FAKE_IMAGE_DATA')
  })

  it('unauthorized user receives 403 when trying to access or modify media', async () => {
    await expect(service.getMedia(otherPrincipal, 'import-123')).rejects.toThrow()
    await expect(service.updateMedia(otherPrincipal, 'import-123', 'med-1', { caption: 'Hacked' })).rejects.toThrow()
  })

  it('POST cropMedia creates cropped media and assigns to target step', async () => {
    // 1x1 transparent PNG data url
    const pngDataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
    const result = await service.cropMedia(ownerPrincipal, 'import-123', {
      page: 1,
      boundingBox: { x: 10, y: 10, width: 100, height: 100 },
      targetStepStableKey: 'step-1-key',
      caption: 'Vùng crop từ trang 1',
      role: 'illustration',
      imageDataUrl: pngDataUrl
    })

    expect(result.media.kind).toBe('page_crop')
    expect(result.stepMedia.role).toBe('illustration')
    expect(result.stepMedia.caption).toBe('Vùng crop từ trang 1')
  })
})
