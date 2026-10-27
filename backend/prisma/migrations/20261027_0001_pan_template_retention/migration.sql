ALTER TABLE "PanVerificationRecord"
  ADD COLUMN "rawDataExpiresAt" TIMESTAMP(3);

CREATE TABLE "PanVerificationTemplate" (
  "id" TEXT NOT NULL,
  "verificationRecordId" TEXT NOT NULL,
  "requestedById" TEXT NOT NULL,
  "driveFileId" TEXT NOT NULL,
  "fileName" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "fileSize" INTEGER NOT NULL,
  "sha256" VARCHAR(64) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PanVerificationTemplate_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PanVerificationTemplate_verificationRecordId_key"
  ON "PanVerificationTemplate"("verificationRecordId");
CREATE INDEX "PanVerificationTemplate_requestedById_createdAt_idx"
  ON "PanVerificationTemplate"("requestedById", "createdAt");

ALTER TABLE "PanVerificationTemplate"
  ADD CONSTRAINT "PanVerificationTemplate_verificationRecordId_fkey"
  FOREIGN KEY ("verificationRecordId") REFERENCES "PanVerificationRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PanVerificationTemplate"
  ADD CONSTRAINT "PanVerificationTemplate_requestedById_fkey"
  FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "PanVerificationRecord_rawDataExpiresAt_idx"
  ON "PanVerificationRecord"("rawDataExpiresAt");