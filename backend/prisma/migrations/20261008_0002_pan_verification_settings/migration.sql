CREATE TABLE "PanVerificationSettings" (
  "id" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "baseUrl" TEXT,
  "encryptedToken" TEXT,
  "encryptedDataSecret" TEXT,
  "updatedByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PanVerificationSettings_pkey" PRIMARY KEY ("id")
);
