import { createAiProvider, isSupportedAiChatModel, type AiProvider } from './aiProvider.service';
import { getAiRuntimeConfig, type AiRuntimeConfig } from './aiSettings.service';
import { redactSensitiveData } from './aiRedaction';

const MAX_DOCUMENT_IMAGE_BYTES = 5 * 1024 * 1024;
const ALLOWED_DOCUMENT_IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const DOCUMENT_TYPES = new Set(['RC', 'PAN', 'GST', 'FINANCE']);
const FINANCE_DOCUMENT_KINDS = new Set(['INVOICE', 'RECEIPT', 'BANK_STATEMENT', 'TAX_DOCUMENT', 'OTHER']);

export type AiDocumentType = 'RC' | 'PAN' | 'GST' | 'FINANCE';

export type AiDocumentAnalysis = {
  documentType: AiDocumentType;
  documentDetected: boolean | null;
  qualityScore: number;
  issues: string[];
  extracted: {
    registrationNumberMasked?: string;
    panMasked?: string;
    gstinMasked?: string;
    vehicleMake?: string;
    vehicleModel?: string;
    documentKind?: string;
    subtotal?: number;
    taxAmount?: number;
    totalAmount?: number;
    currency?: 'INR' | 'UNKNOWN';
    invoiceNumberMasked?: string;
  };
  reviewRequired: boolean;
};

const asRecord = (value: unknown): Record<string, unknown> => (
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
);

const safeText = (value: unknown, maxLength: number) => typeof value === 'string'
  ? redactSensitiveData(value.replace(/[\u0000-\u001F\u007F]/gu, '').trim().slice(0, maxLength))
  : '';

const safeNumber = (value: unknown): number | undefined => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  return Math.round(Math.max(-1_000_000_000_000, Math.min(1_000_000_000_000, value)) * 100) / 100;
};

const maskIdentifier = (value: unknown) => {
  const compact = typeof value === 'string'
    ? value.toUpperCase().replace(/[^A-Z0-9]/gu, '')
    : '';
  return compact.length >= 4 ? `••••${compact.slice(-4)}` : '';
};

const validDocumentType = (value: unknown): value is AiDocumentType => (
  typeof value === 'string' && DOCUMENT_TYPES.has(value.toUpperCase())
);

const normalizedDocumentKind = (value: unknown) => {
  const normalized = safeText(value, 30).toUpperCase().replace(/[^A-Z]+/gu, '_');
  return FINANCE_DOCUMENT_KINDS.has(normalized) ? normalized : undefined;
};

const parseProviderJson = (value: string): unknown => {
  const normalized = value.trim().replace(/^```(?:json)?\s*/iu, '').replace(/\s*```$/u, '');
  try {
    return JSON.parse(normalized) as unknown;
  } catch {
    return {};
  }
};

export const normalizeDocumentAnalysis = (value: unknown): AiDocumentAnalysis => {
  const record = asRecord(value);
  const documentType = validDocumentType(record.documentType) ? record.documentType.toUpperCase() as AiDocumentType : 'FINANCE';
  const rawQuality = typeof record.qualityScore === 'number' && Number.isFinite(record.qualityScore)
    ? record.qualityScore
    : 0;
  const qualityScore = Math.max(0, Math.min(100, Math.round(rawQuality)));
  const issues = Array.isArray(record.issues)
    ? [...new Set(record.issues.map((issue) => safeText(issue, 180)).filter(Boolean))].slice(0, 8)
    : [];
  const extracted: AiDocumentAnalysis['extracted'] = {};

  if (documentType === 'RC') {
    const registrationNumberMasked = maskIdentifier(record.registrationNumber);
    const vehicleMake = safeText(record.vehicleMake, 80);
    const vehicleModel = safeText(record.vehicleModel, 80);
    if (registrationNumberMasked) extracted.registrationNumberMasked = registrationNumberMasked;
    if (vehicleMake) extracted.vehicleMake = vehicleMake;
    if (vehicleModel) extracted.vehicleModel = vehicleModel;
  }
  if (documentType === 'PAN') {
    const panMasked = maskIdentifier(record.pan);
    if (panMasked) extracted.panMasked = panMasked;
  }
  if (documentType === 'GST') {
    const gstinMasked = maskIdentifier(record.gstin);
    if (gstinMasked) extracted.gstinMasked = gstinMasked;
  }
  if (documentType === 'FINANCE') {
    const documentKind = normalizedDocumentKind(record.documentKind);
    const invoiceNumberMasked = maskIdentifier(record.invoiceNumber);
    const subtotal = safeNumber(record.subtotal);
    const taxAmount = safeNumber(record.taxAmount);
    const totalAmount = safeNumber(record.totalAmount);
    if (documentKind) extracted.documentKind = documentKind;
    if (subtotal !== undefined) extracted.subtotal = subtotal;
    if (taxAmount !== undefined) extracted.taxAmount = taxAmount;
    if (totalAmount !== undefined) extracted.totalAmount = totalAmount;
    extracted.currency = record.currency === 'INR' ? 'INR' : 'UNKNOWN';
    if (invoiceNumberMasked) extracted.invoiceNumberMasked = invoiceNumberMasked;
  }

  const documentDetected = typeof record.documentDetected === 'boolean' ? record.documentDetected : null;
  return {
    documentType,
    documentDetected,
    qualityScore,
    issues,
    extracted,
    reviewRequired: record.reviewRequired === true || documentDetected !== true || qualityScore < 60,
  };
};

export const DOCUMENT_VISION_PROMPT = [
  'Analyse this image for the requested Indian business document type.',
  'This is a bounded extraction aid, not a verification or approval decision.',
  'Use OCR internally only to classify the document and extract the allowlisted fields.',
  'Do not return raw OCR text, names, addresses, phone numbers, email addresses, bank details, account numbers, or unmasked RC, PAN, GSTIN, invoice, or document identifiers.',
  'Return JSON only with documentType, documentDetected, qualityScore (0-100), issues (short array), reviewRequired, and only the safe fields relevant to the requested type.',
  'For identifiers, return the original value only in the internal response field; the server will mask it before returning to the caller.',
  'For finance documents, return only documentKind, subtotal, taxAmount, totalAmount, currency, and invoiceNumber; do not return parties or payment details.',
].join(' ');

export type DocumentVisionDependencies = {
  configReader?: () => AiRuntimeConfig | Promise<AiRuntimeConfig>;
  providerFactory?: (provider: AiRuntimeConfig['provider'], apiKey: string) => AiProvider;
};

export const analyzeDocumentImage = async (input: {
  buffer: Buffer;
  mimeType: string;
  documentType: AiDocumentType;
  dependencies?: DocumentVisionDependencies;
}): Promise<AiDocumentAnalysis> => {
  if (!DOCUMENT_TYPES.has(input.documentType)) throw new Error('Unsupported AI document type.');
  if (!ALLOWED_DOCUMENT_IMAGE_MIME_TYPES.has(input.mimeType)) {
    throw new Error('Only JPEG, PNG, and WEBP document images can be analysed.');
  }
  if (input.buffer.length === 0 || input.buffer.length > MAX_DOCUMENT_IMAGE_BYTES) {
    throw new Error('Document images must be between 1 byte and 5MB for AI analysis.');
  }

  const dependencies = input.dependencies ?? {};
  const config = await (dependencies.configReader ?? getAiRuntimeConfig)();
  if (!config.enabled || !config.apiKey) throw new Error('AI provider is not configured.');
  if (config.provider !== 'openai' || !isSupportedAiChatModel(config.provider, config.model)) {
    throw new Error('The configured AI model does not support document image analysis.');
  }

  const provider = (dependencies.providerFactory ?? ((providerName, apiKey) => createAiProvider(providerName, apiKey)))(config.provider, config.apiKey);
  const response = await provider.complete({
    model: config.model,
    systemPrompt: DOCUMENT_VISION_PROMPT,
    userMessage: `Analyse this ${input.documentType} document image. Return only the requested safe JSON fields.`,
    imageDataUrl: `data:${input.mimeType};base64,${input.buffer.toString('base64')}`,
    timeoutMs: config.requestTimeoutMs ?? 20_000,
    maxOutputTokens: Math.min(config.maxOutputTokens ?? 600, 600),
  });

  return normalizeDocumentAnalysis({ ...asRecord(parseProviderJson(response.text)), documentType: input.documentType });
};
