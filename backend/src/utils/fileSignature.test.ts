import assert from 'node:assert/strict';
import test from 'node:test';
import { contentMatchesMimeType } from './fileSignature';

const bytes = (...values: number[]) => Buffer.from(values);
const text = (value: string) => Buffer.from(value, 'latin1');

test('real file headers match their declared type', () => {
  assert.ok(contentMatchesMimeType(bytes(0xff, 0xd8, 0xff, 0xe0, 0, 0), 'image/jpeg'));
  assert.ok(contentMatchesMimeType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0), 'image/png'));
  assert.ok(contentMatchesMimeType(text('RIFF\u0000\u0000\u0000\u0000WEBPVP8 '), 'image/webp'));
  assert.ok(contentMatchesMimeType(text('%PDF-1.7\n'), 'application/pdf'));
  assert.ok(contentMatchesMimeType(text('\r\n\r\n%PDF-1.4'), 'application/pdf'));
  assert.ok(contentMatchesMimeType(bytes(0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1), 'application/msword'));
  assert.ok(contentMatchesMimeType(bytes(0x50, 0x4b, 0x03, 0x04, 0x14), 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'));
  assert.ok(contentMatchesMimeType(text('\u0000\u0000\u0000\u0018ftypmp42'), 'video/mp4'));
  assert.ok(contentMatchesMimeType(text('\u0000\u0000\u0000\u0014ftypqt  '), 'video/quicktime'));
  assert.ok(contentMatchesMimeType(text('\u0000\u0000\u0000\u0008wide'), 'video/quicktime'));
  assert.ok(contentMatchesMimeType(bytes(0x1a, 0x45, 0xdf, 0xa3, 0x01), 'video/webm'));
});

test('renamed or disguised files are refused', () => {
  assert.equal(contentMatchesMimeType(text('<html><script>alert(1)</script>'), 'application/pdf'), false);
  assert.equal(contentMatchesMimeType(text('<svg onload=alert(1)>'), 'image/png'), false);
  assert.equal(contentMatchesMimeType(text('MZ\u0090\u0000'), 'image/jpeg'), false);
  assert.equal(contentMatchesMimeType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a), 'image/jpeg'), false);
  assert.equal(contentMatchesMimeType(Buffer.alloc(0), 'image/png'), false);
  assert.equal(contentMatchesMimeType(undefined, 'image/png'), false);
  assert.equal(contentMatchesMimeType(text('%PDF-1.7'), 'text/html'), false);
});

test('a PDF header buried after 1 KB is refused', () => {
  assert.equal(contentMatchesMimeType(Buffer.concat([Buffer.alloc(1100, 0x20), text('%PDF-1.7')]), 'application/pdf'), false);
});
