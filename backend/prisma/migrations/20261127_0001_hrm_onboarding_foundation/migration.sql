-- HRM onboarding foundation: personal details on the employee, passport photo documents, shifts (with weekly offs)
-- and state-wise holidays that attendance will use later. Additive and safe to run more than once.

ALTER TYPE "HrmDocumentCategory" ADD VALUE IF NOT EXISTS 'PHOTO';

-- A re-hire remembers what it changed, so a cancelled joining can be undone exactly.
ALTER TABLE "HrmOnboardingCase" ADD COLUMN IF NOT EXISTS "rehireSnapshot" JSONB;

ALTER TABLE "HrmEmployee" ADD COLUMN IF NOT EXISTS "gender" VARCHAR(20);
ALTER TABLE "HrmEmployee" ADD COLUMN IF NOT EXISTS "fatherOrSpouseName" VARCHAR(160);
ALTER TABLE "HrmEmployee" ADD COLUMN IF NOT EXISTS "maritalStatus" VARCHAR(20);
ALTER TABLE "HrmEmployee" ADD COLUMN IF NOT EXISTS "bloodGroup" VARCHAR(5);
ALTER TABLE "HrmEmployee" ADD COLUMN IF NOT EXISTS "currentAddress" JSONB;
ALTER TABLE "HrmEmployee" ADD COLUMN IF NOT EXISTS "permanentAddress" JSONB;
ALTER TABLE "HrmEmployee" ADD COLUMN IF NOT EXISTS "emergencyContact" JSONB;

CREATE TABLE IF NOT EXISTS "HrmShift" (
  "id" TEXT NOT NULL,
  "code" VARCHAR(30) NOT NULL,
  "name" VARCHAR(80) NOT NULL,
  "startTime" VARCHAR(5) NOT NULL,
  "endTime" VARCHAR(5) NOT NULL,
  "breakMinutes" INTEGER NOT NULL DEFAULT 0,
  "graceMinutes" INTEGER NOT NULL DEFAULT 0,
  "halfDayMinutes" INTEGER,
  "fullDayMinutes" INTEGER,
  "isNightShift" BOOLEAN NOT NULL DEFAULT false,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "HrmShift_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "HrmShift_code_key" ON "HrmShift"("code");
CREATE INDEX IF NOT EXISTS "HrmShift_isActive_name_idx" ON "HrmShift"("isActive", "name");

CREATE TABLE IF NOT EXISTS "HrmShiftAssignment" (
  "id" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "shiftId" TEXT NOT NULL,
  "weeklyOffs" JSONB NOT NULL,
  "effectiveFrom" DATE NOT NULL,
  "effectiveTo" DATE,
  "status" "HrmAssignmentStatus" NOT NULL DEFAULT 'ACTIVE',
  "reason" TEXT,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "HrmShiftAssignment_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "HrmShiftAssignment_employeeId_status_effectiveFrom_idx" ON "HrmShiftAssignment"("employeeId", "status", "effectiveFrom");
CREATE INDEX IF NOT EXISTS "HrmShiftAssignment_shiftId_idx" ON "HrmShiftAssignment"("shiftId");
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'HrmShiftAssignment_employeeId_fkey') THEN
    ALTER TABLE "HrmShiftAssignment" ADD CONSTRAINT "HrmShiftAssignment_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "HrmEmployee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'HrmShiftAssignment_shiftId_fkey') THEN
    ALTER TABLE "HrmShiftAssignment" ADD CONSTRAINT "HrmShiftAssignment_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "HrmShift"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "HrmHoliday" (
  "id" TEXT NOT NULL,
  "date" DATE NOT NULL,
  "name" VARCHAR(120) NOT NULL,
  "scope" VARCHAR(12) NOT NULL,
  "stateId" INTEGER,
  "isOptional" BOOLEAN NOT NULL DEFAULT false,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "HrmHoliday_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "HrmHoliday_date_idx" ON "HrmHoliday"("date");
CREATE INDEX IF NOT EXISTS "HrmHoliday_scope_stateId_date_idx" ON "HrmHoliday"("scope", "stateId", "date");
