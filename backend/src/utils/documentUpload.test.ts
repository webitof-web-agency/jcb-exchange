import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MAX_LISTING_VIDEO_UPLOAD_SIZE,
  MAX_PASSPORT_PHOTO_UPLOAD_SIZE,
  getUploadFileSizeLimit,
  isAllowedPassportPhotoFile,
} from './documentUpload';

test('allows only supported passport photo images', () => {
  assert.equal(isAllowedPassportPhotoFile('image/jpeg', 'passport.jpg'), true);
  assert.equal(isAllowedPassportPhotoFile('image/png', 'passport.png'), true);
  assert.equal(isAllowedPassportPhotoFile('application/pdf', 'passport.pdf'), false);
  assert.equal(isAllowedPassportPhotoFile('image/jpeg', 'passport.pdf'), false);
});

test('enforces a 3MB passport photo upload limit', () => {
  assert.equal(MAX_PASSPORT_PHOTO_UPLOAD_SIZE, 3 * 1024 * 1024);
  assert.equal(getUploadFileSizeLimit('passport-photo'), MAX_PASSPORT_PHOTO_UPLOAD_SIZE);
});

test('allows listing videos up to the client input limit for direct upload', () => {
  assert.equal(MAX_LISTING_VIDEO_UPLOAD_SIZE, 30 * 1024 * 1024);
  assert.equal(getUploadFileSizeLimit('listing-media'), MAX_LISTING_VIDEO_UPLOAD_SIZE);
});
