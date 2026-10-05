import assert from 'node:assert/strict';
import test from 'node:test';
import { getListingSaveResponse } from './listingSaveResponse';

test('keeps the complete listing returned by PUT after availability sync', () => {
  const updateResponse = { listing: { id: 'listing-1', description: 'Engine number: EN-1' }, message: 'updated' };
  const availabilityResponse = { listing: { id: 'listing-1', status: 'PUBLISHED' }, message: 'availability updated' };

  assert.deepEqual(getListingSaveResponse(updateResponse, availabilityResponse), updateResponse);
});
