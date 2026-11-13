import assert from 'node:assert/strict';
import test from 'node:test';
import { buildPriceInsight, type PriceInsightItem } from './listingPriceInsight';

const machine = (id: string, price: number, overrides: Partial<PriceInsightItem> = {}): PriceInsightItem => ({
  id,
  price,
  manufacturingYear: 2020,
  category: { id: 'backhoe' },
  brand: { id: 'jcb' },
  model: { id: '3dx' },
  ...overrides,
});

const target = machine('target', 2_000_000);

test('uses same-model comparables first, sold and available together', () => {
  const insight = buildPriceInsight(
    target,
    [machine('a1', 1_800_000), machine('a2', 2_200_000)],
    [machine('s1', 1_900_000), machine('s2', 2_100_000)],
  );
  assert.ok(insight);
  assert.equal(insight.basis, 'model');
  assert.equal(insight.sampleSize, 4);
  assert.equal(insight.soldCount, 2);
  assert.equal(insight.availableCount, 2);
  assert.equal(insight.median, 2_000_000);
  assert.equal(insight.position, 'within');
});

test('falls back to brand, then category, when a group is too small', () => {
  const otherModel = { model: { id: '4dx' } };
  const byBrand = buildPriceInsight(target, [machine('a1', 1_000_000, otherModel), machine('a2', 1_100_000, otherModel), machine('a3', 1_200_000, otherModel)], []);
  assert.equal(byBrand?.basis, 'brand');
  assert.equal(byBrand?.position, 'above');

  const otherBrand = { brand: { id: 'cat' }, model: { id: '424' } };
  const byCategory = buildPriceInsight(target, [machine('a1', 3_000_000, otherBrand), machine('a2', 3_100_000, otherBrand), machine('a3', 3_200_000, otherBrand)], []);
  assert.equal(byCategory?.basis, 'category');
  assert.equal(byCategory?.position, 'below');
});

test('ignores the machine itself, other years and other categories', () => {
  const pool = [
    machine('target', 2_000_000),
    machine('old', 900_000, { manufacturingYear: 2010 }),
    machine('excavator', 5_000_000, { category: { id: 'excavator' }, brand: { id: 'x' }, model: { id: 'y' } }),
    machine('a1', 1_900_000),
    machine('a2', 2_100_000),
  ];
  assert.equal(buildPriceInsight(target, pool, []), null);
});

test('a machine in both feeds is counted once', () => {
  const insight = buildPriceInsight(target, [machine('x', 1_000_000), machine('y', 2_000_000)], [machine('x', 1_000_000), machine('z', 3_000_000)]);
  assert.equal(insight?.sampleSize, 3);
});

test('no category or no price means no insight', () => {
  assert.equal(buildPriceInsight({ ...target, category: null }, [machine('a', 1), machine('b', 2), machine('c', 3)], []), null);
  assert.equal(buildPriceInsight({ ...target, price: 0 }, [machine('a', 1), machine('b', 2), machine('c', 3)], []), null);
});
