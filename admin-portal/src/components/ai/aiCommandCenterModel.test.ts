import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getAiToolArguments,
  getAiRuntimePresentation,
  normalizeAiMessage,
  type AiReadOnlyTool,
  type AiRuntimeStatus,
} from './aiCommandCenterModel';

test('normalizes AI messages without allowing an oversized request', () => {
  assert.equal(normalizeAiMessage('  Review pending partners  '), 'Review pending partners');
  assert.equal(normalizeAiMessage(''), '');
  assert.equal(normalizeAiMessage('x'.repeat(4_100)).length, 4_000);
});

test('presents a ready runtime without exposing secret configuration values', () => {
  const status: AiRuntimeStatus = {
    enabled: true,
    provider: 'openai',
    model: 'gpt-4o-mini',
    modelConfigured: true,
    keyConfigured: true,
  };

  assert.deepEqual(getAiRuntimePresentation(status), {
    label: 'Ready',
    tone: 'success',
    description: 'Internal AI assistant is ready for operator requests.',
  });
});

test('presents missing configuration as an actionable but non-sensitive state', () => {
  const status: AiRuntimeStatus = {
    enabled: false,
    provider: 'openai',
    model: 'gpt-4o-mini',
    modelConfigured: true,
    keyConfigured: false,
    configurationError: 'The provider key is missing.',
  };

  assert.deepEqual(getAiRuntimePresentation(status), {
    label: 'Needs configuration',
    tone: 'warning',
    description: 'AI is not ready. Ask a Superadmin to configure the provider.',
  });
});

test('builds bounded arguments for a selected read-only tool', () => {
  const searchTool: AiReadOnlyTool = { name: 'listing.search', label: 'Listing search', description: '', available: true };
  const detailTool: AiReadOnlyTool = { name: 'listing.detail', label: 'Listing detail', description: '', available: true };
  const identityTool: AiReadOnlyTool = { name: 'vehicle.identity', label: 'Vehicle identity status', description: '', available: true };
  const documentsTool: AiReadOnlyTool = { name: 'rto.documents.summary', label: 'RTO and document summary', description: '', available: true };
  const rangeTool: AiReadOnlyTool = { name: 'revenue.summary', label: 'Revenue summary', description: '', available: true };
  const forecastTool: AiReadOnlyTool = { name: 'forecast.operations', label: 'Operations forecast', description: '', available: true };

  assert.deepEqual(getAiToolArguments(searchTool, ` ${'JCB '.repeat(40)} `), {
    query: (`JCB `.repeat(40)).slice(0, 100).trim(),
    limit: 10,
  });
  assert.deepEqual(getAiToolArguments(detailTool, ' JCB 3DX '), { query: 'JCB 3DX' });
  assert.deepEqual(getAiToolArguments(identityTool, ' CG04NF0268 '), { query: 'CG04NF0268' });
  assert.deepEqual(getAiToolArguments(documentsTool, '', 14), { days: 14 });
  assert.deepEqual(getAiToolArguments(rangeTool, '', 250), { days: 90 });
  assert.deepEqual(getAiToolArguments(forecastTool, ' finance ', 14), { metric: 'finance', days: 14 });
  assert.deepEqual(getAiToolArguments(null, '', 30), {});
});
