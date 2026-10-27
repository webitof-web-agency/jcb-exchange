import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeBoardQuery, boardShowsClosedStages } from './boardQuery';

test('board query keeps list filters while removing pagination controls', () => {
  assert.deepEqual(
    normalizeBoardQuery({ view: 'won', status: 'WON', ownerId: 'me', page: '2', pageSize: '50' }),
    { view: 'won', status: 'WON', ownerId: 'me' },
  );
});

test('board displays terminal columns for closed lead views', () => {
  assert.equal(boardShowsClosedStages({ view: 'all' }), true);
  assert.equal(boardShowsClosedStages({ view: 'open' }), false);
  assert.equal(boardShowsClosedStages({ status: 'WON' }), true);
});

test('board recognizes configured terminal stages instead of only Won/Lost', () => {
  assert.equal(boardShowsClosedStages({ status: 'ARCHIVED' }, ['ARCHIVED']), true);
  assert.equal(boardShowsClosedStages({ status: 'REVIEW' }, ['ARCHIVED']), false);
});
