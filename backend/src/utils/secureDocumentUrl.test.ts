import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extractDriveFileIdFromSecureUrl,
  getSecureDocumentUrl,
  getSecureDocumentUrlFromToken,
} from './secureDocumentUrl';

test('uses an internal Drive-backed URL for secure documents', () => {
  const url = getSecureDocumentUrl('1abc_DEF-123');

  assert.equal(url, '/api/documents/secure/drive-1abc_DEF-123');
  assert.equal(getSecureDocumentUrlFromToken('drive-1abc_DEF-123'), url);
  assert.equal(extractDriveFileIdFromSecureUrl(url), '1abc_DEF-123');
});

test('does not treat legacy local secure filenames as Drive file ids', () => {
  assert.equal(
    extractDriveFileIdFromSecureUrl('/api/documents/secure/legacy-document.pdf'),
    null,
  );
});

test('extracts Drive ids from direct Drive links', () => {
  assert.equal(
    extractDriveFileIdFromSecureUrl('https://drive.google.com/uc?id=1abc_DEF-123'),
    '1abc_DEF-123',
  );
});

test('extracts Drive ids from an absolute backend secure URL', () => {
  assert.equal(
    extractDriveFileIdFromSecureUrl('https://api.example.com/api/documents/secure/drive-1abc_DEF-123'),
    '1abc_DEF-123',
  );
});
