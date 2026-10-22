import { Prisma } from '@prisma/client';
import prisma from '../../../lib/prisma';
import { badRequest } from '../http';
import { financialYearOf, istToday } from '../utils/fy';
import { dateOnly, readDate } from '../utils/input';
import { CASH_BANK_KINDS, LEDGER_STATUSES } from './ledgerRules';
import { PAYABLE_KEYS, RECEIVABLE_KEYS } from './receivablesRules';
import { buildBalanceSheet, buildCashFlow, buildProfitAndLoss, isCashEquivalent, lineOf, type Figures, type StatementAccount } from './statementsRules';

// Financial statements, analysis reports and the finance dashboard (all from posted entries).

const round = (value: number) => Math.round(value * 100) / 100;
const num = (value: Prisma.Decimal | null | undefined) => (value ? value.toNumber() : 0);
const DAY_MS = 86400000;

const readRange = (query: Record<string, unknown>) => {
  const to = readDate(query, 'to', 'To') ?? istToday();
  const from = readDate(query, 'from', 'From') ?? financialYearOf(to).startDate;
  if (from > to) throw badRequest('From date is after the to date.');
  return { from, to };
};

/** Accounts with the report line inherited from their group chain. */
export const statementAccounts = async (): Promise<StatementAccount[]> => {
  const [accounts, groups] = await Promise.all([
    prisma.finAccount.findMany({ select: { id: true, code: true, name: true, kind: true, systemKey: true, groupId: true } }),
    prisma.finAccountGroup.findMany({ select: { id: true, code: true, nature: true, parentId: true, reportLine: true } }),
  ]);
  const byId = new Map(groups.map((group) => [group.id, group]));
  const lineFor = (groupId: string): string | null => {
    let group = byId.get(groupId);
    while (group) {
      if (group.reportLine) return group.reportLine;
      group = group.parentId ? byId.get(group.parentId) : undefined;
    }
    return null;
  };
  return accounts.map((account) => {
    const group = byId.get(account.groupId)!;
    return { id: account.id, code: account.code, name: account.name, kind: account.kind, systemKey: account.systemKey, nature: group.nature, reportLine: lineFor(account.groupId), groupCode: group.code };
  });
};

/** Year-close vouchers move profit to reserves; profit & loss views leave them out. */
const NOT_YEAR_CLOSE: Prisma.FinVoucherWhereInput = { OR: [{ sourceType: null }, { sourceType: { not: 'YEAR_CLOSE' } }] };

const figures = async (dates: Prisma.DateTimeFilter, options: { profitAndLoss?: boolean } = {}): Promise<Figures> => {
  const rows = await prisma.finVoucherLine.groupBy({ by: ['accountId'], where: { voucher: { status: { in: LEDGER_STATUSES }, date: dates, ...(options.profitAndLoss ? NOT_YEAR_CLOSE : {}) } }, _sum: { debit: true, credit: true } });
  return new Map(rows.map((row) => [row.accountId, round(num(row._sum.debit) - num(row._sum.credit))]));
};

export const getProfitAndLoss = async (query: Record<string, unknown>) => {
  const { from, to } = readRange(query);
  const accounts = await statementAccounts();
  const current = buildProfitAndLoss(accounts, await figures({ gte: from, lte: to }, { profitAndLoss: true }));
  let previous = null;
  if (query.compare === 'previous-year') {
    const shift = (date: Date) => new Date(Date.UTC(date.getUTCFullYear() - 1, date.getUTCMonth(), date.getUTCDate()));
    previous = { from: dateOnly(shift(from)), to: dateOnly(shift(to)), ...buildProfitAndLoss(accounts, await figures({ gte: shift(from), lte: shift(to) }, { profitAndLoss: true })) };
  }
  return { from: dateOnly(from), to: dateOnly(to), ...current, previous };
};

export const getBalanceSheet = async (query: Record<string, unknown>) => {
  const asOf = readDate(query, 'asOf', 'As of') ?? istToday();
  const accounts = await statementAccounts();
  const sheet = buildBalanceSheet(accounts, await figures({ lte: asOf }));
  const previousYearEnd = new Date(financialYearOf(asOf).startDate.getTime() - DAY_MS);
  const previous = query.compare === 'previous-year' ? buildBalanceSheet(accounts, await figures({ lte: previousYearEnd })) : null;
  return { asOf: dateOnly(asOf), ...sheet, previous: previous ? { asOf: dateOnly(previousYearEnd), ...previous } : null };
};

export const getCashFlow = async (query: Record<string, unknown>) => {
  const { from, to } = readRange(query);
  const accounts = await statementAccounts();
  const byId = new Map(accounts.map((account) => [account.id, account]));
  const cashIds = accounts.filter(isCashEquivalent).map((account) => account.id);
  const [vouchers, openingSums, closingSums] = await Promise.all([
    prisma.finVoucher.findMany({ where: { status: { in: LEDGER_STATUSES }, date: { gte: from, lte: to }, lines: { some: { accountId: { in: cashIds } } } }, select: { lines: { select: { accountId: true, debit: true, credit: true } } } }),
    prisma.finVoucherLine.aggregate({ where: { accountId: { in: cashIds }, voucher: { status: { in: LEDGER_STATUSES }, date: { lt: from } } }, _sum: { debit: true, credit: true } }),
    prisma.finVoucherLine.aggregate({ where: { accountId: { in: cashIds }, voucher: { status: { in: LEDGER_STATUSES }, date: { lte: to } } }, _sum: { debit: true, credit: true } }),
  ]);
  const flow = buildCashFlow(byId, vouchers.map((voucher) => voucher.lines.map((line) => ({ accountId: line.accountId, debit: num(line.debit), credit: num(line.credit) }))), num(openingSums._sum.debit) - num(openingSums._sum.credit), num(closingSums._sum.debit) - num(closingSums._sum.credit));
  return { from: dateOnly(from), to: dateOnly(to), ...flow };
};

/** Income, cost of sales, expenses and profit per month for a range. */
export const monthlyTrend = async (from: Date, to: Date) => {
  const accounts = await statementAccounts();
  const byId = new Map(accounts.map((account) => [account.id, account]));
  const lines = await prisma.$queryRaw<Array<{ month: string; accountId: string; net: Prisma.Decimal }>>`
    SELECT to_char(v."date", 'YYYY-MM') AS month, l."accountId" AS "accountId", SUM(l.debit - l.credit) AS net
    FROM "FinVoucherLine" l JOIN "FinVoucher" v ON v.id = l."voucherId"
    WHERE v.status IN ('POSTED', 'REVERSED') AND v."date" >= ${from} AND v."date" <= ${to} AND (v."sourceType" IS NULL OR v."sourceType" <> 'YEAR_CLOSE')
    GROUP BY 1, 2`;
  const months = new Map<string, { month: string; revenue: number; otherIncome: number; cogs: number; expenses: number; profit: number; cashIn: number; cashOut: number }>();
  for (let cursor = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), 1)); cursor <= to; cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1))) {
    const key = cursor.toISOString().slice(0, 7);
    months.set(key, { month: key, revenue: 0, otherIncome: 0, cogs: 0, expenses: 0, profit: 0, cashIn: 0, cashOut: 0 });
  }
  for (const row of lines) {
    const account = byId.get(row.accountId);
    const entry = months.get(row.month);
    if (!account || !entry) continue;
    const value = num(row.net);
    if (account.nature === 'INCOME') {
      if (lineOf(account) === 'Revenue from Operations') entry.revenue = round(entry.revenue - value);
      else entry.otherIncome = round(entry.otherIncome - value);
    } else if (account.nature === 'EXPENSE') {
      if (lineOf(account) === 'Cost of Vehicles Sold') entry.cogs = round(entry.cogs + value);
      else entry.expenses = round(entry.expenses + value);
    } else if (isCashEquivalent(account)) {
      if (value > 0) entry.cashIn = round(entry.cashIn + value);
      else entry.cashOut = round(entry.cashOut - value);
    }
  }
  for (const entry of months.values()) entry.profit = round(entry.revenue + entry.otherIncome - entry.cogs - entry.expenses);
  return Array.from(months.values());
};

export const getTrend = async (query: Record<string, unknown>) => {
  const { from, to } = readRange(query);
  return { from: dateOnly(from), to: dateOnly(to), months: await monthlyTrend(from, to) };
};

/** Income or expense (or purchase vouchers) by ledger / party / vehicle with month columns. */
export const getPivot = async (query: Record<string, unknown>) => {
  const { from, to } = readRange(query);
  const measure = query.measure === 'EXPENSE' ? 'EXPENSE' : query.measure === 'PURCHASE' ? 'PURCHASE' : 'INCOME';
  const by = query.by === 'party' ? 'party' : query.by === 'vehicle' ? 'vehicle' : 'account';
  const accounts = await statementAccounts();
  const natureIds = accounts.filter((account) => (measure === 'PURCHASE' ? true : account.nature === measure)).map((account) => account.id);
  const rows = await prisma.finVoucherLine.findMany({
    where: {
      ...(measure === 'PURCHASE' ? { voucher: { type: 'PURCHASE', status: { in: LEDGER_STATUSES }, date: { gte: from, lte: to } }, account: { requiresParty: true } } : { accountId: { in: natureIds }, voucher: { status: { in: LEDGER_STATUSES }, date: { gte: from, lte: to }, ...NOT_YEAR_CLOSE } }),
    },
    select: { accountId: true, partyId: true, sellAccountId: true, debit: true, credit: true, voucher: { select: { date: true, partyId: true } } },
  });
  const labels = new Map<string, string>();
  const partyIds = Array.from(new Set(rows.flatMap((row) => [row.partyId, row.voucher.partyId].filter((id): id is string => Boolean(id)))));
  const vehicleIds = Array.from(new Set(rows.flatMap((row) => (row.sellAccountId ? [row.sellAccountId] : []))));
  const [parties, vehicles] = await Promise.all([
    by === 'party' || measure === 'PURCHASE' ? prisma.finParty.findMany({ where: { id: { in: partyIds } }, select: { id: true, name: true } }) : [],
    by === 'vehicle' ? prisma.sellAccount.findMany({ where: { id: { in: vehicleIds } }, select: { id: true, recordNumber: true, vehicleNumber: true } }) : [],
  ]);
  for (const account of accounts) labels.set(`account:${account.id}`, `${account.code} · ${account.name}`);
  for (const party of parties) labels.set(`party:${party.id}`, party.name);
  for (const vehicle of vehicles) labels.set(`vehicle:${vehicle.id}`, [vehicle.recordNumber, vehicle.vehicleNumber].filter(Boolean).join(' · '));
  const table = new Map<string, { key: string; label: string; months: Record<string, number>; total: number }>();
  for (const row of rows) {
    const value = measure === 'EXPENSE' ? num(row.debit) - num(row.credit) : num(row.credit) - num(row.debit);
    const party = row.partyId ?? row.voucher.partyId;
    const key = measure === 'PURCHASE' || by === 'party' ? `party:${party ?? 'none'}` : by === 'vehicle' ? `vehicle:${row.sellAccountId ?? 'none'}` : `account:${row.accountId}`;
    const month = row.voucher.date.toISOString().slice(0, 7);
    const entry = table.get(key) ?? { key, label: labels.get(key) ?? (key.endsWith('none') ? 'Not tagged' : key), months: {}, total: 0 };
    entry.months[month] = round((entry.months[month] ?? 0) + value);
    entry.total = round(entry.total + value);
    table.set(key, entry);
  }
  const months: string[] = [];
  for (let cursor = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), 1)); cursor <= to; cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1))) months.push(cursor.toISOString().slice(0, 7));
  const result = Array.from(table.values()).filter((row) => row.total !== 0).sort((a, b) => b.total - a.total);
  return { from: dateOnly(from), to: dateOnly(to), measure, by, months, rows: result, total: round(result.reduce((sum, row) => sum + row.total, 0)) };
};

/** Opening, receipts, payments and closing of every bank / cash / wallet / gateway account. */
export const getBankCashReport = async (query: Record<string, unknown>) => {
  const { from, to } = readRange(query);
  const accounts = await prisma.finAccount.findMany({ where: { kind: { in: CASH_BANK_KINDS } }, select: { id: true, code: true, name: true, kind: true, isActive: true }, orderBy: { code: 'asc' } });
  const ids = accounts.map((account) => account.id);
  const [before, during] = await Promise.all([
    prisma.finVoucherLine.groupBy({ by: ['accountId'], where: { accountId: { in: ids }, voucher: { status: { in: LEDGER_STATUSES }, date: { lt: from } } }, _sum: { debit: true, credit: true } }),
    prisma.finVoucherLine.groupBy({ by: ['accountId'], where: { accountId: { in: ids }, voucher: { status: { in: LEDGER_STATUSES }, date: { gte: from, lte: to } } }, _sum: { debit: true, credit: true }, _count: { _all: true } }),
  ]);
  const rows = accounts.map((account) => {
    const open = before.find((row) => row.accountId === account.id);
    const move = during.find((row) => row.accountId === account.id);
    const opening = round(num(open?._sum.debit) - num(open?._sum.credit));
    const receipts = round(num(move?._sum.debit));
    const payments = round(num(move?._sum.credit));
    return { ...account, opening, receipts, payments, closing: round(opening + receipts - payments), entries: move?._count._all ?? 0 };
  }).filter((row) => row.isActive || row.opening || row.closing || row.entries);
  const sum = (key: 'opening' | 'receipts' | 'payments' | 'closing') => round(rows.reduce((total, row) => total + row[key], 0));
  return { from: dateOnly(from), to: dateOnly(to), rows, totals: { opening: sum('opening'), receipts: sum('receipts'), payments: sum('payments'), closing: sum('closing') } };
};

/** GST, TDS and tax payments month by month (ledger movements). */
export const getTaxReport = async (query: Record<string, unknown>) => {
  const { from, to } = readRange(query);
  const keys = ['GST_OUTPUT_IGST', 'GST_OUTPUT_CGST', 'GST_OUTPUT_SGST', 'GST_INPUT_IGST', 'GST_INPUT_CGST', 'GST_INPUT_SGST', 'GST_RCM_PAYABLE', 'TDS_PAYABLE', 'TDS_RECEIVABLE', 'TCS_PAYABLE'];
  const accounts = await prisma.finAccount.findMany({ where: { systemKey: { in: keys } }, select: { id: true, systemKey: true } });
  const keyOf = new Map(accounts.map((account) => [account.id, account.systemKey!]));
  if (!accounts.length) return { from: dateOnly(from), to: dateOnly(to), months: [], challans: [] };
  const rows = await prisma.$queryRaw<Array<{ month: string; accountId: string; debit: Prisma.Decimal; credit: Prisma.Decimal; challan: boolean; setoff: boolean }>>`
    SELECT to_char(v."date", 'YYYY-MM') AS month, l."accountId" AS "accountId", SUM(l.debit) AS debit, SUM(l.credit) AS credit,
      (v."sourceType" = 'TAX_CHALLAN') AS challan, (v."sourceType" = 'GST_SETOFF') AS setoff
    FROM "FinVoucherLine" l JOIN "FinVoucher" v ON v.id = l."voucherId"
    WHERE v.status IN ('POSTED', 'REVERSED') AND v."date" >= ${from} AND v."date" <= ${to} AND l."accountId" IN (${Prisma.join(accounts.map((account) => account.id))})
    GROUP BY 1, 2, 5, 6`;
  const months = new Map<string, { month: string; outputTax: number; inputTax: number; rcm: number; gstPaid: number; tdsDeducted: number; tdsDeposited: number; tdsByOthers: number; tcs: number }>();
  for (let cursor = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), 1)); cursor <= to; cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1))) {
    const key = cursor.toISOString().slice(0, 7);
    months.set(key, { month: key, outputTax: 0, inputTax: 0, rcm: 0, gstPaid: 0, tdsDeducted: 0, tdsDeposited: 0, tdsByOthers: 0, tcs: 0 });
  }
  for (const row of rows) {
    const entry = months.get(row.month);
    const key = keyOf.get(row.accountId);
    if (!entry || !key) continue;
    const debit = num(row.debit);
    const credit = num(row.credit);
    if (key.startsWith('GST_OUTPUT')) {
      if (row.challan) entry.gstPaid = round(entry.gstPaid + debit);
      else if (!row.setoff) entry.outputTax = round(entry.outputTax + credit - debit);
    } else if (key.startsWith('GST_INPUT')) {
      if (!row.setoff) entry.inputTax = round(entry.inputTax + debit - credit);
    } else if (key === 'GST_RCM_PAYABLE') {
      if (row.challan) entry.gstPaid = round(entry.gstPaid + debit);
      else entry.rcm = round(entry.rcm + credit - debit);
    } else if (key === 'TDS_PAYABLE') {
      if (row.challan) entry.tdsDeposited = round(entry.tdsDeposited + debit);
      else entry.tdsDeducted = round(entry.tdsDeducted + credit - debit);
    } else if (key === 'TDS_RECEIVABLE') entry.tdsByOthers = round(entry.tdsByOthers + debit - credit);
    else if (key === 'TCS_PAYABLE') entry.tcs = round(entry.tcs + credit - debit);
  }
  const challans = await prisma.finTaxChallan.groupBy({ by: ['taxType'], where: { date: { gte: from, lte: to } }, _sum: { total: true }, _count: { _all: true } }).catch(() => []);
  return { from: dateOnly(from), to: dateOnly(to), months: Array.from(months.values()), challans: challans.map((row) => ({ taxType: row.taxType, count: row._count._all, total: num(row._sum.total) })) };
};

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

const balanceOf = async (accountIds: string[], asOf: Date) => {
  if (!accountIds.length) return 0;
  const sums = await prisma.finVoucherLine.aggregate({ where: { accountId: { in: accountIds }, voucher: { status: { in: LEDGER_STATUSES }, date: { lte: asOf } } }, _sum: { debit: true, credit: true } });
  return round(num(sums._sum.debit) - num(sums._sum.credit));
};

export const getOverview = async () => {
  const today = istToday();
  const fy = financialYearOf(today);
  const accounts = await statementAccounts();
  const ids = (pick: (account: StatementAccount) => boolean) => accounts.filter(pick).map((account) => account.id);
  const recentFrom = new Date(today.getTime() - 30 * DAY_MS);
  const [pl, cash, receivable, payable, gstOutput, gstInput, trend] = await Promise.all([
    figures({ gte: fy.startDate, lte: today }, { profitAndLoss: true }).then((movement) => buildProfitAndLoss(accounts, movement)),
    balanceOf(ids(isCashEquivalent), today),
    balanceOf(ids((account) => (RECEIVABLE_KEYS as readonly string[]).includes(account.systemKey ?? '')), today),
    balanceOf(ids((account) => (PAYABLE_KEYS as readonly string[]).includes(account.systemKey ?? '')), today),
    balanceOf(ids((account) => (account.systemKey ?? '').startsWith('GST_OUTPUT') || account.systemKey === 'GST_RCM_PAYABLE'), today),
    balanceOf(ids((account) => (account.systemKey ?? '').startsWith('GST_INPUT_') && account.systemKey !== 'GST_INPUT_INELIGIBLE'), today),
    monthlyTrend(new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 11, 1)), today),
  ]);
  const largestDebtors = await prisma.finVoucherLine.groupBy({
    by: ['partyId'],
    where: { accountId: { in: ids((account) => account.systemKey === 'DEBTORS_CONTROL') }, partyId: { not: null }, voucher: { status: { in: LEDGER_STATUSES } } },
    _sum: { debit: true, credit: true },
  });
  const top = largestDebtors.map((row) => ({ partyId: row.partyId!, balance: round(num(row._sum.debit) - num(row._sum.credit)) })).filter((row) => row.balance > 0).sort((a, b) => b.balance - a.balance).slice(0, 5);
  const names = await prisma.finParty.findMany({ where: { id: { in: top.map((row) => row.partyId) } }, select: { id: true, name: true } });
  const recentVouchers = await prisma.finVoucher.count({ where: { status: 'POSTED', postedAt: { gte: recentFrom } } });
  return {
    asOf: dateOnly(today), fy: { start: dateOnly(fy.startDate), label: `${fy.startDate.getUTCFullYear()}-${String((fy.startDate.getUTCFullYear() + 1) % 100).padStart(2, '0')}` },
    kpis: {
      revenue: pl.income.find((line) => line.line === 'Revenue from Operations')?.amount ?? 0, totalIncome: pl.totalIncome, expenses: pl.totalExpenses, grossProfit: pl.grossProfit,
      netProfit: pl.profitAfterTax, cashAndBank: cash, receivables: receivable, payables: round(-payable), gstPayable: round(-gstOutput - gstInput), postedLast30Days: recentVouchers,
    },
    trend,
    topDebtors: top.map((row) => ({ ...row, name: names.find((party) => party.id === row.partyId)?.name ?? '—' })),
  };
};

/** Everything that needs someone's attention, with the screen to fix it. */
export const getAlerts = async () => {
  const today = istToday();
  const safe = async <T,>(promise: Promise<T>, fallback: T) => promise.catch(() => fallback);
  const lastMonthStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1));
  const lastMonthKey = lastMonthStart.toISOString().slice(0, 7);
  const suspense = await prisma.finAccount.findUnique({ where: { systemKey: 'SUSPENSE' }, select: { id: true } });
  const [pending, drafts, autoDrafts, failedQueue, draftDocs, payrollDrafts, claims, recurringDue, settlementDrafts, suspenseBalance, openPastPeriods, upload2b, unreconciled] = await Promise.all([
    prisma.finVoucher.count({ where: { status: 'PENDING_APPROVAL' } }),
    prisma.finVoucher.count({ where: { status: 'DRAFT', sourceType: null } }),
    prisma.finVoucher.count({ where: { status: 'DRAFT', sourceType: { not: null } } }),
    prisma.finPostingQueue.count({ where: { status: 'FAILED' } }),
    safe(prisma.finDocument.count({ where: { status: 'DRAFT' } }), 0),
    safe(prisma.finPayrollRun.count({ where: { status: 'DRAFT' } }), 0),
    safe(prisma.finReimbursement.count({ where: { status: 'SUBMITTED' } }), 0),
    safe(prisma.finRecurringExpense.count({ where: { isActive: true, nextRunDate: { lte: today } } }), 0),
    safe(prisma.finPartnerSettlement.count({ where: { status: 'DRAFT' } }), 0),
    suspense ? balanceOf([suspense.id], today) : Promise.resolve(0),
    prisma.finPeriod.count({ where: { status: 'OPEN', endDate: { lt: new Date(today.getTime() - 10 * DAY_MS) }, startDate: { lt: lastMonthStart } } }),
    safe(prisma.finGstr2bUpload.findUnique({ where: { period: lastMonthKey }, select: { id: true } }), null),
    safe(prisma.financeTransaction.count({ where: { source: 'IMPORT', status: 'POSTED' } }).then(async (rows) => rows - (await prisma.finBankRecon.count())), 0),
  ]);
  const alerts = [
    { key: 'pending-approvals', label: 'Vouchers waiting for approval', count: pending, severity: 'high', module: 'alerts-pending-approvals' },
    { key: 'failed-posting', label: 'Automatic posting failures', count: failedQueue, severity: 'high', module: 'automation-approval-rules' },
    { key: 'suspense', label: `Suspense account balance ${suspenseBalance ? `₹${Math.abs(suspenseBalance).toLocaleString('en-IN')}` : ''}`.trim(), count: suspenseBalance ? 1 : 0, severity: 'high', module: 'suspense-account' },
    { key: 'auto-drafts', label: 'Automatic entries still drafts (shadow mode)', count: autoDrafts, severity: 'medium', module: 'day-book' },
    { key: 'manual-drafts', label: 'Manual voucher drafts', count: drafts, severity: 'low', module: 'day-book' },
    { key: 'draft-documents', label: 'Draft bills / invoices / notes', count: draftDocs, severity: 'medium', module: 'purchase-bills-invoices' },
    { key: 'payroll', label: 'Payroll waiting for approval', count: payrollDrafts, severity: 'medium', module: 'payroll-processing' },
    { key: 'claims', label: 'Reimbursement claims to approve', count: claims, severity: 'medium', module: 'employee-reimbursements' },
    { key: 'recurring', label: 'Recurring expenses due', count: recurringDue, severity: 'medium', module: 'recurring-expenses' },
    { key: 'settlements', label: 'Partner / broker settlements to pay', count: settlementDrafts, severity: 'medium', module: 'partner-commission-settlement' },
    { key: 'bank', label: 'Bank statement rows not reconciled', count: Math.max(unreconciled, 0), severity: 'medium', module: 'bank-reconciliation' },
    { key: 'periods', label: 'Past months still open (close and lock them)', count: openPastPeriods, severity: 'low', module: 'monthly-closing' },
    { key: 'gstr2b', label: `GSTR-2B for ${lastMonthKey} not uploaded`, count: upload2b ? 0 : 1, severity: 'low', module: 'gst-returns-reconciliation' },
  ];
  return { asOf: dateOnly(today), alerts: alerts.filter((alert) => alert.count > 0), all: alerts };
};
