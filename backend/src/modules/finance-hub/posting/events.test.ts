import assert from 'node:assert/strict';
import test from 'node:test';
import { createFinanceHubEmitter } from './events';

test('emit queues one row per source event', async () => {
  const rows: unknown[] = [];
  const emit = createFinanceHubEmitter({
    finPostingQueue: { create: async (args) => { rows.push(args.data); return args.data; } },
  });

  assert.equal(await emit('SELL_ACCOUNT_PAYMENT', 'pay-1', 'ADDED'), true);
  assert.deepEqual(rows, [{ sourceType: 'SELL_ACCOUNT_PAYMENT', sourceId: 'pay-1', event: 'ADDED' }]);
});

test('emit never throws into the operational flow when the queue write fails', async () => {
  const logged: string[] = [];
  const emit = createFinanceHubEmitter(
    { finPostingQueue: { create: async () => { throw new Error('relation "FinPostingQueue" does not exist'); } } },
    (message) => logged.push(message),
  );

  assert.equal(await emit('SELL_ACCOUNT', 'sa-1', 'SAVED'), false);
  assert.equal(logged.length, 1);
});

test('emit ignores an empty source id', async () => {
  let calls = 0;
  const emit = createFinanceHubEmitter({ finPostingQueue: { create: async () => { calls += 1; } } });
  assert.equal(await emit('SELL_ACCOUNT', '', 'SAVED'), false);
  assert.equal(calls, 0);
});
