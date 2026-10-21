import { Prisma } from '@prisma/client';
import prisma from '../../../lib/prisma';
import { badRequest, notFound } from '../http';
import { readDate, readEnum, readMoney, readMultiline, readString } from '../utils/input';
import { roundMoney, sumMoney } from '../utils/money';
import { writeFinAudit } from './audit.service';
import { CASH_BANK_KINDS, LEDGER_STATUSES, PAYMENT_METHODS, periodPostingError, validateVoucher, type VoucherLineInput } from './ledgerRules';
import { assignNumber, lineRows, loadReferences, lockedInclude, resolvePeriod, reverseInTx, type LedgerAccess } from './ledger.service';

// Payouts to partners, brokers and consignors against what the books say we owe them.

const ZERO = new Prisma.Decimal(0);
export const SETTLEMENT_PAYABLE_KEYS = ['PARTNER_PAYABLES', 'BROKER_PAYABLES', 'CONSIGNMENT_PAYABLE'] as const;

type OpenItem = { accountId: string; accountName: string; systemKey: string; sellAccountId: string | null; vehicle: string | null; balance: number };

const payableAccounts = async (tx: Prisma.TransactionClient | typeof prisma) => {
  const accounts = await tx.finAccount.findMany({ where: { systemKey: { in: [...SETTLEMENT_PAYABLE_KEYS] } }, select: { id: true, code: true, name: true, systemKey: true } });
  if (accounts.length !== SETTLEMENT_PAYABLE_KEYS.length) throw badRequest('Partner, broker or consignment payable ledgers are missing. Install the default chart of accounts.');
  return accounts;
};

/** Credit balances on the payable ledgers, by party, ledger and vehicle (posted entries only). */
export const openPayables = async (partyId?: string | null, tx: Prisma.TransactionClient | typeof prisma = prisma) => {
  const accounts = await payableAccounts(tx);
  const rows = await tx.finVoucherLine.groupBy({
    by: ['partyId', 'accountId', 'sellAccountId'],
    where: { accountId: { in: accounts.map((account) => account.id) }, ...(partyId ? { partyId } : { partyId: { not: null } }), voucher: { status: { in: LEDGER_STATUSES } } },
    _sum: { debit: true, credit: true },
  });
  const open = rows
    .map((row) => ({ ...row, balance: roundMoney((row._sum.credit ?? ZERO).minus(row._sum.debit ?? ZERO)) }))
    .filter((row) => row.balance.greaterThan(0));
  const [parties, vehicles] = await Promise.all([
    tx.finParty.findMany({ where: { id: { in: open.flatMap((row) => (row.partyId ? [row.partyId] : [])) } }, select: { id: true, code: true, name: true, mobile: true, pan: true, tdsSection: true } }),
    tx.sellAccount.findMany({ where: { id: { in: open.flatMap((row) => (row.sellAccountId ? [row.sellAccountId] : [])) } }, select: { id: true, recordNumber: true, vehicleNumber: true, listingTitle: true } }),
  ]);
  const byParty = new Map<string, { party: (typeof parties)[number]; total: number; items: OpenItem[] }>();
  for (const row of open) {
    const party = parties.find((item) => item.id === row.partyId);
    if (!party) continue;
    const account = accounts.find((item) => item.id === row.accountId)!;
    const vehicle = vehicles.find((item) => item.id === row.sellAccountId);
    const entry = byParty.get(party.id) ?? { party, total: 0, items: [] };
    entry.items.push({
      accountId: account.id,
      accountName: `${account.code} · ${account.name}`,
      systemKey: account.systemKey!,
      sellAccountId: row.sellAccountId,
      vehicle: vehicle ? [vehicle.recordNumber, vehicle.vehicleNumber, vehicle.listingTitle].filter(Boolean).join(' · ') : null,
      balance: row.balance.toNumber(),
    });
    entry.total = roundMoney(new Prisma.Decimal(entry.total).plus(row.balance)).toNumber();
    byParty.set(party.id, entry);
  }
  return Array.from(byParty.values()).sort((a, b) => b.total - a.total);
};

const readItems = (body: Record<string, unknown>) => {
  const raw = Array.isArray(body.items) ? body.items : null;
  if (!raw || !raw.length) throw badRequest('Choose at least one payable to settle.');
  return raw.map((item, index) => {
    const row = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>;
    const amount = readMoney(row, 'amount', `Item ${index + 1}: amount`) ?? ZERO;
    if (!amount.greaterThan(0)) throw badRequest(`Item ${index + 1}: amount must be more than zero.`);
    return {
      accountId: readString(row, 'accountId', `Item ${index + 1}: ledger`, { max: 60, required: true })!,
      sellAccountId: readString(row, 'sellAccountId', `Item ${index + 1}: vehicle`, { max: 60 }),
      amount,
    };
  });
};

type Item = ReturnType<typeof readItems>[number];

/** Checks every item against the party's open balance on that ledger and vehicle. */
const checkAgainstOpen = (items: Item[], open: Awaited<ReturnType<typeof openPayables>>[number] | undefined) => {
  const seen = new Set<string>();
  for (const item of items) {
    const key = `${item.accountId}|${item.sellAccountId ?? ''}`;
    if (seen.has(key)) throw badRequest('The same payable is listed twice.');
    seen.add(key);
    const match = open?.items.find((entry) => entry.accountId === item.accountId && (entry.sellAccountId ?? null) === (item.sellAccountId ?? null));
    if (!match) throw badRequest('One of the payables is no longer open.');
    if (item.amount.greaterThan(match.balance)) throw badRequest(`Paying ${item.amount.toFixed(2)} but only ${match.balance.toFixed(2)} is owed on ${match.accountName}${match.vehicle ? ` (${match.vehicle})` : ''}.`);
  }
};

export const createSettlement = async (body: Record<string, unknown>, access: LedgerAccess) => {
  const partyId = readString(body, 'partyId', 'Party', { max: 60, required: true })!;
  const items = readItems(body);
  const tdsAmount = readMoney(body, 'tdsAmount', 'TDS amount') ?? ZERO;
  const gross = sumMoney(items.map((item) => item.amount));
  if (tdsAmount.greaterThanOrEqualTo(gross)) throw badRequest('TDS must be less than the amount being settled.');
  const bankAccountId = readString(body, 'bankAccountId', 'Paid from', { max: 60, required: true })!;
  return prisma.$transaction(async (tx) => {
    const bank = await tx.finAccount.findUnique({ where: { id: bankAccountId }, select: { kind: true, isActive: true } });
    if (!bank || !bank.isActive || !CASH_BANK_KINDS.includes(bank.kind)) throw badRequest('Choose an active bank or cash account to pay from.');
    checkAgainstOpen(items, (await openPayables(partyId, tx))[0]);
    const settlement = await tx.finPartnerSettlement.create({
      data: {
        partyId,
        date: readDate(body, 'date', 'Payment date', true)!,
        bankAccountId,
        paymentMethod: body.paymentMethod ? readEnum(body, 'paymentMethod', 'Payment method', PAYMENT_METHODS) : null,
        reference: readString(body, 'reference', 'Reference / UTR', { max: 80 })?.toUpperCase() ?? null,
        grossAmount: gross,
        tdsSection: tdsAmount.greaterThan(0) ? readString(body, 'tdsSection', 'TDS section', { max: 10, required: true })!.toUpperCase() : null,
        tdsAmount,
        netAmount: roundMoney(gross.minus(tdsAmount)),
        lines: items.map((item) => ({ accountId: item.accountId, sellAccountId: item.sellAccountId, amount: item.amount.toFixed(2) })),
        notes: readMultiline(body, 'notes', 'Notes', 1000),
        createdById: access.actor.actorUserId,
      },
    });
    await writeFinAudit({ ...access.actor, entityType: 'FinPartnerSettlement', entityId: settlement.id, action: 'CREATE', after: { gross: gross.toNumber(), tds: tdsAmount.toNumber() } }, tx);
    return { id: settlement.id };
  }, { timeout: 30000 });
};

const lockSettlement = async (tx: Prisma.TransactionClient, id: string) => {
  await tx.$queryRaw`SELECT id FROM "FinPartnerSettlement" WHERE id = ${id} FOR UPDATE`;
  const settlement = await tx.finPartnerSettlement.findUnique({ where: { id }, include: { party: { select: { name: true } } } });
  if (!settlement) throw notFound('Settlement not found.');
  return settlement;
};

export const paySettlement = async (id: string, access: LedgerAccess) =>
  prisma.$transaction(async (tx) => {
    const settlement = await lockSettlement(tx, id);
    if (settlement.status !== 'DRAFT') throw badRequest('Only draft settlements can be paid.');
    const items = (settlement.lines as Array<{ accountId: string; sellAccountId: string | null; amount: string }>).map((line) => ({ ...line, amount: new Prisma.Decimal(line.amount) }));
    checkAgainstOpen(items, (await openPayables(settlement.partyId, tx))[0]);
    const tdsAccount = await tx.finAccount.findUnique({ where: { systemKey: 'TDS_PAYABLE' }, select: { id: true } });
    if (settlement.tdsAmount.greaterThan(0) && !tdsAccount) throw badRequest('TDS Payable ledger is missing.');
    const lines: VoucherLineInput[] = [
      ...items.map((item) => ({ accountId: item.accountId, partyId: settlement.partyId, sellAccountId: item.sellAccountId, costCentreId: null, debit: item.amount, credit: ZERO, narration: null, billRef: null })),
      ...(settlement.tdsAmount.greaterThan(0) ? [{ accountId: tdsAccount!.id, partyId: settlement.partyId, sellAccountId: null, costCentreId: null, debit: ZERO, credit: settlement.tdsAmount, narration: `TDS ${settlement.tdsSection ?? ''}`.trim(), billRef: null }] : []),
      { accountId: settlement.bankAccountId!, partyId: null, sellAccountId: null, costCentreId: null, debit: ZERO, credit: settlement.netAmount, narration: null, billRef: null },
    ];
    const period = await resolvePeriod(tx, settlement.date);
    const error = periodPostingError(period, access.canPostSoftClosed);
    if (error) throw badRequest(error);
    const narration = `Settlement paid to ${settlement.party.name}${settlement.notes ? ` — ${settlement.notes.slice(0, 200)}` : ''}`;
    const refs = await loadReferences(tx, { lines, partyId: settlement.partyId, costCentreId: null, sellAccountId: null });
    const total = validateVoucher({ type: 'PAYMENT', lines, narration, partyId: settlement.partyId, costCentreId: null, sellAccountId: null }, refs, { manual: false });
    const number = await assignNumber(tx, 'PAYMENT', period.year);
    const now = new Date();
    const voucher = await tx.finVoucher.create({
      data: {
        number, type: 'PAYMENT', date: settlement.date, yearId: period.yearId, periodId: period.id, status: 'POSTED', narration,
        reference: settlement.reference, paymentMethod: settlement.paymentMethod, partyId: settlement.partyId, totalAmount: total,
        sourceType: 'SETTLEMENT', sourceId: settlement.id, sourceEvent: 'PAYMENT',
        createdById: access.actor.actorUserId, postedById: access.actor.actorUserId, postedAt: now,
        lines: { create: lineRows(lines) },
      },
    });
    await tx.finPartnerSettlement.update({ where: { id }, data: { status: 'PAID', voucherId: voucher.id, paidById: access.actor.actorUserId, paidAt: now } });
    await writeFinAudit({ ...access.actor, entityType: 'FinPartnerSettlement', entityId: id, action: 'PAY', after: { number, net: settlement.netAmount.toNumber() } }, tx);
    return { id, number };
  }, { timeout: 30000 });

export const cancelSettlement = async (id: string, body: Record<string, unknown>, access: LedgerAccess) => {
  const reason = readMultiline(body, 'reason', 'Reason', 500);
  if (!reason) throw badRequest('A reason is required.');
  return prisma.$transaction(async (tx) => {
    const settlement = await lockSettlement(tx, id);
    if (settlement.status === 'CANCELLED') throw badRequest('Already cancelled.');
    if (settlement.status === 'PAID' && settlement.voucherId) {
      const voucher = await tx.finVoucher.findUnique({ where: { id: settlement.voucherId }, include: lockedInclude });
      if (voucher?.status === 'POSTED') await reverseInTx(tx, voucher, access, `Settlement cancelled: ${reason}`, readDate(body, 'date', 'Cancellation date') ?? settlement.date, { allowSystem: true });
    }
    await tx.finPartnerSettlement.update({ where: { id }, data: { status: 'CANCELLED', cancelReason: reason } });
    await writeFinAudit({ ...access.actor, entityType: 'FinPartnerSettlement', entityId: id, action: 'CANCEL', reason }, tx);
    return { id, status: 'CANCELLED' };
  }, { timeout: 30000 });
};

export const listSettlements = async (query: Record<string, unknown>) => {
  const settlements = await prisma.finPartnerSettlement.findMany({
    where: { ...(typeof query.status === 'string' && query.status ? { status: query.status as never } : {}), ...(typeof query.partyId === 'string' && query.partyId ? { partyId: query.partyId } : {}) },
    include: { party: { select: { code: true, name: true } } },
    orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
    take: 500,
  });
  const vouchers = await prisma.finVoucher.findMany({ where: { id: { in: settlements.flatMap((item) => (item.voucherId ? [item.voucherId] : [])) } }, select: { id: true, number: true } });
  return settlements.map((item) => ({
    ...item,
    date: item.date.toISOString().slice(0, 10),
    grossAmount: item.grossAmount.toNumber(),
    tdsAmount: item.tdsAmount.toNumber(),
    netAmount: item.netAmount.toNumber(),
    voucherNumber: vouchers.find((voucher) => voucher.id === item.voucherId)?.number ?? null,
  }));
};
