import assert from 'node:assert/strict';
import test from 'node:test';
import { Prisma } from '@prisma/client';
import { allocateFifo, bucketOf, type LedgerEntry } from './receivablesRules';

const D = (value: number) => new Prisma.Decimal(value);
const day = (value: string) => new Date(`${value}T00:00:00.000Z`);
let seq = 0;
const entry = (date: string, amount: number, dueDate = date): LedgerEntry => {
  seq += 1;
  return { id: `e${String(seq).padStart(3, '0')}`, date: day(date), dueDate: day(dueDate), ref: `R${seq}`, voucherId: `v${seq}`, voucherNumber: `V${seq}`, narration: '', sellAccountId: null, amount: D(amount) };
};

test('ageing buckets', () => {
  assert.equal(bucketOf(-3), 'NOT_DUE');
  assert.equal(bucketOf(0), 'NOT_DUE');
  assert.equal(bucketOf(1), 'D0_30');
  assert.equal(bucketOf(30), 'D0_30');
  assert.equal(bucketOf(31), 'D31_60');
  assert.equal(bucketOf(90), 'D61_90');
  assert.equal(bucketOf(91), 'D90_PLUS');
});

test('payments settle the oldest bills first', () => {
  const result = allocateFifo([entry('2026-06-01', 100000), entry('2026-08-01', 50000, '2026-08-31'), entry('2026-08-15', -120000)], day('2026-10-01'));
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0]!.original, 50000);
  assert.equal(result.items[0]!.open, 30000);
  assert.equal(result.items[0]!.daysOverdue, 31);
  assert.equal(result.buckets.D31_60, 30000);
  assert.equal(result.outstanding, 30000);
  assert.equal(result.unapplied, 0);
  assert.equal(result.net, 30000);
});

test('overpayment is an advance that the next bill uses up', () => {
  const advance = allocateFifo([entry('2026-05-01', 20000), entry('2026-05-10', -50000)], day('2026-06-01'));
  assert.equal(advance.outstanding, 0);
  assert.equal(advance.unapplied, 30000);
  assert.equal(advance.net, -30000);

  const later = allocateFifo([entry('2026-05-01', 20000), entry('2026-05-10', -50000), entry('2026-05-20', 45000)], day('2026-06-01'));
  assert.equal(later.unapplied, 0);
  assert.equal(later.outstanding, 15000);
  assert.equal(later.items[0]!.open, 15000);
});

test('fully settled party has nothing open', () => {
  const result = allocateFifo([entry('2026-04-01', 1000), entry('2026-04-02', 500), entry('2026-04-03', -1500)], day('2026-12-31'));
  assert.deepEqual(result.items, []);
  assert.equal(result.net, 0);
});
