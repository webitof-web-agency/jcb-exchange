-- Make CRM stages data-driven while preserving the existing nine stages.
CREATE TABLE "CrmPipelineStage" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "color" TEXT NOT NULL DEFAULT 'blue',
    "isTerminal" BOOLEAN NOT NULL DEFAULT false,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmPipelineStage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CrmPipelineStage_code_key" ON "CrmPipelineStage"("code");
CREATE INDEX "CrmPipelineStage_order_idx" ON "CrmPipelineStage"("order");

INSERT INTO "CrmPipelineStage" ("id", "code", "name", "order", "color", "isTerminal", "isSystem", "updatedAt")
VALUES
  ('00000000-0000-4000-8000-000000000001', 'NEW', 'New', 10, 'blue', false, true, CURRENT_TIMESTAMP),
  ('00000000-0000-4000-8000-000000000002', 'CONTACTED', 'Contacted', 20, 'slate', false, true, CURRENT_TIMESTAMP),
  ('00000000-0000-4000-8000-000000000003', 'QUALIFIED', 'Qualified', 30, 'purple', false, true, CURRENT_TIMESTAMP),
  ('00000000-0000-4000-8000-000000000004', 'INTERESTED', 'Interested', 40, 'indigo', false, true, CURRENT_TIMESTAMP),
  ('00000000-0000-4000-8000-000000000005', 'INSPECTION_SCHEDULED', 'Inspection Scheduled', 50, 'amber', false, true, CURRENT_TIMESTAMP),
  ('00000000-0000-4000-8000-000000000006', 'NEGOTIATION', 'Negotiation', 60, 'orange', false, true, CURRENT_TIMESTAMP),
  ('00000000-0000-4000-8000-000000000007', 'ON_HOLD', 'On Hold', 70, 'zinc', false, true, CURRENT_TIMESTAMP),
  ('00000000-0000-4000-8000-000000000008', 'WON', 'Won', 80, 'emerald', true, true, CURRENT_TIMESTAMP),
  ('00000000-0000-4000-8000-000000000009', 'LOST', 'Lost', 90, 'rose', true, true, CURRENT_TIMESTAMP);

ALTER TABLE "Lead" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Lead" ALTER COLUMN "status" TYPE TEXT USING "status"::text;
ALTER TABLE "Lead" ALTER COLUMN "status" SET DEFAULT 'NEW';
DROP TYPE "LeadStatus";

ALTER TABLE "Lead"
  ADD CONSTRAINT "Lead_status_fkey"
  FOREIGN KEY ("status") REFERENCES "CrmPipelineStage"("code")
  ON DELETE RESTRICT ON UPDATE CASCADE;
