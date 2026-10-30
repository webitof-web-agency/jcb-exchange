import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getDocumentPreviewMimeType,
  getSafeDocumentPreviewSource,
} from './documentPreview.mjs';

test('uses only an authenticated blob preview source, never the persisted secure path', () => {
  assert.equal(
    getSafeDocumentPreviewSource({
      localObjectUrl: '',
      fetchedObjectUrl: '',
      persistedFileUrl: '/api/documents/secure/drive-passport-photo',
    }),
    '',
  );
  assert.equal(
    getSafeDocumentPreviewSource({
      localObjectUrl: '',
      fetchedObjectUrl: 'blob:http://localhost/preview-1',
      persistedFileUrl: '/api/documents/secure/drive-passport-photo',
    }),
    'blob:http://localhost/preview-1',
  );
});

test('derives a stable preview MIME type for supported passport images', () => {
  assert.equal(getDocumentPreviewMimeType('passport.jpg'), 'image/jpeg');
  assert.equal(getDocumentPreviewMimeType('passport.png'), 'image/png');
  assert.equal(getDocumentPreviewMimeType('passport.webp'), 'image/webp');
});
