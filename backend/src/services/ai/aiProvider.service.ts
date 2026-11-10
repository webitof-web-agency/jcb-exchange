export type AiProviderName = 'openai' | 'anthropic';

export type AiProviderRequest = {
  model: string;
  systemPrompt: string;
  userMessage: string;
  timeoutMs: number;
  maxOutputTokens?: number;
};

export type AiProviderResponse = {
  text: string;
  inputTokens?: number;
  outputTokens?: number;
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
    const payload = await requestWithRetry(
      this.fetchImpl,
      'https://api.openai.com/v1/chat/completions',
      {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      {
        model: request.model,
        temperature: 0.2,
        max_tokens: request.maxOutputTokens ?? 800,
        messages: [
          { role: 'system', content: request.systemPrompt },
          { role: 'user', content: request.userMessage },
        ],
      },
      request.timeoutMs,
    );
    const choices = payload.choices;
    const firstChoice = Array.isArray(choices) ? choices[0] : null;
    const message = firstChoice && typeof firstChoice === 'object' ? (firstChoice as Record<string, unknown>).message : null;
    const text = textFromContent(message && typeof message === 'object' ? (message as Record<string, unknown>).content : null);
    if (!text) throw new AiProviderError('AI provider returned an empty response.', 502, 'AI_PROVIDER_EMPTY_RESPONSE');

    const usage = payload.usage;
    const result: AiProviderResponse = { text };
    const inputTokens = safeNumber(usage && typeof usage === 'object' ? (usage as Record<string, unknown>).prompt_tokens : undefined);
    const outputTokens = safeNumber(usage && typeof usage === 'object' ? (usage as Record<string, unknown>).completion_tokens : undefined);
    if (inputTokens !== undefined) result.inputTokens = inputTokens;
    if (outputTokens !== undefined) result.outputTokens = outputTokens;
    return result;
  }
}

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

export const createAiProvider = (
  provider: AiProviderName,
  apiKey: string,
  fetchImpl: FetchLike = fetch,
): AiProvider => provider === 'openai'
  ? new OpenAiProvider(apiKey, fetchImpl)
  : new AnthropicProvider(apiKey, fetchImpl);
