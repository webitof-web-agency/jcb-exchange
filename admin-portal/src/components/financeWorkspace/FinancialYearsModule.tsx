'use client';

import { FormEvent, useMemo, useState } from 'react';
import { CalendarPlus, Lock, LockOpen, Star } from 'lucide-react';
import { toast } from 'react-toastify';
import api from '@/lib/api';
import { apiErrorMessage, formatDate, useFinanceWorkspaceAccess } from '@/lib/financeWorkspaceClient';
import { Badge, Button, cellClass, EmptyState, ErrorBanner, Field, inputClass, LoadingState, Modal, ModalFooter, Panel, ReadOnlyNotice, tableHeadClass } from './ui';
import { useResource } from './useResource';

type PeriodStatus = 'OPEN' | 'SOFT_CLOSED' | 'LOCKED';

export type FinancialYear = {
  id: string;
  label: string;
  startDate: string;
  endDate: string;
  status: PeriodStatus;
  isCurrent: boolean;
  openingFinalizedAt: string | null;
  periods: Array<{ id: string; label: string; startDate: string; endDate: string; status: PeriodStatus; statusChangedAt: string | null; statusReason: string | null }>;
};

export const loadFinancialYears = async () => (await api.get('/finance-hub/financial-years')).data.years as FinancialYear[];

const statusTone = { OPEN: 'green', SOFT_CLOSED: 'amber', LOCKED: 'red' } as const;
const statusLabel = { OPEN: 'Open', SOFT_CLOSED: 'Soft closed', LOCKED: 'Locked' } as const;

const fyStartYear = (date = new Date()) => (date.getMonth() >= 3 ? date.getFullYear() : date.getFullYear() - 1);

type PendingChange = { periodId: string; label: string; from: PeriodStatus; to: PeriodStatus };

export default function FinancialYearsModule() {
  const access = useFinanceWorkspaceAccess();
  const canManage = access.can(['fh.settings.manage']);
  const canLock = access.can(['fh.period.lock']);
  const years = useResource(loadFinancialYears, 'financial-years');
  const [createOpen, setCreateOpen] = useState(false);
  const [startYear, setStartYear] = useState('');
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<PendingChange | null>(null);
  const [reason, setReason] = useState('');
  const [selectedId, setSelectedId] = useState('');

  const list = useMemo(() => years.data ?? [], [years.data]);
  const selected = list.find((year) => year.id === selectedId) || list.find((year) => year.isCurrent) || list[0];
  const yearOptions = useMemo(() => {
    const existing = new Set(list.map((year) => Number(year.startDate.slice(0, 4))));
    const base = fyStartYear();
    return Array.from({ length: 7 }, (_, index) => base - 4 + index).filter((year) => !existing.has(year));
  }, [list]);

  const openCreate = () => {
    setStartYear(String(yearOptions.includes(fyStartYear()) ? fyStartYear() : yearOptions[yearOptions.length - 1] ?? ''));
    setCreateOpen(true);
  };

  const createYear = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      const response = await api.post('/finance-hub/financial-years', { startYear: Number(startYear) });
      toast.success(`${response.data.label} created with 12 monthly periods and voucher series.`);
      setCreateOpen(false);
      setSelectedId(response.data.id);
      years.reload();
    } catch (error) {
      toast.error(apiErrorMessage(error, 'Could not create the financial year.'));
    } finally {
      setBusy(false);
    }
  };

  const makeCurrent = async (id: string) => {
    setBusy(true);
    try {
      await api.post(`/finance-hub/financial-years/${id}/current`);
      toast.success('Current financial year updated.');
      years.reload();
    } catch (error) {
      toast.error(apiErrorMessage(error, 'Could not change the current year.'));
    } finally {
      setBusy(false);
    }
  };

  const applyChange = async (event: FormEvent) => {
    event.preventDefault();
    if (!pending) return;
    setBusy(true);
    try {
      await api.patch(`/finance-hub/periods/${pending.periodId}/status`, { status: pending.to, reason: reason.trim() || null });
      toast.success(`${pending.label} is now ${statusLabel[pending.to].toLowerCase()}.`);
      setPending(null);
      setReason('');
      years.reload();
    } catch (error) {
      toast.error(apiErrorMessage(error, 'Could not change the period status.'));
    } finally {
      setBusy(false);
    }
  };

  if (years.loading) return <Panel><LoadingState /></Panel>;
  if (years.error) return <Panel><ErrorBanner message={years.error} schemaMissing={years.schemaMissing} /></Panel>;

  const reopening = pending ? pending.to === 'OPEN' || (pending.to === 'SOFT_CLOSED' && pending.from === 'LOCKED') : false;

  return (
    <div className="space-y-5">
      <Panel
        title="Financial years"
        description="Indian FY (April–March). Creating a year adds its 12 monthly periods and a voucher number series for every voucher type."
        actions={canManage ? <Button variant="primary" icon={<CalendarPlus className="h-4 w-4" />} onClick={openCreate} disabled={!yearOptions.length}>Create financial year</Button> : null}
      >
        {!canManage ? <ReadOnlyNotice>You can view years and periods. Creating years needs “Manage Finance Settings”.</ReadOnlyNotice> : null}
        {list.length ? (
          <div className="flex flex-wrap gap-2 p-5">
            {list.map((year) => (
              <button key={year.id} type="button" onClick={() => setSelectedId(year.id)} className={`rounded-xl border px-4 py-3 text-left transition ${selected?.id === year.id ? 'border-amber-300 bg-amber-50 ring-1 ring-amber-200' : 'border-slate-200 bg-white hover:bg-slate-50'}`}>
                <span className="flex items-center gap-2 text-sm font-bold text-slate-900">{year.label}{year.isCurrent ? <Badge tone="blue">Current</Badge> : null}</span>
                <span className="mt-0.5 block text-xs text-slate-500">{formatDate(year.startDate)} – {formatDate(year.endDate)}</span>
              </button>
            ))}
          </div>
        ) : (
          <EmptyState title="No financial year yet" description="Create the first financial year (books begin 01-04-2026 by default). Opening balances and vouchers are recorded against it." action={canManage ? <Button variant="primary" onClick={openCreate}>Create financial year</Button> : undefined} />
        )}
      </Panel>

      {selected ? (
        <Panel
          title={`${selected.label} · monthly periods`}
          description="Months close in order (soft close lets only period-lock users post; lock stops all posting) and reopen from the latest month, with a reason."
          actions={canManage && !selected.isCurrent ? <Button icon={<Star className="h-4 w-4" />} busy={busy} onClick={() => makeCurrent(selected.id)}>Make current year</Button> : null}
        >
          {!canLock ? <ReadOnlyNotice>Closing and reopening months needs the “Close, Lock & Reopen Periods” permission.</ReadOnlyNotice> : null}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className={tableHeadClass}><tr><th className="px-4 py-2.5">Month</th><th className="px-4 py-2.5">Dates</th><th className="px-4 py-2.5">Status</th><th className="px-4 py-2.5">Last change</th><th className="px-4 py-2.5 text-right">Actions</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {selected.periods.map((period) => (
                  <tr key={period.id}>
                    <td className={`${cellClass} font-semibold text-slate-900`}>{period.label}</td>
                    <td className={`${cellClass} text-slate-500`}>{formatDate(period.startDate)} – {formatDate(period.endDate)}</td>
                    <td className={cellClass}><Badge tone={statusTone[period.status]}>{statusLabel[period.status]}</Badge></td>
                    <td className={`${cellClass} text-xs text-slate-500`}>{period.statusChangedAt ? <>{formatDate(period.statusChangedAt)}{period.statusReason ? <span className="block max-w-[260px] truncate" title={period.statusReason}>{period.statusReason}</span> : null}</> : '—'}</td>
                    <td className={`${cellClass} text-right`}>
                      {canLock ? (
                        <div className="flex justify-end gap-1.5">
                          {period.status === 'OPEN' ? <Button variant="ghost" onClick={() => setPending({ periodId: period.id, label: period.label, from: period.status, to: 'SOFT_CLOSED' })}>Soft close</Button> : null}
                          {period.status !== 'LOCKED' ? <Button variant="ghost" icon={<Lock className="h-3.5 w-3.5" />} onClick={() => setPending({ periodId: period.id, label: period.label, from: period.status, to: 'LOCKED' })}>Lock</Button> : null}
                          {period.status !== 'OPEN' ? <Button variant="ghost" icon={<LockOpen className="h-3.5 w-3.5" />} onClick={() => setPending({ periodId: period.id, label: period.label, from: period.status, to: 'OPEN' })}>Reopen</Button> : null}
                        </div>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      ) : null}

      {createOpen ? (
        <Modal title="Create financial year" subtitle="Adds 12 monthly periods (all open) and voucher number series such as JV/26-27/00001." onClose={() => { if (!busy) setCreateOpen(false); }}>
          <form onSubmit={createYear} className="p-5 sm:p-7">
            <Field label="Financial year *">
              <select value={startYear} onChange={(event) => setStartYear(event.target.value)} className={inputClass} required>
                {yearOptions.map((year) => <option key={year} value={year}>FY {year}-{String((year + 1) % 100).padStart(2, '0')} (1 Apr {year} – 31 Mar {year + 1})</option>)}
              </select>
            </Field>
            <ModalFooter>
              <Button onClick={() => setCreateOpen(false)} disabled={busy}>Cancel</Button>
              <Button type="submit" variant="primary" busy={busy}>Create year</Button>
            </ModalFooter>
          </form>
        </Modal>
      ) : null}

      {pending ? (
        <Modal title={`${pending.to === 'OPEN' ? 'Reopen' : pending.to === 'LOCKED' ? 'Lock' : 'Soft close'} ${pending.label}`} subtitle={reopening ? 'Reopening is recorded in the audit trail with your reason.' : 'Posting into this month will be restricted.'} onClose={() => { if (!busy) setPending(null); }}>
          <form onSubmit={applyChange} className="p-5 sm:p-7">
            <Field label={reopening ? 'Reason *' : 'Note'}>
              <textarea value={reason} onChange={(event) => setReason(event.target.value)} className={`${inputClass} min-h-24`} required={reopening} maxLength={500} placeholder={reopening ? 'Why does this month need to be reopened?' : 'Optional'} />
            </Field>
            <ModalFooter>
              <Button onClick={() => setPending(null)} disabled={busy}>Cancel</Button>
              <Button type="submit" variant={pending.to === 'OPEN' ? 'danger' : 'primary'} busy={busy}>Confirm</Button>
            </ModalFooter>
          </form>
        </Modal>
      ) : null}
    </div>
  );
}
