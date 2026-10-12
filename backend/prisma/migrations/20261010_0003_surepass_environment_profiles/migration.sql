CREATE TYPE "SurepassEnvironment" AS ENUM ('SANDBOX', 'PRODUCTION');

ALTER TABLE "PanVerificationSettings"
  ADD COLUMN "activeEnvironment" "SurepassEnvironment" NOT NULL DEFAULT 'SANDBOX',
  ADD COLUMN "sandboxBaseUrl" TEXT,
  ADD COLUMN "encryptedSandboxToken" TEXT,
  ADD COLUMN "encryptedSandboxCustomerId" TEXT,
  ADD COLUMN "productionBaseUrl" TEXT,
  ADD COLUMN "encryptedProductionToken" TEXT,
  ADD COLUMN "encryptedProductionCustomerId" TEXT;

-- Preserve the existing single-profile configuration as the sandbox profile.
UPDATE "PanVerificationSettings"
SET
  "sandboxBaseUrl" = "baseUrl",
  "encryptedSandboxToken" = "encryptedToken",
  "encryptedSandboxCustomerId" = "encryptedCustomerId"
WHERE "baseUrl" IS NOT NULL
   OR "encryptedToken" IS NOT NULL
   OR "encryptedCustomerId" IS NOT NULL;
