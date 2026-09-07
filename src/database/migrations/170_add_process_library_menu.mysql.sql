INSERT INTO MenuItem (
  MenuItemId, ParentMenuItemId, MenuCode, Title, RoutePath, IconName,
  RequiredPermissionCode, SortOrder, IsVisible
) VALUES (
  'menu-process-library', NULL, 'process-library', 'Thư viện quy trình',
  '/employee-lifecycle?tab=process-library&cluster=core', 'BookOpen',
  'sop.read', 40, TRUE
)
ON DUPLICATE KEY UPDATE
  Title = VALUES(Title),
  RoutePath = VALUES(RoutePath),
  IconName = VALUES(IconName),
  RequiredPermissionCode = VALUES(RequiredPermissionCode),
  SortOrder = VALUES(SortOrder),
  IsVisible = VALUES(IsVisible);

INSERT IGNORE INTO MenuModule (MenuItemId, ModuleId)
SELECT 'menu-process-library', ModuleId
FROM HrModule;
