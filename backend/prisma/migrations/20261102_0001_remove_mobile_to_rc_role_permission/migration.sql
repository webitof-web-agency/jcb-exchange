-- Mobile To RC is retired as an active portal service.
-- Keep its verification tables and enum values for historical data, but remove
-- the permission from all current custom roles and direct admin grants.
UPDATE "CustomRole"
SET "permissions" = array_remove("permissions", 'rc.mobile-to-rc.read')
WHERE 'rc.mobile-to-rc.read' = ANY("permissions");

DELETE FROM "AdminPermission"
WHERE "permission" = 'rc.mobile-to-rc.read';
