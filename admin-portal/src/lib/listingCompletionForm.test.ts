import assert from 'node:assert/strict';
import test from 'node:test';
import { getListingCompletionMediaError } from './listingCompletionForm';

test('owner completion blocks a submission without a vehicle photo', () => {
  assert.equal(getListingCompletionMediaError({
    imageCount: 1,
    hasFrontPhoto: false,
    hasVideo: true,
  }), 'A front vehicle photo is required.');
});

test('owner completion accepts media without any listing metadata fields', () => {
  assert.equal(getListingCompletionMediaError({
    imageCount: 1,
    hasFrontPhoto: true,
    hasVideo: true,
  }), null);
});

test('completion form blocks final submission without the required walkaround video', () => {
  assert.equal(getListingCompletionMediaError({
    imageCount: 1,
    hasFrontPhoto: true,
    hasVideo: false,
  }), 'A walkaround video is required.');
});
