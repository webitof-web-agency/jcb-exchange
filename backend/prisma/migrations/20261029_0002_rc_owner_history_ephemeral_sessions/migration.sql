ALTER TABLE "RcOwnerHistoryRecord"
  ADD COLUMN "ephemeralExpiresAt" TIMESTAMP(3);

CREATE INDEX "RcOwnerHistoryRecord_ephemeralExpiresAt_idx"
  ON "RcOwnerHistoryRecord"("ephemeralExpiresAt");
