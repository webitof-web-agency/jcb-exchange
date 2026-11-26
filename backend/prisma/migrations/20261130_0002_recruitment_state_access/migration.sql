-- State-wise recruitment access: a job records the state it is hired for and whether it is a head office or a state
-- office posting. Existing jobs are filled from their typed state name (a name that matches no state stays empty and
-- is visible to all-India recruiters only, listed on the HRM access review).
-- Everybody who could use recruitment before keeps the whole country: roles and direct grants holding any recruitment
-- permission get "recruitment.scope.all", once, together with the new columns. Take it away from the roles that should
-- see their own states only. Additive and safe to run more than once.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'Job' AND column_name = 'hrmStateId') THEN
    ALTER TABLE "Job" ADD COLUMN "hrmStateId" INTEGER, ADD COLUMN IF NOT EXISTS "hrmLocationType" VARCHAR(20);

    UPDATE "Job" AS j
    SET "hrmStateId" = (
      SELECT s."id"
      FROM "State" AS s
      JOIN "Country" AS c ON c."id" = s."countryId"
      WHERE c."iso2" = 'IN'
        AND lower(btrim(regexp_replace(s."name", '\s+', ' ', 'g'))) = lower(btrim(regexp_replace(j."locationState", '\s+', ' ', 'g')))
      ORDER BY s."id"
      LIMIT 1
    );

    -- A job in the head office's own city is a head office posting; every other job is a state office posting.
    UPDATE "Job" AS j
    SET "hrmLocationType" = CASE WHEN EXISTS (
      SELECT 1
      FROM "HrmOrgUnit" AS u
      JOIN "City" AS ci ON ci."id" = u."cityId"
      WHERE u."type" = 'HEAD_OFFICE' AND u."isActive" AND u."stateId" = j."hrmStateId"
        AND lower(btrim(ci."name")) = lower(btrim(j."locationCity"))
    ) THEN 'HEAD_OFFICE' ELSE 'STATE_OFFICE' END
    WHERE j."hrmStateId" IS NOT NULL;

    UPDATE "CustomRole"
    SET "permissions" = array_append("permissions", 'recruitment.scope.all')
    WHERE EXISTS (SELECT 1 FROM unnest("permissions") AS p(code) WHERE p.code LIKE 'recruitment.%')
      AND NOT ('recruitment.scope.all' = ANY("permissions"));

    INSERT INTO "AdminPermission" ("id", "adminUserId", "permission")
    SELECT md5(source."adminUserId" || ':recruitment.scope.all')::uuid, source."adminUserId", 'recruitment.scope.all'
    FROM (SELECT DISTINCT "adminUserId" FROM "AdminPermission" WHERE "permission" LIKE 'recruitment.%') AS source
    ON CONFLICT DO NOTHING;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS "Job_hrmStateId_hrmLocationType_idx" ON "Job"("hrmStateId", "hrmLocationType");
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Job_hrmStateId_fkey') THEN
    ALTER TABLE "Job" ADD CONSTRAINT "Job_hrmStateId_fkey" FOREIGN KEY ("hrmStateId") REFERENCES "State"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
