ALTER TABLE "RecruitmentEmailTemplate"
  ADD COLUMN "eventCode" TEXT,
  ADD COLUMN "archived" BOOLEAN NOT NULL DEFAULT false;

UPDATE "RecruitmentEmailTemplate"
SET "eventCode" = CASE "code"
  WHEN 'APPLICATION_RECEIVED' THEN 'RECRUITMENT_APPLICATION_RECEIVED'
  WHEN 'INTERVIEW_SCHEDULED' THEN 'RECRUITMENT_INTERVIEW_SCHEDULED'
  WHEN 'OFFER_SENT' THEN 'RECRUITMENT_OFFER_SENT'
  ELSE "code"
END
WHERE "eventCode" IS NULL;

ALTER TABLE "RecruitmentEmailTemplate"
  ALTER COLUMN "eventCode" SET NOT NULL;

-- These rows were created by the earlier WhatsApp-event seed beside the
-- canonical legacy recruitment rows. Preserve them for audit/history but do
-- not expose them as selectable templates.
UPDATE "RecruitmentEmailTemplate"
SET "archived" = true
WHERE ("code" = 'RECRUITMENT_APPLICATION_RECEIVED' AND EXISTS (SELECT 1 FROM "RecruitmentEmailTemplate" t WHERE t."code" = 'APPLICATION_RECEIVED'))
   OR ("code" = 'RECRUITMENT_INTERVIEW_SCHEDULED' AND EXISTS (SELECT 1 FROM "RecruitmentEmailTemplate" t WHERE t."code" = 'INTERVIEW_SCHEDULED'))
   OR ("code" = 'RECRUITMENT_OFFER_SENT' AND EXISTS (SELECT 1 FROM "RecruitmentEmailTemplate" t WHERE t."code" = 'OFFER_SENT'));

CREATE INDEX "RecruitmentEmailTemplate_eventCode_archived_idx"
  ON "RecruitmentEmailTemplate"("eventCode", "archived");

CREATE TABLE "EmailAutomationRule" (
  "id" TEXT NOT NULL,
  "eventCode" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "templateId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EmailAutomationRule_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EmailAutomationRule_eventCode_key"
  ON "EmailAutomationRule"("eventCode");
CREATE INDEX "EmailAutomationRule_enabled_idx"
  ON "EmailAutomationRule"("enabled");

INSERT INTO "EmailAutomationRule" ("id", "eventCode", "enabled", "templateId", "createdAt", "updatedAt")
SELECT
  'email-rule-' || md5(t."eventCode"),
  t."eventCode",
  t."enabled",
  t."id",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM (
  SELECT DISTINCT ON ("eventCode") "eventCode", "enabled", "id"
  FROM "RecruitmentEmailTemplate"
  WHERE "archived" = false
  ORDER BY "eventCode", "archived" ASC, "isSystem" DESC, "createdAt" ASC
) t;

ALTER TABLE "EmailAutomationRule"
  ADD CONSTRAINT "EmailAutomationRule_templateId_fkey"
  FOREIGN KEY ("templateId") REFERENCES "RecruitmentEmailTemplate"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
