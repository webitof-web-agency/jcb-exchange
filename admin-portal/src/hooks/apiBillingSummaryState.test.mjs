import assert from 'node:assert/strict';
import test from 'node:test';

import { shouldFetchApiBillingSummary, shouldPollApiBillingSummary } from './apiBillingSummaryState.ts';

test('waits for the portal token to hydrate before requesting the protected billing summary', () => {
  assert.equal(shouldFetchApiBillingSummary(false, null), false);
  assert.equal(shouldFetchApiBillingSummary(false, 'portal-jwt'), false);
  assert.equal(shouldFetchApiBillingSummary(true, null), false);
  assert.equal(shouldFetchApiBillingSummary(true, 'portal-jwt'), true);
});

test('only polls the wallet while an authenticated portal tab is visible', () => {
  assert.equal(shouldPollApiBillingSummary(false, 'portal-jwt', true), false);
  assert.equal(shouldPollApiBillingSummary(true, null, true), false);
  assert.equal(shouldPollApiBillingSummary(true, 'portal-jwt', false), false);
  assert.equal(shouldPollApiBillingSummary(true, 'portal-jwt', true), true);
});
