import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildFinancePayload,
  createFinanceFingerprint,
  parseImportedFinanceRow,
  summarizeFinanceTransactions,
  validateFinancePayload,
} from './finance';

test('validates a manual debit transaction and normalizes its values', () => {
  const payload = buildFinancePayload({
    transactionDate: '2026-10-06',
    type: 'DEBIT',
    amount: '1,250.50',
    accountName: 'HDFC Current Account',
    paymentMethod: 'UPI',
    name: '  Office Supplier  ',
    category: 'Office Expense',
    narration: '  Printer paper purchase  ',
  });

  assert.equal(validateFinancePayload(payload), null);
  assert.equal(payload.amount, 1250.5);
  assert.equal(payload.name, 'Office Supplier');
  assert.equal(payload.narration, 'Printer paper purchase');
  assert.equal(payload.type, 'DEBIT');
  assert.equal(payload.accountName, 'HDFC CURRENT ACCOUNT');
});

test('rejects invalid or incomplete finance transactions', () => {
  const payload = buildFinancePayload({
    transactionDate: 'not-a-date',
    type: 'DEBIT',
    amount: '-10',
    name: '',
    narration: '',
  });

  assert.equal(validateFinancePayload(payload), 'Transaction date is required.');
  assert.equal(
    validateFinancePayload(buildFinancePayload({ transactionDate: '2026-10-06', type: 'DEBIT', amount: '0', name: 'A', narration: 'B' })),
    'Amount must be greater than zero.',
  );
  assert.equal(
    validateFinancePayload(buildFinancePayload({ transactionDate: '2026-10-06', type: 'DEBIT', amount: '10', name: 'A', narration: 'B' })),
    'Bank name is required.',
  );
});

test('sanitizes finance text and rejects unsafe or negative manual entries', () => {
  const sanitized = buildFinancePayload({
    transactionDate: '2026-10-06',
    type: 'DEBIT',
    amount: '10',
    accountName: ' hdfc\u0000 bank ',
    name: '  Office  Supplier  ',
    narration: 'Printer\u0007 paper\n\npaid',
    reference: '<utr/123>',
    chequeNumber: 'chq/01-a',
    invoiceNumber: 'inv/2026-01',
  });

  assert.equal(sanitized.accountName, 'HDFC BANK');
  assert.equal(sanitized.name, 'Office Supplier');
  assert.equal(sanitized.narration, 'Printer paper\n\npaid');
  assert.equal(sanitized.reference, 'UTR/123');
  assert.equal(sanitized.chequeNumber, 'CHQ/01-A');
  assert.equal(sanitized.invoiceNumber, 'INV/2026-01');

  const negativeAmount = buildFinancePayload({
    transactionDate: '2026-10-06',
    type: 'DEBIT',
    amount: '-10',
    accountName: 'HDFC BANK',
    name: 'Supplier',
    narration: 'Office expense',
  });
  assert.equal(validateFinancePayload(negativeAmount), 'Amount must be greater than zero.');
});

test('rejects text values that exceed safe field limits', () => {
  const payload = buildFinancePayload({
    transactionDate: '2026-10-06',
    type: 'DEBIT',
    amount: '10',
    accountName: 'HDFC BANK',
    name: 'A'.repeat(121),
    narration: 'Office expense',
  });

  assert.equal(validateFinancePayload(payload), 'Name must not exceed 120 characters.');
});

test('converts bank debit and credit columns into one normalized transaction', () => {
  const debit = parseImportedFinanceRow({
    date: '06/10/2026',
    narration: 'UPI/ABC OFFICE SUPPLIER',
    withdrawal: '₹1,250.50',
    deposit: '',
    closingBalance: '48,749.50',
    reference: 'UTR123',
  });
  const credit = parseImportedFinanceRow({
    date: '07/10/2026',
    narration: 'NEFT CUSTOMER PAYMENT',
    withdrawal: '',
    deposit: '5,000.00',
    closingBalance: '53,749.50',
  });

  assert.equal(debit.type, 'DEBIT');
  assert.equal(debit.amount, 1250.5);
  assert.equal(debit.balance, 48749.5);
  assert.equal(credit.type, 'CREDIT');
  assert.equal(credit.amount, 5000);

  const withoutBalance = parseImportedFinanceRow({
    date: '08/10/2026',
    narration: 'CASH EXPENSE',
    withdrawal: '100',
  });
  assert.equal(withoutBalance.balance, null);
});

test('calculates debit, credit, and net totals without floating point drift', () => {
  assert.deepEqual(
    summarizeFinanceTransactions([
      { type: 'DEBIT', amount: 10.1 },
      { type: 'CREDIT', amount: 100.2 },
      { type: 'DEBIT', amount: 0.2 },
    ]),
    { debit: 10.3, credit: 100.2, net: 89.9 },
  );
});

test('creates a stable fingerprint for duplicate imported rows', () => {
  const first = createFinanceFingerprint({
    date: '2026-10-06',
    type: 'DEBIT',
    amount: 1250.5,
    reference: 'UTR123',
    narration: 'UPI/ABC OFFICE SUPPLIER',
  });
  const duplicate = createFinanceFingerprint({
    date: '2026-10-06',
    type: 'DEBIT',
    amount: '1,250.50',
    reference: ' UTR123 ',
    narration: ' upi/abc office supplier ',
  });

  assert.equal(first, duplicate);
});
