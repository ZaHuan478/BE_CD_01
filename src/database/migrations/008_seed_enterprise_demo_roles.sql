SET NOCOUNT ON;

-- Menu permissions keep role-specific navigation separate from module-level SOP access.
MERGE dbo.Permission AS target
USING (VALUES
  ('menu.overview',   N'Xem Tổng quan hệ thống',       N'Hiển thị khu vực Tổng quan hệ thống trên Sidebar'),
  ('menu.masterdata', N'Xem Danh mục dùng chung',      N'Hiển thị khu vực Danh mục dùng chung trên Sidebar'),
  ('menu.lifecycle',  N'Xem Vòng đời nhân sự',         N'Hiển thị khu vực Vòng đời nhân sự trên Sidebar'),
  ('menu.operations', N'Xem Nghiệp vụ phát sinh',      N'Hiển thị khu vực Nghiệp vụ phát sinh trên Sidebar'),
  ('menu.support',    N'Xem Tiện ích hỗ trợ',          N'Hiển thị khu vực Tiện ích hỗ trợ trên Sidebar'),
  ('menu.policies',   N'Xem Quy định và Tuân thủ',     N'Hiển thị khu vực Quy định và Tuân thủ trên Sidebar'),
  ('menu.erd',        N'Xem Sơ đồ dữ liệu',            N'Hiển thị khu vực Sơ đồ dữ liệu trên Sidebar'),
  ('menu.sops',       N'Xem Danh sách quy trình SOP',  N'Hiển thị khu vực tra cứu quy trình SOP trên Sidebar')
) AS source(PermissionCode, PermissionName, Description)
ON target.PermissionCode = source.PermissionCode
WHEN MATCHED THEN UPDATE SET
  PermissionName = source.PermissionName,
  Description = source.Description
WHEN NOT MATCHED THEN INSERT (PermissionCode, PermissionName, Description)
VALUES (source.PermissionCode, source.PermissionName, source.Description);

MERGE dbo.UserGroup AS target
USING (VALUES
  ('group-admin',      'ADMIN',             N'Quản trị hệ thống',        N'Toàn quyền cấu hình và quản trị hệ thống'),
  ('group-bom',        'BOM',               N'Ban Giám Đốc',             N'Xem tổng quan, báo cáo điều hành và duyệt cấp cao'),
  ('group-hr-admin',   'HR_ADMIN',          N'Quản trị nhân sự',         N'Quản lý hồ sơ, hợp đồng và biến động nhân sự'),
  ('group-recruiter',  'RECRUITER',         N'Chuyên viên tuyển dụng',   N'Đăng tuyển, quản lý ứng viên và tiếp nhận'),
  ('group-attendance', 'TIMEKEEPER',        N'Chuyên viên chấm công',    N'Quản lý ca kíp, dữ liệu chấm công và ngày phép'),
  ('group-cb',         'CB_SPECIALIST',      N'Chuyên viên C&B / Lương',  N'Tính lương, thưởng, thuế và chính sách thu nhập'),
  ('group-insurance',  'INSURANCE_OFFICER', N'Chuyên viên bảo hiểm',     N'Quản lý hồ sơ, báo tăng giảm và chế độ bảo hiểm'),
  ('group-manager',    'LINE_MANAGER',      N'Trưởng bộ phận',           N'Duyệt phép, tăng ca và đánh giá nhân viên trực thuộc'),
  ('group-employee',   'EMPLOYEE',          N'Nhân viên',                N'Cổng tự phục vụ ESS: hồ sơ, đơn từ và phiếu lương')
) AS source(GroupId, GroupCode, GroupName, Description)
ON target.GroupId = source.GroupId
WHEN MATCHED THEN UPDATE SET
  GroupCode = source.GroupCode,
  GroupName = source.GroupName,
  Description = source.Description,
  IsActive = 1
WHEN NOT MATCHED THEN INSERT (GroupId, GroupCode, GroupName, Description, IsActive)
VALUES (source.GroupId, source.GroupCode, source.GroupName, source.Description, 1);

MERGE dbo.Account AS target
USING (VALUES
  ('demo-admin',      'demo-admin',      N'Lê Quản Trị',                    'admin.demo@hrm.local'),
  ('demo-bom',        'demo-bom',        N'Trần Tổng Giám Đốc',             'ceo.demo@hrm.local'),
  ('demo-hr-admin',   'demo-hr-admin',   N'Nguyễn Thị Hồng Nhân Sự',        'hr.admin@hrm.local'),
  ('demo-recruiter',  'demo-recruiter',  N'Phạm Tuyển Dụng',                'recruiter@hrm.local'),
  ('demo-attendance', 'demo-attendance', N'Đỗ Minh Chấm Công',              'timekeeper@hrm.local'),
  ('demo-cb',         'demo-cb',         N'Vũ Thị C&B Tiền Lương',          'payroll@hrm.local'),
  ('demo-insurance',  'demo-insurance',  N'Hoàng Bảo Hiểm',                 'insurance@hrm.local'),
  ('demo-manager',    'demo-manager',    N'Đặng Trưởng Phòng Kinh Doanh',   'manager@hrm.local'),
  ('demo-employee',   'demo-employee',   N'Ngô Văn Nhân Viên',              'employee@hrm.local')
) AS source(AccountId, Username, FullName, Email)
ON target.AccountId = source.AccountId
WHEN MATCHED THEN UPDATE SET
  Username = source.Username,
  FullName = source.FullName,
  Email = source.Email,
  IsActive = 1,
  UpdatedAt = SYSUTCDATETIME()
WHEN NOT MATCHED THEN INSERT (AccountId, Username, FullName, Email, IsActive)
VALUES (source.AccountId, source.Username, source.FullName, source.Email, 1);

MERGE dbo.AccountGroup AS target
USING (VALUES
  ('demo-admin',      'group-admin'),
  ('demo-bom',        'group-bom'),
  ('demo-hr-admin',   'group-hr-admin'),
  ('demo-recruiter',  'group-recruiter'),
  ('demo-attendance', 'group-attendance'),
  ('demo-cb',         'group-cb'),
  ('demo-insurance',  'group-insurance'),
  ('demo-manager',    'group-manager'),
  ('demo-employee',   'group-employee')
) AS source(AccountId, GroupId)
ON target.AccountId = source.AccountId AND target.GroupId = source.GroupId
WHEN MATCHED THEN UPDATE SET ValidFrom = NULL, ValidTo = NULL
WHEN NOT MATCHED THEN INSERT (AccountId, GroupId) VALUES (source.AccountId, source.GroupId);

-- Rebuild only grants owned by the nine enterprise demo groups.
DELETE FROM dbo.AccessGrant
WHERE GroupId IN (
  'group-admin', 'group-bom', 'group-hr-admin', 'group-recruiter',
  'group-attendance', 'group-cb', 'group-insurance', 'group-manager', 'group-employee'
);

-- Administrator receives every permission at system scope, including future menu permissions above.
INSERT INTO dbo.AccessGrant (AccessGrantId, GroupId, PermissionCode, ScopeType, ScopeId)
SELECT CONCAT('grant-admin-', REPLACE(PermissionCode, '.', '-')), 'group-admin', PermissionCode, 'system', '*'
FROM dbo.Permission;

-- Business module grants.
INSERT INTO dbo.AccessGrant (AccessGrantId, GroupId, PermissionCode, ScopeType, ScopeId) VALUES
  ('grant-bom-read-emp',       'group-bom',        'sop.read',   'module', 'emp'),
  ('grant-bom-read-pay',       'group-bom',        'sop.read',   'module', 'pay'),
  ('grant-bom-read-ess',       'group-bom',        'sop.read',   'module', 'ess'),
  ('grant-bom-review-emp',     'group-bom',        'sop.review', 'module', 'emp'),

  ('grant-hra-read-ats',       'group-hr-admin',   'sop.read',   'module', 'ats'),
  ('grant-hra-read-emp',       'group-hr-admin',   'sop.read',   'module', 'emp'),
  ('grant-hra-read-onb',       'group-hr-admin',   'sop.read',   'module', 'onb'),
  ('grant-hra-edit-emp',       'group-hr-admin',   'sop.edit',   'module', 'emp'),
  ('grant-hra-edit-onb',       'group-hr-admin',   'sop.edit',   'module', 'onb'),

  ('grant-rec-read-ats',       'group-recruiter',  'sop.read',   'module', 'ats'),
  ('grant-rec-read-onb',       'group-recruiter',  'sop.read',   'module', 'onb'),
  ('grant-rec-edit-ats',       'group-recruiter',  'sop.edit',   'module', 'ats'),

  ('grant-att-read-att',       'group-attendance', 'sop.read',   'module', 'att'),
  ('grant-att-read-leave',     'group-attendance', 'sop.read',   'module', 'leave'),
  ('grant-att-read-ess',       'group-attendance', 'sop.read',   'module', 'ess'),
  ('grant-att-edit-att',       'group-attendance', 'sop.edit',   'module', 'att'),

  ('grant-cb-read-pay',        'group-cb',         'sop.read',   'module', 'pay'),
  ('grant-cb-read-ins',        'group-cb',         'sop.read',   'module', 'ins'),
  ('grant-cb-read-tax',        'group-cb',         'sop.read',   'module', 'tax'),
  ('grant-cb-read-ess',        'group-cb',         'sop.read',   'module', 'ess'),
  ('grant-cb-edit-pay',        'group-cb',         'sop.edit',   'module', 'pay'),
  ('grant-cb-edit-tax',        'group-cb',         'sop.edit',   'module', 'tax'),

  ('grant-ins-read-ins',       'group-insurance',  'sop.read',   'module', 'ins'),
  ('grant-ins-read-ess',       'group-insurance',  'sop.read',   'module', 'ess'),
  ('grant-ins-edit-ins',       'group-insurance',  'sop.edit',   'module', 'ins'),

  ('grant-mgr-read-emp',       'group-manager',    'sop.read',   'module', 'emp'),
  ('grant-mgr-read-att',       'group-manager',    'sop.read',   'module', 'att'),
  ('grant-mgr-read-leave',     'group-manager',    'sop.read',   'module', 'leave'),
  ('grant-mgr-read-ess',       'group-manager',    'sop.read',   'module', 'ess'),
  ('grant-mgr-review-att',     'group-manager',    'sop.review', 'module', 'att'),

  ('grant-emp-read-ess',       'group-employee',   'sop.read',   'module', 'ess');

-- Role-specific Sidebar grants match the enterprise position matrix.
INSERT INTO dbo.AccessGrant (AccessGrantId, GroupId, PermissionCode, ScopeType, ScopeId) VALUES
  ('grant-bom-menu-overview',       'group-bom',        'menu.overview',   'system', '*'),
  ('grant-bom-menu-lifecycle',      'group-bom',        'menu.lifecycle',  'system', '*'),
  ('grant-bom-menu-support',        'group-bom',        'menu.support',    'system', '*'),
  ('grant-bom-menu-policies',       'group-bom',        'menu.policies',   'system', '*'),

  ('grant-hra-menu-overview',       'group-hr-admin',   'menu.overview',   'system', '*'),
  ('grant-hra-menu-masterdata',     'group-hr-admin',   'menu.masterdata', 'system', '*'),
  ('grant-hra-menu-lifecycle',      'group-hr-admin',   'menu.lifecycle',  'system', '*'),
  ('grant-hra-menu-policies',       'group-hr-admin',   'menu.policies',   'system', '*'),
  ('grant-hra-menu-sops',           'group-hr-admin',   'menu.sops',       'system', '*'),

  ('grant-rec-menu-lifecycle',      'group-recruiter',  'menu.lifecycle',  'system', '*'),
  ('grant-rec-menu-sops',           'group-recruiter',  'menu.sops',       'system', '*'),

  ('grant-att-menu-overview',       'group-attendance', 'menu.overview',   'system', '*'),
  ('grant-att-menu-operations',     'group-attendance', 'menu.operations', 'system', '*'),
  ('grant-att-menu-sops',           'group-attendance', 'menu.sops',       'system', '*'),

  ('grant-cb-menu-overview',        'group-cb',         'menu.overview',   'system', '*'),
  ('grant-cb-menu-operations',      'group-cb',         'menu.operations', 'system', '*'),
  ('grant-cb-menu-policies',        'group-cb',         'menu.policies',   'system', '*'),
  ('grant-cb-menu-sops',            'group-cb',         'menu.sops',       'system', '*'),

  ('grant-ins-menu-operations',     'group-insurance',  'menu.operations', 'system', '*'),
  ('grant-ins-menu-policies',       'group-insurance',  'menu.policies',   'system', '*'),
  ('grant-ins-menu-sops',           'group-insurance',  'menu.sops',       'system', '*'),

  ('grant-mgr-menu-overview',       'group-manager',    'menu.overview',   'system', '*'),
  ('grant-mgr-menu-support',        'group-manager',    'menu.support',    'system', '*'),
  ('grant-mgr-menu-policies',       'group-manager',    'menu.policies',   'system', '*'),

  ('grant-emp-menu-support',        'group-employee',   'menu.support',    'system', '*'),
  ('grant-emp-menu-policies',       'group-employee',   'menu.policies',   'system', '*');

-- Bind each navigation item to its explicit menu permission.
UPDATE dbo.MenuItem SET RequiredPermissionCode = 'menu.overview'   WHERE MenuItemId = 'menu-overview';
UPDATE dbo.MenuItem SET RequiredPermissionCode = 'menu.masterdata' WHERE MenuItemId = 'menu-master-data';
UPDATE dbo.MenuItem SET RequiredPermissionCode = 'menu.lifecycle'  WHERE MenuItemId = 'menu-lifecycle';
UPDATE dbo.MenuItem SET RequiredPermissionCode = 'menu.operations' WHERE MenuItemId = 'menu-operations';
UPDATE dbo.MenuItem SET RequiredPermissionCode = 'menu.support'    WHERE MenuItemId = 'menu-support';
UPDATE dbo.MenuItem SET RequiredPermissionCode = 'menu.policies'   WHERE MenuItemId = 'menu-policies';
UPDATE dbo.MenuItem SET RequiredPermissionCode = 'menu.erd'        WHERE MenuItemId = 'menu-erd';
UPDATE dbo.MenuItem SET RequiredPermissionCode = 'menu.sops'       WHERE MenuItemId = 'menu-sops';

-- Every functional menu still requires at least one readable associated module.
DELETE FROM dbo.MenuModule
WHERE MenuItemId IN (
  'menu-overview', 'menu-master-data', 'menu-lifecycle', 'menu-operations',
  'menu-support', 'menu-policies', 'menu-erd', 'menu-sops'
);

INSERT INTO dbo.MenuModule (MenuItemId, ModuleId)
SELECT menu.MenuItemId, module.ModuleId
FROM dbo.MenuItem menu
CROSS JOIN dbo.HrModule module
WHERE menu.MenuItemId IN (
  'menu-overview', 'menu-master-data', 'menu-lifecycle', 'menu-operations',
  'menu-support', 'menu-policies', 'menu-erd', 'menu-sops'
);
