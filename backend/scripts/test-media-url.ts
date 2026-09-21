import assert from 'node:assert/strict';
import { normalizeRemoteMediaUrl } from '../src/utils/mediaUrl';

assert.equal(
  normalizeRemoteMediaUrl('/uploads/public/finance-support/legacy.webp'),
  null,
);
assert.equal(
  normalizeRemoteMediaUrl('http://localhost:5002/uploads/public/listings/legacy.webp'),
  null,
);
assert.equal(
  normalizeRemoteMediaUrl('https://drive.google.com/uc?id=drive-file-id'),
  'https://drive.google.com/uc?id=drive-file-id',
);
assert.equal(
  normalizeRemoteMediaUrl('  https://cdn.example.com/machine.webp  '),
  'https://cdn.example.com/machine.webp',
);

console.log('media URL policy tests passed');
