import { searchApprovedKnowledge, type AiKnowledgeSource } from './aiKnowledge.service';

export type PublicBuyerVocabulary = {
  categories: string[];
  brands: string[];
  models: string[];
  locations: string[];
};

export type PublicBuyerIntent = {
  minPrice?: number;
  maxPrice?: number;
  minYear?: number;
  maxYear?: number;
  categories: string[];
  brands: string[];
  models: string[];
  locations: string[];
};

export type PublicBuyerListing = {
  id: string;
  title: string;
  price: number;
  manufacturingYear?: number | null;
  operatingHours?: number | null;
  locationCity?: string | null;
  locationState?: string | null;
  condition?: string | null;
  category?: { id: string; name: string } | null;
  brand?: { id: string; name: string } | null;
  model?: { id: string; name: string } | null;
};

export type PublicBuyerResult = {
  message: string;
  mode: 'SEARCH' | 'COMPARE' | 'RECOMMENDATION' | 'CLARIFICATION';
  filters: Partial<Pick<PublicBuyerIntent, 'minPrice' | 'maxPrice' | 'minYear' | 'maxYear'>>;
  nextQuestion?: string;
  matches: Array<{
    title: string;
    price: number;
    manufacturingYear: number | null;
    operatingHours: number | null;
    location: string | null;
    condition: string | null;
    category: string | null;
    brand: string | null;
    model: string | null;
    listingPath: string;
  }>;
};

export type PublicBuyerResultOptions = {
  mode?: Exclude<PublicBuyerResult['mode'], 'CLARIFICATION'>;
};

export type PublicSupportResult = {
  message: string;
  found: boolean;
  handoffRecommended: boolean;
  sources: Array<{
    title: string;
    category: string;
    content: string;
    sourceUrl: string | null;
  }>;
};

const normalize = (value: string) => value.toLocaleLowerCase('en-IN').replace(/\s+/gu, ' ').trim();

export const publicBuyerModeFor = (message: string): Exclude<PublicBuyerResult['mode'], 'CLARIFICATION'> => {
  const normalized = normalize(message);
  if (/\b(compare|comparison|versus|vs|difference|tulna|farak)\b/u.test(normalized)) return 'COMPARE';
  if (/\b(recommend|recommendation|suggest|best|suitable|right\s+machine|mere\s+liye)\b/u.test(normalized)) return 'RECOMMENDATION';
  return 'SEARCH';
};

const uniqueVocabularyMatches = (message: string, values: string[]) => {
  const normalizedMessage = normalize(message);
  return Array.from(new Set(
    values
      .filter((value) => value.trim())
      .sort((left, right) => right.length - left.length)
      .filter((value) => normalizedMessage.includes(normalize(value))),
  ));
};

const toMoney = (value: string, unit: string | undefined) => {
  const amount = Number(value.replace(/,/gu, ''));
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const normalizedUnit = unit?.toLowerCase();
  if (normalizedUnit === 'crore' || normalizedUnit === 'cr') return Math.round(amount * 10_000_000);
  if (normalizedUnit === 'lakh' || normalizedUnit === 'lakhs' || normalizedUnit === 'lac' || normalizedUnit === 'lacs') return Math.round(amount * 100_000);
  if (normalizedUnit === 'k') return Math.round(amount * 1_000);
  return Math.round(amount);
};

const readMaxPrice = (message: string): number | undefined => {
  const afterBudget = /(?:under|below|within|upto|up\s+to|max(?:imum)?|ke\s+andar|budget(?:\s+of)?|tak)\s*(?:of\s*)?(?:₹|rs\.?|inr)?\s*([\d,]+(?:\.\d+)?)\s*(crore|cr|lakh|lakhs|lacs|lac|k)?\b/iu.exec(message);
  const beforeBudget = /([\d,]+(?:\.\d+)?)\s*(crore|cr|lakh|lakhs|lacs|lac|k)\b\s*(?:ke\s+andar|tak|maximum|max|budget)/iu.exec(message);
  const match = afterBudget || beforeBudget;
  if (match) {
    const value = toMoney(match[1] || '', match[2]);
    if (value !== null) return value;
  }

  // A bare “30 lakh” is treated as a budget only when the message contains a
  // budget signal, preventing a year or operating-hour number from becoming a price.
  if (/(?:budget|price|cost|lakh|lac|crore|under|below|within|andar|tak)/iu.test(message)) {
    const fallback = /(?:₹|rs\.?|inr)?\s*([\d,]+(?:\.\d+)?)\s*(crore|cr|lakh|lakhs|lacs|lac|k)\b/iu.exec(message);
    if (fallback) {
      const value = toMoney(fallback[1] || '', fallback[2]);
      if (value !== null) return value;
    }
  }
  return undefined;
};

const readYears = (message: string): Pick<PublicBuyerIntent, 'minYear' | 'maxYear'> => {
  const result: Pick<PublicBuyerIntent, 'minYear' | 'maxYear'> = {};
  const minMatch = /(?:from|since|after|onwards|se\s+newer|ke\s+baad)\s*(?:year\s*)?(\d{4})|(?:\d{4})\s*(onwards|or\s+newer|ke\s+baad|after)/iu.exec(message);
  if (minMatch) {
    const year = Number(minMatch[1] || minMatch[0].match(/\d{4}/u)?.[0]);
    if (Number.isInteger(year) && year >= 1950 && year <= new Date().getFullYear() + 1) {
      result.minYear = /after|ke\s+baad/iu.test(minMatch[0]) && !/onwards|or\s+newer/iu.test(minMatch[0]) ? year + 1 : year;
    }
  }
  const maxMatch = /(?:before|prior\s+to|up\s+to|upto|before\s+year)\s*(\d{4})/iu.exec(message);
  if (maxMatch) {
    const year = Number(maxMatch[1]);
    if (Number.isInteger(year) && year >= 1950 && year <= new Date().getFullYear() + 1) result.maxYear = year;
  }
  return result;
};

export const parsePublicBuyerQuery = (message: string, vocabulary: PublicBuyerVocabulary): PublicBuyerIntent => {
  const years = readYears(message);
  const maxPrice = readMaxPrice(message);
  return {
    ...(maxPrice !== undefined ? { maxPrice } : {}),
    ...(years.minYear !== undefined ? { minYear: years.minYear } : {}),
    ...(years.maxYear !== undefined ? { maxYear: years.maxYear } : {}),
    categories: uniqueVocabularyMatches(message, vocabulary.categories),
    brands: uniqueVocabularyMatches(message, vocabulary.brands),
    models: uniqueVocabularyMatches(message, vocabulary.models),
    locations: uniqueVocabularyMatches(message, vocabulary.locations),
  };
};

const locationOf = (listing: PublicBuyerListing) => [listing.locationCity, listing.locationState].filter(Boolean).join(', ') || null;
const containsAny = (value: string | null | undefined, candidates: string[]) => !candidates.length || candidates.some((candidate) => normalize(value || '').includes(normalize(candidate)));

const matchesIntent = (listing: PublicBuyerListing, intent: PublicBuyerIntent) => (
  (intent.minPrice === undefined || listing.price >= intent.minPrice)
  && (intent.maxPrice === undefined || listing.price <= intent.maxPrice)
  && (intent.minYear === undefined || (listing.manufacturingYear ?? 0) >= intent.minYear)
  && (intent.maxYear === undefined || (listing.manufacturingYear ?? Number.MAX_SAFE_INTEGER) <= intent.maxYear)
  && containsAny(listing.category?.name, intent.categories)
  && containsAny(listing.brand?.name, intent.brands)
  && containsAny(listing.model?.name, intent.models)
  && (!intent.locations.length || intent.locations.some((location) => normalize(locationOf(listing) || '').includes(normalize(location))))
);

export const buildPublicBuyerResult = (
  listings: PublicBuyerListing[],
  intent: Partial<PublicBuyerIntent>,
  options: PublicBuyerResultOptions = {},
): PublicBuyerResult => {
  const normalizedIntent: PublicBuyerIntent = {
    categories: intent.categories || [],
    brands: intent.brands || [],
    models: intent.models || [],
    locations: intent.locations || [],
    ...(intent.minPrice !== undefined ? { minPrice: intent.minPrice } : {}),
    ...(intent.maxPrice !== undefined ? { maxPrice: intent.maxPrice } : {}),
    ...(intent.minYear !== undefined ? { minYear: intent.minYear } : {}),
    ...(intent.maxYear !== undefined ? { maxYear: intent.maxYear } : {}),
  };
  const hasConstraint = Boolean(
    normalizedIntent.categories.length
      || normalizedIntent.brands.length
      || normalizedIntent.models.length
      || normalizedIntent.locations.length
      || normalizedIntent.minPrice !== undefined
      || normalizedIntent.maxPrice !== undefined
      || normalizedIntent.minYear !== undefined
      || normalizedIntent.maxYear !== undefined,
  );
  const mode = hasConstraint ? (options.mode || 'SEARCH') : 'CLARIFICATION';
  const matches = hasConstraint ? listings
    .filter((listing) => matchesIntent(listing, normalizedIntent))
    .sort((left, right) => left.price - right.price || left.title.localeCompare(right.title))
    .slice(0, 12)
    .map((listing) => ({
      title: listing.title,
      price: listing.price,
      manufacturingYear: listing.manufacturingYear ?? null,
      operatingHours: listing.operatingHours ?? null,
      location: locationOf(listing),
      condition: listing.condition || null,
      category: listing.category?.name || null,
      brand: listing.brand?.name || null,
      model: listing.model?.name || null,
      // This is an opaque public route reference, never the database id.
      listingPath: `/machines/${listing.id.slice(0, 8)}`,
    })) : [];

  const filters = Object.fromEntries(
    (['minPrice', 'maxPrice', 'minYear', 'maxYear'] as const)
      .filter((key) => normalizedIntent[key] !== undefined)
      .map((key) => [key, normalizedIntent[key]]),
  ) as PublicBuyerResult['filters'];

  return {
    mode,
    message: mode === 'CLARIFICATION'
      ? 'Tell me at least one useful detail—model or category, budget, year, or location—so I can find the right machines.'
      : matches.length
        ? mode === 'COMPARE'
          ? `Compare these ${matches.length} matching machine${matches.length === 1 ? '' : 's'} side by side from the live marketplace.`
          : mode === 'RECOMMENDATION'
            ? `I recommend these ${matches.length} matching machine${matches.length === 1 ? '' : 's'} based on your budget and preferences.`
            : `I found ${matches.length} matching machine${matches.length === 1 ? '' : 's'} in the live marketplace.`
        : 'No matching machines were found in the live marketplace. Try a wider budget, year range or location.',
    ...(mode === 'CLARIFICATION' ? { nextQuestion: 'Which model/category, budget, year, or city should I use?' } : {}),
    filters,
    matches,
  };
};

export const buildPublicSupportResult = (query: string, sources: readonly AiKnowledgeSource[]): PublicSupportResult => {
  const publicSources = sources.filter((source) => source.approved && /^(?:PUBLIC|FAQ|SUPPORT)/iu.test(source.category));
  const grounded = searchApprovedKnowledge(query, publicSources);
  return {
    found: grounded.found,
    handoffRecommended: !grounded.found,
    message: grounded.found
      ? 'Here is the answer from approved JCB Exchange support information.'
      : 'I could not find an approved answer for that question. Please contact the JCB Exchange support team for a verified response.',
    sources: grounded.sources.map((source) => ({
      title: source.title,
      category: source.category,
      content: source.content,
      sourceUrl: source.sourceUrl,
    })),
  };
};
