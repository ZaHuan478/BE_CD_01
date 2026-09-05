import { conflict, notFound } from '../common/errors.js'
import { createId } from '../common/ids.js'
import type { QueryRunner, TransactionalDatabase } from '../database/database.js'
import type {
  ArtifactInput,
  CreateSopBody,
  ReplaceSopVersionBody,
  SopContentInput,
  StepInput,
  UpdateSopBody
} from '../schemas/sop.schemas.js'

interface SopAccessRow { SopId: string; Title: string; ModuleId: string }
interface SopListRow {
  SopId: string
  SopCode: string
  Title: string
  Category: string | null
  SopVersionId: string
  VersionNumber: number
  PublicationStatus: string
  UpdatedAt: Date
  ModuleIds: string | null
}
interface VersionRow {
  SopVersionId: string
  SopId: string
  VersionNumber: number
  PublicationStatus: string
  Definition: string | null
  Purpose: string | null
  Scope: string | null
  ChangeLog: string | null
  CreatedAt: Date
  UpdatedAt: Date
  PublishedAt: Date | null
  RowVersion: string
}
interface StepRow {
  SopStepId: string
  StableKey: string
  StepCode: string
  Title: string
  Objective: string | null
  Description: string | null
  Actor: string | null
  Location: string | null
  Timing: string | null
  NodeKind: StepInput['nodeKind']
  TypeCode: string | null
  SortOrder: number
  ChecklistJson: string | null
}
interface ArtifactRow {
  StepArtifactId: string
  SopStepId: string
  Direction: 'input' | 'output'
  Name: string
  Description: string | null
  IsRequired: boolean
  SortOrder: number
  MetadataJson: string | null
}
interface TransitionRow {
  SopTransitionId: string
  FromStepId: string | null
  ToStepId: string | null
  TransitionKind: string
  ConditionText: string | null
  BranchLabel: string | null
  TargetSopId: string | null
  SortOrder: number
}
interface ModuleLinkRow { ModuleId: string; IsPrimary: boolean; RelationType: string }
interface VersionSummaryRow {
  SopVersionId: string
  VersionNumber: number
  PublicationStatus: string
  CreatedAt: Date
  UpdatedAt: Date
  PublishedAt: Date | null
  RowVersion: string
}

function parseJson<T>(value: string | null, fallback: T): T {
  if (!value) return fallback
  try { return JSON.parse(value) as T } catch { return fallback }
}

async function insertArtifacts(
  runner: QueryRunner,
  stepId: string,
  direction: 'input' | 'output',
  artifacts: ArtifactInput[]
): Promise<void> {
  for (const [index, artifact] of artifacts.entries()) {
    await runner.query(`
      INSERT INTO StepArtifact (
        StepArtifactId, SopStepId, Direction, Name, Description,
        IsRequired, SortOrder, MetadataJson
      ) VALUES (
        :artifactId, :stepId, :direction, :name, :description,
        :required, :sortOrder, :metadataJson
      )
    `, {
      artifactId: artifact.id ?? createId('artifact'),
      stepId,
      direction,
      name: artifact.name,
      description: artifact.description ?? null,
      required: artifact.required ?? false,
      sortOrder: index,
      metadataJson: artifact.metadata ? JSON.stringify(artifact.metadata) : null
    })
  }
}

async function insertContent(runner: QueryRunner, versionId: string, content: SopContentInput): Promise<void> {
  for (const step of content.steps) {
    await runner.query(`
      INSERT INTO SopStep (
        SopStepId, SopVersionId, StableKey, StepCode, Title, Objective,
        Description, Actor, Location, Timing, NodeKind, TypeCode, SortOrder, ChecklistJson
      ) VALUES (
        :stepId, :versionId, :stableKey, :code, :title, :objective,
        :description, :actor, :location, :timing, :nodeKind, :typeCode, :sortOrder, :checklistJson
      )
    `, {
      stepId: step.id,
      versionId,
      stableKey: step.stableKey,
      code: step.code,
      title: step.title,
      objective: step.objective ?? null,
      description: step.description ?? null,
      actor: step.actor ?? null,
      location: step.location ?? null,
      timing: step.timing ?? null,
      nodeKind: step.nodeKind,
      typeCode: step.typeCode ?? null,
      sortOrder: step.sortOrder,
      checklistJson: step.checklist ? JSON.stringify(step.checklist) : null
    })
    await insertArtifacts(runner, step.id, 'input', step.inputs ?? [])
    await insertArtifacts(runner, step.id, 'output', step.outputs ?? [])
  }

  for (const transition of content.transitions) {
    await runner.query(`
      INSERT INTO SopTransition (
        SopTransitionId, SopVersionId, FromStepId, ToStepId, TransitionKind,
        ConditionText, BranchLabel, TargetSopId, SortOrder
      ) VALUES (
        :transitionId, :versionId, :fromStepId, :toStepId, :kind,
        :condition, :branchLabel, :targetSopId, :sortOrder
      )
    `, {
      transitionId: transition.id ?? createId('transition'),
      versionId,
      fromStepId: transition.fromStepId ?? null,
      toStepId: transition.toStepId ?? null,
      kind: transition.kind,
      condition: transition.condition ?? null,
      branchLabel: transition.branchLabel ?? null,
      targetSopId: transition.targetSopId ?? null,
      sortOrder: transition.sortOrder ?? 0
    })
  }
}

export class SopRepository {
  constructor(private readonly database: TransactionalDatabase) {}

  async list(filters: { moduleId?: string; search?: string; includeDrafts: boolean }) {
    const conditions: string[] = ['selectedVersion.SopVersionId IS NOT NULL']
    const parameters: Record<string, string | boolean> = { includeDrafts: filters.includeDrafts }
    if (filters.moduleId) {
      conditions.push('EXISTS (SELECT 1 FROM SopModule filterLink WHERE filterLink.SopId = s.SopId AND filterLink.ModuleId = :moduleId)')
      parameters.moduleId = filters.moduleId
    }
    if (filters.search) {
      conditions.push('(s.Title LIKE :search OR s.SopCode LIKE :search OR s.Category LIKE :search)')
      parameters.search = `%${filters.search}%`
    }
    const rows = await this.database.query<SopListRow>(`
      SELECT s.SopId, s.SopCode, s.Title, s.Category,
             selectedVersion.SopVersionId, selectedVersion.VersionNumber,
             selectedVersion.PublicationStatus, selectedVersion.UpdatedAt,
             (SELECT GROUP_CONCAT(link.ModuleId SEPARATOR '|') FROM SopModule link WHERE link.SopId = s.SopId) AS ModuleIds
      FROM Sop s
      INNER JOIN SopVersion selectedVersion ON selectedVersion.SopVersionId = (
        SELECT v.SopVersionId
        FROM SopVersion v
        WHERE v.SopId = s.SopId
          AND (:includeDrafts = 1 OR v.PublicationStatus = 'published')
        ORDER BY CASE WHEN v.SopVersionId = s.CurrentPublishedVersionId THEN 0 ELSE 1 END,
                 v.VersionNumber DESC
        LIMIT 1
      )
      WHERE ${conditions.join(' AND ')}
      ORDER BY s.Title
    `, parameters)
    return rows.map((row) => ({
      id: row.SopId,
      code: row.SopCode,
      title: row.Title,
      category: row.Category,
      versionId: row.SopVersionId,
      versionNumber: row.VersionNumber,
      publicationStatus: row.PublicationStatus,
      updatedAt: row.UpdatedAt,
      moduleIds: row.ModuleIds?.split('|').filter(Boolean) ?? []
    }))
  }

  async getAccessContext(sopId: string): Promise<{ id: string; title: string; moduleIds: string[] }> {
    const rows = await this.database.query<SopAccessRow>(`
      SELECT s.SopId, s.Title, link.ModuleId
      FROM Sop s
      LEFT JOIN SopModule link ON link.SopId = s.SopId
      WHERE s.SopId = :sopId
    `, { sopId })
    if (!rows[0]) throw notFound('SOP', sopId)
    return { id: rows[0].SopId, title: rows[0].Title, moduleIds: rows.map((row) => row.ModuleId).filter(Boolean) }
  }

  async getDetail(sopId: string, versionId?: string) {
    const versionCondition = versionId
      ? 'v.SopVersionId = :versionId'
      : 'v.SopVersionId = s.CurrentPublishedVersionId'
    const versions = await this.database.query<VersionRow>(`
      SELECT v.SopVersionId, v.SopId, v.VersionNumber, v.PublicationStatus,
             v.Definition, v.Purpose, v.Scope, v.ChangeLog, v.CreatedAt,
             v.UpdatedAt, v.PublishedAt, CAST(v.RowVersion AS CHAR) AS RowVersion
      FROM Sop s
      INNER JOIN SopVersion v ON v.SopId = s.SopId
      WHERE s.SopId = :sopId AND ${versionCondition}
    `, { sopId, versionId: versionId ?? null })
    const version = versions[0]
    if (!version) throw notFound('SOP version', versionId ?? `published version of ${sopId}`)

    const [sopRows, steps, artifacts, transitions, moduleLinks, history] = await Promise.all([
      this.database.query<{ SopCode: string; Title: string; Category: string | null }>(`
        SELECT SopCode, Title, Category FROM Sop WHERE SopId = :sopId
      `, { sopId }),
      this.database.query<StepRow>(`
        SELECT SopStepId, StableKey, StepCode, Title, Objective, Description,
               Actor, Location, Timing, NodeKind, TypeCode, SortOrder, ChecklistJson
        FROM SopStep WHERE SopVersionId = :versionId ORDER BY SortOrder, StepCode
      `, { versionId: version.SopVersionId }),
      this.database.query<ArtifactRow>(`
        SELECT a.StepArtifactId, a.SopStepId, a.Direction, a.Name, a.Description,
               a.IsRequired, a.SortOrder, a.MetadataJson
        FROM StepArtifact a
        INNER JOIN SopStep stepRow ON stepRow.SopStepId = a.SopStepId
        WHERE stepRow.SopVersionId = :versionId
        ORDER BY a.SopStepId, a.Direction, a.SortOrder
      `, { versionId: version.SopVersionId }),
      this.database.query<TransitionRow>(`
        SELECT SopTransitionId, FromStepId, ToStepId, TransitionKind,
               ConditionText, BranchLabel, TargetSopId, SortOrder
        FROM SopTransition WHERE SopVersionId = :versionId ORDER BY SortOrder
      `, { versionId: version.SopVersionId }),
      this.database.query<ModuleLinkRow>(`
        SELECT ModuleId, IsPrimary, RelationType FROM SopModule WHERE SopId = :sopId
      `, { sopId }),
      this.database.query<VersionSummaryRow>(`
        SELECT SopVersionId, VersionNumber, PublicationStatus, CreatedAt, UpdatedAt,
               PublishedAt, CAST(RowVersion AS CHAR) AS RowVersion
        FROM SopVersion WHERE SopId = :sopId ORDER BY VersionNumber DESC
      `, { sopId })
    ])
    const sop = sopRows[0]
    if (!sop) throw notFound('SOP', sopId)
    const mappedArtifacts = artifacts.map((artifact) => ({
      id: artifact.StepArtifactId,
      stepId: artifact.SopStepId,
      direction: artifact.Direction,
      name: artifact.Name,
      description: artifact.Description,
      required: Boolean(artifact.IsRequired),
      sortOrder: artifact.SortOrder,
      metadata: parseJson<Record<string, unknown> | undefined>(artifact.MetadataJson, undefined)
    }))
    return {
      id: sopId,
      code: sop.SopCode,
      title: sop.Title,
      category: sop.Category,
      modules: moduleLinks.map((link) => ({
        moduleId: link.ModuleId,
        primary: Boolean(link.IsPrimary),
        relationType: link.RelationType
      })),
      version: {
        id: version.SopVersionId,
        number: version.VersionNumber,
        publicationStatus: version.PublicationStatus,
        definition: version.Definition,
        purpose: version.Purpose,
        scope: version.Scope,
        changeLog: version.ChangeLog,
        createdAt: version.CreatedAt,
        updatedAt: version.UpdatedAt,
        publishedAt: version.PublishedAt,
        rowVersion: version.RowVersion
      },
      steps: steps.map((step) => ({
        id: step.SopStepId,
        stableKey: step.StableKey,
        code: step.StepCode,
        title: step.Title,
        objective: step.Objective,
        description: step.Description,
        actor: step.Actor,
        location: step.Location,
        timing: step.Timing,
        nodeKind: step.NodeKind,
        typeCode: step.TypeCode,
        sortOrder: step.SortOrder,
        checklist: parseJson<string[]>(step.ChecklistJson, []),
        inputs: mappedArtifacts.filter((item) => item.stepId === step.SopStepId && item.direction === 'input'),
        outputs: mappedArtifacts.filter((item) => item.stepId === step.SopStepId && item.direction === 'output')
      })),
      transitions: transitions.map((transition) => ({
        id: transition.SopTransitionId,
        fromStepId: transition.FromStepId,
        toStepId: transition.ToStepId,
        kind: transition.TransitionKind,
        condition: transition.ConditionText,
        branchLabel: transition.BranchLabel,
        targetSopId: transition.TargetSopId,
        sortOrder: transition.SortOrder
      })),
      versions: history.map((item) => ({
        id: item.SopVersionId,
        number: item.VersionNumber,
        publicationStatus: item.PublicationStatus,
        createdAt: item.CreatedAt,
        updatedAt: item.UpdatedAt,
        publishedAt: item.PublishedAt,
        rowVersion: item.RowVersion
      }))
    }
  }

  async create(body: CreateSopBody, actorAccountId: string): Promise<{ sopId: string; versionId: string }> {
    if (!body.moduleIds.includes(body.primaryModuleId)) {
      throw conflict('PRIMARY_MODULE_INVALID', 'primaryModuleId must be included in moduleIds')
    }
    const uniqueModuleIds = [...new Set(body.moduleIds)]
    const sopId = createId('sop')
    const versionId = createId('sopv')
    await this.database.transaction(async (runner) => {
      const params = Object.fromEntries(uniqueModuleIds.map((id, index) => [`module${index}`, id]))
      const placeholders = uniqueModuleIds.map((_, index) => `:module${index}`).join(', ')
      const existing = await runner.query<{ ModuleId: string }>(`
        SELECT ModuleId FROM HrModule WHERE ModuleId IN (${placeholders})
      `, params)
      if (existing.length !== uniqueModuleIds.length) {
        throw conflict('MODULE_NOT_FOUND', 'One or more moduleIds do not exist')
      }
      await runner.query(`
        INSERT INTO Sop (SopId, SopCode, Title, Category, CreatedBy)
        VALUES (:sopId, :code, :title, :category, :actorAccountId)
      `, { sopId, code: body.code, title: body.title, category: body.category ?? null, actorAccountId })
      for (const moduleId of uniqueModuleIds) {
        await runner.query(`
          INSERT INTO SopModule (SopId, ModuleId, IsPrimary, RelationType)
          VALUES (:sopId, :moduleId, :isPrimary, :relationType)
        `, {
          sopId,
          moduleId,
          isPrimary: moduleId === body.primaryModuleId,
          relationType: moduleId === body.primaryModuleId ? 'primary' : 'related'
        })
      }
      await runner.query(`
        INSERT INTO SopVersion (
          SopVersionId, SopId, VersionNumber, PublicationStatus,
          Definition, Purpose, Scope, ChangeLog, CreatedBy
        ) VALUES (
          :versionId, :sopId, 1, 'draft', :definition, :purpose, :scope, :changeLog, :actorAccountId
        )
      `, {
        versionId,
        sopId,
        definition: body.definition ?? null,
        purpose: body.purpose ?? null,
        scope: body.scope ?? null,
        changeLog: body.changeLog ?? null,
        actorAccountId
      })
      await insertContent(runner, versionId, body)
      await runner.query(`
        INSERT INTO AuditLog (EntityType, EntityId, Action, ActorAccountId, AfterJson)
        VALUES ('sop', :sopId, 'create', :actorAccountId, :afterJson)
      `, { sopId, actorAccountId, afterJson: JSON.stringify({ code: body.code, versionId }) })
    })
    return { sopId, versionId }
  }

  async updateSop(sopId: string, body: UpdateSopBody, actorAccountId: string): Promise<void> {
    const replaceModules = body.moduleIds !== undefined || body.primaryModuleId !== undefined
    if (replaceModules && (!body.moduleIds || !body.primaryModuleId)) {
      throw conflict('MODULE_MAPPING_INCOMPLETE', 'moduleIds and primaryModuleId must be sent together')
    }
    if (body.moduleIds && body.primaryModuleId && !body.moduleIds.includes(body.primaryModuleId)) {
      throw conflict('PRIMARY_MODULE_INVALID', 'primaryModuleId must be included in moduleIds')
    }
    await this.database.transaction(async (runner) => {
      const current = await runner.query<{ Title: string; Category: string | null }>(`
        SELECT Title, Category FROM Sop WHERE SopId = :sopId FOR UPDATE
      `, { sopId })
      if (!current[0]) throw notFound('SOP', sopId)
      await runner.query(`
        UPDATE Sop
        SET Title = :title, Category = :category, UpdatedAt = UTC_TIMESTAMP(3)
        WHERE SopId = :sopId
      `, {
        sopId,
        title: body.title ?? current[0].Title,
        category: body.category === undefined ? current[0].Category : body.category
      })
      if (body.moduleIds && body.primaryModuleId) {
        const moduleIds = [...new Set(body.moduleIds)]
        const parameters = Object.fromEntries(moduleIds.map((id, index) => [`module${index}`, id]))
        const placeholders = moduleIds.map((_, index) => `:module${index}`).join(', ')
        const existing = await runner.query<{ ModuleId: string }>(`
          SELECT ModuleId FROM HrModule WHERE ModuleId IN (${placeholders})
        `, parameters)
        if (existing.length !== moduleIds.length) throw conflict('MODULE_NOT_FOUND', 'One or more moduleIds do not exist')
        await runner.query('DELETE FROM SopModule WHERE SopId = :sopId', { sopId })
        for (const moduleId of moduleIds) {
          await runner.query(`
            INSERT INTO SopModule (SopId, ModuleId, IsPrimary, RelationType)
            VALUES (:sopId, :moduleId, :isPrimary, :relationType)
          `, {
            sopId,
            moduleId,
            isPrimary: moduleId === body.primaryModuleId,
            relationType: moduleId === body.primaryModuleId ? 'primary' : 'related'
          })
        }
      }
      await runner.query(`
        INSERT INTO AuditLog (EntityType, EntityId, Action, ActorAccountId, AfterJson)
        VALUES ('sop', :sopId, 'update-header', :actorAccountId, :afterJson)
      `, { sopId, actorAccountId, afterJson: JSON.stringify(body) })
    })
  }

  async replaceVersion(versionId: string, body: ReplaceSopVersionBody, actorAccountId: string): Promise<string> {
    return this.database.transaction(async (runner) => {
      const currentRows = await runner.query<{ PublicationStatus: string; RowVersion: string }>(`
        SELECT PublicationStatus, CAST(RowVersion AS CHAR) AS RowVersion
        FROM SopVersion
        WHERE SopVersionId = :versionId FOR UPDATE
      `, { versionId })
      const current = currentRows[0]
      if (!current) throw notFound('SOP version', versionId)
      if (!['draft', 'rejected'].includes(current.PublicationStatus)) {
        throw conflict('VERSION_NOT_EDITABLE', 'Only draft or rejected versions can be edited')
      }
      if (current.RowVersion.toLowerCase() !== body.expectedRowVersion.toLowerCase()) {
        throw conflict('VERSION_CONFLICT', 'This version was changed by another request; reload before saving')
      }
      const [updated] = await runner.query<{ affectedRows: number }>(`
        UPDATE SopVersion
        SET Definition = :definition, Purpose = :purpose, Scope = :scope,
            ChangeLog = :changeLog, UpdatedAt = UTC_TIMESTAMP(3), RowVersion = RowVersion + 1
        WHERE SopVersionId = :versionId
          AND RowVersion = :expectedRowVersion
      `, {
        versionId,
        expectedRowVersion: body.expectedRowVersion,
        definition: body.definition ?? null,
        purpose: body.purpose ?? null,
        scope: body.scope ?? null,
        changeLog: body.changeLog ?? null
      })
      if (!updated || updated.affectedRows !== 1) {
        throw conflict('VERSION_CONFLICT', 'This version was changed by another request')
      }
      await runner.query('DELETE FROM SopTransition WHERE SopVersionId = :versionId', { versionId })
      await runner.query(`
        DELETE artifact FROM StepArtifact artifact
        INNER JOIN SopStep stepRow ON stepRow.SopStepId = artifact.SopStepId
        WHERE stepRow.SopVersionId = :versionId
      `, { versionId })
      await runner.query('DELETE FROM SopStep WHERE SopVersionId = :versionId', { versionId })
      await insertContent(runner, versionId, body)
      await runner.query(`
        INSERT INTO AuditLog (EntityType, EntityId, Action, ActorAccountId, AfterJson)
        VALUES ('sop-version', :versionId, 'replace-content', :actorAccountId, :afterJson)
      `, {
        versionId,
        actorAccountId,
        afterJson: JSON.stringify({ stepCount: body.steps.length, transitionCount: body.transitions.length })
      })
      return String(Number(current.RowVersion) + 1)
    })
  }

  async createDraft(sopId: string, actorAccountId: string): Promise<string> {
    const sourceRows = await this.database.query<{ SopVersionId: string }>(`
      SELECT SopVersionId FROM SopVersion
      WHERE SopId = :sopId
      ORDER BY CASE WHEN PublicationStatus = 'published' THEN 0 ELSE 1 END, VersionNumber DESC
      LIMIT 1
    `, { sopId })
    const sourceId = sourceRows[0]?.SopVersionId
    if (!sourceId) throw notFound('SOP', sopId)
    const source = await this.getDetail(sopId, sourceId)
    const versionId = createId('sopv')
    const stepIdMap = new Map(source.steps.map((step) => [step.id, createId('step')]))
    const content: SopContentInput = {
      definition: source.version.definition,
      purpose: source.version.purpose,
      scope: source.version.scope,
      changeLog: null,
      steps: source.steps.map((step) => ({
        ...step,
        id: stepIdMap.get(step.id) as string,
        inputs: step.inputs.map(({ id: _id, stepId: _stepId, direction: _direction, sortOrder: _sortOrder, ...artifact }) => artifact),
        outputs: step.outputs.map(({ id: _id, stepId: _stepId, direction: _direction, sortOrder: _sortOrder, ...artifact }) => artifact)
      })),
      transitions: source.transitions.map((transition) => ({
        fromStepId: transition.fromStepId ? stepIdMap.get(transition.fromStepId) ?? null : null,
        toStepId: transition.toStepId ? stepIdMap.get(transition.toStepId) ?? null : null,
        kind: transition.kind as SopContentInput['transitions'][number]['kind'],
        condition: transition.condition,
        branchLabel: transition.branchLabel,
        targetSopId: transition.targetSopId,
        sortOrder: transition.sortOrder
      }))
    }
    await this.database.transaction(async (runner) => {
      const latestRows = await runner.query<{ VersionNumber: number }>(`
        SELECT VersionNumber FROM SopVersion
        WHERE SopId = :sopId ORDER BY VersionNumber DESC LIMIT 1 FOR UPDATE
      `, { sopId })
      const nextVersionNumber = (latestRows[0]?.VersionNumber ?? 0) + 1
      await runner.query(`
        INSERT INTO SopVersion (
          SopVersionId, SopId, VersionNumber, PublicationStatus,
          Definition, Purpose, Scope, ChangeLog, CreatedBy
        ) VALUES (
          :versionId, :sopId, :versionNumber, 'draft',
          :definition, :purpose, :scope, NULL, :actorAccountId
        )
      `, {
        versionId,
        sopId,
        versionNumber: nextVersionNumber,
        definition: content.definition ?? null,
        purpose: content.purpose ?? null,
        scope: content.scope ?? null,
        actorAccountId
      })
      await insertContent(runner, versionId, content)
      await runner.query(`
        INSERT INTO AuditLog (EntityType, EntityId, Action, ActorAccountId, AfterJson)
        VALUES ('sop-version', :versionId, 'create-draft', :actorAccountId, :afterJson)
      `, { versionId, actorAccountId, afterJson: JSON.stringify({ sopId, sourceId }) })
    })
    return versionId
  }

  async submitVersion(versionId: string, actorAccountId: string): Promise<void> {
    const [updated] = await this.database.query<{ affectedRows: number }>(`
      UPDATE SopVersion
      SET PublicationStatus = 'in_review', UpdatedAt = UTC_TIMESTAMP(3), RowVersion = RowVersion + 1
      WHERE SopVersionId = :versionId AND PublicationStatus IN ('draft', 'rejected')
    `, { versionId })
    if (!updated || updated.affectedRows !== 1) {
      throw conflict('VERSION_NOT_SUBMITTABLE', 'Only draft or rejected versions can be submitted')
    }
    await this.database.query(`
      INSERT INTO AuditLog (EntityType, EntityId, Action, ActorAccountId)
      VALUES ('sop-version', :versionId, 'submit-review', :actorAccountId)
    `, { versionId, actorAccountId })
  }

  async publishVersion(versionId: string, actorAccountId: string): Promise<void> {
    const sopId = await this.getSopIdForVersion(versionId)
    const snapshot = await this.getDetail(sopId, versionId)
    await this.database.transaction(async (runner) => {
      const versions = await runner.query<{ SopId: string; PublicationStatus: string }>(`
        SELECT SopId, PublicationStatus FROM SopVersion
        WHERE SopVersionId = :versionId FOR UPDATE
      `, { versionId })
      const version = versions[0]
      if (!version) throw notFound('SOP version', versionId)
      if (version.PublicationStatus !== 'in_review') {
        throw conflict('VERSION_NOT_PUBLISHABLE', 'Only a version in review can be published')
      }
      await runner.query(`
        UPDATE SopVersion
        SET PublicationStatus = 'archived', ValidTo = UTC_TIMESTAMP(3),
            UpdatedAt = UTC_TIMESTAMP(3), RowVersion = RowVersion + 1
        WHERE SopId = :sopId AND PublicationStatus = 'published'
      `, { sopId: version.SopId })
      await runner.query(`
        UPDATE SopVersion
        SET PublicationStatus = 'published', ReviewedBy = :actorAccountId,
            PublishedBy = :actorAccountId, PublishedAt = UTC_TIMESTAMP(3),
            ValidFrom = UTC_TIMESTAMP(3), ValidTo = NULL, UpdatedAt = UTC_TIMESTAMP(3),
            ContentSnapshotJson = :snapshot, RowVersion = RowVersion + 1
        WHERE SopVersionId = :versionId
      `, { versionId, actorAccountId, snapshot: JSON.stringify(snapshot) })
      await runner.query(`
        UPDATE Sop SET CurrentPublishedVersionId = :versionId, UpdatedAt = UTC_TIMESTAMP(3)
        WHERE SopId = :sopId
      `, { versionId, sopId: version.SopId })
      await runner.query(`
        INSERT INTO AuditLog (EntityType, EntityId, Action, ActorAccountId, AfterJson)
        VALUES ('sop-version', :versionId, 'publish', :actorAccountId, :afterJson)
      `, { versionId, actorAccountId, afterJson: JSON.stringify({ sopId: version.SopId }) })
    })
  }

  async rejectVersion(versionId: string, reason: string, actorAccountId: string): Promise<void> {
    await this.database.transaction(async (runner) => {
      const [updated] = await runner.query<{ affectedRows: number }>(`
        UPDATE SopVersion
        SET PublicationStatus = 'rejected', ReviewedBy = :actorAccountId,
            UpdatedAt = UTC_TIMESTAMP(3), RowVersion = RowVersion + 1
        WHERE SopVersionId = :versionId AND PublicationStatus = 'in_review'
      `, { versionId, actorAccountId })
      if (!updated || updated.affectedRows !== 1) {
        throw conflict('VERSION_NOT_REJECTABLE', 'Only a version in review can be rejected')
      }
      await runner.query(`
        INSERT INTO AuditLog (EntityType, EntityId, Action, ActorAccountId, AfterJson)
        VALUES ('sop-version', :versionId, 'reject', :actorAccountId, :afterJson)
      `, { versionId, actorAccountId, afterJson: JSON.stringify({ reason }) })
    })
  }

  async getSopIdForVersion(versionId: string): Promise<string> {
    const rows = await this.database.query<{ SopId: string }>(`
      SELECT SopId FROM SopVersion WHERE SopVersionId = :versionId
    `, { versionId })
    if (!rows[0]) throw notFound('SOP version', versionId)
    return rows[0].SopId
  }
}
