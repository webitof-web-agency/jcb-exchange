import assert from 'node:assert/strict';
import test from 'node:test';
import { createAiProvider, AiProviderError, listAiModels } from './aiProvider.service';

test('marks Responses-only OpenAI pro models with the Responses transport', async () => {
  const result = await listAiModels('openai', 'test-secret', async () => new Response(JSON.stringify({
    data: [
      { id: 'gpt-4.1' },
      { id: 'gpt-5.2-pro' },
    ],
  }), { status: 200, headers: { 'content-type': 'application/json' } }));

  assert.deepEqual(result.map((model) => ({ id: model.id, transport: model.transport })), [
    { id: 'gpt-4.1', transport: 'chat_completions' },
    { id: 'gpt-5.2-pro', transport: 'responses' },
  ]);
});

test('lists only chat-capable OpenAI models returned by the provider', async () => {
  let capturedUrl = '';
  let capturedInit: RequestInit | undefined;

  const result = await listAiModels('openai', 'test-secret', async (url, init) => {
    capturedUrl = url.toString();
    capturedInit = init;
    return new Response(JSON.stringify({
      data: [
        { id: 'gpt-4o-mini', owned_by: 'openai' },
        { id: 'text-embedding-3-small', owned_by: 'openai' },
        { id: 'o3-mini', owned_by: 'openai' },
      ],
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  });

  assert.equal(capturedUrl, 'https://api.openai.com/v1/models');
  assert.equal((capturedInit?.headers as Record<string, string>).Authorization, 'Bearer test-secret');
  assert.deepEqual(result.map((model) => model.id), ['gpt-4o-mini', 'o3-mini']);
  assert.ok(result.every((model) => model.capabilities.includes('chat')));
});

test('excludes OpenAI image, audio, embedding, and moderation models from the chat catalog', async () => {
  const result = await listAiModels('openai', 'test-secret', async () => new Response(JSON.stringify({
    data: [
      { id: 'gpt-4.1' },
      { id: 'chatgpt-image-latest' },
      { id: 'gpt-4o-mini-tts' },
      { id: 'gpt-4o-mini-transcribe' },
      { id: 'text-embedding-3-small' },
      { id: 'omni-moderation-latest' },
    ],
  }), { status: 200, headers: { 'content-type': 'application/json' } }));

  assert.deepEqual(result.map((model) => model.id), ['gpt-4.1']);
});

test('lists Anthropic Claude models with provider capabilities', async () => {
  const result = await listAiModels('anthropic', 'test-secret', async (_url, init) => {
    assert.equal((init?.headers as Record<string, string>)['x-api-key'], 'test-secret');
    return new Response(JSON.stringify({
      data: [
        { id: 'claude-3-5-haiku-20241022', display_name: 'Claude 3.5 Haiku' },
        { id: 'other-model', display_name: 'Other' },
      ],
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  });

  assert.deepEqual(result, [{
    id: 'claude-3-5-haiku-20241022',
    name: 'Claude 3.5 Haiku',
    capabilities: ['chat', 'vision', 'tools'],
    transport: 'chat_completions',
  }]);
});

test('does not expose non-model Anthropic catalog records as chat models', async () => {
  const result = await listAiModels('anthropic', 'test-secret', async () => new Response(JSON.stringify({
    data: [
      { type: 'model', id: 'claude-haiku-4-5-20251001', display_name: 'Claude Haiku 4.5' },
      { type: 'not-a-model', id: 'claude-internal-preview', display_name: 'Internal preview' },
    ],
  }), { status: 200, headers: { 'content-type': 'application/json' } }));

  assert.deepEqual(result.map((model) => model.id), ['claude-haiku-4-5-20251001']);
});

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

test('OpenAI adapter sends an image as a data URL only when explicitly provided', async () => {
  let capturedInit: RequestInit | undefined;
  const provider = createAiProvider('openai', 'test-secret', async (_url, init) => {
    capturedInit = init;
    return new Response(JSON.stringify({
      choices: [{ message: { content: 'Image reviewed' } }],
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  });

  await provider.complete({
    model: 'gpt-test',
    systemPrompt: 'image inspection policy',
    userMessage: 'inspect this listing image',
    imageDataUrl: 'data:image/png;base64,AA==',
    timeoutMs: 1000,
  });

  const body = JSON.parse(String(capturedInit?.body)) as Record<string, any>;
  assert.deepEqual(body.messages[1], {
    role: 'user',
    content: [
      { type: 'text', text: 'inspect this listing image' },
      { type: 'image_url', image_url: { url: 'data:image/png;base64,AA==' } },
    ],
  });
});

test('OpenAI adapter uses Responses API for Responses-only pro models', async () => {
  let capturedUrl = '';
  let capturedInit: RequestInit | undefined;

  const provider = createAiProvider('openai', 'test-secret', async (url, init) => {
    capturedUrl = url.toString();
    capturedInit = init;
    return new Response(JSON.stringify({
      output_text: 'Safe Responses answer',
      usage: { input_tokens: 15, output_tokens: 9 },
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  });

  const result = await provider.complete({
    model: 'gpt-5.2-pro',
    systemPrompt: 'controlled system prompt',
    userMessage: 'redacted operator message',
    timeoutMs: 1000,
    maxOutputTokens: 321,
  });

  assert.equal(result.text, 'Safe Responses answer');
  assert.equal(result.inputTokens, 15);
  assert.equal(result.outputTokens, 9);
  assert.equal(capturedUrl, 'https://api.openai.com/v1/responses');
  assert.equal((capturedInit?.headers as Record<string, string>).Authorization, 'Bearer test-secret');

  const body = JSON.parse(String(capturedInit?.body)) as Record<string, unknown>;
  assert.equal(body.model, 'gpt-5.2-pro');
  assert.equal(body.max_output_tokens, 321);
  assert.equal('temperature' in body, false);
  assert.deepEqual(body.input, [
    { role: 'system', content: [{ type: 'input_text', text: 'controlled system prompt' }] },
    { role: 'user', content: [{ type: 'input_text', text: 'redacted operator message' }] },
  ]);
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
