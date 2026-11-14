import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildPublicSupportResult,
  buildPublicBuyerResult,
  parsePublicBuyerQuery,
  type PublicBuyerListing,
} from './publicAiAssistant.service';
import type { AiKnowledgeSource } from './aiKnowledge.service';

const vocabulary = {
  categories: ['Backhoe Loader', 'Excavator'],
  brands: ['JCB', 'Tata Hitachi'],
  models: ['3DX', 'JS 140'],
  locations: ['Gujarat', 'Rajasthan', 'Raipur, Chhattisgarh'],
};

test('parses Hinglish buyer intent into safe marketplace filters', () => {
  const intent = parsePublicBuyerQuery('2021 ke baad ki JCB 3DX, 30 lakh ke andar, Gujarat me chahiye', vocabulary);

  assert.equal(intent.minYear, 2022);
  assert.equal(intent.maxPrice, 3_000_000);
  assert.deepEqual(intent.brands, ['JCB']);
  assert.deepEqual(intent.models, ['3DX']);
  assert.deepEqual(intent.locations, ['Gujarat']);
});

test('supports English budget and location phrases', () => {
  const intent = parsePublicBuyerQuery('Find an excavator below 25 lakh in Rajasthan from 2019 onwards', vocabulary);

  assert.equal(intent.maxPrice, 2_500_000);
  assert.equal(intent.minYear, 2019);
  assert.deepEqual(intent.categories, ['Excavator']);
  assert.deepEqual(intent.locations, ['Rajasthan']);
});

test('public buyer result never exposes database identifiers or sensitive seller fields', () => {
  const listing: PublicBuyerListing = {
    id: '8d6db26c-7774-4e25-9e7b-123456789abc',
    title: 'JCB 3DX Plus',
    price: 2_750_000,
    manufacturingYear: 2021,
    operatingHours: 1800,
    locationCity: 'Raipur',
    locationState: 'Chhattisgarh',
    condition: 'GOOD',
    category: { id: 'category-secret', name: 'Backhoe Loader' },
    brand: { id: 'brand-secret', name: 'JCB' },
    model: { id: 'model-secret', name: '3DX' },
  };

  const result = buildPublicBuyerResult([listing], { maxPrice: 3_000_000 });
  const serialized = JSON.stringify(result);
  const match = result.matches[0];
  assert.ok(match);

  assert.equal(result.matches.length, 1);
  assert.equal('id' in match, false);
  assert.equal('categoryId' in match, false);
  assert.equal('brandId' in match, false);
  assert.equal('modelId' in match, false);
  assert.equal(serialized.includes(listing.id), false);
  assert.equal(serialized.includes('category-secret'), false);
  assert.match(match.listingPath, /^\/machines\//u);
});

test('empty buyer result explains that the live marketplace has no match', () => {
  const result = buildPublicBuyerResult([], { maxPrice: 1_000_000 });

  assert.equal(result.matches.length, 0);
  assert.match(result.message, /no matching machines/i);
  assert.equal(result.filters.maxPrice, 1_000_000);
});

test('guided buyer requests ask for a useful constraint instead of returning the whole inventory', () => {
  const result = buildPublicBuyerResult([
    { id: 'listing-1', title: 'JCB 3DX', price: 2_500_000, manufacturingYear: 2021, operatingHours: 1000, locationCity: 'Raipur', locationState: 'Chhattisgarh', condition: 'GOOD', category: null, brand: null, model: null },
  ], {});

  assert.equal(result.matches.length, 0);
  assert.equal(result.mode, 'CLARIFICATION');
  assert.match(result.message, /budget|model|location/i);
});

test('buyer recommendation and comparison modes are explicit and remain identifier-free', () => {
  const listings: PublicBuyerListing[] = [
    { id: 'listing-1', title: 'JCB 3DX', price: 2_500_000, manufacturingYear: 2021, operatingHours: 1000, locationCity: 'Raipur', locationState: 'Chhattisgarh', condition: 'GOOD', category: null, brand: { id: 'brand-1', name: 'JCB' }, model: { id: 'model-1', name: '3DX' } },
    { id: 'listing-2', title: 'JCB 3DX Plus', price: 2_800_000, manufacturingYear: 2022, operatingHours: 900, locationCity: 'Raipur', locationState: 'Chhattisgarh', condition: 'GOOD', category: null, brand: { id: 'brand-1', name: 'JCB' }, model: { id: 'model-1', name: '3DX' } },
  ];

  const recommendation = buildPublicBuyerResult(listings, { brands: ['JCB'] }, { mode: 'RECOMMENDATION' });
  const comparison = buildPublicBuyerResult(listings, { brands: ['JCB'] }, { mode: 'COMPARE' });

  assert.equal(recommendation.mode, 'RECOMMENDATION');
  assert.equal(comparison.mode, 'COMPARE');
  assert.match(recommendation.message, /recommend/i);
  assert.match(comparison.message, /compare/i);
  assert.equal(JSON.stringify(comparison).includes('listing-1'), false);
});

test('public support uses only explicitly public approved sources and recommends handoff when grounded data is missing', () => {
  const sources: AiKnowledgeSource[] = [
    { key: 'public-faq', title: 'Payment FAQ', category: 'PUBLIC_SUPPORT', content: 'Payment status can be checked from your account.', sourceUrl: 'https://example.com/faq', approved: true },
    { key: 'internal-sop', title: 'Internal KYC SOP', category: 'KYC', content: 'Internal review steps.', sourceUrl: 'https://example.com/internal', approved: true },
  ];

  const found = buildPublicSupportResult('payment status', sources);
  const missing = buildPublicSupportResult('unknown policy', sources);

  assert.equal(found.handoffRecommended, false);
  assert.equal(found.sources.length, 1);
  assert.equal(found.sources[0]?.title, 'Payment FAQ');
  assert.equal(missing.handoffRecommended, true);
  assert.equal(missing.sources.length, 0);
  assert.equal(JSON.stringify(found).includes('internal-sop'), false);
});
