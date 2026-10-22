import { FinPeriodStatus, Prisma } from '@prisma/client';
import prisma from '../../../lib/prisma';
import { badRequest, notFound } from '../http';
import { readDate, readMoney, readString } from '../utils/input';
import { roundMoney, sumMoney } from '../utils/money';
import { writeFinAudit } from './audit.service';
import { sequential, type ActorContext } from './context';

type AccountInfo = { id: string; code: string; name: string; isActive: boolean; requiresParty: boolean; systemKey: string | null; nature: string };

export type OpeningLineInput = {
  accountId: string;
  partyId: string | null;
  debit: Prisma.Decimal;
  credit: Prisma.Decimal;
  billRef: string | null;
  billDate: Date | null;
  dueDate: Date | null;
  note: string | null;
  lineKey: string;
};

export const openingLineKey = (accountId: string, partyId: string | null, billRef: string | null) =>
  `${accountId}|${partyId ?? ''}|${(billRef ?? '').toUpperCase()}`;

/**
 * Validates the whole opening grid. Income and expense ledgers start every year at zero, and
 * the Opening Balance Difference ledger is calculated, so neither can be entered by hand.
 */
export const validateOpeningLines = (
  rows: unknown[],
  accounts: Map<string, AccountInfo>,
  partyIds: Set<string>,
): { lines: OpeningLineInput[]; totals: { debit: Prisma.Decimal; credit: Prisma.Decimal; difference: Prisma.Decimal } } => {
  const lines: OpeningLineInput[] = [];
  const seen = new Set<string>();

  rows.forEach((raw, index) => {
    const row = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
    const at = `Line ${index + 1}`;
    const accountId = readString(row, 'accountId', `${at}: ledger`, { max: 60, required: true })!;
    const account = accounts.get(accountId);
    if (!account) throw badRequest(`${at}: ledger not found.`);
    if (!account.isActive) throw badRequest(`${at}: ${account.name} is inactive.`);
    if (account.nature === 'INCOME' || account.nature === 'EXPENSE') {
      throw badRequest(`${at}: ${account.name} is an income/expense ledger; those open at zero every year.`);
    }
    if (account.systemKey === 'OPENING_DIFFERENCE') throw badRequest(`${at}: the opening difference is calculated, not entered.`);

    const debit = readMoney(row, 'debit', `${at}: debit`) ?? new Prisma.Decimal(0);
    const credit = readMoney(row, 'credit', `${at}: credit`) ?? new Prisma.Decimal(0);
    if (debit.isZero() && credit.isZero()) return;
    if (!debit.isZero() && !credit.isZero()) throw badRequest(`${at}: enter either debit or credit, not both.`);

    const partyId = readString(row, 'partyId', `${at}: party`, { max: 60 });
    if (partyId && !partyIds.has(partyId)) throw badRequest(`${at}: party not found.`);
    if (account.requiresParty && !partyId) throw badRequest(`${at}: ${account.name} needs a party.`);
    const billRef = readString(row, 'billRef', `${at}: bill reference`, { max: 60 });
    if (billRef && !partyId) throw badRequest(`${at}: a bill reference needs a party.`);
    const billDate = readDate(row, 'billDate', `${at}: bill date`);
    const dueDate = readDate(row, 'dueDate', `${at}: due date`);
    if (billDate && dueDate && dueDate < billDate) throw badRequest(`${at}: due date is before the bill date.`);

    const lineKey = openingLineKey(accountId, partyId, billRef);
    if (seen.has(lineKey)) throw badRequest(`${at}: duplicate of an earlier line (same ledger, party and bill).`);
    seen.add(lineKey);
    lines.push({ accountId, partyId, debit, credit, billRef, billDate, dueDate, note: readString(row, 'note', `${at}: note`, { max: 200 }), lineKey });
  });

  const debit = sumMoney(lines.map((line) => line.debit));
  const credit = sumMoney(lines.map((line) => line.credit));
  return { lines, totals: { debit, credit, difference: roundMoney(debit.minus(credit)) } };
};

const serializeTotals = (totals: { debit: Prisma.Decimal; credit: Prisma.Decimal; difference: Prisma.Decimal }) => ({
  debit: totals.debit.toNumber(),
  credit: totals.credit.toNumber(),
  difference: totals.difference.toNumber(),
});

export const getOpeningBalances = async (yearId: string) => {
  const year = await prisma.finFinancialYear.findUnique({ where: { id: yearId } });
  if (!year) throw notFound('Financial year not found.');
  const lines = await prisma.finOpeningBalance.findMany({
    where: { yearId },
    include: {
      account: { select: { id: true, code: true, name: true, normalBalance: true, requiresParty: true, group: { select: { nature: true, name: true } } } },
      party: { select: { id: true, code: true, name: true } },
    },
    orderBy: [{ account: { code: 'asc' } }, { createdAt: 'asc' }],
  });
  const debit = sumMoney(lines.map((line) => line.debit));
  const credit = sumMoney(lines.map((line) => line.credit));
  return {
    year,
    finalized: Boolean(year.openingFinalizedAt),
    lines: lines.map((line) => ({
      ...line,
      debit: line.debit.toNumber(),
      credit: line.credit.toNumber(),
      billDate: line.billDate?.toISOString().slice(0, 10) ?? null,
      dueDate: line.dueDate?.toISOString().slice(0, 10) ?? null,
    })),
    totals: serializeTotals({ debit, credit, difference: roundMoney(debit.minus(credit)) }),
  };
};

/** Replaces the whole draft grid for the year. Finalising (OPENING voucher) arrives with the ledger engine. */
export const saveOpeningBalances = async (yearId: string, body: Record<string, unknown>, context: ActorContext) => {
  const rows = Array.isArray(body.lines) ? body.lines : null;
  if (!rows) throw badRequest('Opening balance lines are required.');
  if (rows.length > 5000) throw badRequest('Up to 5000 opening lines can be saved at once.');

  return prisma.$transaction(async (tx) => {
    const year = await tx.finFinancialYear.findUnique({ where: { id: yearId } });
    if (!year) throw notFound('Financial year not found.');
    if (year.openingFinalizedAt) throw badRequest(`${year.label} opening balances are finalised.`);
    if (year.status === FinPeriodStatus.LOCKED) throw badRequest(`${year.label} is closed.`);

    const accountIds = rows.map((row) => String((row as Record<string, unknown>)?.accountId || ''));
    const partyIdsSent = rows.flatMap((row) => {
      const partyId = (row as Record<string, unknown>)?.partyId;
      return typeof partyId === 'string' && partyId ? [partyId] : [];
    });
    const [accounts, parties] = await sequential([
      tx.finAccount.findMany({
        where: { id: { in: accountIds } },
        select: { id: true, code: true, name: true, isActive: true, requiresParty: true, systemKey: true, group: { select: { nature: true } } },
      }),
      tx.finParty.findMany({ where: { id: { in: partyIdsSent } }, select: { id: true } }),
    ]);
    const { lines, totals } = validateOpeningLines(
      rows,
      new Map(accounts.map((account) => [account.id, { ...account, nature: account.group.nature }])),
      new Set(parties.map((party) => party.id)),
    );

    const before = await tx.finOpeningBalance.aggregate({ where: { yearId }, _count: { _all: true }, _sum: { debit: true, credit: true } });
    await tx.finOpeningBalance.deleteMany({ where: { yearId } });
    if (lines.length) {
      await tx.finOpeningBalance.createMany({ data: lines.map((line) => ({ ...line, yearId, updatedById: context.actorUserId })) });
    }
    await writeFinAudit({
      ...context,
      entityType: 'FinOpeningBalance',
      entityId: yearId,
      action: 'SAVE_DRAFT',
      before: { lines: before._count._all, debit: before._sum.debit, credit: before._sum.credit },
      after: { lines: lines.length, ...serializeTotals(totals) },
    }, tx);
    return { saved: lines.length, totals: serializeTotals(totals) };
  });
};
