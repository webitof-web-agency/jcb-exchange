'use client';

import { useState } from 'react';
import axios from 'axios';
import { Archive, Loader2, ShieldCheck, X } from 'lucide-react';
import api from '@/lib/api';

const ARCHIVE_CONFIRMATION = 'ARCHIVE_PARTNER';

type PartnerArchiveDialogProps = {
  open: boolean;
  partnerId: string;
  partnerName: string;
  onClose: () => void;
  onArchived: (message: string) => void;
};

export default function PartnerArchiveDialog({
  open,
  partnerId,
  partnerName,
  onClose,
  onArchived,
}: PartnerArchiveDialogProps) {
  const [reason, setReason] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (!open) return null;

  const reasonIsValid = reason.trim().length >= 5;
  const canSubmit = reasonIsValid && confirmed && !busy;

  const submit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    setError('');
    try {
      const response = await api.post<{ message?: string }>(`/superadmin/partners/${partnerId}/archive`, {
        reason: reason.trim(),
        confirmation: ARCHIVE_CONFIRMATION,
      });
      onArchived(response.data.message || 'Partner archived successfully.');
    } catch (archiveError) {
      setError(
        axios.isAxiosError(archiveError)
          ? archiveError.response?.data?.error || 'Could not archive this partner.'
          : 'Could not archive this partner.',
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="partner-archive-title">
      <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-start gap-3 border-b border-slate-100 px-5 py-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-800">
            <Archive className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 id="partner-archive-title" className="text-base font-bold text-slate-900">Archive partner?</h2>
            <p className="mt-0.5 truncate text-xs text-slate-500">{partnerName}</p>
          </div>
          <button type="button" onClick={onClose} disabled={busy} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Close archive dialog">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 px-5 py-4 text-sm">
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-xs leading-relaxed text-amber-950">
            <p className="flex items-start gap-2 font-semibold"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" /> This is a reversible archive, not a hard delete.</p>
            <p className="mt-1 pl-6">The partner account is hidden from active views. User ID, listings, KYC, GST records and audit history are preserved. An admin can restore it later.</p>
          </div>

          <label className="block">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Reason (required)</span>
            <textarea
              value={reason}
              onChange={(event) => setReason(event.target.value.slice(0, 500))}
              rows={3}
              placeholder="e.g. Duplicate partner account, compliance closure, or partner request"
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100"
            />
            <span className="mt-1 block text-[11px] text-slate-500">Minimum 5 characters. This reason is saved in the audit trail.</span>
          </label>

          <label className="flex cursor-pointer items-start gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-xs font-semibold text-slate-700">
            <input type="checkbox" checked={confirmed} onChange={() => setConfirmed((value) => !value)} className="mt-0.5 h-4 w-4 shrink-0 accent-amber-500" />
            <span>I understand this will hide the partner from active records and can be reversed only by an authorized admin.</span>
          </label>

          {error ? <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">{error}</p> : null}
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-slate-100 px-5 py-3 sm:flex-row sm:justify-end">
          <button type="button" onClick={onClose} disabled={busy} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">Cancel</button>
          <button type="button" onClick={() => void submit()} disabled={!canSubmit} className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#FFC107] px-4 py-2 text-sm font-bold text-slate-950 hover:bg-[#E5AD06] disabled:cursor-not-allowed disabled:opacity-50">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Archive className="h-4 w-4" />}
            {busy ? 'Archiving...' : 'Archive Partner'}
          </button>
        </div>
      </div>
    </div>
  );
}
