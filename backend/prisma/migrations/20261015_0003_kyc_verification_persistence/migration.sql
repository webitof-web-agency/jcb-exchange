ALTER TABLE "KycDocument"
  ADD COLUMN "verificationRecordId" TEXT,
  ADD COLUMN "verificationStatus" TEXT NOT NULL DEFAULT 'NOT_STARTED',
  ADD COLUMN "verificationCacheHit" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "verificationMessage" TEXT,
  ADD COLUMN "verificationCompletedAt" TIMESTAMP(3);
