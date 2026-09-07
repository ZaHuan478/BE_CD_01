DELETE mapping
FROM MenuModule mapping
INNER JOIN MenuItem menu ON menu.MenuItemId = mapping.MenuItemId
WHERE menu.MenuCode IN ('sop-specs-matrix', 'sop-catalog')
   OR menu.MenuItemId = 'menu-sops';

DELETE FROM MenuItem
WHERE MenuCode IN ('sop-specs-matrix', 'sop-catalog')
   OR MenuItemId = 'menu-sops';