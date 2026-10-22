import { FinRecurringFrequency, FinRecurringMode, Prisma } from '@prisma/client';
import prisma from '../../../lib/prisma';
import { badRequest, FinHttpError, notFound } from '../http';
import { financialYearOf, istToday } from '../utils/fy';
import { dateOnly, readBoolean, readDate, readEnum, readInt, readMoney, readMultiline, readRate, readString } from '../utils/input';
import { roundMoney } from '../utils/money';
import { writeFinAudit } from './audit.service';
import type { ActorContext } from './context';
import { firstRecurringDate, nextRecurringDate, recurringPeriodKey } from './assetsRules';
import { createDocument } from './documents.service';
import { CASH_BANK_KINDS, LEDGER_STATUSES } from './ledgerRules';
import { createVoucher, type LedgerAccess } from './ledger.service';
import { postSystemVoucher, vline } from './systemVoucher';

// Expense register (from the books), recurring expenses and employee reimbursements.

const ZERO = new Prisma.Decimal(0);
const num = (value: Prisma.Decimal | null | undefined) => (value ? value.toNumber() : 0);

/** Posted lines on expense ledgers, with totals per ledger. */
export const getExpenseRegister = async (query: Record<string, unknown>) => {
  const to = readDate(query, 'to', 'To') ?? istToday();
  const from = readDate(query, 'from', 'From') ?? financialYearOf(to).startDate;
  const page = Math.max(Number.parseInt(String(query.page || '1'), 10) || 1, 1);
  const pageSize = Math.min(Math.max(Number.parseInt(String(query.pageSize || '50'), 10) || 50, 1), 200);
  const q = typeof query.q === 'string' ? query.q.trim().slice(0, 60) : '';
  const where: Prisma.FinVoucherLineWhereInput = {
    account: { group: { nature: 'EXPENSE' } },
    ...(typeof query.accountId === 'string' && query.accountId ? { accountId: query.accountId } : {}),
    ...(typeof query.costCentreId === 'string' && query.costCentreId ? { costCentreId: query.costCentreId } : {}),
    ...(typeof query.sellAccountId === 'string' && query.sellAccountId ? { sellAccountId: query.sellAccountId } : {}),
    voucher: { status: { in: LEDGER_STATUSES }, date: { gte: from, lte: to }, ...(q ? { OR: [{ narration: { contains: q, mode: 'insensitive' } }, { number: { contains: q, mode: 'insensitive' } }, { reference: { contains: q, mode: 'insensitive' } }] } : {}) },
  };
  const [lines, total, byAccount] = await Promise.all([
    prisma.finVoucherLine.findMany({
      where,
      include: { voucher: { select: { id: true, number: true, date: true, type: true, narration: true, reference: true, sourceType: true } }, account: { select: { code: true, name: true } }, party: { select: { name: true } }, costCentre: { select: { name: true } } },
      orderBy: [{ voucher: { date: 'desc' } }, { lineNo: 'asc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.finVoucherLine.count({ where }),
    prisma.finVoucherLine.groupBy({ by: ['accountId'], where, _sum: { debit: true, credit: true } }),
  ]);
  const accounts = await prisma.finAccount.findMany({ where: { id: { in: byAccount.map((row) => row.accountId) } }, select: { id: true, code: true, name: true } });
  const ledgers = byAccount.map((row) => {
    const account = accounts.find((item) => item.id === row.accountId)!;
    return { accountId: row.accountId, code: account.code, name: account.name, amount: roundMoney((row._sum.debit ?? ZERO).minus(row._sum.credit ?? ZERO)).toNumber() };
  }).sort((a, b) => b.amount - a.amount);
  return {
    from: dateOnly(from), to: dateOnly(to), total, page, pageSize,
    grandTotal: roundMoney(ledgers.reduce((sum, row) => sum.plus(row.amount), ZERO)).toNumber(),
    ledgers,
    rows: lines.map((line) => ({
      id: line.id, date: dateOnly(line.voucher.date), voucherId: line.voucher.id, voucherNumber: line.voucher.number, voucherType: line.voucher.type, source: line.voucher.sourceType,
      narration: line.narration ?? line.voucher.narration, reference: line.voucher.reference, account: `${line.account.code} · ${line.account.name}`,
      party: line.party?.name ?? null, costCentre: line.costCentre?.name ?? null, amount: roundMoney(line.debit.minus(line.credit)).toNumber(),
    })),
  };
};

// ---------------------------------------------------------------------------
// Recurring expenses
// ---------------------------------------------------------------------------

const recurringInput = async (body: Record<string, unknown>) => {
  const accountId = readString(body, 'accountId', 'Expense ledger', { max: 60, required: true })!;
  const account = await prisma.finAccount.findUnique({ where: { id: accountId }, select: { isActive: true, allowManualPosting: true, group: { select: { nature: true } } } });
  if (!account?.isActive || !account.allowManualPosting || account.group.nature !== 'EXPENSE') throw badRequest('Choose an active expense ledger.');
  const mode = readEnum(body, 'mode', 'Creates', Object.values(FinRecurringMode), 'ACCRUAL');
  const partyId = readString(body, 'partyId', 'Supplier', { max: 60 });
  if (mode === 'BILL' && !partyId) throw badRequest('A draft purchase bill needs the supplier.');
  const amount = readMoney(body, 'amount', 'Amount') ?? ZERO;
  if (!amount.greaterThan(0)) throw badRequest('Amount must be more than zero.');
  const dayOfMonth = readInt(body, 'dayOfMonth', 'Day of month', { min: 1, max: 31 }) ?? 1;
  const startDate = readDate(body, 'startDate', 'Start date', true)!;
  const endDate = readDate(body, 'endDate', 'End date');
  if (endDate && endDate < startDate) throw badRequest('End date is before the start date.');
  return {
    name: readString(body, 'name', 'Name', { max: 160, required: true })!,
    mode, partyId, accountId, amount,
    gstRate: mode === 'BILL' ? readRate(body, 'gstRate', 'GST rate') ?? ZERO : ZERO,
    frequency: readEnum(body, 'frequency', 'Frequency', Object.values(FinRecurringFrequency), 'MONTHLY'),
    dayOfMonth, startDate, endDate,
    isActive: readBoolean(body, 'isActive', true),
    notes: readMultiline(body, 'notes', 'Notes', 1000),
  };
};

export const listRecurring = async () => {
  const items = await prisma.finRecurringExpense.findMany({ include: { runs: { orderBy: { runDate: 'desc' }, take: 6 } }, orderBy: [{ isActive: 'desc' }, { nextRunDate: 'asc' }] });
  const [accounts, parties] = await Promise.all([
    prisma.finAccount.findMany({ where: { id: { in: items.map((item) => item.accountId) } }, select: { id: true, code: true, name: true } }),
    prisma.finParty.findMany({ where: { id: { in: items.flatMap((item) => (item.partyId ? [item.partyId] : [])) } }, select: { id: true, name: true } }),
  ]);
  const today = istToday();
  return items.map((item) => ({
    ...item,
    amount: num(item.amount), gstRate: num(item.gstRate), startDate: dateOnly(item.startDate), endDate: dateOnly(item.endDate), nextRunDate: dateOnly(item.nextRunDate),
    account: accounts.find((account) => account.id === item.accountId) ?? null,
    party: parties.find((party) => party.id === item.partyId) ?? null,
    due: item.isActive && item.nextRunDate <= today && (!item.endDate || item.nextRunDate <= item.endDate),
    runs: item.runs.map((run) => ({ ...run, runDate: dateOnly(run.runDate) })),
  }));
};

export const saveRecurring = async (id: string | null, body: Record<string, unknown>, context: ActorContext) => {
  const data = await recurringInput(body);
  if (id) {
    const existing = await prisma.finRecurringExpense.findUnique({ where: { id } });
    if (!existing) throw notFound('Recurring expense not found.');
    const restart = existing.startDate.getTime() !== data.startDate.getTime() || existing.dayOfMonth !== data.dayOfMonth;
    await prisma.finRecurringExpense.update({ where: { id }, data: { ...data, ...(restart ? { nextRunDate: firstRecurringDate(data.startDate, data.dayOfMonth) } : {}) } });
    await writeFinAudit({ ...context, entityType: 'FinRecurringExpense', entityId: id, action: 'UPDATE', after: { amount: data.amount.toNumber(), active: data.isActive } });
    return { id };
  }
  const item = await prisma.finRecurringExpense.create({ data: { ...data, nextRunDate: firstRecurringDate(data.startDate, data.dayOfMonth), createdById: context.actorUserId } });
  await writeFinAudit({ ...context, entityType: 'FinRecurringExpense', entityId: item.id, action: 'CREATE', after: { name: item.name, amount: data.amount.toNumber() } });
  return { id: item.id };
};

/**
 * Creates the drafts for every period due up to `asOf` (catching up missed ones). A period is
 * created once: the run table is unique per item and due date.
 */
export const generateDueRecurring = async (body: Record<string, unknown>, access: LedgerAccess) => {
  const asOf = readDate(body, 'asOf', 'As of') ?? istToday();
  const items = await prisma.finRecurringExpense.findMany({ where: { isActive: true, nextRunDate: { lte: asOf } } });
  const expensesPayable = await prisma.finAccount.findUnique({ where: { systemKey: 'EXPENSES_PAYABLE' }, select: { id: true } });
  const created: Array<{ id: string; name: string; date: string; kind: 'BILL' | 'VOUCHER' }> = [];
  const failed: Array<{ name: string; error: string }> = [];
  for (const item of items) {
    let next = item.nextRunDate;
    for (let guard = 0; guard < 24 && next <= asOf && (!item.endDate || next <= item.endDate); guard += 1) {
      const periodKey = recurringPeriodKey(next);
      try {
        if (await prisma.finRecurringRun.findUnique({ where: { recurringId_periodKey: { recurringId: item.id, periodKey } } })) {
          next = nextRecurringDate(next, item.frequency, item.dayOfMonth);
          continue;
        }
        const date = dateOnly(next)!;
        let documentId: string | null = null;
        let voucherId: string | null = null;
        if (item.mode === 'BILL') {
          const document = await createDocument({
            docType: 'PURCHASE_BILL', date, partyId: item.partyId, partyDocNumber: `REC-${periodKey}`, notes: `Recurring: ${item.name}. Replace the bill number with the supplier's.`,
            lines: [{ description: item.name, accountId: item.accountId, quantity: 1, rate: item.amount.toFixed(2), gstRate: item.gstRate.toFixed(2) }],
          }, access, ['PURCHASE_BILL']);
          documentId = document.id;
        } else {
          if (!expensesPayable) throw badRequest('Expenses Payable ledger is missing.');
          const draft = await createVoucher({ type: 'JOURNAL', date, narration: `${item.name} for ${date} (recurring)`, reference: `REC-${periodKey}`, lines: [
            { accountId: item.accountId, debit: item.amount.toFixed(2), credit: null },
            { accountId: expensesPayable.id, debit: null, credit: item.amount.toFixed(2) },
          ] }, access);
          voucherId = draft.id;
        }
        await prisma.finRecurringRun.create({ data: { recurringId: item.id, periodKey, runDate: next, documentId, voucherId, createdById: access.actor.actorUserId } });
        created.push({ id: (documentId ?? voucherId)!, name: item.name, date, kind: documentId ? 'BILL' : 'VOUCHER' });
        next = nextRecurringDate(next, item.frequency, item.dayOfMonth);
      } catch (error) {
        failed.push({ name: item.name, error: (error as Error).message });
        break;
      }
    }
    if (next.getTime() !== item.nextRunDate.getTime()) await prisma.finRecurringExpense.update({ where: { id: item.id }, data: { nextRunDate: next } });
  }
  if (created.length) await writeFinAudit({ ...access.actor, entityType: 'FinRecurringExpense', entityId: 'batch', action: 'GENERATE', after: { created: created.length, failed: failed.length } });
  return { created, failed };
};

// ---------------------------------------------------------------------------
// Employee reimbursements
// ---------------------------------------------------------------------------

export const listReimbursements = async (query: Record<string, unknown>) => {
  const items = await prisma.finReimbursement.findMany({
    where: { ...(typeof query.status === 'string' && query.status ? { status: query.status as never } : {}) },
    orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
    take: 500,
  });
  const [parties, accounts, vouchers, users] = await Promise.all([
    prisma.finParty.findMany({ where: { id: { in: items.map((item) => item.partyId) } }, select: { id: true, code: true, name: true } }),
    prisma.finAccount.findMany({ where: { id: { in: items.map((item) => item.accountId) } }, select: { id: true, code: true, name: true } }),
    prisma.finVoucher.findMany({ where: { id: { in: items.flatMap((item) => [item.approvalVoucherId, item.paymentVoucherId].filter((id): id is string => Boolean(id))) } }, select: { id: true, number: true } }),
    prisma.user.findMany({ where: { id: { in: items.flatMap((item) => [item.createdById, item.approvedById].filter((id): id is string => Boolean(id))) } }, select: { id: true, name: true } }),
  ]);
  return items.map((item) => ({
    ...item,
    date: dateOnly(item.date),
    amount: num(item.amount),
    party: parties.find((party) => party.id === item.partyId) ?? null,
    account: accounts.find((account) => account.id === item.accountId) ?? null,
    approvalVoucherNumber: vouchers.find((voucher) => voucher.id === item.approvalVoucherId)?.number ?? null,
    paymentVoucherNumber: vouchers.find((voucher) => voucher.id === item.paymentVoucherId)?.number ?? null,
    createdBy: users.find((user) => user.id === item.createdById)?.name ?? null,
    approvedBy: users.find((user) => user.id === item.approvedById)?.name ?? null,
  }));
};

export const submitReimbursement = async (body: Record<string, unknown>, context: ActorContext) => {
  const partyId = readString(body, 'partyId', 'Employee', { max: 60, required: true })!;
  const party = await prisma.finParty.findUnique({ where: { id: partyId }, select: { types: true } });
  if (!party) throw badRequest('Employee not found.');
  if (!party.types.includes('EMPLOYEE')) throw badRequest('Reimbursements are for parties of type Employee (set the type in Party Ledgers).');
  const accountId = readString(body, 'accountId', 'Expense ledger', { max: 60, required: true })!;
  const account = await prisma.finAccount.findUnique({ where: { id: accountId }, select: { isActive: true, group: { select: { nature: true } } } });
  if (!account?.isActive || account.group.nature !== 'EXPENSE') throw badRequest('Choose an active expense ledger.');
  const amount = readMoney(body, 'amount', 'Amount') ?? ZERO;
  if (!amount.greaterThan(0)) throw badRequest('Amount must be more than zero.');
  const description = readMultiline(body, 'description', 'Description', 1000);
  if (!description) throw badRequest('Describe the expense.');
  const receiptUrl = readString(body, 'receiptUrl', 'Receipt link', { max: 500 });
  if (receiptUrl && !/^https?:\/\//i.test(receiptUrl)) throw badRequest('Receipt link must start with http(s)://');
  const item = await prisma.finReimbursement.create({ data: { partyId, date: readDate(body, 'date', 'Expense date', true)!, accountId, amount, description, receiptUrl, createdById: context.actorUserId } });
  await writeFinAudit({ ...context, entityType: 'FinReimbursement', entityId: item.id, action: 'SUBMIT', after: { amount: amount.toNumber() } });
  return { id: item.id };
};

const lockClaim = async (tx: Prisma.TransactionClient, id: string) => {
  await tx.$queryRaw`SELECT id FROM "FinReimbursement" WHERE id = ${id} FOR UPDATE`;
  const item = await tx.finReimbursement.findUnique({ where: { id } });
  if (!item) throw notFound('Claim not found.');
  return item;
};

/** Approval books the expense against Reimbursements Payable (maker-checker: not your own claim). */
export const approveReimbursement = async (id: string, access: LedgerAccess) =>
  prisma.$transaction(async (tx) => {
    const item = await lockClaim(tx, id);
    if (item.status !== 'SUBMITTED') throw badRequest('Only submitted claims can be approved.');
    if (item.createdById && item.createdById === access.actor.actorUserId && !access.isSuperAdmin) throw new FinHttpError(403, 'Maker-checker: you cannot approve a claim you entered.');
    const payable = await tx.finAccount.findUnique({ where: { systemKey: 'REIMBURSEMENTS_PAYABLE' }, select: { id: true } });
    if (!payable) throw badRequest('Reimbursements Payable ledger is missing.');
    const voucher = await postSystemVoucher(tx, {
      type: 'JOURNAL', date: item.date, narration: `Reimbursement approved: ${item.description}`.slice(0, 1000), partyId: item.partyId,
      lines: [vline(item.accountId, item.amount, ZERO), vline(payable.id, ZERO, item.amount, { partyId: item.partyId })],
      sourceType: 'REIMBURSEMENT', sourceId: item.id, sourceEvent: 'APPROVE', idempotencyKey: `reimbursement:${item.id}:approve`,
    }, access);
    await tx.finReimbursement.update({ where: { id }, data: { status: 'APPROVED', approvalVoucherId: voucher.id, approvedById: access.actor.actorUserId, approvedAt: new Date() } });
    await writeFinAudit({ ...access.actor, entityType: 'FinReimbursement', entityId: id, action: 'APPROVE', after: { number: voucher.number } }, tx);
    return { id, status: 'APPROVED', number: voucher.number };
  }, { timeout: 30000 });

export const rejectReimbursement = async (id: string, body: Record<string, unknown>, context: ActorContext) => {
  const reason = readMultiline(body, 'reason', 'Reason', 500);
  if (!reason) throw badRequest('A reason is required.');
  const item = await prisma.finReimbursement.findUnique({ where: { id } });
  if (!item) throw notFound('Claim not found.');
  if (item.status !== 'SUBMITTED') throw badRequest('Only submitted claims can be rejected.');
  await prisma.finReimbursement.update({ where: { id }, data: { status: 'REJECTED', rejectReason: reason } });
  await writeFinAudit({ ...context, entityType: 'FinReimbursement', entityId: id, action: 'REJECT', reason });
  return { id, status: 'REJECTED' };
};

export const payReimbursement = async (id: string, body: Record<string, unknown>, access: LedgerAccess) => {
  const bankAccountId = readString(body, 'bankAccountId', 'Paid from', { max: 60, required: true })!;
  const date = readDate(body, 'date', 'Payment date') ?? istToday();
  const reference = readString(body, 'reference', 'Reference', { max: 80 });
  return prisma.$transaction(async (tx) => {
    const item = await lockClaim(tx, id);
    if (item.status !== 'APPROVED') throw badRequest('Only approved claims can be paid.');
    const [bank, payable] = await Promise.all([tx.finAccount.findUnique({ where: { id: bankAccountId }, select: { kind: true, isActive: true } }), tx.finAccount.findUnique({ where: { systemKey: 'REIMBURSEMENTS_PAYABLE' }, select: { id: true } })]);
    if (!bank?.isActive || !CASH_BANK_KINDS.includes(bank.kind)) throw badRequest('Choose a bank or cash account.');
    const voucher = await postSystemVoucher(tx, {
      type: 'PAYMENT', date, narration: `Reimbursement paid: ${item.description}`.slice(0, 1000), reference, partyId: item.partyId,
      lines: [vline(payable!.id, item.amount, ZERO, { partyId: item.partyId }), vline(bankAccountId, ZERO, item.amount)],
      sourceType: 'REIMBURSEMENT', sourceId: item.id, sourceEvent: 'PAY', idempotencyKey: `reimbursement:${item.id}:pay`,
    }, access);
    await tx.finReimbursement.update({ where: { id }, data: { status: 'PAID', paymentVoucherId: voucher.id, paidById: access.actor.actorUserId, paidAt: new Date() } });
    await writeFinAudit({ ...access.actor, entityType: 'FinReimbursement', entityId: id, action: 'PAY', after: { number: voucher.number } }, tx);
    return { id, status: 'PAID', number: voucher.number };
  }, { timeout: 30000 });
};
