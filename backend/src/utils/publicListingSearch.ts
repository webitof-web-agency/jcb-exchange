// Search, filters, facets and paging for the public machines page, run on the cached public feed
// (utils/publicListingsCache.ts) instead of shipping the whole feed to every browser.
//
// Facet counts follow the usual marketplace rule: each filter group is counted with every OTHER active
// filter applied (so picking a brand still shows the other brands), and the free-text search does not
// narrow the facets (same as the page did when it filtered in the browser).

export const UNSPECIFIED_CONDITION = '__unspecified__';
export const PUBLIC_SEARCH_MAX_LIMIT = 60;
const DEFAULT_LIMIT = 12;

export type PublicFeedItem = {
  id: string;
  title: string;
  price: number;
  createdAt: Date | string;
  locationCity?: string | null;
  locationState?: string | null;
  condition?: string | null;
  category?: { id: string; name: string } | null;
  brand?: { id: string; name: string } | null;
  model?: { id: string; name: string } | null;
  partner?: { name?: string | null } | null;
};

export type PublicListingSort = 'newest' | 'price-low' | 'price-high';

export type PublicListingSearchParams = {
  q: string;
  categories: string[];
  brands: string[];
  locations: string[];
  conditions: string[];
  minPrice: number | null;
  maxPrice: number | null;
  sort: PublicListingSort;
  page: number;
  limit: number;
};

export type FacetEntry = { value: string; label: string; count: number };

const MAX_LIST_VALUES = 50;
const MAX_TEXT = 120;

const asText = (value: unknown) => (typeof value === 'string' ? value : Array.isArray(value) ? String(value[0] ?? '') : '').trim();

// Accepts ?brands=a,b and ?brands=a&brands=b. Values are matched exactly, so commas inside a value are
// sent URL-encoded as "%2C" by the client and decoded per item here.
const asList = (value: unknown): string[] => {
  const raw = Array.isArray(value) ? value.map(String) : typeof value === 'string' ? [value] : [];
  const items = raw
    .flatMap((entry) => entry.split(','))
    .map((entry) => {
      try {
        return decodeURIComponent(entry).trim();
      } catch {
        return entry.trim();
      }
    })
    .filter((entry) => entry.length > 0 && entry.length <= MAX_TEXT);
  return Array.from(new Set(items)).slice(0, MAX_LIST_VALUES);
};

const asPositiveNumber = (value: unknown): number | null => {
  const parsed = Number(asText(value));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

const asPositiveInt = (value: unknown, fallback: number) => {
  const parsed = Number.parseInt(asText(value), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

export const parsePublicListingSearch = (query: Record<string, unknown>): PublicListingSearchParams => {
  const sortText = asText(query.sort);
  const sort: PublicListingSort = sortText === 'price-low' || sortText === 'price-high' ? sortText : 'newest';
  return {
    q: asText(query.q).slice(0, MAX_TEXT),
    categories: asList(query.categories),
    brands: asList(query.brands),
    locations: asList(query.locations),
    conditions: asList(query.conditions),
    minPrice: asPositiveNumber(query.minPrice),
    maxPrice: asPositiveNumber(query.maxPrice),
    sort,
    page: asPositiveInt(query.page, 1),
    limit: Math.min(asPositiveInt(query.limit, DEFAULT_LIMIT), PUBLIC_SEARCH_MAX_LIMIT),
  };
};

export const locationLabelOf = (item: PublicFeedItem) =>
  [item.locationCity, item.locationState].filter(Boolean).join(', ');

const conditionOf = (item: PublicFeedItem) => (item.condition && item.condition.trim()) || UNSPECIFIED_CONDITION;

type Dimension = 'categories' | 'brands' | 'locations' | 'conditions';

const matchesDimension = (item: PublicFeedItem, dimension: Dimension, selected: string[]) => {
  if (selected.length === 0) return true;
  switch (dimension) {
    case 'categories':
      return Boolean(item.category && selected.includes(item.category.id));
    case 'brands':
      return Boolean(item.brand && selected.includes(item.brand.name));
    case 'locations':
      return selected.includes(locationLabelOf(item));
    case 'conditions':
      return selected.includes(conditionOf(item));
  }
};

const matchesPrice = (item: PublicFeedItem, params: PublicListingSearchParams) =>
  (params.minPrice === null || item.price >= params.minPrice) && (params.maxPrice === null || item.price <= params.maxPrice);

const matchesText = (item: PublicFeedItem, query: string) => {
  if (!query) return true;
  const needle = query.toLowerCase();
  return [
    item.title,
    item.brand?.name,
    item.category?.name,
    item.model?.name,
    item.locationCity,
    item.locationState,
    locationLabelOf(item),
    item.partner?.name,
  ].some((field) => (field || '').toLowerCase().includes(needle));
};

const DIMENSIONS: Dimension[] = ['categories', 'brands', 'locations', 'conditions'];

const matchesAllExcept = (item: PublicFeedItem, params: PublicListingSearchParams, skip: Dimension | null) =>
  matchesPrice(item, params) && DIMENSIONS.every((dimension) => dimension === skip || matchesDimension(item, dimension, params[dimension]));

const countFacet = (
  items: PublicFeedItem[],
  params: PublicListingSearchParams,
  dimension: Dimension,
  keyOf: (item: PublicFeedItem) => { value: string; label: string } | null,
): FacetEntry[] => {
  const counts = new Map<string, FacetEntry>();
  for (const item of items) {
    if (!matchesAllExcept(item, params, dimension)) continue;
    const key = keyOf(item);
    if (!key || !key.value) continue;
    const entry = counts.get(key.value);
    if (entry) entry.count += 1;
    else counts.set(key.value, { value: key.value, label: key.label, count: 1 });
  }
  return Array.from(counts.values()).sort((left, right) => left.label.localeCompare(right.label));
};

const timeOf = (value: Date | string) => new Date(value).getTime() || 0;

export const searchPublicListings = <T extends PublicFeedItem>(feed: T[], params: PublicListingSearchParams) => {
  const matched = feed.filter((item) => matchesAllExcept(item, params, null) && matchesText(item, params.q));

  matched.sort((left, right) => {
    if (params.sort === 'price-low') return left.price - right.price || timeOf(right.createdAt) - timeOf(left.createdAt);
    if (params.sort === 'price-high') return right.price - left.price || timeOf(right.createdAt) - timeOf(left.createdAt);
    return timeOf(right.createdAt) - timeOf(left.createdAt);
  });

  const total = matched.length;
  const totalPages = Math.max(1, Math.ceil(total / params.limit));
  const page = Math.min(params.page, totalPages);

  return {
    data: matched.slice((page - 1) * params.limit, page * params.limit),
    pagination: { page, limit: params.limit, total, totalPages },
    facets: {
      categories: countFacet(feed, params, 'categories', (item) => (item.category ? { value: item.category.id, label: item.category.name } : null)),
      brands: countFacet(feed, params, 'brands', (item) => (item.brand ? { value: item.brand.name, label: item.brand.name } : null)),
      locations: countFacet(feed, params, 'locations', (item) => {
        const label = locationLabelOf(item);
        return label ? { value: label, label } : null;
      }),
      conditions: countFacet(feed, params, 'conditions', (item) => {
        const value = conditionOf(item);
        return { value, label: value };
      }),
      priceMax: feed.reduce((max, item) => Math.max(max, Number(item.price) || 0), 0),
      totalListings: feed.length,
    },
  };
};
