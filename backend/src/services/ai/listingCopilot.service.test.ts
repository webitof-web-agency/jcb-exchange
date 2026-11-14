import assert from 'node:assert/strict';
import test from 'node:test';
import { analyzeListingDraft, type ListingDraftInput } from './listingCopilot.service';

const completeDraft: ListingDraftInput = {
  category: 'Backhoe Loader',
  brand: 'JCB',
  model: '3DX',
  manufacturingYear: 2021,
  operatingHours: 1800,
  condition: 'Good',
  locationCity: 'Raipur',
  locationState: 'Chhattisgarh',
  price: 2_800_000,
  mediaCount: 5,
  description: 'Well maintained machine with regular service history.',
  registrationVerified: true,
};

test('listing copilot creates a safe marketplace draft and comparable price guidance', () => {
  const result = analyzeListingDraft(completeDraft, [2_500_000, 2_700_000, 3_000_000]);

  assert.equal(result.qualityScore, 100);
  assert.equal(result.warnings.length, 0);
  assert.match(result.suggestedTitle, /2021 JCB 3DX Backhoe Loader/iu);
  assert.match(result.suggestedDescription, /Raipur/iu);
  assert.deepEqual(result.priceGuidance, {
    comparableCount: 3,
    low: 2_500_000,
    typical: 2_700_000,
    high: 3_000_000,
    quickSale: 2_565_000,
    note: 'Indicative range based on public comparable listings; not a guaranteed valuation.',
  });
});

test('listing copilot flags incomplete and risky draft fields without exposing identifiers', () => {
  const result = analyzeListingDraft({
    category: '',
    brand: 'JCB',
    model: '',
    manufacturingYear: null,
    operatingHours: null,
    condition: '',
    locationCity: '',
    locationState: 'Chhattisgarh',
    price: 0,
    mediaCount: 1,
    description: '',
    registrationVerified: false,
  }, []);

  assert.ok(result.qualityScore < 60);
  assert.ok(result.warnings.some((warning) => warning.code === 'MISSING_CATEGORY'));
  assert.ok(result.warnings.some((warning) => warning.code === 'IDENTITY_NOT_VERIFIED'));
  assert.equal('id' in result, false);
  assert.equal(result.priceGuidance, null);
});
