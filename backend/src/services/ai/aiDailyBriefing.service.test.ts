import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getBriefingDateKey,
  getBriefingDateUtc,
  getBriefingScopeKey,
  getRetryDelayMs,
  buildDailyBriefingPrompt,
} from './aiDailyBriefing.service';

test('daily briefing date uses Asia/Kolkata at the UTC day boundary', () => {
  assert.equal(getBriefingDateKey(new Date('2026-11-08T18:29:59.000Z')), '2026-11-08');
  assert.equal(getBriefingDateKey(new Date('2026-11-08T18:30:00.000Z')), '2026-11-09');
  assert.equal(getBriefingDateUtc('2026-11-09').toISOString(), '2026-11-09T00:00:00.000Z');
});

test('briefing scope key is stable for one tenant and operator', () => {
  assert.equal(getBriefingScopeKey('platform', 'employee-1'), 'platform:user:employee-1');
  assert.equal(getBriefingScopeKey('platform', 'employee-1'), getBriefingScopeKey('platform', 'employee-1'));
  assert.notEqual(getBriefingScopeKey('platform', 'employee-1'), getBriefingScopeKey('platform', 'employee-2'));
});

test('retry delay grows with attempts but is capped', () => {
  assert.equal(getRetryDelayMs(1), 60_000);
  assert.equal(getRetryDelayMs(2), 120_000);
  assert.equal(getRetryDelayMs(99), 6 * 60 * 60 * 1000);
});

test('briefing prompt stays within the gateway message budget because snapshot is separate context', () => {
  assert.ok(buildDailyBriefingPrompt('2026-11-09').length < 4000);
});
