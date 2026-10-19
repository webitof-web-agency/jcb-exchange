ALTER TABLE "SellAccount" ADD COLUMN "isLocked" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "SellAccount" ADD COLUMN "lockedAt" TIMESTAMP(3);
ALTER TABLE "SellAccount" ADD COLUMN "lockedById" TEXT;

ALTER TABLE "VehicleRtoRecord" ADD COLUMN "isLocked" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "VehicleRtoRecord" ADD COLUMN "lockedAt" TIMESTAMP(3);
ALTER TABLE "VehicleRtoRecord" ADD COLUMN "lockedById" TEXT;

CREATE INDEX "SellAccount_isLocked_idx" ON "SellAccount"("isLocked");
CREATE INDEX "VehicleRtoRecord_isLocked_idx" ON "VehicleRtoRecord"("isLocked");
