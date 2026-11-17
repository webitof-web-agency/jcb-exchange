import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ANALYTICS_AI_PAGE_KEYS,
  analyticsPageKeyFor,
  analyticsPageQuestionKeys,
} from './analyticsAiPage.service';

test('defines stable analytics overview and detail page contracts', () => {
  assert.deepEqual(ANALYTICS_AI_PAGE_KEYS, ['overview', 'listing-detail']);
  for (const pageKey of ANALYTICS_AI_PAGE_KEYS) {
    assert.ok(analyticsPageQuestionKeys(pageKey).length >= 5);
  }
});

test('recognizes analytics page aliases and the current-page context', () => {
  assert.equal(analyticsPageKeyFor('analytics report dikhao'), 'overview');
  assert.equal(analyticsPageKeyFor('listing analytics detail batao'), 'listing-detail');
  assert.equal(analyticsPageKeyFor('anything', { moduleKey: 'analytics-overview' }), 'overview');
});
