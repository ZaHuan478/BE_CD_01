UPDATE MenuItem
SET RequiredPermissionCode = NULL
WHERE MenuCode = 'policy-center';

DELETE mapping
FROM MenuModule mapping
INNER JOIN MenuItem menu ON menu.MenuItemId = mapping.MenuItemId
WHERE menu.MenuCode = 'policy-center';
