-- CreateEnum
CREATE TYPE "FinPayrollStatus" AS ENUM ('DRAFT', 'POSTED', 'PAID', 'CANCELLED');

-- CreateEnum
CREATE TYPE "FinSettlementDocStatus" AS ENUM ('DRAFT', 'POSTED', 'PAID');

-- CreateTable
CREATE TABLE "FinSalaryStructure" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "components" JSONB NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinSalaryStructure_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinEmployeeSalary" (
    "id" TEXT NOT NULL,
    "partyId" TEXT NOT NULL,
    "employeeCode" VARCHAR(30),
    "designation" TEXT,
    "department" TEXT,
    "dateOfJoining" DATE,
    "dateOfLeaving" DATE,
    "structureId" TEXT,
    "earnings" JSONB NOT NULL,
    "pfApplicable" BOOLEAN NOT NULL DEFAULT true,
    "pfWageCap" BOOLEAN NOT NULL DEFAULT true,
    "esiApplicable" BOOLEAN NOT NULL DEFAULT true,
    "ptState" VARCHAR(2),
    "monthlyTds" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "uan" VARCHAR(12),
    "esiNumber" VARCHAR(17),
    "costCentreId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinEmployeeSalary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinPayrollRun" (
    "id" TEXT NOT NULL,
    "month" VARCHAR(7) NOT NULL,
    "status" "FinPayrollStatus" NOT NULL DEFAULT 'DRAFT',
    "payDate" DATE,
    "totals" JSONB NOT NULL,
    "voucherId" TEXT,
    "paymentVoucherId" TEXT,
    "notes" TEXT,
    "createdById" TEXT,
    "approvedById" TEXT,
    "postedAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinPayrollRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinPayslip" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "partyId" TEXT NOT NULL,
    "daysInMonth" INTEGER NOT NULL,
    "paidDays" DECIMAL(5,1) NOT NULL,
    "earnings" JSONB NOT NULL,
    "additions" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "gross" DECIMAL(14,2) NOT NULL,
    "pfWage" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "employeePf" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "employeeEsi" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "professionalTax" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "tds" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "advanceRecovery" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "net" DECIMAL(14,2) NOT NULL,
    "employerPf" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "employerEsi" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinPayslip_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinEmployeeAdvance" (
    "id" TEXT NOT NULL,
    "partyId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "monthlyRecovery" DECIMAL(14,2) NOT NULL,
    "voucherId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinEmployeeAdvance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinFullFinal" (
    "id" TEXT NOT NULL,
    "partyId" TEXT NOT NULL,
    "lastWorkingDay" DATE NOT NULL,
    "items" JSONB NOT NULL,
    "tds" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "advanceRecovery" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "net" DECIMAL(14,2) NOT NULL,
    "status" "FinSettlementDocStatus" NOT NULL DEFAULT 'DRAFT',
    "voucherId" TEXT,
    "paymentVoucherId" TEXT,
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinFullFinal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FinSalaryStructure_name_key" ON "FinSalaryStructure"("name");

-- CreateIndex
CREATE UNIQUE INDEX "FinEmployeeSalary_partyId_key" ON "FinEmployeeSalary"("partyId");

-- CreateIndex
CREATE UNIQUE INDEX "FinPayrollRun_voucherId_key" ON "FinPayrollRun"("voucherId");

-- CreateIndex
CREATE UNIQUE INDEX "FinPayrollRun_paymentVoucherId_key" ON "FinPayrollRun"("paymentVoucherId");

-- CreateIndex
CREATE INDEX "FinPayrollRun_month_status_idx" ON "FinPayrollRun"("month", "status");

-- CreateIndex
CREATE UNIQUE INDEX "FinPayslip_runId_partyId_key" ON "FinPayslip"("runId", "partyId");

-- CreateIndex
CREATE UNIQUE INDEX "FinEmployeeAdvance_voucherId_key" ON "FinEmployeeAdvance"("voucherId");

-- CreateIndex
CREATE INDEX "FinEmployeeAdvance_partyId_isActive_idx" ON "FinEmployeeAdvance"("partyId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "FinFullFinal_voucherId_key" ON "FinFullFinal"("voucherId");

-- CreateIndex
CREATE UNIQUE INDEX "FinFullFinal_paymentVoucherId_key" ON "FinFullFinal"("paymentVoucherId");

-- CreateIndex
CREATE INDEX "FinFullFinal_partyId_idx" ON "FinFullFinal"("partyId");

-- AddForeignKey
ALTER TABLE "FinPayslip" ADD CONSTRAINT "FinPayslip_runId_fkey" FOREIGN KEY ("runId") REFERENCES "FinPayrollRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

