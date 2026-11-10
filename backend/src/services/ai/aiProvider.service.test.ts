import assert from 'node:assert/strict';
import test from 'node:test';
import { createAiProvider, AiProviderError } from './aiProvider.service';

test('OpenAI adapter sends the controlled request shape and parses usage', async () => {
  let capturedUrl = '';
  let capturedInit: RequestInit | undefined;

  const provider = createAiProvider('openai', 'test-secret', async (url, init) => {
    capturedUrl = url.toString();
    capturedInit = init;
    return new Response(JSON.stringify({
      choices: [{ message: { content: 'Safe answer' } }],
      usage: { prompt_tokens: 12, completion_tokens: 7 },
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  });

  const result = await provider.complete({
    model: 'gpt-test',
    systemPrompt: 'controlled system prompt',
    userMessage: 'redacted operator message',
    timeoutMs: 1000,
    maxOutputTokens: 321,
  });

  assert.equal(result.text, 'Safe answer');
  assert.equal(result.inputTokens, 12);
  assert.equal(result.outputTokens, 7);
  assert.equal(capturedUrl, 'https://api.openai.com/v1/chat/completions');
  assert.equal((capturedInit?.headers as Record<string, string>).Authorization, 'Bearer test-secret');

  const body = JSON.parse(String(capturedInit?.body)) as Record<string, unknown>;
  assert.equal(body.model, 'gpt-test');
  assert.deepEqual(body.messages, [
    { role: 'system', content: 'controlled system prompt' },
    { role: 'user', content: 'redacted operator message' },
  ]);
  assert.equal(body.max_tokens, 321);
});

test('provider retries temporary HTTP failures and succeeds without retrying auth failures', async () => {
  let calls = 0;
  const provider = createAiProvider('anthropic', 'test-secret', async () => {
    calls += 1;
    if (calls === 1) return new Response('', { status: 429 });
    if (calls === 2) return new Response('', { status: 503 });
    return new Response(JSON.stringify({ content: [{ type: 'text', text: 'Recovered answer' }] }), { status: 200 });
  });

  const result = await provider.complete({
    model: 'claude-test',
    systemPrompt: 'controlled system prompt',
    userMessage: 'redacted operator message',
    timeoutMs: 1000,
  });

  assert.equal(result.text, 'Recovered answer');
  assert.equal(calls, 3);

  await assert.rejects(
    createAiProvider('openai', 'test-secret', async () => new Response('', { status: 401 })).complete({
      model: 'gpt-test',
      systemPrompt: 'controlled system prompt',
      userMessage: 'redacted operator message',
      timeoutMs: 1000,
    }),
    (error: unknown) => error instanceof AiProviderError && error.code === 'AI_PROVIDER_AUTH_FAILED',
  );
});

test('Anthropic adapter sends the controlled system prompt and output budget', async () => {
  let capturedInit: RequestInit | undefined;
  const provider = createAiProvider('anthropic', 'test-secret', async (_url, init) => {
    capturedInit = init;
    return new Response(JSON.stringify({
      content: [{ type: 'text', text: 'Safe Anthropic answer' }],
      usage: { input_tokens: 9, output_tokens: 6 },
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  });

  const result = await provider.complete({
    model: 'claude-test',
    systemPrompt: 'controlled system prompt',
    userMessage: 'redacted operator message',
    timeoutMs: 1000,
    maxOutputTokens: 321,
  });

  assert.equal(result.text, 'Safe Anthropic answer');
  assert.equal(result.inputTokens, 9);
  assert.equal(result.outputTokens, 6);
  assert.equal((capturedInit?.headers as Record<string, string>)['x-api-key'], 'test-secret');
  const body = JSON.parse(String(capturedInit?.body)) as Record<string, unknown>;
  assert.equal(body.model, 'claude-test');
  assert.equal(body.max_tokens, 321);
  assert.equal(body.system, 'controlled system prompt');
  assert.deepEqual(body.messages, [{ role: 'user', content: 'redacted operator message' }]);
});
