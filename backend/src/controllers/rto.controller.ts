import { NextFunction, Request, Response } from 'express';
import { Prisma, RtoHirePurchaseStatus, RtoHsrpStatus, RtoValidityStatus, RtoWorkStatus } from '@prisma/client';
import prisma from '../lib/prisma';
import { normalizeRtoWorkStatus, rtoStatusStorageValues } from '../services/rtoStatus';
import { syncSellAccountFromRto } from '../services/sellAccount.service';
import { lockRtoWorkRecord } from '../services/sellAccount.service';
import { assertRecordEditable, RecordLockedError } from '../services/recordLock';
import { getLinkedRecordDeletionPolicy } from '../services/linkedRecordDeletion';
import { serializeRtoRecord } from '../services/rtoRecordSerializer';
import { recordRtoStatusChange } from '../services/rtoTransferStore';
import { normalizeRemark } from '../services/rtoTransferTasks';
import {
  assertTasksAllowStatus,
  getRtoTransferWorkspace,
  initializeRtoTransferTasks,
  RtoTransferError,
  runRtoComplianceCheck,
  updateRtoTransferTask,
  listRtoTransferTasks as loadRtoTransferTasks,
} from '../services/rtoTransfer.service';
import { RcOwnerHistoryError } from '../services/rcOwnerHistory.service';
import { getAppSettings } from '../utils/appSettings';
import { renderRtoTransferCertificatePdf } from '../utils/rtoTransferCertificate';

const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '');
const phone = (value: unknown) => text(value).replace(/\D/g, '').slice(0, 15);
const dateOrNull = (value: unknown) => {
  if (!value) return null;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
};
const money = (value: unknown) => {
  const amount = Number(value || 0);
  return Number.isFinite(amount) && amount >= 0 ? new Prisma.Decimal(amount) : new Prisma.Decimal(0);
};
const validEnum = <T extends string>(value: unknown, allowed: readonly T[], fallback: T) =>
  allowed.includes(String(value) as T) ? String(value) as T : fallback;

const serialize = serializeRtoRecord;

const buildPayload = (body: any, existing?: any) => {
  const value = (key: string) => body[key] !== undefined ? body[key] : existing?.[key];
  const taxStatus = validEnum(value('taxStatus'), Object.values(RtoValidityStatus), existing?.taxStatus || RtoValidityStatus.NOT_AVAILABLE);
  const fitnessStatus = validEnum(value('fitnessStatus'), Object.values(RtoValidityStatus), existing?.fitnessStatus || RtoValidityStatus.NOT_AVAILABLE);
  const insuranceStatus = validEnum(value('insuranceStatus'), Object.values(RtoValidityStatus), existing?.insuranceStatus || RtoValidityStatus.NOT_AVAILABLE);
  const pucStatus = validEnum(value('pucStatus'), Object.values(RtoValidityStatus), existing?.pucStatus || RtoValidityStatus.NOT_AVAILABLE);

  return {
    listingId: body.listingId !== undefined ? (text(body.listingId) || null) : (existing?.listingId || null),
    customerName: text(value('customerName')),
    customerNumber: phone(value('customerNumber')),
    vehicleNumber: text(value('vehicleNumber')).toUpperCase(),
    brandName: text(value('brandName')),
    vehicleType: text(value('vehicleType')),
    vehicleModel: text(value('vehicleModel')),
    hirePurchaseStatus: validEnum(value('hirePurchaseStatus'), Object.values(RtoHirePurchaseStatus), existing?.hirePurchaseStatus || RtoHirePurchaseStatus.PENDING),
    financerName: text(value('financerName')),
    taxStatus,
    taxValidUntil: taxStatus === RtoValidityStatus.VALID ? (body.taxValidUntil !== undefined ? dateOrNull(body.taxValidUntil) : existing?.taxValidUntil) : null,
    fitnessStatus,
    fitnessValidUntil: fitnessStatus === RtoValidityStatus.VALID ? (body.fitnessValidUntil !== undefined ? dateOrNull(body.fitnessValidUntil) : existing?.fitnessValidUntil) : null,
    insuranceStatus,
    insuranceValidUntil: insuranceStatus === RtoValidityStatus.VALID ? (body.insuranceValidUntil !== undefined ? dateOrNull(body.insuranceValidUntil) : existing?.insuranceValidUntil) : null,
    pucStatus,
    pucValidUntil: pucStatus === RtoValidityStatus.VALID ? (body.pucValidUntil !== undefined ? dateOrNull(body.pucValidUntil) : existing?.pucValidUntil) : null,
    hsrpStatus: validEnum(
      String(value('hsrpStatus') || '').toUpperCase() === 'NOT_REQUIRED' ? 'NOT_APPLICABLE' : value('hsrpStatus'),
      Object.values(RtoHsrpStatus),
      existing?.hsrpStatus || RtoHsrpStatus.PENDING,
    ),
    hsrpNumber: text(value('hsrpNumber')).toUpperCase(),
    sellerName: text(value('sellerName')),
    sellerNumber: phone(value('sellerNumber')),
    purchaserName: text(value('purchaserName')),
    purchaserNumber: phone(value('purchaserNumber')),
    rtoOffice: text(value('rtoOffice')),
    rtoAgentName: text(value('rtoAgentName')),
    rtoAgentState: text(value('rtoAgentState')),
    rtoAgentCity: text(value('rtoAgentCity')),
    rtoAgentNumber: phone(value('rtoAgentNumber')),
    rtoExpenses: money(value('rtoExpenses')),
    rtoExpensesAdvance: money(value('rtoExpensesAdvance')),
    documentSendDate: body.documentSendDate !== undefined ? dateOrNull(body.documentSendDate) : existing?.documentSendDate,
    rtoStatus: normalizeRtoWorkStatus(value('rtoStatus') ?? existing?.rtoStatus ?? RtoWorkStatus.RTO_WORK_IN_PROGRESS),
    noteSheet: body.noteSheet !== undefined ? text(body.noteSheet) || null : existing?.noteSheet,
    vehicleMaintenanceCost: money(value('vehicleMaintenanceCost')),
    hourRunning: body.hourRunning !== undefined && body.hourRunning !== '' && body.hourRunning !== null
      ? (Number.isFinite(Number(body.hourRunning)) ? Math.max(0, Math.trunc(Number(body.hourRunning))) : null)
      : body.hourRunning === '' || body.hourRunning === null ? null : existing?.hourRunning ?? null,
  };
};

export { buildPayload };

export const validateRtoPayload = (payload: ReturnType<typeof buildPayload>) => {
  const required: Array<[string, string]> = [
    ['customerName', 'Customer Name'], ['vehicleNumber', 'Vehicle Number'], ['brandName', 'Brand'], ['vehicleType', 'Vehicle Type'],
    ['vehicleModel', 'Vehicle Model'], ['sellerName', 'Seller Name'], ['purchaserName', 'Purchaser Name'],
    ['rtoOffice', 'RTO Office'],
  ];
  const missing = required.find(([key]) => !payload[key as keyof typeof payload]);
  if (missing) return `${missing[1]} is required.`;
  if (!payload.hirePurchaseStatus) return 'Hire Purchase is required.';
  const validityChecks: Array<[string, RtoValidityStatus, Date | null | undefined]> = [
    ['Tax Validity', payload.taxStatus, payload.taxValidUntil],
    ['Fitness Validity', payload.fitnessStatus, payload.fitnessValidUntil],
    ['Insurance Validity', payload.insuranceStatus, payload.insuranceValidUntil],
    ['PUC Validity', payload.pucStatus, payload.pucValidUntil],
  ];
  const missingValidity = validityChecks.find(([, status, date]) => !status || (status === RtoValidityStatus.VALID && !date));
  if (missingValidity) return `${missingValidity[0]} date is required when marked as Valid.`;
  if (Number(payload.rtoExpensesAdvance) > Number(payload.rtoExpenses)) return 'RTO Expenses Advance cannot exceed RTO Expenses.';
  return null;
};

export const listRtoRecords = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const q = text(req.query.q).toLowerCase();
    const status = text(req.query.status);
    const normalizedStatus = status ? normalizeRtoWorkStatus(status) : '';
    const records = await prisma.vehicleRtoRecord.findMany({
      where: {
        ...(normalizedStatus
          ? { rtoStatus: { in: rtoStatusStorageValues[normalizedStatus] || [normalizedStatus] } }
          : {}),
        ...(q ? { OR: [
          { customerName: { contains: q, mode: 'insensitive' } },
          { vehicleNumber: { contains: q, mode: 'insensitive' } },
          { brandName: { contains: q, mode: 'insensitive' } },
          { rtoOffice: { contains: q, mode: 'insensitive' } },
          { rtoAgentName: { contains: q, mode: 'insensitive' } },
        ] } : {}),
      },
      include: {
        sellAccount: {
          select: {
            brandName: true,
            vehicleType: true,
            vehicleModel: true,
          },
        },
        listing: {
          select: {
            brand: { select: { name: true } },
            category: { select: { name: true } },
            model: { select: { name: true } },
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });
    const lockedByIds = [...new Set(records.map((record) => text(record.lockedById)).filter(Boolean))];
    const lockedByUsers = lockedByIds.length
      ? await prisma.user.findMany({ where: { id: { in: lockedByIds } }, select: { id: true, name: true, email: true, mobile: true } })
      : [];
    const lockedByNames = new Map(lockedByUsers.map((user) => [user.id, text(user.name) || text(user.email) || text(user.mobile) || 'User']));
    res.json({ success: true, records: records.map((record) => serialize(record, lockedByNames.get(text(record.lockedById)) || null)) });
  } catch (error) { next(error); }
};

export const createRtoRecord = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const payload = buildPayload(req.body);
    const error = validateRtoPayload(payload);
    if (error) return res.status(400).json({ success: false, error });
    if (payload.listingId) {
      const listing = await prisma.listing.findUnique({ where: { id: payload.listingId }, select: { id: true } });
      if (!listing) return res.status(400).json({ success: false, error: 'Linked listing was not found.' });
    }
    const record = await prisma.vehicleRtoRecord.create({ data: payload });
    res.status(201).json({ success: true, record: serialize(record) });
  } catch (error) { next(error); }
};

export const updateRtoRecord = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = text(req.params.id);
    const existing = await prisma.vehicleRtoRecord.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ success: false, error: 'RTO record not found.' });
    assertRecordEditable(existing.isLocked);
    if (existing.sellAccountId) {
      const linkedSellAccount = await prisma.sellAccount.findUnique({ where: { id: existing.sellAccountId }, select: { isLocked: true } });
      assertRecordEditable(linkedSellAccount?.isLocked);
    }
    const payload = buildPayload(req.body, existing);
    const error = validateRtoPayload(payload);
    if (error) return res.status(400).json({ success: false, error });
    if (payload.listingId) {
      const listing = await prisma.listing.findUnique({ where: { id: payload.listingId }, select: { id: true } });
      if (!listing) return res.status(400).json({ success: false, error: 'Linked listing was not found.' });
    }
    const previousStatus = normalizeRtoWorkStatus(existing.rtoStatus);
    const statusChanged = payload.rtoStatus !== previousStatus;
    const statusRemark = normalizeRemark(req.body?.statusRemark);
    if (statusChanged && statusRemark.length < 3) {
      return res.status(400).json({ success: false, error: 'A remark is required when changing the RTO status.', code: 'STATUS_REMARK_REQUIRED' });
    }
    if (statusChanged && payload.rtoStatus === RtoWorkStatus.DEAL_DONE && existing.sellAccountId) {
      return res.status(400).json({
        success: false,
        error: 'Use "Complete Sale" in the RTO workspace to mark a Sold Vehicle deal done — it issues the invoice and locks both records.',
        code: 'USE_COMPLETE_SALE',
      });
    }
    if (statusChanged) await assertTasksAllowStatus(prisma, id, payload.rtoStatus);
    const record = await prisma.$transaction(async (tx) => {
      const updated = await tx.vehicleRtoRecord.update({ where: { id }, data: payload });
      if (statusChanged) {
        await recordRtoStatusChange(tx, { rtoRecordId: id, oldStatus: previousStatus, newStatus: payload.rtoStatus, remark: statusRemark, actorId: req.user?.id });
      }
      if (updated.sellAccountId) {
        await syncSellAccountFromRto(tx, updated.sellAccountId, req.user?.id);
      }
      return updated;
    });
    res.json({ success: true, record: serialize(record) });
  } catch (error) {
    if (error instanceof RecordLockedError) return res.status(423).json({ success: false, error: error.message, code: error.code });
    if (error instanceof RtoTransferError) return res.status(error.statusCode).json({ success: false, error: error.message });
    next(error);
  }
};

export const deleteRtoRecord = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = text(req.params.id);
    const deleted = await prisma.$transaction(async (tx) => {
      const existing = await tx.vehicleRtoRecord.findUnique({
        where: { id },
        select: { id: true, isLocked: true, sellAccountId: true },
      });
      if (!existing) return false;

      const linkedSellAccount = existing.sellAccountId
        ? await tx.sellAccount.findUnique({ where: { id: existing.sellAccountId }, select: { id: true, isLocked: true } })
        : null;
      const policy = getLinkedRecordDeletionPolicy({
        source: 'RTO',
        hasLinkedRto: Boolean(linkedSellAccount),
        isLocked: existing.isLocked || Boolean(linkedSellAccount?.isLocked),
      });
      if (policy.action === 'BLOCK') assertRecordEditable(true);

      await tx.vehicleRtoRecord.delete({ where: { id } });
      if (policy.action === 'DELETE_LINKED_PAIR' && linkedSellAccount) {
        await tx.sellAccount.delete({ where: { id: linkedSellAccount.id } });
        return 'pair';
      }
      return 'rto';
    });
    if (!deleted) return res.status(404).json({ success: false, error: 'RTO record not found.' });
    res.json({
      success: true,
      message: deleted === 'pair'
        ? 'RTO record and connected Sold Vehicle record deleted successfully.'
        : 'RTO record deleted successfully.',
    });
  } catch (error) {
    if (error instanceof RecordLockedError) return res.status(423).json({ success: false, error: error.message, code: error.code });
    next(error);
  }
};

export const lockRtoRecord = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const record = await lockRtoWorkRecord(text(req.params.id), req.user?.id);
    if (!record) return res.status(404).json({ success: false, error: 'RTO record not found.' });
    res.json({ success: true, record: serialize(record) });
  } catch (error) {
    if (error instanceof RecordLockedError) return res.status(423).json({ success: false, error: error.message, code: error.code });
    if (error instanceof Error && error.message.includes('Only records with Deal Done')) return res.status(400).json({ success: false, error: error.message });
    next(error);
  }
};

const sendWorkspaceError = (error: unknown, res: Response, next: NextFunction) => {
  if (error instanceof RecordLockedError) return res.status(423).json({ success: false, error: error.message, code: error.code });
  if (error instanceof RtoTransferError) return res.status(error.statusCode).json({ success: false, error: error.message });
  if (error instanceof RcOwnerHistoryError) return res.status(error.statusCode).json({ success: false, error: error.message, code: error.code });
  if (error instanceof Error && /remark is required/i.test(error.message)) return res.status(400).json({ success: false, error: error.message });
  return next(error);
};

export const getRtoRecordWorkspace = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const workspace = await getRtoTransferWorkspace(text(req.params.id));
    if (!workspace) return res.status(404).json({ success: false, error: 'RTO record not found.' });
    res.json({ success: true, ...workspace });
  } catch (error) { sendWorkspaceError(error, res, next); }
};

export const listAllRtoTransferTasks = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tasks = await loadRtoTransferTasks();
    res.json({ success: true, tasks });
  } catch (error) { next(error); }
};

export const initializeRtoRecordTasks = async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json({ success: true, ...(await initializeRtoTransferTasks(text(req.params.id), req.user?.id)) });
  } catch (error) { sendWorkspaceError(error, res, next); }
};

export const updateRtoRecordTask = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const workspace = await updateRtoTransferTask(text(req.params.id), text(req.params.taskId), req.body || {}, req.user?.id);
    res.json({ success: true, ...workspace });
  } catch (error) { sendWorkspaceError(error, res, next); }
};

export const checkRtoRecordCompliance = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const workspace = await runRtoComplianceCheck(text(req.params.id), 'RECORD', req.user!.id);
    res.json({ success: true, ...workspace });
  } catch (error) { sendWorkspaceError(error, res, next); }
};

export const checkRtoRecordComplianceWithRcApi = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const workspace = await runRtoComplianceCheck(text(req.params.id), 'RC_API', req.user!.id);
    res.json({ success: true, ...workspace });
  } catch (error) { sendWorkspaceError(error, res, next); }
};

export const downloadRtoTransferCertificate = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const workspace = await getRtoTransferWorkspace(text(req.params.id));
    if (!workspace) return res.status(404).json({ success: false, error: 'RTO record not found.' });
    if (!workspace.progress.allDone) {
      return res.status(400).json({ success: false, error: `Transfer is not complete yet. Pending: ${workspace.progress.pendingLabels.join(', ')}.` });
    }
    const settings = await getAppSettings();
    const { record, sellAccount, tasks } = workspace;
    const lastUpdate = tasks.reduce((latest, task) => {
      const updatedAt = new Date(task.updatedAt);
      return updatedAt > latest ? updatedAt : latest;
    }, new Date(0));
    const buffer = await renderRtoTransferCertificatePdf({
      companyName: settings.companyInvoice.companyName || 'JCB Exchange',
      companyAddress: [settings.companyInvoice.address, settings.companyInvoice.city, settings.companyInvoice.state].filter(Boolean).join(', '),
      vehicle: {
        registrationNumber: record.vehicleNumber,
        brand: record.brandName,
        model: record.vehicleModel,
        category: record.vehicleType,
        chassisNumber: sellAccount?.chassisNumber || '',
      },
      previousOwner: { name: sellAccount?.ownerName || record.sellerName, mobile: '' },
      newOwner: { name: sellAccount?.purchaserName || record.purchaserName, mobile: sellAccount?.purchaserNumber || record.purchaserNumber },
      rtoOffice: record.rtoOffice,
      rtoAgent: [record.rtoAgentName, record.rtoAgentCity].filter(Boolean).join(', '),
      dealReference: sellAccount?.recordNumber || '',
      tasks: tasks.map((task) => ({ label: task.label, status: task.status, remark: task.remark || '', updatedAt: task.updatedAt, optional: task.isOptional })),
      completedAt: lastUpdate,
    });
    const fileName = `Ownership-Transfer-${String(record.vehicleNumber || record.id).replace(/[^A-Za-z0-9-]+/g, '-')}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Cache-Control', 'private, no-store');
    res.send(buffer);
  } catch (error) { sendWorkspaceError(error, res, next); }
};
