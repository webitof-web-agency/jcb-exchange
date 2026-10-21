-- CreateEnum
CREATE TYPE "FinDueSide" AS ENUM ('RECEIVABLE', 'PAYABLE');

-- CreateEnum
CREATE TYPE "FinScheduleStatus" AS ENUM ('PLANNED', 'DONE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "FinFollowUpKind" AS ENUM ('CALL', 'WHATSAPP', 'SMS', 'EMAIL', 'VISIT', 'NOTE');

-- CreateEnum
CREATE TYPE "FinFollowUpStatus" AS ENUM ('OPEN', 'DONE');

-- CreateEnum
CREATE TYPE "FinWriteOffKind" AS ENUM ('WRITE_OFF', 'DISCOUNT', 'WAIVER', 'WRITE_BACK');

-- CreateTable
CREATE TABLE "FinPaymentSchedule" (
    "id" TEXT NOT NULL,
    "side" "FinDueSide" NOT NULL,
    "partyId" TEXT NOT NULL,
    "dueDate" DATE NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "reference" VARCHAR(80),
    "sellAccountId" VARCHAR(60),
    "notes" TEXT,
    "status" "FinScheduleStatus" NOT NULL DEFAULT 'PLANNED',
    "voucherNumber" VARCHAR(60),
    "createdById" TEXT,
    "completedById" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinPaymentSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinFollowUp" (
    "id" TEXT NOT NULL,
    "partyId" TEXT NOT NULL,
    "side" "FinDueSide" NOT NULL DEFAULT 'RECEIVABLE',
    "kind" "FinFollowUpKind" NOT NULL DEFAULT 'CALL',
    "notes" TEXT NOT NULL,
    "promisedDate" DATE,
    "promisedAmount" DECIMAL(14,2),
    "nextActionDate" DATE,
    "status" "FinFollowUpStatus" NOT NULL DEFAULT 'OPEN',
    "assignedToId" TEXT,
    "createdById" TEXT,
    "doneById" TEXT,
    "doneAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinFollowUp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinWriteOff" (
    "id" TEXT NOT NULL,
    "side" "FinDueSide" NOT NULL,
    "kind" "FinWriteOffKind" NOT NULL,
    "partyId" TEXT NOT NULL,
    "controlAccountId" TEXT NOT NULL,
    "counterAccountId" TEXT NOT NULL,
    "sellAccountId" VARCHAR(60),
    "date" DATE NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "reason" TEXT NOT NULL,
    "voucherId" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinWriteOff_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FinPaymentSchedule_status_dueDate_idx" ON "FinPaymentSchedule"("status", "dueDate");

-- CreateIndex
CREATE INDEX "FinPaymentSchedule_partyId_idx" ON "FinPaymentSchedule"("partyId");

-- CreateIndex
CREATE INDEX "FinFollowUp_status_nextActionDate_idx" ON "FinFollowUp"("status", "nextActionDate");

-- CreateIndex
CREATE INDEX "FinFollowUp_partyId_idx" ON "FinFollowUp"("partyId");

-- CreateIndex
CREATE UNIQUE INDEX "FinWriteOff_voucherId_key" ON "FinWriteOff"("voucherId");

-- CreateIndex
CREATE INDEX "FinWriteOff_partyId_idx" ON "FinWriteOff"("partyId");

-- AddForeignKey
ALTER TABLE "FinPaymentSchedule" ADD CONSTRAINT "FinPaymentSchedule_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "FinParty"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinFollowUp" ADD CONSTRAINT "FinFollowUp_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "FinParty"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinWriteOff" ADD CONSTRAINT "FinWriteOff_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "FinParty"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

