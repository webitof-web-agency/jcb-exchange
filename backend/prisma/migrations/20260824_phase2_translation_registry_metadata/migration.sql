-- Step 1: Add columns (all idempotent via IF NOT EXISTS)
ALTER TABLE "translation_key_registry"
  ADD COLUMN IF NOT EXISTS "namespace" TEXT;

ALTER TABLE "translation_key_registry"
  ADD COLUMN IF NOT EXISTS "first_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "translation_key_registry"
  ADD COLUMN IF NOT EXISTS "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Step 2: Backfill namespace only for rows where it is still NULL.
-- (first_seen_at / last_seen_at already have a NOT NULL DEFAULT so they are
--  never NULL after the ADD COLUMN above; we no longer reference created_at /
--  updated_at in the WHERE clause to avoid a useless full-table scan.)
UPDATE "translation_key_registry"
SET
  "namespace"     = COALESCE(NULLIF(split_part("translation_key", '.', 1), ''), 'general'),
  "first_seen_at" = COALESCE("first_seen_at", "created_at", CURRENT_TIMESTAMP),
  "last_seen_at"  = COALESCE("last_seen_at",  "updated_at", "created_at", CURRENT_TIMESTAMP)
WHERE "namespace" IS NULL;

-- Step 3: Enforce NOT NULL on namespace only if it is not already NOT NULL.
-- Using a DO block so the migration is safe to re-run after a partial failure.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name   = 'translation_key_registry'
      AND column_name  = 'namespace'
      AND is_nullable  = 'YES'
  ) THEN
    ALTER TABLE "translation_key_registry"
      ALTER COLUMN "namespace" SET NOT NULL;
  END IF;
END;
$$;

-- Step 4: Create indexes (both idempotent via IF NOT EXISTS)
CREATE INDEX IF NOT EXISTS "translation_key_registry_app_namespace_idx"
  ON "translation_key_registry"("app", "namespace");

CREATE INDEX IF NOT EXISTS "translation_key_registry_app_last_seen_at_idx"
  ON "translation_key_registry"("app", "last_seen_at");
