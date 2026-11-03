'use client';

import { useState } from 'react';
import axios from 'axios';
import { AlertTriangle, EyeOff, Loader2, X } from 'lucide-react';
import { LISTING_ACTION_META, moderateListing, type ListingVisibilityAction } from '@/lib/listingVisibility';

/** Confirms one unlist / relist / suspend / restore / block / unblock / send-for-review action. */
export default function ListingModerationDialog({
  listing,
  action,
  isAdmin,
  onClose,
  onDone,
}: {
  listing: { id: string; title: string; status: string };
  action: ListingVisibilityAction;
  isAdmin: boolean;
  onClose: () => void;
  onDone: (updated: { id: string; status: string; moderationReason: string | null; moderatedAt: string | null }) => void;
}) {
  const meta = LISTING_ACTION_META[action];
  const [reason, setReason] = useState('');
  const [notify, setNotify] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const reasonOk = !meta.reasonRequired || reason.trim().length >= 5;
  const hidesListing = action === 'UNLIST' || action === 'SUSPEND' || action === 'BLOCK';

  const submit = async () => {
    if (!reasonOk || busy) return;
    setBusy(true);
    setError('');
    try {
      onDone(await moderateListing(listing.id, action, reason.trim(), notify));
    } catch (submitError) {
      setError(axios.isAxiosError(submitError) ? submitError.response?.data?.error || 'Could not update the listing.' : 'Could not update the listing.');
    } finally {
      setBusy(false);
    }
  };

  const buttonClass = meta.tone === 'danger'
    ? 'bg-red-600 text-white hover:bg-red-700'
    : meta.tone === 'success'
      ? 'bg-emerald-600 text-white hover:bg-emerald-700'
      : 'bg-[#FFC107] text-slate-950 hover:bg-[#E5AD06]';

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-sm sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="listing-moderation-title">
      <div className="w-full max-w-md overflow-hidden rounded-t-2xl bg-white shadow-xl sm:rounded-2xl">
        <div className="flex items-start gap-3 border-b border-slate-100 px-5 py-4">
          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${meta.tone === 'danger' ? 'bg-red-100 text-red-600' : 'bg-amber-100 text-amber-700'}`}>
            <EyeOff className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 id="listing-moderation-title" className="text-base font-bold text-slate-900">{meta.title}</h3>
            <p className="truncate text-xs text-slate-500">{listing.title}</p>
          </div>
          <button type="button" onClick={onClose} disabled={busy} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="space-y-3 px-5 py-4 text-sm">
          <p className="text-xs leading-relaxed text-slate-600">{meta.description}</p>
          {hidesListing && String(listing.status).toUpperCase() === 'RESERVED' ? (
            <p className="flex items-start gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              This listing is reserved: a buyer has paid or is paying. Check the website payment before hiding it.
            </p>
          ) : null}
          <label className="block">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Reason{meta.reasonRequired ? ' (required, the seller sees it)' : ' (optional)'}
            </span>
            <textarea
              value={reason}
              onChange={(event) => setReason(event.target.value.slice(0, 1000))}
              rows={3}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100"
              placeholder={action === 'BLOCK' ? 'e.g. Chassis number belongs to a reported stolen vehicle' : 'e.g. Photos do not match the vehicle'}
            />
          </label>
          {isAdmin && action !== 'REQUEST_REVIEW' ? (
            <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-slate-700">
              <input type="checkbox" checked={notify} onChange={() => setNotify((value) => !value)} className="h-4 w-4 accent-amber-500" />
              Notify the seller (app, push and WhatsApp)
            </label>
          ) : null}
          {error ? <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">{error}</p> : null}
        </div>
        <div className="flex flex-col-reverse gap-2 border-t border-slate-100 px-5 py-3 sm:flex-row sm:justify-end">
          <button type="button" onClick={onClose} disabled={busy} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50">
            Cancel
          </button>
          <button type="button" onClick={() => void submit()} disabled={!reasonOk || busy} className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-4 py-2 text-sm font-bold disabled:opacity-50 ${buttonClass}`}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null} {meta.label}
          </button>
        </div>
      </div>
    </div>
  );
}
