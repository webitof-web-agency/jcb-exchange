-- Phase 6: durable daily briefing leases, notification outbox, and AI rate limiting.
-- Additive migration. Apply after 20261109_0001_ai_database_layer through the
-- normal staging/change-management process; this file is not applied by Codex.

ALTER TABLE "AiDailyBriefing"
  ADD COLUMN "provider" VARCHAR(40),
  ADD COLUMN "timezone" VARCHAR(64) NOT NULL DEFAULT 'Asia/Kolkata',
  ADD COLUMN "attemptCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "nextAttemptAt" TIMESTAMP(3),
  ADD COLUMN "lockToken" VARCHAR(64),
  ADD COLUMN "lockedUntil" TIMESTAMP(3),
  ADD COLUMN "lastErrorRedacted" VARCHAR(2000);

DROP INDEX IF EXISTS "AiDailyBriefing_status_expiresAt_idx";
CREATE INDEX "AiDailyBriefing_status_nextAttemptAt_idx" ON "AiDailyBriefing"("status", "nextAttemptAt");
CREATE INDEX "AiDailyBriefing_lockedUntil_idx" ON "AiDailyBriefing"("lockedUntil");

CREATE TYPE "AiBriefingNotificationStatus" AS ENUM ('PENDING', 'PROCESSING', 'DELIVERED', 'FAILED');

CREATE TABLE "AiBriefingNotification" (
  "id" TEXT NOT NULL,
  "briefingId" TEXT NOT NULL,
  "recipientUserId" TEXT NOT NULL,
  "status" "AiBriefingNotificationStatus" NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "nextAttemptAt" TIMESTAMP(3),
  "lockToken" VARCHAR(64),
  "lockedUntil" TIMESTAMP(3),
  "lastErrorCode" VARCHAR(100),
  "deliveredAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AiBriefingNotification_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AiBriefingNotification_briefingId_recipientUserId_key"
  ON "AiBriefingNotification"("briefingId", "recipientUserId");
CREATE INDEX "AiBriefingNotification_status_nextAttemptAt_idx"
  ON "AiBriefingNotification"("status", "nextAttemptAt");
CREATE INDEX "AiBriefingNotification_lockedUntil_idx"
  ON "AiBriefingNotification"("lockedUntil");

ALTER TABLE "AiBriefingNotification"
  ADD CONSTRAINT "AiBriefingNotification_briefingId_fkey"
  FOREIGN KEY ("briefingId") REFERENCES "AiDailyBriefing"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AiBriefingNotification"
  ADD CONSTRAINT "AiBriefingNotification_recipientUserId_fkey"
  FOREIGN KEY ("recipientUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "AiRateLimitBucket" (
  "id" TEXT NOT NULL,
  "bucketKey" VARCHAR(180) NOT NULL,
  "windowStartedAt" TIMESTAMP(3) NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "requestCount" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AiRateLimitBucket_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AiRateLimitBucket_bucketKey_key" ON "AiRateLimitBucket"("bucketKey");
CREATE INDEX "AiRateLimitBucket_expiresAt_idx" ON "AiRateLimitBucket"("expiresAt");

ALTER TABLE "Notification" ADD COLUMN "dedupeKey" TEXT;
CREATE UNIQUE INDEX "Notification_dedupeKey_key" ON "Notification"("dedupeKey");
