-- AI Intelligence Layer: actor-scoped safe memory and data freshness checkpoints.
-- Memory stores redacted operator preferences only; it is never a raw prompt or provider payload.
CREATE TYPE "AiMemorySource" AS ENUM ('EXPLICIT_OPERATOR', 'APPROVED_FEEDBACK');
CREATE TYPE "AiSyncStatus" AS ENUM ('READY', 'FAILED');

CREATE TABLE "AiMemory" (
    "id" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "source" "AiMemorySource" NOT NULL,
    "contentRedacted" VARCHAR(1000) NOT NULL,
    "contentHash" VARCHAR(128) NOT NULL,
    "contentHmac" VARCHAR(128),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "AiMemory_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AiSyncCheckpoint" (
    "id" TEXT NOT NULL,
    "module" VARCHAR(80) NOT NULL,
    "status" "AiSyncStatus" NOT NULL DEFAULT 'READY',
    "recordsObserved" INTEGER NOT NULL DEFAULT 0,
    "lastObservedAt" TIMESTAMP(3),
    "lastSyncedAt" TIMESTAMP(3),
    "errorCode" VARCHAR(100),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiSyncCheckpoint_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AiMemory_actorUserId_contentHash_key" ON "AiMemory"("actorUserId", "contentHash");
CREATE INDEX "AiMemory_actorUserId_updatedAt_idx" ON "AiMemory"("actorUserId", "updatedAt");
CREATE INDEX "AiMemory_expiresAt_idx" ON "AiMemory"("expiresAt");
CREATE UNIQUE INDEX "AiSyncCheckpoint_module_key" ON "AiSyncCheckpoint"("module");
CREATE INDEX "AiSyncCheckpoint_status_updatedAt_idx" ON "AiSyncCheckpoint"("status", "updatedAt");
CREATE INDEX "AiSyncCheckpoint_lastSyncedAt_idx" ON "AiSyncCheckpoint"("lastSyncedAt");

ALTER TABLE "AiMemory"
  ADD CONSTRAINT "AiMemory_actorUserId_fkey"
  FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
