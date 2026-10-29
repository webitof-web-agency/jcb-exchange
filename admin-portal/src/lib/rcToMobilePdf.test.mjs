import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const pageSource = readFileSync(new URL('../components/rcToMobileVerification/RcToMobileVerificationPage.tsx', import.meta.url), 'utf8');
const pdfSource = readFileSync(new URL('../components/rcToMobileVerification/RcToMobilePdfDocument.tsx', import.meta.url), 'utf8');

test('RC to Mobile verification provides preview card, PDF download and history view', () => {
  // Page checks
  assert.match(pageSource, /RcToMobilePdfDocument/);
  assert.match(pageSource, /Download PDF/);
  assert.match(pageSource, /Copy Mobile/);
  assert.match(pageSource, /openDetail/);
  assert.match(pageSource, /rc-to-mobile-/);

  // PDF Document checks
  assert.match(pdfSource, /JCB Exchange/);
  assert.match(pdfSource, /RC to Mobile Linkage Certificate/);
  assert.match(pdfSource, /Vehicle Registration No/);
  assert.match(pdfSource, /Linked Mobile Number/);
  assert.match(pdfSource, /Provider Client ID/);
});
