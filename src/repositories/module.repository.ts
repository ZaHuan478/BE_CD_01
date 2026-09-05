import { notFound } from '../common/errors.js'
import { createId } from '../common/ids.js'
import type { QueryRunner } from '../database/database.js'
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
    createdAt: row.CreatedAt,
    updatedAt: row.UpdatedAt
  }
}

const selectColumns = `ModuleId, ModuleCode, Title, Description, ModuleType,
  Status, IsCommon, SortOrder, CreatedAt, UpdatedAt`

export class ModuleRepository {
  constructor(private readonly database: QueryRunner) {}

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
      SELECT DISTINCT ModuleId FROM SopModule WHERE SopId IN (${placeholders})
    `, parameters)
    return rows.map((row) => row.ModuleId)
  }

  async create(body: CreateModuleBody): Promise<ModuleDto> {
    const moduleId = createId('mod')
    await this.database.query(`
      INSERT INTO HrModule (
        ModuleId, ModuleCode, Title, Description, ModuleType, Status, SortOrder
      ) VALUES (
        :moduleId, :code, :title, :description, :moduleType, :status, :sortOrder
      )
    `, {
      moduleId,
      code: body.code,
      title: body.title,
      description: body.description ?? null,
      moduleType: body.moduleType,
      status: body.status ?? 'published',
      sortOrder: body.sortOrder ?? 0
    })
    return this.findById(moduleId)
  }

  async update(moduleId: string, body: UpdateModuleBody): Promise<ModuleDto> {
    const current = await this.findById(moduleId)
    await this.database.query(`
      UPDATE HrModule
      SET ModuleCode = :code,
          Title = :title,
          Description = :description,
          ModuleType = :moduleType,
          Status = :status,
          SortOrder = :sortOrder,
          UpdatedAt = UTC_TIMESTAMP(3)
      WHERE ModuleId = :moduleId
    `, {
      moduleId,
      code: body.code ?? current.code,
      title: body.title ?? current.title,
      description: body.description === undefined ? current.description : body.description,
      moduleType: body.moduleType ?? current.moduleType,
      status: body.status ?? current.status,
      sortOrder: body.sortOrder ?? current.sortOrder
    })
    return this.findById(moduleId)
  }
}
