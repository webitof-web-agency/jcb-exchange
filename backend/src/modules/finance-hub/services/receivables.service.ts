import { FinDueSide, FinFollowUpKind, FinPartyType, FinWriteOffKind, Prisma } from '@prisma/client';
import prisma from '../../../lib/prisma';
import { badRequest, notFound } from '../http';
import { financialYearOf, istToday } from '../utils/fy';
import { dateOnly, readDate, readEnum, readMoney, readMultiline, readString } from '../utils/input';
import { roundMoney } from '../utils/money';
import { writeFinAudit } from './audit.service';
import type { ActorContext } from './context';
import { CASH_BANK_KINDS, LEDGER_STATUSES } from './ledgerRules';
import { createVoucher, postVoucher, type LedgerAccess } from './ledger.service';
import { ADVANCE_KEYS, addDays, allocateFifo, BUCKETS, PAYABLE_KEYS, RECEIVABLE_KEYS, type Bucket, type LedgerEntry } from './receivablesRules';
import { buildLedgerRows } from './reportRules';

// Receivables & payables: dues, ageing, party statements, advances, schedules, follow-ups, write-offs.

const ZERO = new Prisma.Decimal(0);
const keysFor = (side: FinDueSide) => (side === 'RECEIVABLE' ? RECEIVABLE_KEYS : PAYABLE_KEYS) as readonly string[];
const readSide = (query: Record<string, unknown>) => readEnum(query, 'side', 'Side', Object.values(FinDueSide), 'RECEIVABLE');
const sumBuckets = (rows: Array<Record<Bucket, number>>) =>
  Object.fromEntries(BUCKETS.map((bucket) => [bucket, roundMoney(rows.reduce((sum, row) => sum.plus(row[bucket]), ZERO)).toNumber()])) as Record<Bucket, number>;

type DueLine = Prisma.FinVoucherLineGetPayload<{ include: { voucher: { select: { id: true; number: true; date: true; reference: true; narration: true; reversalOfId: true; sourceType: true; sourceId: true } } } }>;

/** Posted lines on the side's control ledgers up to `asOf`, with reversed pairs removed. */
const loadDueLines = async (side: FinDueSide, asOf: Date, partyId?: string | null, accountIds?: string[]) => {
  const accounts = await prisma.finAccount.findMany({ where: { systemKey: { in: [...keysFor(side)] } }, select: { id: true, code: true, name: true, systemKey: true } });
  const ids = accountIds?.length ? accounts.filter((account) => accountIds.includes(account.id)).map((account) => account.id) : accounts.map((account) => account.id);
  const lines = await prisma.finVoucherLine.findMany({
    where: { accountId: { in: ids }, ...(partyId ? { partyId } : { partyId: { not: null } }), voucher: { status: { in: LEDGER_STATUSES }, date: { lte: asOf } } },
    include: { voucher: { select: { id: true, number: true, date: true, reference: true, narration: true, reversalOfId: true, sourceType: true, sourceId: true } } },
  });
  // Drop a reversed voucher together with its reversal (both dated on or before asOf).
  const voucherIds = new Set(lines.map((line) => line.voucherId));
  const cancelled = new Set<string>();
  for (const line of lines) {
    if (line.voucher.reversalOfId && voucherIds.has(line.voucher.reversalOfId)) {
      cancelled.add(line.voucherId);
      cancelled.add(line.voucher.reversalOfId);
    }
  }
  return { accounts, lines: lines.filter((line) => !cancelled.has(line.voucherId)) };
};

const toEntries = async (side: FinDueSide, lines: DueLine[], creditDays: Map<string, number>) => {
  const documentIds = lines.flatMap((line) => (line.voucher.sourceType === 'DOCUMENT' && line.voucher.sourceId ? [line.voucher.sourceId] : []));
  const documents = documentIds.length ? await prisma.finDocument.findMany({ where: { id: { in: documentIds } }, select: { id: true, dueDate: true, partyDocNumber: true } }) : [];
  return lines.map((line): LedgerEntry & { partyId: string; accountId: string } => {
    const document = line.voucher.sourceType === 'DOCUMENT' ? documents.find((item) => item.id === line.voucher.sourceId) : undefined;
    const raw = line.debit.minus(line.credit);
    return {
      id: line.id,
      partyId: line.partyId!,
      accountId: line.accountId,
      date: line.voucher.date,
      dueDate: document?.dueDate ?? addDays(line.voucher.date, creditDays.get(line.partyId!) ?? 0),
      ref: line.billRef ?? document?.partyDocNumber ?? line.voucher.reference ?? line.voucher.number ?? '',
      voucherId: line.voucherId,
      voucherNumber: line.voucher.number,
      narration: line.narration ?? line.voucher.narration,
      sellAccountId: line.sellAccountId,
      amount: side === 'RECEIVABLE' ? raw : raw.negated(),
    };
  });
};

/** Customer dues or supplier/partner payables with FIFO open items and ageing buckets. */
export const getDues = async (query: Record<string, unknown>) => {
  const side = readSide(query);
  const asOf = readDate(query, 'asOf', 'As of') ?? istToday();
  const partyId = typeof query.partyId === 'string' && query.partyId ? query.partyId : null;
  const withItems = query.items !== 'false';
  const { accounts, lines } = await loadDueLines(side, asOf, partyId);
  const partyIds = Array.from(new Set(lines.map((line) => line.partyId!)));
  const parties = await prisma.finParty.findMany({ where: { id: { in: partyIds } }, select: { id: true, code: true, name: true, mobile: true, types: true, creditDays: true, creditLimit: true } });
  const creditDays = new Map(parties.map((party) => [party.id, party.creditDays ?? 0]));
  const entries = await toEntries(side, lines, creditDays);

  const rows = parties.map((party) => {
    const perAccount = accounts.map((account) => {
      const result = allocateFifo(entries.filter((entry) => entry.partyId === party.id && entry.accountId === account.id), asOf);
      return { account: { id: account.id, code: account.code, name: account.name, systemKey: account.systemKey }, ...result };
    }).filter((result) => result.items.length || result.unapplied);
    const items = perAccount.flatMap((result) => result.items.map((item) => ({ ...item, account: `${result.account.code} · ${result.account.name}`, accountId: result.account.id })));
    const outstanding = roundMoney(perAccount.reduce((sum, result) => sum.plus(result.outstanding), ZERO)).toNumber();
    const unapplied = roundMoney(perAccount.reduce((sum, result) => sum.plus(result.unapplied), ZERO)).toNumber();
    return {
      party: { id: party.id, code: party.code, name: party.name, mobile: party.mobile, types: party.types, creditDays: party.creditDays, creditLimit: party.creditLimit?.toNumber() ?? null },
      outstanding,
      unapplied,
      net: roundMoney(new Prisma.Decimal(outstanding).minus(unapplied)).toNumber(),
      buckets: sumBuckets(perAccount.map((result) => result.buckets)),
      oldestDays: items.reduce((max, item) => Math.max(max, item.daysOverdue), 0),
      accounts: perAccount.map((result) => ({ ...result.account, outstanding: result.outstanding, unapplied: result.unapplied, net: result.net })),
      items: withItems ? items.sort((a, b) => b.daysOverdue - a.daysOverdue) : [],
    };
  }).filter((row) => row.outstanding || row.unapplied).sort((a, b) => b.net - a.net);
  return {
    side,
    asOf: dateOnly(asOf),
    totals: { outstanding: roundMoney(rows.reduce((sum, row) => sum.plus(row.outstanding), ZERO)).toNumber(), unapplied: roundMoney(rows.reduce((sum, row) => sum.plus(row.unapplied), ZERO)).toNumber(), buckets: sumBuckets(rows.map((row) => row.buckets)), parties: rows.length },
    parties: rows,
  };
};

/** All party-ledger entries of one party with running balance (Dr positive). */
export const getPartyStatement = async (partyId: string, query: Record<string, unknown>) => {
  const party = await prisma.finParty.findUnique({ where: { id: partyId } });
  if (!party) throw notFound('Party not found.');
  const to = readDate(query, 'to', 'To date') ?? istToday();
  const from = readDate(query, 'from', 'From date') ?? financialYearOf(to).startDate;
  if (from > to) throw badRequest('From date is after the to date.');
  const accounts = await prisma.finAccount.findMany({ where: { requiresParty: true }, select: { id: true, code: true, name: true, systemKey: true } });
  const filter: Prisma.FinVoucherLineWhereInput = { partyId, accountId: { in: accounts.map((account) => account.id) } };
  const [openingSums, lines, company] = await Promise.all([
    prisma.finVoucherLine.aggregate({ where: { ...filter, voucher: { status: { in: LEDGER_STATUSES }, date: { lt: from } } }, _sum: { debit: true, credit: true } }),
    prisma.finVoucherLine.findMany({
      where: { ...filter, voucher: { status: { in: LEDGER_STATUSES }, date: { gte: from, lte: to } } },
      include: { voucher: { select: { id: true, number: true, type: true, date: true, narration: true, reference: true, postedAt: true } } },
      orderBy: [{ voucher: { date: 'asc' } }, { voucher: { postedAt: 'asc' } }, { lineNo: 'asc' }],
      take: 5001,
    }),
    prisma.finCompanyProfile.findUnique({ where: { id: 'default' }, select: { legalName: true, tradeName: true, address: true, city: true, state: true, pinCode: true, pan: true, email: true, phone: true } }).catch(() => null),
  ]);
  const accountName = (id: string) => {
    const account = accounts.find((item) => item.id === id);
    return account ? `${account.code} · ${account.name}` : '';
  };
  const opening = (openingSums._sum.debit ?? ZERO).minus(openingSums._sum.credit ?? ZERO);
  const ledger = buildLedgerRows(opening, lines.slice(0, 5000).map((line) => ({
    id: line.id,
    date: line.voucher.date.toISOString().slice(0, 10),
    voucherId: line.voucher.id,
    voucherNumber: line.voucher.number,
    voucherType: line.voucher.type,
    narration: line.voucher.narration,
    lineNarration: line.narration ? `${accountName(line.accountId)} — ${line.narration}` : accountName(line.accountId),
    // The statement is for one party, so this column carries the voucher reference instead.
    partyName: line.voucher.reference,
    debit: line.debit,
    credit: line.credit,
  })));
  return {
    party: { id: party.id, code: party.code, name: party.name, mobile: party.mobile, email: party.email, gstin: party.gstin, pan: party.pan, address: [party.address, party.city, party.state, party.pinCode].filter(Boolean).join(', ') || null },
    company,
    from: dateOnly(from),
    to: dateOnly(to),
    truncated: lines.length > 5000,
    ...ledger,
  };
};

/** Balances per party on receivable, payable and advance ledgers (for party lists). */
export const getPartyBalances = async (query: Record<string, unknown>) => {
  const types = typeof query.types === 'string' ? query.types.split(',').filter((type): type is FinPartyType => (Object.values(FinPartyType) as string[]).includes(type)) : [];
  const accounts = await prisma.finAccount.findMany({ where: { requiresParty: true }, select: { id: true, systemKey: true } });
  const side = (key: string | null) => ((RECEIVABLE_KEYS as readonly string[]).includes(key ?? '') ? 'receivable' : (PAYABLE_KEYS as readonly string[]).includes(key ?? '') ? 'payable' : (ADVANCE_KEYS as readonly string[]).includes(key ?? '') ? 'advances' : 'other');
  const rows = await prisma.finVoucherLine.groupBy({
    by: ['partyId', 'accountId'],
    where: { partyId: types.length ? { in: (await prisma.finParty.findMany({ where: { types: { hasSome: types } }, select: { id: true } })).map((party) => party.id) } : { not: null }, accountId: { in: accounts.map((account) => account.id) }, voucher: { status: { in: LEDGER_STATUSES } } },
    _sum: { debit: true, credit: true },
  });
  const balances = new Map<string, { receivable: number; payable: number; advances: number; other: number; net: number }>();
  for (const row of rows) {
    const key = accounts.find((account) => account.id === row.accountId)?.systemKey ?? null;
    const net = (row._sum.debit ?? ZERO).minus(row._sum.credit ?? ZERO);
    const entry = balances.get(row.partyId!) ?? { receivable: 0, payable: 0, advances: 0, other: 0, net: 0 };
    const bucket = side(key);
    // Receivable shown as Dr-positive; payable as Cr-positive; advances Dr-positive (paid) / negative (held).
    entry[bucket] = roundMoney(new Prisma.Decimal(entry[bucket]).plus(bucket === 'payable' ? net.negated() : net)).toNumber();
    entry.net = roundMoney(new Prisma.Decimal(entry.net).plus(net)).toNumber();
    balances.set(row.partyId!, entry);
  }
  return Object.fromEntries(balances);
};

/** Customer advances, partner deposits, seller and employee advances by party. */
export const getAdvances = async (query: Record<string, unknown>) => {
  const asOf = readDate(query, 'asOf', 'As of') ?? istToday();
  const accounts = await prisma.finAccount.findMany({ where: { systemKey: { in: [...ADVANCE_KEYS] } }, select: { id: true, code: true, name: true, systemKey: true, normalBalance: true } });
  const rows = await prisma.finVoucherLine.groupBy({
    by: ['partyId', 'accountId'],
    where: { accountId: { in: accounts.map((account) => account.id) }, partyId: { not: null }, voucher: { status: { in: LEDGER_STATUSES }, date: { lte: asOf } } },
    _sum: { debit: true, credit: true },
    _max: { createdAt: true },
  });
  const parties = await prisma.finParty.findMany({ where: { id: { in: rows.map((row) => row.partyId!) } }, select: { id: true, code: true, name: true, mobile: true } });
  const result = rows.map((row) => {
    const account = accounts.find((item) => item.id === row.accountId)!;
    const drNet = (row._sum.debit ?? ZERO).minus(row._sum.credit ?? ZERO);
    // HELD: we hold the party's money (customer advance, deposit). PAID: we paid ahead (seller / employee advance).
    const balance = account.normalBalance === 'CR' ? drNet.negated() : drNet;
    return {
      party: parties.find((party) => party.id === row.partyId)!,
      account: { id: account.id, code: account.code, name: account.name, systemKey: account.systemKey },
      direction: account.normalBalance === 'CR' ? 'HELD' : 'PAID',
      balance: roundMoney(balance).toNumber(),
      lastEntryAt: row._max.createdAt,
    };
  }).filter((row) => row.party && row.balance !== 0).sort((a, b) => Math.abs(b.balance) - Math.abs(a.balance));
  const total = (direction: string) => roundMoney(result.filter((row) => row.direction === direction).reduce((sum, row) => sum.plus(row.balance), ZERO)).toNumber();
  return { asOf: dateOnly(asOf), held: total('HELD'), paid: total('PAID'), rows: result };
};

// ---------------------------------------------------------------------------
// Payment schedules
// ---------------------------------------------------------------------------

const scheduleInput = async (body: Record<string, unknown>) => {
  const partyId = readString(body, 'partyId', 'Party', { max: 60, required: true })!;
  if (!(await prisma.finParty.findUnique({ where: { id: partyId }, select: { id: true } }))) throw badRequest('Party not found.');
  const amount = readMoney(body, 'amount', 'Amount') ?? ZERO;
  if (!amount.greaterThan(0)) throw badRequest('Amount must be more than zero.');
  return {
    side: readEnum(body, 'side', 'Direction', Object.values(FinDueSide)),
    partyId,
    dueDate: readDate(body, 'dueDate', 'Due date', true)!,
    amount,
    reference: readString(body, 'reference', 'Reference', { max: 80 }),
    sellAccountId: readString(body, 'sellAccountId', 'Vehicle', { max: 60 }),
    notes: readMultiline(body, 'notes', 'Notes', 1000),
  };
};

export const listSchedules = async (query: Record<string, unknown>) => {
  const from = readDate(query, 'from', 'From');
  const to = readDate(query, 'to', 'To');
  const status = typeof query.status === 'string' && ['PLANNED', 'DONE', 'CANCELLED'].includes(query.status) ? (query.status as 'PLANNED') : null;
  const schedules = await prisma.finPaymentSchedule.findMany({
    where: {
      ...(status ? { status } : {}),
      ...(query.side === 'RECEIVABLE' || query.side === 'PAYABLE' ? { side: query.side } : {}),
      ...(typeof query.partyId === 'string' && query.partyId ? { partyId: query.partyId } : {}),
      ...(from || to ? { dueDate: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
    },
    include: { party: { select: { id: true, code: true, name: true, mobile: true } } },
    orderBy: [{ dueDate: 'asc' }, { createdAt: 'asc' }],
    take: 1000,
  });
  const today = istToday();
  return schedules.map((item) => ({ ...item, dueDate: dateOnly(item.dueDate), amount: item.amount.toNumber(), overdue: item.status === 'PLANNED' && item.dueDate < today }));
};

export const createSchedule = async (body: Record<string, unknown>, context: ActorContext) => {
  const data = await scheduleInput(body);
  const schedule = await prisma.finPaymentSchedule.create({ data: { ...data, createdById: context.actorUserId } });
  await writeFinAudit({ ...context, entityType: 'FinPaymentSchedule', entityId: schedule.id, action: 'CREATE', after: { side: data.side, amount: data.amount.toNumber(), dueDate: dateOnly(data.dueDate) } });
  return { id: schedule.id };
};

export const updateSchedule = async (id: string, body: Record<string, unknown>, context: ActorContext) => {
  const existing = await prisma.finPaymentSchedule.findUnique({ where: { id } });
  if (!existing) throw notFound('Schedule not found.');
  const action = typeof body.action === 'string' ? body.action : 'UPDATE';
  if (existing.status !== 'PLANNED') throw badRequest('Only planned items can be changed.');
  if (action === 'DONE' || action === 'CANCEL') {
    const updated = await prisma.finPaymentSchedule.update({
      where: { id },
      data: action === 'DONE'
        ? { status: 'DONE', voucherNumber: readString(body, 'voucherNumber', 'Voucher number', { max: 60 })?.toUpperCase() ?? null, completedById: context.actorUserId, completedAt: new Date() }
        : { status: 'CANCELLED', notes: [existing.notes, readMultiline(body, 'reason', 'Reason', 500)].filter(Boolean).join('\n') || null, completedById: context.actorUserId, completedAt: new Date() },
    });
    await writeFinAudit({ ...context, entityType: 'FinPaymentSchedule', entityId: id, action, after: { status: updated.status, voucherNumber: updated.voucherNumber } });
    return { id, status: updated.status };
  }
  const data = await scheduleInput(body);
  await prisma.finPaymentSchedule.update({ where: { id }, data });
  await writeFinAudit({ ...context, entityType: 'FinPaymentSchedule', entityId: id, action: 'UPDATE', before: { amount: existing.amount.toNumber(), dueDate: dateOnly(existing.dueDate) }, after: { amount: data.amount.toNumber(), dueDate: dateOnly(data.dueDate) } });
  return { id };
};

// ---------------------------------------------------------------------------
// Follow-ups
// ---------------------------------------------------------------------------

export const listFollowUps = async (query: Record<string, unknown>) => {
  const today = istToday();
  const due = query.due === 'today' ? { lte: today } : null;
  const followUps = await prisma.finFollowUp.findMany({
    where: {
      ...(query.status === 'OPEN' || query.status === 'DONE' ? { status: query.status } : {}),
      ...(typeof query.partyId === 'string' && query.partyId ? { partyId: query.partyId } : {}),
      ...(due ? { nextActionDate: due } : {}),
      ...(query.mine === 'true' && typeof query.userId === 'string' ? { assignedToId: query.userId } : {}),
    },
    include: { party: { select: { id: true, code: true, name: true, mobile: true } } },
    orderBy: [{ status: 'asc' }, { nextActionDate: 'asc' }, { createdAt: 'desc' }],
    take: 500,
  });
  const userIds = Array.from(new Set(followUps.flatMap((item) => [item.assignedToId, item.createdById]).filter((id): id is string => Boolean(id))));
  const users = userIds.length ? await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } }) : [];
  const nameOf = (id: string | null) => (id ? users.find((user) => user.id === id)?.name ?? null : null);
  return followUps.map((item) => ({
    ...item,
    promisedDate: dateOnly(item.promisedDate),
    nextActionDate: dateOnly(item.nextActionDate),
    promisedAmount: item.promisedAmount?.toNumber() ?? null,
    assignedTo: nameOf(item.assignedToId),
    createdBy: nameOf(item.createdById),
    overdue: item.status === 'OPEN' && Boolean(item.nextActionDate && item.nextActionDate < today),
  }));
};

export const createFollowUp = async (body: Record<string, unknown>, context: ActorContext) => {
  const partyId = readString(body, 'partyId', 'Party', { max: 60, required: true })!;
  if (!(await prisma.finParty.findUnique({ where: { id: partyId }, select: { id: true } }))) throw badRequest('Party not found.');
  const notes = readMultiline(body, 'notes', 'Notes', 2000);
  if (!notes) throw badRequest('Write what was discussed or sent.');
  const followUp = await prisma.finFollowUp.create({
    data: {
      partyId,
      side: readEnum(body, 'side', 'Side', Object.values(FinDueSide), 'RECEIVABLE'),
      kind: readEnum(body, 'kind', 'Type', Object.values(FinFollowUpKind), 'CALL'),
      notes,
      promisedDate: readDate(body, 'promisedDate', 'Promised date'),
      promisedAmount: readMoney(body, 'promisedAmount', 'Promised amount'),
      nextActionDate: readDate(body, 'nextActionDate', 'Next action date'),
      status: body.status === 'DONE' ? 'DONE' : 'OPEN',
      assignedToId: readString(body, 'assignedToId', 'Owner', { max: 60 }) ?? context.actorUserId,
      createdById: context.actorUserId,
      ...(body.status === 'DONE' ? { doneById: context.actorUserId, doneAt: new Date() } : {}),
    },
  });
  await writeFinAudit({ ...context, entityType: 'FinFollowUp', entityId: followUp.id, action: 'CREATE', after: { kind: followUp.kind, partyId } });
  return { id: followUp.id };
};

export const completeFollowUp = async (id: string, body: Record<string, unknown>, context: ActorContext) => {
  const existing = await prisma.finFollowUp.findUnique({ where: { id } });
  if (!existing) throw notFound('Follow-up not found.');
  if (existing.status === 'DONE') throw badRequest('Already done.');
  const note = readMultiline(body, 'outcome', 'Outcome', 1000);
  await prisma.finFollowUp.update({ where: { id }, data: { status: 'DONE', doneById: context.actorUserId, doneAt: new Date(), ...(note ? { notes: `${existing.notes}\n— ${note}` } : {}) } });
  await writeFinAudit({ ...context, entityType: 'FinFollowUp', entityId: id, action: 'DONE', reason: note });
  return { id, status: 'DONE' };
};

// ---------------------------------------------------------------------------
// Write-offs, discounts, waivers and write-backs
// ---------------------------------------------------------------------------

const KIND_LABEL: Record<FinWriteOffKind, string> = { WRITE_OFF: 'Written off', DISCOUNT: 'Discount', WAIVER: 'Waived', WRITE_BACK: 'Written back' };

export const createWriteOff = async (body: Record<string, unknown>, access: LedgerAccess & { canPost: boolean }) => {
  const side = readEnum(body, 'side', 'Side', Object.values(FinDueSide));
  const kind = readEnum(body, 'kind', 'Kind', Object.values(FinWriteOffKind));
  if (side === 'RECEIVABLE' && kind === 'WRITE_BACK') throw badRequest('Write-back applies to payables.');
  const partyId = readString(body, 'partyId', 'Party', { max: 60, required: true })!;
  const controlAccountId = readString(body, 'controlAccountId', 'Ledger', { max: 60, required: true })!;
  const counterAccountId = readString(body, 'counterAccountId', 'Expense / income ledger', { max: 60, required: true })!;
  const sellAccountId = readString(body, 'sellAccountId', 'Vehicle', { max: 60 });
  const date = readDate(body, 'date', 'Date', true)!;
  const amount = readMoney(body, 'amount', 'Amount') ?? ZERO;
  const reason = readMultiline(body, 'reason', 'Reason', 1000);
  if (!amount.greaterThan(0)) throw badRequest('Amount must be more than zero.');
  if (!reason) throw badRequest('A reason is required.');

  const [party, control, counter] = await Promise.all([
    prisma.finParty.findUnique({ where: { id: partyId }, select: { id: true, name: true } }),
    prisma.finAccount.findUnique({ where: { id: controlAccountId }, select: { id: true, systemKey: true, name: true } }),
    prisma.finAccount.findUnique({ where: { id: counterAccountId }, select: { id: true, kind: true, isActive: true, allowManualPosting: true, requiresParty: true, group: { select: { nature: true } } } }),
  ]);
  if (!party) throw badRequest('Party not found.');
  if (!control || !keysFor(side).includes(control.systemKey ?? '')) throw badRequest('Choose the party ledger the balance sits on.');
  if (!counter || !counter.isActive || !counter.allowManualPosting || CASH_BANK_KINDS.includes(counter.kind) || counter.requiresParty) throw badRequest('Choose an active expense or income ledger (not bank, cash or a party ledger).');
  const expectedNature = side === 'RECEIVABLE' ? 'EXPENSE' : 'INCOME';
  if (counter.group.nature !== expectedNature) throw badRequest(side === 'RECEIVABLE' ? 'A receivable is written off to an expense ledger (e.g. Bad Debts, Discount Allowed).' : 'A payable is written back to an income ledger (e.g. Write-back, Discount Received).');

  const { lines } = await loadDueLines(side, date, partyId, [controlAccountId]);
  const entries = await toEntries(side, lines, new Map());
  const owed = allocateFifo(entries, date).net;
  if (amount.greaterThan(owed)) throw badRequest(`Only ${owed.toFixed(2)} is ${side === 'RECEIVABLE' ? 'receivable from' : 'payable to'} ${party.name} on ${control.name} as of that date.`);

  const partyLine = { accountId: controlAccountId, partyId, sellAccountId, costCentreId: null, narration: KIND_LABEL[kind] };
  const counterLine = { accountId: counterAccountId, partyId: null, sellAccountId, costCentreId: null, narration: null };
  const voucherLines = side === 'RECEIVABLE'
    ? [{ ...counterLine, debit: amount.toFixed(2), credit: null }, { ...partyLine, debit: null, credit: amount.toFixed(2) }]
    : [{ ...partyLine, debit: amount.toFixed(2), credit: null }, { ...counterLine, debit: null, credit: amount.toFixed(2) }];
  const draft = await createVoucher({ type: 'JOURNAL', date: dateOnly(date), narration: `${KIND_LABEL[kind]}: ${party.name} — ${reason}`.slice(0, 1000), reference: kind.replace('_', '-'), lines: voucherLines }, access);
  const writeOff = await prisma.finWriteOff.create({
    data: { side, kind, partyId, controlAccountId, counterAccountId, sellAccountId, date, amount, reason, voucherId: draft.id, createdById: access.actor.actorUserId },
  });
  await writeFinAudit({ ...access.actor, entityType: 'FinWriteOff', entityId: writeOff.id, action: 'CREATE', after: { side, kind, amount: amount.toNumber(), voucherId: draft.id }, reason });
  // Posting follows the approval policy: large amounts wait for a checker.
  const posted = access.canPost ? await postVoucher(draft.id, access) : { id: draft.id, status: draft.status, number: null };
  return { id: writeOff.id, voucherId: draft.id, status: posted.status, number: posted.number };
};

export const listWriteOffs = async (query: Record<string, unknown>) => {
  const writeOffs = await prisma.finWriteOff.findMany({
    where: { ...(query.side === 'RECEIVABLE' || query.side === 'PAYABLE' ? { side: query.side } : {}) },
    include: { party: { select: { code: true, name: true } } },
    orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
    take: 500,
  });
  const [vouchers, accounts] = await Promise.all([
    prisma.finVoucher.findMany({ where: { id: { in: writeOffs.map((item) => item.voucherId) } }, select: { id: true, number: true, status: true } }),
    prisma.finAccount.findMany({ where: { id: { in: writeOffs.flatMap((item) => [item.controlAccountId, item.counterAccountId]) } }, select: { id: true, code: true, name: true } }),
  ]);
  const accountName = (id: string) => {
    const account = accounts.find((item) => item.id === id);
    return account ? `${account.code} · ${account.name}` : '—';
  };
  return writeOffs.map((item) => ({
    ...item,
    date: dateOnly(item.date),
    amount: item.amount.toNumber(),
    controlAccount: accountName(item.controlAccountId),
    counterAccount: accountName(item.counterAccountId),
    voucher: vouchers.find((voucher) => voucher.id === item.voucherId) ?? null,
  }));
};
