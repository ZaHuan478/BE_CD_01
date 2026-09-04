INSERT INTO dbo.Permission(PermissionCode, PermissionName, Description)
VALUES
  ('sop.read', N'Xem SOP', N'Xem SOP trong phạm vi được cấp'),
  ('sop.create', N'Tạo SOP', N'Tạo SOP và phiên bản nháp đầu tiên'),
  ('sop.edit', N'Chỉnh sửa SOP', N'Chỉnh sửa phiên bản nháp'),
  ('sop.review', N'Duyệt SOP', N'Gửi duyệt, duyệt hoặc từ chối SOP'),
  ('sop.publish', N'Xuất bản SOP', N'Xuất bản và lưu trữ phiên bản SOP'),
  ('module.manage', N'Quản lý phân hệ', N'Tạo và chỉnh sửa phân hệ'),
  ('permission.manage', N'Quản lý phân quyền', N'Quản lý nhóm và phạm vi quyền');

INSERT INTO dbo.Account(AccountId, Username, FullName, IsActive)
VALUES ('demo-admin', 'demo-admin', N'Demo Administrator', 1);

INSERT INTO dbo.UserGroup(GroupId, GroupCode, GroupName, Description)
VALUES ('group-admin', 'ADMIN', N'Quản trị hệ thống', N'Nhóm quản trị dùng trong môi trường phát triển');

INSERT INTO dbo.AccountGroup(AccountId, GroupId)
VALUES ('demo-admin', 'group-admin');

INSERT INTO dbo.AccessGrant(AccessGrantId, GroupId, PermissionCode, ScopeType, ScopeId)
SELECT CONCAT('grant-admin-', REPLACE(PermissionCode, '.', '-')), 'group-admin', PermissionCode, 'system', '*'
FROM dbo.Permission;

INSERT INTO dbo.MenuItem(MenuItemId, ParentMenuItemId, MenuCode, Title, RoutePath, IconName, RequiredPermissionCode, SortOrder)
VALUES
  ('menu-overview', NULL, 'OVERVIEW', N'Tổng quan', '/employee-lifecycle', 'Layers', 'sop.read', 10),
  ('menu-sops', NULL, 'SOPS', N'Kho SOP', '/employee-lifecycle/workbench', 'BookOpen', 'sop.read', 20),
  ('menu-policies', NULL, 'POLICIES', N'Chính sách', '/employee-lifecycle/policies', 'ShieldCheck', 'sop.read', 30),
  ('menu-admin', NULL, 'ADMIN', N'Quản trị', NULL, 'Settings', 'permission.manage', 90);
