ALTER TABLE "VehicleRtoRecord" ADD COLUMN "sellAccountId" TEXT;

CREATE UNIQUE INDEX "VehicleRtoRecord_sellAccountId_key" ON "VehicleRtoRecord"("sellAccountId");

ALTER TABLE "VehicleRtoRecord"
ADD CONSTRAINT "VehicleRtoRecord_sellAccountId_fkey"
FOREIGN KEY ("sellAccountId") REFERENCES "SellAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
