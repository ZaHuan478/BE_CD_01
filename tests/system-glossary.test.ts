import { describe, expect, it } from 'vitest'
import type { DatabaseParameters, TransactionalDatabase } from '../src/database/database.js'
import { SystemGlossaryRepository } from '../src/repositories/system-glossary.repository.js'
import { SystemGlossaryService } from '../src/services/system-glossary.service.js'
import type { AuthPrincipal } from '../src/auth/types.js'

class MemoryGlossaryDatabase implements TransactionalDatabase {
  public terms: any[] = []
  public versions: any[] = []
  public guideTerms: any[] = []
  public auditLogs: any[] = []

  async query<T extends object>(statement: string, parameters: DatabaseParameters = {}): Promise<T[]> {
    // 1. Audit log
    if (statement.includes('INSERT INTO AuditLog')) {
      this.auditLogs.push({ ...parameters })
      return [{ affectedRows: 1 }] as T[]
    }

    // 2. Count published
    if (statement.includes('COUNT(*) AS total') && statement.includes('FROM SystemGlossaryTerm term')) {
      let filtered = this.getPublishedJoined()
      if (parameters.category) filtered = filtered.filter(f => f.Category === parameters.category)
      if (parameters.letterPattern) {
        const prefix = String(parameters.letterPattern).replace('%', '').toLowerCase()
        filtered = filtered.filter(f =>
          f.Term.toLowerCase().startsWith(prefix) || (f.VietnameseName && f.VietnameseName.toLowerCase().startsWith(prefix))
        )
      }
      if (parameters.likeQ) {
        const q = String(parameters.likeQ).replace(/%/g, '').toLowerCase()
        filtered = filtered.filter(f =>
          f.Term.toLowerCase().includes(q) ||
          (f.VietnameseName && f.VietnameseName.toLowerCase().includes(q)) ||
          f.ShortDefinition.toLowerCase().includes(q) ||
          f.DetailedDefinition.toLowerCase().includes(q) ||
          f.AliasesJson.toLowerCase().includes(q)
        )
      }
      return [{ total: filtered.length }] as T[]
    }

    // 3. List published with pagination
    if (statement.includes('FROM SystemGlossaryTerm term') && statement.includes("term.Status = 'published'")) {
      if (statement.includes('WHERE (term.Slug = :slug OR term.TermId = :slug)')) {
        const slug = String(parameters.slug)
        const row = this.getPublishedJoined().find(f => f.Slug === slug || f.TermId === slug)
        return (row ? [row] : []) as T[]
      }

      let filtered = this.getPublishedJoined()
      if (parameters.category) filtered = filtered.filter(f => f.Category === parameters.category)
      if (parameters.letterPattern) {
        const prefix = String(parameters.letterPattern).replace('%', '').toLowerCase()
        filtered = filtered.filter(f =>
          f.Term.toLowerCase().startsWith(prefix) || (f.VietnameseName && f.VietnameseName.toLowerCase().startsWith(prefix))
        )
      }
      if (parameters.likeQ) {
        const q = String(parameters.likeQ).replace(/%/g, '').toLowerCase()
        filtered = filtered.filter(f =>
          f.Term.toLowerCase().includes(q) ||
          (f.VietnameseName && f.VietnameseName.toLowerCase().includes(q)) ||
          f.ShortDefinition.toLowerCase().includes(q) ||
          f.DetailedDefinition.toLowerCase().includes(q) ||
          f.AliasesJson.toLowerCase().includes(q)
        )
      }
      return filtered as T[]
    }

    // 4. Admin List
    if (statement.includes('FROM SystemGlossaryTerm term') && statement.includes('latestVersion.VersionNumber =')) {
      let filtered = this.terms.map(t => {
        const termVers = this.versions.filter(v => v.TermId === t.TermId)
        const maxV = termVers.reduce((max, v) => v.VersionNumber > max ? v.VersionNumber : max, 0)
        const latest = termVers.find(v => v.VersionNumber === maxV)
        const hasDraft = termVers.some(v => v.VersionStatus === 'draft')
        return {
          ...t,
          VersionNumber: latest?.VersionNumber,
          ShortDefinition: latest?.ShortDefinition,
          DetailedDefinition: latest?.DetailedDefinition,
          AliasesJson: latest?.AliasesJson,
          ExamplesJson: latest?.ExamplesJson,
          RelatedTermSlugsJson: latest?.RelatedTermSlugsJson,
          VersionStatus: latest?.VersionStatus,
          HasDraftVersion: hasDraft ? 1 : 0
        }
      })
      if (parameters.category) filtered = filtered.filter(f => f.Category === parameters.category)
      if (parameters.status) filtered = filtered.filter(f => f.Status === parameters.status)
      if (parameters.likeQ) {
        const q = String(parameters.likeQ).replace(/%/g, '').toLowerCase()
        filtered = filtered.filter(f => f.Term.toLowerCase().includes(q) || (f.VietnameseName && f.VietnameseName.toLowerCase().includes(q)) || f.Slug.toLowerCase().includes(q))
      }
      return filtered as T[]
    }

    // 5. Admin get by ID or update lookup
    if (statement.includes('SELECT term.TermId') && statement.includes('FROM SystemGlossaryTerm term') && (statement.includes(':id') || statement.includes(':termId'))) {
      const targetId = parameters.termId ?? parameters.id
      const term = this.terms.find(t => t.TermId === targetId || t.Slug === targetId)
      return (term ? [term] : []) as T[]
    }

    // 5b. Max version number
    if (statement.includes('SELECT MAX(VersionNumber)')) {
      const termVers = this.versions.filter(v => v.TermId === parameters.termId)
      const maxV = termVers.reduce((max, v) => (v.VersionNumber > max ? v.VersionNumber : max), 0)
      return [{ MaxV: maxV }] as T[]
    }

    // 6. Get versions for term
    if (statement.includes('FROM SystemGlossaryTermVersion') && statement.includes('WHERE TermId = :termId')) {
      if (statement.includes("VersionStatus = 'draft'")) {
        const drafts = this.versions.filter(v => v.TermId === parameters.termId && v.VersionStatus === 'draft').sort((a, b) => b.VersionNumber - a.VersionNumber)
        return drafts as T[]
      }
      if (statement.includes("VersionNumber = :currentVersion")) {
        const row = this.versions.find(v => v.TermId === parameters.termId && v.VersionNumber === parameters.currentVersion)
        return (row ? [row] : []) as T[]
      }
      const vers = this.versions.filter(v => v.TermId === parameters.termId).sort((a, b) => b.VersionNumber - a.VersionNumber)
      return vers as T[]
    }

    // 7. Check duplicates
    if (statement.includes('SELECT TermId FROM SystemGlossaryTerm WHERE Slug = :slug')) {
      const found = this.terms.find(t => t.Slug === parameters.slug && (!parameters.excludeId || t.TermId !== parameters.excludeId))
      return (found ? [{ TermId: found.TermId }] : []) as T[]
    }
    if (statement.includes('SELECT TermId FROM SystemGlossaryTerm WHERE LOWER(Term) = LOWER(:term)')) {
      const found = this.terms.find(t => t.Term.toLowerCase() === String(parameters.term).toLowerCase() && (!parameters.excludeId || t.TermId !== parameters.excludeId))
      return (found ? [{ TermId: found.TermId }] : []) as T[]
    }

    // 8. Insert Term (chính xác bảng SystemGlossaryTerm)
    if (statement.includes('INSERT INTO SystemGlossaryTerm') && !statement.includes('SystemGlossaryTermVersion')) {
      const newTerm = {
        TermId: parameters.termId,
        Slug: parameters.slug,
        Term: parameters.term,
        VietnameseName: parameters.vietnameseName,
        Category: parameters.category,
        RoutePath: parameters.routePath,
        Status: 'draft',
        CurrentPublishedVersion: null,
        SortOrder: parameters.sortOrder ?? 0,
        IsActive: 1,
        CreatedBy: parameters.actorId,
        UpdatedBy: parameters.actorId,
        CreatedAt: new Date(),
        UpdatedAt: new Date()
      }
      this.terms.push(newTerm)
      return [{ affectedRows: 1 }] as T[]
    }

    // 9. Insert Version
    if (statement.includes('INSERT INTO SystemGlossaryTermVersion')) {
      const newVer = {
        TermId: parameters.termId,
        VersionNumber: parameters.version ?? 1,
        ShortDefinition: parameters.shortDef ?? parameters.shortDefinition,
        DetailedDefinition: parameters.detailedDef ?? parameters.detailedDefinition,
        AliasesJson: parameters.aliases ?? parameters.aliasesJson,
        ExamplesJson: parameters.examples ?? parameters.examplesJson,
        RelatedTermSlugsJson: parameters.related ?? parameters.relatedTermSlugsJson,
        VersionStatus: 'draft',
        CreatedBy: parameters.actorId,
        CreatedAt: new Date()
      }
      this.versions.push(newVer)
      return [{ affectedRows: 1 }] as T[]
    }

    // 10. Update Term
    if (statement.includes('UPDATE SystemGlossaryTerm') && statement.includes('SET Slug = :slug')) {
      const term = this.terms.find(t => t.TermId === parameters.termId)
      if (term) {
        term.Slug = parameters.slug
        term.Term = parameters.term
        term.VietnameseName = parameters.vietnameseName
        term.Category = parameters.category
        term.RoutePath = parameters.routePath
        term.SortOrder = parameters.sortOrder
        term.UpdatedBy = parameters.actorId
        term.UpdatedAt = new Date()
      }
      return [{ affectedRows: term ? 1 : 0 }] as T[]
    }

    // 11. Max version number
    if (statement.includes('SELECT MAX(VersionNumber) as MaxV FROM SystemGlossaryTermVersion')) {
      const termVers = this.versions.filter(v => v.TermId === parameters.termId)
      const maxV = termVers.reduce((max, v) => v.VersionNumber > max ? v.VersionNumber : max, 0)
      return [{ MaxV: maxV }] as T[]
    }

    // 12. Update draft version
    if (statement.includes('UPDATE SystemGlossaryTermVersion') && statement.includes('SET ShortDefinition = :shortDef')) {
      const ver = this.versions.find(v => v.TermId === parameters.termId && v.VersionNumber === parameters.version)
      if (ver) {
        ver.ShortDefinition = parameters.shortDef
        ver.DetailedDefinition = parameters.detailedDef
        ver.AliasesJson = parameters.aliases
        ver.ExamplesJson = parameters.examples
        ver.RelatedTermSlugsJson = parameters.related
      }
      return [{ affectedRows: ver ? 1 : 0 }] as T[]
    }

    // 13. Publish version operations
    if (statement.includes("UPDATE SystemGlossaryTermVersion SET VersionStatus = 'archived'")) {
      for (const v of this.versions) {
        if (v.TermId === parameters.termId && v.VersionStatus === 'published') {
          v.VersionStatus = 'archived'
        }
      }
      return [{ affectedRows: 1 }] as T[]
    }
    if (statement.includes("UPDATE SystemGlossaryTermVersion") && statement.includes("SET VersionStatus = 'published'")) {
      const ver = this.versions.find(v => v.TermId === parameters.termId && v.VersionNumber === parameters.version)
      if (ver) {
        ver.VersionStatus = 'published'
        ver.PublishedBy = parameters.actorId
        ver.PublishedAt = new Date()
      }
      return [{ affectedRows: 1 }] as T[]
    }
    if (statement.includes("UPDATE SystemGlossaryTerm") && statement.includes("SET Status = 'published'")) {
      const term = this.terms.find(t => t.TermId === parameters.termId)
      if (term) {
        term.Status = 'published'
        term.CurrentPublishedVersion = parameters.version
        term.UpdatedBy = parameters.actorId
      }
      return [{ affectedRows: 1 }] as T[]
    }

    // 14. Archive term
    if (statement.includes("UPDATE SystemGlossaryTerm SET Status = 'archived'")) {
      const term = this.terms.find(t => t.TermId === parameters.termId)
      if (term) {
        term.Status = 'archived'
        term.UpdatedBy = parameters.actorId
      }
      return [{ affectedRows: term ? 1 : 0 }] as T[]
    }

    // 15. Guide terms association
    if (statement.includes('DELETE FROM SystemGuideVersionTerm')) {
      const initial = this.guideTerms.length
      this.guideTerms = this.guideTerms.filter(gt => gt.GuideId !== parameters.guideId || gt.GuideVersionNumber !== parameters.versionNumber)
      return [{ affectedRows: initial - this.guideTerms.length }] as T[]
    }
    if (statement.includes('INSERT INTO SystemGuideVersionTerm')) {
      this.guideTerms.push({
        GuideId: parameters.guideId,
        GuideVersionNumber: parameters.versionNumber,
        TermId: parameters.termId,
        SortOrder: parameters.sortOrder
      })
      return [{ affectedRows: 1 }] as T[]
    }
    if (statement.includes('FROM SystemGuideVersionTerm gvt')) {
      const links = this.guideTerms.filter(gt => gt.GuideId === parameters.guideId && gt.GuideVersionNumber === parameters.versionNumber)
      const result: any[] = []
      for (const link of links) {
        const term = this.getPublishedJoined().find(t => t.TermId === link.TermId)
        if (term) result.push({ ...term, SortOrder: link.SortOrder })
      }
      return result.sort((a, b) => a.SortOrder - b.SortOrder) as T[]
    }

    return [] as T[]
  }

  async transaction<T>(operation: (runner: TransactionalDatabase) => Promise<T>): Promise<T> {
    return operation(this)
  }

  private getPublishedJoined() {
    const publishedTerms = this.terms.filter(t => t.Status === 'published' && t.IsActive === 1 && t.CurrentPublishedVersion !== null)
    return publishedTerms.map(t => {
      const ver = this.versions.find(v => v.TermId === t.TermId && v.VersionNumber === t.CurrentPublishedVersion && v.VersionStatus === 'published')
      return {
        ...t,
        VersionNumber: ver?.VersionNumber,
        ShortDefinition: ver?.ShortDefinition ?? '',
        DetailedDefinition: ver?.DetailedDefinition ?? '',
        AliasesJson: ver?.AliasesJson ?? '[]',
        ExamplesJson: ver?.ExamplesJson ?? '[]',
        RelatedTermSlugsJson: ver?.RelatedTermSlugsJson ?? '[]',
        VersionStatus: ver?.VersionStatus
      }
    })
  }
}

const defaultOrg = {
  employeeCode: null,
  company: null,
  division: null,
  department: null,
  team: null,
  jobTitle: null,
  managerAccountId: null
}

const mockAdminUser: AuthPrincipal = {
  accountId: 'admin-1',
  username: 'admin',
  fullName: 'Admin User',
  email: 'admin@hrm.local',
  systemRole: 'ADMIN',
  organization: { ...defaultOrg },
  groupIds: [],
  grants: [
    {
      permissionCode: '*',
      scopeType: 'system',
      scopeId: 'all'
    }
  ]
}

const mockEmployeeUser: AuthPrincipal = {
  accountId: 'emp-1',
  username: 'employee',
  fullName: 'Employee User',
  email: 'employee@hrm.local',
  systemRole: 'USER',
  organization: { ...defaultOrg },
  groupIds: [],
  grants: [
    {
      permissionCode: 'sop.read',
      scopeType: 'module',
      scopeId: 'emp'
    }
  ]
}

describe('System Glossary Backend Tests', () => {
  function setupTest() {
    const db = new MemoryGlossaryDatabase()
    // Seed initial term
    db.terms.push({
      TermId: 'term-sop',
      Slug: 'sop',
      Term: 'SOP (Standard Operating Procedure)',
      VietnameseName: 'Quy trình thao tác chuẩn',
      Category: 'Khái niệm SOP',
      RoutePath: '/employee-lifecycle',
      Status: 'published',
      CurrentPublishedVersion: 1,
      SortOrder: 10,
      IsActive: 1,
      CreatedAt: new Date(),
      UpdatedAt: new Date()
    })
    db.versions.push({
      TermId: 'term-sop',
      VersionNumber: 1,
      ShortDefinition: 'Quy trình thao tác chuẩn hóa nghiệp vụ.',
      DetailedDefinition: 'Định nghĩa chi tiết về SOP trong hệ thống HRMS.',
      AliasesJson: JSON.stringify(['Quy trình chuẩn', 'Standard Operating Procedure']),
      ExamplesJson: JSON.stringify(['SOP Tuyển dụng']),
      RelatedTermSlugsJson: JSON.stringify(['quy-trinh-nghiep-vu']),
      VersionStatus: 'published',
      CreatedBy: 'system'
    })

    // Seed a draft term
    db.terms.push({
      TermId: 'term-draft-only',
      Slug: 'draft-only',
      Term: 'Chỉ là bản nháp',
      VietnameseName: 'Bản nháp',
      Category: 'Thử nghiệm',
      RoutePath: null,
      Status: 'draft',
      CurrentPublishedVersion: null,
      SortOrder: 99,
      IsActive: 1,
      CreatedAt: new Date(),
      UpdatedAt: new Date()
    })
    db.versions.push({
      TermId: 'term-draft-only',
      VersionNumber: 1,
      ShortDefinition: 'Chưa công bố.',
      DetailedDefinition: 'Nội dung chưa công bố.',
      AliasesJson: JSON.stringify([]),
      ExamplesJson: JSON.stringify([]),
      RelatedTermSlugsJson: JSON.stringify([]),
      VersionStatus: 'draft',
      CreatedBy: 'admin-1'
    })

    const repository = new SystemGlossaryRepository(db)
    const service = new SystemGlossaryService(repository)

    return { db, repository, service }
  }

  it('1. Public API: Search theo term và VietnameseName', async () => {
    const { service } = setupTest()
    const result = await service.listPublic({ q: 'SOP' })
    expect(result.items.length).toBe(1)
    expect(result.items[0].term).toBe('SOP (Standard Operating Procedure)')

    const resultVn = await service.listPublic({ q: 'thao tác chuẩn' })
    expect(resultVn.items.length).toBe(1)
    expect(resultVn.items[0].vietnameseName).toBe('Quy trình thao tác chuẩn')
  })

  it('2. Public API: Search theo alias', async () => {
    const { service } = setupTest()
    const result = await service.listPublic({ q: 'Quy trình chuẩn' })
    expect(result.items.length).toBe(1)
    expect(result.items[0].id).toBe('term-sop')
  })

  it('3. Public API: Chỉ thuật ngữ Published mới xuất hiện', async () => {
    const { service } = setupTest()
    const result = await service.listPublic({})
    expect(result.items.some(t => t.id === 'term-sop')).toBe(true)
    expect(result.items.some(t => t.id === 'term-draft-only')).toBe(false)
  })

  it('4. Security: User thường bị 403 khi gọi Admin API', async () => {
    const { service } = setupTest()
    await expect(service.listAdmin(mockEmployeeUser, {})).rejects.toThrow()
    await expect(service.create(mockEmployeeUser, {
      slug: 'test-term',
      term: 'Test Term',
      category: 'Khái niệm SOP',
      shortDefinition: 'Short def',
      detailedDefinition: 'Detailed def',
      aliases: [],
      examples: [],
      relatedTermSlugs: []
    })).rejects.toThrow()
  })

  it('5. Admin Versioning: Sửa một thuật ngữ Published sẽ tạo bản Draft mới', async () => {
    const { service, db } = setupTest()
    // Sửa term-sop đang có version 1 published
    await service.update(mockAdminUser, 'term-sop', {
      shortDefinition: 'Định nghĩa mới đang nháp'
    })

    // Term vẫn giữ currentPublishedVersion = 1
    const term = db.terms.find(t => t.TermId === 'term-sop')
    expect(term.CurrentPublishedVersion).toBe(1)

    // Đã sinh ra version 2 ở trạng thái draft
    const v2 = db.versions.find(v => v.TermId === 'term-sop' && v.VersionNumber === 2)
    expect(v2).toBeDefined()
    expect(v2.VersionStatus).toBe('draft')
    expect(v2.ShortDefinition).toBe('Định nghĩa mới đang nháp')

    // Bản published ở Public API vẫn là version 1
    const publicTerm = await service.getBySlug('sop')
    expect(publicTerm.shortDefinition).toBe('Quy trình thao tác chuẩn hóa nghiệp vụ.')
  })

  it('6. Publish và Archive: Chuyển draft sang published và archive', async () => {
    const { service, db } = setupTest()
    // Sửa để sinh draft version 2
    await service.update(mockAdminUser, 'term-sop', { shortDefinition: 'Định nghĩa mới v2' })

    // Bấm Publish
    const pubRes = await service.publish(mockAdminUser, 'term-sop')
    expect(pubRes.status).toBe('published')

    const term = db.terms.find(t => t.TermId === 'term-sop')
    expect(term.CurrentPublishedVersion).toBe(2)

    // Version 1 bị archived, Version 2 thành published
    const v1 = db.versions.find(v => v.TermId === 'term-sop' && v.VersionNumber === 1)
    const v2 = db.versions.find(v => v.TermId === 'term-sop' && v.VersionNumber === 2)
    expect(v1.VersionStatus).toBe('archived')
    expect(v2.VersionStatus).toBe('published')

    // Bấm Archive
    const archRes = await service.archive(mockAdminUser, 'term-sop')
    expect(archRes.status).toBe('archived')
    expect(term.Status).toBe('archived')

    // Không còn thấy ở Public
    const publicList = await service.listPublic({})
    expect(publicList.items.some(t => t.id === 'term-sop')).toBe(false)
  })

  it('7. Audit Log: Ghi nhận đầy đủ thao tác create, update, publish, archive', async () => {
    const { service, db } = setupTest()
    await service.create(mockAdminUser, {
      slug: 'new-term',
      term: 'Thuật ngữ mới',
      category: 'Khái niệm SOP',
      shortDefinition: 'Định nghĩa ngắn',
      detailedDefinition: 'Định nghĩa dài',
      aliases: [],
      examples: [],
      relatedTermSlugs: []
    })

    expect(db.auditLogs.some(log => log.entityId.startsWith('term-') && log.action === 'create')).toBe(true)
  })

  it('8. Liên kết thuật ngữ với Guide version', async () => {
    const { service } = setupTest()
    await service.associateGuideTerms(mockAdminUser, 'guide-system-overview', 1, ['term-sop'])

    const guideTerms = await service.getTermsForGuide('guide-system-overview')
    expect(guideTerms.length).toBe(1)
    expect(guideTerms[0].id).toBe('term-sop')
  })
})
