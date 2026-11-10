-- Phase 7: controlled AI automation state machine and audited human approval.
-- Additive migration. Apply after 20261109_0002_ai_daily_briefing_automation
-- through the normal staging/change-management process. This file is not
-- applied by Codex.

ALTER TYPE "AuditEntityType" ADD VALUE IF NOT EXISTS 'AI_ACTION_PROPOSAL';
ALTER TYPE "AiActionProposalStatus" ADD VALUE IF NOT EXISTS 'EXECUTING';
ALTER TYPE "AiActionProposalStatus" ADD VALUE IF NOT EXISTS 'EXECUTION_FAILED';

ALTER TABLE "AiActionProposal"
  ADD COLUMN IF NOT EXISTS "payloadRedacted" TEXT,
  ADD COLUMN IF NOT EXISTS "idempotencyKey" VARCHAR(180),
  ADD COLUMN IF NOT EXISTS "approvedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "approvedById" TEXT,
  ADD COLUMN IF NOT EXISTS "rejectedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "rejectedById" TEXT,
  ADD COLUMN IF NOT EXISTS "executedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "executionErrorCode" VARCHAR(100);

CREATE UNIQUE INDEX IF NOT EXISTS "AiActionProposal_idempotencyKey_key"
  ON "AiActionProposal"("idempotencyKey");
CREATE INDEX IF NOT EXISTS "AiActionProposal_status_updatedAt_idx"
  ON "AiActionProposal"("status", "updatedAt");

ALTER TABLE "AiActionProposal"
  ADD CONSTRAINT "AiActionProposal_approvedById_fkey"
    FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "AiActionProposal_rejectedById_fkey"
    FOREIGN KEY ("rejectedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
