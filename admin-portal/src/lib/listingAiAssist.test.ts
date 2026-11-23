import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildListingAiAssistDraft,
  mergeListingAiSuggestions,
  normalizeListingCopilotResult,
} from './listingAiAssist';

test('buildListingAiAssistDraft sends normalized numeric and listing fields', () => {
  assert.deepEqual(buildListingAiAssistDraft({
    category: ' Backhoe Loader ',
    brand: ' JCB ',
    model: ' 3DX ',
    manufacturingYear: '2021',
    operatingHours: '1,800',
    condition: ' Good ',
    locationCity: ' Raipur ',
    locationState: ' Chhattisgarh ',
    price: '2800000',
    mediaCount: 4,
    description: ' Well maintained machine. ',
    registrationVerified: true,
  }), {
    category: 'Backhoe Loader',
    brand: 'JCB',
    model: '3DX',
    manufacturingYear: 2021,
    operatingHours: 1800,
    condition: 'Good',
    locationCity: 'Raipur',
    locationState: 'Chhattisgarh',
    price: 2800000,
    mediaCount: 4,
    description: 'Well maintained machine.',
    registrationVerified: true,
  });
});

test('normalizeListingCopilotResult clamps score and ignores malformed checklist entries', () => {
  assert.deepEqual(normalizeListingCopilotResult({
    qualityScore: 140,
    suggestedTitle: '2021 JCB 3DX',
    suggestedDescription: 'Well maintained machine available in Raipur.',
    warnings: [
      { code: 'MISSING_MEDIA', severity: 'WARNING', message: 'Add more photos.' },
      { code: 'BAD', severity: 'NOPE', message: 'Ignore this severity.' },
      null,
    ],
    priceGuidance: null,
  }), {
    qualityScore: 100,
    suggestedTitle: '2021 JCB 3DX',
    suggestedDescription: 'Well maintained machine available in Raipur.',
    warnings: [{ code: 'MISSING_MEDIA', severity: 'WARNING', message: 'Add more photos.' }],
    priceGuidance: null,
  });
});

test('mergeListingAiSuggestions preserves the draft until a field is explicitly applied', () => {
  const result = {
    qualityScore: 50,
    warnings: [],
    suggestedTitle: '2021 JCB 3DX Backhoe Loader',
    suggestedDescription: 'A well maintained JCB 3DX available in Raipur.',
    priceGuidance: null,
  };

  assert.deepEqual(mergeListingAiSuggestions(
    { title: 'My custom title', description: 'My custom description' },
    result,
    { title: false, description: true },
  ), {
    title: 'My custom title',
    description: 'A well maintained JCB 3DX available in Raipur.',
  });
});
