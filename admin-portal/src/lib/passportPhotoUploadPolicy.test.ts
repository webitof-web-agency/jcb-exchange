import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getPassportPhotoUploadValidationError,
  isCanonicalPassportPhoto,
  MAX_PASSPORT_PHOTO_INPUT_SIZE,
  TARGET_MAX_PASSPORT_PHOTO_SIZE,
} from './passportPhotoUploadPolicy';

test('accepts a passport photo at the 3MB input boundary', () => {
  assert.equal(getPassportPhotoUploadValidationError({ type: 'image/jpeg', size: MAX_PASSPORT_PHOTO_INPUT_SIZE }), null);
});

test('rejects passport photos above the 3MB input limit', () => {
  assert.match(
    getPassportPhotoUploadValidationError({ type: 'image/jpeg', size: MAX_PASSPORT_PHOTO_INPUT_SIZE + 1 }) || '',
    /3MB or smaller/
  );
});

test('recognizes only bounded WebP output as canonical passport photo data', () => {
  assert.equal(
    isCanonicalPassportPhoto({ type: 'image/webp', name: 'partner.webp', size: TARGET_MAX_PASSPORT_PHOTO_SIZE }),
    true
  );
  assert.equal(
    isCanonicalPassportPhoto({ type: 'image/png', name: 'partner.png', size: 100 }),
    false
  );
});
