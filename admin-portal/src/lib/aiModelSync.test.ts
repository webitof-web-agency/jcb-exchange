import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeAiModelSyncDetail } from './aiModelSync';

test('accepts only a provider and model for shared AI model synchronization', () => {
  assert.deepEqual(
    normalizeAiModelSyncDetail({ provider: 'openai', model: 'gpt-5' }),
    { provider: 'openai', model: 'gpt-5' },
  );
  assert.equal(normalizeAiModelSyncDetail({ provider: '', model: 'gpt-5' }), null);
  assert.equal(normalizeAiModelSyncDetail({ provider: 'openai', model: '' }), null);
  assert.equal(normalizeAiModelSyncDetail({ provider: 'openai', model: 42 }), null);
});
