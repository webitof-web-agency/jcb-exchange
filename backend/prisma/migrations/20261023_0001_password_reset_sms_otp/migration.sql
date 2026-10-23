DO $$ BEGIN
  CREATE TYPE "MobileOtpChallengePurpose" AS ENUM ('LOGIN', 'PASSWORD_RESET');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "MobileOtpChallenge"
  ADD COLUMN IF NOT EXISTS "purpose" "MobileOtpChallengePurpose" NOT NULL DEFAULT 'LOGIN';

CREATE INDEX IF NOT EXISTS "MobileOtpChallenge_mobile_purpose_status_createdAt_idx"
  ON "MobileOtpChallenge"("mobile", "purpose", "status", "createdAt");

CREATE TABLE IF NOT EXISTS "PasswordResetToken" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "challengeId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "consumedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PasswordResetToken_challengeId_key"
  ON "PasswordResetToken"("challengeId");
CREATE UNIQUE INDEX IF NOT EXISTS "PasswordResetToken_tokenHash_key"
  ON "PasswordResetToken"("tokenHash");
CREATE INDEX IF NOT EXISTS "PasswordResetToken_userId_expiresAt_idx"
  ON "PasswordResetToken"("userId", "expiresAt");
CREATE INDEX IF NOT EXISTS "PasswordResetToken_expiresAt_consumedAt_idx"
  ON "PasswordResetToken"("expiresAt", "consumedAt");

DO $$ BEGIN
  ALTER TABLE "PasswordResetToken"
    ADD CONSTRAINT "PasswordResetToken_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "PasswordResetToken"
    ADD CONSTRAINT "PasswordResetToken_challengeId_fkey"
    FOREIGN KEY ("challengeId") REFERENCES "MobileOtpChallenge"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
