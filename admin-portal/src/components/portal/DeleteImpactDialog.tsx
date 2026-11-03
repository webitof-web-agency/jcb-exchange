'use client';

import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { AlertTriangle, Ban, CheckCircle2, Link2Off, Loader2, ShieldAlert, Trash2, X } from 'lucide-react';
import api from '@/lib/api';

// Shown before any permanent delete (customer, staff, partner, listing, Sold Vehicle, RTO record).
// It loads the server's impact and asks for a tick on every item that goes with the record, lets
// the person choose the optional ones (kept when left unticked), lists what stays unlinked or is
// never deleted, offers the safer options (deactivate / suspend / block / close, unlist / suspend /
// block a listing, cancel a sale) and only then the delete, behind one last confirmation tick.

type ImpactAction = 'DELETED' | 'OPTIONAL' | 'UNLINKED' | 'BLOCKS';

type ImpactGroup = { key: string; label: string; count: number; action: ImpactAction; note?: string; defaultSelected?: boolean };

type Alternative = { status: string; label: string; description: string };

export type DeletionImpact = {
  entityType: 'CUSTOMER' | 'STAFF' | 'PARTNER' | 'LISTING' | 'SOLD_VEHICLE' | 'RTO_RECORD';
  entityId: string;
  name: string;
  subtitle: string;
  currentStatus: string;
  groups: ImpactGroup[];
  blockers: string[];
  requiredSelections: string[];
  canDelete: boolean;
  viewerCanDelete: boolean;
  viewerDeleteNote: string | null;
  alternatives: Alternative[];
  confirmationWord: string;
};

const errorMessage = (error: unknown, fallback: string) =>
  axios.isAxiosError(error) ? error.response?.data?.error || fallback : fallback;

const statusLabel = (status: string) => status.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (char) => char.toUpperCase());

function CheckRow({
  item,
  checked,
  disabled,
  onToggle,
  hint,
}: {
  item: ImpactGroup;
  checked: boolean;
  disabled: boolean;
  onToggle: () => void;
  hint?: string;
}) {
  return (
    <li>
      <label className={`flex items-start gap-2 px-3 py-2 ${disabled ? '' : 'cursor-pointer hover:bg-slate-50'}`}>
        <input type="checkbox" checked={checked} onChange={onToggle} disabled={disabled} className="mt-0.5 h-4 w-4 shrink-0 accent-red-600" />
        <span className="min-w-0 flex-1">
          <span className="block font-medium text-slate-800">{item.label} <span className="text-slate-500">({item.count})</span></span>
          {item.note ? <span className="block text-[11px] text-slate-500">{item.note}</span> : null}
          {hint ? <span className="block text-[11px] font-medium text-amber-700">{hint}</span> : null}
        </span>
      </label>
    </li>
  );
}

export default function DeleteImpactDialog({
  open,
  title,
  impactPath,
  deletePath,
  reasonRequired = true,
  onClose,
  onDeleted,
  onAlternative,
}: {
  open: boolean;
  title: string;
  /** GET endpoint returning { impact }. */
  impactPath: string;
  /** DELETE endpoint; receives { include, confirmation, reason } as the request body. */
  deletePath: string;
  reasonRequired?: boolean;
  onClose: () => void;
  /** `include` lists the ticked items, so callers can act on optional choices (e.g. removing files). */
  onDeleted: (message: string, include: string[]) => void;
  /** Applies a safer option. Omit to hide those options. */
  onAlternative?: (status: string, reason: string) => Promise<void>;
}) {
  // Callers mount the dialog per record ({target && <DeleteImpactDialog open ... />}), so every
  // record starts from this fresh state.
  const [impact, setImpact] = useState<DeletionImpact | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [reason, setReason] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [chosenAlternative, setChosenAlternative] = useState('');
  const [busy, setBusy] = useState<'delete' | 'alternative' | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    api.get<{ impact: DeletionImpact }>(impactPath)
      .then((response) => {
        if (cancelled) return;
        setImpact(response.data.impact);
        setSelected(response.data.impact.groups.filter((item) => item.action === 'OPTIONAL' && item.defaultSelected).map((item) => item.key));
      })
      .catch((loadError) => { if (!cancelled) setError(errorMessage(loadError, 'Could not check what this delete would affect.')); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [open, impactPath]);

  const groupsByAction = useMemo(() => {
    const groups = impact?.groups || [];
    return {
      required: groups.filter((item) => item.action === 'DELETED'),
      optional: groups.filter((item) => item.action === 'OPTIONAL'),
      unlinked: groups.filter((item) => item.action === 'UNLINKED'),
      blocks: groups.filter((item) => item.action === 'BLOCKS'),
    };
  }, [impact]);

  if (!open) return null;

  const requiredKeys = groupsByAction.required.map((item) => item.key);
  const selectableKeys = [...requiredKeys, ...groupsByAction.optional.map((item) => item.key)];
  const missingRequired = requiredKeys.filter((key) => !selected.includes(key));
  const everythingSelected = selectableKeys.length > 0 && selectableKeys.every((key) => selected.includes(key));
  const deleteAvailable = Boolean(impact?.canDelete && impact.viewerCanDelete);
  const reasonOk = !reasonRequired || reason.trim().length >= 5;
  const canSubmitDelete = deleteAvailable && missingRequired.length === 0 && reasonOk && confirmed && !busy;
  const alternatives = onAlternative ? impact?.alternatives || [] : [];

  const toggle = (key: string) =>
    setSelected((current) => (current.includes(key) ? current.filter((item) => item !== key) : [...current, key]));

  const handleDelete = async () => {
    if (!impact || !canSubmitDelete) return;
    setBusy('delete');
    setError('');
    try {
      const response = await api.delete<{ message?: string }>(deletePath, {
        data: { include: selected, confirmation: impact.confirmationWord, reason: reason.trim() },
      });
      onDeleted(response.data?.message || `${impact.name} deleted permanently.`, selected);
    } catch (deleteError) {
      if (axios.isAxiosError(deleteError) && deleteError.response?.data?.impact) {
        setImpact(deleteError.response.data.impact);
      }
      setError(errorMessage(deleteError, 'Delete failed. Nothing was deleted.'));
    } finally {
      setBusy(null);
    }
  };

  const handleAlternative = async () => {
    if (!onAlternative || !chosenAlternative) return;
    setBusy('alternative');
    setError('');
    try {
      await onAlternative(chosenAlternative, reason.trim());
    } catch (alternativeError) {
      setError(errorMessage(alternativeError, 'Could not update the status.'));
    } finally {
      setBusy(null);
    }
  };

  // What the delete button still waits for, so the person knows why it is disabled.
  const waitingFor = !deleteAvailable
    ? ''
    : missingRequired.length
      ? `Tick the ${missingRequired.length === 1 ? 'item' : `${missingRequired.length} items`} under "Deleted with it".`
      : !reasonOk ? 'Enter the reason.' : !confirmed ? 'Tick the final confirmation.' : '';

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 backdrop-blur-sm sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="delete-impact-title">
      <div className="flex max-h-[92vh] w-full max-w-xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-xl sm:rounded-2xl">
        <div className="flex items-start gap-3 border-b border-slate-100 px-5 py-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-100">
            <Trash2 className="h-5 w-5 text-red-600" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 id="delete-impact-title" className="text-base font-bold text-slate-900">{title}</h3>
            {impact ? (
              <p className="mt-0.5 truncate text-xs text-slate-500">
                <span className="font-semibold text-slate-800">{impact.name}</span>
                {impact.subtitle ? ` · ${impact.subtitle}` : ''} · {statusLabel(impact.currentStatus)}
              </p>
            ) : null}
          </div>
          <button type="button" onClick={onClose} disabled={Boolean(busy)} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4 text-sm">
          {loading ? (
            <p className="flex items-center gap-2 text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Checking linked records...</p>
          ) : null}
          {error ? <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">{error}</p> : null}

          {impact ? (
            <>
              {deleteAvailable && selectableKeys.length > 1 ? (
                <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700">
                  <input
                    type="checkbox"
                    checked={everythingSelected}
                    onChange={() => setSelected(everythingSelected ? [] : selectableKeys)}
                    className="h-4 w-4 accent-red-600"
                  />
                  Select everything below
                </label>
              ) : null}

              {groupsByAction.required.length ? (
                <section>
                  <h4 className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-500">Deleted with it (tick each to confirm)</h4>
                  <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
                    {groupsByAction.required.map((item) => (
                      <CheckRow
                        key={item.key}
                        item={item}
                        checked={selected.includes(item.key)}
                        disabled={!deleteAvailable}
                        onToggle={() => toggle(item.key)}
                        hint={deleteAvailable && !selected.includes(item.key) ? 'These cannot be kept without the record.' : undefined}
                      />
                    ))}
                  </ul>
                </section>
              ) : null}

              {groupsByAction.optional.length ? (
                <section>
                  <h4 className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-500">Your choice (left unticked, it is kept)</h4>
                  <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
                    {groupsByAction.optional.map((item) => (
                      <CheckRow
                        key={item.key}
                        item={item}
                        checked={selected.includes(item.key)}
                        disabled={!deleteAvailable}
                        onToggle={() => toggle(item.key)}
                      />
                    ))}
                  </ul>
                </section>
              ) : null}

              {groupsByAction.unlinked.length ? (
                <section>
                  <h4 className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-500">Kept, but unlinked</h4>
                  <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
                    {groupsByAction.unlinked.map((item) => (
                      <li key={item.key} className="flex items-start gap-2 px-3 py-2">
                        <Link2Off className="mt-0.5 h-4 w-4 shrink-0 text-sky-600" />
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-slate-800">{item.label} <span className="text-slate-500">({item.count})</span></p>
                          {item.note ? <p className="text-[11px] text-slate-500">{item.note}</p> : null}
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}

              {groupsByAction.blocks.length ? (
                <section className="rounded-xl border border-red-200 bg-red-50 p-3">
                  <p className="flex items-center gap-1.5 text-xs font-bold text-red-800">
                    <ShieldAlert className="h-4 w-4" /> Permanent delete is not possible. These records are never deleted:
                  </p>
                  <ul className="mt-1.5 space-y-1 text-xs text-red-800">
                    {groupsByAction.blocks.map((item) => (
                      <li key={item.key}>• {item.label} ({item.count}){item.note ? `: ${item.note}` : ''}</li>
                    ))}
                  </ul>
                  {alternatives.length ? <p className="mt-2 text-xs font-semibold text-red-900">Use one of the options below instead.</p> : null}
                </section>
              ) : null}

              {!impact.groups.length ? (
                <p className="flex items-center gap-2 text-xs text-slate-600"><CheckCircle2 className="h-4 w-4 text-emerald-600" /> Nothing else is linked to this record.</p>
              ) : null}

              {impact.viewerDeleteNote ? (
                <p className="flex items-start gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {impact.viewerDeleteNote}
                </p>
              ) : null}

              {alternatives.length ? (
                <section>
                  <h4 className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-500">Safer options (nothing is lost)</h4>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {alternatives.map((item) => (
                      <button
                        key={item.status}
                        type="button"
                        onClick={() => setChosenAlternative(item.status)}
                        className={`rounded-xl border px-3 py-2 text-left transition ${chosenAlternative === item.status ? 'border-amber-400 bg-amber-50 ring-2 ring-amber-200' : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'}`}
                      >
                        <span className="flex items-center gap-1.5 text-xs font-bold text-slate-900"><Ban className="h-3.5 w-3.5 text-slate-500" /> {item.label}</span>
                        <span className="mt-0.5 block text-[11px] leading-snug text-slate-500">{item.description}</span>
                      </button>
                    ))}
                  </div>
                </section>
              ) : null}

              {(deleteAvailable || alternatives.length) ? (
                <label className="block">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    Reason{deleteAvailable && reasonRequired ? ' (required to delete)' : ''}
                  </span>
                  <textarea
                    value={reason}
                    onChange={(event) => setReason(event.target.value.slice(0, 500))}
                    rows={2}
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100"
                    placeholder="e.g. Duplicate entry, customer asked to remove, fake listing"
                  />
                </label>
              ) : null}

              {deleteAvailable ? (
                <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-red-200 bg-red-50/60 px-3 py-2 text-xs font-semibold text-red-900">
                  <input type="checkbox" checked={confirmed} onChange={() => setConfirmed((value) => !value)} className="mt-0.5 h-4 w-4 shrink-0 accent-red-600" />
                  Yes, delete this permanently. I understand it cannot be undone.
                </label>
              ) : null}
            </>
          ) : null}
        </div>

        <div className="border-t border-slate-100 px-5 py-3">
          {waitingFor ? <p className="mb-2 text-right text-[11px] font-medium text-slate-500">{waitingFor}</p> : null}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button type="button" onClick={onClose} disabled={Boolean(busy)} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50">
              Cancel
            </button>
            {alternatives.length ? (
              <button
                type="button"
                onClick={() => void handleAlternative()}
                disabled={!chosenAlternative || Boolean(busy)}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#FFC107] px-4 py-2 text-sm font-bold text-slate-950 hover:bg-[#E5AD06] disabled:opacity-50"
              >
                {busy === 'alternative' ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {chosenAlternative ? alternatives.find((item) => item.status === chosenAlternative)?.label : 'Choose an option'}
              </button>
            ) : null}
            {deleteAvailable ? (
              <button
                type="button"
                onClick={() => void handleDelete()}
                disabled={!canSubmitDelete}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-red-600 px-4 py-2 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-50"
              >
                {busy === 'delete' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                Delete permanently
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
