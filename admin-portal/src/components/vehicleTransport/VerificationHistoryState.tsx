'use client';

import { Loader2, XCircle } from 'lucide-react';

type VerificationRecord = {
  status: string;
  safeMessage?: string | null;
  messageCode?: string | null;
  createdAt?: string | null;
};

function formatRequestedAt(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

export default function VerificationHistoryState({
  title,
  record,
}: {
  title: string;
  record: VerificationRecord;
}) {
  const isPending = record.status.toUpperCase() === 'PENDING';
  const requestedAt = formatRequestedAt(record.createdAt);
  const message = record.safeMessage || (isPending
    ? 'This verification is still being processed.'
    : 'The verification provider could not complete this request.');

  return (
    <div className={`mt-6 rounded-2xl border p-4 ${isPending ? 'border-amber-200 bg-amber-50' : 'border-red-200 bg-red-50'}`} role="alert" aria-live="polite">
      <div className="flex items-start gap-3">
        {isPending ? <Loader2 className="mt-0.5 h-5 w-5 shrink-0 animate-spin text-amber-600" /> : <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />}
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-bold text-slate-900">{title}</h2>
            <span className={`rounded-full px-3 py-1 text-xs font-bold ${isPending ? 'bg-amber-100 text-amber-800' : 'bg-red-100 text-red-700'}`}>
              {record.status}
            </span>
          </div>
          <p className="mt-2 text-sm text-slate-700">{message}</p>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
            {record.messageCode ? <span>Code: {record.messageCode}</span> : null}
            {requestedAt ? <span>Requested: {requestedAt}</span> : null}
          </div>
        </div>
      </div>
    </div>
  );
}
