import { FinPeriodStatus, FinVoucherStatus, FinVoucherType, Prisma } from '@prisma/client';
import prisma from '../../../lib/prisma';
import { badRequest, conflict, FinHttpError, notFound } from '../http';
import { readDate, readMultiline } from '../utils/input';
import { sumMoney } from '../utils/money';
import { writeFinAudit } from './audit.service';
import { sequential, type ActorContext } from './context';
import {
  CASH_BANK_KINDS,
  LEDGER_STATUSES,
  MANUAL_VOUCHER_TYPES,
  needsApproval,
  parseVoucherInput,
  periodPostingError,
  reversedLines,
  validateVoucher,
  type LedgerReferences,
  type VoucherInput,
  type VoucherLineInput,
} from './ledgerRules';
import { defaultSeriesPrefix, formatVoucherNumber } from './periods.service';
import { FIN_SETTINGS_ID, readApprovalPolicy } from './settings.service';

export type LedgerAccess = {
  actor: ActorContext;
  isSuperAdmin: boolean;
  canPostSoftClosed: boolean;
  canApprove: boolean;
};

type Tx = Prisma.TransactionClient;

const formatDay = (date: Date) => date.toISOString().slice(0, 10).split('-').reverse().join('-');

const voucherInclude = {
  lines: {
    orderBy: { lineNo: 'asc' },
    include: {
      account: { select: { id: true, code: true, name: true, kind: true } },
      party: { select: { id: true, code: true, name: true } },
      costCentre: { select: { id: true, code: true, name: true } },
    },
  },
  party: { select: { id: true, code: true, name: true } },
  costCentre: { select: { id: true, code: true, name: true } },
  period: { select: { id: true, label: true, status: true } },
  reversalOf: { select: { id: true, number: true } },
  reversal: { select: { id: true, number: true } },
} satisfies Prisma.FinVoucherInclude;

type VoucherWithLines = Prisma.FinVoucherGetPayload<{ include: typeof voucherInclude }>;

// Inside transactions vouchers are loaded with their lines only: nested includes make Prisma
// run several queries at once on the transaction's single connection.
export const lockedInclude = { lines: { orderBy: { lineNo: 'asc' } } } satisfies Prisma.FinVoucherInclude;
export type LockedVoucher = Prisma.FinVoucherGetPayload<{ include: typeof lockedInclude }>;

/** Sold Vehicle labels for vehicle ids on vouchers (read-only lookup). */
export const vehicleLabels = async (ids: Array<string | null | undefined>) => {
  const unique = Array.from(new Set(ids.filter((id): id is string => Boolean(id))));
  if (!unique.length) return new Map<string, string>();
  const records = await prisma.sellAccount.findMany({
    where: { id: { in: unique } },
    select: { id: true, recordNumber: true, vehicleNumber: true, listingTitle: true, brandName: true, vehicleModel: true },
  });
  return new Map(records.map((record) => [
    record.id,
    [record.recordNumber, record.vehicleNumber, record.listingTitle || [record.brandName, record.vehicleModel].filter(Boolean).join(' ')].filter(Boolean).join(' · '),
  ]));
};

const serializeVoucher = (voucher: VoucherWithLines, labels: Map<string, string>) => ({
  ...voucher,
  date: voucher.date.toISOString().slice(0, 10),
  totalAmount: voucher.totalAmount.toNumber(),
  vehicleLabel: voucher.sellAccountId ? labels.get(voucher.sellAccountId) ?? null : null,
  lines: voucher.lines.map((line) => ({
    ...line,
    debit: line.debit.toNumber(),
    credit: line.credit.toNumber(),
    vehicleLabel: line.sellAccountId ? labels.get(line.sellAccountId) ?? null : null,
  })),
});

/** Finds the financial year and month for a date. Every voucher must fall inside one. */
export const resolvePeriod = async (tx: Tx, date: Date) => {
  const period = await tx.finPeriod.findFirst({
    where: { startDate: { lte: date }, endDate: { gte: date } },
    include: { year: true },
  });
  if (!period) throw badRequest(`No financial year covers ${formatDay(date)}. Create it in Finance Settings → Financial Year & Periods.`);
  if (period.year.status === FinPeriodStatus.LOCKED) throw badRequest(`${period.year.label} is closed.`);
  return period;
};

export const loadReferences = async (tx: Tx, input: Pick<VoucherInput, 'lines' | 'partyId' | 'costCentreId' | 'sellAccountId'>): Promise<LedgerReferences> => {
  const accountIds = Array.from(new Set(input.lines.map((line) => line.accountId)));
  const partyIds = Array.from(new Set([input.partyId, ...input.lines.map((line) => line.partyId)].filter((id): id is string => Boolean(id))));
  const costCentreIds = Array.from(new Set([input.costCentreId, ...input.lines.map((line) => line.costCentreId)].filter((id): id is string => Boolean(id))));
  const vehicleIds = Array.from(new Set([input.sellAccountId, ...input.lines.map((line) => line.sellAccountId)].filter((id): id is string => Boolean(id))));
  const [accounts, parties, costCentres, vehicles] = await sequential([
    tx.finAccount.findMany({
      where: { id: { in: accountIds } },
      select: { id: true, code: true, name: true, kind: true, isActive: true, allowManualPosting: true, requiresParty: true, requiresVehicle: true, requiresCostCentre: true },
    }),
    tx.finParty.findMany({ where: { id: { in: partyIds }, isActive: true }, select: { id: true } }),
    tx.finCostCentre.findMany({ where: { id: { in: costCentreIds }, isActive: true }, select: { id: true } }),
    tx.sellAccount.findMany({ where: { id: { in: vehicleIds }, deletedAt: null }, select: { id: true } }),
  ]);
  return {
    accounts: new Map(accounts.map((account) => [account.id, account])),
    parties: new Set(parties.map((item) => item.id)),
    costCentres: new Set(costCentres.map((item) => item.id)),
    vehicles: new Set(vehicles.map((item) => item.id)),
  };
};

export const lineRows = (lines: VoucherLineInput[]) =>
  lines.map((line, index) => ({ ...line, lineNo: index + 1 }));

/** Takes the next number of the series under the row lock that the UPDATE holds until commit. */
export const assignNumber = async (tx: Tx, type: FinVoucherType, year: { id: string; startDate: Date }) => {
  const series = await tx.finNumberSeries.upsert({
    where: { voucherType_yearId: { voucherType: type, yearId: year.id } },
    create: { voucherType: type, yearId: year.id, prefix: defaultSeriesPrefix(type, year.startDate.getUTCFullYear()), nextNumber: 2 },
    update: { nextNumber: { increment: 1 } },
  });
  return formatVoucherNumber(series.prefix, series.nextNumber - 1, series.padLength);
};

const lockVoucher = async (tx: Tx, id: string) => {
  await tx.$queryRaw`SELECT id FROM "FinVoucher" WHERE id = ${id} FOR UPDATE`;
  const voucher = await tx.finVoucher.findUnique({ where: { id }, include: lockedInclude });
  if (!voucher) throw notFound('Voucher not found.');
  return voucher;
};

export const auditVoucher = (tx: Tx, access: LedgerAccess, voucher: { id: string; number: string | null; status: FinVoucherStatus; totalAmount: Prisma.Decimal | number }, action: string, extra: Record<string, unknown> = {}) =>
  writeFinAudit({
    ...access.actor,
    entityType: 'FinVoucher',
    entityId: voucher.id,
    action,
    after: { number: voucher.number, status: voucher.status, total: Number(voucher.totalAmount), ...extra },
    reason: typeof extra.reason === 'string' ? extra.reason : null,
  }, tx);

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export const listVouchers = async (query: Record<string, unknown>) => {
  const allTypes = Object.values(FinVoucherType) as string[];
  const types = typeof query.types === 'string' ? query.types.split(',').filter((type) => allTypes.includes(type)) as FinVoucherType[] : [];
  const statuses = typeof query.status === 'string'
    ? query.status.split(',').filter((status) => (Object.values(FinVoucherStatus) as string[]).includes(status)) as FinVoucherStatus[]
    : [];
  const from = readDate(query, 'from', 'From date');
  const to = readDate(query, 'to', 'To date');
  const q = typeof query.q === 'string' ? query.q.trim().slice(0, 80) : '';
  const page = Math.max(Number.parseInt(String(query.page || '1'), 10) || 1, 1);
  const pageSize = Math.min(Math.max(Number.parseInt(String(query.pageSize || '25'), 10) || 25, 1), 200);
  const accountId = typeof query.accountId === 'string' && query.accountId ? query.accountId : null;

  const where: Prisma.FinVoucherWhereInput = {
    ...(types.length ? { type: { in: types } } : {}),
    ...(statuses.length ? { status: { in: statuses } } : {}),
    ...(from || to ? { date: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
    ...(query.source === 'manual' ? { sourceType: null } : query.source === 'system' ? { sourceType: { not: null } } : {}),
    ...(accountId ? { lines: { some: { accountId } } } : {}),
    ...(q
      ? {
          OR: [
            { number: { contains: q, mode: 'insensitive' } },
            { narration: { contains: q, mode: 'insensitive' } },
            { reference: { contains: q, mode: 'insensitive' } },
            { party: { name: { contains: q, mode: 'insensitive' } } },
          ],
        }
      : {}),
  };

  const [vouchers, total, summary] = await Promise.all([
    prisma.finVoucher.findMany({
      where,
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { party: { select: { id: true, name: true } }, _count: { select: { lines: true } } },
    }),
    prisma.finVoucher.count({ where }),
    prisma.finVoucher.groupBy({ by: ['status'], where, _count: { _all: true }, _sum: { totalAmount: true } }),
  ]);

  return {
    vouchers: vouchers.map((voucher) => ({ ...voucher, date: voucher.date.toISOString().slice(0, 10), totalAmount: voucher.totalAmount.toNumber() })),
    total,
    page,
    pageSize,
    summary: summary.map((row) => ({ status: row.status, count: row._count._all, amount: row._sum.totalAmount?.toNumber() ?? 0 })),
  };
};

export const getVoucher = async (id: string) => {
  const voucher = await prisma.finVoucher.findUnique({ where: { id }, include: voucherInclude });
  if (!voucher) throw notFound('Voucher not found.');
  const [labels, activity] = await Promise.all([
    vehicleLabels([voucher.sellAccountId, ...voucher.lines.map((line) => line.sellAccountId)]),
    prisma.finAuditLog.findMany({ where: { entityType: 'FinVoucher', entityId: id }, orderBy: { createdAt: 'asc' } }),
  ]);
  const actorIds = Array.from(new Set(activity.map((item) => item.actorUserId).filter((value): value is string => Boolean(value))));
  const actors = actorIds.length ? await prisma.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, name: true, email: true } }) : [];
  return {
    ...serializeVoucher(voucher, labels),
    activity: activity.map((item) => ({
      id: item.id,
      action: item.action,
      at: item.createdAt.toISOString(),
      reason: item.reason,
      actor: actors.find((actor) => actor.id === item.actorUserId)?.name ?? actors.find((actor) => actor.id === item.actorUserId)?.email ?? null,
    })),
  };
};

// ---------------------------------------------------------------------------
// Draft lifecycle (manual vouchers)
// ---------------------------------------------------------------------------

const assertManualEditable = (voucher: { status: FinVoucherStatus; sourceType: string | null }) => {
  if (voucher.sourceType) throw badRequest('This voucher was created automatically. Change its source record instead.');
  if (voucher.status !== 'DRAFT' && voucher.status !== 'REJECTED') {
    throw badRequest('Only draft or rejected vouchers can be changed. Reverse a posted voucher instead.');
  }
};

export const createVoucher = async (body: Record<string, unknown>, access: LedgerAccess) => {
  const input = parseVoucherInput(body, MANUAL_VOUCHER_TYPES);
  return prisma.$transaction(async (tx) => {
    const period = await resolvePeriod(tx, input.date);
    if (period.status === 'LOCKED') throw badRequest(`${period.label} is locked.`);
    const total = validateVoucher(input, await loadReferences(tx, input), { manual: true });
    const { lines, ...header } = input;
    const voucher = await tx.finVoucher.create({
      data: {
        ...header,
        yearId: period.yearId,
        periodId: period.id,
        totalAmount: total,
        createdById: access.actor.actorUserId,
        updatedById: access.actor.actorUserId,
        lines: { create: lineRows(lines) },
      },
    });
    await auditVoucher(tx, access, voucher, 'CREATE', { type: voucher.type, date: formatDay(voucher.date) });
    return { id: voucher.id, status: voucher.status };
  });
};

export const updateVoucher = async (id: string, body: Record<string, unknown>, access: LedgerAccess) => {
  const input = parseVoucherInput(body, MANUAL_VOUCHER_TYPES);
  return prisma.$transaction(async (tx) => {
    const before = await lockVoucher(tx, id);
    assertManualEditable(before);
    const period = await resolvePeriod(tx, input.date);
    if (period.status === 'LOCKED') throw badRequest(`${period.label} is locked.`);
    const total = validateVoucher(input, await loadReferences(tx, input), { manual: true });
    const { lines, ...header } = input;
    await tx.finVoucherLine.deleteMany({ where: { voucherId: id } });
    const voucher = await tx.finVoucher.update({
      where: { id },
      data: {
        ...header,
        yearId: period.yearId,
        periodId: period.id,
        totalAmount: total,
        status: 'DRAFT',
        rejectReason: null,
        updatedById: access.actor.actorUserId,
        lines: { create: lineRows(lines) },
      },
    });
    await auditVoucher(tx, access, voucher, 'UPDATE', { previousTotal: before.totalAmount.toNumber(), previousStatus: before.status });
    return { id: voucher.id, status: voucher.status };
  });
};

export const deleteVoucher = async (id: string, access: LedgerAccess) =>
  prisma.$transaction(async (tx) => {
    const voucher = await lockVoucher(tx, id);
    assertManualEditable(voucher);
    await tx.finVoucher.delete({ where: { id } });
    await writeFinAudit({
      ...access.actor,
      entityType: 'FinVoucher',
      entityId: id,
      action: 'DELETE_DRAFT',
      before: { type: voucher.type, date: formatDay(voucher.date), total: voucher.totalAmount.toNumber(), narration: voucher.narration, lines: voucher.lines.map((line) => ({ accountId: line.accountId, debit: line.debit.toNumber(), credit: line.credit.toNumber() })) },
    }, tx);
    return { deleted: true };
  });

const toLineInputs = (lines: LockedVoucher['lines']): VoucherLineInput[] =>
  lines.map((line) => ({
    accountId: line.accountId,
    partyId: line.partyId,
    sellAccountId: line.sellAccountId,
    costCentreId: line.costCentreId,
    debit: line.debit,
    credit: line.credit,
    narration: line.narration,
    billRef: line.billRef,
  }));

/** Re-checks a stored voucher against today's ledgers and period before it goes into the books. */
const revalidateForPosting = async (tx: Tx, voucher: LockedVoucher, access: LedgerAccess) => {
  const period = await resolvePeriod(tx, voucher.date);
  const error = periodPostingError(period, access.canPostSoftClosed);
  if (error) throw badRequest(error);
  const lines = toLineInputs(voucher.lines);
  const refs = await loadReferences(tx, { lines, partyId: voucher.partyId, costCentreId: voucher.costCentreId, sellAccountId: voucher.sellAccountId });
  const total = validateVoucher({ ...voucher, lines }, refs, { manual: !voucher.sourceType });
  return { period, total, kinds: lines.map((line) => refs.accounts.get(line.accountId)!.kind) };
};

export const postVoucher = async (id: string, access: LedgerAccess) =>
  prisma.$transaction(async (tx) => {
    const voucher = await lockVoucher(tx, id);
    if (voucher.status !== 'DRAFT') {
      throw badRequest(voucher.status === 'PENDING_APPROVAL' ? 'This voucher is waiting for approval.' : `A ${voucher.status.toLowerCase().replace('_', ' ')} voucher cannot be posted.`);
    }
    // A draft money receipt stays a draft until it is converted on the Sold Vehicle.
    const receiptId = voucher.sourceType === 'SELL_ACCOUNT' ? voucher.sourceEvent?.match(/^RECEIPT:(.+)$/)?.[1] : undefined;
    if (receiptId) {
      const receipt = await tx.sellAccountPayment.findUnique({ where: { id: receiptId }, select: { receiptStatus: true } });
      if (receipt?.receiptStatus === 'DRAFT') throw badRequest('This is a draft money receipt. Convert it to a real receipt on the Sold Vehicle; the voucher is then posted automatically.');
    }
    const { period, total, kinds } = await revalidateForPosting(tx, voucher, access);
    const settings = await tx.finSettings.findUnique({ where: { id: FIN_SETTINGS_ID } });

    if (needsApproval(readApprovalPolicy(settings?.config), total, kinds)) {
      const submitted = await tx.finVoucher.update({
        where: { id },
        data: { status: 'PENDING_APPROVAL', submittedById: access.actor.actorUserId, submittedAt: new Date() },
      });
      await auditVoucher(tx, access, submitted, 'SUBMIT_FOR_APPROVAL');
      return { id, status: submitted.status, number: null };
    }

    const number = await assignNumber(tx, voucher.type, period.year);
    const posted = await tx.finVoucher.update({
      where: { id },
      data: { status: 'POSTED', number, totalAmount: total, postedById: access.actor.actorUserId, postedAt: new Date() },
    });
    await auditVoucher(tx, access, posted, 'POST');
    return { id, status: posted.status, number };
  });

export const approveVoucher = async (id: string, access: LedgerAccess) =>
  prisma.$transaction(async (tx) => {
    if (!access.canApprove) throw new FinHttpError(403, 'Approving vouchers needs the "Approve Finance Entries" permission.');
    const voucher = await lockVoucher(tx, id);
    if (voucher.status !== 'PENDING_APPROVAL') throw badRequest('Only vouchers waiting for approval can be approved.');
    if (voucher.createdById && voucher.createdById === access.actor.actorUserId && !access.isSuperAdmin) {
      throw new FinHttpError(403, 'Maker-checker: you cannot approve a voucher you created.');
    }
    const { period, total } = await revalidateForPosting(tx, voucher, access);
    const number = await assignNumber(tx, voucher.type, period.year);
    const now = new Date();
    const posted = await tx.finVoucher.update({
      where: { id },
      data: { status: 'POSTED', number, totalAmount: total, approvedById: access.actor.actorUserId, approvedAt: now, postedById: access.actor.actorUserId, postedAt: now },
    });
    await auditVoucher(tx, access, posted, 'APPROVE_AND_POST', { selfApproved: voucher.createdById === access.actor.actorUserId });
    return { id, status: posted.status, number };
  });

export const rejectVoucher = async (id: string, body: Record<string, unknown>, access: LedgerAccess) => {
  const reason = readMultiline(body, 'reason', 'Reason', 500);
  if (!reason) throw badRequest('A reason is required to reject a voucher.');
  return prisma.$transaction(async (tx) => {
    if (!access.canApprove) throw new FinHttpError(403, 'Rejecting vouchers needs the "Approve Finance Entries" permission.');
    const voucher = await lockVoucher(tx, id);
    if (voucher.status !== 'PENDING_APPROVAL') throw badRequest('Only vouchers waiting for approval can be rejected.');
    const rejected = await tx.finVoucher.update({ where: { id }, data: { status: 'REJECTED', rejectReason: reason } });
    await auditVoucher(tx, access, rejected, 'REJECT', { reason });
    return { id, status: rejected.status };
  });
};

/**
 * Posted vouchers are never edited. Reversal posts the mirror voucher (same type, swapped
 * sides) and marks the original REVERSED; both stay in the books and net to zero.
 */
export const reverseInTx = async (tx: Tx, voucher: LockedVoucher, access: LedgerAccess, reason: string, date: Date, options: { allowSystem: boolean }) => {
  if (voucher.status !== 'POSTED') throw badRequest('Only posted vouchers can be reversed.');
  if (voucher.reversalOfId) throw badRequest('This voucher is itself a reversal.');
  if (voucher.sourceType && !options.allowSystem) throw badRequest('This voucher was created automatically. Change its source record instead.');
  if (date < voucher.date) throw badRequest('The reversal cannot be dated before the original voucher.');

  const period = await resolvePeriod(tx, date);
  const error = periodPostingError(period, access.canPostSoftClosed);
  if (error) throw badRequest(error);

  const number = await assignNumber(tx, voucher.type, period.year);
  const now = new Date();
  const reversal = await tx.finVoucher.create({
    data: {
      number,
      type: voucher.type,
      date,
      yearId: period.yearId,
      periodId: period.id,
      status: 'POSTED',
      narration: `Reversal of ${voucher.number}: ${reason}`,
      reference: voucher.number,
      paymentMethod: voucher.paymentMethod,
      partyId: voucher.partyId,
      sellAccountId: voucher.sellAccountId,
      costCentreId: voucher.costCentreId,
      totalAmount: voucher.totalAmount,
      sourceType: voucher.sourceType,
      sourceId: voucher.sourceId,
      sourceEvent: voucher.sourceType ? 'REVERSAL' : null,
      reversalOfId: voucher.id,
      createdById: access.actor.actorUserId,
      postedById: access.actor.actorUserId,
      postedAt: now,
      lines: { create: lineRows(reversedLines(toLineInputs(voucher.lines))) },
    },
  });
  const original = await tx.finVoucher.update({
    where: { id: voucher.id },
    data: { status: 'REVERSED', reversedById: access.actor.actorUserId, reversedAt: now, reversalReason: reason },
  });
  await auditVoucher(tx, access, original, 'REVERSE', { reason, reversalNumber: number });
  await auditVoucher(tx, access, reversal, 'POST_REVERSAL', { reversalOf: voucher.number });
  return reversal;
};

export const reverseVoucher = async (id: string, body: Record<string, unknown>, access: LedgerAccess) => {
  const reason = readMultiline(body, 'reason', 'Reason', 500);
  if (!reason) throw badRequest('A reason is required to reverse a voucher.');
  const requestedDate = readDate(body, 'date', 'Reversal date');
  return prisma.$transaction(async (tx) => {
    const voucher = await lockVoucher(tx, id);
    if (voucher.type === 'OPENING') throw badRequest('Reopen the opening balances instead of reversing the opening voucher.');
    const reversal = await reverseInTx(tx, voucher, access, reason, requestedDate ?? voucher.date, { allowSystem: false });
    return { id: reversal.id, number: reversal.number, status: reversal.status };
  });
};

// ---------------------------------------------------------------------------
// Opening balances → OPENING voucher
// ---------------------------------------------------------------------------

export const finalizeOpeningBalances = async (yearId: string, access: LedgerAccess) =>
  prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "FinFinancialYear" WHERE id = ${yearId} FOR UPDATE`;
    const year = await tx.finFinancialYear.findUnique({ where: { id: yearId } });
    if (!year) throw notFound('Financial year not found.');
    if (year.openingFinalizedAt) throw conflict(`${year.label} opening balances are already finalised.`);
    const rows = await tx.finOpeningBalance.findMany({ where: { yearId }, orderBy: { createdAt: 'asc' } });
    if (!rows.length) throw badRequest('There are no opening balances to finalise.');

    const lines: VoucherLineInput[] = rows.map((row) => ({
      accountId: row.accountId,
      partyId: row.partyId,
      sellAccountId: null,
      costCentreId: null,
      debit: row.debit,
      credit: row.credit,
      narration: row.billRef ? `Opening bill ${row.billRef}` : row.note,
      billRef: row.billRef,
    }));
    const debit = sumMoney(lines.map((line) => line.debit));
    const credit = sumMoney(lines.map((line) => line.credit));
    if (!debit.equals(credit)) {
      throw badRequest(`Opening balances do not balance: debit ${debit.toFixed(2)}, credit ${credit.toFixed(2)}. The difference must be zero.`);
    }

    const period = await resolvePeriod(tx, year.startDate);
    const error = periodPostingError(period, access.canPostSoftClosed);
    if (error) throw badRequest(error);
    const total = validateVoucher(
      { type: 'OPENING', lines, narration: `Opening balances ${year.label}`, partyId: null, costCentreId: null, sellAccountId: null },
      await loadReferences(tx, { lines, partyId: null, costCentreId: null, sellAccountId: null }),
      { manual: false },
    );
    const number = await assignNumber(tx, 'OPENING', year);
    const now = new Date();
    const voucher = await tx.finVoucher.create({
      data: {
        number,
        type: 'OPENING',
        date: year.startDate,
        yearId,
        periodId: period.id,
        status: 'POSTED',
        narration: `Opening balances ${year.label}`,
        totalAmount: total,
        sourceType: 'OPENING_BALANCE',
        sourceId: yearId,
        createdById: access.actor.actorUserId,
        postedById: access.actor.actorUserId,
        postedAt: now,
        lines: { create: lineRows(lines) },
      },
    });
    await tx.finFinancialYear.update({ where: { id: yearId }, data: { openingFinalizedAt: now, openingFinalizedById: access.actor.actorUserId } });
    await auditVoucher(tx, access, voucher, 'FINALIZE_OPENING', { year: year.label, lines: lines.length });
    return { voucherId: voucher.id, number, total: total.toNumber() };
  });

export const reopenOpeningBalances = async (yearId: string, body: Record<string, unknown>, access: LedgerAccess) => {
  const reason = readMultiline(body, 'reason', 'Reason', 500);
  if (!reason) throw badRequest('A reason is required to reopen opening balances.');
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "FinFinancialYear" WHERE id = ${yearId} FOR UPDATE`;
    const year = await tx.finFinancialYear.findUnique({ where: { id: yearId } });
    if (!year) throw notFound('Financial year not found.');
    if (!year.openingFinalizedAt) throw badRequest(`${year.label} opening balances are not finalised.`);
    const opening = await tx.finVoucher.findFirst({
      where: { sourceType: 'OPENING_BALANCE', sourceId: yearId, status: 'POSTED', type: 'OPENING', reversalOfId: null },
      include: lockedInclude,
      orderBy: { createdAt: 'desc' },
    });
    if (opening) await reverseInTx(tx, opening, access, reason, year.startDate, { allowSystem: true });
    await tx.finFinancialYear.update({ where: { id: yearId }, data: { openingFinalizedAt: null, openingFinalizedById: null } });
    await writeFinAudit({ ...access.actor, entityType: 'FinFinancialYear', entityId: yearId, action: 'REOPEN_OPENING', reason, after: { reversed: opening?.number ?? null } }, tx);
    return { reopened: true, reversed: opening?.number ?? null };
  });
};

export { CASH_BANK_KINDS, LEDGER_STATUSES };
