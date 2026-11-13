import assert from 'node:assert/strict';
import test from 'node:test';
import { parsePublicListingSearch, searchPublicListings, UNSPECIFIED_CONDITION, type PublicFeedItem } from './publicListingSearch';

const item = (overrides: Partial<PublicFeedItem> & { id: string }): PublicFeedItem => ({
  title: `Machine ${overrides.id}`,
  price: 1_000_000,
  createdAt: '2026-11-01T00:00:00Z',
  locationCity: 'Raipur',
  locationState: 'Chhattisgarh',
  condition: 'Good',
  category: { id: 'cat-bh', name: 'Backhoe Loader' },
  brand: { id: 'b-jcb', name: 'JCB' },
  model: { id: 'm-3dx', name: '3DX' },
  partner: { name: 'Shree Motors' },
  ...overrides,
});

const feed: PublicFeedItem[] = [
  item({ id: '1', price: 1_500_000, createdAt: '2026-11-03T00:00:00Z' }),
  item({ id: '2', price: 900_000, brand: { id: 'b-cat', name: 'CAT' }, createdAt: '2026-11-02T00:00:00Z' }),
  item({ id: '3', price: 2_500_000, category: { id: 'cat-ex', name: 'Excavator' }, locationCity: 'Pune', locationState: 'Maharashtra' }),
  item({ id: '4', price: 700_000, condition: null, createdAt: '2026-10-01T00:00:00Z' }),
];

const params = (query: Record<string, unknown>) => parsePublicListingSearch(query);

test('parses lists, numbers, sort and caps the page size', () => {
  const parsed = params({ brands: 'JCB,CAT', categories: ['cat-bh'], minPrice: '100', maxPrice: 'x', sort: 'price-high', limit: '500' });
  assert.deepEqual(parsed.brands, ['JCB', 'CAT']);
  assert.deepEqual(parsed.categories, ['cat-bh']);
  assert.equal(parsed.minPrice, 100);
  assert.equal(parsed.maxPrice, null);
  assert.equal(parsed.sort, 'price-high');
  assert.equal(parsed.limit, 60);
  assert.equal(params({ sort: 'drop table' }).sort, 'newest');
  assert.deepEqual(params({ brands: 'Tata%2C Hitachi' }).brands, ['Tata, Hitachi']);
});

test('filters by every group and pages the newest first', () => {
  const result = searchPublicListings(feed, params({ brands: 'JCB', limit: '2' }));
  assert.deepEqual(result.data.map((entry) => entry.id), ['1', '3']);
  assert.deepEqual(result.pagination, { page: 1, limit: 2, total: 3, totalPages: 2 });
  const second = searchPublicListings(feed, params({ brands: 'JCB', limit: '2', page: '9' }));
  assert.deepEqual(second.data.map((entry) => entry.id), ['4']);
  assert.equal(second.pagination.page, 2);
});

test('text search covers title, brand, model, location and partner', () => {
  assert.deepEqual(searchPublicListings(feed, params({ q: 'pune' })).data.map((entry) => entry.id), ['3']);
  assert.equal(searchPublicListings(feed, params({ q: 'shree' })).pagination.total, 4);
  assert.equal(searchPublicListings(feed, params({ q: 'nothing-like-this' })).pagination.total, 0);
});

test('price range and sort', () => {
  const result = searchPublicListings(feed, params({ minPrice: '800000', maxPrice: '2000000', sort: 'price-low' }));
  assert.deepEqual(result.data.map((entry) => entry.id), ['2', '1']);
});

test('facets ignore their own group but apply the others', () => {
  const result = searchPublicListings(feed, params({ brands: 'CAT', categories: 'cat-bh' }));
  assert.deepEqual(result.facets.brands.map((entry) => [entry.value, entry.count]), [['CAT', 1], ['JCB', 2]]);
  assert.deepEqual(result.facets.categories.map((entry) => [entry.value, entry.count]), [['cat-bh', 1]]);
  assert.equal(result.facets.priceMax, 2_500_000);
  assert.equal(result.facets.totalListings, 4);
});

test('a listing without a condition is filterable as unspecified', () => {
  const result = searchPublicListings(feed, params({ conditions: UNSPECIFIED_CONDITION }));
  assert.deepEqual(result.data.map((entry) => entry.id), ['4']);
  assert.ok(result.facets.conditions.some((entry) => entry.value === UNSPECIFIED_CONDITION && entry.count === 1));
});
