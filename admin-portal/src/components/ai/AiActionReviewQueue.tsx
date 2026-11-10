'use client';

import { isAxiosError } from 'axios';
import { CheckCircle2, ChevronDown, Clock3, Loader2, RefreshCw, ShieldAlert, XCircle } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import api from '@/lib/api';

type ControlledProposal = {
  id: string;
  actionType: string;
  actionLabel: string;
  targetType: string;
  targetRef: string;
  payload: Record<string, unknown>;
  status: string;
  expiresAt: string;
  createdAt: string;
  requestedBy: { id: string; name: string | null; role: string };
  approvals: Array<{ id: string; approverUserId: string; decision: string; reason: string | null; createdAt: string }>;
  execution: { configured: boolean; executedAt: string | null; errorCode: string | null };
};

type ProposalResponse = { success: boolean; proposals: ControlledProposal[]; error?: string };
type ErrorResponse = { error?: string };

const errorMessage = (error: unknown) => (
  isAxiosError<ErrorResponse>(error)
    ? error.response?.data?.error || 'The controlled action request failed.'
    : error instanceof Error ? error.message : 'The controlled action request failed.'
);

const formatValue = (value: unknown) => {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
};

export default function AiActionReviewQueue() {
  const [proposals, setProposals] = useState<ControlledProposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  const loadProposals = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.get<ProposalResponse>('/ai/actions/proposals?status=PENDING');
      const items = response.data.proposals || [];
      setProposals(items);
      if (items.length > 0) {
        setIsOpen(true);
      }
    } catch (nextError) {
      setError(errorMessage(nextError));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadProposals(), 0);
    return () => window.clearTimeout(timer);
  }, [loadProposals]);

  const review = async (proposal: ControlledProposal, decision: 'APPROVE' | 'REJECT') => {
    const reason = (reasons[proposal.id] || '').trim();
    if (decision === 'REJECT' && reason.length < 3) {
      toast.error('Enter a rejection reason of at least 3 characters.');
      return;
    }
    setBusyId(proposal.id);
    try {
      await api.post(`/ai/actions/proposals/${proposal.id}/review`, { decision, ...(reason ? { reason } : {}) });
      toast.success(decision === 'APPROVE' ? 'Suggestion approved and audited.' : 'Suggestion rejected and audited.');
      await loadProposals();
    } catch (nextError) {
      toast.error(errorMessage(nextError));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className="overflow-hidden rounded-xl border border-slate-200/90 bg-white shadow-2xs transition-all" aria-live="polite">
      <div className="flex items-center justify-between px-4 py-2.5 bg-slate-50/80 border-b border-slate-100">
        <button
          type="button"
          onClick={() => setIsOpen((prev) => !prev)}
          className="flex flex-1 items-center justify-between text-left pr-3 cursor-pointer group"
          aria-expanded={isOpen}
        >
          <div className="flex items-center gap-2.5">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-700 border border-amber-200">
              <ShieldAlert className="h-4 w-4" aria-hidden="true" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-900 group-hover:text-amber-800 transition-colors">
                  Human Approval Gate
                </span>
                <span className="hidden sm:inline-block text-[10px] font-bold uppercase tracking-wider text-amber-700 bg-amber-50/90 border border-amber-200 px-1.5 py-0.5 rounded">
                  Controlled Action Review
                </span>
              </div>
              <p className="text-[11px] text-slate-500 hidden md:block">AI suggestions never execute alone. Review, approve or reject.</p>
            </div>
          </div>
          <div className="flex items-center gap-2.5">
            <span
              className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                proposals.length > 0
                  ? 'bg-amber-100 text-amber-900 border-amber-300'
                  : 'bg-emerald-50 text-emerald-700 border-emerald-200'
              }`}
            >
              {proposals.length} Pending
            </span>
            <ChevronDown
              className={`h-4 w-4 text-slate-400 transition-transform duration-200 ${
                isOpen ? 'rotate-180 text-amber-600' : ''
              }`}
              aria-hidden="true"
            />
          </div>
        </button>

        <button
          type="button"
          onClick={() => void loadProposals()}
          disabled={loading}
          title="Refresh queue"
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin motion-reduce:animate-none' : ''}`} aria-hidden="true" />
        </button>
      </div>

      {isOpen && (
        <div className="p-4 sm:p-5 border-t border-slate-100 animate-in fade-in duration-150">
          {error ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 mb-3" role="alert">{error}</div> : null}
          {!error && loading ? <div className="flex min-h-20 items-center justify-center gap-2 text-xs text-slate-500"><Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> Loading review queue…</div> : null}
          {!error && !loading && !proposals.length ? <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-4 text-xs text-slate-600 text-center">No pending AI suggestions require review.</div> : null}
          {!error && !loading && proposals.length ? (
            <div className="space-y-3">
              {proposals.map((proposal) => (
                <article key={proposal.id} className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
                  <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-800">Pending review</span>
                        <span className="text-xs font-semibold text-slate-500">{proposal.actionType}</span>
                      </div>
                      <h3 className="mt-1.5 text-sm font-bold text-slate-900">{proposal.actionLabel}</h3>
                      <p className="mt-0.5 text-xs text-slate-500">Target: <span className="font-semibold text-slate-700">{proposal.targetType} / {proposal.targetRef}</span></p>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-slate-500"><Clock3 className="h-3.5 w-3.5" aria-hidden="true" /> Expires {new Date(proposal.expiresAt).toLocaleString()}</div>
                  </div>
                  <dl className="mt-3 grid gap-2 rounded-lg border border-slate-200 bg-white p-3 sm:grid-cols-2">
                    {Object.entries(proposal.payload).map(([key, value]) => <div key={key} className="min-w-0"><dt className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{key}</dt><dd className="mt-0.5 break-words text-xs font-semibold text-slate-800">{formatValue(value)}</dd></div>)}
                  </dl>
                  <p className="mt-2.5 text-xs text-slate-500">Suggested by {proposal.requestedBy.name || proposal.requestedBy.role}. A different operator must review this action.</p>
                  <label className="mt-3 block text-xs font-semibold text-slate-700" htmlFor={`controlled-reason-${proposal.id}`}>Review note <span className="font-normal text-slate-400">(required for rejection)</span></label>
                  <textarea id={`controlled-reason-${proposal.id}`} value={reasons[proposal.id] || ''} onChange={(event) => setReasons((current) => ({ ...current, [proposal.id]: event.target.value.slice(0, 2_000) }))} rows={2} maxLength={2_000} placeholder="Why is this decision being approved or rejected?" className="mt-1 w-full resize-y rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-100" disabled={busyId === proposal.id} />
                  <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:justify-end">
                    <button type="button" onClick={() => void review(proposal, 'REJECT')} disabled={busyId === proposal.id} className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg border border-rose-200 bg-white px-3.5 text-xs font-bold text-rose-700 hover:bg-rose-50 transition disabled:opacity-60"><XCircle className="h-3.5 w-3.5" aria-hidden="true" /> Reject</button>
                    <button type="button" onClick={() => void review(proposal, 'APPROVE')} disabled={busyId === proposal.id} className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-4 text-xs font-bold text-white hover:bg-emerald-700 transition shadow-xs disabled:opacity-60">{busyId === proposal.id ? <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />} Approve</button>
                  </div>
                </article>
              ))}
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}
