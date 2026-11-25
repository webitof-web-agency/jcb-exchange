-- Optimistic-concurrency versions for HRM document and leave decisions.
ALTER TABLE "HrmEmployeeDocument" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "HrmLeaveRequest" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
