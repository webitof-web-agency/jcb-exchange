import { createAiProvider, isSupportedAiChatModel, type AiProvider } from './aiProvider.service';
import { getAiRuntimeConfig, type AiRuntimeConfig } from './aiSettings.service';
import { redactSensitiveData } from './aiRedaction';

const MAX_LISTING_IMAGE_BYTES = 5 * 1024 * 1024;
const ALLOWED_IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const SLOT_VALUES = new Set(['FRONT', 'FRONT_LEFT', 'FRONT_RIGHT', 'REAR', 'REAR_LEFT', 'REAR_RIGHT', 'SIDE', 'CABIN', 'ENGINE', 'TYRE', 'OTHER']);

export type ListingImageAnalysis = {
  qualityScore: number;
  isMachine: boolean | null;
  issues: string[];
  suggestedSlot: string;
};

const asRecord = (value: unknown): Record<string, unknown> => (
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
);

const safeText = (value: unknown, maxLength: number) => typeof value === 'string'
  ? value.replace(/[\u0000-\u001F\u007F]/gu, '').trim().slice(0, maxLength)
  : '';

export const normalizeListingImageAnalysis = (value: unknown): ListingImageAnalysis => {
  const record = asRecord(value);
  const rawScore = typeof record.qualityScore === 'number' && Number.isFinite(record.qualityScore)
    ? record.qualityScore
    : 0;
  const issues = Array.isArray(record.issues)
    ? [...new Set(record.issues.map((issue) => redactSensitiveData(safeText(issue, 160))).filter(Boolean))].slice(0, 8)
    : [];
  const rawSlot = safeText(record.suggestedSlot, 30).toUpperCase().replace(/[^A-Z]+/gu, '_');
  return {
    qualityScore: Math.max(0, Math.min(100, Math.round(rawScore))),
    isMachine: typeof record.isMachine === 'boolean' ? record.isMachine : null,
    issues,
    suggestedSlot: SLOT_VALUES.has(rawSlot) ? rawSlot : 'OTHER',
  };
};

const parseProviderJson = (value: string): unknown => {
  const normalized = value.trim().replace(/^```(?:json)?\s*/iu, '').replace(/\s*```$/u, '');
  try {
    return JSON.parse(normalized) as unknown;
  } catch {
    return {};
  }
};

export const LISTING_IMAGE_VISION_PROMPT = [
  'Review this construction-machine listing image for marketplace quality only.',
  'Do not perform OCR and do not return registration numbers, document numbers, names, phone numbers, emails, IDs, or other personal data.',
  'Return JSON only with exactly these fields: qualityScore (0-100), isMachine (boolean or null), issues (array of short strings), suggestedSlot (FRONT, FRONT_LEFT, FRONT_RIGHT, REAR, REAR_LEFT, REAR_RIGHT, SIDE, CABIN, ENGINE, TYRE, OTHER).',
  'Flag only visible quality or listing issues such as blur, darkness, heavy obstruction, irrelevant image, duplicate-looking frame, promotional overlay, or unsafe content.',
].join(' ');

export type ListingImageAnalyzerDependencies = {
  configReader?: () => AiRuntimeConfig | Promise<AiRuntimeConfig>;
  providerFactory?: (provider: AiRuntimeConfig['provider'], apiKey: string) => AiProvider;
};

export const createListingImageAnalyzer = (dependencies: ListingImageAnalyzerDependencies = {}) => async (input: {
  buffer: Buffer;
  mimeType: string;
  prompt?: string;
}): Promise<ListingImageAnalysis> => {
  if (!ALLOWED_IMAGE_MIME_TYPES.has(input.mimeType)) {
    throw new Error('Only JPEG, PNG, and WEBP listing images can be analysed.');
  }
  if (input.buffer.length === 0 || input.buffer.length > MAX_LISTING_IMAGE_BYTES) {
    throw new Error('Listing images must be between 1 byte and 5MB for AI analysis.');
  }

  const config = await (dependencies.configReader ?? getAiRuntimeConfig)();
  if (!config.enabled || !config.apiKey) throw new Error('AI provider is not configured.');
  if (config.provider !== 'openai' || !isSupportedAiChatModel(config.provider, config.model)) {
    throw new Error('The configured AI model does not support listing image analysis.');
  }

  const provider = (dependencies.providerFactory ?? ((providerName, apiKey) => createAiProvider(providerName, apiKey)))(config.provider, config.apiKey);
  const response = await provider.complete({
    model: config.model,
    systemPrompt: LISTING_IMAGE_VISION_PROMPT,
    userMessage: input.prompt?.trim().slice(0, 500) || 'Analyse this listing image.',
    imageDataUrl: `data:${input.mimeType};base64,${input.buffer.toString('base64')}`,
    timeoutMs: config.requestTimeoutMs ?? 20_000,
    maxOutputTokens: Math.min(config.maxOutputTokens ?? 400, 400),
  });
  return normalizeListingImageAnalysis(parseProviderJson(response.text));
};

export const analyzeListingImage = createListingImageAnalyzer();
