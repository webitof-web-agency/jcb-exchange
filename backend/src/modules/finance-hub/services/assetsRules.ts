import type { FinRecurringFrequency } from '@prisma/client';

// Depreciation, prepaid amortisation and recurring-date rules (pure). Amounts in rupees, rounded to paise.

const round = (value: number) => Math.round(value * 100) / 100;
const DAY_MS = 24 * 60 * 60 * 1000;

export const monthKey = (date: Date) => date.toISOString().slice(0, 7);
export const monthBounds = (key: string) => {
  const [year, month] = key.split('-').map(Number) as [number, number];
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 0));
  return { start, end, days: end.getUTCDate() };
};

export type AssetBasis = {
  cost: number;
  salvageValue: number;
  method: 'SLM' | 'WDV';
  usefulLifeMonths: number | null;
  wdvRatePercent: number | null;
  putToUseDate: Date;
  disposedAt: Date | null;
};

/**
 * Depreciation for one calendar month. SLM: (cost − salvage) / life per month; WDV: written-down
 * value × annual rate / 12. The first month (put to use) and the disposal month are pro-rated
 * by days; the charge never takes the book value below salvage.
 */
export const monthlyDepreciation = (asset: AssetBasis, key: string, accumulatedBefore: number) => {
  const { start, end, days } = monthBounds(key);
  if (asset.putToUseDate > end) return 0;
  if (asset.disposedAt && asset.disposedAt < start) return 0;
  const from = asset.putToUseDate > start ? asset.putToUseDate : start;
  const to = asset.disposedAt && asset.disposedAt < end ? asset.disposedAt : end;
  const usedDays = Math.round((to.getTime() - from.getTime()) / DAY_MS) + 1;
  const share = Math.min(Math.max(usedDays / days, 0), 1);
  const depreciable = Math.max(asset.cost - asset.salvageValue - accumulatedBefore, 0);
  if (!depreciable) return 0;
  let full = 0;
  if (asset.method === 'SLM') full = asset.usefulLifeMonths ? (asset.cost - asset.salvageValue) / asset.usefulLifeMonths : 0;
  else full = asset.wdvRatePercent ? ((asset.cost - accumulatedBefore) * asset.wdvRatePercent) / 100 / 12 : 0;
  return round(Math.min(full * share, depreciable));
};

/** Month-by-month projection from `fromKey` (for the schedule screen). */
export const depreciationSchedule = (asset: AssetBasis, accumulated: number, fromKey: string, months = 24) => {
  const rows: Array<{ month: string; opening: number; charge: number; closing: number }> = [];
  let acc = accumulated;
  let { start } = monthBounds(fromKey);
  for (let index = 0; index < months; index += 1) {
    const key = monthKey(start);
    const charge = monthlyDepreciation(asset, key, acc);
    rows.push({ month: key, opening: round(asset.cost - acc), charge, closing: round(asset.cost - acc - charge) });
    acc = round(acc + charge);
    start = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
    if (asset.cost - acc <= asset.salvageValue + 0.004) break;
  }
  return rows;
};

/** Equal monthly share from the start month; the last month takes the rounding remainder. */
export const monthlyPrepaid = (prepaid: { totalAmount: number; startDate: Date; months: number }, key: string, amortisedBefore: number) => {
  const first = monthKey(prepaid.startDate);
  if (key < first) return 0;
  const remaining = round(prepaid.totalAmount - amortisedBefore);
  if (remaining <= 0) return 0;
  const [fy, fm] = first.split('-').map(Number) as [number, number];
  const [ky, km] = key.split('-').map(Number) as [number, number];
  const index = (ky - fy) * 12 + (km - fm);
  if (index >= prepaid.months - 1) return remaining;
  return Math.min(round(prepaid.totalAmount / prepaid.months), remaining);
};

const STEP: Record<FinRecurringFrequency, number> = { MONTHLY: 1, QUARTERLY: 3, HALF_YEARLY: 6, YEARLY: 12 };

/** Same day of month, `frequency` later (clamped to the month's last day). */
export const nextRecurringDate = (date: Date, frequency: FinRecurringFrequency, dayOfMonth: number) => {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + STEP[frequency];
  const last = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(dayOfMonth, last)));
};

/** First run date on or after `start` for the chosen day of month. */
export const firstRecurringDate = (start: Date, dayOfMonth: number) => {
  const last = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0)).getUTCDate();
  const candidate = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), Math.min(dayOfMonth, last)));
  if (candidate >= start) return candidate;
  const nextLast = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 2, 0)).getUTCDate();
  return new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, Math.min(dayOfMonth, nextLast)));
};

export const recurringPeriodKey = (date: Date) => date.toISOString().slice(0, 10);
