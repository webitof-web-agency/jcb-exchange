'use client';

import { useEffect, useState } from 'react';
import { BarChart3 } from 'lucide-react';
import api from '@/lib/api';
import type { useTranslation } from '@/hooks/useTranslation';

// Fair price range from comparable machines on the marketplace (see backend utils/listingPriceInsight.ts).
// Renders nothing until there are enough comparables.

type PriceInsight = {
  basis: 'model' | 'brand' | 'category';
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

type Translate = ReturnType<typeof useTranslation>['t'];

// The price card renders twice (mobile and desktop layouts); both share one request.
const requests = new Map<string, Promise<PriceInsight | null>>();

const loadInsight = (listingId: string) => {
  let request = requests.get(listingId);
  if (!request) {
    request = api
      .get(`/master/public-listings/${encodeURIComponent(listingId)}/price-insight`)
      .then((response) => (response.data?.success ? (response.data.data as PriceInsight | null) : null))
      .catch(() => null);
    requests.set(listingId, request);
  }
  return request;
};

const formatLakh = (amount: number) =>
  amount >= 100000
    ? `₹${(amount / 100000).toFixed(amount >= 10000000 ? 1 : 2)} L`
    : new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount);

export default function PriceInsightCard({ listingId, price, t }: { listingId: string; price: number; t: Translate }) {
  const [insight, setInsight] = useState<PriceInsight | null>(null);

  useEffect(() => {
    let active = true;
    loadInsight(listingId).then((result) => {
      if (active) setInsight(result);
    });
    return () => {
      active = false;
    };
  }, [listingId]);

  if (!insight) return null;

  const span = Math.max(insight.high - insight.low, 1);
  // Where this machine's price sits on the bar; the bar shows the middle half of comparable prices.
  const markerPercent = Math.min(100, Math.max(0, ((price - insight.low) / span) * 100));
  const basisLabel =
    insight.basis === 'model'
      ? t('machineDetails.priceInsightBasisModel', 'same model')
      : insight.basis === 'brand'
        ? t('machineDetails.priceInsightBasisBrand', 'same brand and type')
        : t('machineDetails.priceInsightBasisCategory', 'same equipment type');
  const positionLabel =
    insight.position === 'below'
      ? t('machineDetails.priceInsightBelow', 'Priced below the usual range')
      : insight.position === 'above'
        ? t('machineDetails.priceInsightAbove', 'Priced above the usual range')
        : t('machineDetails.priceInsightWithin', 'Priced within the usual range');
  const positionClass =
    insight.position === 'below'
      ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
      : insight.position === 'above'
        ? 'text-amber-800 bg-amber-50 border-amber-200'
        : 'text-sky-800 bg-sky-50 border-sky-200';

  return (
    <div className="mx-4 sm:mx-5 mb-4 rounded-xl border border-gray-200 bg-gray-50/70 p-3.5">
      <div className="flex items-center gap-2 mb-2">
        <BarChart3 size={14} className="text-gray-500 shrink-0" />
        <span className="text-[11px] font-bold uppercase tracking-wider text-gray-600">
          {t('machineDetails.priceInsightTitle', 'Market price range')}
        </span>
      </div>
      <div className="flex items-baseline justify-between text-sm font-bold text-gray-900 tabular-nums">
        <span>{formatLakh(insight.low)}</span>
        <span className="text-[11px] font-semibold text-gray-500">
          {t('machineDetails.priceInsightMedian', 'Typical {amount}', { amount: formatLakh(insight.median) })}
        </span>
        <span>{formatLakh(insight.high)}</span>
      </div>
      <div className="relative mt-2 h-2 rounded-full bg-gradient-to-r from-emerald-300 via-sky-300 to-amber-300" aria-hidden="true">
        <span
          className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-gray-900 shadow"
          style={{ left: `${markerPercent}%` }}
        />
      </div>
      <p className={`mt-2.5 inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${positionClass}`}>{positionLabel}</p>
      <p className="mt-1.5 text-[11px] leading-snug text-gray-500">
        {t(
          'machineDetails.priceInsightBasis',
          'Based on {count} {basis} machines on JCB Exchange{years}.',
          {
            count: insight.sampleSize,
            basis: basisLabel,
            years: insight.yearFrom && insight.yearTo ? ` (${insight.yearFrom}–${insight.yearTo})` : '',
          },
        )}
      </p>
    </div>
  );
}
