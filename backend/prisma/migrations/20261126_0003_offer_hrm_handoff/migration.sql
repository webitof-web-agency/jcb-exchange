-- An accepted offer becomes an HRM pre-joining record (employee, assignment, salary draft, documents, onboarding
-- case). The offer tracks that handoff so a failure is retried; a person hired again gets a new onboarding case on
-- the same HR record. Additive / relaxing only, safe to run more than once.

ALTER TYPE "HrmOnboardingStatus" ADD VALUE IF NOT EXISTS 'NEEDS_REVIEW';

ALTER TABLE "Offer" ADD COLUMN IF NOT EXISTS "hrmHandoffStatus" VARCHAR(20);
ALTER TABLE "Offer" ADD COLUMN IF NOT EXISTS "hrmHandoffError" TEXT;
ALTER TABLE "Offer" ADD COLUMN IF NOT EXISTS "hrmHandoffAttempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Offer" ADD COLUMN IF NOT EXISTS "hrmHandoffAt" TIMESTAMP(3);
ALTER TABLE "Offer" ADD COLUMN IF NOT EXISTS "hrmEmployeeId" TEXT;
CREATE INDEX IF NOT EXISTS "Offer_status_hrmHandoffStatus_idx" ON "Offer"("status", "hrmHandoffStatus");

-- One HR record can have several onboarding cases over time (rehire).
DROP INDEX IF EXISTS "HrmOnboardingCase_employeeId_key";
CREATE INDEX IF NOT EXISTS "HrmOnboardingCase_employeeId_idx" ON "HrmOnboardingCase"("employeeId");
ALTER TABLE "HrmOnboardingCase" ADD COLUMN IF NOT EXISTS "reviewNote" TEXT;
