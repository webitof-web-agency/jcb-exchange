import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import {
  AVATAR_MAX_BYTES,
  getAvatarPublicPath,
  getAvatarStoragePath,
  hasValidAvatarSignature,
  isAllowedAvatarMimeType,
} from './avatarUpload';

test('avatar uploads accept only supported image types', () => {
  assert.equal(isAllowedAvatarMimeType('image/jpeg'), true);
  assert.equal(isAllowedAvatarMimeType('image/png'), true);
  assert.equal(isAllowedAvatarMimeType('image/webp'), true);
  assert.equal(isAllowedAvatarMimeType('application/pdf'), false);
});

test('avatar uploads enforce the 2 MB server-side limit', () => {
  assert.equal(AVATAR_MAX_BYTES, 2 * 1024 * 1024);
});

test('avatar uploads validate the file signature instead of trusting MIME alone', () => {
  assert.equal(hasValidAvatarSignature(Buffer.from([0xff, 0xd8, 0xff, 0xe0]), 'image/jpeg'), true);
  assert.equal(hasValidAvatarSignature(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), 'image/png'), true);
  assert.equal(hasValidAvatarSignature(Buffer.from('RIFF1234WEBP'), 'image/webp'), true);
  assert.equal(hasValidAvatarSignature(Buffer.from('not-an-image'), 'image/png'), false);
});

test('avatar public paths stay in the avatar namespace', () => {
  assert.equal(getAvatarPublicPath('user-1.webp'), '/uploads/public/avatars/user-1.webp');
});

test('avatar deletion resolves only files inside the avatar directory', () => {
  assert.equal(
    getAvatarStoragePath('/uploads/public/avatars/user-1.webp', 'G:/uploads/public/avatars'),
    path.join('G:/uploads/public/avatars', 'user-1.webp'),
  );
  assert.equal(getAvatarStoragePath('/uploads/public/site-logo/logo.webp', 'G:/uploads/public/avatars'), null);
  assert.equal(getAvatarStoragePath('/uploads/public/avatars/../secret.webp', 'G:/uploads/public/avatars'), null);
});
