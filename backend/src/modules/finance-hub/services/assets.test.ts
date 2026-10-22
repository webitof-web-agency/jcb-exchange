import assert from 'node:assert/strict';
import test from 'node:test';
import { Prisma } from '@prisma/client';
import { buildExpenseEntryVouchers } from '../posting/builders';
import { depreciationSchedule, firstRecurringDate, monthlyDepreciation, monthlyPrepaid, nextRecurringDate } from './assetsRules';

const day = (value: string) => new Date(`${value}T00:00:00.000Z`);
const laptop = { cost: 120000, salvageValue: 0, method: 'SLM' as const, usefulLifeMonths: 36, wdvRatePercent: null, putToUseDate: day('2026-04-01'), disposedAt: null };

test('straight line: equal monthly charge, first month pro-rated by days', () => {
  assert.equal(monthlyDepreciation(laptop, '2026-04', 0), 3333.33);
  assert.equal(monthlyDepreciation({ ...laptop, putToUseDate: day('2026-04-16') }, '2026-04', 0), 1666.67);
  assert.equal(monthlyDepreciation(laptop, '2026-03', 0), 0, 'before put to use');
  assert.equal(monthlyDepreciation(laptop, '2029-03', 119000), 1000, 'never below salvage');
  assert.equal(monthlyDepreciation({ ...laptop, disposedAt: day('2026-05-15') }, '2026-06', 0), 0, 'after disposal');
});

test('written-down value: rate on the remaining value', () => {
  const car = { cost: 1000000, salvageValue: 50000, method: 'WDV' as const, usefulLifeMonths: null, wdvRatePercent: 15, putToUseDate: day('2026-04-01'), disposedAt: null };
  assert.equal(monthlyDepreciation(car, '2026-04', 0), 12500);
  assert.equal(monthlyDepreciation(car, '2026-05', 12500), 12343.75);
  const schedule = depreciationSchedule(car, 0, '2026-04', 3);
  assert.deepEqual(schedule.map((row) => row.charge), [12500, 12343.75, 12189.45]);
  assert.equal(schedule[2]!.closing, 962966.8);
});

test('prepaid: equal shares, the last month takes the remainder', () => {
  const insurance = { totalAmount: 10000, startDate: day('2026-04-10'), months: 3 };
  assert.equal(monthlyPrepaid(insurance, '2026-03', 0), 0);
  assert.equal(monthlyPrepaid(insurance, '2026-04', 0), 3333.33);
  assert.equal(monthlyPrepaid(insurance, '2026-05', 3333.33), 3333.33);
  assert.equal(monthlyPrepaid(insurance, '2026-06', 6666.66), 3333.34);
  assert.equal(monthlyPrepaid(insurance, '2026-07', 10000), 0);
});

test('recurring dates clamp to month end', () => {
  assert.equal(firstRecurringDate(day('2026-04-10'), 5).toISOString().slice(0, 10), '2026-05-05');
  assert.equal(firstRecurringDate(day('2026-04-10'), 31).toISOString().slice(0, 10), '2026-04-30');
  assert.equal(nextRecurringDate(day('2026-01-31'), 'MONTHLY', 31).toISOString().slice(0, 10), '2026-02-28');
  assert.equal(nextRecurringDate(day('2026-01-15'), 'QUARTERLY', 15).toISOString().slice(0, 10), '2026-04-15');
  assert.equal(nextRecurringDate(day('2026-04-01'), 'YEARLY', 1).toISOString().slice(0, 10), '2027-04-01');
});

test('expenses page entries: manual only, payment out / receipt in', () => {
  const entry = { id: 'f1', type: 'DEBIT', amount: new Prisma.Decimal(1500), transactionDate: new Date('2026-10-05T20:00:00.000Z'), name: 'Office', category: 'Electricity', narration: 'Bill Sept', reference: null, chequeNumber: null, invoiceNumber: 'EB-9', paymentMethod: 'UPI', source: 'MANUAL', status: 'POSTED' };
  const context = { categoryAccountId: 'L:POWER', cashBankAccountId: 'B:HDFC', booksBegin: day('2026-04-01') };
  const [voucher] = buildExpenseEntryVouchers(entry, context);
  assert.equal(voucher!.type, 'PAYMENT');
  assert.equal(voucher!.date.toISOString().slice(0, 10), '2026-10-06', 'IST day');
  assert.equal(voucher!.lines[0]!.accountId, 'L:POWER');
  assert.equal(voucher!.reference, 'EB-9');
  assert.equal(buildExpenseEntryVouchers({ ...entry, type: 'CREDIT' }, context)[0]!.type, 'RECEIPT');
  assert.deepEqual(buildExpenseEntryVouchers({ ...entry, source: 'IMPORT' }, context), []);
  assert.deepEqual(buildExpenseEntryVouchers({ ...entry, status: 'VOIDED' }, context), []);
  assert.throws(() => buildExpenseEntryVouchers(entry, { ...context, categoryAccountId: null }), /Map the expense category "Electricity"/);
});
