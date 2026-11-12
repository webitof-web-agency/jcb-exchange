// "Fair price range" for a machine, from comparable listings on the marketplace: machines already sold
// (their sale price) and machines on sale now (their buyer price). Pure function over the cached public
// feeds, so the detail page gets it without extra database work.
//
// Comparables are looked for from the most to the least specific group, and the first group with enough
// machines wins: same model → same brand and category → same category. Only machines within a few years
// of the same manufacturing year count. With too few comparables no range is shown at all.

export const PRICE_INSIGHT_MIN_SAMPLE = 3;
export const PRICE_INSIGHT_YEAR_WINDOW = 3;

export type PriceInsightItem = {
  id: string;
  price: number;
  manufacturingYear?: number | null;
  category?: { id: string } | null;
  brand?: { id: string } | null;
  model?: { id: string } | null;
};

export type PriceInsightBasis = 'model' | 'brand' | 'category';

export type PriceInsight = {
  basis: PriceInsightBasis;
  sampleSize: number;
  soldCount: number;
  availableCount: number;
  low: number;
  median: number;
  high: number;
  yearFrom: number | null;
  yearTo: number | null;
  position: 'below' | 'within' | 'above';
};

const quantile = (sorted: number[], q: number) => {
  if (sorted.length === 1) return sorted[0]!;
  const index = (sorted.length - 1) * q;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const weight = index - lower;
  return sorted[lower]! * (1 - weight) + sorted[upper]! * weight;
};

const roundPrice = (value: number) => (value >= 100_000 ? Math.round(value / 1_000) * 1_000 : Math.round(value));

export const buildPriceInsight = (
  target: PriceInsightItem,
  available: PriceInsightItem[],
  sold: PriceInsightItem[],
): PriceInsight | null => {
  const targetPrice = Number(target.price);
  if (!target.category?.id || !Number.isFinite(targetPrice) || targetPrice <= 0) return null;

  const year = Number(target.manufacturingYear) || null;
  const inYearWindow = (item: PriceInsightItem) => {
    if (!year) return true;
    const itemYear = Number(item.manufacturingYear) || null;
    return itemYear !== null && Math.abs(itemYear - year) <= PRICE_INSIGHT_YEAR_WINDOW;
  };
  const usable = (item: PriceInsightItem) =>
    item.id !== target.id && Number.isFinite(Number(item.price)) && Number(item.price) > 0 && inYearWindow(item);

  const tiers: Array<{ basis: PriceInsightBasis; matches: (item: PriceInsightItem) => boolean }> = [];
  if (target.model?.id) tiers.push({ basis: 'model', matches: (item) => item.model?.id === target.model!.id });
  if (target.brand?.id) {
    tiers.push({ basis: 'brand', matches: (item) => item.brand?.id === target.brand!.id && item.category?.id === target.category!.id });
  }
  tiers.push({ basis: 'category', matches: (item) => item.category?.id === target.category!.id });

  for (const tier of tiers) {
    const soldMatches = sold.filter((item) => usable(item) && tier.matches(item));
    const availableMatches = available.filter((item) => usable(item) && tier.matches(item));
    // A machine can briefly sit in both feeds around the moment it sells; count it once.
    const seen = new Set<string>();
    const prices: number[] = [];
    let soldCount = 0;
    let availableCount = 0;
    for (const item of soldMatches) {
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      prices.push(Number(item.price));
      soldCount += 1;
    }
    for (const item of availableMatches) {
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      prices.push(Number(item.price));
      availableCount += 1;
    }
    if (prices.length < PRICE_INSIGHT_MIN_SAMPLE) continue;

    prices.sort((left, right) => left - right);
    const low = roundPrice(quantile(prices, 0.25));
    const high = roundPrice(quantile(prices, 0.75));
    return {
      basis: tier.basis,
      sampleSize: prices.length,
      soldCount,
      availableCount,
      low,
      median: roundPrice(quantile(prices, 0.5)),
      high,
      yearFrom: year ? year - PRICE_INSIGHT_YEAR_WINDOW : null,
      yearTo: year ? year + PRICE_INSIGHT_YEAR_WINDOW : null,
      position: targetPrice < low ? 'below' : targetPrice > high ? 'above' : 'within',
    };
  }

  return null;
};
