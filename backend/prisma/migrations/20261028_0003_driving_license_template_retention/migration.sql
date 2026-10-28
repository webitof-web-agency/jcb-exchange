ALTER TABLE "DrivingLicenseVerificationRecord"
  ADD COLUMN "rawDataExpiresAt" TIMESTAMP(3);

CREATE TABLE "DrivingLicenseVerificationTemplate" (
  "id" TEXT NOT NULL,
  "verificationRecordId" TEXT NOT NULL,
  "driveFileId" TEXT NOT NULL,
  "fileName" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "fileSize" INTEGER NOT NULL,
  "sha256" VARCHAR(64) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "requestedById" TEXT NOT NULL,
  CONSTRAINT "DrivingLicenseVerificationTemplate_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DrivingLicenseVerificationTemplate_verificationRecordId_key"
  ON "DrivingLicenseVerificationTemplate"("verificationRecordId");
CREATE INDEX "DrivingLicenseVerificationTemplate_requestedById_createdAt_idx"
  ON "DrivingLicenseVerificationTemplate"("requestedById", "createdAt");
CREATE INDEX "DrivingLicenseVerificationRecord_rawDataExpiresAt_idx"
  ON "DrivingLicenseVerificationRecord"("rawDataExpiresAt");

ALTER TABLE "DrivingLicenseVerificationTemplate"
  ADD CONSTRAINT "DrivingLicenseVerificationTemplate_verificationRecordId_fkey"
  FOREIGN KEY ("verificationRecordId") REFERENCES "DrivingLicenseVerificationRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DrivingLicenseVerificationTemplate"
  ADD CONSTRAINT "DrivingLicenseVerificationTemplate_requestedById_fkey"
  FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
