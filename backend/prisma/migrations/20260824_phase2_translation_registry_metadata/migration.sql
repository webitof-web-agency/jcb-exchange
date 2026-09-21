-- ============================================================
-- SAFETY: Ensure the base table exists before adding columns.
-- This migration can run before 20260824_translation_key_registry
-- alphabetically (p < t), so we create it here if missing.
-- The base migration uses CREATE TABLE IF NOT EXISTS, so no conflict.
-- ============================================================
CREATE TABLE IF NOT EXISTS "translation_key_registry" (
  "id"              TEXT        NOT NULL,
  "app"             TEXT        NOT NULL,
  "translation_key" TEXT        NOT NULL,
  "base_value"      TEXT        NOT NULL,
  "created_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "translation_key_registry_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "translation_key_registry_app_translation_key_key"
  ON "translation_key_registry"("app", "translation_key");

CREATE INDEX IF NOT EXISTS "translation_key_registry_app_idx"
  ON "translation_key_registry"("app");

-- ============================================================
-- Step 1: Add metadata columns (idempotent via IF NOT EXISTS)
-- ============================================================
ALTER TABLE "translation_key_registry"
  ADD COLUMN IF NOT EXISTS "namespace" TEXT;

ALTER TABLE "translation_key_registry"
  ADD COLUMN IF NOT EXISTS "first_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "translation_key_registry"
  ADD COLUMN IF NOT EXISTS "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- ============================================================
-- Step 2: Backfill namespace for any rows where it is NULL.
-- first_seen_at / last_seen_at are NOT NULL DEFAULT so never NULL.
-- ============================================================
UPDATE "translation_key_registry"
SET
  "namespace"     = COALESCE(NULLIF(split_part("translation_key", '.', 1), ''), 'general'),
  "first_seen_at" = COALESCE("first_seen_at", "created_at", CURRENT_TIMESTAMP),
  "last_seen_at"  = COALESCE("last_seen_at",  "updated_at", "created_at", CURRENT_TIMESTAMP)
WHERE "namespace" IS NULL;

-- ============================================================
-- Step 3: Set namespace NOT NULL only if still nullable.
-- DO block makes this safe to re-run after a partial failure.
-- ============================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name  = 'translation_key_registry'
      AND column_name = 'namespace'
      AND is_nullable = 'YES'
  ) THEN
    ALTER TABLE "translation_key_registry"
      ALTER COLUMN "namespace" SET NOT NULL;
  END IF;
END;
$$;

-- ============================================================
-- Step 4: Create indexes (idempotent via IF NOT EXISTS)
-- ============================================================
CREATE INDEX IF NOT EXISTS "translation_key_registry_app_namespace_idx"
  ON "translation_key_registry"("app", "namespace");

CREATE INDEX IF NOT EXISTS "translation_key_registry_app_last_seen_at_idx"
  ON "translation_key_registry"("app", "last_seen_at");
