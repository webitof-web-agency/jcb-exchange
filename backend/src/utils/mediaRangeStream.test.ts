import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import test from 'node:test';
import { limitReadableToByteRange } from './mediaRangeStream';

test('limits a full Drive stream to the requested inclusive byte range', async () => {
  const source = Readable.from([Buffer.from('0123'), Buffer.from('4567'), Buffer.from('89')]);
  const ranged = limitReadableToByteRange(source, 3, 7);
  const chunks: Buffer[] = [];

  for await (const chunk of ranged) {
    chunks.push(Buffer.from(chunk as Buffer));
  }

  assert.deepEqual(Buffer.concat(chunks).toString(), '34567');
});

test('returns an empty stream when the requested range starts at the end', async () => {
  const source = Readable.from([Buffer.from('0123456789')]);
  const ranged = limitReadableToByteRange(source, 10, 10);
  const chunks: Buffer[] = [];

  for await (const chunk of ranged) {
    chunks.push(Buffer.from(chunk as Buffer));
  }

  assert.equal(Buffer.concat(chunks).length, 0);
});
