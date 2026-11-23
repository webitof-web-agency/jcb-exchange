export type ListingAiAssistDraft = {
  category: string;
  brand: string;
  model: string;
  manufacturingYear: number | null;
  operatingHours: number | null;
  condition: string;
  locationCity: string;
  locationState: string;
  price: number;
  mediaCount: number;
  description: string;
  registrationVerified: boolean;
};

export type ListingAiAssistFormInput = {
  category: string;
  brand: string;
  model: string;
  manufacturingYear: string | number | null | undefined;
  operatingHours: string | number | null | undefined;
  condition: string;
  locationCity: string;
  locationState: string;
  price: string | number | null | undefined;
  mediaCount: number;
  description: string;
  registrationVerified: boolean;
};

export type ListingAiAssistWarning = {
  code: string;
  severity: 'INFO' | 'WARNING' | 'REQUIRED';
  message: string;
};

export type ListingAiPriceGuidance = {
  comparableCount: number;
  low: number;
  typical: number;
  high: number;
  quickSale: number;
  note: string;
};

export type ListingCopilotResult = {
  qualityScore: number;
  warnings: ListingAiAssistWarning[];
  suggestedTitle: string;
  suggestedDescription: string;
  priceGuidance: ListingAiPriceGuidance | null;
};

export type ListingAiSuggestionPatch = {
  title?: string;
  description?: string;
};

const text = (value: unknown) => (typeof value === 'string' ? value.trim().replace(/\s+/gu, ' ') : '');

const nullableNumber = (value: unknown) => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = typeof value === 'string' ? Number(value.replace(/,/gu, '').trim()) : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const nonNegativeNumber = (value: unknown) => {
  const parsed = nullableNumber(value);
  return parsed !== null && parsed >= 0 ? parsed : 0;
};

export const buildListingAiAssistDraft = (input: ListingAiAssistFormInput): ListingAiAssistDraft => ({
  category: text(input.category),
  brand: text(input.brand),
  model: text(input.model),
  manufacturingYear: nullableNumber(input.manufacturingYear),
  operatingHours: nullableNumber(input.operatingHours),
  condition: text(input.condition),
  locationCity: text(input.locationCity),
  locationState: text(input.locationState),
  price: nonNegativeNumber(input.price),
  mediaCount: Number.isFinite(input.mediaCount) ? Math.max(0, Math.floor(input.mediaCount)) : 0,
  description: text(input.description),
  registrationVerified: input.registrationVerified === true,
});

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const clampScore = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.min(100, Math.round(parsed))) : null;
};

const normalizePriceGuidance = (value: unknown): ListingAiPriceGuidance | null => {
  if (!isRecord(value)) return null;
  const comparableCount = Number(value.comparableCount);
  const low = Number(value.low);
  const typical = Number(value.typical);
  const high = Number(value.high);
  const quickSale = Number(value.quickSale);
  const note = text(value.note);
  if (!Number.isFinite(comparableCount) || !Number.isFinite(low) || !Number.isFinite(typical) || !Number.isFinite(high) || !Number.isFinite(quickSale) || !note) return null;
  return {
    comparableCount: Math.max(0, Math.floor(comparableCount)),
    low: Math.max(0, low),
    typical: Math.max(0, typical),
    high: Math.max(0, high),
    quickSale: Math.max(0, quickSale),
    note,
  };
};

export const normalizeListingCopilotResult = (value: unknown): ListingCopilotResult | null => {
  if (!isRecord(value)) return null;
  const qualityScore = clampScore(value.qualityScore);
  const suggestedTitle = text(value.suggestedTitle);
  const suggestedDescription = text(value.suggestedDescription);
  if (qualityScore === null || !suggestedTitle || !suggestedDescription || !Array.isArray(value.warnings)) return null;

  const warnings = value.warnings.flatMap((entry): ListingAiAssistWarning[] => {
    if (!isRecord(entry)) return [];
    const code = text(entry.code);
    const message = text(entry.message);
    const severity = entry.severity;
    if (!code || !message || (severity !== 'INFO' && severity !== 'WARNING' && severity !== 'REQUIRED')) return [];
    return [{ code, message, severity }];
  });

  return {
    qualityScore,
    warnings,
    suggestedTitle,
    suggestedDescription,
    priceGuidance: normalizePriceGuidance(value.priceGuidance),
  };
};

export const mergeListingAiSuggestions = (
  current: { title: string; description: string },
  result: ListingCopilotResult,
  apply: { title?: boolean; description?: boolean },
) => ({
  title: apply.title ? result.suggestedTitle : current.title,
  description: apply.description ? result.suggestedDescription : current.description,
});
