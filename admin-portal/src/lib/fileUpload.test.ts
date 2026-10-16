import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MAX_PASSPORT_PHOTO_INPUT_SIZE,
  getPassportPhotoUploadValidationError,
  prepareFileForUpload,
} from './fileUpload';

const file = (type: string, size: number) => ({ type, size }) as File;

test('accepts supported passport photo images up to 3MB', () => {
  assert.equal(getPassportPhotoUploadValidationError(file('image/jpeg', MAX_PASSPORT_PHOTO_INPUT_SIZE)), null);
  assert.equal(getPassportPhotoUploadValidationError(file('image/webp', MAX_PASSPORT_PHOTO_INPUT_SIZE - 1)), null);
});

test('rejects non-images and passport photos above 3MB', () => {
  assert.equal(getPassportPhotoUploadValidationError(file('application/pdf', 10)), 'Only JPG, PNG, and WEBP passport photos are allowed.');
  assert.equal(
    getPassportPhotoUploadValidationError(file('image/png', MAX_PASSPORT_PHOTO_INPUT_SIZE + 1)),
    'Passport photo size must be 3MB or smaller.',
  );
});

test('passes valid PDF KYC documents through without video compression', async () => {
  const selectedFile = file('application/pdf', 1024);
  const preparedFile = await prepareFileForUpload(selectedFile);

  assert.equal(preparedFile, selectedFile);
});
