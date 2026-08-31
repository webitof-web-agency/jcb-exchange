import { API_BASE_URL } from '@/lib/api';
import { parseRouteParam } from '@/lib/routeSlug';

type PublicListingSummary = {
  id: string;
};

type PublicListingsResponse = {
  success?: boolean;
  data?: PublicListingSummary[];
};

type DealerSummary = {
  id: string;
  userId?: string | null;
};

type DealersResponse = {
  success?: boolean;
  data?: DealerSummary[];
};

const findUniqueIdByPrefix = <T extends { id: string }>(items: T[], shortSuffix: string): string | null => {
  const normalizedSuffix = shortSuffix.trim().toLowerCase();
  const matches = items.filter((item) => item.id?.toLowerCase().startsWith(normalizedSuffix));
  return matches.length === 1 ? matches[0].id : null;
};

const getCanonicalDealerLookupId = (dealer: DealerSummary): string => dealer.userId || dealer.id;

const findUniqueDealerIdByPrefix = (items: DealerSummary[], shortSuffix: string): string | null => {
  const normalizedSuffix = shortSuffix.trim().toLowerCase();
  const matches = items.filter((item) =>
    getCanonicalDealerLookupId(item)?.toLowerCase().startsWith(normalizedSuffix)
  );

  if (matches.length !== 1) {
    return null;
  }

  return getCanonicalDealerLookupId(matches[0]);
};

export const resolvePublicMachineListingId = async (rawParam: string): Promise<string | null> => {
  const parsed = parseRouteParam(rawParam);

  if (parsed.kind === 'raw-id' || parsed.kind === 'legacy-slug-id') {
    return parsed.id;
  }

  if (parsed.kind !== 'slug-short' || !parsed.shortSuffix) {
    return null;
  }

  try {
    const response = await fetch(`${API_BASE_URL}/master/public-listings`, {
      next: { revalidate: 60 },
    });

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as PublicListingsResponse;
    return findUniqueIdByPrefix(data.data || [], parsed.shortSuffix);
  } catch {
    return null;
  }
};

export const resolvePublicDealerId = async (rawParam: string): Promise<string | null> => {
  const parsed = parseRouteParam(rawParam);

  if (parsed.kind === 'raw-id' || parsed.kind === 'legacy-slug-id') {
    return parsed.id;
  }

  if (parsed.kind !== 'slug-short' || !parsed.shortSuffix) {
    return null;
  }

  try {
    const response = await fetch(`${API_BASE_URL}/master/dealers`, {
      next: { revalidate: 300 },
    });

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as DealersResponse;
    return findUniqueDealerIdByPrefix(data.data || [], parsed.shortSuffix);
  } catch {
    return null;
  }
};
