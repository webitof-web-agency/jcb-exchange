'use client';

import { useEffect, useState } from 'react';
import axios from 'axios';
import { EyeOff, Link2Off, Loader2, ShieldAlert, Trash2, X } from 'lucide-react';
import api from '@/lib/api';

// Seller-side confirmation before deleting their own listing: a tick for each thing that goes with
// it, a choice for what can be kept (the files in Google Drive), what stays, what stops the delete
// (a sale or a payment), and unlisting offered instead.

type ImpactGroup = { key: string; label: string; count: number; action: 'DELETED' | 'OPTIONAL' | 'UNLINKED' | 'BLOCKS'; note?: string; defaultSelected?: boolean };

type ListingDeletionImpact = {
  name: string;
  groups: ImpactGroup[];
  canDelete: boolean;
  viewerCanDelete: boolean;
  viewerDeleteNote: string | null;
  alternatives: Array<{ status: string; label: string; description: string }>;
  confirmationWord: string;
};

const errorMessage = (error: unknown, fallback: string) =>
  axios.isAxiosError(error) ? error.response?.data?.error || fallback : fallback;

export default function ListingDeleteDialog({
  listingId,
  title,
  onClose,
  onDeleted,
  onUnlisted,
}: {
  listingId: string;
  title: string;
  onClose: () => void;
  onDeleted: (message: string) => void;
  onUnlisted: () => void;
}) {
  // Mounted per listing, so each one starts from this fresh state.
  const [impact, setImpact] = useState<ListingDeletionImpact | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState<'delete' | 'unlist' | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.get<{ impact: ListingDeletionImpact }>(`/listings/${listingId}/delete-impact`)
      .then((response) => {
        if (cancelled) return;
        setImpact(response.data.impact);
        setSelected(response.data.impact.groups.filter((item) => item.action === 'OPTIONAL' && item.defaultSelected).map((item) => item.key));
      })
      .catch((loadError) => { if (!cancelled) setError(errorMessage(loadError, 'Could not check this listing.')); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [listingId]);

  const required = impact?.groups.filter((item) => item.action === 'DELETED') || [];
  const optional = impact?.groups.filter((item) => item.action === 'OPTIONAL') || [];
  const kept = impact?.groups.filter((item) => item.action === 'UNLINKED') || [];
  const blocks = impact?.groups.filter((item) => item.action === 'BLOCKS') || [];
  const deleteAvailable = Boolean(impact?.canDelete && impact.viewerCanDelete);
  const unlistOption = impact?.alternatives.find((item) => item.status === 'UNLIST');
  const allRequiredTicked = required.every((item) => selected.includes(item.key));
  const canDelete = deleteAvailable && allRequiredTicked && confirmed && !busy;

  const toggle = (key: string) =>
    setSelected((current) => (current.includes(key) ? current.filter((item) => item !== key) : [...current, key]));

  const handleDelete = async () => {
    if (!impact || !canDelete) return;
    setBusy('delete');
    setError('');
    try {
      const response = await api.delete<{ message?: string }>(`/listings/${listingId}`, {
        data: { include: selected, confirmation: impact.confirmationWord },
      });
      onDeleted(response.data?.message || 'Listing deleted successfully.');
    } catch (deleteError) {
      setError(errorMessage(deleteError, 'Failed to delete listing. Nothing was deleted.'));
    } finally {
      setBusy(null);
    }
  };

  const handleUnlist = async () => {
    setBusy('unlist');
    setError('');
    try {
      await api.patch(`/listings/${listingId}/moderation`, { action: 'UNLIST' });
      onUnlisted();
    } catch (unlistError) {
      setError(errorMessage(unlistError, 'Could not unlist the listing.'));
    } finally {
      setBusy(null);
    }
  };

  const checkList = (items: ImpactGroup[]) => (
    <ul className="divide-y divide-gray-100 rounded-xl border border-gray-200">
      {items.map((item) => (
        <li key={item.key}>
          <label className="flex cursor-pointer items-start gap-2 px-3 py-2 text-xs text-gray-700 hover:bg-gray-50">
            <input type="checkbox" checked={selected.includes(item.key)} onChange={() => toggle(item.key)} className="mt-0.5 h-4 w-4 shrink-0 accent-red-600" />
            <span>
              <span className="block font-medium">{item.label} ({item.count})</span>
              {item.note ? <span className="block text-[11px] text-gray-500">{item.note}</span> : null}
            </span>
          </label>
        </li>
      ))}
    </ul>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-sm sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="listing-delete-title">
      <div className="flex max-h-[90vh] w-full max-w-md flex-col overflow-hidden rounded-t-2xl bg-white shadow-xl sm:rounded-2xl">
        <div className="flex items-start gap-3 border-b border-gray-100 px-5 py-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-100">
            <Trash2 className="h-5 w-5 text-red-600" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 id="listing-delete-title" className="text-base font-bold text-gray-900">Delete Listing</h3>
            <p className="truncate text-xs text-gray-500">{title}</p>
          </div>
          <button type="button" onClick={onClose} disabled={Boolean(busy)} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4 text-sm">
          {loading ? <p className="flex items-center gap-2 text-gray-500"><Loader2 className="h-4 w-4 animate-spin" /> Checking this listing...</p> : null}
          {error ? <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">{error}</p> : null}

          {deleteAvailable && required.length ? (
            <div>
              <p className="mb-1 text-[11px] font-bold uppercase tracking-wider text-gray-500">Deleted with it (tick each to confirm)</p>
              {checkList(required)}
            </div>
          ) : null}
          {deleteAvailable && optional.length ? (
            <div>
              <p className="mb-1 text-[11px] font-bold uppercase tracking-wider text-gray-500">Your choice (left unticked, it is kept)</p>
              {checkList(optional)}
            </div>
          ) : null}
          {kept.length ? (
            <div>
              <p className="mb-1 text-[11px] font-bold uppercase tracking-wider text-gray-500">Kept</p>
              <ul className="space-y-1 text-xs text-gray-700">
                {kept.map((item) => <li key={item.key} className="flex gap-1.5"><Link2Off className="mt-0.5 h-3.5 w-3.5 shrink-0 text-sky-600" /> {item.label} ({item.count}){item.note ? `: ${item.note}` : ''}</li>)}
              </ul>
            </div>
          ) : null}
          {blocks.length ? (
            <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-800">
              <p className="flex items-center gap-1.5 font-bold"><ShieldAlert className="h-4 w-4" /> This listing cannot be deleted:</p>
              <ul className="mt-1 space-y-0.5">{blocks.map((item) => <li key={item.key}>• {item.label}{item.note ? `: ${item.note}` : ''}</li>)}</ul>
            </div>
          ) : null}
          {impact?.viewerDeleteNote ? <p className="text-xs font-medium text-amber-800">{impact.viewerDeleteNote}</p> : null}

          {unlistOption ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
              <p className="flex items-center gap-1.5 text-xs font-bold text-amber-900"><EyeOff className="h-4 w-4" /> {unlistOption.label} instead?</p>
              <p className="mt-0.5 text-[11px] text-amber-800">{unlistOption.description}</p>
            </div>
          ) : null}

          {deleteAvailable ? (
            <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-red-200 bg-red-50/60 px-3 py-2 text-xs font-semibold text-red-900">
              <input type="checkbox" checked={confirmed} onChange={() => setConfirmed((value) => !value)} className="mt-0.5 h-4 w-4 shrink-0 accent-red-600" />
              Yes, delete this listing permanently. I understand it cannot be undone.
            </label>
          ) : null}
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-gray-100 px-5 py-3 sm:flex-row sm:justify-end">
          <button type="button" onClick={onClose} disabled={Boolean(busy)} className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50">
            Cancel
          </button>
          {unlistOption ? (
            <button type="button" onClick={() => void handleUnlist()} disabled={Boolean(busy)} className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#FFC107] px-4 py-2 text-sm font-bold text-gray-950 hover:bg-[#E5AD06] disabled:opacity-50">
              {busy === 'unlist' ? <Loader2 className="h-4 w-4 animate-spin" /> : null} {unlistOption.label}
            </button>
          ) : null}
          {deleteAvailable ? (
            <button type="button" onClick={() => void handleDelete()} disabled={!canDelete} className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50">
              {busy === 'delete' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />} Delete permanently
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
