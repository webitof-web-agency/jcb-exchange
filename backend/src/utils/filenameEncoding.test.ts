import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeMultipartFilename } from './filenameEncoding';

test('repairs UTF-8 filenames decoded as latin1 by multipart parsing', () => {
  assert.equal(normalizeMultipartFilename('à¤†à¤§à¤¾à¤°-card.pdf'), 'आधार-card.pdf');
});

test('does not change ordinary ASCII filenames', () => {
  assert.equal(normalizeMultipartFilename('purchase-deed.pdf'), 'purchase-deed.pdf');
});
