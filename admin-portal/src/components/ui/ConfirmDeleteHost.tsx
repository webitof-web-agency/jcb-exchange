'use client';

import { useState } from 'react';
import { AlertTriangle, Trash2, X } from 'lucide-react';
import { useConfirmDeleteStore, type ConfirmDeleteOptions } from '@/store/confirmDeleteStore';

function ConfirmDeleteDialog({ options, onSettle }: { options: ConfirmDeleteOptions; onSettle: (confirmed: boolean) => void }) {
  const alsoDeleted = options.alsoDeleted || [];
  const [ticked, setTicked] = useState<number[]>([]);
  const [confirmed, setConfirmed] = useState(false);
  const allTicked = alsoDeleted.every((_, index) => ticked.includes(index));
  const ready = allTicked && confirmed;

  const toggle = (index: number) =>
    setTicked((current) => (current.includes(index) ? current.filter((item) => item !== index) : [...current, index]));

  return (
    <div className="fixed inset-0 z-[200] flex items-end justify-center bg-black/50 backdrop-blur-sm sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="confirm-delete-title">
      <div className="w-full max-w-md overflow-hidden rounded-t-2xl bg-white shadow-xl sm:rounded-2xl">
        <div className="flex items-start gap-3 border-b border-slate-100 px-5 py-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-100">
            <Trash2 className="h-5 w-5 text-red-600" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 id="confirm-delete-title" className="text-base font-bold text-slate-900">{options.title}</h3>
            {options.itemName ? <p className="truncate text-xs text-slate-500">{options.itemName}</p> : null}
          </div>
          <button type="button" onClick={() => onSettle(false)} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="space-y-3 px-5 py-4 text-sm">
          {alsoDeleted.length ? (
            <section>
              <h4 className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-500">Deleted with it (tick each to confirm)</h4>
              <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
                {alsoDeleted.map((line, index) => (
                  <li key={line}>
                    <label className="flex cursor-pointer items-start gap-2 px-3 py-2 text-xs text-slate-800 hover:bg-slate-50">
                      <input type="checkbox" checked={ticked.includes(index)} onChange={() => toggle(index)} className="mt-0.5 h-4 w-4 shrink-0 accent-red-600" />
                      {line}
                    </label>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          {options.note ? (
            <p className="flex items-start gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {options.note}
            </p>
          ) : null}
          <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-red-200 bg-red-50/60 px-3 py-2 text-xs font-semibold text-red-900">
            <input type="checkbox" checked={confirmed} onChange={() => setConfirmed((value) => !value)} className="mt-0.5 h-4 w-4 shrink-0 accent-red-600" />
            Yes, delete it. I understand this cannot be undone.
          </label>
        </div>
        <div className="flex flex-col-reverse gap-2 border-t border-slate-100 px-5 py-3 sm:flex-row sm:justify-end">
          <button type="button" onClick={() => onSettle(false)} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onSettle(true)}
            disabled={!ready}
            className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-red-600 px-4 py-2 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-50"
          >
            <Trash2 className="h-4 w-4" /> {options.confirmLabel || 'Delete'}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Mounted once in the root layout; shows whatever confirmDelete() asked for. */
export default function ConfirmDeleteHost() {
  const pending = useConfirmDeleteStore((state) => state.pending);
  const settle = useConfirmDeleteStore((state) => state.settle);
  if (!pending) return null;
  // Keyed per request so each confirmation starts unticked.
  return <ConfirmDeleteDialog key={pending.requestId} options={pending} onSettle={settle} />;
}
