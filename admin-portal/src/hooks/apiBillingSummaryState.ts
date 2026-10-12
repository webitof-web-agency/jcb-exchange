export type ApiBillingSummaryStatus = 'loading' | 'ready' | 'unavailable';

export const API_BILLING_POLL_INTERVAL_MS = 30_000;

export const shouldFetchApiBillingSummary = (hasHydrated: boolean, token: string | null) =>
  hasHydrated && Boolean(token);

export const shouldPollApiBillingSummary = (
  hasHydrated: boolean,
  token: string | null,
  isTabVisible: boolean,
) => shouldFetchApiBillingSummary(hasHydrated, token) && isTabVisible;
