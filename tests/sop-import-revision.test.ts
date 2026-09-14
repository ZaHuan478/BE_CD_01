import { describe, expect, it, vi } from 'vitest'
import type { AuthPrincipal } from '../src/auth/types.js'
import type { AppEnv } from '../src/config/env.js'
import type { SopImportRepository } from '../src/repositories/sop-import.repository.js'
import type { UserDocumentRepository } from '../src/repositories/user-document.repository.js'
import { SopImportService } from '../src/services/sop-import.service.js'

const principal: AuthPrincipal = {
  accountId: 'owner-1', username: 'owner', fullName: 'SOP Owner', email: null,
  systemRole: 'USER', groupIds: [], grants: [],
  organization: {
    employeeCode: null, company: null, division: null, department: 'Nhân sự',
    team: null, jobTitle: 'Chuyên viên', managerAccountId: null
  }
}

describe('SOP import revisions', () => {
  it('keeps a revision linked to its source document and reuses the source storage object', async () => {
    const published = {
      id: 'import-published', status: 'published', createdBy: principal.accountId,
      storageKey: 'hrm_documents/source.pdf', sourceDocumentId: 'document-1',
      targetSopId: 'sop-1', targetVersionId: '1', extractedText: 'source',
      file: { name: 'source.pdf', mediaType: 'application/pdf', size: 321, checksum: 'checksum' },
      preview: { code: 'SOP-EMP-01', title: 'Quy trình', primaryModuleId: 'EMP', moduleIds: ['EMP'], steps: [], transitions: [] },
      warnings: [], audience: { mode: 'department', department: 'Nhân sự', jobTitle: null }
    }
    const create = vi.fn(async (input: Record<string, unknown>) => ({ ...published, ...input }))
    const repository = {
      get: vi.fn(async () => published),
      isCurrentPublished: vi.fn(async () => true),
      create
    } as unknown as SopImportRepository
    const service = new SopImportService(
      repository,
      {} as UserDocumentRepository,
      undefined,
      { databaseModel: 'core8' } as AppEnv
    )

    await service.revise(principal, published.id)

    expect(create).toHaveBeenCalledOnce()
    expect(create.mock.calls[0]![0]).toMatchObject({
      storageKey: published.storageKey,
      sourceDocumentId: published.sourceDocumentId,
      fileSize: published.file.size
    })
  })
})
