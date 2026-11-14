import assert from 'node:assert/strict';
import test from 'node:test';
import { filterAiModelOptions, getProviderModelCatalogMessage, hasProviderModel } from './aiModelPicker';

test('model picker searches provider models by id and display name', () => {
  const models = [
    { id: 'gpt-4.1', name: 'GPT-4.1', capabilities: ['chat'], transport: 'chat_completions' as const },
    { id: 'gpt-4.1-mini', name: 'GPT 4.1 Mini', capabilities: ['chat'], transport: 'chat_completions' as const },
    { id: 'gpt-4o', name: 'GPT-4o', capabilities: ['chat', 'vision'], transport: 'chat_completions' as const },
  ];

  assert.deepEqual(filterAiModelOptions(models, 'mini').map((model) => model.id), ['gpt-4.1-mini']);
  assert.deepEqual(filterAiModelOptions(models, 'GPT-4o').map((model) => model.id), ['gpt-4o']);
  assert.equal(filterAiModelOptions(models, 'missing').length, 0);
});

test('never treats a saved model as provider-available when the catalog is empty', () => {
  assert.equal(hasProviderModel([], 'gpt-5-mini'), false);
  assert.equal(hasProviderModel([{ id: 'gpt-5-mini' }], 'gpt-5-mini'), true);
});

test('explains why the provider catalog is unavailable instead of silently showing a saved model', () => {
  assert.equal(
    getProviderModelCatalogMessage(null, 0),
    'No compatible chat models were returned by the configured provider. Check this API key’s project model access, then refresh.',
  );
  assert.equal(getProviderModelCatalogMessage('Provider request failed.', 0), 'Provider request failed.');
  assert.equal(getProviderModelCatalogMessage(null, 1), null);
});
