ALTER TABLE "RcOwnerHistoryRecord"
  ADD COLUMN "rawDataExpiresAt" TIMESTAMP(3);

CREATE TABLE "RcOwnerHistoryTemplate" (
  "id" TEXT NOT NULL,
  "verificationRecordId" TEXT NOT NULL,
  "driveFileId" TEXT NOT NULL,
  "fileName" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "fileSize" INTEGER NOT NULL,
  "sha256" VARCHAR(64) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "requestedById" TEXT NOT NULL,
  CONSTRAINT "RcOwnerHistoryTemplate_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RcOwnerHistoryTemplate_verificationRecordId_key"
  ON "RcOwnerHistoryTemplate"("verificationRecordId");
CREATE INDEX "RcOwnerHistoryTemplate_requestedById_createdAt_idx"
  ON "RcOwnerHistoryTemplate"("requestedById", "createdAt");
CREATE INDEX "RcOwnerHistoryRecord_rawDataExpiresAt_idx"
  ON "RcOwnerHistoryRecord"("rawDataExpiresAt");

ALTER TABLE "RcOwnerHistoryTemplate"
  ADD CONSTRAINT "RcOwnerHistoryTemplate_verificationRecordId_fkey"
  FOREIGN KEY ("verificationRecordId") REFERENCES "RcOwnerHistoryRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "RcOwnerHistoryTemplate"
  ADD CONSTRAINT "RcOwnerHistoryTemplate_requestedById_fkey"
  FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
