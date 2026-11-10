-- Phase 3: additive AI database layer.
-- This migration is intentionally not applied by Codex. Review and run it
-- through the normal staging/change-management process before production.

CREATE TYPE "AiRunStatus" AS ENUM ('RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED');
CREATE TYPE "AiToolCallStatus" AS ENUM ('SUCCEEDED', 'FAILED');
CREATE TYPE "AiActionProposalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'EXPIRED', 'CANCELLED', 'EXECUTED');
CREATE TYPE "AiApprovalDecision" AS ENUM ('APPROVED', 'REJECTED');
CREATE TYPE "AiBriefingStatus" AS ENUM ('GENERATING', 'READY', 'FAILED', 'STALE');

CREATE TABLE "AiRun" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "feature" VARCHAR(80) NOT NULL,
    "status" "AiRunStatus" NOT NULL DEFAULT 'RUNNING',
    "provider" VARCHAR(40) NOT NULL,
    "modelAlias" VARCHAR(120) NOT NULL,
    "promptHash" VARCHAR(128) NOT NULL,
    "responseHash" VARCHAR(128),
    "inputChars" INTEGER NOT NULL DEFAULT 0,
    "outputChars" INTEGER NOT NULL DEFAULT 0,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "outputWords" INTEGER NOT NULL DEFAULT 0,
    "latencyMs" INTEGER,
    "costMicros" BIGINT,
    "errorCode" VARCHAR(100),
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiRun_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AiRun_requestId_key" ON "AiRun"("requestId");
CREATE INDEX "AiRun_actorUserId_createdAt_idx" ON "AiRun"("actorUserId", "createdAt");
CREATE INDEX "AiRun_feature_status_createdAt_idx" ON "AiRun"("feature", "status", "createdAt");
CREATE INDEX "AiRun_createdAt_idx" ON "AiRun"("createdAt");

CREATE TABLE "AiToolCall" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "toolName" VARCHAR(100) NOT NULL,
    "permission" VARCHAR(120) NOT NULL,
    "status" "AiToolCallStatus" NOT NULL,
    "argumentsHash" VARCHAR(128),
    "resultHash" VARCHAR(128),
    "targetType" VARCHAR(80),
    "targetRefHash" VARCHAR(128),
    "inputItemCount" INTEGER,
    "outputItemCount" INTEGER,
    "redactionApplied" BOOLEAN NOT NULL DEFAULT true,
    "durationMs" INTEGER,
    "errorCode" VARCHAR(100),
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiToolCall_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AiToolCall_runId_createdAt_idx" ON "AiToolCall"("runId", "createdAt");
CREATE INDEX "AiToolCall_toolName_createdAt_idx" ON "AiToolCall"("toolName", "createdAt");

CREATE TABLE "AiFeedback" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "commentRedacted" VARCHAR(2000),
    "commentHash" VARCHAR(128),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiFeedback_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AiFeedback_runId_actorUserId_key" ON "AiFeedback"("runId", "actorUserId");
CREATE INDEX "AiFeedback_actorUserId_createdAt_idx" ON "AiFeedback"("actorUserId", "createdAt");

CREATE TABLE "AiActionProposal" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "actionType" VARCHAR(100) NOT NULL,
    "targetType" VARCHAR(80) NOT NULL,
    "targetRef" VARCHAR(160) NOT NULL,
    "payloadHash" VARCHAR(128) NOT NULL,
    "status" "AiActionProposalStatus" NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiActionProposal_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AiActionProposal_requestedById_status_createdAt_idx" ON "AiActionProposal"("requestedById", "status", "createdAt");
CREATE INDEX "AiActionProposal_status_expiresAt_idx" ON "AiActionProposal"("status", "expiresAt");
CREATE INDEX "AiActionProposal_targetType_targetRef_idx" ON "AiActionProposal"("targetType", "targetRef");

CREATE TABLE "AiApproval" (
    "id" TEXT NOT NULL,
    "proposalId" TEXT NOT NULL,
    "approverUserId" TEXT NOT NULL,
    "decision" "AiApprovalDecision" NOT NULL,
    "reasonRedacted" VARCHAR(2000),
    "reasonHash" VARCHAR(128),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiApproval_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AiApproval_proposalId_approverUserId_key" ON "AiApproval"("proposalId", "approverUserId");
CREATE INDEX "AiApproval_approverUserId_createdAt_idx" ON "AiApproval"("approverUserId", "createdAt");

CREATE TABLE "AiDailyBriefing" (
    "id" TEXT NOT NULL,
    "scopeKey" VARCHAR(120) NOT NULL,
    "briefingDate" DATE NOT NULL,
    "status" "AiBriefingStatus" NOT NULL DEFAULT 'GENERATING',
    "modelAlias" VARCHAR(120) NOT NULL,
    "sourceSnapshotHash" VARCHAR(128),
    "resultRedacted" TEXT,
    "resultHash" VARCHAR(128),
    "errorCode" VARCHAR(100),
    "generatedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiDailyBriefing_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AiDailyBriefing_scopeKey_briefingDate_key" ON "AiDailyBriefing"("scopeKey", "briefingDate");
CREATE INDEX "AiDailyBriefing_status_expiresAt_idx" ON "AiDailyBriefing"("status", "expiresAt");
CREATE INDEX "AiDailyBriefing_briefingDate_idx" ON "AiDailyBriefing"("briefingDate");

CREATE TABLE "AiBudgetUsage" (
    "id" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "usageDate" DATE NOT NULL,
    "feature" VARCHAR(80) NOT NULL,
    "requestCount" INTEGER NOT NULL DEFAULT 0,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "costMicros" BIGINT NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiBudgetUsage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AiBudgetUsage_actorUserId_usageDate_feature_key" ON "AiBudgetUsage"("actorUserId", "usageDate", "feature");
CREATE INDEX "AiBudgetUsage_usageDate_feature_idx" ON "AiBudgetUsage"("usageDate", "feature");
CREATE INDEX "AiBudgetUsage_actorUserId_usageDate_idx" ON "AiBudgetUsage"("actorUserId", "usageDate");

ALTER TABLE "AiRun" ADD CONSTRAINT "AiRun_actorUserId_fkey"
  FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AiToolCall" ADD CONSTRAINT "AiToolCall_runId_fkey"
  FOREIGN KEY ("runId") REFERENCES "AiRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AiFeedback" ADD CONSTRAINT "AiFeedback_runId_fkey"
  FOREIGN KEY ("runId") REFERENCES "AiRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AiFeedback" ADD CONSTRAINT "AiFeedback_actorUserId_fkey"
  FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AiActionProposal" ADD CONSTRAINT "AiActionProposal_runId_fkey"
  FOREIGN KEY ("runId") REFERENCES "AiRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AiActionProposal" ADD CONSTRAINT "AiActionProposal_requestedById_fkey"
  FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AiApproval" ADD CONSTRAINT "AiApproval_proposalId_fkey"
  FOREIGN KEY ("proposalId") REFERENCES "AiActionProposal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AiApproval" ADD CONSTRAINT "AiApproval_approverUserId_fkey"
  FOREIGN KEY ("approverUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AiBudgetUsage" ADD CONSTRAINT "AiBudgetUsage_actorUserId_fkey"
  FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
