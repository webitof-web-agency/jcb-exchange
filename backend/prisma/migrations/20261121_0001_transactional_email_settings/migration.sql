CREATE TABLE "TransactionalEmailSettings" (
  "id" TEXT NOT NULL DEFAULT 'default',
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "smtpHost" TEXT NOT NULL DEFAULT 'smtp.gmail.com',
  "smtpPort" INTEGER NOT NULL DEFAULT 465,
  "smtpSecure" BOOLEAN NOT NULL DEFAULT true,
  "senderEmail" TEXT,
  "senderName" TEXT NOT NULL DEFAULT 'JCB Exchange',
  "replyToEmail" TEXT,
  "encryptedSmtpPassword" TEXT,
  "lastTestedAt" TIMESTAMP(3),
  "lastTestStatus" TEXT,
  "lastTestError" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "updatedByUserId" TEXT,

  CONSTRAINT "TransactionalEmailSettings_pkey" PRIMARY KEY ("id")
);

