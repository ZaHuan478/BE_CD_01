import type { QueryRunner } from '../database/database.js'

export interface MenuItemDto {
  id: string
  parentId: string | null
  code: string
  title: string
  routePath: string | null
  iconName: string | null
  requiredPermissionCode: string | null
  sortOrder: number
  moduleIds: string[]
}

interface MenuRow {
  MenuItemId: string
  ParentMenuItemId: string | null
  MenuCode: string
  Title: string
  RoutePath: string | null
  IconName: string | null
  RequiredPermissionCode: string | null
  SortOrder: number
}

export class MeRepository {
  constructor(private readonly database: QueryRunner) {}

  async listMenuItems(): Promise<MenuItemDto[]> {
    const [rows, mappings] = await Promise.all([
      this.database.query<MenuRow>(`
      SELECT MenuItemId, ParentMenuItemId, MenuCode, Title, RoutePath,
             IconName, RequiredPermissionCode, SortOrder
      FROM MenuItem
      WHERE IsVisible = 1
      ORDER BY SortOrder, Title
      `),
      this.database.query<{ MenuItemId: string; ModuleId: string }>(`
        SELECT MenuItemId, ModuleId FROM MenuModule
      `)
    ])
    return rows.map((row) => ({
      id: row.MenuItemId,
      parentId: row.ParentMenuItemId,
      code: row.MenuCode,
      title: row.Title,
      routePath: row.RoutePath,
      iconName: row.IconName,
      requiredPermissionCode: row.RequiredPermissionCode,
      sortOrder: row.SortOrder,
      moduleIds: mappings
        .filter((mapping) => mapping.MenuItemId === row.MenuItemId)
        .map((mapping) => mapping.ModuleId)
    }))
  }
}
