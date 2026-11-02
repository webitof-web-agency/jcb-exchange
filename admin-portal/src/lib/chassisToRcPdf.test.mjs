import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const pageSource = readFileSync(new URL('../components/chassisToRcVerification/ChassisToRcVerificationPage.tsx', import.meta.url), 'utf8');
const pdfPath = new URL('../components/chassisToRcVerification/ChassisToRcPdfDocument.tsx', import.meta.url);
const pdfSource = existsSync(pdfPath) ? readFileSync(pdfPath, 'utf8') : '';

test('Chassis-to-RC result offers an A4 full-details PDF download', () => {
  assert.ok(existsSync(pdfPath), 'Chassis-to-RC PDF document must exist');
  assert.match(pageSource, /ChassisToRcPdfDocument/);
  assert.match(pageSource, /Download PDF/);
  assert.match(pageSource, /downloadPdf/);
  assert.match(pdfSource, /<Page\s+size="A4"/);
  assert.match(pdfSource, /vehicleChasiNumber/);
  assert.match(pdfSource, /vehicleEngineNumber/);
  assert.match(pdfSource, /ownerHistory/);
  assert.match(pdfSource, /challanDetails/);
  assert.match(pdfSource, /Object\.entries/);
});

test('Chassis-to-RC PDF keeps provider and verification metadata in the document', () => {
  assert.match(pdfSource, /providerClientId/);
  assert.match(pdfSource, /maskedChassisNumber/);
  assert.match(pdfSource, /requestedBy/);
  assert.match(pdfSource, /completedAt/);
  assert.match(pdfSource, /System Record Reference ID/);
});
