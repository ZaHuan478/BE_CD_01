DELETE FROM dbo.MenuModule
WHERE MenuItemId = 'menu-policies'
  AND ModuleId IN ('pay', 'ins', 'tax');
