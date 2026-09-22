import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSecureDocumentPath } from './secureDocumentPath.mjs';

test('keeps the authenticated internal secure endpoint under the API client base', () => {
  assert.equal(
    normalizeSecureDocumentPath('/api/documents/secure/drive-1abc_DEF-123'),
    '/documents/secure/drive-1abc_DEF-123',
  );
});

test('converts legacy direct Drive links to the authenticated secure endpoint', () => {
  assert.equal(
    normalizeSecureDocumentPath('https://drive.google.com/uc?id=1abc_DEF-123'),
    '/documents/secure/drive-1abc_DEF-123',
  );
});
