import { API_BASE_URL } from './api';

const ANONYMOUS_ID_KEY = 'jcb_analytics_anonymous_id';
const SESSION_ID_KEY = 'jcb_analytics_session_id';

export type PublicAnalyticsIdentity = {
  anonymousId: string;
  sessionId: string;
};

const getOrCreateId = (storage: Storage, key: string) => {
  const existing = storage.getItem(key);
  if (existing) return existing;

  const value = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  storage.setItem(key, value);
  return value;
};

export type PublicAnalyticsEvent = {
  eventType: 'SEARCH' | 'FILTER_APPLIED' | 'SHARE' | 'CONTACT_CLICK';
  listingId?: string;
  brandId?: string;
  modelId?: string;
  categoryId?: string;
  manufacturingYear?: number;
  query?: string;
  filterPayload?: Record<string, unknown>;
  resultCount?: number;
  source?: string;
};

export const getPublicAnalyticsIdentity = (): PublicAnalyticsIdentity | null => {
  if (typeof window === 'undefined') return null;

  try {
    return {
      anonymousId: getOrCreateId(window.localStorage, ANONYMOUS_ID_KEY),
      sessionId: getOrCreateId(window.sessionStorage, SESSION_ID_KEY),
    };
  } catch {
    return null;
  }
};

export const trackPublicAnalyticsEvent = (event: PublicAnalyticsEvent) => {
  if (typeof window === 'undefined') return;

  try {
    const identity = getPublicAnalyticsIdentity();
    if (!identity) return;

    const payload = {
      ...event,
      ...identity,
    };

    void fetch(`${API_BASE_URL}/analytics/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      keepalive: true,
    }).catch(() => undefined);
  } catch {
    // Analytics must never block or surface errors in marketplace browsing.
  }
};
