import assert from 'node:assert/strict';
import test from 'node:test';
import { marketplaceSmsEvents, recruitmentSmsEvents } from './smsIntegration.service';

test('registers the public marketplace SMS automation event', () => {
  assert.equal(marketplaceSmsEvents.includes('MARKETPLACE_NEW_LISTING_PUBLISHED'), true);
});

test('registers the public recruitment SMS automation event', () => {
  assert.equal(recruitmentSmsEvents.includes('RECRUITMENT_NEW_JOB_PUBLISHED'), true);
});
