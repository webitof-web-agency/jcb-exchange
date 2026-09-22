import test from 'node:test';
import assert from 'node:assert/strict';
import { getDriveFileIdsToDelete } from './driveMediaLifecycle';

test('keeps Drive files that are retained during a media edit', () => {
  assert.deepEqual(
    getDriveFileIdsToDelete(
      [
        'https://drive.google.com/uc?id=kept-file',
        'https://drive.google.com/uc?id=removed-file',
      ],
      ['https://drive.google.com/uc?id=kept-file'],
    ),
    ['removed-file'],
  );
});

test('does not delete non-Drive media URLs', () => {
  assert.deepEqual(
    getDriveFileIdsToDelete(['/uploads/public/listing-media/image.webp'], []),
    [],
  );
});

test('compares Drive IDs when the same file uses different URL forms', () => {
  assert.deepEqual(
    getDriveFileIdsToDelete(
      ['https://drive.google.com/uc?id=shared-file'],
      ['/api/documents/secure/drive-shared-file'],
    ),
    [],
  );
});
