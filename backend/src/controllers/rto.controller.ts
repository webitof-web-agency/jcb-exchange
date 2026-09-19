import { NextFunction, Request, Response } from 'express';
import { Prisma, RtoHirePurchaseStatus, RtoHsrpStatus, RtoValidityStatus, RtoWorkStatus } from '@prisma/client';
import prisma from '../lib/prisma';

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

const serialize = (record: any) => ({
  ...record,
  rtoExpenses: Number(record.rtoExpenses),
  rtoExpensesAdvance: Number(record.rtoExpensesAdvance),
  vehicleMaintenanceCost: Number(record.vehicleMaintenanceCost),
  rtoExpensesBalance: Math.max(0, Number(record.rtoExpenses) - Number(record.rtoExpensesAdvance)),
});

const buildPayload = (body: any, existing?: any) => {
  const value = (key: string) => body[key] !== undefined ? body[key] : existing?.[key];
  return {
    customerName: text(value('customerName')),
    customerNumber: phone(value('customerNumber')),
    vehicleNumber: text(value('vehicleNumber')).toUpperCase(),
    vehicleType: text(value('vehicleType')),
    vehicleModel: text(value('vehicleModel')),
    hirePurchaseStatus: validEnum(value('hirePurchaseStatus'), Object.values(RtoHirePurchaseStatus), existing?.hirePurchaseStatus || RtoHirePurchaseStatus.PENDING),
    taxStatus: validEnum(value('taxStatus'), Object.values(RtoValidityStatus), existing?.taxStatus || RtoValidityStatus.NOT_AVAILABLE),
    taxValidUntil: body.taxValidUntil !== undefined ? dateOrNull(body.taxValidUntil) : existing?.taxValidUntil,
    fitnessStatus: validEnum(value('fitnessStatus'), Object.values(RtoValidityStatus), existing?.fitnessStatus || RtoValidityStatus.NOT_AVAILABLE),
    fitnessValidUntil: body.fitnessValidUntil !== undefined ? dateOrNull(body.fitnessValidUntil) : existing?.fitnessValidUntil,
    insuranceStatus: validEnum(value('insuranceStatus'), Object.values(RtoValidityStatus), existing?.insuranceStatus || RtoValidityStatus.NOT_AVAILABLE),
    insuranceValidUntil: body.insuranceValidUntil !== undefined ? dateOrNull(body.insuranceValidUntil) : existing?.insuranceValidUntil,
    pucStatus: validEnum(value('pucStatus'), Object.values(RtoValidityStatus), existing?.pucStatus || RtoValidityStatus.NOT_AVAILABLE),
    pucValidUntil: body.pucValidUntil !== undefined ? dateOrNull(body.pucValidUntil) : existing?.pucValidUntil,
    hsrpStatus: validEnum(value('hsrpStatus'), Object.values(RtoHsrpStatus), existing?.hsrpStatus || RtoHsrpStatus.PENDING),
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
    rtoStatus: validEnum(value('rtoStatus'), Object.values(RtoWorkStatus), existing?.rtoStatus || RtoWorkStatus.PENDING),
    noteSheet: body.noteSheet !== undefined ? text(body.noteSheet) || null : existing?.noteSheet,
    vehicleMaintenanceCost: money(value('vehicleMaintenanceCost')),
    hourRunning: body.hourRunning !== undefined && body.hourRunning !== '' ? Number(body.hourRunning) : existing?.hourRunning || null,
  };
};

const validate = (payload: ReturnType<typeof buildPayload>) => {
  const required: Array<[string, string]> = [
    ['customerName', 'Customer Name'], ['vehicleNumber', 'Vehicle Number'], ['vehicleType', 'Vehicle Type'],
    ['vehicleModel', 'Vehicle Model'], ['sellerName', 'Seller Name'], ['purchaserName', 'Purchaser Name'],
    ['rtoOffice', 'RTO Office'], ['rtoAgentName', 'RTO Agent Name'], ['rtoAgentState', 'RTO Agent State'],
    ['rtoAgentCity', 'RTO Agent City'],
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
  const missingValidity = validityChecks.find(([, status, date]) => !status || ((status === RtoValidityStatus.VALID || status === RtoValidityStatus.EXPIRED) && !date));
  if (missingValidity) return `${missingValidity[0]} status and date are required.`;
  if (!payload.hsrpStatus) return 'HSRP Valid is required.';
  if (Number(payload.rtoExpenses) <= 0) return 'RTO Expenses is required.';
  if (Number(payload.vehicleMaintenanceCost) <= 0) return 'Vehicle Maintenance Cost is required.';
  if (!payload.hourRunning || Number(payload.hourRunning) <= 0) return 'Hours Running is required.';
  if (Number(payload.rtoExpensesAdvance) > Number(payload.rtoExpenses)) return 'RTO Expenses Advance cannot exceed RTO Expenses.';
  return null;
};

export const listRtoRecords = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const q = text(req.query.q).toLowerCase();
    const status = text(req.query.status);
    const records = await prisma.vehicleRtoRecord.findMany({
      where: {
        ...(status && Object.values(RtoWorkStatus).includes(status as RtoWorkStatus) ? { rtoStatus: status as RtoWorkStatus } : {}),
        ...(q ? { OR: [
          { customerName: { contains: q, mode: 'insensitive' } },
          { vehicleNumber: { contains: q, mode: 'insensitive' } },
          { rtoOffice: { contains: q, mode: 'insensitive' } },
          { rtoAgentName: { contains: q, mode: 'insensitive' } },
        ] } : {}),
      },
      orderBy: { updatedAt: 'desc' },
    });
    res.json({ success: true, records: records.map(serialize) });
  } catch (error) { next(error); }
};

export const createRtoRecord = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const payload = buildPayload(req.body);
    const error = validate(payload);
    if (error) return res.status(400).json({ success: false, error });
    const record = await prisma.vehicleRtoRecord.create({ data: payload });
    res.status(201).json({ success: true, record: serialize(record) });
  } catch (error) { next(error); }
};

export const updateRtoRecord = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = text(req.params.id);
    const existing = await prisma.vehicleRtoRecord.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ success: false, error: 'RTO record not found.' });
    const payload = buildPayload(req.body, existing);
    const error = validate(payload);
    if (error) return res.status(400).json({ success: false, error });
    const record = await prisma.vehicleRtoRecord.update({ where: { id }, data: payload });
    res.json({ success: true, record: serialize(record) });
  } catch (error) { next(error); }
};

export const deleteRtoRecord = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = text(req.params.id);
    await prisma.vehicleRtoRecord.delete({ where: { id } });
    res.json({ success: true, message: 'RTO record deleted successfully.' });
  } catch (error) { next(error); }
};
