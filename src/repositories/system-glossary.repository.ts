import { randomUUID } from 'node:crypto'
import type { ResultSetHeader } from 'mysql2'
import type { DatabaseParameters, QueryRunner, TransactionalDatabase } from '../database/database.js'
import type {
  CreateGlossaryTermBody,
  GlossarySearchQuery,
  UpdateGlossaryTermBody
} from '../schemas/system-glossary.schemas.js'

export interface GlossaryTermEntity {
  id: string
  slug: string
  term: string
  vietnameseName: string | null
  category: string
  routePath: string | null
  status: 'draft' | 'published' | 'archived'
  currentPublishedVersion: number | null
  sortOrder: number
  isActive: boolean
  shortDefinition?: string
  detailedDefinition?: string
  aliases?: string[]
  examples?: string[]
  relatedTermSlugs?: string[]
  relatedTerms?: Array<{ id: string; slug: string; term: string; vietnameseName: string | null; shortDefinition: string }>
  versionNumber?: number
  versionStatus?: 'draft' | 'published' | 'archived'
  hasDraftVersion?: boolean
  createdAt: Date | string
  updatedAt: Date | string
}

interface GlossaryRow {
  TermId: string
  Slug: string
  Term: string
  VietnameseName: string | null
  Category: string
  RoutePath: string | null
  Status: 'draft' | 'published' | 'archived'
  CurrentPublishedVersion: number | null
  SortOrder: number
  IsActive: number | boolean
  VersionNumber?: number
  ShortDefinition?: string
  DetailedDefinition?: string
  AliasesJson?: string
  ExamplesJson?: string
  RelatedTermSlugsJson?: string
  VersionStatus?: 'draft' | 'published' | 'archived'
  HasDraftVersion?: number
  CreatedAt: Date | string
  UpdatedAt: Date | string
}

function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback
  try { return JSON.parse(value) as T } catch { return fallback }
}

export class SystemGlossaryRepository {
  constructor(private readonly database: TransactionalDatabase) {}

  private basePublishedSelect() {
    return `SELECT term.TermId, term.Slug, term.Term, term.VietnameseName, term.Category,
      term.RoutePath, term.Status, term.CurrentPublishedVersion, term.SortOrder, term.IsActive,
      term.CreatedAt, term.UpdatedAt,
      versionRow.VersionNumber, versionRow.ShortDefinition, versionRow.DetailedDefinition,
      versionRow.AliasesJson, versionRow.ExamplesJson, versionRow.RelatedTermSlugsJson,
      versionRow.VersionStatus
      FROM SystemGlossaryTerm term
      JOIN SystemGlossaryTermVersion versionRow
        ON versionRow.TermId = term.TermId
        AND versionRow.VersionNumber = term.CurrentPublishedVersion
        AND versionRow.VersionStatus = 'published'`
  }

  async listPublished(filters: GlossarySearchQuery): Promise<{ items: GlossaryTermEntity[]; total: number; page: number; limit: number }> {
    const conditions: string[] = ["term.Status = 'published'", 'term.IsActive = 1']
    const params: DatabaseParameters = {}

    if (filters.category && filters.category.trim()) {
      conditions.push('term.Category = :category')
      params.category = filters.category.trim()
    }

    if (filters.letter && filters.letter.trim()) {
      const char = filters.letter.trim()
      conditions.push('(term.Term LIKE :letterPattern OR term.VietnameseName LIKE :letterPattern)')
      params.letterPattern = `${char}%`
    }

    if (filters.q && filters.q.trim()) {
      const search = filters.q.trim()
      conditions.push(`(
        term.Term LIKE :likeQ
        OR term.VietnameseName LIKE :likeQ
        OR versionRow.ShortDefinition LIKE :likeQ
        OR versionRow.DetailedDefinition LIKE :likeQ
        OR versionRow.AliasesJson LIKE :likeQ
      )`)
      params.likeQ = `%${search}%`
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''

    const countSql = `SELECT COUNT(*) AS total
      FROM SystemGlossaryTerm term
      JOIN SystemGlossaryTermVersion versionRow
        ON versionRow.TermId = term.TermId
        AND versionRow.VersionNumber = term.CurrentPublishedVersion
        AND versionRow.VersionStatus = 'published'
      ${whereClause}`

    const countRows = await this.database.query<{ total: number }>(countSql, params)
    const total = Number(countRows[0]?.total ?? 0)

    const page = Math.max(1, filters.page ?? 1)
    const limit = Math.max(1, Math.min(100, filters.limit ?? 50))
    const offset = (page - 1) * limit

    const selectSql = `${this.basePublishedSelect()}
      ${whereClause}
      ORDER BY term.SortOrder ASC, term.Term ASC
      LIMIT ${limit} OFFSET ${offset}`

    const rows = await this.database.query<GlossaryRow>(selectSql, params)
    const items = rows.map(r => this.mapRow(r))

    return { items, total, page, limit }
  }

  async getBySlug(slug: string): Promise<GlossaryTermEntity | null> {
    const sql = `${this.basePublishedSelect()}
      WHERE (term.Slug = :slug OR term.TermId = :slug) AND term.Status = 'published' AND term.IsActive = 1
      LIMIT 1`
    const [row] = await this.database.query<GlossaryRow>(sql, { slug })
    if (!row) return null

    const term = this.mapRow(row)

    if (term.relatedTermSlugs && term.relatedTermSlugs.length > 0) {
      term.relatedTerms = await this.resolveRelatedTerms(term.relatedTermSlugs)
    } else {
      term.relatedTerms = []
    }

    return term
  }

  private async resolveRelatedTerms(slugs: string[]): Promise<Array<{ id: string; slug: string; term: string; vietnameseName: string | null; shortDefinition: string }>> {
    if (slugs.length === 0) return []
    // Safe lookup by matching slugs or TermIds
    const results: Array<{ id: string; slug: string; term: string; vietnameseName: string | null; shortDefinition: string }> = []
    for (const slug of slugs) {
      const [r] = await this.database.query<GlossaryRow>(
        `SELECT term.TermId, term.Slug, term.Term, term.VietnameseName, versionRow.ShortDefinition
         FROM SystemGlossaryTerm term
         JOIN SystemGlossaryTermVersion versionRow
           ON versionRow.TermId = term.TermId
           AND versionRow.VersionNumber = term.CurrentPublishedVersion
         WHERE (term.Slug = :slug OR term.TermId = :slug) AND term.Status = 'published'
         LIMIT 1`,
        { slug }
      )
      if (r) {
        results.push({
          id: r.TermId,
          slug: r.Slug,
          term: r.Term,
          vietnameseName: r.VietnameseName,
          shortDefinition: r.ShortDefinition ?? ''
        })
      }
    }
    return results
  }

  async adminList(filters: { q?: string; category?: string; status?: string }): Promise<GlossaryTermEntity[]> {
    const conditions: string[] = []
    const params: DatabaseParameters = {}

    if (filters.category && filters.category.trim()) {
      conditions.push('term.Category = :category')
      params.category = filters.category.trim()
    }

    if (filters.status && filters.status.trim()) {
      conditions.push('term.Status = :status')
      params.status = filters.status.trim()
    }

    if (filters.q && filters.q.trim()) {
      conditions.push('(term.Term LIKE :likeQ OR term.VietnameseName LIKE :likeQ OR term.Slug LIKE :likeQ)')
      params.likeQ = `%${filters.q.trim()}%`
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''

    const sql = `SELECT term.TermId, term.Slug, term.Term, term.VietnameseName, term.Category,
      term.RoutePath, term.Status, term.CurrentPublishedVersion, term.SortOrder, term.IsActive,
      term.CreatedAt, term.UpdatedAt,
      latestVersion.VersionNumber, latestVersion.ShortDefinition, latestVersion.DetailedDefinition,
      latestVersion.AliasesJson, latestVersion.ExamplesJson, latestVersion.RelatedTermSlugsJson,
      latestVersion.VersionStatus,
      (SELECT COUNT(*) FROM SystemGlossaryTermVersion dv WHERE dv.TermId = term.TermId AND dv.VersionStatus = 'draft') AS HasDraftVersion
      FROM SystemGlossaryTerm term
      LEFT JOIN SystemGlossaryTermVersion latestVersion
        ON latestVersion.TermId = term.TermId
        AND latestVersion.VersionNumber = (
          SELECT MAX(v.VersionNumber) FROM SystemGlossaryTermVersion v WHERE v.TermId = term.TermId
        )
      ${whereClause}
      ORDER BY term.SortOrder ASC, term.CreatedAt DESC`

    const rows = await this.database.query<GlossaryRow>(sql, params)
    return rows.map(r => this.mapRow(r))
  }

  async adminGetById(id: string): Promise<{ term: GlossaryTermEntity; draftVersion?: GlossaryTermEntity; publishedVersion?: GlossaryTermEntity } | null> {
    const [termRow] = await this.database.query<GlossaryRow>(
      `SELECT term.TermId, term.Slug, term.Term, term.VietnameseName, term.Category,
        term.RoutePath, term.Status, term.CurrentPublishedVersion, term.SortOrder, term.IsActive,
        term.CreatedAt, term.UpdatedAt
       FROM SystemGlossaryTerm term
       WHERE term.TermId = :id OR term.Slug = :id
       LIMIT 1`,
      { id }
    )
    if (!termRow) return null

    const term = this.mapRow(termRow)

    const versions = await this.database.query<GlossaryRow>(
      `SELECT VersionNumber, ShortDefinition, DetailedDefinition, AliasesJson, ExamplesJson, RelatedTermSlugsJson, VersionStatus, CreatedAt
       FROM SystemGlossaryTermVersion
       WHERE TermId = :termId
       ORDER BY VersionNumber DESC`,
      { termId: term.id }
    )

    let draftVersion: GlossaryTermEntity | undefined
    let publishedVersion: GlossaryTermEntity | undefined

    for (const v of versions) {
      const vEntity = {
        ...term,
        versionNumber: v.VersionNumber,
        shortDefinition: v.ShortDefinition,
        detailedDefinition: v.DetailedDefinition,
        aliases: parseJson<string[]>(v.AliasesJson, []),
        examples: parseJson<string[]>(v.ExamplesJson, []),
        relatedTermSlugs: parseJson<string[]>(v.RelatedTermSlugsJson, []),
        versionStatus: v.VersionStatus
      }
      if (v.VersionStatus === 'draft' && !draftVersion) {
        draftVersion = vEntity
      }
      if (v.VersionStatus === 'published' && !publishedVersion && v.VersionNumber === term.currentPublishedVersion) {
        publishedVersion = vEntity
      }
    }

    return { term, draftVersion, publishedVersion }
  }

  async create(body: CreateGlossaryTermBody, actorId: string): Promise<GlossaryTermEntity> {
    return this.database.transaction(async runner => {
      const termId = `term-${randomUUID().slice(0, 12)}`

      await runner.query(
        `INSERT INTO SystemGlossaryTerm
        (TermId, Slug, Term, VietnameseName, Category, RoutePath, Status, CurrentPublishedVersion, SortOrder, IsActive, CreatedBy, UpdatedBy)
        VALUES (:termId, :slug, :term, :vietnameseName, :category, :routePath, 'draft', NULL, :sortOrder, 1, :actorId, :actorId)`,
        {
          termId,
          slug: body.slug,
          term: body.term,
          vietnameseName: body.vietnameseName ?? null,
          category: body.category,
          routePath: body.routePath ?? null,
          sortOrder: body.sortOrder ?? 0,
          actorId
        }
      )

      await runner.query(
        `INSERT INTO SystemGlossaryTermVersion
        (TermId, VersionNumber, ShortDefinition, DetailedDefinition, AliasesJson, ExamplesJson, RelatedTermSlugsJson, VersionStatus, CreatedBy)
        VALUES (:termId, 1, :shortDefinition, :detailedDefinition, :aliasesJson, :examplesJson, :relatedTermSlugsJson, 'draft', :actorId)`,
        {
          termId,
          shortDefinition: body.shortDefinition,
          detailedDefinition: body.detailedDefinition,
          aliasesJson: JSON.stringify(body.aliases ?? []),
          examplesJson: JSON.stringify(body.examples ?? []),
          relatedTermSlugsJson: JSON.stringify(body.relatedTermSlugs ?? []),
          actorId
        }
      )

      await this.audit(runner, termId, 'create', actorId, null, body)

      return {
        id: termId,
        slug: body.slug,
        term: body.term,
        vietnameseName: body.vietnameseName ?? null,
        category: body.category,
        routePath: body.routePath ?? null,
        status: 'draft',
        currentPublishedVersion: null,
        sortOrder: body.sortOrder ?? 0,
        isActive: true,
        shortDefinition: body.shortDefinition,
        detailedDefinition: body.detailedDefinition,
        aliases: body.aliases ?? [],
        examples: body.examples ?? [],
        relatedTermSlugs: body.relatedTermSlugs ?? [],
        versionNumber: 1,
        versionStatus: 'draft',
        createdAt: new Date(),
        updatedAt: new Date()
      }
    })
  }

  async update(termId: string, body: UpdateGlossaryTermBody, actorId: string): Promise<boolean> {
    return this.database.transaction(async runner => {
      const [existing] = await runner.query<GlossaryRow>(
        `SELECT term.TermId, term.Slug, term.Term, term.VietnameseName, term.Category,
          term.RoutePath, term.Status, term.CurrentPublishedVersion, term.SortOrder, term.IsActive,
          term.CreatedAt, term.UpdatedAt
         FROM SystemGlossaryTerm term
         WHERE term.TermId = :termId`,
        { termId }
      )
      if (!existing) return false

      // Update term metadata
      const slug = body.slug ?? existing.Slug
      const term = body.term ?? existing.Term
      const vietnameseName = body.vietnameseName !== undefined ? body.vietnameseName : existing.VietnameseName
      const category = body.category ?? existing.Category
      const routePath = body.routePath !== undefined ? body.routePath : existing.RoutePath
      const sortOrder = body.sortOrder ?? existing.SortOrder ?? 0

      await runner.query(
        `UPDATE SystemGlossaryTerm
         SET Slug = :slug, Term = :term, VietnameseName = :vietnameseName, Category = :category,
             RoutePath = :routePath, SortOrder = :sortOrder, UpdatedBy = :actorId
         WHERE TermId = :termId`,
        { termId, slug, term, vietnameseName, category, routePath, sortOrder, actorId }
      )

      // Versioning for content fields
      const hasContentChange =
        body.shortDefinition !== undefined ||
        body.detailedDefinition !== undefined ||
        body.aliases !== undefined ||
        body.examples !== undefined ||
        body.relatedTermSlugs !== undefined

      if (hasContentChange) {
        const [draft] = await runner.query<GlossaryRow>(
          `SELECT VersionNumber, ShortDefinition, DetailedDefinition, AliasesJson, ExamplesJson, RelatedTermSlugsJson
           FROM SystemGlossaryTermVersion
           WHERE TermId = :termId AND VersionStatus = 'draft'
           ORDER BY VersionNumber DESC LIMIT 1`,
          { termId }
        )

        if (draft) {
          // Update existing draft
          const shortDef = body.shortDefinition ?? draft.ShortDefinition ?? ''
          const detailedDef = body.detailedDefinition ?? draft.DetailedDefinition ?? ''
          const aliases = body.aliases ? JSON.stringify(body.aliases) : (draft.AliasesJson ?? '[]')
          const examples = body.examples ? JSON.stringify(body.examples) : (draft.ExamplesJson ?? '[]')
          const related = body.relatedTermSlugs ? JSON.stringify(body.relatedTermSlugs) : (draft.RelatedTermSlugsJson ?? '[]')

          await runner.query(
            `UPDATE SystemGlossaryTermVersion
             SET ShortDefinition = :shortDef, DetailedDefinition = :detailedDef,
                 AliasesJson = :aliases, ExamplesJson = :examples, RelatedTermSlugsJson = :related
             WHERE TermId = :termId AND VersionNumber = :version`,
            { termId, version: draft.VersionNumber ?? 1, shortDef, detailedDef, aliases, examples, related }
          )
        } else {
          // Copy-on-write: Create new draft version
          const [maxV] = await runner.query<{ MaxV: number }>(
            `SELECT MAX(VersionNumber) as MaxV FROM SystemGlossaryTermVersion WHERE TermId = :termId`,
            { termId }
          )
          const nextVersion = (maxV?.MaxV ?? (existing.CurrentPublishedVersion ?? 0)) + 1

          // Get last published content as baseline if any
          const [lastPublished] = await runner.query<GlossaryRow>(
            `SELECT ShortDefinition, DetailedDefinition, AliasesJson, ExamplesJson, RelatedTermSlugsJson
             FROM SystemGlossaryTermVersion
             WHERE TermId = :termId AND VersionNumber = :currentVersion`,
            { termId, currentVersion: existing.CurrentPublishedVersion ?? 1 }
          )

          const shortDef = body.shortDefinition ?? lastPublished?.ShortDefinition ?? ''
          const detailedDef = body.detailedDefinition ?? lastPublished?.DetailedDefinition ?? ''
          const aliases = body.aliases ? JSON.stringify(body.aliases) : (lastPublished?.AliasesJson ?? '[]')
          const examples = body.examples ? JSON.stringify(body.examples) : (lastPublished?.ExamplesJson ?? '[]')
          const related = body.relatedTermSlugs ? JSON.stringify(body.relatedTermSlugs) : (lastPublished?.RelatedTermSlugsJson ?? '[]')

          await runner.query(
            `INSERT INTO SystemGlossaryTermVersion
            (TermId, VersionNumber, ShortDefinition, DetailedDefinition, AliasesJson, ExamplesJson, RelatedTermSlugsJson, VersionStatus, CreatedBy)
            VALUES (:termId, :version, :shortDef, :detailedDef, :aliases, :examples, :related, 'draft', :actorId)`,
            { termId, version: nextVersion, shortDef, detailedDef, aliases, examples, related, actorId }
          )
        }
      }

      await this.audit(runner, termId, 'update', actorId, existing, body)
      return true
    })
  }

  async publish(termId: string, actorId: string): Promise<boolean> {
    return this.database.transaction(async runner => {
      const [draft] = await runner.query<{ VersionNumber: number }>(
        `SELECT VersionNumber FROM SystemGlossaryTermVersion
         WHERE TermId = :termId AND VersionStatus = 'draft'
         ORDER BY VersionNumber DESC LIMIT 1`,
        { termId }
      )
      if (!draft) return false

      // Archive previous published versions
      await runner.query(
        `UPDATE SystemGlossaryTermVersion SET VersionStatus = 'archived'
         WHERE TermId = :termId AND VersionStatus = 'published'`,
        { termId }
      )

      // Promote draft to published
      await runner.query(
        `UPDATE SystemGlossaryTermVersion
         SET VersionStatus = 'published', PublishedBy = :actorId, PublishedAt = CURRENT_TIMESTAMP(3)
         WHERE TermId = :termId AND VersionNumber = :version`,
        { termId, version: draft.VersionNumber, actorId }
      )

      // Update main term
      await runner.query(
        `UPDATE SystemGlossaryTerm
         SET Status = 'published', CurrentPublishedVersion = :version, UpdatedBy = :actorId
         WHERE TermId = :termId`,
        { termId, version: draft.VersionNumber, actorId }
      )

      await this.audit(runner, termId, 'publish', actorId, null, { version: draft.VersionNumber })
      return true
    })
  }

  async archive(termId: string, actorId: string): Promise<boolean> {
    const [result] = await this.database.query<ResultSetHeader & object>(
      `UPDATE SystemGlossaryTerm SET Status = 'archived', UpdatedBy = :actorId
       WHERE TermId = :termId`,
      { termId, actorId }
    )
    if (!result || result.affectedRows === 0) return false

    await this.audit(this.database, termId, 'archive', actorId, null, null)
    return true
  }

  async getTermsForGuide(guideId: string, versionNumber = 1): Promise<GlossaryTermEntity[]> {
    const sql = `SELECT term.TermId, term.Slug, term.Term, term.VietnameseName, term.Category,
      term.RoutePath, term.Status, term.CurrentPublishedVersion, term.SortOrder, term.IsActive,
      term.CreatedAt, term.UpdatedAt,
      versionRow.VersionNumber, versionRow.ShortDefinition, versionRow.DetailedDefinition,
      versionRow.AliasesJson, versionRow.ExamplesJson, versionRow.RelatedTermSlugsJson,
      versionRow.VersionStatus
      FROM SystemGuideVersionTerm gvt
      JOIN SystemGlossaryTerm term ON term.TermId = gvt.TermId
      JOIN SystemGlossaryTermVersion versionRow
        ON versionRow.TermId = term.TermId
        AND versionRow.VersionNumber = term.CurrentPublishedVersion
        AND versionRow.VersionStatus = 'published'
      WHERE gvt.GuideId = :guideId AND gvt.GuideVersionNumber = :versionNumber AND term.Status = 'published'
      ORDER BY gvt.SortOrder ASC, term.SortOrder ASC`

    const rows = await this.database.query<GlossaryRow>(sql, { guideId, versionNumber })
    return rows.map(r => this.mapRow(r))
  }

  async associateTermsToGuide(guideId: string, versionNumber: number, termIds: string[], actorId: string): Promise<void> {
    await this.database.transaction(async runner => {
      await runner.query(
        `DELETE FROM SystemGuideVersionTerm WHERE GuideId = :guideId AND GuideVersionNumber = :versionNumber`,
        { guideId, versionNumber }
      )

      let sortOrder = 10
      for (const termId of termIds) {
        await runner.query(
          `INSERT INTO SystemGuideVersionTerm (GuideId, GuideVersionNumber, TermId, SortOrder)
           VALUES (:guideId, :versionNumber, :termId, :sortOrder)`,
          { guideId, versionNumber, termId, sortOrder }
        )
        sortOrder += 10
      }

      await this.audit(runner, guideId, 'associate-terms', actorId, null, { termIds, versionNumber })
    })
  }

  async checkDuplicate(term: string, slug: string, excludeId?: string): Promise<{ duplicateField: 'slug' | 'term' | null }> {
    const slugParams: DatabaseParameters = { slug }
    if (excludeId) slugParams.excludeId = excludeId
    const [bySlug] = await this.database.query<{ TermId: string }>(
      `SELECT TermId FROM SystemGlossaryTerm WHERE Slug = :slug ${excludeId ? 'AND TermId != :excludeId' : ''} LIMIT 1`,
      slugParams
    )
    if (bySlug) return { duplicateField: 'slug' }

    const termParams: DatabaseParameters = { term }
    if (excludeId) termParams.excludeId = excludeId
    const [byTerm] = await this.database.query<{ TermId: string }>(
      `SELECT TermId FROM SystemGlossaryTerm WHERE LOWER(Term) = LOWER(:term) ${excludeId ? 'AND TermId != :excludeId' : ''} LIMIT 1`,
      termParams
    )
    if (byTerm) return { duplicateField: 'term' }

    return { duplicateField: null }
  }

  private mapRow(row: GlossaryRow): GlossaryTermEntity {
    return {
      id: row.TermId,
      slug: row.Slug,
      term: row.Term,
      vietnameseName: row.VietnameseName,
      category: row.Category,
      routePath: row.RoutePath,
      status: row.Status,
      currentPublishedVersion: row.CurrentPublishedVersion ? Number(row.CurrentPublishedVersion) : null,
      sortOrder: Number(row.SortOrder ?? 0),
      isActive: Boolean(row.IsActive),
      versionNumber: row.VersionNumber ? Number(row.VersionNumber) : undefined,
      shortDefinition: row.ShortDefinition,
      detailedDefinition: row.DetailedDefinition,
      aliases: parseJson<string[]>(row.AliasesJson, []),
      examples: parseJson<string[]>(row.ExamplesJson, []),
      relatedTermSlugs: parseJson<string[]>(row.RelatedTermSlugsJson, []),
      versionStatus: row.VersionStatus,
      hasDraftVersion: Boolean(row.HasDraftVersion),
      createdAt: row.CreatedAt,
      updatedAt: row.UpdatedAt
    }
  }

  private audit(runner: QueryRunner, entityId: string, action: string, actorId: string, before: unknown, after: unknown) {
    return runner.query(
      `INSERT INTO AuditLog (EntityType, EntityId, Action, ActorAccountId, BeforeJson, AfterJson)
       VALUES ('system-glossary', :entityId, :action, :actorId, :before, :after)`,
      {
        entityId,
        action,
        actorId,
        before: before === null ? null : JSON.stringify(before),
        after: after === null ? null : JSON.stringify(after)
      }
    )
  }
}
