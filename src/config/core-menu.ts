import type { MenuItemDto } from '../repositories/me.repository.js'

// UI navigation is configuration, not an authorization source.
const coreMenuEntries: Array<[string, string, string, string, string | null]> = [
  ['overview-dashboard', 'Tổng quan', '/employee-lifecycle', 'LayoutDashboard', 'sop.read'],
  ['layer-1-master-data', 'Dữ liệu nền tảng', '/employee-lifecycle/masterdata', 'Database', 'sop.read'],
  ['layer-2-lifecycle', 'Vòng đời nhân sự', '/employee-lifecycle/journey', 'Layers', 'sop.read'],
  ['layer-3-operations', 'Vận hành', '/employee-lifecycle/operations', 'GitBranch', 'sop.read'],
  ['system-support', 'Hỗ trợ hệ thống', '/employee-lifecycle/operations', 'Settings', 'sop.read'],
  ['process-library', 'Thư viện quy trình', '/employee-lifecycle?tab=process-library&cluster=core', 'BookOpen', 'sop.read'],
  ['policy-center', 'Quy định & Tuân thủ', '/employee-lifecycle/policies', 'ShieldCheck', null],
  ['ADMIN', 'Quản trị', '/employee-lifecycle/admin', 'Users', 'permission.manage']
]

export const coreMenu: MenuItemDto[] = coreMenuEntries.map(([code, title, routePath, iconName, requiredPermissionCode], index) => ({
  id: code, code, title, routePath, iconName, requiredPermissionCode,
  sortOrder: index, parentId: null, moduleIds: []
}))
