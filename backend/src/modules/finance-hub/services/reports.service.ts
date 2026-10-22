import { Prisma } from '@prisma/client';
import prisma from '../../../lib/prisma';
import { badRequest, notFound } from '../http';
import { financialYearOf, istToday } from '../utils/fy';
import { readDate } from '../utils/input';
import { LEDGER_STATUSES } from './ledgerRules';
import { buildLedgerRows, buildTrialBalance, isProfitAndLoss, type SumsByAccount } from './reportRules';

const ZERO = new Prisma.Decimal(0);
const DAY_MS = 24 * 60 * 60 * 1000;

const readRange = (query: Record<string, unknown>) => {
  const today = istToday();
  const to = readDate(query, 'to', 'To date') ?? today;
  const from = readDate(query, 'from', 'From date') ?? financialYearOf(to).startDate;
  if (from > to) throw badRequest('From date is after the to date.');
  return { from, to, yearStart: financialYearOf(from).startDate };
};

type LineFilter = Prisma.FinVoucherLineWhereInput;

const sumsByAccount = async (where: LineFilter, dates: Prisma.DateTimeFilter): Promise<SumsByAccount> => {
  const rows = await prisma.finVoucherLine.groupBy({
    by: ['accountId'],
    where: { ...where, voucher: { status: { in: LEDGER_STATUSES }, date: dates } },
    _sum: { debit: true, credit: true },
  });
  return new Map(rows.map((row) => [row.accountId, { debit: row._sum.debit ?? ZERO, credit: row._sum.credit ?? ZERO }]));
};

export const getTrialBalance = async (query: Record<string, unknown>) => {
  const { from, to, yearStart } = readRange(query);
  const [accounts, groups, beforeYear, yearToFrom, period] = await Promise.all([
    prisma.finAccount.findMany({ orderBy: { code: 'asc' }, select: { id: true, code: true, name: true, groupId: true, normalBalance: true, systemKey: true, isActive: true } }),
    prisma.finAccountGroup.findMany({ select: { id: true, code: true, name: true, nature: true, parentId: true } }),
    sumsByAccount({}, { lt: yearStart }),
    from > yearStart ? sumsByAccount({}, { gte: yearStart, lt: from }) : Promise.resolve(new Map() as SumsByAccount),
    sumsByAccount({}, { gte: from, lte: to }),
  ]);
  const result = buildTrialBalance({ accounts, groups, beforeYear, yearToFrom, period, includeZero: query.includeZero === 'true' });
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10), groups, ...result };
};

export const getGeneralLedger = async (query: Record<string, unknown>) => {
  const accountId = typeof query.accountId === 'string' ? query.accountId : '';
  if (!accountId) throw badRequest('Choose a ledger.');
  const { from, to, yearStart } = readRange(query);
  const account = await prisma.finAccount.findUnique({ where: { id: accountId }, include: { group: { select: { nature: true, name: true } } } });
  if (!account) throw notFound('Ledger not found.');

  const filter: LineFilter = {
    accountId,
    ...(typeof query.partyId === 'string' && query.partyId ? { partyId: query.partyId } : {}),
    ...(typeof query.sellAccountId === 'string' && query.sellAccountId ? { sellAccountId: query.sellAccountId } : {}),
    ...(typeof query.costCentreId === 'string' && query.costCentreId ? { costCentreId: query.costCentreId } : {}),
  };
  const openingDates: Prisma.DateTimeFilter = isProfitAndLoss(account.group.nature) ? { gte: yearStart, lt: from } : { lt: from };
  const [openingSums, lines] = await Promise.all([
    prisma.finVoucherLine.aggregate({ where: { ...filter, voucher: { status: { in: LEDGER_STATUSES }, date: openingDates } }, _sum: { debit: true, credit: true } }),
    prisma.finVoucherLine.findMany({
      where: { ...filter, voucher: { status: { in: LEDGER_STATUSES }, date: { gte: from, lte: to } } },
      include: {
        voucher: { select: { id: true, number: true, type: true, date: true, narration: true, postedAt: true } },
        party: { select: { name: true } },
      },
      orderBy: [{ voucher: { date: 'asc' } }, { voucher: { postedAt: 'asc' } }, { lineNo: 'asc' }],
      take: 5001,
    }),
  ]);
  const truncated = lines.length > 5000;
  const opening = (openingSums._sum.debit ?? ZERO).minus(openingSums._sum.credit ?? ZERO);
  const ledger = buildLedgerRows(opening, lines.slice(0, 5000).map((line) => ({
    id: line.id,
    date: line.voucher.date.toISOString().slice(0, 10),
    voucherId: line.voucher.id,
    voucherNumber: line.voucher.number,
    voucherType: line.voucher.type,
    narration: line.voucher.narration,
    lineNarration: line.narration,
    partyName: line.party?.name ?? null,
    debit: line.debit,
    credit: line.credit,
  })));
  return {
    account: { id: account.id, code: account.code, name: account.name, normalBalance: account.normalBalance, nature: account.group.nature, group: account.group.name, systemKey: account.systemKey },
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
    truncated,
    ...ledger,
  };
};

export const listAuditTrail = async (query: Record<string, unknown>) => {
  const page = Math.max(Number.parseInt(String(query.page || '1'), 10) || 1, 1);
  const pageSize = Math.min(Math.max(Number.parseInt(String(query.pageSize || '50'), 10) || 50, 1), 200);
  const from = readDate(query, 'from', 'From date');
  const to = readDate(query, 'to', 'To date');
  const text = (key: string) => (typeof query[key] === 'string' && query[key] ? String(query[key]).slice(0, 60) : null);
  const where: Prisma.FinAuditLogWhereInput = {
    ...(text('entityType') ? { entityType: text('entityType')! } : {}),
    ...(text('action') ? { action: text('action')! } : {}),
    ...(text('actorUserId') ? { actorUserId: text('actorUserId')! } : {}),
    ...(text('entityId') ? { entityId: text('entityId')! } : {}),
    ...(from || to ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lt: new Date(to.getTime() + DAY_MS) } : {}) } } : {}),
  };
  const [logs, total, entityTypes, actions] = await Promise.all([
    prisma.finAuditLog.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }),
    prisma.finAuditLog.count({ where }),
    prisma.finAuditLog.findMany({ distinct: ['entityType'], select: { entityType: true }, orderBy: { entityType: 'asc' } }),
    prisma.finAuditLog.findMany({ distinct: ['action'], select: { action: true }, orderBy: { action: 'asc' } }),
  ]);
  const actorIds = Array.from(new Set(logs.map((log) => log.actorUserId).filter((id): id is string => Boolean(id))));
  const actors = actorIds.length ? await prisma.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, name: true, email: true } }) : [];
  return {
    logs: logs.map((log) => {
      const actor = actors.find((item) => item.id === log.actorUserId);
      return { ...log, actorName: actor?.name || actor?.email || (log.actorUserId ? 'Unknown user' : 'System') };
    }),
    total,
    page,
    pageSize,
    entityTypes: entityTypes.map((item) => item.entityType),
    actions: actions.map((item) => item.action),
  };
};

/** Sold Vehicle picker for voucher lines. Read-only. */
export const searchVehicles = async (query: Record<string, unknown>) => {
  const q = typeof query.q === 'string' ? query.q.trim().slice(0, 60) : '';
  const take = Math.min(Math.max(Number.parseInt(String(query.limit || '200'), 10) || 200, 1), 500);
  const vehicles = await prisma.sellAccount.findMany({
    where: {
      deletedAt: null,
      ...(q
        ? {
            OR: [
              { recordNumber: { contains: q, mode: 'insensitive' } },
              { vehicleNumber: { contains: q, mode: 'insensitive' } },
              { chassisNumber: { contains: q, mode: 'insensitive' } },
              { listingTitle: { contains: q, mode: 'insensitive' } },
              { brandName: { contains: q, mode: 'insensitive' } },
            ],
          }
        : {}),
    },
    orderBy: { createdAt: 'desc' },
    take,
    select: { id: true, recordNumber: true, vehicleNumber: true, listingTitle: true, brandName: true, vehicleModel: true, dealStatus: true },
  });
  return vehicles.map((vehicle) => ({
    id: vehicle.id,
    label: [vehicle.recordNumber, vehicle.vehicleNumber, vehicle.listingTitle || [vehicle.brandName, vehicle.vehicleModel].filter(Boolean).join(' ')].filter(Boolean).join(' · '),
    dealStatus: vehicle.dealStatus,
  }));
};
