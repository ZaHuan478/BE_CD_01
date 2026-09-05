import { conflict } from '../common/errors.js'
import { createId } from '../common/ids.js'
import type { TransactionalDatabase } from '../database/database.js'
import type { CreateDocumentBody, CreateGuidanceBody, CreateTermBody, KnowledgeQuery } from '../schemas/knowledge.schemas.js'

function parseJson<T>(value: string | null, fallback: T): T {
  if (!value) return fallback
  try { return JSON.parse(value) as T } catch { return fallback }
}

export class KnowledgeRepository {
  constructor(private readonly database: TransactionalDatabase) {}

  async listDocuments(filters: KnowledgeQuery) {
    const conditions: string[] = []
    const parameters: Record<string, string> = {}
    if (filters.sopId) {
      conditions.push('EXISTS (SELECT 1 FROM DocumentLink filterLink WHERE filterLink.DocumentId = documentRow.DocumentId AND filterLink.SopId = :sopId)')
      parameters.sopId = filters.sopId
    }
    if (filters.search) {
      conditions.push('(documentRow.Title LIKE :search OR documentRow.DocumentCode LIKE :search)')
      parameters.search = `%${filters.search}%`
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
    const rows = await this.database.query<{
      DocumentId: string; DocumentCode: string; Title: string; AssetUrl: string | null
      MediaType: string | null; Checksum: string | null; MetadataJson: string | null
      SopIds: string | null; ModuleIds: string | null
    }>(`
      SELECT documentRow.DocumentId, documentRow.DocumentCode, documentRow.Title,
             documentRow.AssetUrl, documentRow.MediaType, documentRow.Checksum, documentRow.MetadataJson,
             (SELECT GROUP_CONCAT(link.SopId SEPARATOR '|') FROM DocumentLink link WHERE link.DocumentId = documentRow.DocumentId) AS SopIds,
             (SELECT GROUP_CONCAT(moduleLink.ModuleId SEPARATOR '|')
                FROM DocumentLink link
                INNER JOIN SopModule moduleLink ON moduleLink.SopId = link.SopId
                WHERE link.DocumentId = documentRow.DocumentId) AS ModuleIds
      FROM Document documentRow
      ${where}
      ORDER BY documentRow.Title
    `, parameters)
    return rows.map((row) => ({
      id: row.DocumentId,
      code: row.DocumentCode,
      title: row.Title,
      assetUrl: row.AssetUrl,
      mediaType: row.MediaType,
      checksum: row.Checksum,
      metadata: parseJson<Record<string, unknown> | null>(row.MetadataJson, null),
      sopIds: [...new Set(row.SopIds?.split('|').filter(Boolean) ?? [])],
      moduleIds: [...new Set(row.ModuleIds?.split('|').filter(Boolean) ?? [])]
    }))
  }

  async createDocument(body: CreateDocumentBody, actorAccountId: string) {
    const documentId = createId('doc')
    await this.database.transaction(async (runner) => {
      for (const link of body.links) {
        if (link.stepId && !link.versionId) {
          throw conflict('DOCUMENT_LINK_INVALID', 'versionId is required when stepId is provided')
        }
        const valid = await runner.query<{ SopId: string }>(`
          SELECT s.SopId
          FROM Sop s
          WHERE s.SopId = :sopId
            AND (:versionId IS NULL OR EXISTS (
              SELECT 1 FROM SopVersion v WHERE v.SopVersionId = :versionId AND v.SopId = s.SopId
            ))
            AND (:stepId IS NULL OR EXISTS (
              SELECT 1 FROM SopStep stepRow
              WHERE stepRow.SopStepId = :stepId AND stepRow.SopVersionId = :versionId
            ))
        `, { sopId: link.sopId, versionId: link.versionId ?? null, stepId: link.stepId ?? null })
        if (!valid[0]) throw conflict('DOCUMENT_LINK_INVALID', 'A document link does not match its SOP/version/step')
      }
      await runner.query(`
        INSERT INTO Document (DocumentId, DocumentCode, Title, AssetUrl, MediaType, Checksum, MetadataJson)
        VALUES (:documentId, :code, :title, :assetUrl, :mediaType, :checksum, :metadataJson)
      `, {
        documentId,
        code: body.code,
        title: body.title,
        assetUrl: body.assetUrl ?? null,
        mediaType: body.mediaType ?? null,
        checksum: body.checksum ?? null,
        metadataJson: body.metadata ? JSON.stringify(body.metadata) : null
      })
      for (const link of body.links) {
        await runner.query(`
          INSERT INTO DocumentLink (
            DocumentLinkId, DocumentId, SopId, SopVersionId, SopStepId, LinkKind, SortOrder
          ) VALUES (
            :linkId, :documentId, :sopId, :versionId, :stepId, :kind, :sortOrder
          )
        `, {
          linkId: createId('doclink'),
          documentId,
          sopId: link.sopId,
          versionId: link.versionId ?? null,
          stepId: link.stepId ?? null,
          kind: link.kind ?? 'reference',
          sortOrder: link.sortOrder ?? 0
        })
      }
      await runner.query(`
        INSERT INTO AuditLog (EntityType, EntityId, Action, ActorAccountId, AfterJson)
        VALUES ('document', :documentId, 'create', :actorAccountId, :afterJson)
      `, { documentId, actorAccountId, afterJson: JSON.stringify({ code: body.code, links: body.links }) })
    })
    return (await this.listDocuments({})).find((item) => item.id === documentId)
  }

  async listTerms(filters: KnowledgeQuery) {
    const conditions = filters.includeDrafts ? ["Status <> 'archived'"] : ["Status = 'published'"]
    const parameters: Record<string, string> = {}
    if (filters.moduleId) { conditions.push('ModuleId = :moduleId'); parameters.moduleId = filters.moduleId }
    if (filters.search) { conditions.push('(Term LIKE :search OR Definition LIKE :search)'); parameters.search = `%${filters.search}%` }
    const rows = await this.database.query<{
      GlossaryTermId: string; Term: string; Definition: string; AliasesJson: string | null
      ModuleId: string | null; Status: string; UpdatedAt: Date
    }>(`
      SELECT GlossaryTermId, Term, Definition, AliasesJson, ModuleId, Status, UpdatedAt
      FROM GlossaryTerm WHERE ${conditions.join(' AND ')} ORDER BY Term
    `, parameters)
    return rows.map((row) => ({
      id: row.GlossaryTermId, term: row.Term, definition: row.Definition,
      aliases: parseJson<string[]>(row.AliasesJson, []), moduleId: row.ModuleId,
      status: row.Status, updatedAt: row.UpdatedAt
    }))
  }

  async createTerm(body: CreateTermBody, actorAccountId: string) {
    const id = createId('term')
    await this.database.transaction(async (runner) => {
      await runner.query(`
        INSERT INTO GlossaryTerm (GlossaryTermId, Term, Definition, AliasesJson, ModuleId, Status)
        VALUES (:id, :term, :definition, :aliases, :moduleId, :status)
      `, {
        id, term: body.term, definition: body.definition,
        aliases: body.aliases ? JSON.stringify(body.aliases) : null,
        moduleId: body.moduleId ?? null, status: body.status ?? 'draft'
      })
      await runner.query(`
        INSERT INTO AuditLog (EntityType, EntityId, Action, ActorAccountId, AfterJson)
        VALUES ('glossary-term', :id, 'create', :actorAccountId, :afterJson)
      `, { id, actorAccountId, afterJson: JSON.stringify({ term: body.term, moduleId: body.moduleId ?? null }) })
    })
    return (await this.listTerms({ includeDrafts: true })).find((item) => item.id === id)
  }

  async listGuidance(filters: KnowledgeQuery) {
    const conditions = filters.includeDrafts ? ["Status <> 'archived'"] : ["Status = 'published'"]
    const parameters: Record<string, string> = {}
    if (filters.moduleId) { conditions.push('ModuleId = :moduleId'); parameters.moduleId = filters.moduleId }
    if (filters.sopId) { conditions.push('SopId = :sopId'); parameters.sopId = filters.sopId }
    if (filters.search) { conditions.push('(Title LIKE :search OR Content LIKE :search)'); parameters.search = `%${filters.search}%` }
    const rows = await this.database.query<{
      GuidanceArticleId: string; ArticleCode: string; Title: string; Content: string
      ModuleId: string | null; SopId: string | null; Status: string; MetadataJson: string | null; UpdatedAt: Date
    }>(`
      SELECT GuidanceArticleId, ArticleCode, Title, Content, ModuleId, SopId, Status, MetadataJson, UpdatedAt
      FROM GuidanceArticle WHERE ${conditions.join(' AND ')} ORDER BY Title
    `, parameters)
    return rows.map((row) => ({
      id: row.GuidanceArticleId, code: row.ArticleCode, title: row.Title, content: row.Content,
      moduleId: row.ModuleId, sopId: row.SopId, status: row.Status,
      metadata: parseJson<Record<string, unknown> | null>(row.MetadataJson, null), updatedAt: row.UpdatedAt
    }))
  }

  async createGuidance(body: CreateGuidanceBody, actorAccountId: string) {
    if (!body.moduleId && !body.sopId) throw conflict('GUIDANCE_SCOPE_REQUIRED', 'moduleId or sopId is required')
    const id = createId('guide')
    await this.database.transaction(async (runner) => {
      await runner.query(`
        INSERT INTO GuidanceArticle (
          GuidanceArticleId, ArticleCode, Title, Content, ModuleId, SopId, Status, MetadataJson
        ) VALUES (
          :id, :code, :title, :content, :moduleId, :sopId, :status, :metadataJson
        )
      `, {
        id, code: body.code, title: body.title, content: body.content,
        moduleId: body.moduleId ?? null, sopId: body.sopId ?? null,
        status: body.status ?? 'draft', metadataJson: body.metadata ? JSON.stringify(body.metadata) : null
      })
      await runner.query(`
        INSERT INTO AuditLog (EntityType, EntityId, Action, ActorAccountId, AfterJson)
        VALUES ('guidance', :id, 'create', :actorAccountId, :afterJson)
      `, { id, actorAccountId, afterJson: JSON.stringify({ code: body.code, sopId: body.sopId ?? null }) })
    })
    return (await this.listGuidance({ includeDrafts: true })).find((item) => item.id === id)
  }
}
