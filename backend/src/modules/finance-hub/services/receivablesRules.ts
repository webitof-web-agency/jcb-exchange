import { Prisma } from '@prisma/client';
import { roundMoney } from '../utils/money';

// Open items and ageing for party control ledgers. Payments are applied to the oldest bill
// first (FIFO) because vouchers are not allocated bill-by-bill.

const ZERO = new Prisma.Decimal(0);
const DAY_MS = 24 * 60 * 60 * 1000;

export const RECEIVABLE_KEYS = ['DEBTORS_CONTROL', 'PARTNER_RECEIVABLES'] as const;
export const PAYABLE_KEYS = ['CREDITORS_CONTROL', 'PARTNER_PAYABLES', 'BROKER_PAYABLES', 'CONSIGNMENT_PAYABLE', 'REIMBURSEMENTS_PAYABLE'] as const;
/** Money held for or paid ahead to a party, shown on Party Advances & Deposits. */
export const ADVANCE_KEYS = ['CUSTOMER_ADVANCES', 'PARTNER_SECURITY_DEPOSITS', 'SELLER_ADVANCES', 'EMPLOYEE_ADVANCES'] as const;

export const BUCKETS = ['NOT_DUE', 'D0_30', 'D31_60', 'D61_90', 'D90_PLUS'] as const;
export type Bucket = (typeof BUCKETS)[number];

export const bucketOf = (daysOverdue: number): Bucket =>
  daysOverdue <= 0 ? 'NOT_DUE' : daysOverdue <= 30 ? 'D0_30' : daysOverdue <= 60 ? 'D31_60' : daysOverdue <= 90 ? 'D61_90' : 'D90_PLUS';

export const daysBetween = (from: Date, to: Date) => Math.round((to.getTime() - from.getTime()) / DAY_MS);

export type LedgerEntry = {
  id: string;
  date: Date;
  dueDate: Date;
  ref: string;
  voucherId: string;
  voucherNumber: string | null;
  narration: string;
  sellAccountId: string | null;
  /** Positive raises what is owed (bill), negative settles it (payment, note). */
  amount: Prisma.Decimal;
};

export type OpenItem = Omit<LedgerEntry, 'amount'> & { original: number; open: number; daysOverdue: number; bucket: Bucket };

/** FIFO: settlements reduce the oldest bills first; any settlement left over is an advance (unapplied). */
export const allocateFifo = (entries: LedgerEntry[], asOf: Date) => {
  const sorted = [...entries].sort((a, b) => a.date.getTime() - b.date.getTime() || a.id.localeCompare(b.id));
  const bills: Array<{ entry: LedgerEntry; open: Prisma.Decimal }> = [];
  let unapplied = ZERO;
  for (const entry of sorted) {
    if (entry.amount.greaterThan(0)) {
      let open = entry.amount;
      // An earlier advance is used up by the next bill.
      if (unapplied.greaterThan(0)) {
        const used = Prisma.Decimal.min(unapplied, open);
        open = open.minus(used);
        unapplied = unapplied.minus(used);
      }
      bills.push({ entry, open });
      continue;
    }
    let left = entry.amount.negated();
    for (const bill of bills) {
      if (!left.greaterThan(0)) break;
      if (!bill.open.greaterThan(0)) continue;
      const used = Prisma.Decimal.min(left, bill.open);
      bill.open = bill.open.minus(used);
      left = left.minus(used);
    }
    unapplied = unapplied.plus(left);
  }
  const items: OpenItem[] = bills
    .filter((bill) => bill.open.greaterThan(0))
    .map(({ entry, open }) => {
      const daysOverdue = daysBetween(entry.dueDate, asOf);
      const { amount, ...rest } = entry;
      return { ...rest, original: roundMoney(amount).toNumber(), open: roundMoney(open).toNumber(), daysOverdue, bucket: bucketOf(daysOverdue) };
    });
  const buckets = Object.fromEntries(BUCKETS.map((bucket) => [bucket, 0])) as Record<Bucket, number>;
  for (const item of items) buckets[item.bucket] = roundMoney(new Prisma.Decimal(buckets[item.bucket]).plus(item.open)).toNumber();
  const outstanding = roundMoney(items.reduce((sum, item) => sum.plus(item.open), ZERO)).toNumber();
  return { items, buckets, outstanding, unapplied: roundMoney(unapplied).toNumber(), net: roundMoney(new Prisma.Decimal(outstanding).minus(unapplied)).toNumber() };
};

export const addDays = (date: Date, days: number) => new Date(date.getTime() + days * DAY_MS);
