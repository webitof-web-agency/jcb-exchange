import crypto from 'crypto';
import prisma from '../lib/prisma';

const prismaAny = prisma as any;

export const ANALYTICS_EVENT_TYPES = new Set([
  'SEARCH',
  'FILTER_APPLIED',
  'SHARE',
  'CONTACT_CLICK',
  'LISTING_VIEW',
]);

export type AnalyticsEventInput = {
  eventType: string;
  anonymousId?: string | null;
  sessionId?: string | null;
  actorUserId?: string | null;
  listingId?: string | null;
  partnerId?: string | null;
  brandId?: string | null;
  modelId?: string | null;
  categoryId?: string | null;
  manufacturingYear?: number | null;
  query?: string | null;
  filterPayload?: Record<string, unknown> | null;
  resultCount?: number | null;
  source?: string | null;
  dedupeKey?: string | null;
  occurredAt?: Date;
};

const trimBounded = (value: unknown, maxLength: number) => {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim();
  return normalized ? normalized.slice(0, maxLength) : null;
};

const sanitizeFilterPayload = (value: unknown) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const allowedKeys = new Set(['brands', 'categories', 'locations', 'conditions', 'minPrice', 'maxPrice', 'sortBy']);
  const result: Record<string, unknown> = {};

  for (const [key, rawValue] of Object.entries(value)) {
    if (!allowedKeys.has(key)) {
      continue;
    }

    if (Array.isArray(rawValue)) {
      result[key] = rawValue
        .filter((item): item is string => typeof item === 'string')
        .map((item) => item.trim().slice(0, 80))
        .filter(Boolean)
        .slice(0, 20);
    } else if (typeof rawValue === 'string' || typeof rawValue === 'number') {
      result[key] = typeof rawValue === 'string' ? rawValue.trim().slice(0, 80) : rawValue;
    }
  }

  return Object.keys(result).length ? result : null;
};

const sanitizeOccurredAt = (date?: Date) => {
  if (!date || Number.isNaN(date.getTime())) {
    return new Date();
  }

  const now = Date.now();
  const timestamp = Math.min(date.getTime(), now + 5 * 60 * 1000);
  return new Date(timestamp);
};

export const hashDedupeKey = (value: string) => crypto.createHash('sha256').update(value).digest('hex');

export const recordAnalyticsEvent = async (input: AnalyticsEventInput): Promise<boolean> => {
  const eventType = input.eventType.trim().toUpperCase();
  if (!ANALYTICS_EVENT_TYPES.has(eventType)) {
    return false;
  }

  try {
    await prismaAny.analyticsEvent.create({
      data: {
        eventType,
        anonymousId: trimBounded(input.anonymousId, 128),
        sessionId: trimBounded(input.sessionId, 128),
        actorUserId: trimBounded(input.actorUserId, 64),
        listingId: trimBounded(input.listingId, 64),
        partnerId: trimBounded(input.partnerId, 64),
        brandId: trimBounded(input.brandId, 64),
        modelId: trimBounded(input.modelId, 64),
        categoryId: trimBounded(input.categoryId, 64),
        manufacturingYear:
          Number.isInteger(input.manufacturingYear) && Number(input.manufacturingYear) >= 1900
            ? Number(input.manufacturingYear)
            : null,
        query: trimBounded(input.query, 160),
        filterPayload: sanitizeFilterPayload(input.filterPayload),
        resultCount:
          Number.isInteger(input.resultCount) && Number(input.resultCount) >= 0
            ? Math.min(Number(input.resultCount), 1_000_000)
            : null,
        source: trimBounded(input.source, 64),
        dedupeKey: trimBounded(input.dedupeKey, 128),
        occurredAt: sanitizeOccurredAt(input.occurredAt),
      },
    });

    return true;
  } catch (error: any) {
    // Tracking is deliberately fail-safe. A duplicate dedupe key or an unavailable
    // analytics table must never interrupt marketplace, lead, or payment workflows.
    if (error?.code !== 'P2002') {
      console.error('Analytics event recording failed:', error);
    }
    return false;
  }
};

