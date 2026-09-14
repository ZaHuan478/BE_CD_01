import type { AuthPrincipal } from '../auth/types.js'
import { conflict, forbidden, notFound } from '../common/errors.js'
import type { SystemGlossaryRepository } from '../repositories/system-glossary.repository.js'
import type {
  CreateGlossaryTermBody,
  GlossarySearchQuery,
  UpdateGlossaryTermBody
} from '../schemas/system-glossary.schemas.js'

export class SystemGlossaryService {
  constructor(private readonly repository: SystemGlossaryRepository) {}

  private isAdmin(principal: AuthPrincipal): boolean {
    return principal.systemRole === 'ADMIN' || principal.systemRole === 'SUPER_ADMIN'
  }

  private assertAdmin(principal: AuthPrincipal): void {
    if (!this.isAdmin(principal)) {
      throw forbidden('Chỉ tài khoản Admin hoặc Super Admin mới có quyền quản lý Từ điển thuật ngữ')
    }
  }

  async listPublic(query: GlossarySearchQuery) {
    return this.repository.listPublished(query)
  }

  async getBySlug(slug: string) {
    const term = await this.repository.getBySlug(slug)
    if (!term) {
      throw notFound('Glossary term', slug)
    }
    return term
  }

  async getTermsForGuide(guideId: string) {
    return this.repository.getTermsForGuide(guideId)
  }

  async listAdmin(principal: AuthPrincipal, filters: { q?: string; category?: string; status?: string }) {
    this.assertAdmin(principal)
    return this.repository.adminList(filters)
  }

  async getAdminById(principal: AuthPrincipal, id: string) {
    this.assertAdmin(principal)
    const result = await this.repository.adminGetById(id)
    if (!result) {
      throw notFound('Glossary term', id)
    }
    return result
  }

  async create(principal: AuthPrincipal, body: CreateGlossaryTermBody) {
    this.assertAdmin(principal)

    const dup = await this.repository.checkDuplicate(body.term, body.slug)
    if (dup.duplicateField === 'slug') {
      throw conflict('SLUG_DUPLICATE', `Mã định danh slug '${body.slug}' đã tồn tại trong hệ thống`)
    }
    if (dup.duplicateField === 'term') {
      throw conflict('TERM_DUPLICATE', `Thuật ngữ '${body.term}' đã tồn tại trong hệ thống`)
    }

    return this.repository.create(body, principal.accountId)
  }

  async update(principal: AuthPrincipal, id: string, body: UpdateGlossaryTermBody) {
    this.assertAdmin(principal)

    if (body.slug || body.term) {
      const dup = await this.repository.checkDuplicate(body.term ?? '', body.slug ?? '', id)
      if (body.slug && dup.duplicateField === 'slug') {
        throw conflict('SLUG_DUPLICATE', `Mã định danh slug '${body.slug}' đã tồn tại trong hệ thống`)
      }
      if (body.term && dup.duplicateField === 'term') {
        throw conflict('TERM_DUPLICATE', `Thuật ngữ '${body.term}' đã tồn tại trong hệ thống`)
      }
    }

    const updated = await this.repository.update(id, body, principal.accountId)
    if (!updated) {
      throw notFound('Glossary term', id)
    }
    return { id, success: true }
  }

  async publish(principal: AuthPrincipal, id: string) {
    this.assertAdmin(principal)
    const published = await this.repository.publish(id, principal.accountId)
    if (!published) {
      throw notFound('Draft glossary term', id)
    }
    return { id, status: 'published' as const }
  }

  async archive(principal: AuthPrincipal, id: string) {
    this.assertAdmin(principal)
    const archived = await this.repository.archive(id, principal.accountId)
    if (!archived) {
      throw notFound('Glossary term', id)
    }
    return { id, status: 'archived' as const }
  }

  async associateGuideTerms(principal: AuthPrincipal, guideId: string, versionNumber: number, termIds: string[]) {
    this.assertAdmin(principal)
    await this.repository.associateTermsToGuide(guideId, versionNumber, termIds, principal.accountId)
    return { guideId, versionNumber, termCount: termIds.length, success: true }
  }
}
