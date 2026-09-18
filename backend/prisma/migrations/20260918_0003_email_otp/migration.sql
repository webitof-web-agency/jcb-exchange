CREATE TYPE "EmailOtpChallengeStatus" AS ENUM ('PENDING', 'VERIFIED', 'EXPIRED');

CREATE TABLE "EmailOtpIntegrationSettings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "smtpHost" TEXT NOT NULL DEFAULT 'smtp.gmail.com',
    "smtpPort" INTEGER NOT NULL DEFAULT 465,
    "smtpSecure" BOOLEAN NOT NULL DEFAULT true,
    "senderEmail" TEXT,
    "senderName" TEXT NOT NULL DEFAULT 'JCB Exchange',
    "encryptedAppPassword" TEXT,
    "otpExpiryMinutes" INTEGER NOT NULL DEFAULT 10,
    "otpLength" INTEGER NOT NULL DEFAULT 6,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedByUserId" TEXT,
    CONSTRAINT "EmailOtpIntegrationSettings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EmailOtpChallenge" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "userId" TEXT,
    "otpHash" TEXT NOT NULL,
    "status" "EmailOtpChallengeStatus" NOT NULL DEFAULT 'PENDING',
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "resendCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "verifiedAt" TIMESTAMP(3),
    CONSTRAINT "EmailOtpChallenge_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "EmailOtpChallenge_email_status_createdAt_idx" ON "EmailOtpChallenge"("email", "status", "createdAt");
CREATE INDEX "EmailOtpChallenge_userId_status_createdAt_idx" ON "EmailOtpChallenge"("userId", "status", "createdAt");

ALTER TABLE "EmailOtpChallenge"
ADD CONSTRAINT "EmailOtpChallenge_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
