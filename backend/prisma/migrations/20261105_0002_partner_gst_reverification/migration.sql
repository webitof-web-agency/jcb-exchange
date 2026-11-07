-- Preserve GST verification history when a superadmin replaces a partner's verified GST.
ALTER TABLE "GstVerificationRecord"
  ADD COLUMN "supersededAt" TIMESTAMP(3),
  ADD COLUMN "supersededByRecordId" TEXT,
  ADD COLUMN "supersededReason" TEXT;

CREATE INDEX "GstVerificationRecord_supersededAt_idx" ON "GstVerificationRecord"("supersededAt");
