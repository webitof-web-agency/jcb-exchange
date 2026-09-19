-- Admin permissions are user-configurable strings. Keep the database contract
-- extensible so new module permissions do not require a PostgreSQL enum change.
ALTER TABLE "AdminPermission"
ALTER COLUMN "permission" TYPE TEXT USING "permission"::text;

DROP TYPE IF EXISTS "AdminPermissionKey";
