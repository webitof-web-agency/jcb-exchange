DROP INDEX IF EXISTS "ChassisToRcVerificationRecord_requestFingerprint_key";

CREATE UNIQUE INDEX "ChassisToRcVerificationRecord_requestFingerprint_requestedById_key"
  ON "ChassisToRcVerificationRecord"("requestFingerprint", "requestedById");
