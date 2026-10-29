import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const pageSource = readFileSync(new URL('../components/rcChallanVerification/RcChallanVerificationPage.tsx', import.meta.url), 'utf8');
const pdfSource = readFileSync(new URL('../components/rcChallanVerification/RcChallanPdfDocument.tsx', import.meta.url), 'utf8');

test('RC Challan result offers a complete PDF download', () => {
  assert.match(pageSource, /RcChallanPdfDocument/);
  assert.match(pageSource, /Download PDF/);
  assert.match(pdfSource, /providerData/);
  assert.match(pdfSource, /offenseDetailsList/);
  assert.match(pdfSource, /challanDateTime/);
});
