ALTER TABLE "GstVerificationRecord"
  ADD COLUMN "rawDataExpiresAt" TIMESTAMP(3);

CREATE TABLE "GstVerificationTemplate" (
  "id" TEXT NOT NULL,
  "verificationRecordId" TEXT NOT NULL,
  "requestedById" TEXT NOT NULL,
  "driveFileId" TEXT NOT NULL,
  "fileName" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "fileSize" INTEGER NOT NULL,
  "sha256" VARCHAR(64) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GstVerificationTemplate_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GstVerificationTemplate_verificationRecordId_key"
  ON "GstVerificationTemplate"("verificationRecordId");
CREATE INDEX "GstVerificationTemplate_requestedById_createdAt_idx"
  ON "GstVerificationTemplate"("requestedById", "createdAt");

ALTER TABLE "GstVerificationTemplate"
  ADD CONSTRAINT "GstVerificationTemplate_verificationRecordId_fkey"
  FOREIGN KEY ("verificationRecordId") REFERENCES "GstVerificationRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GstVerificationTemplate"
  ADD CONSTRAINT "GstVerificationTemplate_requestedById_fkey"
  FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "GstVerificationRecord_rawDataExpiresAt_idx"
  ON "GstVerificationRecord"("rawDataExpiresAt");
