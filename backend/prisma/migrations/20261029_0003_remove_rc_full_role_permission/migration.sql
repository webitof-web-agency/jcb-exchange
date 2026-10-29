-- RC Full is no longer a separately assignable portal service.
-- Remove it from both custom-role arrays and legacy direct admin permissions.
UPDATE "CustomRole"
SET "permissions" = array_remove("permissions", 'rc.full.read')
WHERE 'rc.full.read' = ANY("permissions");

DELETE FROM "AdminPermission"
WHERE "permission" = 'rc.full.read';
