export type ListingDraftInput = {
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

export type ListingCopilotWarning = {
  code: string;
  severity: 'INFO' | 'WARNING' | 'REQUIRED';
  message: string;
};

export type ListingCopilotResult = {
  qualityScore: number;
  warnings: ListingCopilotWarning[];
  suggestedTitle: string;
  suggestedDescription: string;
  priceGuidance: {
    comparableCount: number;
    low: number;
    typical: number;
    high: number;
    quickSale: number;
    note: string;
  } | null;
};

const clean = (value: string) => value.trim().replace(/\s+/gu, ' ');
const money = (value: number) => Math.round(value / 100) * 100;

const warning = (code: string, severity: ListingCopilotWarning['severity'], message: string): ListingCopilotWarning => ({ code, severity, message });

const median = (values: number[]) => {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] || 0 : ((sorted[middle - 1] || 0) + (sorted[middle] || 0)) / 2;
};

export const analyzeListingDraft = (input: ListingDraftInput, comparablePrices: number[]): ListingCopilotResult => {
  const category = clean(input.category);
  const brand = clean(input.brand);
  const model = clean(input.model);
  const condition = clean(input.condition);
  const city = clean(input.locationCity);
  const state = clean(input.locationState);
  const description = clean(input.description);
  const warnings: ListingCopilotWarning[] = [];
  const checks = [
    [Boolean(category), 'MISSING_CATEGORY', 'Select a machine category before publishing.'],
    [Boolean(brand), 'MISSING_BRAND', 'Select or enter the machine brand.'],
    [Boolean(model), 'MISSING_MODEL', 'Add the exact machine model or variant.'],
    [input.manufacturingYear !== null && Number.isInteger(input.manufacturingYear) && input.manufacturingYear > 1950, 'MISSING_YEAR', 'Add a valid manufacturing year.'],
    [Number.isFinite(input.operatingHours) && (input.operatingHours || 0) >= 0, 'MISSING_HOURS', 'Add the operating hours or meter reading.'],
    [Boolean(condition), 'MISSING_CONDITION', 'Describe the machine condition.'],
    [Boolean(city || state), 'MISSING_LOCATION', 'Add the machine location.'],
    [input.price > 0, 'MISSING_PRICE', 'Add an asking price before publishing.'],
    [description.length >= 30, 'SHORT_DESCRIPTION', 'Add at least a short, useful machine description.'],
    [input.mediaCount >= 3, 'FEW_MEDIA', 'Add at least three clear machine photos from different angles.'],
    [input.registrationVerified, 'IDENTITY_NOT_VERIFIED', 'Verify the registration or chassis identity before publishing.'],
  ] as const;

  for (const [passed, code, message] of checks) {
    if (!passed) warnings.push(warning(code, code === 'IDENTITY_NOT_VERIFIED' ? 'REQUIRED' : 'WARNING', message));
  }

  const passedChecks = checks.filter(([passed]) => passed).length;
  const qualityScore = Math.round((passedChecks / checks.length) * 100);
  const location = [city, state].filter(Boolean).join(', ');
  const machineLabel = [input.manufacturingYear !== null ? input.manufacturingYear : null, brand, model, category].filter(Boolean).join(' ');
  const suggestedTitle = machineLabel || 'Used construction machine';
  const suggestedDescription = [
    `${suggestedTitle} available${location ? ` in ${location}` : ''}.`,
    input.operatingHours !== null && input.operatingHours !== undefined ? `${input.operatingHours.toLocaleString('en-IN')} operating hours.` : null,
    condition ? `Condition: ${condition}.` : null,
    description || null,
  ].filter(Boolean).join(' ');

  const prices = comparablePrices.filter((value) => Number.isFinite(value) && value > 0).map(money);
  const typical = prices.length ? money(median(prices)) : null;
  const priceGuidance = typical === null ? null : {
    comparableCount: prices.length,
    low: Math.min(...prices),
    typical,
    high: Math.max(...prices),
    quickSale: money(typical * 0.95),
    note: 'Indicative range based on public comparable listings; not a guaranteed valuation.',
  };

  return { qualityScore, warnings, suggestedTitle, suggestedDescription, priceGuidance };
};
