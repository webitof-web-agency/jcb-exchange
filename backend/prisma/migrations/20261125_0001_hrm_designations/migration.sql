-- HRM designation list (create / rename / switch off / delete from the screens).
-- Assignments keep the designation as text, so history stays readable; this table is the list the screens offer.
-- Every statement is safe to run twice.
CREATE TABLE IF NOT EXISTS "HrmDesignation" (
  "id" TEXT NOT NULL,
  "name" VARCHAR(120) NOT NULL,
  "nameKey" VARCHAR(120) NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "isSystem" BOOLEAN NOT NULL DEFAULT false,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "HrmDesignation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "HrmDesignation_nameKey_key" ON "HrmDesignation"("nameKey");
CREATE INDEX IF NOT EXISTS "HrmDesignation_isActive_name_idx" ON "HrmDesignation"("isActive", "name");

-- The two designations the HRM rules rely on (State Manager is the default title of an office manager, the National
-- Operations Manager is who State Managers report to). They cannot be renamed or deleted from the screens.
INSERT INTO "HrmDesignation" ("id", "name", "nameKey", "isActive", "isSystem", "updatedAt")
SELECT gen_random_uuid()::text, v.name, lower(v.name), true, true, CURRENT_TIMESTAMP
FROM (VALUES ('State Manager'), ('National Operations Manager')) AS v(name)
ON CONFLICT ("nameKey") DO UPDATE SET "isSystem" = true;

-- Every designation already used on an assignment becomes a list entry (first spelling wins).
INSERT INTO "HrmDesignation" ("id", "name", "nameKey", "updatedAt")
SELECT DISTINCT ON (s."key") gen_random_uuid()::text, s."name", s."key", CURRENT_TIMESTAMP
FROM (
  SELECT regexp_replace(trim("designation"), '\s+', ' ', 'g') AS "name",
         lower(regexp_replace(trim("designation"), '\s+', ' ', 'g')) AS "key",
         MIN("createdAt") AS "first"
  FROM "HrmEmploymentAssignment"
  WHERE trim("designation") <> ''
  GROUP BY 1, 2
) s
ORDER BY s."key", s."first"
ON CONFLICT ("nameKey") DO NOTHING;
