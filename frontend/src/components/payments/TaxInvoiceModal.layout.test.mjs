import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const modalSource = readFileSync(new URL('./SubscriptionInvoiceModal.tsx', import.meta.url), 'utf8');
const pdfSource = readFileSync(new URL('./SubscriptionInvoicePDFTemplate.tsx', import.meta.url), 'utf8');

test('tax invoice preview uses the sample layout without replacing dynamic invoice data', () => {
  assert.match(modalSource, /w-full max-w-2xl max-h-\[92vh\]/);
  assert.match(modalSource, /className="p-6 sm:p-8[^\"]*" id="tax-invoice-content"/);
  assert.match(modalSource, /invoiceSettings\.companyName/);
  assert.match(modalSource, /payment\.memberName/);
  assert.match(modalSource, /payment\.planName/);
  assert.match(modalSource, /invoiceSettings\.termsAndConditions/);
});

test('downloaded invoice keeps the same dynamic data contract', () => {
  assert.match(pdfSource, /invoiceSettings\?\.companyName/);
  assert.match(pdfSource, /payment\?\.memberName/);
  assert.match(pdfSource, /payment\?\.planName/);
  assert.match(pdfSource, /invoiceSettings\?\.termsAndConditions/);
  assert.ok(
    pdfSource.indexOf('payment?.customerCity') < pdfSource.indexOf('payment?.customerMobile'),
    'downloaded invoice should keep the sample customer detail order'
  );
});
