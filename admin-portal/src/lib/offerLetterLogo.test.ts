import assert from 'node:assert/strict';
import test from 'node:test';
import { getOfferLetterLogoSource } from './offerLetter';

test('offer letter PDF always has a branded logo source when no dynamic logo is available', () => {
  assert.equal(getOfferLetterLogoSource(null), '/Logo-black.webp');
  assert.equal(getOfferLetterLogoSource('   '), '/Logo-black.webp');
});

test('offer letter PDF preserves the configured dynamic logo source', () => {
  assert.equal(getOfferLetterLogoSource('https://cdn.example.test/jcb-logo.webp'), 'https://cdn.example.test/jcb-logo.webp');
});
