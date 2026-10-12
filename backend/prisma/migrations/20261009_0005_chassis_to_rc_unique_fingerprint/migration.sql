ALTER TABLE "ChassisToRcVerificationRecord"
ALTER COLUMN "requestFingerprint" SET NOT NULL;

CREATE UNIQUE INDEX "ChassisToRcVerificationRecord_requestFingerprint_key"
ON "ChassisToRcVerificationRecord"("requestFingerprint");
