import { randomUUID } from 'node:crypto'
import type { ResultSetHeader } from 'mysql2'
import type { QueryRunner, TransactionalDatabase } from '../database/database.js'
import type { CreateSystemGuideBody, SystemGuideContent, SystemGuideProgressBody, UpdateSystemGuideBody } from '../schemas/system-guide.schemas.js'

interface GuideRow {
  GuideId: string
  Slug: string
  Title: string
  Summary: string
  Category: string
  RoutePath: string | null
  RequiredPermission: string | null
  AudienceMode: 'ALL' | 'AUTHORIZED' | 'ADMIN'
  Status: 'draft' | 'published' | 'archived'
  SortOrder: number
  CurrentVersionNumber: number
  ContentJson: string | null
  VersionStatus: 'draft' | 'published' | 'archived' | null
  UpdatedAt: Date | string
}

interface TourRow {
  TourStepId: string
  GuideId: string
  HelpAnchorId: string
  Title: string
  Description: string
  RoutePath: string
  SortOrder: number
}

interface ProgressRow {
  GuideId: string
  CompletedStepsJson: string
  TourCompleted: number | boolean
  DismissedAt: Date | string | null
  LastViewedAt: Date | string
  CompletedAt: Date | string | null
}

function parseJson<T>(value: string | null, fallback: T): T {
  if (!value) return fallback
  try { return JSON.parse(value) as T } catch { return fallback }
}

export class SystemGuideRepository {
  constructor(private readonly database: TransactionalDatabase) {}

  private selectSql(admin: boolean) {
    const versionJoin = admin
      ? `LEFT JOIN SystemGuideVersion versionRow ON versionRow.GuideId = guide.GuideId
          AND versionRow.VersionNumber = (SELECT MAX(v.VersionNumber) FROM SystemGuideVersion v WHERE v.GuideId = guide.GuideId)`
      : `JOIN SystemGuideVersion versionRow ON versionRow.GuideId = guide.GuideId
          AND versionRow.VersionNumber = guide.CurrentVersionNumber AND versionRow.Status = 'published'`
    return `SELECT guide.GuideId, guide.Slug, guide.Title, guide.Summary, guide.Category, guide.RoutePath,
      guide.RequiredPermission, guide.AudienceMode, guide.Status, guide.SortOrder, guide.CurrentVersionNumber,
      versionRow.ContentJson, versionRow.Status AS VersionStatus, guide.UpdatedAt
      FROM SystemGuide guide ${versionJoin}`
  }

  async listPublished(): Promise<GuideRow[]> {
    return this.database.query<GuideRow>(`${this.selectSql(false)} WHERE guide.Status = 'published'
      ORDER BY guide.SortOrder, guide.Title`)
  }

  async listAdmin(): Promise<GuideRow[]> {
    return this.database.query<GuideRow>(`${this.selectSql(true)} ORDER BY guide.SortOrder, guide.Title`)
  }

  async findPublishedBySlug(slug: string): Promise<GuideRow | undefined> {
    const [row] = await this.database.query<GuideRow>(`${this.selectSql(false)}
      WHERE guide.Status = 'published' AND guide.Slug = :slug`, { slug })
    return row
  }

  async tours(guideIds: string[]): Promise<TourRow[]> {
    if (!guideIds.length) return []
    const placeholders = guideIds.map((_, index) => `:guide${index}`).join(', ')
    const parameters = Object.fromEntries(guideIds.map((id, index) => [`guide${index}`, id]))
    return this.database.query<TourRow>(`SELECT TourStepId, GuideId, HelpAnchorId, Title, Description, RoutePath, SortOrder
      FROM SystemGuideTour WHERE GuideId IN (${placeholders}) ORDER BY SortOrder`, parameters)
  }

  async progress(accountId: string): Promise<ProgressRow[]> {
    return this.database.query<ProgressRow>(`SELECT GuideId, CompletedStepsJson, TourCompleted, DismissedAt, LastViewedAt, CompletedAt
      FROM UserGuideProgress WHERE AccountId = :accountId`, { accountId })
  }

  async saveProgress(accountId: string, guideId: string, body: SystemGuideProgressBody) {
    await this.database.query(`INSERT INTO UserGuideProgress
      (AccountId, GuideId, CompletedStepsJson, TourCompleted, DismissedAt, LastViewedAt, CompletedAt)
      SELECT :accountId, GuideId, :steps, :tourCompleted,
        CASE WHEN :dismissed = 1 THEN CURRENT_TIMESTAMP(3) ELSE NULL END,
        CURRENT_TIMESTAMP(3),
        CASE WHEN :tourCompleted = 1 THEN CURRENT_TIMESTAMP(3) ELSE NULL END
      FROM SystemGuide WHERE GuideId = :guideId
      ON DUPLICATE KEY UPDATE CompletedStepsJson = :steps, TourCompleted = :tourCompleted,
        DismissedAt = CASE WHEN :dismissed = 1 THEN COALESCE(DismissedAt, CURRENT_TIMESTAMP(3)) ELSE NULL END,
        LastViewedAt = CURRENT_TIMESTAMP(3),
        CompletedAt = CASE WHEN :tourCompleted = 1 THEN COALESCE(CompletedAt, CURRENT_TIMESTAMP(3)) ELSE NULL END`, {
      accountId, guideId, steps: JSON.stringify(body.completedSteps), tourCompleted: body.tourCompleted, dismissed: body.dismissed
    })
    const [row] = await this.database.query<ProgressRow>(`SELECT GuideId, CompletedStepsJson, TourCompleted, DismissedAt, LastViewedAt, CompletedAt
      FROM UserGuideProgress WHERE AccountId = :accountId AND GuideId = :guideId`, { accountId, guideId })
    return row
  }

  async create(body: CreateSystemGuideBody, actorId: string) {
    const guideId = `guide-${randomUUID()}`
    await this.database.transaction(async runner => {
      await runner.query(`INSERT INTO SystemGuide
        (GuideId, Slug, Title, Summary, Category, RoutePath, RequiredPermission, AudienceMode, Status, SortOrder, CurrentVersionNumber, CreatedBy, UpdatedBy)
        VALUES (:guideId, :slug, :title, :summary, :category, :routePath, :requiredPermission, :audienceMode, 'draft', :sortOrder, 1, :actorId, :actorId)`, {
        guideId, slug: body.slug, title: body.title, summary: body.summary, category: body.category,
        routePath: body.routePath ?? null, requiredPermission: body.requiredPermission ?? null,
        audienceMode: body.audienceMode, sortOrder: body.sortOrder, actorId
      })
      await runner.query(`INSERT INTO SystemGuideVersion (GuideId, VersionNumber, ContentJson, Status, CreatedBy)
        VALUES (:guideId, 1, :content, 'draft', :actorId)`, { guideId, content: JSON.stringify(body.content), actorId })
      if (body.tour) await this.replaceTours(runner, guideId, body.tour)
      await this.audit(runner, guideId, 'create', actorId, null, body)
    })
    return guideId
  }

  async update(guideId: string, body: UpdateSystemGuideBody, actorId: string): Promise<boolean> {
    return this.database.transaction(async runner => {
      const [existing] = await runner.query<GuideRow>(`${this.selectSql(true)} WHERE guide.GuideId = :guideId`, { guideId })
      if (!existing) return false
      const before = this.mapGuide(existing)
      const metadata = {
        slug: body.slug ?? existing.Slug, title: body.title ?? existing.Title, summary: body.summary ?? existing.Summary,
        category: body.category ?? existing.Category, routePath: body.routePath === undefined ? existing.RoutePath : body.routePath,
        requiredPermission: body.requiredPermission === undefined ? existing.RequiredPermission : body.requiredPermission,
        audienceMode: body.audienceMode ?? existing.AudienceMode, sortOrder: body.sortOrder ?? existing.SortOrder
      }
      await runner.query(`UPDATE SystemGuide SET Slug = :slug, Title = :title, Summary = :summary, Category = :category,
        RoutePath = :routePath, RequiredPermission = :requiredPermission, AudienceMode = :audienceMode,
        SortOrder = :sortOrder, UpdatedBy = :actorId WHERE GuideId = :guideId`, { ...metadata, actorId, guideId })
      if (body.content) {
        const [draft] = await runner.query<{ VersionNumber: number }>(`SELECT VersionNumber FROM SystemGuideVersion
          WHERE GuideId = :guideId AND Status = 'draft' ORDER BY VersionNumber DESC LIMIT 1`, { guideId })
        if (draft) {
          await runner.query(`UPDATE SystemGuideVersion SET ContentJson = :content, CreatedBy = :actorId
            WHERE GuideId = :guideId AND VersionNumber = :version`, { guideId, version: draft.VersionNumber, content: JSON.stringify(body.content), actorId })
        } else {
          const nextVersion = existing.CurrentVersionNumber + 1
          await runner.query(`INSERT INTO SystemGuideVersion (GuideId, VersionNumber, ContentJson, Status, CreatedBy)
            VALUES (:guideId, :version, :content, 'draft', :actorId)`, { guideId, version: nextVersion, content: JSON.stringify(body.content), actorId })
        }
      }
      if (body.tour) await this.replaceTours(runner, guideId, body.tour)
      await this.audit(runner, guideId, 'update', actorId, before, body)
      return true
    })
  }

  async publish(guideId: string, actorId: string): Promise<boolean> {
    return this.database.transaction(async runner => {
      const [draft] = await runner.query<{ VersionNumber: number }>(`SELECT VersionNumber FROM SystemGuideVersion
        WHERE GuideId = :guideId AND Status = 'draft' ORDER BY VersionNumber DESC LIMIT 1`, { guideId })
      if (!draft) return false
      await runner.query(`UPDATE SystemGuideVersion SET Status = 'archived'
        WHERE GuideId = :guideId AND Status = 'published'`, { guideId })
      await runner.query(`UPDATE SystemGuideVersion SET Status = 'published', PublishedAt = CURRENT_TIMESTAMP(3)
        WHERE GuideId = :guideId AND VersionNumber = :version`, { guideId, version: draft.VersionNumber })
      await runner.query(`UPDATE SystemGuide SET Status = 'published', CurrentVersionNumber = :version, UpdatedBy = :actorId
        WHERE GuideId = :guideId`, { guideId, version: draft.VersionNumber, actorId })
      await this.audit(runner, guideId, 'publish', actorId, null, { version: draft.VersionNumber })
      return true
    })
  }

  async archive(guideId: string, actorId: string): Promise<boolean> {
    const [result] = await this.database.query<ResultSetHeader & object>(`UPDATE SystemGuide SET Status = 'archived', UpdatedBy = :actorId
      WHERE GuideId = :guideId`, { guideId, actorId })
    if (!result || result.affectedRows === 0) return false
    await this.audit(this.database, guideId, 'archive', actorId, null, null)
    return true
  }

  mapGuide(row: GuideRow) {
    return {
      id: row.GuideId, slug: row.Slug, title: row.Title, summary: row.Summary, category: row.Category,
      routePath: row.RoutePath, requiredPermission: row.RequiredPermission, audienceMode: row.AudienceMode,
      status: row.Status, sortOrder: Number(row.SortOrder), version: Number(row.CurrentVersionNumber),
      versionStatus: row.VersionStatus, content: parseJson<SystemGuideContent | null>(row.ContentJson, null), updatedAt: row.UpdatedAt
    }
  }

  mapProgress(row: ProgressRow) {
    return {
      guideId: row.GuideId, completedSteps: parseJson<number[]>(row.CompletedStepsJson, []),
      tourCompleted: Boolean(row.TourCompleted), dismissed: Boolean(row.DismissedAt),
      lastViewedAt: row.LastViewedAt, completedAt: row.CompletedAt
    }
  }

  private audit(runner: QueryRunner, entityId: string, action: string, actorId: string, before: unknown, after: unknown) {
    return runner.query(`INSERT INTO AuditLog (EntityType, EntityId, Action, ActorAccountId, BeforeJson, AfterJson)
      VALUES ('system-guide', :entityId, :action, :actorId, :before, :after)`, {
      entityId, action, actorId, before: before === null ? null : JSON.stringify(before), after: after === null ? null : JSON.stringify(after)
    })
  }

  private async replaceTours(runner: QueryRunner, guideId: string, tour: NonNullable<CreateSystemGuideBody['tour']>) {
    await runner.query('DELETE FROM SystemGuideTour WHERE GuideId = :guideId', { guideId })
    for (const step of tour) {
      await runner.query(`INSERT INTO SystemGuideTour
        (TourStepId, GuideId, HelpAnchorId, Title, Description, RoutePath, SortOrder)
        VALUES (:id, :guideId, :anchor, :title, :description, :routePath, :sortOrder)`, {
        id: `tour-${randomUUID()}`, guideId, anchor: step.anchor, title: step.title,
        description: step.description, routePath: step.routePath, sortOrder: step.sortOrder
      })
    }
  }
}
