import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const pageSource = readFileSync(new URL('../components/mobileToRcLookup/MobileToRcLookupPage.tsx', import.meta.url), 'utf8');
const pdfSource = readFileSync(new URL('../components/mobileToRcLookup/MobileToRcPdfDocument.tsx', import.meta.url), 'utf8');

test('Mobile to RC lookup provides fleet preview card, PDF download and history view', () => {
  // Page checks
  assert.match(pageSource, /MobileToRcPdfDocument/);
  assert.match(pageSource, /Download PDF/);
  assert.match(pageSource, /Copy Mobile/);
  assert.match(pageSource, /Copy All RC Numbers|Copy All/);
  assert.match(pageSource, /openDetail/);
  assert.match(pageSource, /mobile-to-rc-/);

  // PDF Document checks
  assert.match(pdfSource, /JCB Exchange/);
  assert.match(pdfSource, /Mobile to RC Fleet Registry Report/);
  assert.match(pdfSource, /Queried Mobile Number/);
  assert.match(pdfSource, /Registered Vehicles Count/);
  assert.match(pdfSource, /tableSection/);
});
