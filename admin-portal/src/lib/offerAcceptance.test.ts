import assert from 'node:assert/strict';
import test from 'node:test';

import {
  OFFER_STATUS_ACTION_LABELS,
  buildOfflineAcceptancePayload,
  describeAcceptanceMethod,
  shortHash,
  signatureFileLabel,
  todayIso,
  validateOfflineAcceptance,
} from './offerHrm';

const pdf = { name: 'signed.pdf', size: 2048, type: 'application/pdf' };

test('recording a signed paper acceptance is checked before upload', () => {
  assert.deepEqual(validateOfflineAcceptance({ file: pdf, signedOn: '2026-11-20', place: '', note: '' }, '2026-11-26'), {});
  assert.match(validateOfflineAcceptance({ file: null, signedOn: '2026-11-20', place: '', note: '' }, '2026-11-26').file ?? '', /Choose/);
  assert.match(validateOfflineAcceptance({ file: { name: 'a.docx', size: 10, type: 'application/msword' }, signedOn: '2026-11-20', place: '', note: '' }, '2026-11-26').file ?? '', /PDF, JPG/);
  assert.match(validateOfflineAcceptance({ file: { ...pdf, size: 6 * 1024 * 1024 }, signedOn: '2026-11-20', place: '', note: '' }, '2026-11-26').file ?? '', /5 MB/);
  assert.match(validateOfflineAcceptance({ file: pdf, signedOn: '2026-11-27', place: '', note: '' }, '2026-11-26').signedOn ?? '', /future/);
  assert.match(validateOfflineAcceptance({ file: pdf, signedOn: '', place: '', note: '' }, '2026-11-26').signedOn ?? '', /date/);
  assert.match(validateOfflineAcceptance({ file: pdf, signedOn: '2026-11-20', place: '', note: 'x'.repeat(1001) }, '2026-11-26').note ?? '', /1000/);
  assert.match(todayIso(new Date('2026-11-26T10:00:00Z')), /^\d{4}-\d{2}-\d{2}$/);
});

test('the multipart body carries the file and only the filled fields', () => {
  const payload = buildOfflineAcceptancePayload({ file: new Blob(['x'], { type: 'application/pdf' }), fileName: 'signed.pdf', signedOn: '2026-11-20', place: ' Raipur ', note: '' });
  assert.equal(payload.get('signedOn'), '2026-11-20');
  assert.equal(payload.get('place'), 'Raipur');
  assert.equal(payload.get('note'), null);
  assert.ok(payload.get('signedCopy'));
});

test('acceptance labels', () => {
  assert.equal(OFFER_STATUS_ACTION_LABELS.ACCEPTED, 'Record signed acceptance');
  assert.equal(describeAcceptanceMethod('OFFLINE_HR'), 'Recorded by HR from paper copy');
  assert.equal(describeAcceptanceMethod(null), '-');
  assert.equal(signatureFileLabel('DRAWN'), 'Download signature');
  assert.equal(signatureFileLabel('UPLOADED_SCAN'), 'Download signed copy');
  assert.equal(shortHash('a'.repeat(64)), `${'a'.repeat(12)}…`);
  assert.equal(shortHash(null), '-');
});
