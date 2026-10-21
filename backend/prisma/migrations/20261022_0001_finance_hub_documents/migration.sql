-- Finance Hub P4b: purchase bills, other sales invoices, credit/debit notes, vehicle deal terms
-- (brokerage, consignment, partner share) and partner settlements.
-- New tables only; foreign keys reference finance hub tables only (vehicle ids are plain columns).
-- CreateEnum
CREATE TYPE "FinDocumentType" AS ENUM ('PURCHASE_BILL', 'SALES_INVOICE', 'CREDIT_NOTE', 'DEBIT_NOTE');

-- CreateEnum
CREATE TYPE "FinDocumentStatus" AS ENUM ('DRAFT', 'POSTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "FinNoteReason" AS ENUM ('RETURN', 'PRICE_CHANGE', 'DISCOUNT', 'DEFICIENCY', 'OTHER');

-- CreateEnum
CREATE TYPE "FinDealMode" AS ENUM ('OUTRIGHT', 'CONSIGNMENT');

-- CreateEnum
CREATE TYPE "FinSettlementStatus" AS ENUM ('DRAFT', 'PAID', 'CANCELLED');

-- CreateTable
CREATE TABLE "FinDocument" (
    "id" TEXT NOT NULL,
    "docType" "FinDocumentType" NOT NULL,
    "status" "FinDocumentStatus" NOT NULL DEFAULT 'DRAFT',
    "number" VARCHAR(60),
    "partyDocNumber" VARCHAR(60),
    "date" DATE NOT NULL,
    "dueDate" DATE,
    "partyId" TEXT NOT NULL,
    "placeOfSupply" VARCHAR(2),
    "isIntraState" BOOLEAN NOT NULL DEFAULT true,
    "isReverseCharge" BOOLEAN NOT NULL DEFAULT false,
    "reason" "FinNoteReason",
    "againstDocumentId" TEXT,
    "againstReference" VARCHAR(80),
    "sellAccountId" VARCHAR(60),
    "notes" TEXT,
    "subTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "cgst" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "sgst" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "igst" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "tdsSection" VARCHAR(10),
    "tdsAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "roundOff" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "voucherId" TEXT,
    "cancelReason" TEXT,
    "createdById" TEXT,
    "updatedById" TEXT,
    "postedById" TEXT,
    "postedAt" TIMESTAMP(3),
    "cancelledById" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinDocumentLine" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "lineNo" INTEGER NOT NULL,
    "description" VARCHAR(300) NOT NULL,
    "accountId" TEXT NOT NULL,
    "hsnSac" VARCHAR(10),
    "quantity" DECIMAL(12,3) NOT NULL DEFAULT 1,
    "rate" DECIMAL(14,2) NOT NULL,
    "discount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "taxableValue" DECIMAL(14,2) NOT NULL,
    "gstRate" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "cgst" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "sgst" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "igst" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "itcEligible" BOOLEAN NOT NULL DEFAULT true,
    "sellAccountId" VARCHAR(60),
    "costCentreId" TEXT,

    CONSTRAINT "FinDocumentLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinVehicleDealExt" (
    "id" TEXT NOT NULL,
    "sellAccountId" VARCHAR(60) NOT NULL,
    "dealMode" "FinDealMode" NOT NULL DEFAULT 'OUTRIGHT',
    "consignorPartyId" TEXT,
    "consignmentCommission" DECIMAL(14,2),
    "brokerPartyId" TEXT,
    "brokeragePayable" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "brokerageReceivable" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "brokerageReceivablePartyId" TEXT,
    "partnerPartyId" TEXT,
    "partnerShareAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinVehicleDealExt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinPartnerSettlement" (
    "id" TEXT NOT NULL,
    "partyId" TEXT NOT NULL,
    "status" "FinSettlementStatus" NOT NULL DEFAULT 'DRAFT',
    "date" DATE NOT NULL,
    "bankAccountId" TEXT,
    "paymentMethod" VARCHAR(20),
    "reference" VARCHAR(80),
    "grossAmount" DECIMAL(14,2) NOT NULL,
    "tdsSection" VARCHAR(10),
    "tdsAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "netAmount" DECIMAL(14,2) NOT NULL,
    "lines" JSONB NOT NULL,
    "notes" TEXT,
    "voucherId" TEXT,
    "createdById" TEXT,
    "paidById" TEXT,
    "paidAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinPartnerSettlement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FinDocument_number_key" ON "FinDocument"("number");

-- CreateIndex
CREATE UNIQUE INDEX "FinDocument_voucherId_key" ON "FinDocument"("voucherId");

-- CreateIndex
CREATE INDEX "FinDocument_docType_date_idx" ON "FinDocument"("docType", "date");

-- CreateIndex
CREATE INDEX "FinDocument_partyId_docType_idx" ON "FinDocument"("partyId", "docType");

-- CreateIndex
CREATE INDEX "FinDocument_status_docType_idx" ON "FinDocument"("status", "docType");

-- CreateIndex
CREATE INDEX "FinDocument_sellAccountId_idx" ON "FinDocument"("sellAccountId");

-- CreateIndex
CREATE INDEX "FinDocumentLine_documentId_idx" ON "FinDocumentLine"("documentId");

-- CreateIndex
CREATE INDEX "FinDocumentLine_accountId_idx" ON "FinDocumentLine"("accountId");

-- CreateIndex
CREATE INDEX "FinDocumentLine_sellAccountId_idx" ON "FinDocumentLine"("sellAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "FinVehicleDealExt_sellAccountId_key" ON "FinVehicleDealExt"("sellAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "FinPartnerSettlement_voucherId_key" ON "FinPartnerSettlement"("voucherId");

-- CreateIndex
CREATE INDEX "FinPartnerSettlement_partyId_status_idx" ON "FinPartnerSettlement"("partyId", "status");

-- AddForeignKey
ALTER TABLE "FinDocument" ADD CONSTRAINT "FinDocument_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "FinParty"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinDocument" ADD CONSTRAINT "FinDocument_againstDocumentId_fkey" FOREIGN KEY ("againstDocumentId") REFERENCES "FinDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinDocumentLine" ADD CONSTRAINT "FinDocumentLine_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "FinDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinDocumentLine" ADD CONSTRAINT "FinDocumentLine_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "FinAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinPartnerSettlement" ADD CONSTRAINT "FinPartnerSettlement_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "FinParty"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

