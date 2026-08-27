import api from '@/lib/api';
import { parseRouteParam } from '@/lib/routeSlug';

type OwnedListingSummary = {
  id: string;
};

type OwnedListingsResponse = {
  listings?: OwnedListingSummary[];
};

const findUniqueListingId = (items: OwnedListingSummary[], shortSuffix: string): string | null => {
  const normalizedSuffix = shortSuffix.trim().toLowerCase();
  const matches = items.filter((item) => item.id?.toLowerCase().startsWith(normalizedSuffix));
  return matches.length === 1 ? matches[0].id : null;
};

export const resolveOwnedListingId = async (rawParam: string): Promise<string | null> => {
  const parsed = parseRouteParam(rawParam);

  if (parsed.kind === 'raw-id' || parsed.kind === 'legacy-slug-id') {
    return parsed.id;
  }

  if (parsed.kind !== 'slug-short' || !parsed.shortSuffix) {
    return null;
  }

  try {
    const response = await api.get<OwnedListingsResponse>('/listings');
    return findUniqueListingId(response.data.listings || [], parsed.shortSuffix);
  } catch {
    return null;
  }
};
