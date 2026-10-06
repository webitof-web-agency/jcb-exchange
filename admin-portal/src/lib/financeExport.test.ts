import assert from 'node:assert/strict';
import test from 'node:test';
import { filterFinanceExportRows, getFinanceExportData } from './financeExport';

test('includes every saved finance detail in the export data', () => {
  const exported = getFinanceExportData({
    id: 'txn-1',
    transactionDate: '2026-10-06',
    valueDate: '2026-10-07',
    type: 'DEBIT',
    amount: 1250.5,
    balance: 48749.5,
    accountName: 'HDFC BANK',
    paymentMethod: 'UPI',
    name: 'Office Supplier',
    category: 'Office Expense',
    narration: 'Printer paper purchase',
    reference: 'UTR123',
    chequeNumber: 'CHQ-01',
    invoiceNumber: 'INV-01',
    notes: 'Approved by admin',
    source: 'MANUAL',
  });

  assert.deepEqual(exported, {
    transactionId: 'txn-1',
    transactionDate: '2026-10-06',
    valueDate: '2026-10-07',
    type: 'DEBIT',
    amount: 1250.5,
    balance: 48749.5,
    bankName: 'HDFC BANK',
    paymentMethod: 'UPI',
    name: 'Office Supplier',
    category: 'Office Expense',
    narration: 'Printer paper purchase',
    reference: 'UTR123',
    chequeNumber: 'CHQ-01',
    invoiceNumber: 'INV-01',
    notes: 'Approved by admin',
    source: 'MANUAL',
  });
});

test('filters export rows by the selected inclusive date range and returns all rows without a range', () => {
  const rows = [
    { transactionDate: '2026-10-01T00:00:00.000Z' },
    { transactionDate: '2026-10-15T00:00:00.000Z' },
    { transactionDate: '2026-11-01T00:00:00.000Z' },
  ];

  assert.equal(filterFinanceExportRows(rows, '2026-10-01', '2026-10-31').length, 2);
  assert.equal(filterFinanceExportRows(rows).length, 3);
});
