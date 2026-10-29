import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const formSource = fs.readFileSync(new URL('./SoldVehicleForm.tsx', import.meta.url), 'utf8');

test('keeps generated KYC PDFs out of the inline document preview while retaining verification preview links', () => {
  assert.doesNotMatch(formSource, /<DeedDocumentPreview label=\{`\$\{group\.title\} PAN verification`/);
  assert.doesNotMatch(formSource, /<DeedDocumentPreview label=\{`\$\{group\.title\} Aadhaar verification`/);
  assert.match(formSource, /previewAvailable=\{Boolean\(verificationPreviews\[`\$\{group\.side\}-pan`\]\)\}/);
});
