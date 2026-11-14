import { buildFraudReview } from './operationsCopilot.service';

type NumericLike = number | string | { toNumber?: () => number } | null | undefined;

export type FraudSignalInputs = {
  prices: NumericLike[];
  identityConflictCount: number;
  mediaUrls: Array<string | null | undefined>;
  rejectedPaymentCount: number;
  listingPartnerIds: Array<string | null | undefined>;
};

export type FraudSignalSummary = {
  comparableMedian: number | null;
  listingsReviewed: number;
  identityConflicts: number;
  rejectedPayments: number;
  duplicateMedia: number;
  duplicateMediaGroups: number;
  repeatedAccountSignals: number;
  review: ReturnType<typeof buildFraudReview>;
};

const asFiniteMoney = (value: NumericLike): number | null => {
  const candidate = typeof value === 'object' && value !== null && typeof value.toNumber === 'function'
    ? value.toNumber()
    : typeof value === 'string' ? Number(value) : value;
  return typeof candidate === 'number' && Number.isFinite(candidate) && candidate > 0 && candidate <= 1_000_000_000_000
    ? candidate
    : null;
};

const median = (values: number[]) => {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? Math.round(((sorted[middle - 1]! + sorted[middle]!) / 2) * 100) / 100
    : Math.round(sorted[middle]! * 100) / 100;
};

const duplicateMediaStats = (urls: Array<string | null | undefined>) => {
  const counts = new Map<string, number>();
  for (const rawUrl of urls) {
    const url = typeof rawUrl === 'string' ? rawUrl.trim() : '';
    if (!url) continue;
    counts.set(url, (counts.get(url) || 0) + 1);
  }
  const groups = [...counts.values()].filter((count) => count > 1);
  return {
    groups: groups.length,
    reusedItems: groups.reduce((total, count) => total + count - 1, 0),
  };
};

const repeatedAccountSignals = (ids: Array<string | null | undefined>) => {
  const counts = new Map<string, number>();
  for (const rawId of ids) {
    const id = typeof rawId === 'string' ? rawId.trim() : '';
    if (!id) continue;
    counts.set(id, (counts.get(id) || 0) + 1);
  }
  return [...counts.values()].filter((count) => count >= 3).length;
};

export const buildFraudSignalSummary = (input: FraudSignalInputs): FraudSignalSummary => {
  const prices = input.prices.map(asFiniteMoney).filter((value): value is number => value !== null);
  const media = duplicateMediaStats(input.mediaUrls);
  const repeatedAccounts = repeatedAccountSignals(input.listingPartnerIds);
  const comparableMedian = median(prices);
  const identityConflicts = Math.max(0, Math.floor(input.identityConflictCount || 0));
  const rejectedPayments = Math.max(0, Math.floor(input.rejectedPaymentCount || 0));

  return {
    comparableMedian,
    listingsReviewed: prices.length,
    identityConflicts,
    rejectedPayments,
    duplicateMedia: media.reusedItems,
    duplicateMediaGroups: media.groups,
    repeatedAccountSignals: repeatedAccounts,
    review: buildFraudReview({
      price: comparableMedian || 0,
      comparableMedian,
      identityConflict: identityConflicts > 0,
      duplicateMediaCount: media.reusedItems,
      paymentAnomaly: rejectedPayments > 0,
      repeatedAccountSignals: repeatedAccounts,
    }),
  };
};
