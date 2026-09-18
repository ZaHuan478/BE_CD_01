import type { QueryRunner } from '../database/database.js'

export type SearchResultType = 'sop' | 'document' | 'guidance' | 'term'

export interface SearchResult {
  id: string
  type: SearchResultType
  code: string
  title: string
  excerpt: string
  moduleIds: string[]
  updatedAt: Date | null
}

function modules(value: string | null): string[] {
  return [...new Set(value?.split('|').filter(Boolean) ?? [])]
}

export class SearchRepository {
  constructor(
    private readonly database: QueryRunner,
    private readonly core8 = false
  ) {}

  async search(term: string): Promise<SearchResult[]> {
    const search = `%${term}%`

    if (this.core8) {
      const rows = await this.database.query<{
        DocumentId: string
        Code: string
        Title: string
        DocumentType: string
        Summary: string | null
        UpdatedAt: Date | null
      }>(`
        SELECT d.DocumentId, d.Code, d.Title, d.DocumentType, d.Summary, d.UpdatedAt
        FROM KnowledgeDocument d
        JOIN KnowledgeDocumentVersion v ON v.DocumentId = d.DocumentId AND v.VersionNumber = d.CurrentVersionNumber
        WHERE d.Status = 'published' AND v.Status = 'published'
          AND d.Visibility = 'module' AND d.DocumentType <> 'reference'
          AND (v.EffectiveFrom IS NULL OR v.EffectiveFrom <= UTC_TIMESTAMP(3))
          AND (v.EffectiveTo IS NULL OR v.EffectiveTo > UTC_TIMESTAMP(3))
          AND (d.Title LIKE :search OR d.Code LIKE :search OR d.Summary LIKE :search
               OR CAST(v.ContentJson AS CHAR CHARACTER SET utf8mb4) LIKE :search)
        ORDER BY d.Title
        LIMIT 100
      `, { search })

      let glossaryRows: Array<{ Id: string; Code: string; Title: string; Excerpt: string; UpdatedAt: Date | null }> = []
      try {
        glossaryRows = await this.database.query<{
          Id: string; Code: string; Title: string; Excerpt: string; UpdatedAt: Date | null
        }>(`
          SELECT term.TermId AS Id, term.Slug AS Code, term.Term AS Title,
                 COALESCE(term.VietnameseName, '') AS Excerpt, term.UpdatedAt
          FROM SystemGlossaryTerm term
          WHERE term.Status = 'published' AND term.IsActive = 1
            AND (term.Term LIKE :search OR term.VietnameseName LIKE :search)
          ORDER BY term.Term
          LIMIT 20
        `, { search })
      } catch {
        // SystemGlossaryTerm table may not exist in all environments
      }

      const docIds = rows.map((r) => r.DocumentId)
      const moduleMap = new Map<string, string[]>()
      if (docIds.length > 0) {
        const moduleLinks = await this.database.query<{ DocumentId: string; ModuleId: string }>(`
          SELECT DocumentId, ModuleId
          FROM KnowledgeDocumentModule
          WHERE DocumentId IN (${docIds.map((_, i) => `:id${i}`).join(', ')})
        `, Object.fromEntries(docIds.map((id, i) => [`id${i}`, id])))

        for (const link of moduleLinks) {
          const list = moduleMap.get(link.DocumentId) ?? []
          list.push(link.ModuleId)
          moduleMap.set(link.DocumentId, list)
        }
      }

      const docResults: SearchResult[] = rows.map((row) => {
        let type: SearchResultType = 'sop'
        if (row.DocumentType === 'procedure') type = 'sop'
        else if (row.DocumentType === 'guide') type = 'guidance'
        else if (row.DocumentType === 'glossary') type = 'term'
        else type = 'document'

        return {
          id: row.DocumentId,
          type,
          code: row.Code,
          title: row.Title,
          excerpt: row.Summary || '',
          moduleIds: moduleMap.get(row.DocumentId) ?? (row.DocumentType === 'policy' ? [] : ['common']),
          updatedAt: row.UpdatedAt
        }
      })

      const termResults: SearchResult[] = glossaryRows.map((row) => ({
        id: row.Id,
        type: 'term',
        code: row.Code,
        title: row.Title,
        excerpt: row.Excerpt,
        moduleIds: [],
        updatedAt: row.UpdatedAt
      }))

      return [...docResults, ...termResults]
    }

    const [sops, documents, guidance, terms] = await Promise.all([
      this.database.query<{
        Id: string; Code: string; Title: string; Excerpt: string
        ModuleIds: string | null; UpdatedAt: Date
      }>(`
        SELECT sop.SopId AS Id, sop.SopCode AS Code, sop.Title,
               LEFT(COALESCE(version.Definition, version.Purpose, sop.Category, ''), 500) AS Excerpt,
               GROUP_CONCAT(DISTINCT link.ModuleId SEPARATOR '|') AS ModuleIds,
               version.UpdatedAt
        FROM Sop sop
        INNER JOIN SopVersion version ON version.SopVersionId = sop.CurrentPublishedVersionId
        INNER JOIN SopModule link ON link.SopId = sop.SopId
        WHERE sop.Title LIKE :search OR sop.SopCode LIKE :search
          OR sop.Category LIKE :search OR version.Definition LIKE :search
          OR version.Purpose LIKE :search OR version.Scope LIKE :search
        GROUP BY sop.SopId, sop.SopCode, sop.Title, version.Definition,
                 version.Purpose, sop.Category, version.UpdatedAt
        ORDER BY sop.Title LIMIT 100
      `, { search }),
      this.database.query<{
        Id: string; Code: string; Title: string; Excerpt: string
        ModuleIds: string | null
      }>(`
        SELECT documentRow.DocumentId AS Id, documentRow.DocumentCode AS Code,
               documentRow.Title, '' AS Excerpt,
               GROUP_CONCAT(DISTINCT moduleLink.ModuleId SEPARATOR '|') AS ModuleIds
        FROM Document documentRow
        INNER JOIN DocumentLink documentLink ON documentLink.DocumentId = documentRow.DocumentId
        INNER JOIN SopModule moduleLink ON moduleLink.SopId = documentLink.SopId
        WHERE documentRow.Title LIKE :search OR documentRow.DocumentCode LIKE :search
        GROUP BY documentRow.DocumentId, documentRow.DocumentCode, documentRow.Title
        ORDER BY documentRow.Title LIMIT 100
      `, { search }),
      this.database.query<{
        Id: string; Code: string; Title: string; Excerpt: string
        ModuleIds: string | null; UpdatedAt: Date
      }>(`
        SELECT article.GuidanceArticleId AS Id, article.ArticleCode AS Code, article.Title,
               LEFT(article.Content, 500) AS Excerpt,
               GROUP_CONCAT(DISTINCT COALESCE(article.ModuleId, sopLink.ModuleId) SEPARATOR '|') AS ModuleIds,
               article.UpdatedAt
        FROM GuidanceArticle article
        LEFT JOIN SopModule sopLink ON sopLink.SopId = article.SopId
        WHERE article.Status = 'published'
          AND (article.Title LIKE :search OR article.Content LIKE :search OR article.ArticleCode LIKE :search)
        GROUP BY article.GuidanceArticleId, article.ArticleCode, article.Title, article.Content, article.UpdatedAt
        ORDER BY article.Title LIMIT 100
      `, { search }),
      this.database.query<{
        Id: string; Code: string; Title: string; Excerpt: string
        ModuleIds: string | null; UpdatedAt: Date
      }>(`
        SELECT term.GlossaryTermId AS Id, term.GlossaryTermId AS Code, term.Term AS Title,
               LEFT(term.Definition, 500) AS Excerpt, term.ModuleId AS ModuleIds, term.UpdatedAt
        FROM GlossaryTerm term
        WHERE term.Status = 'published'
          AND (term.Term LIKE :search OR term.Definition LIKE :search OR term.AliasesJson LIKE :search)
        ORDER BY term.Term LIMIT 100
      `, { search })
    ])

    return [
      ...sops.map((row) => ({ ...row, type: 'sop' as const })),
      ...documents.map((row) => ({ ...row, type: 'document' as const, UpdatedAt: null })),
      ...guidance.map((row) => ({ ...row, type: 'guidance' as const })),
      ...terms.map((row) => ({ ...row, type: 'term' as const }))
    ].map((row) => ({
      id: row.Id,
      type: row.type,
      code: row.Code,
      title: row.Title,
      excerpt: row.Excerpt,
      moduleIds: modules(row.ModuleIds),
      updatedAt: row.UpdatedAt
    }))
  }
}
