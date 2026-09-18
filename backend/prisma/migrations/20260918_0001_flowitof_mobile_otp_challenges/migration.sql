DO $$ BEGIN
  CREATE TYPE "MobileOtpChallengeStatus" AS ENUM ('PENDING', 'VERIFIED', 'EXPIRED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "MobileOtpChallenge" (
  "id" TEXT NOT NULL,
  "mobile" TEXT NOT NULL,
  "userId" TEXT,
  "status" "MobileOtpChallengeStatus" NOT NULL DEFAULT 'PENDING',
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "resendCount" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "verifiedAt" TIMESTAMP(3),
  CONSTRAINT "MobileOtpChallenge_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "MobileOtpChallenge_mobile_status_createdAt_idx"
  ON "MobileOtpChallenge"("mobile", "status", "createdAt");
CREATE INDEX IF NOT EXISTS "MobileOtpChallenge_userId_status_createdAt_idx"
  ON "MobileOtpChallenge"("userId", "status", "createdAt");

DO $$ BEGIN
  ALTER TABLE "MobileOtpChallenge"
    ADD CONSTRAINT "MobileOtpChallenge_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
