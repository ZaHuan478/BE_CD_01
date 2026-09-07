INSERT INTO Permission (PermissionCode, PermissionName, Description) VALUES
  ('sop.read', 'Xem nội dung', 'Xem module, SOP và tài liệu đã xuất bản'),
  ('sop.create', 'Tạo SOP', 'Tạo SOP và phiên bản nháp'),
  ('sop.edit', 'Biên tập SOP', 'Chỉnh sửa phiên bản nháp'),
  ('sop.review', 'Duyệt SOP', 'Duyệt hoặc từ chối phiên bản'),
  ('sop.publish', 'Xuất bản SOP', 'Xuất bản phiên bản đã duyệt'),
  ('module.manage', 'Quản lý module', 'Tạo và cập nhật module'),
  ('permission.manage', 'Quản lý truy cập', 'Cấp module và quyền hệ thống cho người dùng')
ON DUPLICATE KEY UPDATE PermissionCode = Permission.PermissionCode;

INSERT INTO Account (
  AccountId, ExternalSubject, EmployeeCode, Username, FullName, Email, SystemRole,
  CompanyName, DivisionName, DepartmentName, JobTitle, IsActive
) VALUES
  ('demo-admin', 'demo-admin', 'ADMIN-001', 'demo-admin', 'Quản trị iSOP', 'admin.demo@hrm.local', 'ADMIN',
   'LTA', 'Khối quản trị', 'Phòng nhân sự', 'Quản trị hệ thống', TRUE),
  ('demo-employee', 'demo-employee', 'EMP-001', 'demo-employee', 'Nhân viên mẫu', 'employee.demo@hrm.local', 'USER',
   'LTA', 'Khối vận hành', 'Phòng vận hành', 'Nhân viên', TRUE)
ON DUPLICATE KEY UPDATE AccountId = Account.AccountId;

INSERT INTO UserGroup (GroupId, GroupCode, GroupName, Description, IsActive) VALUES
  ('group-admin', 'ADMIN', 'Quản trị hệ thống', 'Quản trị tài khoản, module và toàn bộ vòng đời SOP', TRUE),
  ('group-content-editor', 'CONTENT_EDITOR', 'Biên tập nội dung', 'Tạo và chỉnh sửa nội dung SOP', TRUE)
ON DUPLICATE KEY UPDATE GroupId = UserGroup.GroupId;

INSERT INTO AccountGroup (AccountId, GroupId) VALUES ('demo-admin', 'group-admin')
ON DUPLICATE KEY UPDATE AccountId = AccountGroup.AccountId;

INSERT INTO AccessGrant (AccessGrantId, GroupId, PermissionCode, ScopeType, ScopeId)
SELECT CONCAT('grant-admin-', PermissionCode), 'group-admin', PermissionCode, 'system', '*'
FROM Permission
ON DUPLICATE KEY UPDATE AccessGrantId = AccessGrant.AccessGrantId;

INSERT INTO HrModule (ModuleId, ModuleCode, Title, Description, ModuleType, Status, IsCommon, SortOrder) VALUES
  ('common', 'COMMON', 'Thông tin chung', 'Quy định và hướng dẫn áp dụng cho toàn công ty', 'foundation', 'published', TRUE, 0),
  ('ats', 'REC', 'Tuyển dụng', 'Quy trình tuyển dụng và tiếp nhận ứng viên', 'business', 'published', FALSE, 10),
  ('emp', 'EMP', 'Hồ sơ nhân viên', 'Quản lý thông tin và vòng đời hồ sơ nhân viên', 'business', 'published', FALSE, 20),
  ('onb', 'ONB', 'Tiếp nhận nhân viên', 'Quy trình onboarding nhân viên mới', 'business', 'published', FALSE, 30),
  ('att', 'ATT', 'Chấm công', 'Quy định và quy trình chấm công', 'business', 'published', FALSE, 40),
  ('leave', 'LEV', 'Nghỉ phép', 'Quy định và quy trình nghỉ phép', 'business', 'published', FALSE, 50),
  ('pay', 'PAY', 'Tiền lương', 'Quy trình tính và chi trả lương', 'business', 'published', FALSE, 60),
  ('ins', 'INS', 'Bảo hiểm', 'Quy trình bảo hiểm và phúc lợi', 'business', 'published', FALSE, 70),
  ('tax', 'TAX', 'Thuế thu nhập cá nhân', 'Quy trình thuế thu nhập cá nhân', 'business', 'published', FALSE, 80),
  ('ess', 'ESS', 'Dịch vụ nhân viên', 'Các tiện ích và hướng dẫn tự phục vụ', 'business', 'published', FALSE, 90)
ON DUPLICATE KEY UPDATE ModuleId = HrModule.ModuleId;

INSERT INTO AccountModuleAccess (
  AccountModuleAccessId, AccountId, ModuleId, GrantSource, GrantedBy
)
SELECT CONCAT('ama-admin-', ModuleId), 'demo-admin', ModuleId, 'manual', 'demo-admin'
FROM HrModule
ON DUPLICATE KEY UPDATE AccountModuleAccessId = AccountModuleAccess.AccountModuleAccessId;

INSERT INTO AccountModuleAccess (
  AccountModuleAccessId, AccountId, ModuleId, GrantSource, GrantedBy
) VALUES
  ('ama-employee-common', 'demo-employee', 'common', 'manual', 'demo-admin'),
  ('ama-employee-emp', 'demo-employee', 'emp', 'manual', 'demo-admin'),
  ('ama-employee-att', 'demo-employee', 'att', 'manual', 'demo-admin'),
  ('ama-employee-leave', 'demo-employee', 'leave', 'manual', 'demo-admin'),
  ('ama-employee-ess', 'demo-employee', 'ess', 'manual', 'demo-admin')
ON DUPLICATE KEY UPDATE AccountModuleAccessId = AccountModuleAccess.AccountModuleAccessId;

INSERT INTO MenuItem (
  MenuItemId, ParentMenuItemId, MenuCode, Title, RoutePath, IconName,
  RequiredPermissionCode, SortOrder, IsVisible
) VALUES
  ('menu-overview', NULL, 'overview-dashboard', 'Tổng quan', '/employee-lifecycle', 'LayoutDashboard', NULL, 10, TRUE),
  ('menu-lifecycle', NULL, 'employee-lifecycle', 'Vòng đời nhân viên', '/employee-lifecycle', 'Workflow', 'sop.read', 20, TRUE),
  ('menu-policies', NULL, 'policy-center', 'Quy định & Tuân thủ', '/employee-lifecycle/policies', 'ShieldCheck', 'sop.read', 30, TRUE),
  ('menu-process-library', NULL, 'process-library', 'Thư viện quy trình', '/employee-lifecycle?tab=process-library&cluster=core', 'BookOpen', 'sop.read', 40, TRUE),
  ('menu-admin', NULL, 'access-admin', 'Quản lý truy cập', '/admin/access', 'Settings', 'permission.manage', 90, TRUE)
ON DUPLICATE KEY UPDATE MenuItemId = MenuItem.MenuItemId;

INSERT IGNORE INTO MenuModule (MenuItemId, ModuleId)
SELECT menu.MenuItemId, module.ModuleId
FROM MenuItem menu
CROSS JOIN HrModule module
WHERE menu.MenuItemId IN ('menu-lifecycle', 'menu-policies', 'menu-process-library');
