import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import { redactSensitiveData } from './aiRedaction';
import {
  AiDatabaseError,
  AiDatabaseService,
  type AiDatabaseRepository,
} from './aiDatabase.service';
import { auditHmacHex } from './aiSecurity.service';

const hash = (value: string) => createHash('sha256').update(value, 'utf8').digest('hex');

const createRepositoryMock = (): AiDatabaseRepository & {
  calls: Record<string, unknown[]>;
} => {
  const calls: Record<string, unknown[]> = {};
  const track = <TInput, TResult>(name: string, result: TResult) => {
    return async (input: TInput): Promise<TResult> => {
      (calls[name] ??= []).push(input);
      return result;
    };
  };

  return {
    calls,
    createRun: track<Parameters<AiDatabaseRepository['createRun']>[0], Awaited<ReturnType<AiDatabaseRepository['createRun']>>>('createRun', { id: 'run-1' }),
    completeRun: track<Parameters<AiDatabaseRepository['completeRun']>[0], Awaited<ReturnType<AiDatabaseRepository['completeRun']>>>('completeRun', undefined),
    failRun: track<Parameters<AiDatabaseRepository['failRun']>[0], Awaited<ReturnType<AiDatabaseRepository['failRun']>>>('failRun', undefined),
    createToolCall: track<Parameters<AiDatabaseRepository['createToolCall']>[0], Awaited<ReturnType<AiDatabaseRepository['createToolCall']>>>('createToolCall', { id: 'tool-1' }),
    upsertFeedback: track<Parameters<AiDatabaseRepository['upsertFeedback']>[0], Awaited<ReturnType<AiDatabaseRepository['upsertFeedback']>>>('upsertFeedback', { id: 'feedback-1' }),
    upsertBudgetUsage: track<Parameters<AiDatabaseRepository['upsertBudgetUsage']>[0], Awaited<ReturnType<AiDatabaseRepository['upsertBudgetUsage']>>>('upsertBudgetUsage', { id: 'budget-1' }),
    createActionProposal: track<Parameters<AiDatabaseRepository['createActionProposal']>[0], Awaited<ReturnType<AiDatabaseRepository['createActionProposal']>>>('createActionProposal', { id: 'proposal-1' }),
    createApproval: track<Parameters<AiDatabaseRepository['createApproval']>[0], Awaited<ReturnType<AiDatabaseRepository['createApproval']>>>('createApproval', { id: 'approval-1' }),
    upsertDailyBriefing: track<Parameters<AiDatabaseRepository['upsertDailyBriefing']>[0], Awaited<ReturnType<AiDatabaseRepository['upsertDailyBriefing']>>>('upsertDailyBriefing', { id: 'briefing-1' }),
  };
};

const firstCall = (repository: { calls: Record<string, unknown[]> }, name: string): unknown => {
  const values = repository.calls[name];
  assert.ok(values);
  return values[0];
};

test('startRun validates bounded identifiers and delegates a safe record', async () => {
  const repository = createRepositoryMock();
  const service = new AiDatabaseService(repository);

  const result = await service.startRun({
    requestId: 'request-1',
    actorUserId: 'user-1',
    feature: 'dashboard_summary',
    provider: 'openai',
    modelAlias: 'gpt-4o-mini',
    promptHash: 'a'.repeat(64),
  });

  assert.equal(result.id, 'run-1');
  assert.deepEqual(firstCall(repository, 'createRun'), {
    requestId: 'request-1',
    actorUserId: 'user-1',
    feature: 'dashboard_summary',
    provider: 'openai',
    modelAlias: 'gpt-4o-mini',
    promptHash: 'a'.repeat(64),
  });

  await assert.rejects(
    () => service.startRun({
      requestId: 'request-2',
      actorUserId: 'user-1',
      feature: 'raw;sql',
      provider: 'openai',
      modelAlias: 'gpt-4o-mini',
      promptHash: 'a'.repeat(64),
    }),
    (error: unknown) => error instanceof AiDatabaseError && error.code === 'AI_DATABASE_IDENTIFIER_INVALID',
  );
});

test('completeRun stores only response metadata and a response hash', async () => {
  const repository = createRepositoryMock();
  const service = new AiDatabaseService(repository);
  const response = 'A safe operational summary.';

  await service.completeRun('run-1', {
    responseText: response,
    outputWords: 4,
    inputTokens: 10,
    outputTokens: 6,
    latencyMs: 120,
  });

  assert.deepEqual(firstCall(repository, 'completeRun'), {
    runId: 'run-1',
    responseHash: hash(response),
    responseHmac: auditHmacHex(response),
    outputChars: response.length,
    outputWords: 4,
    inputTokens: 10,
    outputTokens: 6,
    latencyMs: 120,
  });
  assert.equal(JSON.stringify(firstCall(repository, 'completeRun')).includes(response), false);
});

test('tool call and feedback persistence redacts sensitive values before hashing/storing', async () => {
  const repository = createRepositoryMock();
  const service = new AiDatabaseService(repository);
  const sensitiveText = 'Contact dealer@example.com on 9876543210';
  const redacted = redactSensitiveData(sensitiveText);

  await service.recordToolCall({
    runId: 'run-1',
    toolName: 'get_lead_summary',
    permission: 'ai.crm.assist',
    argumentsText: sensitiveText,
    resultText: sensitiveText,
    inputItemCount: 1,
    outputItemCount: 1,
    durationMs: 30,
  });
  await service.saveFeedback({
    runId: 'run-1',
    actorUserId: 'user-1',
    rating: 5,
    comment: sensitiveText,
  });

  assert.equal((firstCall(repository, 'createToolCall') as { argumentsHash: string }).argumentsHash, hash(redacted));
  assert.equal((firstCall(repository, 'createToolCall') as { resultHash: string }).resultHash, hash(redacted));
  assert.equal((firstCall(repository, 'upsertFeedback') as { commentRedacted: string }).commentRedacted, redacted);
  assert.equal((firstCall(repository, 'upsertFeedback') as { commentRedacted: string }).commentRedacted.includes('dealer@example.com'), false);
});

test('budget usage rejects invalid counters and proposals require an expiry', async () => {
  const repository = createRepositoryMock();
  const service = new AiDatabaseService(repository);

  await assert.rejects(
    () => service.recordBudgetUsage({
      actorUserId: 'user-1',
      usageDate: new Date('2026-11-09T00:00:00.000Z'),
      feature: 'dashboard_summary',
      requestCount: -1,
    }),
    (error: unknown) => error instanceof AiDatabaseError && error.code === 'AI_DATABASE_COUNTER_INVALID',
  );

  await assert.rejects(
    () => service.createActionProposal({
      runId: 'run-1',
      requestedById: 'user-1',
      actionType: 'send_message_draft',
      targetType: 'lead',
      targetRef: 'lead-1',
      payloadText: 'draft',
      expiresAt: new Date('2026-11-08T00:00:00.000Z'),
    }),
    (error: unknown) => error instanceof AiDatabaseError && error.code === 'AI_DATABASE_EXPIRY_INVALID',
  );
});
