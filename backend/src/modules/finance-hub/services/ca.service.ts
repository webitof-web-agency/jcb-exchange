import { FinQueryStatus, Prisma } from '@prisma/client';
import prisma from '../../../lib/prisma';
import { badRequest, conflict, notFound } from '../http';
import { istToday } from '../utils/fy';
import { dateOnly, readDate, readEnum, readInt, readMultiline, readString } from '../utils/input';
import { roundMoney } from '../utils/money';
import { writeFinAudit } from './audit.service';
import type { ActorContext } from './context';
import { LEDGER_STATUSES } from './ledgerRules';
import { lockedInclude, reverseInTx, type LedgerAccess } from './ledger.service';
import { getAlerts } from './statements.service';
import { postSystemVoucher, vline } from './systemVoucher';
import { getGstSummary } from './tax.service';

// CA & audit workspace: document vault, month-end checklist, year-end close, CA queries,
// accounting review and the CA dashboard.

const ZERO = new Prisma.Decimal(0);
const num = (value: Prisma.Decimal | null | undefined) => (value ? value.toNumber() : 0);
const round = (value: number) => Math.round(value * 100) / 100;

const userNames = async (ids: Array<string | null | undefined>) => {
  const unique = Array.from(new Set(ids.filter((id): id is string => Boolean(id))));
  const users = unique.length ? await prisma.user.findMany({ where: { id: { in: unique } }, select: { id: true, name: true, email: true } }) : [];
  return (id: string | null | undefined) => (id ? users.find((user) => user.id === id)?.name ?? users.find((user) => user.id === id)?.email ?? null : null);
};

// ---------------------------------------------------------------------------
// Document vault
// ---------------------------------------------------------------------------

export const VAULT_CATEGORIES = ['GST_RETURN', 'TDS_RETURN', 'INCOME_TAX', 'BANK_STATEMENT', 'AUDIT_REPORT', 'BOARD_DOCUMENT', 'AGREEMENT', 'INVOICE', 'BILL', 'PAYROLL', 'ASSET', 'LICENCE', 'OTHER'] as const;

export const listVault = async (query: Record<string, unknown>) => {
  const q = typeof query.q === 'string' ? query.q.trim().slice(0, 60) : '';
  const documents = await prisma.finVaultDocument.findMany({
    where: {
      isArchived: query.archived === 'true',
      ...(typeof query.category === 'string' && query.category ? { category: query.category } : {}),
      ...(typeof query.financialYear === 'string' && query.financialYear ? { financialYear: query.financialYear } : {}),
      ...(typeof query.entityId === 'string' && query.entityId ? { entityId: query.entityId } : {}),
      ...(q ? { OR: [{ title: { contains: q, mode: 'insensitive' } }, { fileName: { contains: q, mode: 'insensitive' } }, { tags: { has: q.toLowerCase() } }] } : {}),
    },
    orderBy: [{ createdAt: 'desc' }],
    take: 500,
  });
  const name = await userNames(documents.map((item) => item.uploadedById));
  const today = istToday();
  return documents.map((item) => ({ ...item, expiresAt: dateOnly(item.expiresAt), uploadedBy: name(item.uploadedById), expired: Boolean(item.expiresAt && item.expiresAt < today) }));
};

export const addVaultDocument = async (body: Record<string, unknown>, context: ActorContext) => {
  const fileUrl = readString(body, 'fileUrl', 'File', { max: 1000, required: true })!;
  if (!/^(https?:\/\/|\/)/i.test(fileUrl)) throw badRequest('File link must be an http(s) link or an uploaded file.');
  const previousId = readString(body, 'previousId', 'Previous version', { max: 60 });
  const previous = previousId ? await prisma.finVaultDocument.findUnique({ where: { id: previousId } }) : null;
  if (previousId && !previous) throw badRequest('Previous version not found.');
  const tags = Array.isArray(body.tags) ? (body.tags as unknown[]).map((tag) => String(tag).trim().toLowerCase().slice(0, 30)).filter(Boolean).slice(0, 10) : [];
  const document = await prisma.$transaction(async (tx) => {
    if (previous) await tx.finVaultDocument.update({ where: { id: previous.id }, data: { isArchived: true } });
    return tx.finVaultDocument.create({
      data: {
        title: readString(body, 'title', 'Title', { max: 200, required: true })!,
        category: readEnum(body, 'category', 'Category', VAULT_CATEGORIES, 'OTHER'),
        financialYear: readString(body, 'financialYear', 'Financial year', { max: 20 }),
        period: readString(body, 'period', 'Period', { max: 7 }),
        fileUrl, fileName: readString(body, 'fileName', 'File name', { max: 200 }), mimeType: readString(body, 'mimeType', 'Type', { max: 120 }),
        size: typeof body.size === 'number' ? Math.round(body.size) : null,
        version: previous ? previous.version + 1 : 1, previousId: previous?.id ?? null,
        entityType: readString(body, 'entityType', 'Linked record', { max: 40 }), entityId: readString(body, 'entityId', 'Linked record id', { max: 60 }),
        expiresAt: readDate(body, 'expiresAt', 'Expiry'), tags, notes: readMultiline(body, 'notes', 'Notes', 1000), uploadedById: context.actorUserId,
      },
    });
  });
  await writeFinAudit({ ...context, entityType: 'FinVaultDocument', entityId: document.id, action: previous ? 'NEW_VERSION' : 'UPLOAD', after: { title: document.title, category: document.category, version: document.version } });
  return { id: document.id };
};

export const archiveVaultDocument = async (id: string, context: ActorContext) => {
  const document = await prisma.finVaultDocument.findUnique({ where: { id } });
  if (!document) throw notFound('Document not found.');
  await prisma.finVaultDocument.update({ where: { id }, data: { isArchived: !document.isArchived } });
  await writeFinAudit({ ...context, entityType: 'FinVaultDocument', entityId: id, action: document.isArchived ? 'RESTORE' : 'ARCHIVE' });
  return { id, isArchived: !document.isArchived };
};

// ---------------------------------------------------------------------------
// Month-end checklist
// ---------------------------------------------------------------------------

const MANUAL_ITEMS = [
  { key: 'bank-statements', label: 'Bank statements imported for every account and reconciled' },
  { key: 'cash-count', label: 'Cash and petty cash counted and differences booked' },
  { key: 'purchase-bills', label: 'All purchase bills / expenses of the month entered' },
  { key: 'sales-review', label: 'Sales invoices and credit notes reviewed' },
  { key: 'tds-deposit', label: 'TDS of the month deposited (by the 7th of next month)' },
  { key: 'gst-returns', label: 'GSTR-1 / GSTR-3B filed and challan recorded' },
  { key: 'payroll-statutory', label: 'PF / ESI / PT paid and challans recorded' },
];

type ChecklistItem = { key: string; label: string; done: boolean; doneById: string | null; doneAt: string | null; note: string | null };

/** Automatic checks for a month plus the manual checklist and sign-off. */
export const getMonthlyClose = async (periodId: string) => {
  const period = await prisma.finPeriod.findUnique({ where: { id: periodId }, include: { year: { select: { label: true } } } });
  if (!period) throw notFound('Period not found.');
  const range = { gte: period.startDate, lte: period.endDate };
  const monthKey = period.startDate.toISOString().slice(0, 7);
  const safe = <T,>(promise: Promise<T>, fallback: T) => promise.catch(() => fallback);
  const suspense = await prisma.finAccount.findUnique({ where: { systemKey: 'SUSPENSE' }, select: { id: true } });
  const [draftVouchers, pending, draftDocs, failedQueue, activeAssets, depreciation, activePrepaid, prepaidRun, activeSalaries, payroll, suspenseSums, statementRows, reconciled, gst] = await Promise.all([
    prisma.finVoucher.count({ where: { status: 'DRAFT', date: range } }),
    prisma.finVoucher.count({ where: { status: 'PENDING_APPROVAL', date: range } }),
    safe(prisma.finDocument.count({ where: { status: 'DRAFT', date: range } }), 0),
    prisma.finPostingQueue.count({ where: { status: 'FAILED' } }),
    safe(prisma.finFixedAsset.count({ where: { status: 'ACTIVE', putToUseDate: { lte: period.endDate } } }), 0),
    safe(prisma.finPeriodicRun.count({ where: { kind: 'DEPRECIATION', periodKey: monthKey, status: 'POSTED' } }), 0),
    safe(prisma.finPrepaidExpense.count({ where: { isActive: true, startDate: { lte: period.endDate } } }), 0),
    safe(prisma.finPeriodicRun.count({ where: { kind: 'PREPAID', periodKey: monthKey, status: 'POSTED' } }), 0),
    safe(prisma.finEmployeeSalary.count({ where: { isActive: true } }), 0),
    safe(prisma.finPayrollRun.count({ where: { month: monthKey, status: { in: ['POSTED', 'PAID'] } } }), 0),
    suspense ? prisma.finVoucherLine.aggregate({ where: { accountId: suspense.id, voucher: { status: { in: LEDGER_STATUSES }, date: { lte: period.endDate } } }, _sum: { debit: true, credit: true } }) : Promise.resolve(null),
    safe(prisma.financeTransaction.findMany({ where: { source: 'IMPORT', status: 'POSTED', transactionDate: { gte: period.startDate, lt: new Date(period.endDate.getTime() + 86400000) } }, select: { id: true } }), []),
    safe(prisma.finBankRecon.findMany({ select: { financeTransactionId: true } }), []),
    safe(getGstSummary({ month: monthKey }), null),
  ]);
  const reconciledIds = new Set(reconciled.map((item) => item.financeTransactionId));
  const unreconciled = statementRows.filter((row) => !reconciledIds.has(row.id)).length;
  const suspenseBalance = suspenseSums ? round(num(suspenseSums._sum.debit) - num(suspenseSums._sum.credit)) : 0;
  const gstDifference = gst ? round(Object.values(gst.ledger.outputDifference).reduce((sum, value) => sum + Math.abs(value), 0) + Object.values(gst.ledger.inputDifference).reduce((sum, value) => sum + Math.abs(value), 0)) : 0;
  const checks = [
    { key: 'drafts', label: 'No draft vouchers dated in the month', ok: draftVouchers === 0, detail: `${draftVouchers} drafts`, module: 'day-book' },
    { key: 'pending', label: 'Nothing waiting for approval', ok: pending === 0, detail: `${pending} pending`, module: 'alerts-pending-approvals' },
    { key: 'documents', label: 'No draft bills / invoices / notes', ok: draftDocs === 0, detail: `${draftDocs} drafts`, module: 'purchase-bills-invoices' },
    { key: 'posting', label: 'Automatic posting has no failures', ok: failedQueue === 0, detail: `${failedQueue} failed`, module: 'automation-approval-rules' },
    { key: 'bank', label: 'Bank statement rows of the month reconciled', ok: unreconciled === 0, detail: `${unreconciled} unreconciled of ${statementRows.length}`, module: 'bank-reconciliation' },
    { key: 'depreciation', label: 'Depreciation posted', ok: activeAssets === 0 || depreciation > 0, detail: activeAssets ? (depreciation ? 'posted' : 'not run') : 'no assets', module: 'depreciation' },
    { key: 'prepaid', label: 'Prepaid expenses recognised', ok: activePrepaid === 0 || prepaidRun > 0, detail: activePrepaid ? (prepaidRun ? 'posted' : 'not run') : 'none', module: 'prepaid-expenses' },
    { key: 'payroll', label: 'Payroll posted', ok: activeSalaries === 0 || payroll > 0, detail: activeSalaries ? (payroll ? 'posted' : 'not posted') : 'no payroll', module: 'payroll-processing' },
    { key: 'gst', label: 'GST registers agree with GST ledgers', ok: gstDifference === 0, detail: gstDifference ? `difference ₹${gstDifference}` : 'agree', module: 'gst-returns-reconciliation' },
    { key: 'suspense', label: 'Suspense account is zero', ok: suspenseBalance === 0, detail: `₹${suspenseBalance}`, module: 'suspense-account' },
  ];
  const checklist = await prisma.finCloseChecklist.findUnique({ where: { periodId } });
  const saved = (checklist?.items ?? []) as ChecklistItem[];
  const items = MANUAL_ITEMS.map((item) => saved.find((row) => row.key === item.key) ?? { ...item, done: false, doneById: null, doneAt: null, note: null });
  const name = await userNames([checklist?.signedOffById, ...items.map((item) => item.doneById)]);
  return {
    period: { id: period.id, label: period.label, status: period.status, startDate: dateOnly(period.startDate), endDate: dateOnly(period.endDate), year: period.year.label },
    checks,
    items: items.map((item) => ({ ...item, doneBy: name(item.doneById) })),
    signedOff: checklist?.signedOffAt ? { at: checklist.signedOffAt, by: name(checklist.signedOffById) } : null,
    notes: checklist?.notes ?? null,
  };
};

export const updateMonthlyClose = async (periodId: string, body: Record<string, unknown>, context: ActorContext) => {
  const period = await prisma.finPeriod.findUnique({ where: { id: periodId }, select: { id: true, status: true } });
  if (!period) throw notFound('Period not found.');
  const existing = await prisma.finCloseChecklist.findUnique({ where: { periodId } });
  const current = ((existing?.items ?? []) as ChecklistItem[]);
  const updates = Array.isArray(body.items) ? (body.items as Array<Record<string, unknown>>) : [];
  const items = MANUAL_ITEMS.map((item) => {
    const before = current.find((row) => row.key === item.key) ?? { ...item, done: false, doneById: null, doneAt: null, note: null };
    const change = updates.find((row) => row.key === item.key);
    if (!change) return before;
    const done = change.done === true;
    return { ...before, label: item.label, done, doneById: done ? (before.done ? before.doneById : context.actorUserId) : null, doneAt: done ? (before.done ? before.doneAt : new Date().toISOString()) : null, note: typeof change.note === 'string' ? change.note.slice(0, 300) : before.note };
  });
  const signOff = body.signOff === true;
  if (signOff && items.some((item) => !item.done)) throw badRequest('Tick every checklist item before signing off.');
  const saved = await prisma.finCloseChecklist.upsert({
    where: { periodId },
    create: { periodId, items, notes: readMultiline(body, 'notes', 'Notes', 1000), ...(signOff ? { signedOffById: context.actorUserId, signedOffAt: new Date() } : {}) },
    update: { items, notes: readMultiline(body, 'notes', 'Notes', 1000) ?? existing?.notes ?? null, ...(signOff ? { signedOffById: context.actorUserId, signedOffAt: new Date() } : body.signOff === false ? { signedOffById: null, signedOffAt: null } : {}) },
  });
  await writeFinAudit({ ...context, entityType: 'FinCloseChecklist', entityId: saved.id, action: signOff ? 'SIGN_OFF' : 'UPDATE', after: { done: items.filter((item) => item.done).length } });
  return { id: saved.id };
};

// ---------------------------------------------------------------------------
// Year-end close
// ---------------------------------------------------------------------------

export const getYearClose = async (yearId: string) => {
  const year = await prisma.finFinancialYear.findUnique({ where: { id: yearId }, include: { periods: { orderBy: { startDate: 'asc' } } } });
  if (!year) throw notFound('Financial year not found.');
  const [close, drafts, pnl, nextYear] = await Promise.all([
    prisma.finYearClose.findUnique({ where: { yearId } }),
    prisma.finVoucher.count({ where: { status: { in: ['DRAFT', 'PENDING_APPROVAL'] }, date: { gte: year.startDate, lte: year.endDate } } }),
    prisma.finVoucherLine.groupBy({ by: ['accountId'], where: { account: { group: { nature: { in: ['INCOME', 'EXPENSE'] } } }, voucher: { status: { in: LEDGER_STATUSES }, date: { gte: year.startDate, lte: year.endDate }, NOT: { sourceType: 'YEAR_CLOSE' } } }, _sum: { debit: true, credit: true } }),
    prisma.finFinancialYear.findFirst({ where: { startDate: new Date(year.endDate.getTime() + 86400000) }, select: { id: true, label: true } }),
  ]);
  const profit = round(pnl.reduce((sum, row) => sum + num(row._sum.credit) - num(row._sum.debit), 0));
  const openMonths = year.periods.filter((period) => period.status === 'OPEN').length;
  const lastLocked = year.periods[year.periods.length - 1]?.status === 'LOCKED';
  const closingVoucher = close ? await prisma.finVoucher.findUnique({ where: { id: close.voucherId }, select: { id: true, number: true, status: true } }) : null;
  return {
    year: { id: year.id, label: year.label, startDate: dateOnly(year.startDate), endDate: dateOnly(year.endDate), status: year.status, closedAt: year.closedAt },
    periods: year.periods.map((period) => ({ id: period.id, label: period.label, status: period.status })),
    profit,
    gates: [
      { key: 'months', label: 'Every month soft-closed or locked', ok: openMonths === 0, detail: `${openMonths} still open` },
      { key: 'drafts', label: 'No drafts or pending vouchers in the year', ok: drafts === 0, detail: `${drafts}` },
      { key: 'last-month', label: 'March is not locked yet (the closing entry is dated 31 March)', ok: !lastLocked || Boolean(close), detail: lastLocked ? 'locked' : 'open for closing' },
      { key: 'next-year', label: 'Next financial year exists', ok: Boolean(nextYear), detail: nextYear?.label ?? 'create it in Financial Year & Periods' },
    ],
    close: close && !close.reopenedAt ? { at: close.closedAt, profit: num(close.profit), voucher: closingVoucher } : null,
  };
};

/** Transfers the year's profit to retained earnings (zeroing income and expense ledgers at year end). */
export const closeYear = async (yearId: string, access: LedgerAccess) => {
  const state = await getYearClose(yearId);
  if (state.close) throw conflict('This year is already closed.');
  const failing = state.gates.filter((gate) => !gate.ok);
  if (failing.length) throw badRequest(`Not ready to close: ${failing.map((gate) => gate.label).join('; ')}.`);
  return prisma.$transaction(async (tx) => {
    const year = await tx.finFinancialYear.findUniqueOrThrow({ where: { id: yearId } });
    const retained = await tx.finAccount.findUnique({ where: { systemKey: 'RETAINED_EARNINGS' }, select: { id: true } });
    if (!retained) throw badRequest('Retained Earnings ledger is missing.');
    const rows = await tx.finVoucherLine.groupBy({ by: ['accountId'], where: { account: { group: { nature: { in: ['INCOME', 'EXPENSE'] } } }, voucher: { status: { in: LEDGER_STATUSES }, date: { gte: year.startDate, lte: year.endDate } } }, _sum: { debit: true, credit: true } });
    const lines = rows.map((row) => ({ accountId: row.accountId, net: roundMoney((row._sum.debit ?? ZERO).minus(row._sum.credit ?? ZERO)) })).filter((row) => !row.net.isZero())
      .map((row) => (row.net.greaterThan(0) ? vline(row.accountId, ZERO, row.net, { narration: 'Year-end close' }) : vline(row.accountId, row.net.negated(), ZERO, { narration: 'Year-end close' })));
    if (!lines.length) throw badRequest('No income or expense to close.');
    const profit = roundMoney(lines.reduce((sum, line) => sum.plus(line.debit).minus(line.credit), ZERO));
    lines.push(profit.greaterThan(0) ? vline(retained.id, ZERO, profit, { narration: `Profit for ${year.label}` }) : vline(retained.id, profit.negated(), ZERO, { narration: `Loss for ${year.label}` }));
    if (lines.length > 199) throw badRequest('Too many ledgers for one closing entry.');
    const voucher = await postSystemVoucher(tx, { type: 'JOURNAL', date: year.endDate, narration: `Year-end close ${year.label}: profit transferred to retained earnings`, lines, sourceType: 'YEAR_CLOSE', sourceId: year.id, sourceEvent: 'CLOSE' }, { ...access, canPostSoftClosed: true });
    await tx.finYearClose.upsert({ where: { yearId }, create: { yearId, voucherId: voucher.id, profit, closedById: access.actor.actorUserId }, update: { voucherId: voucher.id, profit, closedById: access.actor.actorUserId, closedAt: new Date(), reopenedAt: null, reopenedById: null } });
    await tx.finFinancialYear.update({ where: { id: yearId }, data: { closedAt: new Date(), closedById: access.actor.actorUserId, status: 'SOFT_CLOSED' } });
    const next = await tx.finFinancialYear.findFirst({ where: { startDate: new Date(year.endDate.getTime() + 86400000) } });
    if (next && year.isCurrent) {
      await tx.finFinancialYear.update({ where: { id: year.id }, data: { isCurrent: false } });
      await tx.finFinancialYear.update({ where: { id: next.id }, data: { isCurrent: true } });
    }
    await writeFinAudit({ ...access.actor, entityType: 'FinFinancialYear', entityId: yearId, action: 'YEAR_CLOSE', after: { profit: profit.toNumber(), number: voucher.number } }, tx);
    return { yearId, number: voucher.number, profit: profit.toNumber() };
  }, { timeout: 60000 });
};

export const reopenYear = async (yearId: string, body: Record<string, unknown>, access: LedgerAccess) => {
  const reason = readMultiline(body, 'reason', 'Reason', 500);
  if (!reason) throw badRequest('A reason is required to reopen a closed year.');
  return prisma.$transaction(async (tx) => {
    const close = await tx.finYearClose.findUnique({ where: { yearId } });
    if (!close || close.reopenedAt) throw badRequest('This year is not closed.');
    const voucher = await tx.finVoucher.findUnique({ where: { id: close.voucherId }, include: lockedInclude });
    if (voucher?.status === 'POSTED') await reverseInTx(tx, voucher, { ...access, canPostSoftClosed: true }, `Year reopened: ${reason}`, voucher.date, { allowSystem: true });
    await tx.finYearClose.update({ where: { yearId }, data: { reopenedAt: new Date(), reopenedById: access.actor.actorUserId } });
    await tx.finFinancialYear.update({ where: { id: yearId }, data: { closedAt: null, closedById: null, status: 'OPEN' } });
    await writeFinAudit({ ...access.actor, entityType: 'FinFinancialYear', entityId: yearId, action: 'YEAR_REOPEN', reason }, tx);
    return { yearId, status: 'OPEN' };
  }, { timeout: 60000 });
};

// ---------------------------------------------------------------------------
// CA queries
// ---------------------------------------------------------------------------

type Response = { byId: string | null; byName: string | null; at: string; text: string; fileUrl: string | null };

export const listQueries = async (query: Record<string, unknown>) => {
  const items = await prisma.finCaQuery.findMany({
    where: { ...(typeof query.status === 'string' && query.status ? { status: query.status as FinQueryStatus } : {}), ...(typeof query.entityId === 'string' && query.entityId ? { entityId: query.entityId } : {}) },
    orderBy: [{ status: 'asc' }, { dueDate: 'asc' }, { createdAt: 'desc' }],
    take: 500,
  });
  const name = await userNames(items.flatMap((item) => [item.raisedById, item.assignedToId, item.closedById]));
  const today = istToday();
  return items.map((item) => ({ ...item, dueDate: dateOnly(item.dueDate), raisedBy: name(item.raisedById), assignedTo: name(item.assignedToId), closedBy: name(item.closedById), overdue: item.status !== 'CLOSED' && Boolean(item.dueDate && item.dueDate < today), responses: item.responses as unknown as Response[] }));
};

export const raiseQuery = async (body: Record<string, unknown>, context: ActorContext) => {
  const description = readMultiline(body, 'description', 'Question', 4000);
  if (!description) throw badRequest('Describe the query.');
  const item = await prisma.finCaQuery.create({
    data: {
      title: readString(body, 'title', 'Title', { max: 200, required: true })!, description,
      category: readString(body, 'category', 'Category', { max: 60 }), priority: readEnum(body, 'priority', 'Priority', ['LOW', 'NORMAL', 'HIGH'], 'NORMAL'),
      financialYear: readString(body, 'financialYear', 'Financial year', { max: 20 }), entityType: readString(body, 'entityType', 'Linked record', { max: 40 }), entityId: readString(body, 'entityId', 'Linked record id', { max: 60 }),
      dueDate: readDate(body, 'dueDate', 'Due date'), raisedById: context.actorUserId, assignedToId: readString(body, 'assignedToId', 'Assigned to', { max: 60 }),
    },
  });
  await writeFinAudit({ ...context, entityType: 'FinCaQuery', entityId: item.id, action: 'RAISE', after: { title: item.title } });
  return { id: item.id };
};

export const respondQuery = async (id: string, body: Record<string, unknown>, context: ActorContext) => {
  const item = await prisma.finCaQuery.findUnique({ where: { id } });
  if (!item) throw notFound('Query not found.');
  if (item.status === 'CLOSED') throw badRequest('This query is closed.');
  const text = readMultiline(body, 'text', 'Reply', 4000);
  if (!text) throw badRequest('Write a reply.');
  const fileUrl = readString(body, 'fileUrl', 'Evidence', { max: 1000 });
  const name = await userNames([context.actorUserId]);
  const responses = [...(item.responses as unknown as Response[]), { byId: context.actorUserId, byName: name(context.actorUserId), at: new Date().toISOString(), text, fileUrl }];
  const status: FinQueryStatus = item.raisedById && item.raisedById === context.actorUserId ? 'OPEN' : 'ANSWERED';
  await prisma.finCaQuery.update({ where: { id }, data: { responses, status } });
  await writeFinAudit({ ...context, entityType: 'FinCaQuery', entityId: id, action: 'RESPOND' });
  return { id, status };
};

export const closeQuery = async (id: string, body: Record<string, unknown>, context: ActorContext) => {
  const item = await prisma.finCaQuery.findUnique({ where: { id } });
  if (!item) throw notFound('Query not found.');
  const reopen = body.reopen === true;
  await prisma.finCaQuery.update({ where: { id }, data: reopen ? { status: 'OPEN', closedById: null, closedAt: null } : { status: 'CLOSED', closedById: context.actorUserId, closedAt: new Date() } });
  await writeFinAudit({ ...context, entityType: 'FinCaQuery', entityId: id, action: reopen ? 'REOPEN' : 'CLOSE' });
  return { id, status: reopen ? 'OPEN' : 'CLOSED' };
};

// ---------------------------------------------------------------------------
// Accounting review
// ---------------------------------------------------------------------------

/** Posted vouchers to review: manual entries, large amounts, suspense or flagged ones. */
export const getReviewQueue = async (query: Record<string, unknown>) => {
  const to = readDate(query, 'to', 'To') ?? istToday();
  const from = readDate(query, 'from', 'From') ?? new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), 1));
  const minAmount = readInt(query, 'minAmount', 'Minimum amount', { min: 0, max: 1000000000 }) ?? 0;
  const scope = typeof query.scope === 'string' ? query.scope : 'manual';
  const suspense = await prisma.finAccount.findUnique({ where: { systemKey: 'SUSPENSE' }, select: { id: true } });
  const vouchers = await prisma.finVoucher.findMany({
    where: {
      status: { in: ['POSTED', 'REVERSED'] }, date: { gte: from, lte: to }, totalAmount: { gte: minAmount },
      ...(scope === 'manual' ? { sourceType: null } : scope === 'suspense' && suspense ? { lines: { some: { accountId: suspense.id } } } : {}),
    },
    select: { id: true, number: true, type: true, date: true, narration: true, totalAmount: true, sourceType: true, createdById: true, postedById: true, approvedById: true, status: true },
    orderBy: [{ totalAmount: 'desc' }],
    take: 500,
  });
  const reviews = await prisma.finVoucherReview.findMany({ where: { voucherId: { in: vouchers.map((voucher) => voucher.id) } } });
  const name = await userNames([...vouchers.flatMap((voucher) => [voucher.createdById, voucher.postedById]), ...reviews.map((review) => review.reviewedById)]);
  const rows = vouchers.map((voucher) => {
    const review = reviews.find((item) => item.voucherId === voucher.id);
    return { ...voucher, date: dateOnly(voucher.date), totalAmount: num(voucher.totalAmount), createdBy: name(voucher.createdById), postedBy: name(voucher.postedById), selfApproved: Boolean(voucher.createdById && voucher.createdById === voucher.postedById), review: review ? { ...review, reviewedBy: name(review.reviewedById) } : null };
  });
  const filtered = query.status === 'pending' ? rows.filter((row) => !row.review) : query.status === 'flagged' ? rows.filter((row) => row.review?.status === 'FLAGGED') : rows;
  return { from: dateOnly(from), to: dateOnly(to), counts: { total: rows.length, reviewed: rows.filter((row) => row.review?.status === 'REVIEWED').length, flagged: rows.filter((row) => row.review?.status === 'FLAGGED').length, pending: rows.filter((row) => !row.review).length }, rows: filtered };
};

export const reviewVoucher = async (voucherId: string, body: Record<string, unknown>, context: ActorContext) => {
  const voucher = await prisma.finVoucher.findUnique({ where: { id: voucherId }, select: { id: true, number: true, status: true } });
  if (!voucher || (voucher.status !== 'POSTED' && voucher.status !== 'REVERSED')) throw badRequest('Only posted vouchers are reviewed.');
  const status = readEnum(body, 'status', 'Result', ['REVIEWED', 'FLAGGED']);
  const note = readMultiline(body, 'note', 'Note', 2000);
  if (status === 'FLAGGED' && !note) throw badRequest('Say what is wrong with the entry.');
  let queryId: string | null = null;
  if (status === 'FLAGGED') queryId = (await raiseQuery({ title: `Voucher ${voucher.number}: please check`, description: note, category: 'Accounting review', entityType: 'FinVoucher', entityId: voucherId, priority: 'NORMAL' }, context)).id;
  await prisma.finVoucherReview.upsert({ where: { voucherId }, create: { voucherId, status, note, queryId, reviewedById: context.actorUserId }, update: { status, note, ...(queryId ? { queryId } : {}), reviewedById: context.actorUserId, reviewedAt: new Date() } });
  await writeFinAudit({ ...context, entityType: 'FinVoucherReview', entityId: voucherId, action: status, reason: note });
  return { voucherId, status, queryId };
};

// ---------------------------------------------------------------------------
// CA dashboard
// ---------------------------------------------------------------------------

export const getCaDashboard = async () => {
  const today = istToday();
  const year = await prisma.finFinancialYear.findFirst({ where: { isCurrent: true }, include: { periods: { orderBy: { startDate: 'asc' } } } }) ?? await prisma.finFinancialYear.findFirst({ orderBy: { startDate: 'desc' }, include: { periods: { orderBy: { startDate: 'asc' } } } });
  const [checklists, openQueries, overdueQueries, documents, reviews, recent, alerts] = await Promise.all([
    year ? prisma.finCloseChecklist.findMany({ where: { periodId: { in: year.periods.map((period) => period.id) } }, select: { periodId: true, signedOffAt: true } }) : [],
    prisma.finCaQuery.count({ where: { status: { not: 'CLOSED' } } }),
    prisma.finCaQuery.count({ where: { status: { not: 'CLOSED' }, dueDate: { lt: today } } }),
    prisma.finVaultDocument.count({ where: { isArchived: false } }),
    prisma.finVoucherReview.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.finAuditLog.findMany({ orderBy: { createdAt: 'desc' }, take: 15, select: { id: true, entityType: true, action: true, createdAt: true, actorUserId: true } }),
    getAlerts(),
  ]);
  const name = await userNames(recent.map((item) => item.actorUserId));
  return {
    year: year ? { id: year.id, label: year.label, status: year.status } : null,
    months: (year?.periods ?? []).map((period) => ({ id: period.id, label: period.label, status: period.status, signedOff: Boolean(checklists.find((item) => item.periodId === period.id)?.signedOffAt), past: period.endDate < today })),
    queries: { open: openQueries, overdue: overdueQueries },
    documents,
    reviews: Object.fromEntries(reviews.map((row) => [row.status, row._count._all])),
    alerts: alerts.alerts,
    recent: recent.map((item) => ({ ...item, actor: name(item.actorUserId) })),
  };
};
