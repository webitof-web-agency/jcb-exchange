ALTER TABLE "AadhaarVerificationRecord"
  ADD COLUMN "ephemeralExpiresAt" TIMESTAMP(3);

CREATE INDEX "AadhaarVerificationRecord_ephemeralExpiresAt_idx"
  ON "AadhaarVerificationRecord"("ephemeralExpiresAt");
