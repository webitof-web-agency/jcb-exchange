ALTER TABLE "AadhaarVerificationRecord"
  ADD COLUMN "rawDataExpiresAt" TIMESTAMP(3);

CREATE TABLE "AadhaarVerificationTemplate" (
  "id" TEXT NOT NULL,
  "verificationRecordId" TEXT NOT NULL,
  "driveFileId" TEXT NOT NULL,
  "fileName" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "fileSize" INTEGER NOT NULL,
  "sha256" VARCHAR(64) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "requestedById" TEXT NOT NULL,
  CONSTRAINT "AadhaarVerificationTemplate_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AadhaarVerificationTemplate_verificationRecordId_key"
  ON "AadhaarVerificationTemplate"("verificationRecordId");
CREATE INDEX "AadhaarVerificationTemplate_requestedById_createdAt_idx"
  ON "AadhaarVerificationTemplate"("requestedById", "createdAt");
CREATE INDEX "AadhaarVerificationRecord_rawDataExpiresAt_idx"
  ON "AadhaarVerificationRecord"("rawDataExpiresAt");

ALTER TABLE "AadhaarVerificationTemplate"
  ADD CONSTRAINT "AadhaarVerificationTemplate_verificationRecordId_fkey"
  FOREIGN KEY ("verificationRecordId") REFERENCES "AadhaarVerificationRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AadhaarVerificationTemplate"
  ADD CONSTRAINT "AadhaarVerificationTemplate_requestedById_fkey"
  FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
