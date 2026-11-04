CREATE TYPE "NotificationChannel" AS ENUM ('WHATSAPP', 'SMS');

CREATE TYPE "NotificationCategory" AS ENUM ('TRANSACTIONAL', 'OPERATIONAL', 'MARKETING', 'JOB_ALERTS');

CREATE TYPE "NotificationPreferenceStatus" AS ENUM ('ENABLED', 'DISABLED');

CREATE TABLE "notification_preferences" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "candidateId" TEXT,
    "phone" TEXT NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "category" "NotificationCategory" NOT NULL,
    "status" "NotificationPreferenceStatus" NOT NULL DEFAULT 'DISABLED',
    "source" TEXT,
    "sourceVersion" TEXT,
    "optedInAt" TIMESTAMP(3),
    "optedOutAt" TIMESTAMP(3),
    "lastChangedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "notification_preferences_phone_channel_category_key"
ON "notification_preferences"("phone", "channel", "category");

CREATE INDEX "notification_preferences_userId_channel_category_status_idx"
ON "notification_preferences"("userId", "channel", "category", "status");

CREATE INDEX "notification_preferences_candidateId_channel_category_status_idx"
ON "notification_preferences"("candidateId", "channel", "category", "status");

CREATE INDEX "notification_preferences_phone_channel_category_status_idx"
ON "notification_preferences"("phone", "channel", "category", "status");

ALTER TABLE "notification_preferences"
ADD CONSTRAINT "notification_preferences_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "notification_preferences"
ADD CONSTRAINT "notification_preferences_candidateId_fkey"
FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "notification_preferences"
ADD CONSTRAINT "notification_preferences_lastChangedByUserId_fkey"
FOREIGN KEY ("lastChangedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
