export type AiProviderName = 'openai' | 'anthropic';

export type AiProviderRequest = {
  model: string;
  systemPrompt: string;
  userMessage: string;
  /** A bounded, server-created data URL. Never accept provider URLs from the browser. */
  imageDataUrl?: string;
  timeoutMs: number;
  maxOutputTokens?: number;
};

export type AiProviderResponse = {
  text: string;
  inputTokens?: number;
  outputTokens?: number;
};

export type AiModelOption = {
  id: string;
  name: string;
  capabilities: string[];
  transport: 'chat_completions' | 'responses';
};

export interface AiProvider {
  complete(request: AiProviderRequest): Promise<AiProviderResponse>;
}

export class AiProviderError extends Error {
  constructor(
    message: string,
    public readonly statusCode = 502,
    public readonly code = 'AI_PROVIDER_ERROR',
    public readonly retryable = false,
  ) {
    super(message);
    this.name = 'AiProviderError';
  }
}

type FetchLike = typeof fetch;

const MAX_PROVIDER_RESPONSE_BYTES = 256 * 1024;
const MAX_ATTEMPTS = 3;

const wait = (milliseconds: number) => new Promise<void>((resolve) => {
  setTimeout(resolve, milliseconds);
});

const readJson = async (response: Response): Promise<Record<string, unknown>> => {
  const contentLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(contentLength) && contentLength > MAX_PROVIDER_RESPONSE_BYTES) {
    throw new AiProviderError('AI provider response was too large.', 502, 'AI_PROVIDER_RESPONSE_TOO_LARGE');
  }

  const text = await response.text();
  if (Buffer.byteLength(text, 'utf8') > MAX_PROVIDER_RESPONSE_BYTES) {
    throw new AiProviderError('AI provider response was too large.', 502, 'AI_PROVIDER_RESPONSE_TOO_LARGE');
  }

  try {
    const parsed: unknown = JSON.parse(text);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('Provider response was not an object.');
    }
    return parsed as Record<string, unknown>;
  } catch {
    throw new AiProviderError('AI provider returned an invalid response.', 502, 'AI_PROVIDER_INVALID_RESPONSE');
  }
};

const stringAt = (value: unknown, key: string): string | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const candidate = (value as Record<string, unknown>)[key];
  return typeof candidate === 'string' && candidate.trim() ? candidate : null;
};

const textFromContent = (value: unknown): string => {
  if (typeof value === 'string') return value;
  if (!Array.isArray(value)) return '';
  return value
    .map((item) => stringAt(item, 'text') || '')
    .filter(Boolean)
    .join('\n');
};

const safeNumber = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : undefined;

const retryableStatus = (status: number) => status === 408 || status === 429 || status >= 500;

const requestJsonWithRetry = async (
  fetchImpl: FetchLike,
  url: string,
  headers: Record<string, string>,
  timeoutMs: number,
): Promise<Record<string, unknown>> => {
  let lastError: unknown = null;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetchImpl(url, {
        method: 'GET',
        headers,
        signal: controller.signal,
      });
      if (!response.ok) {
        if (!retryableStatus(response.status) || attempt === MAX_ATTEMPTS - 1) {
          const code = response.status === 401 || response.status === 403
            ? 'AI_PROVIDER_AUTH_FAILED'
            : response.status === 429
              ? 'AI_PROVIDER_RATE_LIMITED'
              : 'AI_PROVIDER_REQUEST_FAILED';
          throw new AiProviderError('AI provider model list request failed.', 502, code, retryableStatus(response.status));
        }
        lastError = new AiProviderError('AI provider is temporarily unavailable.', 502, 'AI_PROVIDER_TEMPORARY_FAILURE', true);
      } else {
        return await readJson(response);
      }
    } catch (error) {
      lastError = error;
      const retryable = error instanceof AiProviderError ? error.retryable : true;
      if (!retryable || attempt === MAX_ATTEMPTS - 1) {
        if (error instanceof AiProviderError) throw error;
        throw new AiProviderError('AI provider is temporarily unavailable.', 503, 'AI_PROVIDER_UNAVAILABLE', true);
      }
    } finally {
      clearTimeout(timeout);
    }

    await wait(250 * (2 ** attempt));
  }

  throw lastError instanceof AiProviderError
    ? lastError
    : new AiProviderError('AI provider is temporarily unavailable.', 503, 'AI_PROVIDER_UNAVAILABLE', true);
};

const requestWithRetry = async (
  fetchImpl: FetchLike,
  url: string,
  headers: Record<string, string>,
  body: Record<string, unknown>,
  timeoutMs: number,
): Promise<Record<string, unknown>> => {
  let lastError: unknown = null;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetchImpl(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!response.ok) {
        if (!retryableStatus(response.status) || attempt === MAX_ATTEMPTS - 1) {
          const code = response.status === 401 || response.status === 403
            ? 'AI_PROVIDER_AUTH_FAILED'
            : response.status === 429
              ? 'AI_PROVIDER_RATE_LIMITED'
              : 'AI_PROVIDER_REQUEST_FAILED';
          throw new AiProviderError('AI provider request failed.', 502, code, retryableStatus(response.status));
        }

        lastError = new AiProviderError('AI provider is temporarily unavailable.', 502, 'AI_PROVIDER_TEMPORARY_FAILURE', true);
      } else {
        return await readJson(response);
      }

    } catch (error) {
      lastError = error;
      const retryable = error instanceof AiProviderError ? error.retryable : true;
      if (!retryable || attempt === MAX_ATTEMPTS - 1) {
        if (error instanceof AiProviderError) throw error;
        throw new AiProviderError('AI provider is temporarily unavailable.', 503, 'AI_PROVIDER_UNAVAILABLE', true);
      }
    } finally {
      clearTimeout(timeout);
    }

    await wait(250 * (2 ** attempt));
  }

  throw lastError instanceof AiProviderError
    ? lastError
    : new AiProviderError('AI provider is temporarily unavailable.', 503, 'AI_PROVIDER_UNAVAILABLE', true);
};

class OpenAiProvider implements AiProvider {
  constructor(private readonly apiKey: string, private readonly fetchImpl: FetchLike) {}

  async complete(request: AiProviderRequest): Promise<AiProviderResponse> {
    const transport = openAiModelTransport(request.model);
    const endpoint = transport === 'responses'
      ? 'https://api.openai.com/v1/responses'
      : 'https://api.openai.com/v1/chat/completions';
    const body = transport === 'responses'
      ? {
        model: request.model,
        max_output_tokens: request.maxOutputTokens ?? 800,
        input: [
          { role: 'system', content: [{ type: 'input_text', text: request.systemPrompt }] },
          { role: 'user', content: [
            { type: 'input_text', text: request.userMessage },
            ...(request.imageDataUrl ? [{ type: 'input_image', image_url: request.imageDataUrl }] : []),
          ] },
        ],
      }
      : {
        model: request.model,
        temperature: 0.2,
        max_tokens: request.maxOutputTokens ?? 800,
        messages: [
          { role: 'system', content: request.systemPrompt },
          { role: 'user', content: request.imageDataUrl
            ? [
              { type: 'text', text: request.userMessage },
              { type: 'image_url', image_url: { url: request.imageDataUrl } },
            ]
            : request.userMessage },
        ],
      };
    const payload = await requestWithRetry(
      this.fetchImpl,
      endpoint,
      {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body,
      request.timeoutMs,
    );
    const text = transport === 'responses'
      ? stringAt(payload, 'output_text') || textFromResponsesOutput(payload.output)
      : textFromChatCompletion(payload);
    if (!text) throw new AiProviderError('AI provider returned an empty response.', 502, 'AI_PROVIDER_EMPTY_RESPONSE');

    const usage = payload.usage;
    const result: AiProviderResponse = { text };
    const inputTokens = safeNumber(usage && typeof usage === 'object'
      ? (usage as Record<string, unknown>)[transport === 'responses' ? 'input_tokens' : 'prompt_tokens']
      : undefined);
    const outputTokens = safeNumber(usage && typeof usage === 'object'
      ? (usage as Record<string, unknown>)[transport === 'responses' ? 'output_tokens' : 'completion_tokens']
      : undefined);
    if (inputTokens !== undefined) result.inputTokens = inputTokens;
    if (outputTokens !== undefined) result.outputTokens = outputTokens;
    return result;
  }
}

const textFromChatCompletion = (payload: Record<string, unknown>) => {
  const choices = payload.choices;
  const firstChoice = Array.isArray(choices) ? choices[0] : null;
  const message = firstChoice && typeof firstChoice === 'object' ? (firstChoice as Record<string, unknown>).message : null;
  return textFromContent(message && typeof message === 'object' ? (message as Record<string, unknown>).content : null);
};

const textFromResponsesOutput = (value: unknown) => {
  if (!Array.isArray(value)) return '';
  return value
    .map((item) => item && typeof item === 'object' ? textFromContent((item as Record<string, unknown>).content) : '')
    .filter(Boolean)
    .join('\n');
};

class AnthropicProvider implements AiProvider {
  constructor(private readonly apiKey: string, private readonly fetchImpl: FetchLike) {}

  async complete(request: AiProviderRequest): Promise<AiProviderResponse> {
    const payload = await requestWithRetry(
      this.fetchImpl,
      'https://api.anthropic.com/v1/messages',
      {
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      {
        model: request.model,
        max_tokens: request.maxOutputTokens ?? 800,
        system: request.systemPrompt,
        messages: [{ role: 'user', content: request.userMessage }],
      },
      request.timeoutMs,
    );
    const text = textFromContent(payload.content);
    if (!text) throw new AiProviderError('AI provider returned an empty response.', 502, 'AI_PROVIDER_EMPTY_RESPONSE');

    const usage = payload.usage;
    const result: AiProviderResponse = { text };
    const inputTokens = safeNumber(usage && typeof usage === 'object' ? (usage as Record<string, unknown>).input_tokens : undefined);
    const outputTokens = safeNumber(usage && typeof usage === 'object' ? (usage as Record<string, unknown>).output_tokens : undefined);
    if (inputTokens !== undefined) result.inputTokens = inputTokens;
    if (outputTokens !== undefined) result.outputTokens = outputTokens;
    return result;
  }
}

const modelCapabilities = (provider: AiProviderName, id: string): string[] => {
  const normalized = id.toLowerCase();
  const capabilities = ['chat', 'vision', 'tools'];
  if (provider === 'openai' && openAiModelTransport(normalized) === 'responses') {
    capabilities.push('responses');
  }
  if (provider === 'openai' && /^(?:o\d|o\d-mini|o\d-pro)/i.test(normalized)) capabilities.push('reasoning');
  return capabilities;
};

const openAiModelTransport = (id: string): 'chat_completions' | 'responses' => {
  const normalized = id.toLowerCase();
  return /^(?:o\d(?:[.-].*)?|gpt-\d+(?:\.\d+)?-pro(?:[.-].*)?)$/i.test(normalized)
    ? 'responses'
    : 'chat_completions';
};

const isOpenAiChatCatalogModel = (id: string) => {
  if (!/^(?:gpt-|o\d|chatgpt-)/i.test(id)) return false;
  return !/(?:image|audio|embedding|moderation|realtime|transcribe|text-to-speech|tts|whisper|dall-e)/i.test(id);
};

export const isSupportedAiChatModel = (provider: AiProviderName, id: string) => (
  provider === 'openai' ? isOpenAiChatCatalogModel(id) : /^claude-/i.test(id)
);

/** Fetches the provider-owned model catalog without exposing the provider key to the browser. */
export const listAiModels = async (
  provider: AiProviderName,
  apiKey: string,
  fetchImpl: FetchLike = fetch,
): Promise<AiModelOption[]> => {
  const isOpenAi = provider === 'openai';
  const baseUrl = isOpenAi ? 'https://api.openai.com/v1/models' : 'https://api.anthropic.com/v1/models';
  const headers = isOpenAi
    ? { Authorization: `Bearer ${apiKey}` }
    : { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' };
  const rows: unknown[] = [];
  let afterId: string | null = null;

  // Anthropic paginates its model catalog; keep following pages so newly added
  // models are not hidden simply because they fall after the first page.
  for (let page = 0; page < 10; page += 1) {
    const url = isOpenAi
      ? baseUrl
      : `${baseUrl}?limit=100${afterId ? `&after_id=${encodeURIComponent(afterId)}` : ''}`;
    const payload = await requestJsonWithRetry(fetchImpl, url, headers, 10_000);
    if (Array.isArray(payload.data)) rows.push(...payload.data);
    const hasMore = payload.has_more === true;
    const nextAfterId = typeof payload.last_id === 'string' && payload.last_id.trim() ? payload.last_id.trim() : null;
    if (!hasMore || !nextAfterId || nextAfterId === afterId || isOpenAi) break;
    afterId = nextAfterId;
  }

  return rows
    .map((row): AiModelOption | null => {
      if (!row || typeof row !== 'object' || Array.isArray(row)) return null;
      const record = row as Record<string, unknown>;
      const id = typeof record.id === 'string' ? record.id.trim() : '';
      if (provider === 'anthropic' && record.type !== undefined && record.type !== 'model') return null;
      const accepted = isSupportedAiChatModel(provider, id);
      if (!id || !accepted) return null;
      const displayName = typeof record.display_name === 'string' && record.display_name.trim()
        ? record.display_name.trim()
        : id;
      return {
        id,
        name: displayName,
        capabilities: modelCapabilities(provider, id),
        transport: provider === 'openai' ? openAiModelTransport(id) : 'chat_completions',
      };
    })
    .filter((model): model is AiModelOption => Boolean(model))
    .sort((left, right) => left.id.localeCompare(right.id));
};

export const createAiProvider = (
  provider: AiProviderName,
  apiKey: string,
  fetchImpl: FetchLike = fetch,
): AiProvider => provider === 'openai'
  ? new OpenAiProvider(apiKey, fetchImpl)
  : new AnthropicProvider(apiKey, fetchImpl);
