-- Explicit office marker on HRM assignments.
--   officeUnitId    : the office the person works from (the head office unit or a state office unit).
--                     orgUnitId keeps meaning "department".
--   isOfficeManager : the person manages that office (State Manager). An office can have several.
--
-- Every statement is safe to run twice (IF NOT EXISTS / guarded), so `prisma migrate deploy` succeeds whether or
-- not these objects already exist on the target database.
ALTER TABLE "HrmEmploymentAssignment" ADD COLUMN IF NOT EXISTS "officeUnitId" TEXT;
ALTER TABLE "HrmEmploymentAssignment" ADD COLUMN IF NOT EXISTS "isOfficeManager" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS "HrmEmploymentAssignment_officeUnitId_status_effectiveFrom_idx"
  ON "HrmEmploymentAssignment"("officeUnitId", "status", "effectiveFrom");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'HrmEmploymentAssignment_officeUnitId_fkey'
      AND conrelid = '"HrmEmploymentAssignment"'::regclass
  ) THEN
    ALTER TABLE "HrmEmploymentAssignment"
      ADD CONSTRAINT "HrmEmploymentAssignment_officeUnitId_fkey"
      FOREIGN KEY ("officeUnitId") REFERENCES "HrmOrgUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- Backfill 1: assignments located in the head office city belong to the (single) active head office unit.
UPDATE "HrmEmploymentAssignment" a
SET "officeUnitId" = o."id"
FROM "HrmOrgUnit" o
WHERE a."officeUnitId" IS NULL
  AND o."type" = 'HEAD_OFFICE'
  AND o."isActive" = true
  AND o."stateId" IS NOT NULL AND o."cityId" IS NOT NULL
  AND a."stateId" = o."stateId" AND a."cityId" = o."cityId"
  AND (SELECT COUNT(*) FROM "HrmOrgUnit" h WHERE h."type" = 'HEAD_OFFICE' AND h."isActive" = true) = 1;

-- Backfill 2: every other assignment in a state belongs to that state's active office unit.
UPDATE "HrmEmploymentAssignment" a
SET "officeUnitId" = o."id"
FROM "HrmOrgUnit" o
WHERE a."officeUnitId" IS NULL
  AND o."type" = 'REGION'
  AND o."isActive" = true
  AND o."stateId" IS NOT NULL
  AND a."stateId" = o."stateId";

-- Backfill 3: people already titled "State Manager" in a state office are the managers of that office.
UPDATE "HrmEmploymentAssignment" a
SET "isOfficeManager" = true
FROM "HrmOrgUnit" o
WHERE a."officeUnitId" = o."id"
  AND o."type" = 'REGION'
  AND a."isOfficeManager" = false
  AND lower(regexp_replace(trim(a."designation"), '\s+', ' ', 'g')) = 'state manager';
