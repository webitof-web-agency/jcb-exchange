ALTER TABLE "SellAccount"
  ALTER COLUMN "ownerName" DROP NOT NULL,
  ALTER COLUMN "ownerNumber" DROP NOT NULL,
  ALTER COLUMN "vehicleNumber" DROP NOT NULL,
  ALTER COLUMN "sellDate" DROP NOT NULL,
  ALTER COLUMN "vehicleType" DROP NOT NULL,
  ALTER COLUMN "brandName" DROP NOT NULL,
  ALTER COLUMN "vehicleModel" DROP NOT NULL,
  ALTER COLUMN "sellerName" DROP NOT NULL,
  ALTER COLUMN "sellerNumber" DROP NOT NULL,
  ALTER COLUMN "purchaserName" DROP NOT NULL,
  ALTER COLUMN "purchaserNumber" DROP NOT NULL,
  ALTER COLUMN "transferDetails" DROP NOT NULL;

ALTER TABLE "SellAccount"
  ADD COLUMN "isDraft" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "draftSavedAt" TIMESTAMP(3);

CREATE INDEX "SellAccount_isDraft_updatedAt_idx" ON "SellAccount"("isDraft", "updatedAt");
