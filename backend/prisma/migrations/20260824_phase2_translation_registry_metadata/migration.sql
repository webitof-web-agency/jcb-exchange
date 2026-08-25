ALTER TABLE "translation_key_registry"
  ADD COLUMN IF NOT EXISTS "namespace" TEXT;

ALTER TABLE "translation_key_registry"
  ADD COLUMN IF NOT EXISTS "first_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "translation_key_registry"
  ADD COLUMN IF NOT EXISTS "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE "translation_key_registry"
SET
  "namespace" = COALESCE(NULLIF(split_part("translation_key", '.', 1), ''), 'general'),
  "first_seen_at" = COALESCE("first_seen_at", "created_at", CURRENT_TIMESTAMP),
  "last_seen_at" = COALESCE("last_seen_at", "updated_at", "created_at", CURRENT_TIMESTAMP)
WHERE
  "namespace" IS NULL
  OR "first_seen_at" IS NULL
  OR "last_seen_at" IS NULL;

ALTER TABLE "translation_key_registry"
  ALTER COLUMN "namespace" SET NOT NULL;

CREATE INDEX IF NOT EXISTS "translation_key_registry_app_namespace_idx"
  ON "translation_key_registry"("app", "namespace");

CREATE INDEX IF NOT EXISTS "translation_key_registry_app_last_seen_at_idx"
  ON "translation_key_registry"("app", "last_seen_at");
