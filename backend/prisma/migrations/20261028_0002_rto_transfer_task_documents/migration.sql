-- Ownership Transfer Tasks can hold uploaded proof (RC copy, insurance policy, NOC, PUC...).
ALTER TABLE "RtoTransferTask" ADD COLUMN "documents" JSONB;
