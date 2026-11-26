-- A default head office: HR marks one, forms preselect it, and it applies wherever no head office was chosen. An offer
-- remembers which head office it was made for. Additive and safe to run more than once.
ALTER TABLE "HrmOrgUnit" ADD COLUMN IF NOT EXISTS "isDefault" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Offer" ADD COLUMN IF NOT EXISTS "headOfficeUnitId" TEXT;

-- The head office used until now (the oldest active one) becomes the default, so nothing changes by itself.
UPDATE "HrmOrgUnit" SET "isDefault" = true
WHERE "id" = (
    SELECT "id" FROM "HrmOrgUnit"
    WHERE "type" = 'HEAD_OFFICE' AND "isActive" = true
    ORDER BY "createdAt" ASC, "id" ASC
    LIMIT 1
  )
  AND NOT EXISTS (SELECT 1 FROM "HrmOrgUnit" WHERE "type" = 'HEAD_OFFICE' AND "isDefault" = true);
