-- Phase 2: persist the provenance and freshness timestamp for database-backed answers.
-- Nullable columns keep this migration backward-compatible with existing assistant messages.

ALTER TABLE "AiConversationMessage"
  ADD COLUMN "toolSource" VARCHAR(40),
  ADD COLUMN "toolFetchedAt" TIMESTAMP(3);
