import assert from 'node:assert/strict';
import test from 'node:test';
import {
  checkSignedCopyFile,
  dataUrlBytes,
  describeMonths,
  namesMatch,
  normalizePersonName,
  salaryBreakupTotals,
  validateAcceptanceForm,
  validateDeclineReason,
} from './offerResponse.mjs';

test('names compare like the server does', () => {
  assert.equal(normalizePersonName(' Dr. Ravi  K. Sharma '), 'dr ravi k sharma');
  assert.equal(namesMatch('ravi k sharma', 'Ravi K. Sharma'), true);
  assert.equal(namesMatch('Ravi Sharma', 'Ravi K. Sharma'), false);
  assert.equal(namesMatch('  ', ''), false);
});

test('signed copy file checks', () => {
  assert.equal(checkSignedCopyFile({ name: 'signed.pdf', size: 1000, type: 'application/pdf' }), null);
  assert.equal(checkSignedCopyFile({ name: 'photo.JPG', size: 1000, type: 'image/jpeg' }), null);
  assert.match(checkSignedCopyFile({ name: 'doc.docx', size: 1000, type: 'application/msword' }) ?? '', /PDF, JPG/);
  assert.match(checkSignedCopyFile({ name: 'big.pdf', size: 6 * 1024 * 1024, type: 'application/pdf' }) ?? '', /5 MB/);
  assert.match(checkSignedCopyFile(null) ?? '', /Choose/);
});

test('acceptance form checks per method', () => {
  const base = { method: 'TYPED', fullName: 'ravi k sharma', place: 'Pune', consent: true };
  assert.deepEqual(validateAcceptanceForm(base, 'Ravi K. Sharma'), {});
  assert.ok(validateAcceptanceForm({ ...base, fullName: 'Someone' }, 'Ravi K. Sharma').fullName);
  assert.ok(validateAcceptanceForm({ ...base, consent: false }, 'Ravi K. Sharma').consent);
  assert.ok(validateAcceptanceForm({ ...base, place: 'P' }, 'Ravi K. Sharma').place);
  assert.ok(validateAcceptanceForm({ ...base, method: 'DRAWN' }, 'Ravi K. Sharma').signature);
  assert.deepEqual(validateAcceptanceForm({ ...base, method: 'DRAWN', drawnSignature: 'data:image/png;base64,iVBORw0KGgo=' }, 'Ravi K. Sharma'), {});
  assert.ok(validateAcceptanceForm({ ...base, method: 'UPLOADED_SCAN' }, 'Ravi K. Sharma').file);
  assert.ok(validateAcceptanceForm({ ...base, method: 'OTHER' }, 'Ravi K. Sharma').method);
});

test('decline reason, data URL size, totals, months', () => {
  assert.ok(validateDeclineReason('no'));
  assert.equal(validateDeclineReason('Joining elsewhere'), null);
  assert.ok(validateDeclineReason('x'.repeat(1001)));
  assert.equal(dataUrlBytes('data:image/png;base64,AAAA'), 3);
  assert.deepEqual(
    salaryBreakupTotals([
      { componentType: 'EARNING', monthlyAmount: 20000 },
      { componentType: 'EMPLOYER_CONTRIBUTION', monthlyAmount: 1800 },
    ]),
    { grossMonthly: 20000, ctcMonthly: 21800, grossYearly: 240000, ctcYearly: 261600 },
  );
  assert.equal(describeMonths('6'), '6 months');
  assert.equal(describeMonths(''), '-');
});
