import assert from 'node:assert/strict';
import test from 'node:test';
import { crc32, deflateSync } from 'node:zlib';
import PDFDocument from 'pdfkit';
import { buildAcceptanceCertificatePdf, decodeDrawnSignature } from './offerAcceptanceEvidence';
import { cleanPng, SIGNATURE_LIMITS } from './pngImage';
import { buildSignedOfferLetter } from './signedOfferLetter';

const MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const chunk = (type: string, data: Buffer) => {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, 'ascii');
  const tail = Buffer.alloc(4);
  tail.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])) >>> 0, 0);
  return Buffer.concat([head, data, tail]);
};
const header = (width: number, height: number, depth = 8, colour = 6, interlace = 0) => {
  const data = Buffer.alloc(13);
  data.writeUInt32BE(width, 0);
  data.writeUInt32BE(height, 4);
  data.set([depth, colour, 0, 0, interlace], 8);
  return chunk('IHDR', data);
};
/** An RGBA picture with varied pixels (so it does not compress to almost nothing). */
const pixels = (width: number, height: number) => {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width * 4; x += 1) raw[y * (width * 4 + 1) + 1 + x] = (x * 31 + y * 17) % 251;
  return raw;
};
const png = (width = 40, height = 20, parts: { ihdr?: Buffer; idat?: Buffer; end?: boolean } = {}) => Buffer.concat([
  MAGIC,
  parts.ihdr ?? header(width, height),
  chunk('tEXt', Buffer.alloc(300, 65)),
  chunk('IDAT', parts.idat ?? deflateSync(pixels(width, height))),
  ...(parts.end === false ? [] : [chunk('IEND', Buffer.alloc(0))]),
]);

const good = png();
const stream = deflateSync(pixels(40, 20));
const damaged: Array<[string, Buffer]> = [
  ['compressed data cut short', png(40, 20, { idat: stream.subarray(0, stream.length >> 1) })],
  ['garbage instead of compressed data', png(40, 20, { idat: Buffer.alloc(120, 7) })],
  ['file cut off', good.subarray(0, good.length - 40)],
  ['no end chunk', png(40, 20, { end: false })],
  ['fewer rows than announced', png(40, 20, { idat: deflateSync(pixels(40, 5)) })],
  ['unknown row filter', png(40, 20, { idat: deflateSync(Buffer.alloc((40 * 4 + 1) * 20, 9)) })],
  ['enormous dimensions', png(20000, 20000, { ihdr: header(20000, 20000), idat: stream })],
  ['palette picture', png(40, 20, { ihdr: header(40, 20, 8, 3) })],
  ['interlaced picture', png(40, 20, { ihdr: header(40, 20, 8, 6, 1) })],
  ['only the signature bytes', Buffer.concat([MAGIC, Buffer.alloc(400, 1)])],
];

test('a sound picture is rebuilt with only what a reader needs', () => {
  const clean = cleanPng(good, SIGNATURE_LIMITS);
  assert.ok(clean);
  assert.ok(!clean.includes(Buffer.from('tEXt')));
  assert.deepEqual(cleanPng(clean, SIGNATURE_LIMITS), clean);
});

test('damaged or oversized pictures never reach a PDF library', { timeout: 10_000 }, () => {
  for (const [what, bytes] of damaged) {
    assert.equal(cleanPng(bytes, SIGNATURE_LIMITS), null, what);
    assert.equal(decodeDrawnSignature(`data:image/png;base64,${bytes.toString('base64')}`), null, what);
  }
});

const letter = () => new Promise<Buffer>((resolve) => {
  const document = new PDFDocument({ size: 'A4' });
  const parts: Buffer[] = [];
  document.on('data', (part: Buffer) => parts.push(part));
  document.once('end', () => resolve(Buffer.concat(parts)));
  document.text('Signature: _______________________________', 48, 400);
  document.end();
});

test('stamping and the certificate carry on without a damaged picture', { timeout: 20_000 }, async () => {
  for (const [what, bytes] of damaged) {
    const signed = await buildSignedOfferLetter(await letter(), { signature: bytes, signerName: 'Asha Singh', signedOn: '26/11/2026', place: 'Raipur', statement: 'Record.', letterNo: 'L-1', companyName: 'JCB Exchange' });
    assert.ok(signed.length > 500, what);
    const certificate = await buildAcceptanceCertificatePdf({
      companyName: 'JCB Exchange', letterNo: 'L-1', candidateName: 'Asha Singh', designation: 'Executive', department: 'Sales', placeOfPosting: 'Raipur', joiningDate: '2026-12-01',
      method: 'UPLOADED_SCAN', acceptedName: 'Asha Singh', place: 'Raipur', acceptedAt: new Date(), ipAddress: null, userAgent: null, documentHash: 'a'.repeat(64), signatureHash: 'b'.repeat(64), signatureImage: bytes, recordedBy: null, note: null,
    });
    assert.ok(certificate.length > 500, what);
  }
});
