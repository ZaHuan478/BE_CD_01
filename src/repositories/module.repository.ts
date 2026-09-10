import { conflict, notFound } from '../common/errors.js'
import { createId } from '../common/ids.js'
import type { QueryRunner, TransactionalDatabase } from '../database/database.js'
import type { CreateModuleBody, UpdateModuleBody } from '../schemas/module.schemas.js'

interface ModuleRow {
  ModuleId: string
  ModuleCode: string
  Title: string
  Description: string | null
  ModuleType: string
  Status: 'draft' | 'published' | 'archived'
  IsCommon: boolean
  SortOrder: number
  BusinessCluster: 'core' | 'people' | 'organization' | 'platform'
  IconKey: string
  CreatedAt: Date
  UpdatedAt: Date
}

export interface ModuleDto {
  id: string
  code: string
  title: string
  description: string | null
  moduleType: string
  status: ModuleRow['Status']
  common: boolean
  sortOrder: number
  businessCluster: ModuleRow['BusinessCluster']
  iconKey: string
  createdAt: Date
  updatedAt: Date
}

function mapModule(row: ModuleRow): ModuleDto {
  return {
    id: row.ModuleId,
    code: row.ModuleCode,
    title: row.Title,
    description: row.Description,
    moduleType: row.ModuleType,
    status: row.Status,
    common: Boolean(row.IsCommon),
    sortOrder: row.SortOrder,
    businessCluster: row.BusinessCluster ?? 'core',
    iconKey: row.IconKey ?? 'layers',
    createdAt: row.CreatedAt,
    updatedAt: row.UpdatedAt
  }
}

const selectColumns = `ModuleId, ModuleCode, Title, Description, ModuleType,
  Status, IsCommon, SortOrder, BusinessCluster, IconKey, CreatedAt, UpdatedAt`

export class ModuleRepository {
  constructor(private readonly database: QueryRunner, private readonly core8 = false) {}

  async list(): Promise<ModuleDto[]> {
    const rows = await this.database.query<ModuleRow>(`
      SELECT ${selectColumns}
      FROM HrModule
      ORDER BY SortOrder, Title
    `)
    return rows.map(mapModule)
  }

  async findById(moduleId: string): Promise<ModuleDto> {
    const rows = await this.database.query<ModuleRow>(`
      SELECT ${selectColumns} FROM HrModule WHERE ModuleId = :moduleId
    `, { moduleId })
    if (!rows[0]) throw notFound('Module', moduleId)
    return mapModule(rows[0])
  }

  async findModuleIdsForSops(sopIds: string[]): Promise<string[]> {
    if (sopIds.length === 0) return []
    const parameters = Object.fromEntries(sopIds.map((id, index) => [`sop${index}`, id]))
    const placeholders = sopIds.map((_, index) => `:sop${index}`).join(', ')
    const rows = await this.database.query<{ ModuleId: string }>(`
      SELECT DISTINCT ModuleId FROM ${this.core8 ? 'KnowledgeDocumentModule' : 'SopModule'}
      WHERE ${this.core8 ? 'DocumentId' : 'SopId'} IN (${placeholders})
    `, parameters)
    return rows.map((row) => row.ModuleId)
  }

  async create(body: CreateModuleBody, actorAccountId?: string, inTransaction = false): Promise<ModuleDto> {
    if (!inTransaction && 'transaction' in this.database) {
      return (this.database as TransactionalDatabase).transaction(runner => new ModuleRepository(runner, this.core8).create(body, actorAccountId, true))
    }
    const moduleId = createId('mod')
    await this.database.query(`
      INSERT INTO HrModule (
        ModuleId, ModuleCode, Title, Description, ModuleType, Status, SortOrder, BusinessCluster, IconKey
      ) VALUES (
        :moduleId, :code, :title, :description, :moduleType, :status, :sortOrder, :businessCluster, :iconKey
      )
    `, {
      moduleId,
      code: body.code,
      title: body.title,
      description: body.description ?? null,
      moduleType: body.moduleType,
      status: body.status ?? 'published',
      sortOrder: body.sortOrder ?? 0,
      businessCluster: body.businessCluster ?? 'core',
      iconKey: body.iconKey ?? 'layers'
    })
    const created = await this.findById(moduleId)
    if (actorAccountId) await this.audit(moduleId, 'create', actorAccountId, null, created)
    return created
  }

  async update(moduleId: string, body: UpdateModuleBody, actorAccountId?: string, inTransaction = false): Promise<ModuleDto> {
    if (!inTransaction && 'transaction' in this.database) {
      return (this.database as TransactionalDatabase).transaction(runner => new ModuleRepository(runner, this.core8).update(moduleId, body, actorAccountId, true))
    }
    const current = await this.findById(moduleId)
    if (body.status && body.status !== 'published' && current.status === 'published') {
      const links = await this.publishedSopCount(moduleId)
      if (links > 0) throw conflict('MODULE_HAS_PUBLISHED_SOPS', `Phân hệ đang có ${links} SOP đã công bố. Hãy chuyển các SOP sang phân hệ khác hoặc lưu trữ SOP trước khi ẩn phân hệ. Tài liệu sẽ không bị xóa.`)
    }
    await this.database.query(`
      UPDATE HrModule
      SET ModuleCode = :code,
          Title = :title,
          Description = :description,
          ModuleType = :moduleType,
          Status = :status,
          SortOrder = :sortOrder,
          BusinessCluster = :businessCluster,
          IconKey = :iconKey,
          UpdatedAt = UTC_TIMESTAMP(3)
      WHERE ModuleId = :moduleId
    `, {
      moduleId,
      code: body.code ?? current.code,
      title: body.title ?? current.title,
      description: body.description === undefined ? current.description : body.description,
      moduleType: body.moduleType ?? current.moduleType,
      status: body.status ?? current.status,
      sortOrder: body.sortOrder ?? current.sortOrder,
      businessCluster: body.businessCluster ?? current.businessCluster,
      iconKey: body.iconKey ?? current.iconKey
    })
    const updated = await this.findById(moduleId)
    if (actorAccountId) await this.audit(moduleId, body.status === 'archived' ? 'archive' : 'update', actorAccountId, current, updated)
    return updated
  }

  async publishedSopCount(moduleId: string): Promise<number> {
    const rows = await this.database.query<{ Total: number }>(this.core8 ? `
      SELECT COUNT(*) AS Total FROM KnowledgeDocumentModule link
      JOIN KnowledgeDocument document ON document.DocumentId = link.DocumentId
      WHERE link.ModuleId = :moduleId AND document.Status = 'published' AND document.DocumentType = 'procedure'
    ` : `
      SELECT COUNT(*) AS Total FROM SopModule link JOIN Sop sop ON sop.SopId = link.SopId
      WHERE link.ModuleId = :moduleId AND sop.Status = 'published'
    `, { moduleId })
    return Number(rows[0]?.Total ?? 0)
  }

  private async audit(moduleId: string, action: string, actorAccountId: string, before: ModuleDto | null, after: ModuleDto) {
    await this.database.query(`INSERT INTO AuditLog (EntityType, EntityId, Action, ActorAccountId, BeforeJson, AfterJson)
      VALUES ('module', :moduleId, :action, :actorAccountId, :before, :after)`, {
      moduleId, action, actorAccountId, before: before ? JSON.stringify(before) : null, after: JSON.stringify(after)
    })
  }
}
