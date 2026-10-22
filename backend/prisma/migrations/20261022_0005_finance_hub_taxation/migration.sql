-- CreateEnum
CREATE TYPE "FinTaxType" AS ENUM ('GST', 'TDS', 'TCS', 'ADVANCE_TAX', 'SELF_ASSESSMENT', 'PROFESSIONAL_TAX', 'PF', 'ESI', 'OTHER');

-- CreateTable
CREATE TABLE "FinTaxChallan" (
    "id" TEXT NOT NULL,
    "taxType" "FinTaxType" NOT NULL,
    "period" VARCHAR(20) NOT NULL,
    "challanNo" VARCHAR(40) NOT NULL,
    "bsrCode" VARCHAR(10),
    "date" DATE NOT NULL,
    "total" DECIMAL(14,2) NOT NULL,
    "breakdown" JSONB NOT NULL,
    "bankAccountId" TEXT NOT NULL,
    "voucherId" TEXT NOT NULL,
    "proofUrl" TEXT,
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinTaxChallan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinGstr2bUpload" (
    "id" TEXT NOT NULL,
    "period" VARCHAR(7) NOT NULL,
    "fileName" TEXT,
    "rows" JSONB NOT NULL,
    "rowCount" INTEGER NOT NULL,
    "uploadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinGstr2bUpload_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinTaxDocRef" (
    "id" TEXT NOT NULL,
    "sourceKind" VARCHAR(20) NOT NULL,
    "sourceId" VARCHAR(60) NOT NULL,
    "irn" VARCHAR(64),
    "ackNo" VARCHAR(30),
    "ackDate" DATE,
    "ewbNo" VARCHAR(20),
    "ewbDate" DATE,
    "ewbValidUpto" DATE,
    "status" VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinTaxDocRef_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FinTaxChallan_voucherId_key" ON "FinTaxChallan"("voucherId");

-- CreateIndex
CREATE INDEX "FinTaxChallan_taxType_period_idx" ON "FinTaxChallan"("taxType", "period");

-- CreateIndex
CREATE UNIQUE INDEX "FinGstr2bUpload_period_key" ON "FinGstr2bUpload"("period");

-- CreateIndex
CREATE UNIQUE INDEX "FinTaxDocRef_sourceKind_sourceId_key" ON "FinTaxDocRef"("sourceKind", "sourceId");

