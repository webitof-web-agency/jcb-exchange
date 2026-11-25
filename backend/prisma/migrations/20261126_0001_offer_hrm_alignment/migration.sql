-- Offers carry their HRM placement (department, office, manager, salary breakup) so an accepted offer can become a
-- complete HRM pre-joining record. Everything is additive and safe to run more than once.

-- HR can take an offer back.
ALTER TYPE "OfferStatus" ADD VALUE IF NOT EXISTS 'WITHDRAWN';

ALTER TABLE "Offer" ADD COLUMN IF NOT EXISTS "hrmOrgUnitId" TEXT;
ALTER TABLE "Offer" ADD COLUMN IF NOT EXISTS "locationType" VARCHAR(20);
ALTER TABLE "Offer" ADD COLUMN IF NOT EXISTS "stateId" INTEGER;
ALTER TABLE "Offer" ADD COLUMN IF NOT EXISTS "cityId" INTEGER;
ALTER TABLE "Offer" ADD COLUMN IF NOT EXISTS "isOfficeManager" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Offer" ADD COLUMN IF NOT EXISTS "employmentType" "EmploymentType";
ALTER TABLE "Offer" ADD COLUMN IF NOT EXISTS "reportingManagerEmployeeId" TEXT;
ALTER TABLE "Offer" ADD COLUMN IF NOT EXISTS "annualCtc" DECIMAL(14,2);
ALTER TABLE "Offer" ADD COLUMN IF NOT EXISTS "salaryComponents" JSONB;

-- What the applicant submitted on each application (the shared candidate row is no longer overwritten publicly).
ALTER TABLE "JobApplication" ADD COLUMN IF NOT EXISTS "applicantSnapshot" JSONB;

-- A recruitment department can point at its HRM department.
ALTER TABLE "JobDepartment" ADD COLUMN IF NOT EXISTS "hrmOrgUnitId" TEXT;
