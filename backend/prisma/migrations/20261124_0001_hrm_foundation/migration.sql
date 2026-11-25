-- CreateEnum
CREATE TYPE "HrmEmployeeSource" AS ENUM ('RECRUITMENT', 'DIRECT_HR');

-- CreateEnum
CREATE TYPE "HrmEmployeeStatus" AS ENUM ('DRAFT', 'PRE_ONBOARDING', 'ONBOARDING', 'ACTIVE', 'ON_LEAVE', 'SUSPENDED', 'NOTICE_PERIOD', 'EXITED', 'TERMINATED');

-- CreateEnum
CREATE TYPE "HrmOrgUnitType" AS ENUM ('COMPANY', 'HEAD_OFFICE', 'REGION', 'BRANCH', 'DEPARTMENT', 'TEAM');

-- CreateEnum
CREATE TYPE "HrmAssignmentStatus" AS ENUM ('PLANNED', 'ACTIVE', 'ENDED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "HrmScopeType" AS ENUM ('OWN', 'DIRECT_REPORTS', 'TEAM', 'DEPARTMENT', 'REGION', 'STATE', 'HEAD_OFFICE', 'ALL_INDIA');

-- CreateEnum
CREATE TYPE "HrmOnboardingStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'READY_FOR_APPROVAL', 'APPROVED', 'REJECTED', 'CANCELLED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "HrmDocumentCategory" AS ENUM ('IDENTITY', 'ADDRESS', 'EDUCATION', 'EXPERIENCE', 'OFFER', 'ACCEPTANCE', 'BANK', 'TAX', 'EMPLOYMENT', 'OTHER');

-- CreateEnum
CREATE TYPE "HrmDocumentStatus" AS ENUM ('PENDING', 'VERIFIED', 'REJECTED', 'EXPIRED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "HrmDocumentProvider" AS ENUM ('MANUAL', 'SUREPASS', 'GOOGLE_DRIVE', 'OTHER');

-- CreateEnum
CREATE TYPE "HrmAttendanceStatus" AS ENUM ('PRESENT', 'ABSENT', 'HALF_DAY', 'LEAVE', 'HOLIDAY', 'WEEK_OFF', 'WORK_FROM_HOME');

-- CreateEnum
CREATE TYPE "HrmLeaveRequestStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "HrmLeaveUnit" AS ENUM ('DAYS', 'HOURS');

-- CreateEnum
CREATE TYPE "HrmCompensationStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "HrmPerformanceStatus" AS ENUM ('DRAFT', 'OPEN', 'SUBMITTED', 'REVIEWED', 'ACKNOWLEDGED', 'CLOSED');

-- CreateEnum
CREATE TYPE "HrmIncentiveStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'PAID', 'CANCELLED');

-- CreateEnum
CREATE TYPE "HrmExitStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'NOTICE_PERIOD', 'CLEARANCE_PENDING', 'READY_FOR_SETTLEMENT', 'SETTLED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "HrmApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateTable
CREATE TABLE "HrmEmployee" (
    "id" TEXT NOT NULL,
    "employeeCode" VARCHAR(30) NOT NULL,
    "userId" TEXT,
    "source" "HrmEmployeeSource" NOT NULL,
    "status" "HrmEmployeeStatus" NOT NULL DEFAULT 'DRAFT',
    "legalName" VARCHAR(160) NOT NULL,
    "preferredName" VARCHAR(160),
    "workEmail" VARCHAR(254),
    "personalEmail" VARCHAR(254),
    "mobile" VARCHAR(15),
    "dateOfBirth" DATE,
    "joinedOn" DATE,
    "exitDate" DATE,
    "candidateId" TEXT,
    "applicationId" TEXT,
    "offerId" TEXT,
    "archivedAt" TIMESTAMP(3),
    "archivedById" TEXT,
    "createdById" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HrmEmployee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HrmOrgUnit" (
    "id" TEXT NOT NULL,
    "code" VARCHAR(40) NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "type" "HrmOrgUnitType" NOT NULL,
    "parentId" TEXT,
    "stateId" INTEGER,
    "cityId" INTEGER,
    "managerEmployeeId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HrmOrgUnit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HrmOperationalRegion" (
    "id" TEXT NOT NULL,
    "code" VARCHAR(40) NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HrmOperationalRegion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HrmOperationalRegionState" (
    "id" TEXT NOT NULL,
    "regionId" TEXT NOT NULL,
    "stateId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HrmOperationalRegionState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HrmEmploymentAssignment" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "orgUnitId" TEXT NOT NULL,
    "operationalRegionId" TEXT,
    "designation" VARCHAR(120) NOT NULL,
    "employmentType" "EmploymentType",
    "workMode" "WorkMode",
    "stateId" INTEGER,
    "cityId" INTEGER,
    "managerEmployeeId" TEXT,
    "approvalManagerId" TEXT,
    "status" "HrmAssignmentStatus" NOT NULL DEFAULT 'PLANNED',
    "effectiveFrom" DATE NOT NULL,
    "effectiveTo" DATE,
    "reason" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HrmEmploymentAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HrmAccessScope" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "scopeType" "HrmScopeType" NOT NULL,
    "orgUnitId" TEXT,
    "operationalRegionId" TEXT,
    "stateId" INTEGER,
    "includeChildren" BOOLEAN NOT NULL DEFAULT true,
    "activeFrom" DATE NOT NULL,
    "activeTo" DATE,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HrmAccessScope_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HrmOnboardingCase" (
    "id" TEXT NOT NULL,
    "candidateId" TEXT,
    "applicationId" TEXT,
    "offerId" TEXT,
    "employeeId" TEXT,
    "status" "HrmOnboardingStatus" NOT NULL DEFAULT 'PENDING',
    "source" "HrmEmployeeSource" NOT NULL,
    "targetJoiningDate" DATE,
    "initiatedById" TEXT,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "idempotencyKey" VARCHAR(120) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HrmOnboardingCase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HrmOfferAcceptanceEvidence" (
    "id" TEXT NOT NULL,
    "onboardingCaseId" TEXT NOT NULL,
    "offerId" TEXT NOT NULL,
    "responseAction" VARCHAR(20) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "signatureCaptured" BOOLEAN NOT NULL DEFAULT false,
    "signatureFileRef" TEXT,
    "signatureHash" VARCHAR(128),
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "legalDisclaimer" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HrmOfferAcceptanceEvidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HrmEmployeeDocument" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "category" "HrmDocumentCategory" NOT NULL,
    "title" VARCHAR(160) NOT NULL,
    "fileRef" VARCHAR(500) NOT NULL,
    "driveFileId" VARCHAR(200),
    "mimeType" VARCHAR(120),
    "fileSize" INTEGER,
    "provider" "HrmDocumentProvider" NOT NULL DEFAULT 'MANUAL',
    "providerReference" VARCHAR(200),
    "status" "HrmDocumentStatus" NOT NULL DEFAULT 'PENDING',
    "expiresAt" DATE,
    "verifiedById" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "metadata" JSONB,
    "uploadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HrmEmployeeDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HrmEmployeeBankAccount" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "bankName" VARCHAR(120),
    "accountHolderName" VARCHAR(160),
    "encryptedAccountNumber" TEXT,
    "maskedAccountNumber" VARCHAR(20),
    "ifsc" VARCHAR(11),
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "verifiedById" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HrmEmployeeBankAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HrmAttendanceRecord" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "attendanceDate" DATE NOT NULL,
    "status" "HrmAttendanceStatus" NOT NULL,
    "checkIn" TIMESTAMP(3),
    "checkOut" TIMESTAMP(3),
    "source" VARCHAR(40),
    "notes" TEXT,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HrmAttendanceRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HrmLeaveType" (
    "id" TEXT NOT NULL,
    "code" VARCHAR(40) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "unit" "HrmLeaveUnit" NOT NULL DEFAULT 'DAYS',
    "isPaid" BOOLEAN NOT NULL DEFAULT true,
    "annualQuota" DECIMAL(8,2),
    "requiresDocument" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HrmLeaveType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HrmLeaveRequest" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "leaveTypeId" TEXT NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "units" DECIMAL(8,2) NOT NULL,
    "reason" TEXT,
    "status" "HrmLeaveRequestStatus" NOT NULL DEFAULT 'DRAFT',
    "approverEmployeeId" TEXT,
    "approvedAt" TIMESTAMP(3),
    "decisionReason" TEXT,
    "idempotencyKey" VARCHAR(120) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HrmLeaveRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HrmCompensationRevision" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "effectiveFrom" DATE NOT NULL,
    "effectiveTo" DATE,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'INR',
    "baseSalary" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "grossSalary" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "annualCtc" DECIMAL(14,2),
    "status" "HrmCompensationStatus" NOT NULL DEFAULT 'DRAFT',
    "reason" TEXT,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "financeSyncStatus" VARCHAR(40),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HrmCompensationRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HrmCompensationComponent" (
    "id" TEXT NOT NULL,
    "revisionId" TEXT NOT NULL,
    "code" VARCHAR(40) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "componentType" VARCHAR(30) NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "isRecurring" BOOLEAN NOT NULL DEFAULT true,
    "isTaxable" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HrmCompensationComponent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HrmPerformanceCycle" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "startsOn" DATE NOT NULL,
    "endsOn" DATE NOT NULL,
    "status" "HrmPerformanceStatus" NOT NULL DEFAULT 'DRAFT',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HrmPerformanceCycle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HrmPerformanceReview" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "reviewerEmployeeId" TEXT,
    "status" "HrmPerformanceStatus" NOT NULL DEFAULT 'DRAFT',
    "rating" DECIMAL(5,2),
    "goals" JSONB,
    "strengths" TEXT,
    "improvementAreas" TEXT,
    "employeeComment" TEXT,
    "submittedAt" TIMESTAMP(3),
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HrmPerformanceReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HrmIncentive" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "incentiveType" VARCHAR(60) NOT NULL,
    "periodStart" DATE NOT NULL,
    "periodEnd" DATE NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "status" "HrmIncentiveStatus" NOT NULL DEFAULT 'DRAFT',
    "reason" TEXT,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "financeReference" VARCHAR(120),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HrmIncentive_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HrmExitCase" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "status" "HrmExitStatus" NOT NULL DEFAULT 'DRAFT',
    "exitType" VARCHAR(40) NOT NULL,
    "resignationDate" DATE,
    "requestedLastDay" DATE,
    "approvedLastDay" DATE,
    "reason" TEXT,
    "clearanceChecklist" JSONB,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "financeSettlementId" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HrmExitCase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HrmApproval" (
    "id" TEXT NOT NULL,
    "entityType" VARCHAR(60) NOT NULL,
    "entityId" VARCHAR(100) NOT NULL,
    "action" VARCHAR(60) NOT NULL,
    "status" "HrmApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "requestedByUserId" TEXT NOT NULL,
    "decidedByUserId" TEXT,
    "decisionReason" TEXT,
    "decidedAt" TIMESTAMP(3),
    "idempotencyKey" VARCHAR(120) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HrmApproval_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "HrmEmployee_employeeCode_key" ON "HrmEmployee"("employeeCode");

-- CreateIndex
CREATE UNIQUE INDEX "HrmEmployee_userId_key" ON "HrmEmployee"("userId");

-- CreateIndex
CREATE INDEX "HrmEmployee_status_updatedAt_idx" ON "HrmEmployee"("status", "updatedAt");

-- CreateIndex
CREATE INDEX "HrmEmployee_mobile_idx" ON "HrmEmployee"("mobile");

-- CreateIndex
CREATE INDEX "HrmEmployee_workEmail_idx" ON "HrmEmployee"("workEmail");

-- CreateIndex
CREATE INDEX "HrmEmployee_candidateId_idx" ON "HrmEmployee"("candidateId");

-- CreateIndex
CREATE INDEX "HrmEmployee_applicationId_idx" ON "HrmEmployee"("applicationId");

-- CreateIndex
CREATE INDEX "HrmEmployee_offerId_idx" ON "HrmEmployee"("offerId");

-- CreateIndex
CREATE UNIQUE INDEX "HrmOrgUnit_code_key" ON "HrmOrgUnit"("code");

-- CreateIndex
CREATE INDEX "HrmOrgUnit_parentId_isActive_idx" ON "HrmOrgUnit"("parentId", "isActive");

-- CreateIndex
CREATE INDEX "HrmOrgUnit_type_isActive_idx" ON "HrmOrgUnit"("type", "isActive");

-- CreateIndex
CREATE INDEX "HrmOrgUnit_stateId_isActive_idx" ON "HrmOrgUnit"("stateId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "HrmOperationalRegion_code_key" ON "HrmOperationalRegion"("code");

-- CreateIndex
CREATE INDEX "HrmOperationalRegion_isActive_name_idx" ON "HrmOperationalRegion"("isActive", "name");

-- CreateIndex
CREATE INDEX "HrmOperationalRegionState_stateId_idx" ON "HrmOperationalRegionState"("stateId");

-- CreateIndex
CREATE UNIQUE INDEX "HrmOperationalRegionState_regionId_stateId_key" ON "HrmOperationalRegionState"("regionId", "stateId");

-- CreateIndex
CREATE INDEX "HrmEmploymentAssignment_employeeId_effectiveFrom_effectiveT_idx" ON "HrmEmploymentAssignment"("employeeId", "effectiveFrom", "effectiveTo");

-- CreateIndex
CREATE INDEX "HrmEmploymentAssignment_orgUnitId_status_effectiveFrom_idx" ON "HrmEmploymentAssignment"("orgUnitId", "status", "effectiveFrom");

-- CreateIndex
CREATE INDEX "HrmEmploymentAssignment_managerEmployeeId_status_idx" ON "HrmEmploymentAssignment"("managerEmployeeId", "status");

-- CreateIndex
CREATE INDEX "HrmEmploymentAssignment_operationalRegionId_status_idx" ON "HrmEmploymentAssignment"("operationalRegionId", "status");

-- CreateIndex
CREATE INDEX "HrmEmploymentAssignment_stateId_status_idx" ON "HrmEmploymentAssignment"("stateId", "status");

-- CreateIndex
CREATE INDEX "HrmAccessScope_userId_activeFrom_activeTo_idx" ON "HrmAccessScope"("userId", "activeFrom", "activeTo");

-- CreateIndex
CREATE INDEX "HrmAccessScope_scopeType_orgUnitId_idx" ON "HrmAccessScope"("scopeType", "orgUnitId");

-- CreateIndex
CREATE INDEX "HrmAccessScope_scopeType_operationalRegionId_idx" ON "HrmAccessScope"("scopeType", "operationalRegionId");

-- CreateIndex
CREATE INDEX "HrmAccessScope_scopeType_stateId_idx" ON "HrmAccessScope"("scopeType", "stateId");

-- CreateIndex
CREATE UNIQUE INDEX "HrmOnboardingCase_employeeId_key" ON "HrmOnboardingCase"("employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "HrmOnboardingCase_idempotencyKey_key" ON "HrmOnboardingCase"("idempotencyKey");

-- CreateIndex
CREATE INDEX "HrmOnboardingCase_candidateId_idx" ON "HrmOnboardingCase"("candidateId");

-- CreateIndex
CREATE INDEX "HrmOnboardingCase_applicationId_idx" ON "HrmOnboardingCase"("applicationId");

-- CreateIndex
CREATE INDEX "HrmOnboardingCase_offerId_idx" ON "HrmOnboardingCase"("offerId");

-- CreateIndex
CREATE INDEX "HrmOnboardingCase_status_updatedAt_idx" ON "HrmOnboardingCase"("status", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "HrmOfferAcceptanceEvidence_onboardingCaseId_key" ON "HrmOfferAcceptanceEvidence"("onboardingCaseId");

-- CreateIndex
CREATE INDEX "HrmOfferAcceptanceEvidence_offerId_idx" ON "HrmOfferAcceptanceEvidence"("offerId");

-- CreateIndex
CREATE INDEX "HrmOfferAcceptanceEvidence_acceptedAt_idx" ON "HrmOfferAcceptanceEvidence"("acceptedAt");

-- CreateIndex
CREATE INDEX "HrmEmployeeDocument_employeeId_category_status_idx" ON "HrmEmployeeDocument"("employeeId", "category", "status");

-- CreateIndex
CREATE INDEX "HrmEmployeeDocument_employeeId_expiresAt_idx" ON "HrmEmployeeDocument"("employeeId", "expiresAt");

-- CreateIndex
CREATE INDEX "HrmEmployeeDocument_provider_providerReference_idx" ON "HrmEmployeeDocument"("provider", "providerReference");

-- CreateIndex
CREATE INDEX "HrmEmployeeBankAccount_employeeId_isPrimary_idx" ON "HrmEmployeeBankAccount"("employeeId", "isPrimary");

-- CreateIndex
CREATE INDEX "HrmAttendanceRecord_attendanceDate_status_idx" ON "HrmAttendanceRecord"("attendanceDate", "status");

-- CreateIndex
CREATE UNIQUE INDEX "HrmAttendanceRecord_employeeId_attendanceDate_key" ON "HrmAttendanceRecord"("employeeId", "attendanceDate");

-- CreateIndex
CREATE UNIQUE INDEX "HrmLeaveType_code_key" ON "HrmLeaveType"("code");

-- CreateIndex
CREATE UNIQUE INDEX "HrmLeaveRequest_idempotencyKey_key" ON "HrmLeaveRequest"("idempotencyKey");

-- CreateIndex
CREATE INDEX "HrmLeaveRequest_employeeId_startDate_endDate_idx" ON "HrmLeaveRequest"("employeeId", "startDate", "endDate");

-- CreateIndex
CREATE INDEX "HrmLeaveRequest_approverEmployeeId_status_idx" ON "HrmLeaveRequest"("approverEmployeeId", "status");

-- CreateIndex
CREATE INDEX "HrmLeaveRequest_status_startDate_idx" ON "HrmLeaveRequest"("status", "startDate");

-- CreateIndex
CREATE INDEX "HrmCompensationRevision_employeeId_effectiveFrom_effectiveT_idx" ON "HrmCompensationRevision"("employeeId", "effectiveFrom", "effectiveTo");

-- CreateIndex
CREATE INDEX "HrmCompensationRevision_status_effectiveFrom_idx" ON "HrmCompensationRevision"("status", "effectiveFrom");

-- CreateIndex
CREATE INDEX "HrmCompensationComponent_code_idx" ON "HrmCompensationComponent"("code");

-- CreateIndex
CREATE UNIQUE INDEX "HrmCompensationComponent_revisionId_code_key" ON "HrmCompensationComponent"("revisionId", "code");

-- CreateIndex
CREATE INDEX "HrmPerformanceCycle_startsOn_endsOn_status_idx" ON "HrmPerformanceCycle"("startsOn", "endsOn", "status");

-- CreateIndex
CREATE INDEX "HrmPerformanceReview_reviewerEmployeeId_status_idx" ON "HrmPerformanceReview"("reviewerEmployeeId", "status");

-- CreateIndex
CREATE INDEX "HrmPerformanceReview_cycleId_status_idx" ON "HrmPerformanceReview"("cycleId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "HrmPerformanceReview_employeeId_cycleId_key" ON "HrmPerformanceReview"("employeeId", "cycleId");

-- CreateIndex
CREATE INDEX "HrmIncentive_employeeId_periodStart_periodEnd_idx" ON "HrmIncentive"("employeeId", "periodStart", "periodEnd");

-- CreateIndex
CREATE INDEX "HrmIncentive_status_periodStart_idx" ON "HrmIncentive"("status", "periodStart");

-- CreateIndex
CREATE INDEX "HrmExitCase_employeeId_status_idx" ON "HrmExitCase"("employeeId", "status");

-- CreateIndex
CREATE INDEX "HrmExitCase_status_approvedLastDay_idx" ON "HrmExitCase"("status", "approvedLastDay");

-- CreateIndex
CREATE UNIQUE INDEX "HrmApproval_idempotencyKey_key" ON "HrmApproval"("idempotencyKey");

-- CreateIndex
CREATE INDEX "HrmApproval_entityType_entityId_action_status_idx" ON "HrmApproval"("entityType", "entityId", "action", "status");

-- CreateIndex
CREATE INDEX "HrmApproval_requestedByUserId_status_idx" ON "HrmApproval"("requestedByUserId", "status");

-- CreateIndex
CREATE INDEX "HrmApproval_decidedByUserId_status_idx" ON "HrmApproval"("decidedByUserId", "status");

-- AddForeignKey
ALTER TABLE "HrmEmployee" ADD CONSTRAINT "HrmEmployee_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HrmOrgUnit" ADD CONSTRAINT "HrmOrgUnit_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "HrmOrgUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HrmOrgUnit" ADD CONSTRAINT "HrmOrgUnit_stateId_fkey" FOREIGN KEY ("stateId") REFERENCES "State"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HrmOrgUnit" ADD CONSTRAINT "HrmOrgUnit_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "City"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HrmOrgUnit" ADD CONSTRAINT "HrmOrgUnit_managerEmployeeId_fkey" FOREIGN KEY ("managerEmployeeId") REFERENCES "HrmEmployee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HrmOperationalRegionState" ADD CONSTRAINT "HrmOperationalRegionState_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "HrmOperationalRegion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HrmOperationalRegionState" ADD CONSTRAINT "HrmOperationalRegionState_stateId_fkey" FOREIGN KEY ("stateId") REFERENCES "State"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HrmEmploymentAssignment" ADD CONSTRAINT "HrmEmploymentAssignment_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "HrmEmployee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HrmEmploymentAssignment" ADD CONSTRAINT "HrmEmploymentAssignment_orgUnitId_fkey" FOREIGN KEY ("orgUnitId") REFERENCES "HrmOrgUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HrmEmploymentAssignment" ADD CONSTRAINT "HrmEmploymentAssignment_operationalRegionId_fkey" FOREIGN KEY ("operationalRegionId") REFERENCES "HrmOperationalRegion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HrmEmploymentAssignment" ADD CONSTRAINT "HrmEmploymentAssignment_stateId_fkey" FOREIGN KEY ("stateId") REFERENCES "State"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HrmEmploymentAssignment" ADD CONSTRAINT "HrmEmploymentAssignment_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "City"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HrmEmploymentAssignment" ADD CONSTRAINT "HrmEmploymentAssignment_managerEmployeeId_fkey" FOREIGN KEY ("managerEmployeeId") REFERENCES "HrmEmployee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HrmEmploymentAssignment" ADD CONSTRAINT "HrmEmploymentAssignment_approvalManagerId_fkey" FOREIGN KEY ("approvalManagerId") REFERENCES "HrmEmployee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HrmAccessScope" ADD CONSTRAINT "HrmAccessScope_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HrmAccessScope" ADD CONSTRAINT "HrmAccessScope_orgUnitId_fkey" FOREIGN KEY ("orgUnitId") REFERENCES "HrmOrgUnit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HrmAccessScope" ADD CONSTRAINT "HrmAccessScope_operationalRegionId_fkey" FOREIGN KEY ("operationalRegionId") REFERENCES "HrmOperationalRegion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HrmAccessScope" ADD CONSTRAINT "HrmAccessScope_stateId_fkey" FOREIGN KEY ("stateId") REFERENCES "State"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HrmOnboardingCase" ADD CONSTRAINT "HrmOnboardingCase_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "HrmEmployee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HrmOfferAcceptanceEvidence" ADD CONSTRAINT "HrmOfferAcceptanceEvidence_onboardingCaseId_fkey" FOREIGN KEY ("onboardingCaseId") REFERENCES "HrmOnboardingCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HrmEmployeeDocument" ADD CONSTRAINT "HrmEmployeeDocument_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "HrmEmployee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HrmEmployeeBankAccount" ADD CONSTRAINT "HrmEmployeeBankAccount_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "HrmEmployee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HrmAttendanceRecord" ADD CONSTRAINT "HrmAttendanceRecord_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "HrmEmployee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HrmLeaveRequest" ADD CONSTRAINT "HrmLeaveRequest_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "HrmEmployee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HrmLeaveRequest" ADD CONSTRAINT "HrmLeaveRequest_leaveTypeId_fkey" FOREIGN KEY ("leaveTypeId") REFERENCES "HrmLeaveType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HrmLeaveRequest" ADD CONSTRAINT "HrmLeaveRequest_approverEmployeeId_fkey" FOREIGN KEY ("approverEmployeeId") REFERENCES "HrmEmployee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HrmCompensationRevision" ADD CONSTRAINT "HrmCompensationRevision_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "HrmEmployee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HrmCompensationComponent" ADD CONSTRAINT "HrmCompensationComponent_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "HrmCompensationRevision"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HrmPerformanceReview" ADD CONSTRAINT "HrmPerformanceReview_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "HrmEmployee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HrmPerformanceReview" ADD CONSTRAINT "HrmPerformanceReview_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "HrmPerformanceCycle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HrmIncentive" ADD CONSTRAINT "HrmIncentive_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "HrmEmployee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HrmExitCase" ADD CONSTRAINT "HrmExitCase_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "HrmEmployee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HrmApproval" ADD CONSTRAINT "HrmApproval_requestedByUserId_fkey" FOREIGN KEY ("requestedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HrmApproval" ADD CONSTRAINT "HrmApproval_decidedByUserId_fkey" FOREIGN KEY ("decidedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
