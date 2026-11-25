-- CreateEnum
CREATE TYPE "VehicleTransportStatus" AS ENUM ('BOOKED', 'VEHICLE_ASSIGNED', 'DISPATCHED', 'ON_THE_WAY', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED');

-- CreateTable
CREATE TABLE IF NOT EXISTS "VehicleTransport" (
    "id" TEXT NOT NULL,
    "sellAccountId" TEXT NOT NULL,
    "challanNumber" TEXT NOT NULL,
    "challanDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "hsnCode" TEXT NOT NULL DEFAULT '84295900',
    "declaredValue" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "carrierVehicleNumber" TEXT,
    "transporterName" TEXT,
    "driverName" TEXT,
    "driverPhone" TEXT,
    "lrNumber" TEXT,
    "ewayBillNumber" TEXT,
    "dispatchName" TEXT NOT NULL DEFAULT '',
    "dispatchGstin" TEXT NOT NULL DEFAULT 'URP',
    "dispatchAddress" TEXT NOT NULL DEFAULT '',
    "dispatchCity" TEXT NOT NULL DEFAULT '',
    "dispatchState" TEXT NOT NULL DEFAULT '',
    "dispatchPincode" TEXT,
    "deliveryName" TEXT NOT NULL DEFAULT '',
    "deliveryGstin" TEXT NOT NULL DEFAULT 'URP',
    "deliveryAddress" TEXT NOT NULL DEFAULT '',
    "deliveryCity" TEXT NOT NULL DEFAULT '',
    "deliveryState" TEXT NOT NULL DEFAULT '',
    "deliveryPincode" TEXT,
    "customerPhone" TEXT NOT NULL DEFAULT '',
    "status" "VehicleTransportStatus" NOT NULL DEFAULT 'BOOKED',
    "currentLocation" TEXT,
    "lastRemark" TEXT,
    "dispatchedAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VehicleTransport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "VehicleTransportTimeline" (
    "id" TEXT NOT NULL,
    "transportId" TEXT NOT NULL,
    "status" "VehicleTransportStatus" NOT NULL,
    "location" TEXT,
    "notes" TEXT,
    "actorId" TEXT,
    "actorName" TEXT,
    "notifiedPhone" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VehicleTransportTimeline_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "VehicleTransport_sellAccountId_key" ON "VehicleTransport"("sellAccountId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "VehicleTransport_challanNumber_key" ON "VehicleTransport"("challanNumber");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "VehicleTransport_status_updatedAt_idx" ON "VehicleTransport"("status", "updatedAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "VehicleTransport_carrierVehicleNumber_idx" ON "VehicleTransport"("carrierVehicleNumber");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "VehicleTransport_customerPhone_idx" ON "VehicleTransport"("customerPhone");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "VehicleTransportTimeline_transportId_createdAt_idx" ON "VehicleTransportTimeline"("transportId", "createdAt");

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'VehicleTransport_sellAccountId_fkey'
  ) THEN
    ALTER TABLE "VehicleTransport" ADD CONSTRAINT "VehicleTransport_sellAccountId_fkey" FOREIGN KEY ("sellAccountId") REFERENCES "SellAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'VehicleTransportTimeline_transportId_fkey'
  ) THEN
    ALTER TABLE "VehicleTransportTimeline" ADD CONSTRAINT "VehicleTransportTimeline_transportId_fkey" FOREIGN KEY ("transportId") REFERENCES "VehicleTransport"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
