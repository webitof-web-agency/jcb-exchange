ALTER TYPE "AuditEntityType" ADD VALUE IF NOT EXISTS 'RC_FULL';
ALTER TYPE "ApiBillableService" ADD VALUE IF NOT EXISTS 'RC_FULL';

ALTER TABLE "RcOwnerHistoryRecord"
  ADD COLUMN "serviceKey" "ApiBillableService" NOT NULL DEFAULT 'RC_OWNER_HISTORY';

CREATE INDEX "RcOwnerHistoryRecord_serviceKey_status_createdAt_idx"
  ON "RcOwnerHistoryRecord"("serviceKey", "status", "createdAt");

CREATE INDEX "RcOwnerHistoryRecord_serviceKey_requestFingerprint_status_completedAt_idx"
  ON "RcOwnerHistoryRecord"("serviceKey", "requestFingerprint", "status", "completedAt");
