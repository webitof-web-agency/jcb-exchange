'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BadgeIndianRupee, Loader2, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { toast } from 'react-toastify';
import { hrmApi, type HrmSalaryHistory, type HrmSalaryRevision } from '@/lib/hrmApi';
import { formatHrmDate, getHrmErrorMessage } from '@/lib/hrmUi';
import { formatInr, nextCustomComponentCode, salaryTotals, STANDARD_SALARY_COMPONENTS, type SalaryComponentRow } from '@/lib/offerHrm';
import {
  buildSalaryProposal,
  indiaToday,
  SALARY_STATUS_LABELS,
  salaryRowsFrom,
  salaryStatusClass,
  summariseRevision,
  validateSalaryProposal,
} from '@/lib/hrmProfile';
import HrmModal from './HrmModal';

/**
 * Salary: the revision in force, the history (never deleted), proposing a new revision with its monthly breakup, and
 * approving / rejecting a pending one (hrm.compensation.approve, by somebody other than the proposer).
 */
export default function HrmSalaryCard({
  employeeId,
  canPropose,
  canApprove,
  currentUserId,
  isSuperAdmin,
  proposing,
  onProposingChange,
  onChanged,
}: {
  employeeId: string;
  canPropose: boolean;
  canApprove: boolean;
  currentUserId: string | null;
  isSuperAdmin: boolean;
  proposing: boolean;
  onProposingChange: (open: boolean) => void;
  onChanged?: () => void;
}) {
  const [history, setHistory] = useState<HrmSalaryHistory | null>(null);
  const [loadError, setLoadError] = useState('');
  const [loading, setLoading] = useState(true);
  const [deciding, setDeciding] = useState<{ revision: HrmSalaryRevision; action: 'APPROVE' | 'REJECT' } | null>(null);
  const requestRef = useRef(0);

  const load = useCallback(async () => {
    const request = ++requestRef.current;
    setLoading(true);
    try {
      const response = await hrmApi.getSalaryHistory(employeeId);
      if (request !== requestRef.current) return;
      setHistory({ currentRevisionId: response.data.currentRevisionId, revisions: response.data.revisions });
      setLoadError('');
    } catch (error) {
      if (request === requestRef.current) setLoadError(getHrmErrorMessage(error, 'The salary could not be loaded.'));
    } finally {
      if (request === requestRef.current) setLoading(false);
    }
  }, [employeeId]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const current = history?.revisions.find((revision) => revision.id === history.currentRevisionId) ?? null;
  const latestApproved = current ?? history?.revisions.find((revision) => revision.status === 'APPROVED') ?? null;
  const currentTotals = current ? summariseRevision(current) : null;

  const changed = async () => { await load(); onChanged?.(); };

  return (
    <section id="hrm-salary" aria-labelledby="hrm-salary-title" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2"><BadgeIndianRupee className="h-4 w-4 text-amber-600" aria-hidden="true" /><h2 id="hrm-salary-title" className="font-bold text-slate-950">Salary</h2></div>
        {canPropose ? <button type="button" onClick={() => onProposingChange(true)} className="inline-flex min-h-8 items-center gap-1.5 rounded-lg bg-amber-400 px-2.5 text-xs font-bold text-slate-950 hover:bg-amber-500"><Plus className="h-3.5 w-3.5" /> Propose revision</button> : null}
      </div>

      {loading && !history ? <p className="mt-3 flex items-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading salary…</p> : null}
      {loadError ? <p role="alert" className="mt-3 flex items-center gap-2 text-sm text-rose-700">{loadError}<button type="button" onClick={() => void load()} className="inline-flex items-center gap-1 text-xs font-bold underline"><RefreshCw className="h-3 w-3" /> Try again</button></p> : null}

      {history ? (
        <>
          {current && currentTotals ? (
            <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50/50 p-3">
              <p className="text-[11px] font-extrabold uppercase tracking-wider text-emerald-700">In force since {formatHrmDate(current.effectiveFrom)}</p>
              <div className="mt-2 grid grid-cols-3 gap-2 text-center">
                {[['Gross / month', currentTotals.grossMonthly], ['CTC / month', currentTotals.ctcMonthly], ['CTC / year', currentTotals.annualCtc]].map(([label, value]) => (
                  <div key={label as string}><p className="text-[11px] text-slate-500">{label}</p><p className="text-sm font-bold text-slate-900">₹{formatInr(value as number)}</p></div>
                ))}
              </div>
              {current.components.length ? (
                <ul className="mt-2 divide-y divide-emerald-100 text-xs">{current.components.map((component) => <li key={component.id} className="flex justify-between py-1"><span className="text-slate-700">{component.name}</span><span className="font-semibold text-slate-900">₹{formatInr(Number(component.amount))} / month</span></li>)}</ul>
              ) : null}
            </div>
          ) : <p className="mt-3 text-sm text-slate-500">No approved salary yet.{canPropose ? ' Propose one with its monthly breakup.' : ''}</p>}

          {history.revisions.length ? (
            <ul className="mt-4 space-y-2">
              {history.revisions.map((revision) => {
                const totals = summariseRevision(revision);
                const pending = revision.status === 'PENDING_APPROVAL' || revision.status === 'DRAFT';
                const ownProposal = revision.createdById !== null && revision.createdById === currentUserId && !isSuperAdmin;
                return (
                  <li key={revision.id} className="rounded-xl border border-slate-100 bg-slate-50/60 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-slate-800">₹{formatInr(totals.annualCtc)} / year <span className="font-normal text-slate-500">· from {formatHrmDate(revision.effectiveFrom)}{revision.effectiveTo ? ` to ${formatHrmDate(revision.effectiveTo)}` : ''}</span></p>
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-bold ring-1 ring-inset ${salaryStatusClass(revision.status)}`}>{SALARY_STATUS_LABELS[revision.status]}</span>
                    </div>
                    <p className="mt-1 text-[11px] text-slate-500">
                      Proposed by {revision.createdByName || '—'}{revision.approvedByName ? ` · approved by ${revision.approvedByName}${revision.approvedAt ? ` on ${formatHrmDate(revision.approvedAt)}` : ''}` : ''}
                      {!revision.components.length ? ' · CTC only (no breakup)' : ''}
                    </p>
                    {revision.reason ? <p className="mt-1 whitespace-pre-line text-xs text-slate-600">{revision.reason}</p> : null}
                    {pending && canApprove ? (
                      ownProposal
                        ? <p className="mt-2 text-[11px] text-slate-500">You proposed this salary, so somebody else approves it.</p>
                        : <div className="mt-2 flex gap-2">
                          <button type="button" onClick={() => setDeciding({ revision, action: 'APPROVE' })} className="min-h-8 rounded-lg bg-emerald-600 px-3 text-xs font-bold text-white hover:bg-emerald-700">Approve</button>
                          <button type="button" onClick={() => setDeciding({ revision, action: 'REJECT' })} className="min-h-8 rounded-lg border border-rose-200 bg-white px-3 text-xs font-bold text-rose-700 hover:bg-rose-50">Reject</button>
                        </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          ) : null}
        </>
      ) : null}

      {/* Opened only once the salary is loaded, so the form starts from the salary in force. */}
      {proposing && history ? <ProposeSalaryDialog employeeId={employeeId} baseline={latestApproved} onClose={() => onProposingChange(false)} onDone={async () => { onProposingChange(false); await changed(); }} /> : null}
      {deciding ? <DecideSalaryDialog revision={deciding.revision} action={deciding.action} onClose={() => setDeciding(null)} onDone={async () => { setDeciding(null); await changed(); }} /> : null}
    </section>
  );
}

function ProposeSalaryDialog({ employeeId, baseline, onClose, onDone }: { employeeId: string; baseline: HrmSalaryRevision | null; onClose: () => void; onDone: () => Promise<void> }) {
  const [rows, setRows] = useState<SalaryComponentRow[]>(() => salaryRowsFrom(baseline));
  const [effectiveFrom, setEffectiveFrom] = useState(indiaToday());
  const [reason, setReason] = useState('');
  // A typed breakup is not lost to a stray Escape / backdrop click.
  const [initial] = useState(() => JSON.stringify({ rows: salaryRowsFrom(baseline), effectiveFrom: indiaToday(), reason: '' }));
  const dirty = JSON.stringify({ rows, effectiveFrom, reason }) !== initial;
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const totals = useMemo(() => salaryTotals(rows), [rows]);
  const update = (index: number, patch: Partial<SalaryComponentRow>) => setRows((current) => current.map((row, position) => (position === index ? { ...row, ...patch } : row)));

  const submit = async () => {
    if (saving) return;
    const problem = validateSalaryProposal(rows, effectiveFrom);
    if (problem) { setError(problem); return; }
    setSaving(true); setError('');
    try {
      await hrmApi.proposeSalary(employeeId, { effectiveFrom, reason: reason.trim() || null, components: buildSalaryProposal(rows) });
      toast.success('Salary proposed. It now waits for approval.');
      await onDone();
    } catch (requestError) {
      setError(getHrmErrorMessage(requestError, 'The salary could not be proposed.'));
    } finally { setSaving(false); }
  };

  return (
    <HrmModal title="Propose salary revision" description="Monthly amounts. The revision applies once somebody with salary approval rights approves it." onClose={onClose} busy={saving} lockDismiss={saving || dirty} size="lg" error={error}
      footer={<>
        <button type="button" onClick={onClose} disabled={saving} className="min-h-10 rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50">Cancel</button>
        <button type="button" onClick={() => void submit()} disabled={saving} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-slate-950 px-4 text-sm font-bold text-white disabled:opacity-60">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}Send for approval</button>
      </>}>
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs font-semibold text-slate-700">Applies from<input type="date" value={effectiveFrom} onChange={(event) => setEffectiveFrom(event.target.value)} className="mt-1 min-h-10 w-full rounded-lg border border-slate-200 px-3 text-sm font-normal" /></label>
          <label className="text-xs font-semibold text-slate-700">Reason (optional)<input value={reason} maxLength={2000} onChange={(event) => setReason(event.target.value)} placeholder="Annual increment, correction…" className="mt-1 min-h-10 w-full rounded-lg border border-slate-200 px-3 text-sm font-normal" /></label>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-xs text-slate-500"><tr><th className="py-1.5 pr-2 font-semibold">Component</th><th className="py-1.5 pr-2 font-semibold">Type</th><th className="py-1.5 pr-2 text-right font-semibold">Monthly (₹)</th><th className="py-1.5 text-right font-semibold">Yearly</th><th /></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((row, index) => {
                const custom = !STANDARD_SALARY_COMPONENTS.some((component) => component.code === row.code);
                const monthly = Number(row.monthlyAmount.replace(/,/g, '')) || 0;
                return (
                  <tr key={`${row.code}-${index}`}>
                    <td className="py-1.5 pr-2">{custom ? <input value={row.name} maxLength={100} onChange={(event) => update(index, { name: event.target.value })} placeholder="Component name" className="min-h-9 w-full rounded-lg border border-slate-200 px-2 text-sm" /> : <span className="text-slate-800">{row.name}</span>}</td>
                    <td className="py-1.5 pr-2">{custom ? <select value={row.componentType} onChange={(event) => update(index, { componentType: event.target.value as SalaryComponentRow['componentType'] })} className="min-h-9 rounded-lg border border-slate-200 bg-white px-2 text-xs"><option value="EARNING">Earning</option><option value="EMPLOYER_CONTRIBUTION">Employer contribution</option></select> : <span className="text-xs text-slate-500">{row.componentType === 'EARNING' ? 'Earning' : 'Employer contribution'}</span>}</td>
                    <td className="py-1.5 pr-2 text-right"><input inputMode="decimal" value={row.monthlyAmount} onChange={(event) => update(index, { monthlyAmount: event.target.value.replace(/[^\d.,]/g, '') })} aria-label={`${row.name || 'Component'} monthly amount`} className="min-h-9 w-28 rounded-lg border border-slate-200 px-2 text-right text-sm" /></td>
                    <td className="py-1.5 text-right text-xs text-slate-600">₹{formatInr(monthly * 12)}</td>
                    <td className="py-1.5 pl-1 text-right">{custom ? <button type="button" onClick={() => setRows((current) => current.filter((_, position) => position !== index))} aria-label="Remove row" className="rounded p-1 text-slate-400 hover:text-rose-600"><Trash2 className="h-4 w-4" /></button> : null}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <button type="button" onClick={() => setRows((current) => [...current, { code: nextCustomComponentCode(current), name: '', componentType: 'EARNING', monthlyAmount: '' }])} className="inline-flex items-center gap-1 text-xs font-bold text-amber-700 hover:underline"><Plus className="h-3.5 w-3.5" /> Add a component</button>
        <div className="grid grid-cols-3 gap-2 rounded-xl bg-slate-50 p-3 text-center">
          {[['Gross / month', totals.grossMonthly], ['CTC / month', totals.ctcMonthly], ['CTC / year', totals.annualCtc]].map(([label, value]) => (
            <div key={label as string}><p className="text-[11px] text-slate-500">{label}</p><p className="text-sm font-bold text-slate-900">₹{formatInr(value as number)}</p></div>
          ))}
        </div>
      </div>
    </HrmModal>
  );
}

function DecideSalaryDialog({ revision, action, onClose, onDone }: { revision: HrmSalaryRevision; action: 'APPROVE' | 'REJECT'; onClose: () => void; onDone: () => Promise<void> }) {
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const totals = summariseRevision(revision);
  const submit = async () => {
    if (saving) return;
    if (action === 'REJECT' && reason.trim().length < 3) { setError('Give the reason the salary is rejected.'); return; }
    setSaving(true); setError('');
    try {
      await hrmApi.decideSalary(revision.id, action, reason.trim() || undefined);
      toast.success(action === 'APPROVE' ? 'Salary approved.' : 'Salary rejected.');
      await onDone();
    } catch (requestError) {
      setError(getHrmErrorMessage(requestError, 'The decision could not be saved.'));
    } finally { setSaving(false); }
  };
  return (
    <HrmModal title={action === 'APPROVE' ? 'Approve salary' : 'Reject salary'} description={`₹${formatInr(totals.annualCtc)} / year from ${formatHrmDate(revision.effectiveFrom)}`} onClose={onClose} busy={saving} lockDismiss={saving} size="sm" error={error}
      footer={<>
        <button type="button" onClick={onClose} disabled={saving} className="min-h-10 rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50">Cancel</button>
        <button type="button" onClick={() => void submit()} disabled={saving} className={`inline-flex min-h-10 items-center gap-2 rounded-lg px-4 text-sm font-bold text-white disabled:opacity-60 ${action === 'APPROVE' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-rose-600 hover:bg-rose-700'}`}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}{action === 'APPROVE' ? 'Approve' : 'Reject'}</button>
      </>}>
      <div className="space-y-3 text-sm">
        {action === 'APPROVE' ? <p className="text-slate-600">The salary in force ends the day before this one starts. {revision.components.length ? '' : 'This revision has only a CTC: the server asks for the monthly breakup before it can be approved.'}</p> : null}
        <label className="block text-xs font-semibold text-slate-700">{action === 'APPROVE' ? 'Note (optional)' : 'Reason'}<textarea rows={3} value={reason} maxLength={1000} onChange={(event) => setReason(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 p-2 text-sm font-normal" /></label>
      </div>
    </HrmModal>
  );
}
