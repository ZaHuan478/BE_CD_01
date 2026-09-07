import type { MenuItemDto } from '../repositories/me.repository.js'

// UI navigation is configuration, not an authorization source.
export const coreMenu: MenuItemDto[] = [
  ['overview-dashboard', 'Tổng quan', '/employee-lifecycle', 'LayoutDashboard', 'sop.read'],
  ['layer-1-master-data', 'Dữ liệu nền tảng', '/employee-lifecycle/masterdata', 'Database', 'sop.read'],
  ['layer-2-lifecycle', 'Vòng đời nhân sự', '/employee-lifecycle/journey', 'Layers', 'sop.read'],
  ['layer-3-operations', 'Vận hành', '/employee-lifecycle/operations', 'GitBranch', 'sop.read'],
  ['system-support', 'Hỗ trợ hệ thống', '/employee-lifecycle/operations', 'Settings', 'sop.read'],
  ['process-library', 'Thư viện quy trình', '/employee-lifecycle?tab=process-library&cluster=core', 'BookOpen', 'sop.read'],
  ['policy-center', 'Quy định', '/employee-lifecycle/policies', 'ShieldCheck', 'sop.read'],
  ['ADMIN', 'Quản trị', '/employee-lifecycle/admin', 'Users', 'permission.manage']
].map(([code, title, routePath, iconName, requiredPermissionCode], index) => ({
  id: code!, code: code!, title: title!, routePath: routePath!, iconName: iconName!, requiredPermissionCode: requiredPermissionCode!,
  sortOrder: index, parentId: null, moduleIds: []
}))
