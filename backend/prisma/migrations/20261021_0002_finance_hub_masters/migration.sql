-- Finance Hub P1 masters: company profile, GST registrations, financial years and periods,
-- chart of accounts, parties, bank accounts, cost centres, voucher numbering, opening balances.
-- New tables only (foreign keys reference finance hub tables only); no existing table is altered.
-- CreateEnum
CREATE TYPE "FinGstRegistrationType" AS ENUM ('REGULAR', 'COMPOSITION');

-- CreateEnum
CREATE TYPE "FinPeriodStatus" AS ENUM ('OPEN', 'SOFT_CLOSED', 'LOCKED');

-- CreateEnum
CREATE TYPE "FinAccountNature" AS ENUM ('ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE');

-- CreateEnum
CREATE TYPE "FinAccountKind" AS ENUM ('GENERAL', 'BANK', 'CASH', 'PETTY_CASH', 'WALLET', 'GATEWAY_CLEARING', 'PARTY_CONTROL', 'STOCK', 'TAX', 'FIXED_ASSET', 'ACCUMULATED_DEPRECIATION', 'PREPAID', 'SUSPENSE', 'CLEARING', 'ROUND_OFF', 'EQUITY');

-- CreateEnum
CREATE TYPE "FinBalanceSide" AS ENUM ('DR', 'CR');

-- CreateEnum
CREATE TYPE "FinPartyType" AS ENUM ('CUSTOMER', 'SELLER', 'PARTNER', 'BROKER', 'AGENT', 'VENDOR', 'EMPLOYEE', 'OTHER');

-- CreateEnum
CREATE TYPE "FinBankAccountType" AS ENUM ('CURRENT', 'SAVINGS', 'OD', 'CC', 'VIRTUAL', 'CASH', 'PETTY_CASH', 'WALLET', 'GATEWAY');

-- CreateEnum
CREATE TYPE "FinCostCentreCategory" AS ENUM ('BRANCH', 'DEPARTMENT', 'YARD', 'PROJECT', 'OTHER');

-- CreateEnum
CREATE TYPE "FinVoucherType" AS ENUM ('JOURNAL', 'PAYMENT', 'RECEIPT', 'CONTRA', 'SALES', 'PURCHASE', 'CREDIT_NOTE', 'DEBIT_NOTE', 'EXPENSE', 'PAYROLL', 'DEPRECIATION', 'OPENING', 'CLOSING', 'WRITE_OFF', 'ADJUSTMENT');

-- CreateTable
CREATE TABLE "FinCompanyProfile" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "legalName" TEXT NOT NULL,
    "tradeName" TEXT,
    "pan" VARCHAR(10),
    "tan" VARCHAR(10),
    "cin" VARCHAR(21),
    "msmeUdyam" VARCHAR(30),
    "constitution" VARCHAR(40),
    "address" TEXT,
    "city" TEXT,
    "state" TEXT,
    "stateCode" VARCHAR(2),
    "pinCode" VARCHAR(6),
    "email" TEXT,
    "phone" VARCHAR(15),
    "signatoryName" TEXT,
    "signatoryDesignation" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinCompanyProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinGstRegistration" (
    "id" TEXT NOT NULL,
    "gstin" VARCHAR(15) NOT NULL,
    "stateCode" VARCHAR(2) NOT NULL,
    "stateName" TEXT NOT NULL,
    "registrationType" "FinGstRegistrationType" NOT NULL DEFAULT 'REGULAR',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "marginSchemeEnabled" BOOLEAN NOT NULL DEFAULT true,
    "einvoiceApplicable" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinGstRegistration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinFinancialYear" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "status" "FinPeriodStatus" NOT NULL DEFAULT 'OPEN',
    "isCurrent" BOOLEAN NOT NULL DEFAULT false,
    "openingFinalizedAt" TIMESTAMP(3),
    "openingFinalizedById" TEXT,
    "closedAt" TIMESTAMP(3),
    "closedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinFinancialYear_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinPeriod" (
    "id" TEXT NOT NULL,
    "yearId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "status" "FinPeriodStatus" NOT NULL DEFAULT 'OPEN',
    "statusChangedAt" TIMESTAMP(3),
    "statusChangedById" TEXT,
    "statusReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinAccountGroup" (
    "id" TEXT NOT NULL,
    "code" VARCHAR(12) NOT NULL,
    "name" TEXT NOT NULL,
    "nature" "FinAccountNature" NOT NULL,
    "parentId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "reportLine" VARCHAR(80),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinAccountGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinAccount" (
    "id" TEXT NOT NULL,
    "code" VARCHAR(12) NOT NULL,
    "name" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "kind" "FinAccountKind" NOT NULL DEFAULT 'GENERAL',
    "normalBalance" "FinBalanceSide" NOT NULL,
    "systemKey" VARCHAR(60),
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "allowManualPosting" BOOLEAN NOT NULL DEFAULT true,
    "requiresParty" BOOLEAN NOT NULL DEFAULT false,
    "requiresVehicle" BOOLEAN NOT NULL DEFAULT false,
    "requiresCostCentre" BOOLEAN NOT NULL DEFAULT false,
    "gstApplicable" BOOLEAN NOT NULL DEFAULT false,
    "defaultGstRate" DECIMAL(5,2),
    "hsnSac" VARCHAR(10),
    "tdsSection" VARCHAR(10),
    "tallyName" TEXT,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinCategoryMap" (
    "id" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinCategoryMap_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinParty" (
    "id" TEXT NOT NULL,
    "code" VARCHAR(20) NOT NULL,
    "name" TEXT NOT NULL,
    "types" "FinPartyType"[],
    "mobile" VARCHAR(15),
    "altMobile" VARCHAR(15),
    "email" TEXT,
    "gstin" VARCHAR(15),
    "pan" VARCHAR(10),
    "address" TEXT,
    "city" TEXT,
    "state" TEXT,
    "stateCode" VARCHAR(2),
    "pinCode" VARCHAR(6),
    "bankName" TEXT,
    "bankAccountNumber" VARCHAR(34),
    "ifsc" VARCHAR(11),
    "upiId" TEXT,
    "creditLimit" DECIMAL(14,2),
    "creditDays" INTEGER,
    "tdsSection" VARCHAR(10),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinParty_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinPartyLink" (
    "id" TEXT NOT NULL,
    "partyId" TEXT NOT NULL,
    "linkType" VARCHAR(40) NOT NULL,
    "linkId" VARCHAR(100) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinPartyLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinBankAccount" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "type" "FinBankAccountType" NOT NULL,
    "displayName" TEXT NOT NULL,
    "bankName" TEXT,
    "branch" TEXT,
    "accountNumber" VARCHAR(34),
    "ifsc" VARCHAR(11),
    "holderName" TEXT,
    "parentBankAccountId" TEXT,
    "vanPrefix" VARCHAR(20),
    "statementAliases" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "overdraftLimit" DECIMAL(14,2),
    "custodianUserId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinBankAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinCostCentre" (
    "id" TEXT NOT NULL,
    "code" VARCHAR(20) NOT NULL,
    "name" TEXT NOT NULL,
    "category" "FinCostCentreCategory" NOT NULL DEFAULT 'DEPARTMENT',
    "parentId" TEXT,
    "managerUserId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinCostCentre_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinNumberSeries" (
    "id" TEXT NOT NULL,
    "voucherType" "FinVoucherType" NOT NULL,
    "yearId" TEXT NOT NULL,
    "prefix" VARCHAR(30) NOT NULL,
    "nextNumber" INTEGER NOT NULL DEFAULT 1,
    "padLength" INTEGER NOT NULL DEFAULT 5,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinNumberSeries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinOpeningBalance" (
    "id" TEXT NOT NULL,
    "yearId" TEXT NOT NULL,
    "lineKey" VARCHAR(260) NOT NULL,
    "accountId" TEXT NOT NULL,
    "partyId" TEXT,
    "debit" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "credit" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "billRef" VARCHAR(60),
    "billDate" DATE,
    "dueDate" DATE,
    "note" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinOpeningBalance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FinGstRegistration_gstin_key" ON "FinGstRegistration"("gstin");

-- CreateIndex
CREATE UNIQUE INDEX "FinFinancialYear_label_key" ON "FinFinancialYear"("label");

-- CreateIndex
CREATE UNIQUE INDEX "FinFinancialYear_startDate_key" ON "FinFinancialYear"("startDate");

-- CreateIndex
CREATE INDEX "FinPeriod_startDate_endDate_idx" ON "FinPeriod"("startDate", "endDate");

-- CreateIndex
CREATE UNIQUE INDEX "FinPeriod_yearId_startDate_key" ON "FinPeriod"("yearId", "startDate");

-- CreateIndex
CREATE UNIQUE INDEX "FinAccountGroup_code_key" ON "FinAccountGroup"("code");

-- CreateIndex
CREATE INDEX "FinAccountGroup_parentId_idx" ON "FinAccountGroup"("parentId");

-- CreateIndex
CREATE UNIQUE INDEX "FinAccount_code_key" ON "FinAccount"("code");

-- CreateIndex
CREATE UNIQUE INDEX "FinAccount_systemKey_key" ON "FinAccount"("systemKey");

-- CreateIndex
CREATE INDEX "FinAccount_groupId_idx" ON "FinAccount"("groupId");

-- CreateIndex
CREATE INDEX "FinAccount_kind_idx" ON "FinAccount"("kind");

-- CreateIndex
CREATE UNIQUE INDEX "FinCategoryMap_category_key" ON "FinCategoryMap"("category");

-- CreateIndex
CREATE UNIQUE INDEX "FinParty_code_key" ON "FinParty"("code");

-- CreateIndex
CREATE INDEX "FinParty_mobile_idx" ON "FinParty"("mobile");

-- CreateIndex
CREATE INDEX "FinParty_gstin_idx" ON "FinParty"("gstin");

-- CreateIndex
CREATE INDEX "FinParty_name_idx" ON "FinParty"("name");

-- CreateIndex
CREATE INDEX "FinPartyLink_partyId_idx" ON "FinPartyLink"("partyId");

-- CreateIndex
CREATE UNIQUE INDEX "FinPartyLink_linkType_linkId_key" ON "FinPartyLink"("linkType", "linkId");

-- CreateIndex
CREATE UNIQUE INDEX "FinBankAccount_accountId_key" ON "FinBankAccount"("accountId");

-- CreateIndex
CREATE UNIQUE INDEX "FinCostCentre_code_key" ON "FinCostCentre"("code");

-- CreateIndex
CREATE UNIQUE INDEX "FinNumberSeries_voucherType_yearId_key" ON "FinNumberSeries"("voucherType", "yearId");

-- CreateIndex
CREATE INDEX "FinOpeningBalance_accountId_idx" ON "FinOpeningBalance"("accountId");

-- CreateIndex
CREATE INDEX "FinOpeningBalance_partyId_idx" ON "FinOpeningBalance"("partyId");

-- CreateIndex
CREATE UNIQUE INDEX "FinOpeningBalance_yearId_lineKey_key" ON "FinOpeningBalance"("yearId", "lineKey");

-- AddForeignKey
ALTER TABLE "FinPeriod" ADD CONSTRAINT "FinPeriod_yearId_fkey" FOREIGN KEY ("yearId") REFERENCES "FinFinancialYear"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinAccountGroup" ADD CONSTRAINT "FinAccountGroup_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "FinAccountGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinAccount" ADD CONSTRAINT "FinAccount_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "FinAccountGroup"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinCategoryMap" ADD CONSTRAINT "FinCategoryMap_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "FinAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinPartyLink" ADD CONSTRAINT "FinPartyLink_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "FinParty"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinBankAccount" ADD CONSTRAINT "FinBankAccount_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "FinAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinCostCentre" ADD CONSTRAINT "FinCostCentre_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "FinCostCentre"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinNumberSeries" ADD CONSTRAINT "FinNumberSeries_yearId_fkey" FOREIGN KEY ("yearId") REFERENCES "FinFinancialYear"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinOpeningBalance" ADD CONSTRAINT "FinOpeningBalance_yearId_fkey" FOREIGN KEY ("yearId") REFERENCES "FinFinancialYear"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinOpeningBalance" ADD CONSTRAINT "FinOpeningBalance_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "FinAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinOpeningBalance" ADD CONSTRAINT "FinOpeningBalance_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "FinParty"("id") ON DELETE SET NULL ON UPDATE CASCADE;

