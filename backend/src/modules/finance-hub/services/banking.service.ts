import { Prisma } from '@prisma/client';
import prisma from '../../../lib/prisma';
import { badRequest, conflict, notFound } from '../http';
import { financialYearOf, istToday } from '../utils/fy';
import { dateOnly, readDate, readEnum, readMoney, readMultiline, readString } from '../utils/input';
import { roundMoney } from '../utils/money';
import { writeFinAudit } from './audit.service';
import type { ActorContext } from './context';
import { proposeMatches, reconcile } from './bankingRules';
import { CASH_BANK_KINDS, LEDGER_STATUSES } from './ledgerRules';
import { createVoucher, postVoucher, type LedgerAccess } from './ledger.service';
import { postSystemVoucher, vline } from './systemVoucher';

// Banking & cash: statement rows come from the existing Expenses-page import (FinanceTransaction,
// matched to a bank account by its statement aliases); book entries are voucher lines on the
// bank ledger. Reconciliation links the two without changing either.

const ZERO = new Prisma.Decimal(0);
const num = (value: Prisma.Decimal | null | undefined) => (value ? value.toNumber() : 0);

const loadBank = async (id: string) => {
  const bank = await prisma.finBankAccount.findUnique({ where: { id }, include: { account: { select: { id: true, code: true, name: true, kind: true } } } });
  if (!bank) throw notFound('Bank account not found.');
  return bank;
};

const aliasFilter = (aliases: string[]): Prisma.FinanceTransactionWhereInput =>
  aliases.length ? { OR: aliases.map((alias) => ({ accountName: { equals: alias, mode: 'insensitive' as const } })) } : { id: '__none__' };

/** Imported statement rows of a bank account (money in positive). */
const statementRows = async (aliases: string[], range: { from?: Date | null; to?: Date | null }) => {
  const rows = await prisma.financeTransaction.findMany({
    where: {
      ...aliasFilter(aliases),
      source: 'IMPORT',
      status: 'POSTED',
      type: { in: ['DEBIT', 'CREDIT'] },
      ...(range.from || range.to ? { transactionDate: { ...(range.from ? { gte: range.from } : {}), ...(range.to ? { lt: new Date(range.to.getTime() + 86400000) } : {}) } } : {}),
    },
    orderBy: [{ transactionDate: 'asc' }, { createdAt: 'asc' }],
    take: 5000,
  });
  return rows.map((row) => ({
    id: row.id,
    date: row.transactionDate,
    amount: row.type === 'CREDIT' ? num(row.amount) : -num(row.amount),
    balance: row.balance ? num(row.balance) : null,
    narration: row.narration,
    reference: row.reference ?? row.chequeNumber,
    name: row.name,
    importBatchId: row.importBatchId,
  }));
};

/** Posted voucher lines on the bank ledger (debit = money in). */
const bookLines = async (ledgerId: string, range: { from?: Date | null; to?: Date | null }) => {
  const lines = await prisma.finVoucherLine.findMany({
    where: { accountId: ledgerId, voucher: { status: { in: LEDGER_STATUSES }, ...(range.from || range.to ? { date: { ...(range.from ? { gte: range.from } : {}), ...(range.to ? { lte: range.to } : {}) } } : {}) } },
    include: { voucher: { select: { id: true, number: true, date: true, narration: true, reference: true, type: true, paymentMethod: true } }, party: { select: { name: true } } },
    orderBy: [{ voucher: { date: 'asc' } }, { lineNo: 'asc' }],
    take: 5000,
  });
  return lines.map((line) => ({
    id: line.id,
    voucherId: line.voucher.id,
    voucherNumber: line.voucher.number,
    voucherType: line.voucher.type,
    date: line.voucher.date,
    amount: roundMoney(line.debit.minus(line.credit)).toNumber(),
    narration: line.narration ?? line.voucher.narration,
    reference: line.voucher.reference,
    party: line.party?.name ?? null,
  }));
};

export const getBankingOverview = async () => {
  const banks = await prisma.finBankAccount.findMany({ where: { isActive: true }, include: { account: { select: { id: true, code: true, name: true, kind: true } } }, orderBy: { displayName: 'asc' } });
  const balances = await prisma.finVoucherLine.groupBy({ by: ['accountId'], where: { accountId: { in: banks.map((bank) => bank.accountId) }, voucher: { status: { in: LEDGER_STATUSES } } }, _sum: { debit: true, credit: true } });
  const recon = await prisma.finBankRecon.groupBy({ by: ['bankAccountId'], _count: { _all: true } });
  return Promise.all(banks.map(async (bank) => {
    const sums = balances.find((row) => row.accountId === bank.accountId);
    const last = bank.statementAliases.length ? await prisma.financeTransaction.findFirst({ where: { ...aliasFilter(bank.statementAliases), source: 'IMPORT', status: 'POSTED' }, orderBy: [{ transactionDate: 'desc' }, { createdAt: 'desc' }], select: { transactionDate: true, balance: true } }) : null;
    const statementCount = bank.statementAliases.length ? await prisma.financeTransaction.count({ where: { ...aliasFilter(bank.statementAliases), source: 'IMPORT', status: 'POSTED', type: { in: ['DEBIT', 'CREDIT'] } } }) : 0;
    const reconciled = recon.find((row) => row.bankAccountId === bank.id)?._count._all ?? 0;
    return {
      id: bank.id,
      displayName: bank.displayName,
      type: bank.type,
      bankName: bank.bankName,
      accountNumber: bank.accountNumber ? `••••${bank.accountNumber.slice(-4)}` : null,
      parentBankAccountId: bank.parentBankAccountId,
      vanPrefix: bank.vanPrefix,
      aliases: bank.statementAliases,
      ledger: bank.account,
      bookBalance: roundMoney((sums?._sum.debit ?? ZERO).minus(sums?._sum.credit ?? ZERO)).toNumber(),
      statementBalance: last?.balance ? num(last.balance) : null,
      statementDate: dateOnly(last?.transactionDate ?? null),
      statementRows: statementCount,
      unreconciled: Math.max(statementCount - reconciled, 0),
    };
  }));
};

const readRange = (query: Record<string, unknown>) => {
  const to = readDate(query, 'to', 'To') ?? istToday();
  const from = readDate(query, 'from', 'From') ?? financialYearOf(to).startDate;
  if (from > to) throw badRequest('From date is after the to date.');
  return { from, to };
};

/** Statement rows and book entries side by side, with their matches. */
export const getReconciliation = async (bankId: string, query: Record<string, unknown>) => {
  const bank = await loadBank(bankId);
  const range = readRange(query);
  const [statement, book, recon] = await Promise.all([statementRows(bank.statementAliases, range), bookLines(bank.accountId, range), prisma.finBankRecon.findMany({ where: { bankAccountId: bank.id } })]);
  const byStatement = new Map(recon.map((item) => [item.financeTransactionId, item]));
  const byLine = new Map(recon.flatMap((item) => (item.voucherLineId ? [[item.voucherLineId, item] as const] : [])));
  return {
    bank: { id: bank.id, displayName: bank.displayName, type: bank.type, aliases: bank.statementAliases, ledger: bank.account },
    from: dateOnly(range.from),
    to: dateOnly(range.to),
    statement: statement.map((row) => ({ ...row, date: dateOnly(row.date), recon: byStatement.get(row.id) ?? null })),
    book: book.map((line) => ({ ...line, date: dateOnly(line.date), recon: byLine.get(line.id) ?? null })),
  };
};

export const autoMatch = async (bankId: string, body: Record<string, unknown>, context: ActorContext) => {
  const bank = await loadBank(bankId);
  const range = readRange(body);
  const [statement, book, recon] = await Promise.all([statementRows(bank.statementAliases, range), bookLines(bank.accountId, { from: new Date(range.from.getTime() - 7 * 86400000), to: new Date(range.to.getTime() + 7 * 86400000) }), prisma.finBankRecon.findMany({ select: { financeTransactionId: true, voucherLineId: true } })]);
  const takenStatement = new Set(recon.map((item) => item.financeTransactionId));
  const takenLines = new Set(recon.flatMap((item) => (item.voucherLineId ? [item.voucherLineId] : [])));
  const matches = proposeMatches(
    statement.filter((row) => !takenStatement.has(row.id)).map((row) => ({ id: row.id, date: row.date, amount: row.amount, text: [row.narration, row.reference, row.name].filter(Boolean).join(' ') })),
    book.filter((line) => !takenLines.has(line.id)).map((line) => ({ id: line.id, date: line.date, amount: line.amount, refs: [line.voucherNumber, line.reference].filter((ref): ref is string => Boolean(ref)) })),
    3,
  );
  if (matches.length) {
    await prisma.finBankRecon.createMany({ data: matches.map((match) => ({ bankAccountId: bank.id, financeTransactionId: match.statementId, voucherLineId: match.bookId, status: 'MATCHED' as const, method: `AUTO_${match.reason}`, matchedById: context.actorUserId })), skipDuplicates: true });
    await writeFinAudit({ ...context, entityType: 'FinBankAccount', entityId: bank.id, action: 'AUTO_MATCH', after: { matched: matches.length, from: dateOnly(range.from), to: dateOnly(range.to) } });
  }
  return { matched: matches.length };
};

const statementRowFor = async (financeTransactionId: string) => {
  const row = await prisma.financeTransaction.findUnique({ where: { id: financeTransactionId } });
  if (!row || row.source !== 'IMPORT' || row.status !== 'POSTED' || row.type === 'TRANSFER') throw badRequest('Statement row not found.');
  const banks = await prisma.finBankAccount.findMany({ select: { id: true, accountId: true, statementAliases: true } });
  const bank = banks.find((item) => item.statementAliases.some((alias) => alias.toLowerCase() === row.accountName.toLowerCase()));
  if (!bank) throw badRequest(`No bank account has the statement alias "${row.accountName}".`);
  return { row, bank, amount: row.type === 'CREDIT' ? num(row.amount) : -num(row.amount) };
};

export const matchManually = async (body: Record<string, unknown>, context: ActorContext) => {
  const financeTransactionId = readString(body, 'financeTransactionId', 'Statement row', { max: 60, required: true })!;
  const voucherLineId = readString(body, 'voucherLineId', 'Book entry', { max: 60, required: true })!;
  const { bank, amount } = await statementRowFor(financeTransactionId);
  const line = await prisma.finVoucherLine.findUnique({ where: { id: voucherLineId }, include: { voucher: { select: { status: true } } } });
  if (!line || line.accountId !== bank.accountId) throw badRequest('That book entry is not on this bank ledger.');
  const lineAmount = roundMoney(line.debit.minus(line.credit)).toNumber();
  if (Math.abs(lineAmount - amount) >= 0.005) throw badRequest(`Amounts differ (${lineAmount.toFixed(2)} in books, ${amount.toFixed(2)} on the statement). Post the difference first.`);
  try {
    const recon = await prisma.finBankRecon.create({ data: { bankAccountId: bank.id, financeTransactionId, voucherLineId, status: 'MATCHED', method: 'MANUAL', matchedById: context.actorUserId } });
    await writeFinAudit({ ...context, entityType: 'FinBankRecon', entityId: recon.id, action: 'MATCH', after: { financeTransactionId, voucherLineId } });
    return { id: recon.id };
  } catch (error) {
    if ((error as { code?: string }).code === 'P2002') throw conflict('The statement row or the book entry is already matched.');
    throw error;
  }
};

export const ignoreStatementRow = async (body: Record<string, unknown>, context: ActorContext) => {
  const financeTransactionId = readString(body, 'financeTransactionId', 'Statement row', { max: 60, required: true })!;
  const note = readMultiline(body, 'note', 'Reason', 500);
  if (!note) throw badRequest('Say why this row needs no book entry.');
  const { bank } = await statementRowFor(financeTransactionId);
  try {
    const recon = await prisma.finBankRecon.create({ data: { bankAccountId: bank.id, financeTransactionId, status: 'IGNORED', method: 'MANUAL', note, matchedById: context.actorUserId } });
    await writeFinAudit({ ...context, entityType: 'FinBankRecon', entityId: recon.id, action: 'IGNORE', reason: note });
    return { id: recon.id };
  } catch (error) {
    if ((error as { code?: string }).code === 'P2002') throw conflict('This statement row is already reconciled.');
    throw error;
  }
};

export const unmatch = async (id: string, context: ActorContext) => {
  const recon = await prisma.finBankRecon.findUnique({ where: { id } });
  if (!recon) throw notFound('Match not found.');
  await prisma.finBankRecon.delete({ where: { id } });
  await writeFinAudit({ ...context, entityType: 'FinBankRecon', entityId: id, action: 'UNMATCH', before: recon });
  return { deleted: true };
};

/** Books a statement row that has no voucher yet (bank charges, interest, an unrecorded receipt) and matches it. */
export const createVoucherFromStatement = async (body: Record<string, unknown>, access: LedgerAccess & { canPost: boolean }) => {
  const financeTransactionId = readString(body, 'financeTransactionId', 'Statement row', { max: 60, required: true })!;
  const counterAccountId = readString(body, 'counterAccountId', 'Ledger', { max: 60, required: true })!;
  const partyId = readString(body, 'partyId', 'Party', { max: 60 });
  const { row, bank, amount } = await statementRowFor(financeTransactionId);
  if (await prisma.finBankRecon.findUnique({ where: { financeTransactionId } })) throw conflict('This statement row is already reconciled.');
  const counter = await prisma.finAccount.findUnique({ where: { id: counterAccountId }, select: { kind: true, requiresParty: true } });
  if (!counter) throw badRequest('Ledger not found.');
  if (counter.requiresParty && !partyId) throw badRequest('That ledger needs a party.');
  const into = amount > 0;
  const value = Math.abs(amount).toFixed(2);
  const bothCash = CASH_BANK_KINDS.includes(counter.kind);
  const type = bothCash ? 'CONTRA' : into ? 'RECEIPT' : 'PAYMENT';
  const narration = readMultiline(body, 'narration', 'Narration', 1000) ?? `${row.narration}`.slice(0, 1000);
  const bankLine = { accountId: bank.accountId, partyId: null, sellAccountId: null, costCentreId: null, narration: null, debit: into ? value : null, credit: into ? null : value };
  const counterLine = { accountId: counterAccountId, partyId: partyId ?? null, sellAccountId: null, costCentreId: null, narration: null, debit: into ? null : value, credit: into ? value : null };
  const draft = await createVoucher({ type, date: dateOnly(row.transactionDate), narration, reference: (row.reference ?? row.chequeNumber)?.slice(0, 80) ?? null, paymentMethod: 'BANK_TRANSFER', lines: [bankLine, counterLine] }, access);
  const posted = access.canPost ? await postVoucher(draft.id, access) : { id: draft.id, status: draft.status, number: null };
  const line = await prisma.finVoucherLine.findFirst({ where: { voucherId: draft.id, accountId: bank.accountId }, select: { id: true } });
  await prisma.finBankRecon.create({ data: { bankAccountId: bank.id, financeTransactionId, voucherLineId: line?.id ?? null, status: 'MATCHED', method: 'CREATED', matchedById: access.actor.actorUserId } });
  return { voucherId: draft.id, status: posted.status, number: posted.number };
};

/** Unreconciled statement rows across bank accounts (newest first). */
export const listUnmatched = async (query: Record<string, unknown>) => {
  const banks = await prisma.finBankAccount.findMany({ where: { isActive: true }, select: { id: true, displayName: true, accountId: true, statementAliases: true } });
  const range = readRange({ from: query.from, to: query.to });
  const recon = await prisma.finBankRecon.findMany({ select: { financeTransactionId: true } });
  const taken = new Set(recon.map((item) => item.financeTransactionId));
  const rows = (await Promise.all(banks.map(async (bank) => (await statementRows(bank.statementAliases, range)).filter((row) => !taken.has(row.id)).map((row) => ({ ...row, date: dateOnly(row.date), bank: { id: bank.id, displayName: bank.displayName } })))))
    .flat()
    .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));
  const known = new Set(banks.flatMap((bank) => bank.statementAliases.map((alias) => alias.toLowerCase())));
  const unmapped = await prisma.financeTransaction.groupBy({ by: ['accountName'], where: { source: 'IMPORT', status: 'POSTED' }, _count: { _all: true } });
  return { rows: rows.slice(0, 1000), total: rows.length, unmappedAccounts: unmapped.filter((item) => !known.has(item.accountName.toLowerCase())).map((item) => ({ accountName: item.accountName, rows: item._count._all })) };
};

/** Bank reconciliation statement as of a date. */
export const getBrs = async (bankId: string, query: Record<string, unknown>) => {
  const bank = await loadBank(bankId);
  const asOf = readDate(query, 'asOf', 'As of') ?? istToday();
  const [statement, book, recon, bookSums] = await Promise.all([
    statementRows(bank.statementAliases, { to: asOf }),
    bookLines(bank.accountId, { to: asOf }),
    prisma.finBankRecon.findMany({ where: { bankAccountId: bank.id } }),
    prisma.finVoucherLine.aggregate({ where: { accountId: bank.accountId, voucher: { status: { in: LEDGER_STATUSES }, date: { lte: asOf } } }, _sum: { debit: true, credit: true } }),
  ]);
  const reconciledStatement = new Set(recon.map((item) => item.financeTransactionId));
  const reconciledLines = new Set(recon.flatMap((item) => (item.voucherLineId ? [item.voucherLineId] : [])));
  const lastWithBalance = [...statement].reverse().find((row) => row.balance !== null);
  const bookOnly = book.filter((line) => !reconciledLines.has(line.id));
  const statementOnly = statement.filter((row) => !reconciledStatement.has(row.id));
  const result = reconcile({ bookBalance: roundMoney((bookSums._sum.debit ?? ZERO).minus(bookSums._sum.credit ?? ZERO)).toNumber(), statementBalance: lastWithBalance?.balance ?? null, bookOnly, statementOnly });
  return {
    bank: { id: bank.id, displayName: bank.displayName },
    asOf: dateOnly(asOf),
    statementBalanceDate: dateOnly(lastWithBalance?.date ?? null),
    ...result,
    bookOnly: bookOnly.map((line) => ({ ...line, date: dateOnly(line.date) })),
    statementOnly: statementOnly.map((row) => ({ ...row, date: dateOnly(row.date) })),
  };
};

/** Statement import batches from the Expenses page, with the bank account each maps to. */
export const listImports = async () => {
  const [batches, banks] = await Promise.all([
    prisma.financeImportBatch.findMany({ orderBy: { createdAt: 'desc' }, take: 200 }),
    prisma.finBankAccount.findMany({ select: { id: true, displayName: true, statementAliases: true } }),
  ]);
  return batches.map((batch) => ({
    ...batch,
    statementFrom: dateOnly(batch.statementFrom),
    statementTo: dateOnly(batch.statementTo),
    openingBalance: batch.openingBalance ? num(batch.openingBalance) : null,
    closingBalance: batch.closingBalance ? num(batch.closingBalance) : null,
    bank: banks.find((bank) => bank.statementAliases.some((alias) => alias.toLowerCase() === (batch.accountName ?? '').toLowerCase())) ?? null,
  }));
};

// ---------------------------------------------------------------------------
// Cash counts
// ---------------------------------------------------------------------------

const DENOMINATIONS = ['500', '200', '100', '50', '20', '10', '5', '2', '1'];

export const listCashCounts = async (query: Record<string, unknown>) => {
  const counts = await prisma.finCashCount.findMany({ where: typeof query.accountId === 'string' && query.accountId ? { accountId: query.accountId } : {}, orderBy: [{ date: 'desc' }, { createdAt: 'desc' }], take: 200 });
  const users = await prisma.user.findMany({ where: { id: { in: counts.flatMap((item) => (item.countedById ? [item.countedById] : [])) } }, select: { id: true, name: true } });
  return counts.map((item) => ({ ...item, date: dateOnly(item.date), countedAmount: num(item.countedAmount), bookBalance: num(item.bookBalance), difference: item.difference.toNumber(), countedBy: users.find((user) => user.id === item.countedById)?.name ?? null }));
};

export const createCashCount = async (body: Record<string, unknown>, context: ActorContext) => {
  const accountId = readString(body, 'accountId', 'Cash account', { max: 60, required: true })!;
  const account = await prisma.finAccount.findUnique({ where: { id: accountId }, select: { kind: true, name: true } });
  if (!account || (account.kind !== 'CASH' && account.kind !== 'PETTY_CASH')) throw badRequest('Choose a cash or petty cash ledger.');
  const date = readDate(body, 'date', 'Date', true)!;
  const raw = (body.denominations && typeof body.denominations === 'object' ? body.denominations : {}) as Record<string, unknown>;
  const denominations: Record<string, number> = {};
  let counted = ZERO;
  for (const note of DENOMINATIONS) {
    const pieces = Number.parseInt(String(raw[note] ?? '0'), 10) || 0;
    if (pieces < 0 || pieces > 1000000) throw badRequest(`Check the count of ₹${note}.`);
    if (pieces) denominations[note] = pieces;
    counted = counted.plus(new Prisma.Decimal(note).times(pieces));
  }
  const coins = readMoney(raw, 'coins', 'Coins') ?? ZERO;
  if (coins.greaterThan(0)) denominations.coins = coins.toNumber();
  counted = counted.plus(coins);
  const sums = await prisma.finVoucherLine.aggregate({ where: { accountId, voucher: { status: { in: LEDGER_STATUSES }, date: { lte: date } } }, _sum: { debit: true, credit: true } });
  const bookBalance = roundMoney((sums._sum.debit ?? ZERO).minus(sums._sum.credit ?? ZERO));
  const count = await prisma.finCashCount.create({
    data: { accountId, date, denominations, countedAmount: roundMoney(counted), bookBalance, difference: roundMoney(counted.minus(bookBalance)), note: readMultiline(body, 'note', 'Note', 1000), countedById: context.actorUserId },
  });
  await writeFinAudit({ ...context, entityType: 'FinCashCount', entityId: count.id, action: 'CREATE', after: { counted: counted.toNumber(), book: bookBalance.toNumber() } });
  return { id: count.id, countedAmount: roundMoney(counted).toNumber(), bookBalance: bookBalance.toNumber(), difference: roundMoney(counted.minus(bookBalance)).toNumber() };
};

// ---------------------------------------------------------------------------
// Payment gateway / UPI settlements
// ---------------------------------------------------------------------------

export const getGatewayOverview = async () => {
  const accounts = await prisma.finAccount.findMany({ where: { kind: 'GATEWAY_CLEARING', isActive: true }, select: { id: true, code: true, name: true } });
  const sums = await prisma.finVoucherLine.groupBy({ by: ['accountId'], where: { accountId: { in: accounts.map((account) => account.id) }, voucher: { status: { in: LEDGER_STATUSES } } }, _sum: { debit: true, credit: true } });
  const recent = await prisma.finVoucher.findMany({ where: { sourceType: 'GATEWAY_SETTLEMENT', status: { in: LEDGER_STATUSES } }, orderBy: [{ date: 'desc' }, { createdAt: 'desc' }], take: 100, select: { id: true, number: true, date: true, narration: true, reference: true, totalAmount: true, sourceId: true, status: true } });
  return {
    gateways: accounts.map((account) => {
      const row = sums.find((item) => item.accountId === account.id);
      return { ...account, collected: num(row?._sum.debit), settled: num(row?._sum.credit), pending: roundMoney((row?._sum.debit ?? ZERO).minus(row?._sum.credit ?? ZERO)).toNumber() };
    }),
    settlements: recent.map((voucher) => ({ ...voucher, date: dateOnly(voucher.date), totalAmount: num(voucher.totalAmount) })),
  };
};

/**
 * Contra from a gateway clearing account to the bank: Dr bank (net), Dr gateway charges,
 * Dr GST input on the fee, Cr gateway clearing (gross). One voucher per row; a UTR is posted once.
 */
export const createGatewaySettlements = async (body: Record<string, unknown>, access: LedgerAccess) => {
  const raw = Array.isArray(body.rows) ? body.rows : null;
  if (!raw?.length) throw badRequest('Add at least one settlement.');
  if (raw.length > 500) throw badRequest('Up to 500 settlements at a time.');
  const system = new Map((await prisma.finAccount.findMany({ where: { systemKey: { in: ['GATEWAY_CHARGES', 'GST_INPUT_IGST', 'GST_INPUT_CGST', 'GST_INPUT_SGST'] } }, select: { id: true, systemKey: true } })).map((account) => [account.systemKey!, account.id]));
  const results: Array<{ row: number; utr: string; number?: string; error?: string }> = [];
  for (const [index, item] of raw.entries()) {
    const row = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>;
    const at = `Row ${index + 1}`;
    try {
      const gatewayAccountId = readString(row, 'gatewayAccountId', `${at}: gateway`, { max: 60, required: true })!;
      const bankLedgerId = readString(row, 'bankAccountId', `${at}: bank`, { max: 60, required: true })!;
      const utr = readString(row, 'utr', `${at}: UTR / settlement id`, { max: 60, required: true })!.toUpperCase();
      const date = readDate(row, 'date', `${at}: date`, true)!;
      const gross = readMoney(row, 'gross', `${at}: gross`) ?? ZERO;
      const fee = readMoney(row, 'fee', `${at}: fee`) ?? ZERO;
      const gst = readMoney(row, 'gst', `${at}: GST on fee`) ?? ZERO;
      const split = readEnum(row, 'gstSplit', `${at}: GST type`, ['IGST', 'CGST_SGST'], 'IGST');
      const net = roundMoney(gross.minus(fee).minus(gst));
      if (!gross.greaterThan(0) || net.lessThan(0)) throw badRequest(`${at}: check gross, fee and GST.`);
      const [gateway, bank] = await Promise.all([
        prisma.finAccount.findUnique({ where: { id: gatewayAccountId }, select: { kind: true, name: true } }),
        prisma.finAccount.findUnique({ where: { id: bankLedgerId }, select: { kind: true } }),
      ]);
      if (gateway?.kind !== 'GATEWAY_CLEARING') throw badRequest(`${at}: choose a gateway clearing ledger.`);
      if (bank?.kind !== 'BANK') throw badRequest(`${at}: choose the bank the money reached.`);
      const lines = [vline(bankLedgerId, net, ZERO, { narration: `Settlement ${utr}` })];
      if (fee.greaterThan(0)) {
        if (!system.get('GATEWAY_CHARGES')) throw badRequest('Payment Gateway Charges ledger is missing.');
        lines.push(vline(system.get('GATEWAY_CHARGES')!, fee, ZERO));
      }
      if (gst.greaterThan(0)) {
        if (split === 'IGST') lines.push(vline(system.get('GST_INPUT_IGST')!, gst, ZERO, { narration: 'GST on gateway fee' }));
        else {
          const half = roundMoney(gst.dividedBy(2));
          lines.push(vline(system.get('GST_INPUT_CGST')!, half, ZERO, { narration: 'GST on gateway fee' }), vline(system.get('GST_INPUT_SGST')!, gst.minus(half), ZERO, { narration: 'GST on gateway fee' }));
        }
      }
      lines.push(vline(gatewayAccountId, ZERO, gross));
      const key = `gateway:${gatewayAccountId}:${utr}`;
      if (await prisma.finVoucher.findUnique({ where: { idempotencyKey: key }, select: { id: true } })) throw conflict(`${at}: settlement ${utr} is already posted.`);
      const voucher = await prisma.$transaction((tx) => postSystemVoucher(tx, {
        type: 'CONTRA', date, narration: `${gateway.name} settlement ${utr}: gross ${gross.toFixed(2)}, fee ${fee.toFixed(2)}, GST ${gst.toFixed(2)}`, reference: utr,
        lines, sourceType: 'GATEWAY_SETTLEMENT', sourceId: utr, sourceEvent: 'SETTLEMENT', idempotencyKey: key,
      }, access), { timeout: 30000 });
      results.push({ row: index + 1, utr, number: voucher.number });
    } catch (error) {
      results.push({ row: index + 1, utr: String(row.utr ?? ''), error: (error as Error).message });
    }
  }
  await writeFinAudit({ ...access.actor, entityType: 'FinGatewaySettlement', entityId: 'batch', action: 'POST', after: { posted: results.filter((item) => item.number).length, failed: results.filter((item) => item.error).length } });
  return { posted: results.filter((item) => item.number).length, failed: results.filter((item) => item.error).length, results };
};
