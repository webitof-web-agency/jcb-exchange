import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isListingCompletionSlotUploading,
  setListingCompletionSlotUploading,
} from './listingCompletionMedia';

test('uploading state is isolated to the selected media slot', () => {
  const rearUploading = setListingCompletionSlotUploading({}, 'rear-view', true);

  assert.equal(isListingCompletionSlotUploading(rearUploading, 'rear-view'), true);
  assert.equal(isListingCompletionSlotUploading(rearUploading, 'front-view'), false);
});

test('completing one upload does not clear another slot upload', () => {
  const uploading = setListingCompletionSlotUploading(
    setListingCompletionSlotUploading({}, 'rear-view', true),
    'left-side',
    true,
  );

  const next = setListingCompletionSlotUploading(uploading, 'rear-view', false);

  assert.equal(isListingCompletionSlotUploading(next, 'rear-view'), false);
  assert.equal(isListingCompletionSlotUploading(next, 'left-side'), true);
});
