-- Phase 3: prevent an event retry from creating duplicate outbound messages.
ALTER TABLE "whatsapp_message_logs"
  ADD COLUMN IF NOT EXISTS "dedupeKey" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "whatsapp_message_logs_dedupeKey_key"
  ON "whatsapp_message_logs"("dedupeKey");
