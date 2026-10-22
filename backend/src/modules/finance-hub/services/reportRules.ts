import { FinAccountNature, FinBalanceSide, Prisma } from '@prisma/client';
import { roundMoney } from '../utils/money';

// Pure report builders. Inputs are per-account Dr/Cr sums; outputs are plain numbers for JSON.

const ZERO = new Prisma.Decimal(0);

export type Sums = { debit: Prisma.Decimal; credit: Prisma.Decimal };
export type SumsByAccount = Map<string, Sums>;

export const isProfitAndLoss = (nature: FinAccountNature) => nature === 'INCOME' || nature === 'EXPENSE';

const net = (sums: Sums | undefined) => (sums ? sums.debit.minus(sums.credit) : ZERO);

export type TrialBalanceAccount = { id: string; code: string; name: string; groupId: string; normalBalance: FinBalanceSide; systemKey: string | null; isActive: boolean };
export type TrialBalanceGroup = { id: string; code: string; name: string; nature: FinAccountNature; parentId: string | null };

export type TrialBalanceRow = {
  accountId: string;
  code: string;
  name: string;
  groupId: string;
  nature: FinAccountNature;
  openingDebit: number;
  openingCredit: number;
  periodDebit: number;
  periodCredit: number;
  closingDebit: number;
  closingCredit: number;
  note: string | null;
};

const split = (value: Prisma.Decimal) => {
  const rounded = roundMoney(value);
  return rounded.isNegative() ? { debit: 0, credit: rounded.abs().toNumber() } : { debit: rounded.toNumber(), credit: 0 };
};

/**
 * Trial balance for [from, to]. Balance-sheet ledgers carry everything before `from`; income and
 * expense ledgers only carry what is in the same financial year. Until year closing exists, the
 * net income/expense of earlier years is shown on Retained Earnings so the totals still agree.
 */
export const buildTrialBalance = (input: {
  accounts: TrialBalanceAccount[];
  groups: TrialBalanceGroup[];
  beforeYear: SumsByAccount;
  yearToFrom: SumsByAccount;
  period: SumsByAccount;
  includeZero: boolean;
}) => {
  const natureOf = new Map<string, FinAccountNature>();
  const groupById = new Map(input.groups.map((group) => [group.id, group]));
  const resolveNature = (groupId: string): FinAccountNature => {
    const cached = natureOf.get(groupId);
    if (cached) return cached;
    const group = groupById.get(groupId);
    const nature = group?.nature ?? 'ASSET';
    natureOf.set(groupId, nature);
    return nature;
  };

  let priorProfitAndLoss = ZERO;
  for (const account of input.accounts) {
    if (isProfitAndLoss(resolveNature(account.groupId))) priorProfitAndLoss = priorProfitAndLoss.plus(net(input.beforeYear.get(account.id)));
  }

  const rows: TrialBalanceRow[] = [];
  let carriedPriorPl = false;
  for (const account of input.accounts) {
    const nature = resolveNature(account.groupId);
    let opening = isProfitAndLoss(nature)
      ? net(input.yearToFrom.get(account.id))
      : net(input.beforeYear.get(account.id)).plus(net(input.yearToFrom.get(account.id)));
    let note: string | null = null;
    if (account.systemKey === 'RETAINED_EARNINGS' && !priorProfitAndLoss.isZero()) {
      opening = opening.plus(priorProfitAndLoss);
      carriedPriorPl = true;
      note = 'Includes profit/loss of earlier years until the year is closed.';
    }
    const period = input.period.get(account.id) ?? { debit: ZERO, credit: ZERO };
    const closing = opening.plus(period.debit).minus(period.credit);
    if (!input.includeZero && opening.isZero() && period.debit.isZero() && period.credit.isZero()) continue;
    const openingSplit = split(opening);
    const closingSplit = split(closing);
    rows.push({
      accountId: account.id,
      code: account.code,
      name: account.name,
      groupId: account.groupId,
      nature,
      openingDebit: openingSplit.debit,
      openingCredit: openingSplit.credit,
      periodDebit: roundMoney(period.debit).toNumber(),
      periodCredit: roundMoney(period.credit).toNumber(),
      closingDebit: closingSplit.debit,
      closingCredit: closingSplit.credit,
      note,
    });
  }

  const totals = rows.reduce(
    (sum, row) => ({
      openingDebit: sum.openingDebit.plus(row.openingDebit),
      openingCredit: sum.openingCredit.plus(row.openingCredit),
      periodDebit: sum.periodDebit.plus(row.periodDebit),
      periodCredit: sum.periodCredit.plus(row.periodCredit),
      closingDebit: sum.closingDebit.plus(row.closingDebit),
      closingCredit: sum.closingCredit.plus(row.closingCredit),
    }),
    { openingDebit: ZERO, openingCredit: ZERO, periodDebit: ZERO, periodCredit: ZERO, closingDebit: ZERO, closingCredit: ZERO },
  );

  return {
    rows,
    totals: Object.fromEntries(Object.entries(totals).map(([key, value]) => [key, roundMoney(value).toNumber()])) as Record<keyof typeof totals, number>,
    difference: roundMoney(totals.closingDebit.minus(totals.closingCredit)).toNumber(),
    // Positive = profit of earlier years (income is credit, so the Dr-positive net is negated).
    priorYearsProfitAndLoss: roundMoney(priorProfitAndLoss.negated()).toNumber(),
    retainedEarningsMissing: !priorProfitAndLoss.isZero() && !carriedPriorPl,
  };
};

export type LedgerLine = {
  id: string;
  date: string;
  voucherId: string;
  voucherNumber: string | null;
  voucherType: string;
  narration: string;
  lineNarration: string | null;
  partyName: string | null;
  debit: Prisma.Decimal;
  credit: Prisma.Decimal;
};

/** Running balance in Dr-positive terms; display side comes from the sign. */
export const buildLedgerRows = (opening: Prisma.Decimal, lines: LedgerLine[]) => {
  let balance = opening;
  let debit = ZERO;
  let credit = ZERO;
  const rows = lines.map((line) => {
    balance = balance.plus(line.debit).minus(line.credit);
    debit = debit.plus(line.debit);
    credit = credit.plus(line.credit);
    return { ...line, debit: line.debit.toNumber(), credit: line.credit.toNumber(), balance: roundMoney(balance).toNumber() };
  });
  return {
    opening: roundMoney(opening).toNumber(),
    rows,
    totalDebit: roundMoney(debit).toNumber(),
    totalCredit: roundMoney(credit).toNumber(),
    closing: roundMoney(balance).toNumber(),
  };
};
