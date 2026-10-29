import { randomUUID } from 'crypto';
import { Prisma, RtoTransferTaskStatus } from '@prisma/client';
import prisma from '../lib/prisma';
import { assertRecordEditable } from './recordLock';
import { evaluateRtoTransferCompliance, type ComplianceResult, type ComplianceSource } from './rtoCompliance';
import { serializeRtoRecord } from './rtoRecordSerializer';
import { normalizeRtoWorkStatus } from './rtoStatus';
import {
  assertRemark,
  buildTaskDocument,
  deriveRtoStatusFromTasks,
  isValidTransferTaskStatus,
  MAX_TASK_DOCUMENTS,
  readTaskDocuments,
  summarizeTransferTasks,
} from './rtoTransferTasks';
import { ensureRtoTransferTasks, evaluateStoredRtoCompliance, recordRtoStatusChange } from './rtoTransferStore';
import { paymentSummaryForRecord, syncSellAccountFromRto } from './sellAccount.service';
import { rcFullService } from './rcOwnerHistory.service';

export class RtoTransferError extends Error {
  constructor(message: string, readonly statusCode = 400) {
    super(message);
    this.name = 'RtoTransferError';
  }
}

const TERMINAL_STATUSES = new Set(['DEAL_DONE']);

const userNames = async (ids: Array<string | null | undefined>) => {
  const unique = [...new Set(ids.filter((id): id is string => Boolean(id)))];
  if (!unique.length) return new Map<string, string>();
  const users = await prisma.user.findMany({ where: { id: { in: unique } }, select: { id: true, name: true, email: true, mobile: true } });
  return new Map(users.map((user) => [user.id, user.name?.trim() || user.email || user.mobile || 'User']));
};

const loadRtoWithRelations = (id: string) => prisma.vehicleRtoRecord.findUnique({
  where: { id },
  include: {
    sellAccount: {
      include: { payments: true, refunds: true },
    },
    listing: {
      select: {
        id: true,
        title: true,
        brand: { select: { name: true } },
        category: { select: { name: true } },
        model: { select: { name: true } },
        vehicleVerification: { select: { verificationRecordId: true, verificationSource: true, status: true } },
      },
    },
    transferTasks: {
      orderBy: { sortOrder: 'asc' },
      include: { logs: { orderBy: { createdAt: 'desc' }, take: 25 } },
    },
    statusLogs: { orderBy: { createdAt: 'desc' }, take: 50 },
  },
});

export const listRtoTransferTasks = () => prisma.rtoTransferTask.findMany({
  orderBy: { updatedAt: 'desc' },
  include: {
    rtoRecord: {
      select: {
        id: true,
        vehicleNumber: true,
        customerName: true,
        rtoOffice: true,
        rtoStatus: true,
        sellAccount: {
          select: {
            recordNumber: true,
            listingTitle: true,
            brandName: true,
            vehicleModel: true,
            purchaserName: true,
          },
        },
      },
    },
  },
});

const sellAccountSummary = (sellAccount: any) => {
  if (!sellAccount || sellAccount.deletedAt) return null;
  const payments = paymentSummaryForRecord(sellAccount, sellAccount.payments || []);
  return {
    id: sellAccount.id,
    recordNumber: sellAccount.recordNumber,
    listingId: sellAccount.listingId,
    listingTitle: sellAccount.listingTitle,
    vehicleNumber: sellAccount.vehicleNumber,
    chassisNumber: sellAccount.chassisNumber,
    ownerName: sellAccount.ownerName,
    sourceType: sellAccount.sourceType,
    purchaseType: sellAccount.purchaseType,
    saleType: sellAccount.saleType,
    sellerName: sellAccount.sellerName,
    sellerNumber: sellAccount.sellerNumber,
    sellerCity: sellAccount.sellerCity,
    sellerState: sellAccount.sellerState,
    brokerName: sellAccount.brokerName,
    brokerNumber: sellAccount.brokerNumber,
    purchaserName: sellAccount.purchaserName,
    purchaserNumber: sellAccount.purchaserNumber,
    purchaserCity: sellAccount.purchaserCity,
    purchaserState: sellAccount.purchaserState,
    sellDate: sellAccount.sellDate,
    sellAmount: Number(sellAccount.sellAmount),
    saleExchangeValue: Number(sellAccount.saleExchangeValue || 0),
    dealStatus: sellAccount.dealStatus,
    isLocked: sellAccount.isLocked,
    completedAt: sellAccount.completedAt,
    invoiceNumber: sellAccount.invoiceNumber,
    invoiceGeneratedAt: sellAccount.invoiceGeneratedAt,
    invoiceSentAt: sellAccount.invoiceSentAt,
    invoiceDelivery: sellAccount.invoiceDelivery,
    payments,
  };
};

export const getRtoTransferWorkspace = async (id: string) => {
  const record = await loadRtoWithRelations(id);
  if (!record) return null;

  const names = await userNames([
    record.lockedById,
    ...record.transferTasks.flatMap((task) => [
      task.updatedById,
      ...task.logs.map((log) => log.changedById),
      ...readTaskDocuments(task.documents).map((document) => document.uploadedById),
    ]),
    ...record.statusLogs.map((log) => log.changedById),
  ]);
  const tasks = record.transferTasks.map((task) => ({
    id: task.id,
    taskKey: task.taskKey,
    label: task.label,
    isOptional: task.isOptional,
    status: task.status,
    remark: task.remark,
    documents: readTaskDocuments(task.documents).map((document) => ({
      ...document,
      uploadedByName: document.uploadedById ? names.get(document.uploadedById) || null : null,
    })),
    updatedAt: task.updatedAt,
    updatedByName: task.updatedById ? names.get(task.updatedById) || null : null,
    logs: task.logs.map((log) => ({
      id: log.id,
      oldStatus: log.oldStatus,
      newStatus: log.newStatus,
      remark: log.remark,
      createdAt: log.createdAt,
      changedByName: log.changedById ? names.get(log.changedById) || null : null,
    })),
  }));
  const progress = summarizeTransferTasks(tasks);
  const sellAccount = sellAccountSummary(record.sellAccount);
  const isLocked = record.isLocked || Boolean(record.sellAccount?.isLocked);

  return {
    record: serializeRtoRecord(record, record.lockedById ? names.get(record.lockedById) || null : null),
    listing: record.listing
      ? {
        id: record.listing.id,
        title: record.listing.title,
        hasRcVerification: record.listing.vehicleVerification?.verificationSource === 'RC_FULL'
          && Boolean(record.listing.vehicleVerification?.verificationRecordId),
      }
      : null,
    sellAccount,
    tasks,
    progress,
    statusLogs: record.statusLogs.map((log) => ({
      id: log.id,
      oldStatus: log.oldStatus,
      newStatus: log.newStatus,
      remark: log.remark,
      createdAt: log.createdAt,
      changedByName: log.changedById ? names.get(log.changedById) || null : null,
    })),
    compliance: (record.complianceSnapshot as ComplianceResult | null) || null,
    complianceCheckedAt: record.complianceCheckedAt,
    isLocked,
    canComplete: Boolean(
      !isLocked
      && sellAccount
      && progress.allDone
      && sellAccount.payments.purchaserPaymentStatus === 'FULL',
    ),
  };
};

const assertWorkspaceEditable = (record: any) => {
  assertRecordEditable(record.isLocked);
  assertRecordEditable(record.sellAccount?.isLocked);
};

/** Keeps the RTO status (and the linked Sold Vehicle deal status) in step with the checklist. */
const syncRtoStatusFromTasks = async (tx: any, rtoRecordId: string, reason: string, actorId?: string) => {
  const record = await tx.vehicleRtoRecord.findUnique({ where: { id: rtoRecordId }, include: { transferTasks: true } });
  if (!record) return;
  const current = normalizeRtoWorkStatus(record.rtoStatus);
  if (TERMINAL_STATUSES.has(current)) return;
  const derived = deriveRtoStatusFromTasks(record.transferTasks);
  if (derived && derived !== current) {
    await tx.vehicleRtoRecord.update({ where: { id: rtoRecordId }, data: { rtoStatus: derived } });
    await recordRtoStatusChange(tx, { rtoRecordId, oldStatus: current, newStatus: derived, remark: reason, actorId });
  }
  if (record.sellAccountId) await syncSellAccountFromRto(tx, record.sellAccountId, actorId);
};

export const updateRtoTransferTask = async (
  rtoRecordId: string,
  taskId: string,
  body: { status?: unknown; remark?: unknown },
  actorId?: string,
) => {
  const remark = assertRemark(body.remark);
  if (!isValidTransferTaskStatus(body.status)) throw new RtoTransferError('Select a valid task status.');
  const nextStatus = body.status as RtoTransferTaskStatus;

  await prisma.$transaction(async (tx) => {
    const record = await tx.vehicleRtoRecord.findUnique({ where: { id: rtoRecordId }, include: { sellAccount: { select: { isLocked: true } } } });
    if (!record) throw new RtoTransferError('RTO record not found.', 404);
    assertWorkspaceEditable(record);
    const task = await tx.rtoTransferTask.findFirst({ where: { id: taskId, rtoRecordId } });
    if (!task) throw new RtoTransferError('Transfer task not found.', 404);

    await tx.rtoTransferTask.update({
      where: { id: task.id },
      data: { status: nextStatus, remark, updatedById: actorId || null },
    });
    await tx.rtoTransferTaskLog.create({
      data: { taskId: task.id, oldStatus: task.status, newStatus: nextStatus, remark, changedById: actorId || null },
    });
    await syncRtoStatusFromTasks(tx, rtoRecordId, `${task.label}: ${remark}`, actorId);
  });

  return getRtoTransferWorkspace(rtoRecordId);
};

const loadEditableTask = async (tx: Prisma.TransactionClient, rtoRecordId: string, taskId: string) => {
  const record = await tx.vehicleRtoRecord.findUnique({ where: { id: rtoRecordId }, include: { sellAccount: { select: { isLocked: true } } } });
  if (!record) throw new RtoTransferError('RTO record not found.', 404);
  assertWorkspaceEditable(record);
  const task = await tx.rtoTransferTask.findFirst({ where: { id: taskId, rtoRecordId } });
  if (!task) throw new RtoTransferError('Transfer task not found.', 404);
  return task;
};

/** Attaches an uploaded proof file to a task. The task history records the upload. */
export const addRtoTransferTaskDocument = async (
  rtoRecordId: string,
  taskId: string,
  body: Record<string, unknown>,
  actorId?: string,
) => {
  let document: ReturnType<typeof buildTaskDocument>;
  try {
    document = buildTaskDocument(body, { id: randomUUID(), uploadedById: actorId ?? null });
  } catch (error) {
    throw new RtoTransferError(error instanceof Error ? error.message : 'Invalid document.');
  }

  await prisma.$transaction(async (tx) => {
    const task = await loadEditableTask(tx, rtoRecordId, taskId);
    const documents = readTaskDocuments(task.documents);
    if (documents.length >= MAX_TASK_DOCUMENTS) {
      throw new RtoTransferError(`A task can hold up to ${MAX_TASK_DOCUMENTS} documents. Remove one first.`);
    }
    if (documents.some((existing) => existing.fileUrl === document.fileUrl)) {
      throw new RtoTransferError('This file is already attached to the task.');
    }

    await tx.rtoTransferTask.update({
      where: { id: task.id },
      // Keep updatedAt: it records the last status change (shown on the task and the transfer certificate).
      data: { documents: [...documents, document] as unknown as Prisma.InputJsonValue, updatedAt: task.updatedAt },
    });
    await tx.rtoTransferTaskLog.create({
      data: { taskId: task.id, oldStatus: null, newStatus: task.status, remark: `Document uploaded: ${document.fileName}`, changedById: actorId || null },
    });
  });

  return getRtoTransferWorkspace(rtoRecordId);
};

/** Detaches a proof file from a task. The Drive copy is kept so the audit trail still resolves. */
export const removeRtoTransferTaskDocument = async (rtoRecordId: string, taskId: string, documentId: string, actorId?: string) => {
  await prisma.$transaction(async (tx) => {
    const task = await loadEditableTask(tx, rtoRecordId, taskId);
    const documents = readTaskDocuments(task.documents);
    const removed = documents.find((document) => document.id === documentId);
    if (!removed) throw new RtoTransferError('Document not found on this task.', 404);

    await tx.rtoTransferTask.update({
      where: { id: task.id },
      data: { documents: documents.filter((document) => document.id !== documentId) as unknown as Prisma.InputJsonValue, updatedAt: task.updatedAt },
    });
    await tx.rtoTransferTaskLog.create({
      data: { taskId: task.id, oldStatus: null, newStatus: task.status, remark: `Document removed: ${removed.fileName}`, changedById: actorId || null },
    });
  });

  return getRtoTransferWorkspace(rtoRecordId);
};

/** Creates the checklist for an RTO record that was started before tasks existed. */
export const initializeRtoTransferTasks = async (rtoRecordId: string, actorId?: string) => {
  await prisma.$transaction(async (tx) => {
    const record = await tx.vehicleRtoRecord.findUnique({ where: { id: rtoRecordId }, include: { sellAccount: true } });
    if (!record) throw new RtoTransferError('RTO record not found.', 404);
    assertWorkspaceEditable(record);
    const compliance = evaluateStoredRtoCompliance(record, record.sellAccount);
    const created = await ensureRtoTransferTasks(tx, rtoRecordId, compliance, actorId);
    if (created > 0) await syncRtoStatusFromTasks(tx, rtoRecordId, 'Ownership transfer checklist created.', actorId);
  });
  return getRtoTransferWorkspace(rtoRecordId);
};

const loadListingRcResult = async (verification: { verificationRecordId?: string | null; verificationSource?: string | null } | null | undefined) => {
  if (verification?.verificationSource !== 'RC_FULL' || !verification.verificationRecordId) return null;
  try {
    const detail = await rcFullService.getHistoryDetail(verification.verificationRecordId);
    return detail.result && typeof detail.result === 'object' ? detail.result as Record<string, unknown> : null;
  } catch {
    return null;
  }
};

/**
 * mode RECORD    -> saved validity data, plus the RC verification already done on the listing (free)
 * mode RC_API    -> a fresh RC lookup (24h cached by the provider service, billed to the API wallet)
 */
export const runRtoComplianceCheck = async (rtoRecordId: string, mode: 'RECORD' | 'RC_API', actorId: string) => {
  const record = await prisma.vehicleRtoRecord.findUnique({
    where: { id: rtoRecordId },
    include: {
      sellAccount: { select: { sellerState: true, purchaserState: true, isLocked: true } },
      listing: { select: { vehicleVerification: { select: { verificationRecordId: true, verificationSource: true } } } },
    },
  });
  if (!record) throw new RtoTransferError('RTO record not found.', 404);
  assertWorkspaceEditable(record);

  let rcResult: Record<string, unknown> | null = null;
  let source: ComplianceSource = 'RECORD';
  if (mode === 'RC_API') {
    if (!record.vehicleNumber) throw new RtoTransferError('Registration number is required for an RC lookup.');
    const lookup = await rcFullService.verifyRc({ id_number: record.vehicleNumber }, actorId);
    rcResult = lookup.result && typeof lookup.result === 'object' ? lookup.result as Record<string, unknown> : null;
    source = 'RC_API';
  } else {
    rcResult = await loadListingRcResult(record.listing?.vehicleVerification);
    if (rcResult) source = 'LISTING_VERIFICATION';
  }

  const compliance = evaluateRtoTransferCompliance(record, rcResult, {
    sellerState: record.sellAccount?.sellerState,
    purchaserState: record.sellAccount?.purchaserState,
    source,
  });

  await prisma.$transaction(async (tx) => {
    await tx.vehicleRtoRecord.update({
      where: { id: rtoRecordId },
      data: { complianceSnapshot: compliance as any, complianceCheckedAt: new Date(compliance.checkedAt) },
    });
    // Flag untouched tasks whose document the check found expired. Progressed tasks are left alone.
    const pendingExpired = await tx.rtoTransferTask.findMany({
      where: { rtoRecordId, status: 'PENDING', taskKey: { in: compliance.expiredDocuments } },
    });
    for (const task of pendingExpired) {
      const check = compliance.checks.find((item) => item.key === task.taskKey);
      const remark = `Compliance check: ${check?.message || 'Document expired.'}${check?.action ? ` ${check.action}` : ''}`;
      await tx.rtoTransferTask.update({ where: { id: task.id }, data: { status: 'DOCUMENT_EXPIRED', remark, updatedById: actorId } });
      await tx.rtoTransferTaskLog.create({ data: { taskId: task.id, oldStatus: task.status, newStatus: 'DOCUMENT_EXPIRED', remark, changedById: actorId } });
    }
    if (pendingExpired.length) await syncRtoStatusFromTasks(tx, rtoRecordId, 'Compliance check flagged expired documents.', actorId);
  });

  return getRtoTransferWorkspace(rtoRecordId);
};

export const assertTasksAllowStatus = async (client: any, rtoRecordId: string, nextStatus: string) => {
  if (!['RTO_WORK_COMPLETED', 'DEAL_DONE'].includes(nextStatus)) return;
  const tasks = await client.rtoTransferTask.findMany({ where: { rtoRecordId }, select: { status: true, label: true } });
  if (!tasks.length) return;
  const summary = summarizeTransferTasks(tasks);
  if (!summary.allDone) {
    throw new RtoTransferError(`Complete the transfer checklist first. Pending: ${summary.pendingLabels.join(', ')}.`);
  }
};
