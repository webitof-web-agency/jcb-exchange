import assert from 'node:assert/strict';
import test from 'node:test';
import { runDailyBriefingForRecipient, type DailyBriefingWorkerDependencies } from './aiDailyBriefing.job';

const recipient = {
  userId: 'employee-1',
  role: 'EMPLOYEE' as const,
  permissions: ['ai.use', 'dashboard.view'],
};

const dependencyFactory = (overrides: Partial<DailyBriefingWorkerDependencies> = {}) => {
  const calls = { generate: 0, complete: 0, failed: 0 };
  const dependencies: DailyBriefingWorkerDependencies = {
    now: () => new Date('2026-11-09T06:00:00.000Z'),
    lockToken: () => 'lock-1',
    ensureBriefing: async () => ({ id: 'briefing-1', status: 'GENERATING', attemptCount: 0 }),
    claimBriefing: async () => true,
    collectSnapshot: async () => ({ sections: [{ toolName: 'dashboard.summary', label: 'Dashboard summary', data: { pendingKyc: 2 } }] }),
    generate: async () => {
      calls.generate += 1;
      return { answer: 'Review two pending KYC cases first.', provider: 'openai', model: 'test-model' };
    },
    completeBriefing: async () => { calls.complete += 1; },
    failBriefing: async () => { calls.failed += 1; },
    ...overrides,
  };
  return { dependencies, calls };
};

test('duplicate worker execution is stopped by the database claim result', async () => {
  const { dependencies, calls } = dependencyFactory({ claimBriefing: async () => false });
  const result = await runDailyBriefingForRecipient(recipient, dependencies);
  assert.equal(result.status, 'locked');
  assert.equal(calls.generate, 0);
  assert.equal(calls.complete, 0);
});

test('successful generation completes the cache row once', async () => {
  const { dependencies, calls } = dependencyFactory();
  const result = await runDailyBriefingForRecipient(recipient, dependencies);
  assert.equal(result.status, 'generated');
  assert.equal(calls.generate, 1);
  assert.equal(calls.complete, 1);
  assert.equal(calls.failed, 0);
});

test('provider failure is persisted for a later retry', async () => {
  let generateCalls = 0;
  const { dependencies, calls } = dependencyFactory({
    generate: async () => { generateCalls += 1; throw new Error('provider unavailable'); },
  });
  const result = await runDailyBriefingForRecipient(recipient, dependencies);
  assert.equal(result.status, 'failed');
  assert.equal(generateCalls, 1);
  assert.equal(calls.generate, 0);
  assert.equal(calls.complete, 0);
  assert.equal(calls.failed, 1);
});
