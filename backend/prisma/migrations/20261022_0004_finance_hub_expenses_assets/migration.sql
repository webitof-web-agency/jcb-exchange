-- CreateEnum
CREATE TYPE "FinRecurringFrequency" AS ENUM ('MONTHLY', 'QUARTERLY', 'HALF_YEARLY', 'YEARLY');

-- CreateEnum
CREATE TYPE "FinRecurringMode" AS ENUM ('BILL', 'ACCRUAL');

-- CreateEnum
CREATE TYPE "FinReimbursementStatus" AS ENUM ('SUBMITTED', 'APPROVED', 'REJECTED', 'PAID');

-- CreateEnum
CREATE TYPE "FinAssetMethod" AS ENUM ('SLM', 'WDV');

-- CreateEnum
CREATE TYPE "FinAssetStatus" AS ENUM ('ACTIVE', 'DISPOSED');

-- CreateEnum
CREATE TYPE "FinRunKind" AS ENUM ('DEPRECIATION', 'PREPAID');

-- CreateEnum
CREATE TYPE "FinRunStatus" AS ENUM ('POSTED', 'REVERSED');

-- CreateTable
CREATE TABLE "FinRecurringExpense" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mode" "FinRecurringMode" NOT NULL DEFAULT 'ACCRUAL',
    "partyId" TEXT,
    "accountId" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "gstRate" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "frequency" "FinRecurringFrequency" NOT NULL DEFAULT 'MONTHLY',
    "dayOfMonth" INTEGER NOT NULL DEFAULT 1,
    "startDate" DATE NOT NULL,
    "endDate" DATE,
    "nextRunDate" DATE NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinRecurringExpense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinRecurringRun" (
    "id" TEXT NOT NULL,
    "recurringId" TEXT NOT NULL,
    "periodKey" VARCHAR(10) NOT NULL,
    "runDate" DATE NOT NULL,
    "documentId" TEXT,
    "voucherId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinRecurringRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinReimbursement" (
    "id" TEXT NOT NULL,
    "partyId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "accountId" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "description" TEXT NOT NULL,
    "receiptUrl" TEXT,
    "status" "FinReimbursementStatus" NOT NULL DEFAULT 'SUBMITTED',
    "approvalVoucherId" TEXT,
    "paymentVoucherId" TEXT,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "paidById" TEXT,
    "paidAt" TIMESTAMP(3),
    "rejectReason" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinReimbursement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinFixedAsset" (
    "id" TEXT NOT NULL,
    "code" VARCHAR(30) NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "assetAccountId" TEXT NOT NULL,
    "purchaseDate" DATE NOT NULL,
    "putToUseDate" DATE NOT NULL,
    "cost" DECIMAL(14,2) NOT NULL,
    "salvageValue" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "method" "FinAssetMethod" NOT NULL DEFAULT 'WDV',
    "usefulLifeMonths" INTEGER,
    "wdvRatePercent" DECIMAL(6,2),
    "openingAccumulated" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "location" TEXT,
    "custodian" TEXT,
    "serialNumber" TEXT,
    "vendorPartyId" TEXT,
    "documentId" TEXT,
    "status" "FinAssetStatus" NOT NULL DEFAULT 'ACTIVE',
    "disposedAt" DATE,
    "disposalAmount" DECIMAL(14,2),
    "disposalVoucherId" TEXT,
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinFixedAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinPrepaidExpense" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "expenseAccountId" TEXT NOT NULL,
    "prepaidAccountId" TEXT NOT NULL,
    "partyId" TEXT,
    "totalAmount" DECIMAL(14,2) NOT NULL,
    "startDate" DATE NOT NULL,
    "months" INTEGER NOT NULL,
    "reference" VARCHAR(80),
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinPrepaidExpense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinPeriodicRun" (
    "id" TEXT NOT NULL,
    "kind" "FinRunKind" NOT NULL,
    "periodKey" VARCHAR(7) NOT NULL,
    "runDate" DATE NOT NULL,
    "total" DECIMAL(14,2) NOT NULL,
    "lines" JSONB NOT NULL,
    "voucherId" TEXT NOT NULL,
    "status" "FinRunStatus" NOT NULL DEFAULT 'POSTED',
    "createdById" TEXT,
    "reversedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinPeriodicRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FinRecurringExpense_isActive_nextRunDate_idx" ON "FinRecurringExpense"("isActive", "nextRunDate");

-- CreateIndex
CREATE UNIQUE INDEX "FinRecurringRun_recurringId_periodKey_key" ON "FinRecurringRun"("recurringId", "periodKey");

-- CreateIndex
CREATE INDEX "FinReimbursement_status_date_idx" ON "FinReimbursement"("status", "date");

-- CreateIndex
CREATE INDEX "FinReimbursement_partyId_idx" ON "FinReimbursement"("partyId");

-- CreateIndex
CREATE UNIQUE INDEX "FinFixedAsset_code_key" ON "FinFixedAsset"("code");

-- CreateIndex
CREATE INDEX "FinFixedAsset_status_idx" ON "FinFixedAsset"("status");

-- CreateIndex
CREATE UNIQUE INDEX "FinPeriodicRun_voucherId_key" ON "FinPeriodicRun"("voucherId");

-- CreateIndex
CREATE INDEX "FinPeriodicRun_kind_periodKey_idx" ON "FinPeriodicRun"("kind", "periodKey");

-- AddForeignKey
ALTER TABLE "FinRecurringRun" ADD CONSTRAINT "FinRecurringRun_recurringId_fkey" FOREIGN KEY ("recurringId") REFERENCES "FinRecurringExpense"("id") ON DELETE CASCADE ON UPDATE CASCADE;

