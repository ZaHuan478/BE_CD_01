CREATE TABLE dbo.MenuModule (
  MenuItemId NVARCHAR(100) NOT NULL,
  ModuleId NVARCHAR(100) NOT NULL,
  CONSTRAINT PK_MenuModule PRIMARY KEY (MenuItemId, ModuleId),
  CONSTRAINT FK_MenuModule_MenuItem FOREIGN KEY (MenuItemId) REFERENCES dbo.MenuItem(MenuItemId) ON DELETE CASCADE,
  CONSTRAINT FK_MenuModule_Module FOREIGN KEY (ModuleId) REFERENCES dbo.HrModule(ModuleId) ON DELETE CASCADE
);

MERGE dbo.HrModule AS target
USING (VALUES
  ('ats', 'REC', N'Tuyển dụng', N'Từ nhu cầu nhân sự đến khi ứng viên nhận việc.', 'core', 10),
  ('emp', 'EMP', N'Nhân sự', N'Hồ sơ, hợp đồng và biến động nhân sự.', 'core', 20),
  ('onb', 'ONB', N'Onboarding', N'Tiếp nhận và hội nhập nhân viên.', 'core', 30),
  ('att', 'ATT', N'Chấm công', N'Ghi nhận và kiểm soát thời gian làm việc.', 'operations', 40),
  ('leave', 'LEV', N'Nghỉ phép', N'Đăng ký, phê duyệt và theo dõi nghỉ phép.', 'operations', 50),
  ('pay', 'PAY', N'Tiền lương', N'Tính, kiểm tra và chốt lương.', 'operations', 60),
  ('ins', 'INS', N'Bảo hiểm', N'Nghiệp vụ bảo hiểm người lao động.', 'operations', 70),
  ('tax', 'TAX', N'Thuế', N'Nghiệp vụ thuế thu nhập cá nhân.', 'operations', 80),
  ('ess', 'ESS', N'ESS/MSS', N'Tiện ích tự phục vụ cho nhân viên và quản lý.', 'support', 90)
) AS source(ModuleId, ModuleCode, Title, Description, ModuleType, SortOrder)
ON target.ModuleId = source.ModuleId
WHEN MATCHED THEN UPDATE SET
  ModuleCode = source.ModuleCode,
  Title = source.Title,
  Description = source.Description,
  ModuleType = source.ModuleType,
  Status = 'published',
  SortOrder = source.SortOrder,
  UpdatedAt = SYSUTCDATETIME()
WHEN NOT MATCHED THEN INSERT (
  ModuleId, ModuleCode, Title, Description, ModuleType, Status, SortOrder
) VALUES (
  source.ModuleId, source.ModuleCode, source.Title, source.Description,
  source.ModuleType, 'published', source.SortOrder
);

UPDATE dbo.MenuItem SET MenuCode = 'overview-dashboard', Title = N'Tổng quan hệ thống', RoutePath = '/employee-lifecycle', SortOrder = 10
WHERE MenuItemId = 'menu-overview';
UPDATE dbo.MenuItem SET MenuCode = 'sop-specs-matrix', Title = N'Danh sách quy trình', RoutePath = '/employee-lifecycle', SortOrder = 80
WHERE MenuItemId = 'menu-sops';
UPDATE dbo.MenuItem SET MenuCode = 'policy-center', Title = N'Quy định & Tuân thủ', RoutePath = '/employee-lifecycle/policies', SortOrder = 60
WHERE MenuItemId = 'menu-policies';

MERGE dbo.MenuItem AS target
USING (VALUES
  ('menu-master-data', 'layer-1-master-data', N'Danh mục dùng chung', '/employee-lifecycle/masterdata', 'Database', 'sop.read', 20),
  ('menu-lifecycle', 'layer-2-lifecycle', N'Vòng đời nhân sự', '/employee-lifecycle/journey', 'Layers', 'sop.read', 30),
  ('menu-operations', 'layer-3-operations', N'Nghiệp vụ phát sinh', '/employee-lifecycle/operations', 'GitBranch', 'sop.read', 40),
  ('menu-support', 'system-support', N'Tiện ích hỗ trợ', '/employee-lifecycle/operations', 'HelpCircle', 'sop.read', 50),
  ('menu-erd', 'open-erd-modal', N'Sơ đồ dữ liệu', '/employee-lifecycle/erd', 'Sparkles', 'sop.read', 70)
) AS source(MenuItemId, MenuCode, Title, RoutePath, IconName, RequiredPermissionCode, SortOrder)
ON target.MenuItemId = source.MenuItemId
WHEN MATCHED THEN UPDATE SET
  MenuCode = source.MenuCode,
  Title = source.Title,
  RoutePath = source.RoutePath,
  IconName = source.IconName,
  RequiredPermissionCode = source.RequiredPermissionCode,
  SortOrder = source.SortOrder,
  IsVisible = 1
WHEN NOT MATCHED THEN INSERT (
  MenuItemId, ParentMenuItemId, MenuCode, Title, RoutePath, IconName,
  RequiredPermissionCode, SortOrder, IsVisible
) VALUES (
  source.MenuItemId, NULL, source.MenuCode, source.Title, source.RoutePath,
  source.IconName, source.RequiredPermissionCode, source.SortOrder, 1
);

INSERT INTO dbo.MenuModule(MenuItemId, ModuleId)
SELECT menu.MenuItemId, module.ModuleId
FROM dbo.MenuItem menu
CROSS JOIN dbo.HrModule module
WHERE menu.MenuItemId IN ('menu-overview', 'menu-master-data', 'menu-policies', 'menu-erd', 'menu-sops');

INSERT INTO dbo.MenuModule(MenuItemId, ModuleId)
VALUES
  ('menu-lifecycle', 'ats'), ('menu-lifecycle', 'emp'), ('menu-lifecycle', 'onb'),
  ('menu-operations', 'att'), ('menu-operations', 'leave'), ('menu-operations', 'pay'),
  ('menu-operations', 'ins'), ('menu-operations', 'tax'),
  ('menu-support', 'ess');

INSERT INTO dbo.Account(AccountId, Username, FullName, Email, IsActive)
VALUES
  ('demo-hr', 'demo-hr', N'Nguyễn Hồng Nhân sự', 'hr.demo@example.local', 1),
  ('demo-accounting', 'demo-accounting', N'Trần Minh Kế toán', 'accounting.demo@example.local', 1);

INSERT INTO dbo.UserGroup(GroupId, GroupCode, GroupName, Description, IsActive)
VALUES
  ('group-hr', 'HR_EDITOR', N'Nhóm Nhân sự', N'Xem và hiệu chỉnh SOP thuộc nghiệp vụ nhân sự.', 1),
  ('group-accounting', 'ACCOUNTING_EDITOR', N'Nhóm Kế toán', N'Xem và hiệu chỉnh SOP lương, bảo hiểm và thuế.', 1);

INSERT INTO dbo.AccountGroup(AccountId, GroupId)
VALUES ('demo-hr', 'group-hr'), ('demo-accounting', 'group-accounting');

INSERT INTO dbo.AccessGrant(AccessGrantId, GroupId, PermissionCode, ScopeType, ScopeId)
SELECT CONCAT('grant-hr-read-', ModuleId), 'group-hr', 'sop.read', 'module', ModuleId
FROM dbo.HrModule WHERE ModuleId IN ('ats', 'emp', 'onb', 'att', 'leave', 'ess');

INSERT INTO dbo.AccessGrant(AccessGrantId, GroupId, PermissionCode, ScopeType, ScopeId)
SELECT CONCAT('grant-hr-edit-', ModuleId), 'group-hr', 'sop.edit', 'module', ModuleId
FROM dbo.HrModule WHERE ModuleId IN ('ats', 'emp', 'onb', 'att', 'leave');

INSERT INTO dbo.AccessGrant(AccessGrantId, GroupId, PermissionCode, ScopeType, ScopeId)
SELECT CONCAT('grant-acc-read-', ModuleId), 'group-accounting', 'sop.read', 'module', ModuleId
FROM dbo.HrModule WHERE ModuleId IN ('pay', 'ins', 'tax', 'ess');

INSERT INTO dbo.AccessGrant(AccessGrantId, GroupId, PermissionCode, ScopeType, ScopeId)
SELECT CONCAT('grant-acc-edit-', ModuleId), 'group-accounting', 'sop.edit', 'module', ModuleId
FROM dbo.HrModule WHERE ModuleId IN ('pay', 'ins', 'tax');

CREATE INDEX IX_MenuModule_ModuleId ON dbo.MenuModule(ModuleId, MenuItemId);
