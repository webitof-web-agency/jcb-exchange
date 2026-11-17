import assert from 'node:assert/strict';
import test from 'node:test';
import { buildLocalAiAnswer } from './aiLocalAnswer.service';

test('buildLocalAiAnswer gives a readable live-data answer without a provider', () => {
  const answer = buildLocalAiAnswer({
    message: 'finance ka summary batao',
    label: 'Finance summary',
    dataAvailability: 'AVAILABLE',
    data: {
      periodDays: 30,
      inflow: 125000,
      outflow: 90000,
      net: 35000,
      review: { health: 'HEALTHY', recommendation: 'Collections are on track.' },
      items: [{ status: 'OPEN', count: 2, amount: 4500 }],
    },
  });

  assert.match(answer, /Finance summary/);
  assert.match(answer, /periodDays: 30/);
  assert.match(answer, /inflow: 125000/);
  assert.match(answer, /status: OPEN/);
  assert.match(answer, /live read-only data/i);
});

test('buildLocalAiAnswer does not convert unavailable data into zero', () => {
  const answer = buildLocalAiAnswer({
    message: 'show finance',
    label: 'Finance summary',
    dataAvailability: 'UNAVAILABLE',
    dataAvailabilityMessage: 'Finance service is unavailable right now.',
    data: null,
  });

  assert.match(answer, /unavailable/i);
  assert.match(answer, /Finance service is unavailable right now/);
  assert.doesNotMatch(answer, /total: 0/i);
});
