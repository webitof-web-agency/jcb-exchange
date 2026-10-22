import { randomUUID } from 'node:crypto';
import { FinAssetMethod, FinRunKind, Prisma } from '@prisma/client';
import prisma from '../../../lib/prisma';
import { badRequest, conflict, notFound } from '../http';
import { istToday } from '../utils/fy';
import { dateOnly, readDate, readEnum, readInt, readMoney, readMultiline, readString } from '../utils/input';
import { roundMoney } from '../utils/money';
import { writeFinAudit } from './audit.service';
import type { ActorContext } from './context';
import { depreciationSchedule, monthBounds, monthKey, monthlyDepreciation, monthlyPrepaid, type AssetBasis } from './assetsRules';
import { CASH_BANK_KINDS } from './ledgerRules';
import { lockedInclude, reverseInTx, type LedgerAccess } from './ledger.service';
import { postSystemVoucher, vline } from './systemVoucher';

// Fixed asset register, depreciation runs, prepaid expenses and their monthly amortisation.

const ZERO = new Prisma.Decimal(0);
const D = (value: number) => new Prisma.Decimal(value);
const num = (value: Prisma.Decimal | null | undefined) => (value ? value.toNumber() : 0);

type RunLine = { refId: string; amount: number };
const runLines = (value: Prisma.JsonValue) => (Array.isArray(value) ? (value as RunLine[]) : []);

/** Amount already posted per asset / prepaid id by POSTED runs of `kind`. */
const postedTotals = async (kind: FinRunKind, tx: Prisma.TransactionClient | typeof prisma = prisma) => {
  const runs = await tx.finPeriodicRun.findMany({ where: { kind, status: 'POSTED' }, select: { lines: true, periodKey: true } });
  const totals = new Map<string, number>();
  for (const run of runs) for (const line of runLines(run.lines)) totals.set(line.refId, roundMoney(D(totals.get(line.refId) ?? 0).plus(line.amount)).toNumber());
  return { totals, months: new Set(runs.map((run) => run.periodKey)) };
};

const basisOf = (asset: Prisma.FinFixedAssetGetPayload<object>): AssetBasis => ({
  cost: num(asset.cost), salvageValue: num(asset.salvageValue), method: asset.method, usefulLifeMonths: asset.usefulLifeMonths,
  wdvRatePercent: asset.wdvRatePercent ? num(asset.wdvRatePercent) : null, putToUseDate: asset.putToUseDate, disposedAt: asset.disposedAt,
});

// ---------------------------------------------------------------------------
// Fixed assets
// ---------------------------------------------------------------------------

const assetInput = async (body: Record<string, unknown>) => {
  const assetAccountId = readString(body, 'assetAccountId', 'Asset ledger', { max: 60, required: true })!;
  const account = await prisma.finAccount.findUnique({ where: { id: assetAccountId }, select: { kind: true, isActive: true } });
  if (!account || account.kind !== 'FIXED_ASSET' || !account.isActive) throw badRequest('Choose an active fixed asset ledger (e.g. Computers, Furniture, Vehicles).');
  const method = readEnum(body, 'method', 'Method', Object.values(FinAssetMethod), 'WDV');
  const usefulLifeMonths = readInt(body, 'usefulLifeMonths', 'Useful life (months)', { min: 1, max: 1200 });
  const wdvRatePercent = readMoney(body, 'wdvRatePercent', 'WDV rate %');
  if (method === 'SLM' && !usefulLifeMonths) throw badRequest('Straight line needs the useful life in months.');
  if (method === 'WDV' && !(wdvRatePercent && wdvRatePercent.greaterThan(0) && wdvRatePercent.lessThanOrEqualTo(100))) throw badRequest('Written-down value needs a rate between 0 and 100%.');
  const cost = readMoney(body, 'cost', 'Cost') ?? ZERO;
  const salvageValue = readMoney(body, 'salvageValue', 'Salvage value') ?? ZERO;
  const openingAccumulated = readMoney(body, 'openingAccumulated', 'Depreciation before the books began') ?? ZERO;
  if (!cost.greaterThan(0)) throw badRequest('Cost must be more than zero.');
  if (salvageValue.plus(openingAccumulated).greaterThan(cost)) throw badRequest('Salvage value plus earlier depreciation cannot exceed the cost.');
  const purchaseDate = readDate(body, 'purchaseDate', 'Purchase date', true)!;
  const putToUseDate = readDate(body, 'putToUseDate', 'Put-to-use date') ?? purchaseDate;
  if (putToUseDate < purchaseDate) throw badRequest('Put-to-use date is before the purchase date.');
  return {
    code: readString(body, 'code', 'Asset code', { max: 30, required: true })!.toUpperCase(),
    name: readString(body, 'name', 'Asset name', { max: 160, required: true })!,
    category: readString(body, 'category', 'Category', { max: 80 }),
    assetAccountId, purchaseDate, putToUseDate, cost, salvageValue, method,
    usefulLifeMonths: method === 'SLM' ? usefulLifeMonths : null,
    wdvRatePercent: method === 'WDV' ? wdvRatePercent : null,
    openingAccumulated,
    location: readString(body, 'location', 'Location', { max: 120 }),
    custodian: readString(body, 'custodian', 'Custodian', { max: 120 }),
    serialNumber: readString(body, 'serialNumber', 'Serial number', { max: 80 }),
    vendorPartyId: readString(body, 'vendorPartyId', 'Vendor', { max: 60 }),
    documentId: readString(body, 'documentId', 'Purchase bill', { max: 60 }),
    notes: readMultiline(body, 'notes', 'Notes', 1000),
  };
};

export const listAssets = async () => {
  const [assets, posted, accounts] = await Promise.all([
    prisma.finFixedAsset.findMany({ orderBy: [{ status: 'asc' }, { code: 'asc' }] }),
    postedTotals('DEPRECIATION'),
    prisma.finAccount.findMany({ where: { kind: 'FIXED_ASSET' }, select: { id: true, code: true, name: true } }),
  ]);
  return assets.map((asset) => {
    const accumulated = roundMoney(asset.openingAccumulated.plus(posted.totals.get(asset.id) ?? 0)).toNumber();
    const account = accounts.find((item) => item.id === asset.assetAccountId);
    return {
      ...asset,
      purchaseDate: dateOnly(asset.purchaseDate), putToUseDate: dateOnly(asset.putToUseDate), disposedAt: dateOnly(asset.disposedAt),
      cost: num(asset.cost), salvageValue: num(asset.salvageValue), openingAccumulated: num(asset.openingAccumulated), wdvRatePercent: asset.wdvRatePercent ? num(asset.wdvRatePercent) : null,
      disposalAmount: asset.disposalAmount ? num(asset.disposalAmount) : null,
      account: account ? `${account.code} · ${account.name}` : '—',
      accumulated,
      bookValue: roundMoney(asset.cost.minus(accumulated)).toNumber(),
    };
  });
};

export const getAssetSchedule = async (id: string) => {
  const asset = await prisma.finFixedAsset.findUnique({ where: { id } });
  if (!asset) throw notFound('Asset not found.');
  const posted = await postedTotals('DEPRECIATION');
  const accumulated = roundMoney(asset.openingAccumulated.plus(posted.totals.get(asset.id) ?? 0)).toNumber();
  const runs = await prisma.finPeriodicRun.findMany({ where: { kind: 'DEPRECIATION', status: 'POSTED' }, orderBy: { periodKey: 'asc' }, select: { periodKey: true, lines: true } });
  const history = runs.flatMap((run) => runLines(run.lines).filter((line) => line.refId === asset.id).map((line) => ({ month: run.periodKey, charge: line.amount })));
  const lastRun = history.length ? history[history.length - 1]!.month : null;
  const fromKey = lastRun ? monthKey(new Date(Date.UTC(Number(lastRun.slice(0, 4)), Number(lastRun.slice(5, 7)), 1))) : monthKey(asset.putToUseDate);
  return { accumulated, history, projection: asset.status === 'ACTIVE' ? depreciationSchedule(basisOf(asset), accumulated, fromKey, 36) : [] };
};

export const createAsset = async (body: Record<string, unknown>, context: ActorContext) => {
  const data = await assetInput(body);
  if (await prisma.finFixedAsset.findUnique({ where: { code: data.code } })) throw conflict(`Asset code ${data.code} is already used.`);
  const asset = await prisma.finFixedAsset.create({ data: { ...data, createdById: context.actorUserId } });
  await writeFinAudit({ ...context, entityType: 'FinFixedAsset', entityId: asset.id, action: 'CREATE', after: { code: asset.code, cost: num(asset.cost) } });
  return { id: asset.id };
};

export const updateAsset = async (id: string, body: Record<string, unknown>, context: ActorContext) => {
  const existing = await prisma.finFixedAsset.findUnique({ where: { id } });
  if (!existing) throw notFound('Asset not found.');
  if (existing.status !== 'ACTIVE') throw badRequest('A disposed asset cannot be edited.');
  const data = await assetInput(body);
  const posted = (await postedTotals('DEPRECIATION')).totals.get(id) ?? 0;
  // Once depreciation is posted the basis must not change underneath it.
  if (posted && (!data.cost.equals(existing.cost) || data.method !== existing.method || data.putToUseDate.getTime() !== existing.putToUseDate.getTime() || !data.openingAccumulated.equals(existing.openingAccumulated))) {
    throw badRequest('Depreciation has been posted for this asset: cost, method, put-to-use date and earlier depreciation can no longer change. Reverse the runs first.');
  }
  await prisma.finFixedAsset.update({ where: { id }, data });
  await writeFinAudit({ ...context, entityType: 'FinFixedAsset', entityId: id, action: 'UPDATE', before: { cost: num(existing.cost), method: existing.method }, after: { cost: data.cost.toNumber(), method: data.method } });
  return { id };
};

/** Sale or discard: removes cost and accumulated depreciation, books proceeds and the profit or loss. */
export const disposeAsset = async (id: string, body: Record<string, unknown>, access: LedgerAccess) => {
  const date = readDate(body, 'date', 'Disposal date', true)!;
  const amount = readMoney(body, 'amount', 'Sale proceeds') ?? ZERO;
  const receivingAccountId = readString(body, 'receivingAccountId', 'Received into', { max: 60 });
  const partyId = readString(body, 'partyId', 'Buyer', { max: 60 });
  const reason = readMultiline(body, 'reason', 'Reason', 500);
  if (amount.greaterThan(0) && !receivingAccountId) throw badRequest('Choose where the sale money was received.');
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "FinFixedAsset" WHERE id = ${id} FOR UPDATE`;
    const asset = await tx.finFixedAsset.findUnique({ where: { id } });
    if (!asset) throw notFound('Asset not found.');
    if (asset.status !== 'ACTIVE') throw badRequest('Already disposed.');
    if (date < asset.purchaseDate) throw badRequest('Disposal date is before the purchase date.');
    const posted = (await postedTotals('DEPRECIATION', tx)).totals.get(id) ?? 0;
    const accumulated = roundMoney(asset.openingAccumulated.plus(posted));
    const bookValue = roundMoney(asset.cost.minus(accumulated));
    const result = roundMoney(amount.minus(bookValue));
    const system = new Map((await tx.finAccount.findMany({ where: { systemKey: { in: ['ACCUMULATED_DEPRECIATION', 'ASSET_SALE_PROFIT', 'ASSET_SALE_LOSS'] } }, select: { id: true, systemKey: true } })).map((account) => [account.systemKey!, account.id]));
    const need = (key: string) => {
      const value = system.get(key);
      if (!value) throw badRequest(`Ledger ${key} is missing. Run "Install default chart" to add it.`);
      return value;
    };
    const receiving = receivingAccountId ? await tx.finAccount.findUnique({ where: { id: receivingAccountId }, select: { kind: true, requiresParty: true } }) : null;
    if (receiving?.requiresParty && !partyId) throw badRequest('Choose the buyer for that ledger.');
    const lines = [
      ...(accumulated.greaterThan(0) ? [vline(need('ACCUMULATED_DEPRECIATION'), accumulated, ZERO, { narration: asset.code })] : []),
      ...(amount.greaterThan(0) ? [vline(receivingAccountId!, amount, ZERO, { partyId: receiving?.requiresParty ? partyId : null })] : []),
      ...(result.lessThan(0) ? [vline(need('ASSET_SALE_LOSS'), result.negated(), ZERO, { narration: asset.code })] : []),
      vline(asset.assetAccountId, ZERO, asset.cost, { narration: asset.code }),
      ...(result.greaterThan(0) ? [vline(need('ASSET_SALE_PROFIT'), ZERO, result, { narration: asset.code })] : []),
    ];
    const type = receiving && CASH_BANK_KINDS.includes(receiving.kind) && amount.greaterThan(0) ? 'RECEIPT' : 'JOURNAL';
    const voucher = await postSystemVoucher(tx, {
      type, date, narration: `${amount.greaterThan(0) ? 'Sale' : 'Discard'} of ${asset.code} ${asset.name}${reason ? ` — ${reason}` : ''}`.slice(0, 1000),
      partyId: receiving?.requiresParty ? partyId : null, lines, sourceType: 'ASSET_DISPOSAL', sourceId: asset.id, sourceEvent: 'DISPOSE', idempotencyKey: `asset-disposal:${asset.id}`,
    }, access);
    await tx.finFixedAsset.update({ where: { id }, data: { status: 'DISPOSED', disposedAt: date, disposalAmount: amount, disposalVoucherId: voucher.id } });
    await writeFinAudit({ ...access.actor, entityType: 'FinFixedAsset', entityId: id, action: 'DISPOSE', after: { amount: amount.toNumber(), bookValue: bookValue.toNumber(), number: voucher.number }, reason }, tx);
    return { id, number: voucher.number, bookValue: bookValue.toNumber(), profit: result.toNumber() };
  }, { timeout: 30000 });
};

// ---------------------------------------------------------------------------
// Prepaid expenses
// ---------------------------------------------------------------------------

export const listPrepaid = async () => {
  const [items, posted, accounts] = await Promise.all([
    prisma.finPrepaidExpense.findMany({ orderBy: { startDate: 'desc' } }),
    postedTotals('PREPAID'),
    prisma.finAccount.findMany({ select: { id: true, code: true, name: true } }),
  ]);
  const name = (id: string) => {
    const account = accounts.find((item) => item.id === id);
    return account ? `${account.code} · ${account.name}` : '—';
  };
  return items.map((item) => {
    const amortised = posted.totals.get(item.id) ?? 0;
    return { ...item, startDate: dateOnly(item.startDate), totalAmount: num(item.totalAmount), amortised, balance: roundMoney(item.totalAmount.minus(amortised)).toNumber(), expenseAccount: name(item.expenseAccountId), prepaidAccount: name(item.prepaidAccountId) };
  });
};

export const createPrepaid = async (body: Record<string, unknown>, context: ActorContext) => {
  const expenseAccountId = readString(body, 'expenseAccountId', 'Expense ledger', { max: 60, required: true })!;
  const expense = await prisma.finAccount.findUnique({ where: { id: expenseAccountId }, select: { group: { select: { nature: true } } } });
  if (expense?.group.nature !== 'EXPENSE') throw badRequest('Choose an expense ledger.');
  const prepaidAccountId = readString(body, 'prepaidAccountId', 'Prepaid ledger', { max: 60 }) ?? (await prisma.finAccount.findUnique({ where: { systemKey: 'PREPAID_EXPENSES' }, select: { id: true } }))?.id;
  if (!prepaidAccountId) throw badRequest('Prepaid Expenses ledger is missing.');
  const totalAmount = readMoney(body, 'totalAmount', 'Amount') ?? ZERO;
  if (!totalAmount.greaterThan(0)) throw badRequest('Amount must be more than zero.');
  const months = readInt(body, 'months', 'Months', { min: 1, max: 120 });
  if (!months) throw badRequest('Months is required.');
  const item = await prisma.finPrepaidExpense.create({
    data: {
      name: readString(body, 'name', 'Name', { max: 160, required: true })!, expenseAccountId, prepaidAccountId, partyId: readString(body, 'partyId', 'Party', { max: 60 }),
      totalAmount, startDate: readDate(body, 'startDate', 'Start month', true)!, months, reference: readString(body, 'reference', 'Reference', { max: 80 }),
      notes: readMultiline(body, 'notes', 'Notes', 1000), createdById: context.actorUserId,
    },
  });
  await writeFinAudit({ ...context, entityType: 'FinPrepaidExpense', entityId: item.id, action: 'CREATE', after: { total: totalAmount.toNumber(), months } });
  return { id: item.id };
};

// ---------------------------------------------------------------------------
// Monthly runs (depreciation / prepaid)
// ---------------------------------------------------------------------------

const readMonth = (body: Record<string, unknown>) => {
  const key = typeof body.month === 'string' ? body.month : '';
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(key)) throw badRequest('Choose a month (YYYY-MM).');
  if (key > monthKey(istToday())) throw badRequest('That month has not started yet.');
  return key;
};

/** What a run for `key` would post, per asset or prepaid item. */
export const previewRun = async (kind: FinRunKind, key: string, tx: Prisma.TransactionClient | typeof prisma = prisma) => {
  const { start, end } = monthBounds(key);
  const posted = await postedTotals(kind, tx);
  if (kind === 'DEPRECIATION') {
    const assets = await tx.finFixedAsset.findMany({ where: { putToUseDate: { lte: end }, OR: [{ status: 'ACTIVE' }, { disposedAt: { gte: start } }] } });
    return assets.map((asset) => ({ refId: asset.id, label: `${asset.code} ${asset.name}`, debitAccountId: null as string | null, creditAccountId: asset.assetAccountId, amount: monthlyDepreciation(basisOf(asset), key, roundMoney(asset.openingAccumulated.plus(posted.totals.get(asset.id) ?? 0)).toNumber()) })).filter((line) => line.amount > 0);
  }
  const items = await tx.finPrepaidExpense.findMany({ where: { isActive: true, startDate: { lte: end } } });
  return items.map((item) => ({ refId: item.id, label: item.name, debitAccountId: item.expenseAccountId, creditAccountId: item.prepaidAccountId, amount: monthlyPrepaid({ totalAmount: num(item.totalAmount), startDate: item.startDate, months: item.months }, key, posted.totals.get(item.id) ?? 0) })).filter((line) => line.amount > 0);
};

export const getRuns = async (kind: FinRunKind, query: Record<string, unknown>) => {
  const runs = await prisma.finPeriodicRun.findMany({ where: { kind }, orderBy: [{ periodKey: 'desc' }, { createdAt: 'desc' }], take: 60 });
  const vouchers = await prisma.finVoucher.findMany({ where: { id: { in: runs.map((run) => run.voucherId) } }, select: { id: true, number: true } });
  const month = typeof query.month === 'string' && /^\d{4}-\d{2}$/.test(query.month) ? query.month : monthKey(istToday());
  return {
    month,
    preview: await previewRun(kind, month),
    alreadyRun: runs.some((run) => run.periodKey === month && run.status === 'POSTED'),
    runs: runs.map((run) => ({ ...run, runDate: dateOnly(run.runDate), total: num(run.total), lines: runLines(run.lines), voucherNumber: vouchers.find((voucher) => voucher.id === run.voucherId)?.number ?? null })),
  };
};

export const postRun = async (kind: FinRunKind, body: Record<string, unknown>, access: LedgerAccess) => {
  const key = readMonth(body);
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`finance-hub:run:${kind}`}))`;
    if (await tx.finPeriodicRun.findFirst({ where: { kind, periodKey: key, status: 'POSTED' } })) throw conflict(`${kind === 'DEPRECIATION' ? 'Depreciation' : 'Prepaid amortisation'} for ${key} is already posted. Reverse it first to run again.`);
    const lines = await previewRun(kind, key, tx);
    if (!lines.length) throw badRequest('Nothing to post for that month.');
    const { end } = monthBounds(key);
    const today = istToday();
    const date = end > today ? today : end;
    const id = randomUUID();
    let voucherLines;
    if (kind === 'DEPRECIATION') {
      const [expense, accumulated] = await Promise.all([tx.finAccount.findUnique({ where: { systemKey: 'DEPRECIATION' }, select: { id: true } }), tx.finAccount.findUnique({ where: { systemKey: 'ACCUMULATED_DEPRECIATION' }, select: { id: true } })]);
      if (!expense || !accumulated) throw badRequest('Depreciation ledgers are missing. Install the default chart of accounts.');
      if (lines.length > 190) throw badRequest('More than 190 assets: split the register by ledger (not supported yet).');
      const total = lines.reduce((sum, line) => sum.plus(line.amount), ZERO);
      voucherLines = [vline(expense.id, roundMoney(total), ZERO), ...lines.map((line) => vline(accumulated.id, ZERO, D(line.amount), { narration: line.label.slice(0, 300) }))];
    } else {
      if (lines.length > 95) throw badRequest('More than 95 prepaid items in one month (not supported yet).');
      voucherLines = lines.flatMap((line) => [vline(line.debitAccountId!, D(line.amount), ZERO, { narration: line.label.slice(0, 300) }), vline(line.creditAccountId, ZERO, D(line.amount), { narration: line.label.slice(0, 300) })]);
    }
    const total = roundMoney(lines.reduce((sum, line) => sum.plus(line.amount), ZERO));
    const voucher = await postSystemVoucher(tx, {
      type: 'JOURNAL', date, narration: `${kind === 'DEPRECIATION' ? 'Depreciation' : 'Prepaid expenses recognised'} for ${key}`, lines: voucherLines,
      sourceType: kind === 'DEPRECIATION' ? 'DEPRECIATION_RUN' : 'PREPAID_RUN', sourceId: id, sourceEvent: key,
    }, access);
    await tx.finPeriodicRun.create({ data: { id, kind, periodKey: key, runDate: date, total, lines: lines.map((line) => ({ refId: line.refId, amount: line.amount })), voucherId: voucher.id, createdById: access.actor.actorUserId } });
    await writeFinAudit({ ...access.actor, entityType: 'FinPeriodicRun', entityId: id, action: 'POST', after: { kind, month: key, total: total.toNumber(), number: voucher.number } }, tx);
    return { id, number: voucher.number, total: total.toNumber(), lines: lines.length };
  }, { timeout: 60000 });
};

/** Only the latest posted run of a kind can be reversed, so later months stay consistent. */
export const reverseRun = async (id: string, body: Record<string, unknown>, access: LedgerAccess) => {
  const reason = readMultiline(body, 'reason', 'Reason', 500);
  if (!reason) throw badRequest('A reason is required.');
  return prisma.$transaction(async (tx) => {
    const run = await tx.finPeriodicRun.findUnique({ where: { id } });
    if (!run || run.status !== 'POSTED') throw badRequest('Only a posted run can be reversed.');
    const later = await tx.finPeriodicRun.findFirst({ where: { kind: run.kind, status: 'POSTED', periodKey: { gt: run.periodKey } } });
    if (later) throw badRequest(`Reverse ${later.periodKey} first.`);
    if (run.kind === 'DEPRECIATION') {
      const disposed = await tx.finFixedAsset.findFirst({ where: { status: 'DISPOSED', id: { in: runLines(run.lines).map((line) => line.refId) } }, select: { code: true } });
      if (disposed) throw badRequest(`${disposed.code} was disposed using this depreciation; reverse the disposal voucher first.`);
    }
    const voucher = await tx.finVoucher.findUnique({ where: { id: run.voucherId }, include: lockedInclude });
    if (voucher?.status === 'POSTED') await reverseInTx(tx, voucher, access, `Run reversed: ${reason}`, run.runDate, { allowSystem: true });
    await tx.finPeriodicRun.update({ where: { id }, data: { status: 'REVERSED', reversedAt: new Date() } });
    await writeFinAudit({ ...access.actor, entityType: 'FinPeriodicRun', entityId: id, action: 'REVERSE', reason }, tx);
    return { id, status: 'REVERSED' };
  }, { timeout: 30000 });
};
