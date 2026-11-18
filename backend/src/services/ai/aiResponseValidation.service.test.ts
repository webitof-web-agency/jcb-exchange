import assert from 'node:assert/strict';
import test from 'node:test';
import { createAiDataContract } from './aiDataContract.service';
import {
  groundedDataClarificationFor,
  requiresGroundedData,
  validateAiGatewayResponse,
  validateAiToolResult,
} from './aiResponseValidation.service';

test('validates a current database tool result before it can reach the answer layer', () => {
  const result = validateAiToolResult({
    toolName: 'sold.vehicle.detail',
    label: 'Sold vehicle detail',
    data: { recordNumber: 'SA-2026-0001' },
    contract: createAiDataContract({
      status: 'success',
      source: 'database',
      data: { recordNumber: 'SA-2026-0001' },
      permission: 'allowed',
    }),
    dataAvailability: 'AVAILABLE',
  });

  assert.equal(result.contract.status, 'success');
});

test('rejects an inconsistent tool result instead of allowing a misleading answer', () => {
  assert.throws(
    () => validateAiToolResult({
      toolName: 'sold.vehicle.detail',
      label: 'Sold vehicle detail',
      data: [],
      contract: createAiDataContract({
        status: 'empty',
        source: 'database',
        data: [],
        permission: 'allowed',
      }),
      dataAvailability: 'AVAILABLE',
    }),
    /AI response validation failed/,
  );
});

test('requires a live data snapshot for module facts and gives a safe clarification', () => {
  assert.equal(requiresGroundedData('sold vehicle ka profit batao', {}), true);
  assert.equal(requiresGroundedData('what is EBITDA?', {}), false);
  assert.equal(requiresGroundedData('is record ka status batao', { recordId: 'SA-2026-0001' }), true);
  assert.match(groundedDataClarificationFor('sold vehicle ka profit batao'), /verify|database|record/i);
});

test('validates the final answer envelope and rejects empty provider output', () => {
  assert.deepEqual(validateAiGatewayResponse({
    requestId: 'request-1',
    provider: 'INTERNAL',
    model: 'deterministic-read-only',
    answer: 'Verified result',
  }).answer, 'Verified result');
  assert.throws(
    () => validateAiGatewayResponse({ requestId: 'request-1', provider: 'openai', model: 'test', answer: '   ' }),
    /AI response validation failed/,
  );
});
