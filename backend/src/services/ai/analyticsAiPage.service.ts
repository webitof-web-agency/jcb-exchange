export const ANALYTICS_AI_PAGE_KEYS = ['overview', 'listing-detail'] as const;
export type AnalyticsAiPageKey = (typeof ANALYTICS_AI_PAGE_KEYS)[number];

type PageContext = { moduleKey?: string | null | undefined };

const QUESTION_KEYS: Record<AnalyticsAiPageKey, readonly string[]> = {
  overview: ['analytics.overview.summary', 'analytics.overview.listing_status', 'analytics.overview.lead_funnel', 'analytics.overview.demand', 'analytics.overview.financial_availability'],
  'listing-detail': ['analytics.listing.detail', 'analytics.listing.performance', 'analytics.listing.leads', 'analytics.listing.status', 'analytics.listing.forecast'],
};

export const isAnalyticsAiPageKey = (value: string | null | undefined): value is AnalyticsAiPageKey =>
  value === 'overview' || value === 'listing-detail';

export const analyticsPageKeyFor = (message: string, context: PageContext = {}): AnalyticsAiPageKey | null => {
  if (context.moduleKey === 'analytics-overview') return 'overview';
  if (context.moduleKey === 'analytics-listing-detail') return 'listing-detail';
  const normalized = message.toLocaleLowerCase('en-IN').replace(/\s+/gu, ' ').trim();
  if (/\b(listing|vehicle)\b[\s\S]{0,30}\b(analytics|insights?|performance|detail)\b/u.test(normalized)) return 'listing-detail';
  if (/\b(analytics|insights?|analytics report|demand report)\b/u.test(normalized)) return 'overview';
  return null;
};

export const analyticsPageQuestionKeys = (pageKey: AnalyticsAiPageKey): readonly string[] => QUESTION_KEYS[pageKey];
