import test from 'node:test';
import assert from 'node:assert/strict';
import { stripLegacyVariantLines } from './listingVariantPolicy.mjs';

test('removes legacy Variant lines without changing other listing details', () => {
  const description = [
    'Machine inspected and ready for work.',
    'Variant: Heavy Duty',
    'Registration no: CG04AB1234',
    'variant: Old value',
    'Owner name: JCB Exchange',
  ].join('\n');

  assert.equal(
    stripLegacyVariantLines(description),
    ['Machine inspected and ready for work.', 'Registration no: CG04AB1234', 'Owner name: JCB Exchange'].join('\n'),
  );
});

test('does not treat ordinary text containing the word variant as a field', () => {
  assert.equal(
    stripLegacyVariantLines('This variant is not a saved detail.'),
    'This variant is not a saved detail.',
  );
});
