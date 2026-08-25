CREATE TABLE IF NOT EXISTS "translation_overrides" (
  "id" TEXT NOT NULL,
  "app" TEXT NOT NULL,
  "locale" TEXT NOT NULL,
  "translation_key" TEXT NOT NULL,
  "value" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "translation_overrides_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "translation_overrides_app_locale_translation_key_key"
  ON "translation_overrides"("app", "locale", "translation_key");

CREATE INDEX IF NOT EXISTS "translation_overrides_app_locale_idx"
  ON "translation_overrides"("app", "locale");
