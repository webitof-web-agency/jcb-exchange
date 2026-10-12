ALTER TABLE "PanVerificationRecord" ADD COLUMN "requestFingerprint" VARCHAR(64);
ALTER TABLE "GstVerificationRecord" ADD COLUMN "requestFingerprint" VARCHAR(64);
ALTER TABLE "DrivingLicenseVerificationRecord" ADD COLUMN "requestFingerprint" VARCHAR(64);
ALTER TABLE "RcOwnerHistoryRecord" ADD COLUMN "requestFingerprint" VARCHAR(64);

CREATE INDEX "PanVerificationRecord_operation_requestFingerprint_status_completedAt_idx"
ON "PanVerificationRecord"("operation", "requestFingerprint", "status", "completedAt");
CREATE INDEX "GstVerificationRecord_requestFingerprint_status_completedAt_idx"
ON "GstVerificationRecord"("requestFingerprint", "status", "completedAt");
CREATE INDEX "DrivingLicenseVerificationRecord_requestFingerprint_status_completedAt_idx"
ON "DrivingLicenseVerificationRecord"("requestFingerprint", "status", "completedAt");
CREATE INDEX "RcOwnerHistoryRecord_requestFingerprint_status_completedAt_idx"
ON "RcOwnerHistoryRecord"("requestFingerprint", "status", "completedAt");
CREATE INDEX "RcChallanVerificationRecord_requestFingerprint_status_completedAt_idx"
ON "RcChallanVerificationRecord"("requestFingerprint", "status", "completedAt");
