import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeListingBillPayload } from './listingBillPayload';

test('normalizes a tax bill payload without changing its selected bill type', () => {
  const payload = normalizeListingBillPayload({
    invoiceType: 'TAX_INVOICE',
    invoiceNumber: ' TAX-100 ',
    invoiceDate: '03/10/2026',
    memberName: ' Buyer ',
    amount: '1250.50',
    taxType: 'INTER_STATE',
    gstRate: '18',
  });

  assert.equal(payload.invoiceType, 'TAX_INVOICE');
  assert.equal(payload.invoiceNumber, 'TAX-100');
  assert.equal(payload.memberName, 'Buyer');
  assert.equal(payload.amount, 1250.5);
  assert.equal(payload.taxType, 'INTER_STATE');
  assert.equal(payload.gstRate, 18);
});

test('rejects unsupported bill types and negative amounts', () => {
  assert.throws(
    () => normalizeListingBillPayload({ invoiceType: 'RECEIPT', amount: 10 }),
    /invoice type/i,
  );
  assert.throws(
    () => normalizeListingBillPayload({ invoiceType: 'NON_TAX', amount: -1 }),
    /amount/i,
  );
});
