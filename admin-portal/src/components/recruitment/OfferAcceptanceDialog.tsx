'use client';

import React, { useState } from 'react';
import { toast } from 'react-toastify';
import HrmModal from '@/components/hrm/HrmModal';
import {
  apiErrorMessage,
  buildOfflineAcceptancePayload,
  offerHrmApi,
  todayIso,
  validateOfflineAcceptance,
  type OfflineAcceptanceErrors,
} from '@/lib/offerHrm';

/**
 * HR records an offer the candidate signed on paper (at the office, by post or as a scan by email). The signed copy is
 * required: it is stored with an acceptance certificate, and the person moves to HRM onboarding like an online
 * acceptance.
 */
export default function OfferAcceptanceDialog({
  offerId,
  candidateName,
  defaultPlace,
  onClose,
  onDone,
}: {
  offerId: string;
  candidateName: string;
  defaultPlace?: string | null;
  onClose: () => void;
  onDone: () => void | Promise<void>;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [signedOn, setSignedOn] = useState(todayIso());
  const [place, setPlace] = useState(defaultPlace ?? '');
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState<OfflineAcceptanceErrors>({});
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const today = todayIso();

  const submit = async () => {
    if (saving) return;
    const found = validateOfflineAcceptance({ file, signedOn, place, note }, today);
    setErrors(found);
    setError('');
    if (Object.keys(found).length || !file) return;
    setSaving(true);
    try {
      await offerHrmApi.acceptOffline(offerId, buildOfflineAcceptancePayload({ file, fileName: file.name, signedOn, place, note }));
      toast.success(`${candidateName || 'The candidate'}'s signed offer is recorded. They are moving to HRM onboarding.`);
      await onDone();
    } catch (requestError) {
      setError(apiErrorMessage(requestError, 'The signed offer could not be recorded. Try again.'));
    } finally {
      setSaving(false);
    }
  };

  const fieldClass = 'mt-1 w-full rounded-xl border border-gray-200 bg-gray-50 p-2.5 text-sm text-gray-900';
  return (
    <HrmModal
      title="Record signed acceptance"
      description={`Upload the offer letter ${candidateName || 'the candidate'} signed (a scan or clear photo, or their written acceptance). They move to HRM onboarding and the offer can no longer be edited.`}
      onClose={() => { if (!saving) onClose(); }}
      busy={saving}
      lockDismiss={saving || Boolean(file) || Boolean(note.trim())}
      size="sm"
      error={error}
      footer={(
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} disabled={saving} className="rounded-xl bg-gray-100 px-4 py-2 text-xs font-bold text-gray-700 hover:bg-gray-200 disabled:opacity-50">Cancel</button>
          <button type="button" onClick={() => void submit()} disabled={saving} className="rounded-xl bg-[#FFC107] px-4 py-2 text-xs font-extrabold text-black hover:bg-[#e5ad06] disabled:opacity-50">
            {saving ? 'Recording…' : 'Record acceptance'}
          </button>
        </div>
      )}
    >
      <div className="space-y-3">
        <label className="block text-xs font-semibold text-gray-700">
          Signed offer letter *
          <input
            type="file"
            accept="application/pdf,image/jpeg,image/png,image/webp,.pdf,.jpg,.jpeg,.png,.webp"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            disabled={saving}
            aria-invalid={Boolean(errors.file)}
            className="mt-1 block w-full text-xs text-gray-700 file:mr-3 file:rounded-lg file:border-0 file:bg-gray-900 file:px-3 file:py-2 file:text-xs file:font-bold file:text-white"
          />
          {file && !errors.file ? <span className="mt-1 block text-[11px] text-gray-500">{file.name} · {(file.size / 1024 / 1024).toFixed(2)} MB</span> : null}
          {errors.file ? <span className="mt-1 block text-[11px] font-semibold text-red-600">{errors.file}</span> : null}
        </label>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block text-xs font-semibold text-gray-700">
            Signed on *
            <input type="date" value={signedOn} max={today} onChange={(event) => setSignedOn(event.target.value)} disabled={saving} aria-invalid={Boolean(errors.signedOn)} className={fieldClass} />
            {errors.signedOn ? <span className="mt-1 block text-[11px] font-semibold text-red-600">{errors.signedOn}</span> : null}
          </label>
          <label className="block text-xs font-semibold text-gray-700">
            Place
            <input value={place} maxLength={120} onChange={(event) => setPlace(event.target.value)} disabled={saving} placeholder="e.g. Raipur office" className={fieldClass} />
          </label>
        </div>
        <label className="block text-xs font-semibold text-gray-700">
          Note
          <textarea rows={2} maxLength={1000} value={note} onChange={(event) => setNote(event.target.value)} disabled={saving} placeholder="For example: signed at the Raipur office in front of HR" className={fieldClass} />
          {errors.note ? <span className="mt-1 block text-[11px] font-semibold text-red-600">{errors.note}</span> : null}
        </label>
      </div>
    </HrmModal>
  );
}
