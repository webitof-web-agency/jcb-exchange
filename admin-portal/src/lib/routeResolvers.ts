import api from '@/lib/api';
import { parseRouteParam } from '@/lib/routeSlug';

type IdRecord = {
  id: string;
};

type ListingsResponse = {
  listings?: IdRecord[];
};

type PartnersResponse = {
  partners?: IdRecord[];
};

type VisitorsResponse = {
  visitors?: IdRecord[];
};

type LeadsResponse = {
  leads?: IdRecord[];
};

const findUniqueIdByPrefix = (items: IdRecord[], shortSuffix: string): string | null => {
  const normalizedSuffix = shortSuffix.trim().toLowerCase();
  const matches = items.filter((item) => item.id?.toLowerCase().startsWith(normalizedSuffix));
  return matches.length === 1 ? matches[0].id : null;
};

const resolveFromList = async (
  rawParam: string,
  request: () => Promise<IdRecord[]>
): Promise<string | null> => {
  const parsed = parseRouteParam(rawParam);

  if (parsed.kind === 'raw-id' || parsed.kind === 'legacy-slug-id') {
    return parsed.id;
  }

  if (parsed.kind !== 'slug-short' || !parsed.shortSuffix) {
    return null;
  }

  try {
    const items = await request();
    return findUniqueIdByPrefix(items, parsed.shortSuffix);
  } catch {
    return null;
  }
};

export const resolveListingId = async (rawParam: string): Promise<string | null> =>
  resolveFromList(rawParam, async () => {
    const response = await api.get<ListingsResponse>('/listings');
    return response.data.listings || [];
  });

export const resolvePartnerId = async (rawParam: string): Promise<string | null> =>
  resolveFromList(rawParam, async () => {
    const response = await api.get<PartnersResponse>('/superadmin/partners');
    return response.data.partners || [];
  });

export const resolveVisitorId = async (rawParam: string): Promise<string | null> =>
  resolveFromList(rawParam, async () => {
    const response = await api.get<VisitorsResponse>('/superadmin/visitors');
    return response.data.visitors || [];
  });

export const resolveLeadId = async (rawParam: string): Promise<string | null> =>
  resolveFromList(rawParam, async () => {
    const response = await api.get<LeadsResponse>('/leads/my-leads');
    return response.data.leads || [];
  });
