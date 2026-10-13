import assert from 'node:assert/strict';
import test from 'node:test';
import { getListingFormValidationError } from './listingRequirements.mjs';

test('requires a category before listing submission', () => {
  assert.equal(
    getListingFormValidationError({ category: '', brand: 'JCB', imageCount: 1, hasVideo: true }),
    'Category is required.',
  );
});

test('requires a brand before listing submission', () => {
  assert.equal(
    getListingFormValidationError({ category: 'Excavator', brand: '', imageCount: 1, hasVideo: true }),
    'Brand is required.',
  );
});

test('requires at least one image and one video', () => {
  assert.equal(
    getListingFormValidationError({ category: 'Excavator', brand: 'JCB', imageCount: 0, hasVideo: true }),
    'At least one vehicle image is required.',
  );
  assert.equal(
    getListingFormValidationError({ category: 'Excavator', brand: 'JCB', imageCount: 1, hasVideo: false }),
    'A vehicle video is required.',
  );
});

test('accepts a listing with category, brand, image, and video', () => {
  assert.equal(
    getListingFormValidationError({ category: 'Excavator', brand: 'JCB', imageCount: 2, hasVideo: true }),
    null,
  );
});
