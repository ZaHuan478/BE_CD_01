import { describe, expect, it, vi } from 'vitest'
import type { AuthPrincipal } from '../src/auth/types.js'
import { SopWorkspaceService, assertDraftAction } from '../src/services/sop-workspace.service.js'
import type { SopWorkspaceRepository, DraftRow } from '../src/repositories/sop-workspace.repository.js'
import type { IndexingService } from '../src/services/rag/indexing.service.js'

function makePrincipal(role: AuthPrincipal['systemRole'], capabilities: string[] = []): AuthPrincipal {
  return {
    accountId: `user-${role.toLowerCase()}`,
    username: role.toLowerCase(),
    fullName: `User ${role}`,
    email: null,
    systemRole: role,
    groupIds: [],
    grants: capabilities.map(code => ({
      permissionCode: code,
      scopeType: 'system' as const,
      scopeId: '*'
    })),
    organization: {
      employeeCode: null,
      company: null,
      division: null,
      department: 'HR',
      team: null,
      jobTitle: 'Admin',
      managerAccountId: null
    }
  }
}

describe('SOP Management Lifecycle & Permissions', () => {
  const superAdmin = makePrincipal('SUPER_ADMIN')
  const operatorWithArchive = makePrincipal('ADMIN', ['sop.archive'])
  const operatorWithoutArchive = makePrincipal('ADMIN', ['sop.read', 'sop.edit'])
  const operatorWithDelete = makePrincipal('ADMIN', ['sop.delete'])
  const operatorWithoutDelete = makePrincipal('ADMIN', ['sop.read', 'sop.edit', 'sop.archive'])

  it('1. Chỉ tài liệu published mới được archive (tài liệu draft/archived bị từ chối)', async () => {
    const docDraft = {
      DocumentId: 'doc-draft',
      Code: 'SOP-01',
      Title: 'Quy trình nháp',
      Summary: 'Tóm tắt',
      CurrentVersionNumber: 1,
      Status: 'draft',
      ContentJson: '{}'
    }

    const mockRunner = {
      query: vi.fn(async (sql: string) => {
        if (sql.includes('KnowledgeDocumentModule')) return [{ ModuleId: 'mod-1' }]
        if (sql.includes('KnowledgeDocument WHERE')) return [docDraft]
        return []
      })
    }

    const repo = {
      transaction: vi.fn(async (work) => work(mockRunner)),
      findDocumentModules: vi.fn(async () => ['mod-1']),
      findDraftByDocumentId: vi.fn(async () => null)
    } as unknown as SopWorkspaceRepository

    const service = new SopWorkspaceService(repo)

    await expect(
      service.archivePublishedDocument(operatorWithArchive, 'doc-draft', 'Lý do thu hồi', 1)
    ).rejects.toThrowError(/Chỉ tài liệu đang công bố mới được phép thu hồi/)
  })

  it('2. Archive yêu cầu quyền sop.archive hoặc SUPER_ADMIN', async () => {
    const repo = {
      transaction: vi.fn(async (work) => work({})),
      findDocumentModules: vi.fn(async () => ['mod-1'])
    } as unknown as SopWorkspaceRepository

    const service = new SopWorkspaceService(repo)

    // Người không có sop.archive bị từ chối với 403
    await expect(
      service.archivePublishedDocument(operatorWithoutArchive, 'doc-1', 'Lý do', 1)
    ).rejects.toMatchObject({ statusCode: 403 })

    // SUPER_ADMIN không bị từ chối quyền
    const mockRunner = {
      query: vi.fn(async (sql: string) => {
        if (sql.includes('KnowledgeDocumentModule')) return [{ ModuleId: 'mod-1' }]
        if (sql.includes('KnowledgeDocument WHERE')) return [{
          DocumentId: 'doc-1',
          Code: 'SOP-01',
          Title: 'SOP 01',
          Summary: 'Summary',
          CurrentVersionNumber: 1,
          Status: 'published',
          ContentJson: '{}'
        }]
        return []
      })
    }
    const repoAdmin = {
      transaction: vi.fn(async (work) => work(mockRunner)),
      findDocumentModules: vi.fn(async () => ['mod-1']),
      findDraftByDocumentId: vi.fn(async () => null),
      insertDraft: vi.fn(async () => {})
    } as unknown as SopWorkspaceRepository
    const serviceAdmin = new SopWorkspaceService(repoAdmin)
    const res = await serviceAdmin.archivePublishedDocument(superAdmin, 'doc-1', 'Thu hồi bởi Super Admin', 1)
    expect(res.success).toBe(true)
    expect(res.status).toBe('archived')
  })

  it('3. Archive ghi AuditLog với thông tin actor, version trước và lý do', async () => {
    let auditLogQueryCalled = false
    let auditPayload: any = null

    const mockDoc = {
      DocumentId: 'doc-1',
      Code: 'SOP-01',
      Title: 'SOP Đã công bố',
      Summary: '',
      CurrentVersionNumber: 2,
      Status: 'published',
      ContentJson: '{}'
    }

    const mockRunner = {
      query: vi.fn(async (sql: string, params: any) => {
        if (sql.includes('KnowledgeDocumentModule')) return [{ ModuleId: 'mod-1' }]
        if (sql.includes('KnowledgeDocument WHERE')) return [mockDoc]
        if (sql.includes('INSERT INTO AuditLog')) {
          auditLogQueryCalled = true
          auditPayload = JSON.parse(params.after)
        }
        return []
      })
    }

    const repo = {
      transaction: vi.fn(async (work) => work(mockRunner)),
      findDocumentModules: vi.fn(async () => ['mod-1']),
      findDraftByDocumentId: vi.fn(async () => null),
      insertDraft: vi.fn(async () => {})
    } as unknown as SopWorkspaceRepository

    const service = new SopWorkspaceService(repo)
    await service.archivePublishedDocument(operatorWithArchive, 'doc-1', 'Thay đổi chính sách nội bộ', 2)

    expect(auditLogQueryCalled).toBe(true)
    expect(auditPayload).toMatchObject({
      documentId: 'doc-1',
      action: 'archive',
      reason: 'Thay đổi chính sách nội bộ',
      previousVersion: 2,
      newStatus: 'archived'
    })
  })

  it('4. Archive gọi xử lý remove khỏi AI index', async () => {
    const mockDoc = {
      DocumentId: 'doc-ai-1',
      Code: 'SOP-AI',
      Title: 'SOP AI Index',
      Summary: '',
      CurrentVersionNumber: 1,
      Status: 'published',
      ContentJson: '{}'
    }

    const mockRunner = {
      query: vi.fn(async (sql: string) => {
        if (sql.includes('KnowledgeDocumentModule')) return [{ ModuleId: 'mod-1' }]
        if (sql.includes('KnowledgeDocument WHERE')) return [mockDoc]
        return []
      })
    }

    const repo = {
      transaction: vi.fn(async (work) => work(mockRunner)),
      findDocumentModules: vi.fn(async () => ['mod-1']),
      findDraftByDocumentId: vi.fn(async () => null),
      insertDraft: vi.fn(async () => {})
    } as unknown as SopWorkspaceRepository

    const mockIndexing = {
      removeEntity: vi.fn(async () => {})
    } as unknown as IndexingService

    const service = new SopWorkspaceService(repo, mockIndexing)
    await service.archivePublishedDocument(operatorWithArchive, 'doc-ai-1', 'Lý do', 1)

    expect(mockIndexing.removeEntity).toHaveBeenCalledWith('doc-ai-1')
  })

  it('5. Version conflict khi archive bị từ chối với lỗi 409', async () => {
    const mockDoc = {
      DocumentId: 'doc-v-conflict',
      Code: 'SOP-01',
      Title: 'SOP',
      Summary: '',
      CurrentVersionNumber: 3, // Current in DB is 3
      Status: 'published',
      ContentJson: '{}'
    }

    const mockRunner = {
      query: vi.fn(async (sql: string) => {
        if (sql.includes('KnowledgeDocumentModule')) return [{ ModuleId: 'mod-1' }]
        if (sql.includes('KnowledgeDocument WHERE')) return [mockDoc]
        return []
      })
    }

    const repo = {
      transaction: vi.fn(async (work) => work(mockRunner)),
      findDocumentModules: vi.fn(async () => ['mod-1'])
    } as unknown as SopWorkspaceRepository

    const service = new SopWorkspaceService(repo)

    // Expected version client passed was 2, but DB has 3 -> conflict
    await expect(
      service.archivePublishedDocument(operatorWithArchive, 'doc-v-conflict', 'Lý do', 2)
    ).rejects.toThrowError(/Phiên bản tài liệu đã thay đổi/)
  })

  it('6. Trash chỉ áp dụng cho draft/workspace; không cho phép trash tài liệu submitted hay published', () => {
    // Draft -> trash: hợp lệ
    expect(() => assertDraftAction('draft', 'trash', 'user-1', 'user-1', null, 'user-1')).not.toThrow()

    // Submitted / Reviewed / Published -> trash: bị từ chối
    expect(() => assertDraftAction('submitted', 'trash', 'user-1', 'user-1', null, 'user-1')).toThrowError(/Trạng thái đã thay đổi/)
    expect(() => assertDraftAction('reviewed', 'trash', 'user-1', 'user-1', null, 'user-1')).toThrowError(/Trạng thái đã thay đổi/)
    expect(() => assertDraftAction('published', 'trash', 'user-1', 'user-1', null, 'user-1')).toThrowError(/Trạng thái đã thay đổi/)
  })

  it('7. Restore không tự ý publish; đưa trạng thái về draft', () => {
    expect(() => assertDraftAction('trash', 'restore', 'user-1', 'user-1', null, 'user-1')).not.toThrow()
    expect(() => assertDraftAction('archived', 'restore', 'user-1', 'user-1', null, 'user-1')).not.toThrow()

    // Restore không được gọi khi đang ở draft hoặc published
    expect(() => assertDraftAction('draft', 'restore', 'user-1', 'user-1', null, 'user-1')).toThrowError(/Trạng thái đã thay đổi/)
    expect(() => assertDraftAction('published', 'restore', 'user-1', 'user-1', null, 'user-1')).toThrowError(/Trạng thái đã thay đổi/)
  })

  it('8. Permanent delete chỉ áp dụng cho hồ sơ đang ở trash', async () => {
    const draftInReview: DraftRow = {
      DraftId: 'draft-review',
      DocumentId: null,
      BaseVersion: 0,
      Revision: 1,
      State: 'submitted',
      PreviewJson: JSON.stringify({ code: 'SOP-01', title: 'Quy trình' }),
      OriginalContentJson: '{}',
      CreatedBy: 'user-1',
      EditedBy: 'user-1',
      ReviewedBy: null,
      PublishedBy: null,
      Note: null,
      UpdatedAt: new Date()
    }

    const mockRunner = {
      query: vi.fn(async () => [])
    }

    const repo = {
      transaction: vi.fn(async (work) => work(mockRunner)),
      findDraftById: vi.fn(async () => draftInReview)
    } as unknown as SopWorkspaceRepository

    const service = new SopWorkspaceService(repo)

    await expect(
      service.permanentDelete(superAdmin, 'draft-review', 'SOP-01')
    ).rejects.toThrowError(/Chỉ có thể xóa vĩnh viễn bản ghi đang ở trong Thùng rác/)
  })

  it('9. Permanent delete yêu cầu sop.delete hoặc SUPER_ADMIN; từ chối Admin thường và kiểm tra mã xác nhận', async () => {
    const draftInTrash: DraftRow = {
      DraftId: 'draft-trash',
      DocumentId: null,
      BaseVersion: 0,
      Revision: 1,
      State: 'trash',
      PreviewJson: JSON.stringify({ code: 'SOP-DELETE-ME', title: 'Quy trình xóa' }),
      OriginalContentJson: '{}',
      CreatedBy: 'user-1',
      EditedBy: 'user-1',
      ReviewedBy: null,
      PublishedBy: null,
      Note: null,
      UpdatedAt: new Date()
    }

    const mockRunner = {
      query: vi.fn(async () => [])
    }

    const repo = {
      transaction: vi.fn(async (work) => work(mockRunner)),
      findDraftById: vi.fn(async () => draftInTrash),
      deleteDraft: vi.fn(async () => {})
    } as unknown as SopWorkspaceRepository

    const service = new SopWorkspaceService(repo)

    // Admin thông thường không có sop.delete -> 403 Forbidden
    await expect(
      service.permanentDelete(operatorWithoutDelete, 'draft-trash', 'SOP-DELETE-ME')
    ).rejects.toMatchObject({ statusCode: 403 })

    // Operator có sop.delete nhưng gõ sai mã xác nhận -> 409 Conflict
    await expect(
      service.permanentDelete(operatorWithDelete, 'draft-trash', 'WRONG-CODE')
    ).rejects.toThrowError(/không khớp với mã SOP/)

    // Operator có sop.delete gõ đúng mã xác nhận -> Thành công
    const res = await service.permanentDelete(operatorWithDelete, 'draft-trash', 'SOP-DELETE-ME')
    expect(res.success).toBe(true)
    expect(res.code).toBe('SOP-DELETE-ME')
    expect(repo.deleteDraft).toHaveBeenCalledWith('draft-trash', mockRunner)
  })

  it('10. Không xóa published trực tiếp', async () => {
    const draftPublished: DraftRow = {
      DraftId: 'draft-pub',
      DocumentId: 'doc-pub',
      BaseVersion: 1,
      Revision: 2,
      State: 'published',
      PreviewJson: JSON.stringify({ code: 'SOP-PUB-01', title: 'Quy trình Published' }),
      OriginalContentJson: '{}',
      CreatedBy: 'user-1',
      EditedBy: 'user-1',
      ReviewedBy: 'user-2',
      PublishedBy: 'user-3',
      Note: null,
      UpdatedAt: new Date()
    }

    const repo = {
      transaction: vi.fn(async (work) => work({})),
      findDraftById: vi.fn(async () => draftPublished)
    } as unknown as SopWorkspaceRepository

    const service = new SopWorkspaceService(repo)

    await expect(
      service.permanentDelete(superAdmin, 'draft-pub', 'SOP-PUB-01')
    ).rejects.toThrowError(/Không được phép xóa vĩnh viễn SOP đang công bố/)
  })

  it('11. Self-approval bị chặn với lỗi 409', () => {
    // Tác giả tự rà soát bản thân
    expect(() =>
      assertDraftAction('submitted', 'review', 'user-author', 'user-editor', null, 'user-author')
    ).toThrowError(/Người soạn hoặc sửa nội dung không được tự rà soát/)

    // Người rà soát tự công bố
    expect(() =>
      assertDraftAction('reviewed', 'publish', 'user-author', 'user-editor', 'user-reviewer', 'user-reviewer')
    ).toThrowError(/Người công bố phải khác người rà soát/)
  })
})
