import { evaluateRtoTransferCompliance, type ComplianceResult } from './rtoCompliance';
import { buildInitialTransferTasks } from './rtoTransferTasks';

/** Compliance from the data already saved on the RTO record (no provider call, no billing). */
export const evaluateStoredRtoCompliance = (rtoRecord: any, sellAccount?: { sellerState?: string | null | undefined; purchaserState?: string | null | undefined } | null) =>
  evaluateRtoTransferCompliance(rtoRecord, null, {
    sellerState: sellAccount?.sellerState,
    purchaserState: sellAccount?.purchaserState,
    source: 'RECORD',
  });

/**
 * Creates any missing ownership-transfer tasks for an RTO record. Existing tasks are
 * never overwritten, so re-running a handoff keeps the staff's progress and remarks.
 */
export const ensureRtoTransferTasks = async (
  tx: any,
  rtoRecordId: string,
  compliance?: ComplianceResult | null,
  actorId?: string | null,
) => {
  const existing: Array<{ taskKey: string }> = await tx.rtoTransferTask.findMany({
    where: { rtoRecordId },
    select: { taskKey: true },
  });
  const existingKeys = new Set(existing.map((task) => task.taskKey));
  const missing = buildInitialTransferTasks(compliance).filter((task) => !existingKeys.has(task.taskKey));

  for (const task of missing) {
    await tx.rtoTransferTask.create({
      data: {
        rtoRecordId,
        taskKey: task.taskKey,
        label: task.label,
        isOptional: task.isOptional,
        sortOrder: task.sortOrder,
        status: task.status,
        remark: task.remark,
        updatedById: actorId || null,
        logs: {
          create: {
            oldStatus: null,
            newStatus: task.status,
            remark: task.remark,
            changedById: actorId || null,
          },
        },
      },
    });
  }

  if (compliance) {
    await tx.vehicleRtoRecord.update({
      where: { id: rtoRecordId },
      data: { complianceSnapshot: compliance as any, complianceCheckedAt: new Date(compliance.checkedAt) },
    });
  }
  return missing.length;
};

export const recordRtoStatusChange = async (
  tx: any,
  input: { rtoRecordId: string; oldStatus?: string | null | undefined; newStatus: string; remark: string; actorId?: string | null | undefined },
) => {
  if (input.oldStatus && input.oldStatus === input.newStatus) return null;
  return tx.vehicleRtoStatusLog.create({
    data: {
      rtoRecordId: input.rtoRecordId,
      oldStatus: input.oldStatus || null,
      newStatus: input.newStatus,
      remark: input.remark,
      changedById: input.actorId || null,
    },
  });
};
