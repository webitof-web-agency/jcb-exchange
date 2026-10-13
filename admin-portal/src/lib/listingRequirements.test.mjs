import assert from 'node:assert/strict';
import test from 'node:test';
import { getListingFormValidationError } from './listingRequirements.mjs';

test('requires category, brand, one image, and one video for listing forms', () => {
  assert.equal(getListingFormValidationError({ category: '', brand: 'JCB', imageCount: 1, hasVideo: true }), 'Category is required.');
  assert.equal(getListingFormValidationError({ category: 'Excavator', brand: '', imageCount: 1, hasVideo: true }), 'Brand is required.');
  assert.equal(getListingFormValidationError({ category: 'Excavator', brand: 'JCB', imageCount: 0, hasVideo: true }), 'At least one vehicle image is required.');
  assert.equal(getListingFormValidationError({ category: 'Excavator', brand: 'JCB', imageCount: 1, hasVideo: false }), 'A vehicle video is required.');
  assert.equal(getListingFormValidationError({ category: 'Excavator', brand: 'JCB', imageCount: 1, hasVideo: true }), null);
});
