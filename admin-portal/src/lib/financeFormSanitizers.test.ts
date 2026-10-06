import assert from 'node:assert/strict';
import test from 'node:test';
import {
  sanitizeFinanceFieldValue,
  sanitizeFinanceFormData,
} from './financeFormSanitizers';

test('sanitizes finance fields without changing valid banking data', () => {
  assert.equal(sanitizeFinanceFieldValue('accountName', ' hdfc bank - raipur '), 'HDFC BANK - RAIPUR');
  assert.equal(sanitizeFinanceFieldValue('reference', 'upi/ref_123-abc'), 'UPI/REF_123-ABC');
  assert.equal(sanitizeFinanceFieldValue('chequeNumber', ' 012345 / a '), '012345 / A');
  assert.equal(sanitizeFinanceFieldValue('invoiceNumber', 'inv/2026-27.01'), 'INV/2026-27.01');
});

test('preserves a trailing space while the user is typing', () => {
  assert.equal(sanitizeFinanceFieldValue('name', 'Office ', { finalize: false }), 'Office ');
  assert.equal(sanitizeFinanceFieldValue('accountName', 'HDFC ', { finalize: false }), 'HDFC ');
});

test('removes control characters and unsafe symbols from finance text fields', () => {
  assert.equal(sanitizeFinanceFieldValue('name', '  Vendor\u0000  Name  '), 'Vendor Name');
  assert.equal(sanitizeFinanceFieldValue('reference', '<UTR#123>'), 'UTR123');
  assert.equal(sanitizeFinanceFieldValue('narration', 'Office\u0007 supplies\n\n paid'), 'Office supplies\n\npaid');
  assert.equal(sanitizeFinanceFieldValue('notes', 'Internal\u0000 note\nApproved'), 'Internal note\nApproved');
});

test('sanitizes a complete finance form before submission', () => {
  const form = sanitizeFinanceFormData({
    accountName: ' axis bank ',
    name: '  ABC Traders  ',
    narration: ' UPI / office rent ',
    reference: 'utr/001',
    notes: ' note ',
    amount: '1250.50',
  });

  assert.deepEqual(form, {
    accountName: 'AXIS BANK',
    name: 'ABC Traders',
    narration: 'UPI / office rent',
    reference: 'UTR/001',
    notes: 'note',
    amount: '1250.50',
  });
});
