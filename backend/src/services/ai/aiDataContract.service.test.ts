import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AI_DATA_CONTRACT_STATUSES,
  aiDataContractSchema,
  createAiDataContract,
  createAiDataErrorContractForCode,
  type AiDataContract,
} from './aiDataContract.service';

test('creates a stable success contract with normalized metadata', () => {
  const contract = createAiDataContract({
    status: 'success',
    source: 'database',
    fetchedAt: new Date('2026-11-12T18:30:00.000Z'),
    freshness: 'current',
    data: { total: 4 },
    maskedFields: [],
    permission: 'allowed',
  });

  assert.deepEqual(contract, {
    status: 'success',
    source: 'database',
    fetchedAt: '2026-11-12T18:30:00.000Z',
    freshness: 'current',
    data: { total: 4 },
    maskedFields: [],
    permission: 'allowed',
    pagination: {
      limit: 20,
      offset: 0,
      returned: null,
      total: null,
      hasMore: false,
      nextCursor: null,
    },
    safeLimits: {
      maxLimit: 20,
      maxDays: 90,
      requestedLimit: null,
      appliedLimit: 20,
    },
  } satisfies AiDataContract<{ total: number }>);
});

test('creates an empty contract without converting empty data into success', () => {
  const contract = createAiDataContract({
    status: 'empty',
    source: 'database',
    fetchedAt: '2026-11-12T18:30:00.000Z',
    data: [],
    permission: 'allowed',
  });

  assert.equal(contract.status, 'empty');
  assert.deepEqual(contract.data, []);
  assert.equal(contract.freshness, 'current');
  assert.deepEqual(contract.maskedFields, []);
  assert.equal(contract.pagination.returned, 0);
  assert.equal(contract.pagination.hasMore, false);
  assert.equal(contract.safeLimits.appliedLimit, 20);
});

test('normalizes pagination and clamps requested limits to the safe maximum', () => {
  const contract = createAiDataContract({
    status: 'success',
    source: 'database',
    data: [{ id: 'one' }],
    permission: 'allowed',
    requestedLimit: 999,
    pagination: {
      hasMore: true,
      nextCursor: 'cursor-2',
      total: 101,
    },
  });

  assert.deepEqual(contract.pagination, {
    limit: 20,
    offset: 0,
    returned: 1,
    total: 101,
    hasMore: true,
    nextCursor: 'cursor-2',
  });
  assert.deepEqual(contract.safeLimits, {
    maxLimit: 20,
    maxDays: 90,
    requestedLimit: 999,
    appliedLimit: 20,
  });
});

test('error contracts expose the same safe metadata without returning data', () => {
  const contract = createAiDataErrorContractForCode('AI_TOOL_PERMISSION_REQUIRED', {
    source: 'database',
    requestedLimit: 5,
  });

  assert.equal(contract.status, 'permission_denied');
  assert.equal(contract.permission, 'denied');
  assert.equal(contract.data, null);
  assert.deepEqual(contract.pagination, {
    limit: 5,
    offset: 0,
    returned: null,
    total: null,
    hasMore: false,
    nextCursor: null,
  });
  assert.deepEqual(contract.safeLimits, {
    maxLimit: 20,
    maxDays: 90,
    requestedLimit: 5,
    appliedLimit: 5,
  });
});

test('runtime schema rejects a contract with an unsupported status', () => {
  const result = aiDataContractSchema.safeParse({
    status: 'partial_success',
    source: 'database',
    fetchedAt: '2026-11-12T18:30:00.000Z',
    freshness: 'current',
    data: { total: 4 },
    maskedFields: [],
    permission: 'allowed',
  });

  assert.equal(result.success, false);
});

test('maps every supported AI error family to a safe common contract status', () => {
  assert.deepEqual(AI_DATA_CONTRACT_STATUSES, [
    'success',
    'empty',
    'permission_denied',
    'data_unavailable',
    'provider_unavailable',
    'ambiguous',
    'validation_error',
  ]);

  assert.equal(createAiDataErrorContractForCode('AI_TOOL_PERMISSION_REQUIRED').status, 'permission_denied');
  assert.equal(createAiDataErrorContractForCode('AI_ACCESS_FORBIDDEN').status, 'permission_denied');
  assert.equal(createAiDataErrorContractForCode('AI_MESSAGE_INVALID').status, 'validation_error');
  assert.equal(createAiDataErrorContractForCode('AI_TOOL_NOT_AVAILABLE').status, 'validation_error');
  assert.equal(createAiDataErrorContractForCode('AI_INTENT_AMBIGUOUS').status, 'ambiguous');
  assert.equal(createAiDataErrorContractForCode('AI_PROVIDER_REQUEST_FAILED').status, 'provider_unavailable');
  assert.equal(createAiDataErrorContractForCode('AI_DISABLED').status, 'provider_unavailable');
  assert.equal(createAiDataErrorContractForCode('AI_DATABASE_UNAVAILABLE').status, 'data_unavailable');
});
