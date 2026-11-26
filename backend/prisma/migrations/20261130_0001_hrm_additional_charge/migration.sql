-- Additional charge: a state office looked after on top of the person's own posting (one manager, several states).
-- The posting does not change; the dates decide when the office counts as covered and when the state access is on.
-- Additive and safe to run more than once.
CREATE TABLE IF NOT EXISTS "HrmAdditionalCharge" (
  "id" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "officeUnitId" TEXT NOT NULL,
  "effectiveFrom" DATE NOT NULL,
  "effectiveTo" DATE,
  "status" VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
  "grantAccess" BOOLEAN NOT NULL DEFAULT true,
  "accessScopeId" TEXT,
  "reason" TEXT,
  "createdById" TEXT,
  "endedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "HrmAdditionalCharge_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "HrmAdditionalCharge_accessScopeId_key" ON "HrmAdditionalCharge"("accessScopeId");
CREATE INDEX IF NOT EXISTS "HrmAdditionalCharge_employeeId_status_idx" ON "HrmAdditionalCharge"("employeeId", "status");
CREATE INDEX IF NOT EXISTS "HrmAdditionalCharge_officeUnitId_status_effectiveFrom_idx" ON "HrmAdditionalCharge"("officeUnitId", "status", "effectiveFrom");
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'HrmAdditionalCharge_employeeId_fkey') THEN
    ALTER TABLE "HrmAdditionalCharge" ADD CONSTRAINT "HrmAdditionalCharge_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "HrmEmployee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'HrmAdditionalCharge_officeUnitId_fkey') THEN
    ALTER TABLE "HrmAdditionalCharge" ADD CONSTRAINT "HrmAdditionalCharge_officeUnitId_fkey" FOREIGN KEY ("officeUnitId") REFERENCES "HrmOrgUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'HrmAdditionalCharge_accessScopeId_fkey') THEN
    ALTER TABLE "HrmAdditionalCharge" ADD CONSTRAINT "HrmAdditionalCharge_accessScopeId_fkey" FOREIGN KEY ("accessScopeId") REFERENCES "HrmAccessScope"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
