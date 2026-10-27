import { WalletCards } from 'lucide-react';
import { formatApiWalletBalance, getApiServicePrice, type ApiBillableServiceKey, type ApiBillingSummary } from '@/lib/apiBilling';
import type { ApiBillingSummaryStatus } from '@/hooks/apiBillingSummaryState';

export function ApiWalletHeader({ summary, status }: { summary: ApiBillingSummary | null; status: ApiBillingSummaryStatus }) {
  const unavailable = status === 'unavailable';
  const active = summary?.wallet.mode === 'ACTIVE';
  const tone = unavailable
    ? 'border-amber-200/90 bg-amber-50/90 text-amber-950'
    : active
      ? 'border-emerald-200/90 bg-emerald-50/90 text-emerald-950'
      : 'border-amber-200/90 bg-gradient-to-r from-amber-50/95 via-[#FFFBEB] to-yellow-50/90 text-slate-900';
  const iconTone = unavailable
    ? 'bg-amber-100 text-amber-800'
    : active
      ? 'bg-emerald-100 text-emerald-800'
      : 'bg-amber-100/90 text-amber-800';
  const statusLabel = unavailable ? 'Last confirmed' : active ? 'Live' : 'Standby';

  return (
    <div
      className={`inline-flex h-8.5 items-center gap-1.5 rounded-xl border px-2.5 shadow-2xs transition-all hover:shadow-xs ${tone}`}
      role="status"
      aria-label={summary ? `API wallet balance ${formatApiWalletBalance(summary.wallet.balanceRupees)}` : 'API wallet is loading'}
      title={summary ? `API Wallet: ${formatApiWalletBalance(summary.wallet.balanceRupees)} (${statusLabel})` : 'Loading API Wallet'}
    >
      <span className={`flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-md ${iconTone}`}>
        <WalletCards className="h-3 w-3" aria-hidden="true" />
      </span>
      <span className="text-xs font-bold text-slate-900 tracking-tight whitespace-nowrap">
        {summary ? formatApiWalletBalance(summary.wallet.balanceRupees) : (
          <span className="inline-block h-3.5 w-16 animate-pulse rounded bg-black/10" />
        )}
      </span>
    </div>
  );
}

export function ApiServicePrice({
  summary,
  serviceKey,
  className = '',
}: {
  summary: ApiBillingSummary | null;
  serviceKey: ApiBillableServiceKey;
  className?: string;
}) {
  if (!summary) {
    return null;
  }

  const price = getApiServicePrice(summary, serviceKey);

  if (!price) {
    return null;
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-lg border border-amber-200/90 bg-amber-50/90 px-2.5 py-1 text-xs font-bold text-amber-950 shadow-2xs transition-colors group-hover:border-amber-300 group-hover:bg-amber-100/80 ${className}`}
      title={`Cost per request: ₹${price}`}
    >
      <span className="flex h-1.5 w-1.5 shrink-0 rounded-full bg-amber-600 animate-pulse" />
      <span className="font-extrabold tracking-tight text-slate-900">₹{price}</span>
      <span className="text-[10px] font-medium text-amber-800">/ check</span>
    </span>
  );
}

export function ApiWalletStatus({ summary, status }: { summary: ApiBillingSummary | null; status: ApiBillingSummaryStatus }) {
  if (!summary) {
    const unavailable = status === 'unavailable';
    return (
      <div
        className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold ${unavailable ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-slate-200 bg-slate-50 text-slate-600'}`}
        role="status"
      >
        <WalletCards className="h-4 w-4 shrink-0" />
        <span>{unavailable ? 'API wallet status is temporarily unavailable.' : 'Loading API wallet…'}</span>
      </div>
    );
  }
  const active = summary.wallet.mode === 'ACTIVE';
  const unavailable = status === 'unavailable';
  return (
    <div className={`sticky top-3 z-20 flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold shadow-sm ${unavailable ? 'border-amber-200 bg-amber-50 text-amber-800' : active ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-slate-200 bg-slate-50 text-slate-600'}`} role="status" aria-live="polite">
      <WalletCards className="h-4 w-4 shrink-0" />
      <span>API Wallet: ₹{summary.wallet.balanceRupees}</span>
      <span className="text-[10px] uppercase tracking-wide">{unavailable ? 'Last confirmed balance' : active ? 'Billing live' : 'Billing standby'}</span>
    </div>
  );
}

