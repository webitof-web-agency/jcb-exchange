import assert from 'node:assert/strict';
import test from 'node:test';
import { filterAiModelOptions } from './aiModelPicker';

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
