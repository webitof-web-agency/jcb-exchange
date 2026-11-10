import assert from 'node:assert/strict';
import test from 'node:test';
import { AiDisabledError, isAiEnabled, requireAiEnabled } from './aiFeatureGate';

test('AI is disabled when the feature flag is absent or not exactly true', () => {
  assert.equal(isAiEnabled({}), false);
  assert.equal(isAiEnabled({ AI_ENABLED: 'false' }), false);
  assert.equal(isAiEnabled({ AI_ENABLED: '1' }), false);
});

test('AI accepts a case-insensitive true feature flag', () => {
  assert.equal(isAiEnabled({ AI_ENABLED: ' TRUE ' }), true);
});

test('AI gate fails closed while disabled', () => {
  assert.throws(() => requireAiEnabled({ AI_ENABLED: 'false' }), (error: unknown) => {
    return error instanceof AiDisabledError && error.code === 'AI_DISABLED';
  });
});
