import { FinPeriodStatus, FinVoucherType } from '@prisma/client';
import prisma from '../../../lib/prisma';
import { badRequest, conflict, notFound } from '../http';
import { financialYearLabel, financialYearMonths, financialYearOf } from '../utils/fy';
import { readEnum, readInt, readMultiline, readString } from '../utils/input';
import { writeFinAudit } from './audit.service';
import type { ActorContext } from './context';

export const VOUCHER_SERIES_PREFIX: Record<FinVoucherType, string> = {
  JOURNAL: 'JV',
  PAYMENT: 'PV',
  RECEIPT: 'RV',
  CONTRA: 'CV',
  SALES: 'SI',
  PURCHASE: 'PI',
  CREDIT_NOTE: 'CN',
  DEBIT_NOTE: 'DN',
  EXPENSE: 'EX',
  PAYROLL: 'PR',
  DEPRECIATION: 'DEP',
  OPENING: 'OB',
  CLOSING: 'CL',
  WRITE_OFF: 'WO',
  ADJUSTMENT: 'ADJ',
};

/** "JV/26-27/" for the FY starting April 2026. */
export const defaultSeriesPrefix = (voucherType: FinVoucherType, startYear: number) =>
  `${VOUCHER_SERIES_PREFIX[voucherType]}/${String(startYear % 100).padStart(2, '0')}-${String((startYear + 1) % 100).padStart(2, '0')}/`;

export const formatVoucherNumber = (prefix: string, number: number, padLength: number) =>
  `${prefix}${String(number).padStart(padLength, '0')}`;

type PeriodState = { label: string; status: FinPeriodStatus };

/**
 * Months close in order and reopen in reverse order, so a locked month never sits after an
 * open one: closing needs every earlier month closed at least as far; reopening needs every
 * later month open.
 */
export const checkPeriodTransition = (periods: PeriodState[], index: number, target: FinPeriodStatus) => {
  const rank: Record<FinPeriodStatus, number> = { OPEN: 0, SOFT_CLOSED: 1, LOCKED: 2 };
  const current = periods[index];
  if (!current) return 'Period not found.';
  if (current.status === target) return `${current.label} is already ${target.replace('_', ' ').toLowerCase()}.`;

  if (rank[target] > rank[current.status]) {
    const blocking = periods.slice(0, index).find((period) => rank[period.status] < rank[target]);
    if (blocking) return `Close ${blocking.label} first. Months are closed in order.`;
  } else {
    const blocking = periods.slice(index + 1).find((period) => rank[period.status] > rank[target]);
    if (blocking) return `Reopen ${blocking.label} first. Months are reopened from the latest one.`;
  }
  return null;
};

export const listFinancialYears = () =>
  prisma.finFinancialYear.findMany({
    orderBy: { startDate: 'desc' },
    include: { periods: { orderBy: { startDate: 'asc' } }, _count: { select: { openingBalances: true } } },
  });

export const createFinancialYear = async (body: Record<string, unknown>, context: ActorContext) => {
  const startYear = readInt(body, 'startYear', 'Start year', { min: 2000, max: 2100 });
  if (startYear === null) throw badRequest('Start year is required.');
  const fy = financialYearOf(new Date(Date.UTC(startYear, 3, 1)));

  return prisma.$transaction(async (tx) => {
    if (await tx.finFinancialYear.findUnique({ where: { startDate: fy.startDate } })) {
      throw conflict(`${fy.label} already exists.`);
    }
    const hasCurrent = Boolean(await tx.finFinancialYear.findFirst({ where: { isCurrent: true } }));
    const year = await tx.finFinancialYear.create({
      data: {
        label: financialYearLabel(startYear),
        startDate: fy.startDate,
        endDate: fy.endDate,
        isCurrent: !hasCurrent,
        periods: { create: financialYearMonths(startYear) },
        numberSeries: {
          create: Object.values(FinVoucherType).map((voucherType) => ({
            voucherType,
            prefix: defaultSeriesPrefix(voucherType, startYear),
          })),
        },
      },
      include: { periods: { orderBy: { startDate: 'asc' } } },
    });
    await writeFinAudit({ ...context, entityType: 'FinFinancialYear', entityId: year.id, action: 'CREATE', after: { label: year.label, isCurrent: year.isCurrent } }, tx);
    return year;
  });
};

export const setCurrentFinancialYear = async (id: string, context: ActorContext) =>
  prisma.$transaction(async (tx) => {
    const year = await tx.finFinancialYear.findUnique({ where: { id } });
    if (!year) throw notFound('Financial year not found.');
    const previous = await tx.finFinancialYear.findFirst({ where: { isCurrent: true } });
    await tx.finFinancialYear.updateMany({ where: { isCurrent: true }, data: { isCurrent: false } });
    const updated = await tx.finFinancialYear.update({ where: { id }, data: { isCurrent: true } });
    await writeFinAudit({ ...context, entityType: 'FinFinancialYear', entityId: id, action: 'SET_CURRENT', before: { current: previous?.label ?? null }, after: { current: updated.label } }, tx);
    return updated;
  });

export const updatePeriodStatus = async (id: string, body: Record<string, unknown>, context: ActorContext) => {
  const target = readEnum(body, 'status', 'Status', Object.values(FinPeriodStatus));
  const reason = readMultiline(body, 'reason', 'Reason', 500);

  return prisma.$transaction(async (tx) => {
    const period = await tx.finPeriod.findUnique({ where: { id }, include: { year: { include: { periods: { orderBy: { startDate: 'asc' } } } } } });
    if (!period) throw notFound('Period not found.');
    if (period.year.status === FinPeriodStatus.LOCKED) throw badRequest(`${period.year.label} is closed. Reopen the year first.`);
    const reopening = target === FinPeriodStatus.OPEN || (target === FinPeriodStatus.SOFT_CLOSED && period.status === FinPeriodStatus.LOCKED);
    if (reopening && !reason) throw badRequest('A reason is required to reopen a period.');

    const index = period.year.periods.findIndex((item) => item.id === id);
    const error = checkPeriodTransition(period.year.periods, index, target);
    if (error) throw badRequest(error);

    const updated = await tx.finPeriod.update({
      where: { id },
      data: { status: target, statusChangedAt: new Date(), statusChangedById: context.actorUserId, statusReason: reason },
    });
    await writeFinAudit({ ...context, entityType: 'FinPeriod', entityId: id, action: reopening ? 'REOPEN' : target === 'LOCKED' ? 'LOCK' : 'SOFT_CLOSE', before: { status: period.status }, after: { status: target, label: period.label }, reason }, tx);
    return updated;
  });
};

export const listNumberSeries = async (yearId: string) => {
  const year = await prisma.finFinancialYear.findUnique({ where: { id: yearId } });
  if (!year) throw notFound('Financial year not found.');
  const series = await prisma.finNumberSeries.findMany({ where: { yearId }, orderBy: { voucherType: 'asc' } });
  return { year, series: series.map((item) => ({ ...item, preview: formatVoucherNumber(item.prefix, item.nextNumber, item.padLength) })) };
};

export const updateNumberSeries = async (id: string, body: Record<string, unknown>, context: ActorContext) => {
  const prefix = readString(body, 'prefix', 'Prefix', { max: 30 });
  if (prefix !== null && !/^[A-Z0-9/_-]+$/i.test(prefix)) throw badRequest('Prefix can contain letters, numbers, / _ and - only.');
  const padLength = readInt(body, 'padLength', 'Number length', { min: 1, max: 8 });
  const nextNumber = readInt(body, 'nextNumber', 'Next number', { min: 1, max: 99999999 });

  return prisma.$transaction(async (tx) => {
    const before = await tx.finNumberSeries.findUnique({ where: { id } });
    if (!before) throw notFound('Number series not found.');
    if (nextNumber !== null && nextNumber < before.nextNumber) {
      throw badRequest(`Next number can only move forward (currently ${before.nextNumber}) so numbers are never reused.`);
    }
    const series = await tx.finNumberSeries.update({
      where: { id },
      data: {
        ...(prefix !== null ? { prefix: prefix.toUpperCase() } : {}),
        ...(padLength !== null ? { padLength } : {}),
        ...(nextNumber !== null ? { nextNumber } : {}),
        updatedById: context.actorUserId,
      },
    });
    await writeFinAudit({ ...context, entityType: 'FinNumberSeries', entityId: id, action: 'UPDATE', before, after: series }, tx);
    return { ...series, preview: formatVoucherNumber(series.prefix, series.nextNumber, series.padLength) };
  });
};
