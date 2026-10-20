'use client';

import { type ReactNode, useState } from 'react';
import { Loader2, MessageSquareText, X } from 'lucide-react';
import { isValidRemark, MIN_REMARK_LENGTH } from '@/lib/rtoTransferTasks.mjs';

type RemarkDialogProps = {
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  placeholder?: string;
  tone?: 'amber' | 'emerald' | 'rose';
  busy?: boolean;
  children?: ReactNode;
  onCancel: () => void;
  onConfirm: (remark: string) => void | Promise<void>;
};

const toneClasses = {
  amber: 'bg-[#FFC107] text-gray-950 hover:bg-amber-400',
  emerald: 'bg-emerald-600 text-white hover:bg-emerald-700',
  rose: 'bg-rose-600 text-white hover:bg-rose-700',
};

/** Every status change asks for a remark so the history explains why it changed. */
export default function RemarkDialog({
  title,
  description,
  confirmLabel = 'Save',
  placeholder = 'Why is the status changing? (e.g. insurance renewed by 1st owner, name mismatch on RC)',
  tone = 'amber',
  busy = false,
  children,
  onCancel,
  onConfirm,
}: RemarkDialogProps) {
  const [remark, setRemark] = useState('');
  const [touched, setTouched] = useState(false);
  const valid = isValidRemark(remark);

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/60 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onCancel(); }}>
      <form
        className="w-full max-w-md rounded-2xl bg-white shadow-2xl"
        onSubmit={(event) => {
          event.preventDefault();
          setTouched(true);
          if (valid && !busy) void onConfirm(remark.trim());
        }}
      >
        <div className="flex items-start justify-between gap-3 border-b border-gray-100 px-5 py-4">
          <div className="flex items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700"><MessageSquareText className="h-4.5 w-4.5" /></span>
            <div>
              <h2 className="text-base font-bold text-gray-950">{title}</h2>
              {description ? <div className="mt-0.5 text-xs text-gray-600">{description}</div> : null}
            </div>
          </div>
          <button type="button" disabled={busy} onClick={onCancel} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700" aria-label="Close"><X className="h-4 w-4" /></button>
        </div>
        <div className="space-y-3 px-5 py-4">
          {children}
          <div>
            <label htmlFor="status-remark" className="mb-1 block text-xs font-semibold text-gray-700">Remark <span className="text-rose-500">*</span></label>
            <textarea
              id="status-remark"
              autoFocus
              rows={3}
              maxLength={2000}
              value={remark}
              onChange={(event) => setRemark(event.target.value)}
              onBlur={() => setTouched(true)}
              placeholder={placeholder}
              className={`w-full rounded-lg border px-3 py-2 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-amber-500/20 ${touched && !valid ? 'border-rose-400' : 'border-gray-200 focus:border-amber-500'}`}
            />
            {touched && !valid ? <p className="mt-0.5 text-[11px] font-medium text-rose-600">Enter at least {MIN_REMARK_LENGTH} characters.</p> : null}
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-gray-100 px-5 py-3">
          <button type="button" disabled={busy} onClick={onCancel} className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50">Cancel</button>
          <button type="submit" disabled={busy || !valid} className={`inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-50 ${toneClasses[tone]}`}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}{confirmLabel}
          </button>
        </div>
      </form>
    </div>
  );
}
