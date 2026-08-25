CREATE TABLE IF NOT EXISTS "translation_key_registry" (
  "id" TEXT NOT NULL,
  "app" TEXT NOT NULL,
  "translation_key" TEXT NOT NULL,
  "base_value" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "translation_key_registry_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "translation_key_registry_app_translation_key_key"
  ON "translation_key_registry"("app", "translation_key");

CREATE INDEX IF NOT EXISTS "translation_key_registry_app_idx"
  ON "translation_key_registry"("app");
