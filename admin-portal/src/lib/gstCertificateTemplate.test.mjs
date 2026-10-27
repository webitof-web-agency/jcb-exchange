import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../components/gstVerification/GstCertificatePdfDocument.tsx', import.meta.url), 'utf8');

test('GST certificate template does not contain dummy provider values', () => {
  for (const value of ['System Verified', 'Superintendent', '14:30:29', '>PHOTO<']) {
    assert.equal(source.includes(value), false, `template still contains hardcoded value: ${value}`);
  }
});
