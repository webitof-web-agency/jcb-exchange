import test from 'node:test';
import assert from 'node:assert/strict';
import { deflateSync } from 'node:zlib';
import {
  buildAcceptanceCertificatePdf,
  decodeDrawnSignature,
  namesMatch,
  sha256Hex,
  validateCandidateAcceptance,
} from './offerAcceptanceEvidence';

// A real (tiny but valid) PNG, padded with a text chunk so it passes the minimum size.
const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buffer: Buffer) => {
  let c = 0xffffffff;
  for (const byte of buffer) c = crcTable[(c ^ byte) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type: string, data: Buffer) => {
  const length = Buffer.alloc(4); length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
};
const header = Buffer.alloc(13); header.writeUInt32BE(1, 0); header.writeUInt32BE(1, 4); header[8] = 8; header[9] = 6;
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', header),
  chunk('tEXt', Buffer.from(`Comment\0${'x'.repeat(300)}`)),
  chunk('IDAT', deflateSync(Buffer.from([0, 0, 0, 0, 255]))),
  chunk('IEND', Buffer.alloc(0)),
]);
const pngDataUrl = `data:image/png;base64,${png.toString('base64')}`;

test('names match regardless of case, dots and spacing', () => {
  assert.equal(namesMatch('ravi  k. sharma', 'Ravi K Sharma'), true);
  assert.equal(namesMatch('Ravi Sharma', 'Ravi K Sharma'), false);
  assert.equal(namesMatch('   ', ''), false);
});

test('a drawn signature must be a real PNG of reasonable size', () => {
  assert.ok(decodeDrawnSignature(pngDataUrl));
  assert.equal(decodeDrawnSignature('data:image/jpeg;base64,AAAA'), null);
  assert.equal(decodeDrawnSignature(`data:image/png;base64,${Buffer.alloc(400, 1).toString('base64')}`), null, 'not a PNG');
  assert.equal(decodeDrawnSignature(123), null);
});

test('what the candidate sends with Accept is checked', () => {
  const base = { method: 'TYPED', fullName: 'ravi k sharma', place: 'Pune', consent: 'true' };
  assert.ok('value' in validateCandidateAcceptance(base, 'Ravi K. Sharma', false));
  assert.match((validateCandidateAcceptance({ ...base, fullName: 'Someone Else' }, 'Ravi K. Sharma', false) as { error: string }).error, /must match/);
  assert.match((validateCandidateAcceptance({ ...base, consent: 'false' }, 'Ravi K. Sharma', false) as { error: string }).error, /confirm/);
  assert.match((validateCandidateAcceptance({ ...base, place: '' }, 'Ravi K. Sharma', false) as { error: string }).error, /place/);
  assert.match((validateCandidateAcceptance({ ...base, method: 'DRAWN' }, 'Ravi K. Sharma', false) as { error: string }).error, /Draw/);
  assert.ok('value' in validateCandidateAcceptance({ ...base, method: 'DRAWN', drawnSignature: pngDataUrl }, 'Ravi K. Sharma', false));
  assert.match((validateCandidateAcceptance({ ...base, method: 'UPLOADED_SCAN' }, 'Ravi K. Sharma', false) as { error: string }).error, /Upload/);
  assert.ok('value' in validateCandidateAcceptance({ ...base, method: 'UPLOADED_SCAN' }, 'Ravi K. Sharma', true));
  assert.match((validateCandidateAcceptance({ ...base, method: 'OFFLINE_HR' }, 'Ravi K. Sharma', true) as { error: string }).error, /Choose how/);
});

test('the acceptance certificate is a PDF for every method', async () => {
  for (const method of ['TYPED', 'DRAWN', 'UPLOADED_SCAN', 'OFFLINE_HR'] as const) {
    const pdf = await buildAcceptanceCertificatePdf({
      companyName: 'JCB Exchange', letterNo: 'JCB/OFFER/2026/APP-1', candidateName: 'Ravi K Sharma', designation: 'Sales Executive',
      department: 'Sales', placeOfPosting: 'Pune, Maharashtra', joiningDate: '2026-12-01', method, acceptedName: 'Ravi K Sharma',
      place: 'Pune', acceptedAt: new Date('2026-11-26T10:00:00Z'), ipAddress: '203.0.113.5', userAgent: 'Test browser',
      documentHash: sha256Hex(Buffer.from('letter')), signatureHash: method === 'TYPED' ? null : sha256Hex(png),
      signatureImage: method === 'DRAWN' ? png : null, recordedBy: method === 'OFFLINE_HR' ? 'HR User' : null, note: method === 'OFFLINE_HR' ? 'Signed at Raipur office' : null,
    });
    assert.equal(pdf.subarray(0, 5).toString('ascii'), '%PDF-', method);
  }
});

test('names and places are written in English letters; the certificate never draws unsupported glyphs', async () => {
  const { pdfSafeText } = await import('./offerAcceptanceEvidence.js');
  const base = { method: 'TYPED', fullName: 'Ravi K Sharma', place: 'Pune', consent: 'true' };
  assert.match((validateCandidateAcceptance({ ...base, place: 'पुणे' }, 'Ravi K Sharma', false) as { error: string }).error, /English/);
  assert.match((validateCandidateAcceptance({ ...base, fullName: 'रवि शर्मा' }, 'रवि शर्मा', false) as { error: string }).error, /English/);
  assert.ok('value' in validateCandidateAcceptance({ ...base, place: 'Navi Mumbai (W)' }, 'Ravi K Sharma', false));
  assert.equal(pdfSafeText('Pune – ₹5 पुणे'), 'Pune – ₹5 ????');
});
