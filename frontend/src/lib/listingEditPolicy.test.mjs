import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { shouldSyncListingAvailability } from './listingEditPolicy.mjs';

const sellVehicleModalSource = fs.readFileSync(new URL('../components/sell/SellVehicleModal.tsx', import.meta.url), 'utf8');

test('hidden listings save edits without attempting an availability transition', () => {
  assert.equal(shouldSyncListingAvailability('SUSPENDED', 'AVAILABLE'), false);
  assert.equal(shouldSyncListingAvailability('UNLISTED', 'SOLD'), false);
  assert.equal(shouldSyncListingAvailability('BLOCKED', 'AVAILABLE'), false);
});

test('normal listings can still synchronize available and sold status', () => {
  assert.equal(shouldSyncListingAvailability('PUBLISHED', 'AVAILABLE'), true);
  assert.equal(shouldSyncListingAvailability('PAUSED', 'SOLD'), true);
  assert.equal(shouldSyncListingAvailability('PUBLISHED', 'PENDING'), false);
});

test('the edit modal applies the hidden-listing availability policy', () => {
  assert.match(sellVehicleModalSource, /shouldSyncListingAvailability/);
});
