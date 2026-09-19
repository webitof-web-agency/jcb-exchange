DO $$ BEGIN
  CREATE TYPE "RtoHirePurchaseStatus" AS ENUM ('PENDING', 'ACTIVE', 'TERMINATED', 'NOT_APPLICABLE');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE TYPE "RtoValidityStatus" AS ENUM ('VALID', 'EXPIRED', 'NOT_AVAILABLE', 'LIFETIME', 'NOT_APPLICABLE', 'PENDING');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE TYPE "RtoHsrpStatus" AS ENUM ('YES', 'NO', 'PENDING', 'NOT_APPLICABLE');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE TYPE "RtoWorkStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'DOCUMENT_REQUIRED', 'SUBMITTED', 'APPROVED', 'REJECTED', 'COMPLETED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "VehicleRtoRecord" (
  "id" TEXT NOT NULL,
  "listingId" TEXT,
  "customerName" TEXT NOT NULL,
  "customerNumber" TEXT NOT NULL,
  "vehicleNumber" TEXT NOT NULL,
  "vehicleType" TEXT NOT NULL,
  "vehicleModel" TEXT NOT NULL,
  "hirePurchaseStatus" "RtoHirePurchaseStatus" NOT NULL DEFAULT 'PENDING',
  "taxStatus" "RtoValidityStatus" NOT NULL DEFAULT 'NOT_AVAILABLE',
  "taxValidUntil" TIMESTAMP(3),
  "fitnessStatus" "RtoValidityStatus" NOT NULL DEFAULT 'NOT_AVAILABLE',
  "fitnessValidUntil" TIMESTAMP(3),
  "insuranceStatus" "RtoValidityStatus" NOT NULL DEFAULT 'NOT_AVAILABLE',
  "insuranceValidUntil" TIMESTAMP(3),
  "pucStatus" "RtoValidityStatus" NOT NULL DEFAULT 'NOT_AVAILABLE',
  "pucValidUntil" TIMESTAMP(3),
  "hsrpStatus" "RtoHsrpStatus" NOT NULL DEFAULT 'PENDING',
  "sellerName" TEXT NOT NULL,
  "sellerNumber" TEXT NOT NULL,
  "purchaserName" TEXT NOT NULL,
  "purchaserNumber" TEXT NOT NULL,
  "rtoOffice" TEXT NOT NULL,
  "rtoAgentName" TEXT NOT NULL,
  "rtoAgentState" TEXT NOT NULL,
  "rtoAgentCity" TEXT NOT NULL,
  "rtoAgentNumber" TEXT NOT NULL,
  "rtoExpenses" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "rtoExpensesAdvance" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "documentSendDate" TIMESTAMP(3),
  "rtoStatus" "RtoWorkStatus" NOT NULL DEFAULT 'PENDING',
  "noteSheet" TEXT,
  "vehicleMaintenanceCost" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "hourRunning" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "VehicleRtoRecord_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "VehicleRtoRecord_vehicleNumber_idx" ON "VehicleRtoRecord"("vehicleNumber");
CREATE INDEX IF NOT EXISTS "VehicleRtoRecord_rtoStatus_idx" ON "VehicleRtoRecord"("rtoStatus");
CREATE INDEX IF NOT EXISTS "VehicleRtoRecord_documentSendDate_idx" ON "VehicleRtoRecord"("documentSendDate");
CREATE INDEX IF NOT EXISTS "VehicleRtoRecord_rtoAgentState_rtoAgentCity_idx" ON "VehicleRtoRecord"("rtoAgentState", "rtoAgentCity");
DO $$ BEGIN
  ALTER TABLE "VehicleRtoRecord" ADD CONSTRAINT "VehicleRtoRecord_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
