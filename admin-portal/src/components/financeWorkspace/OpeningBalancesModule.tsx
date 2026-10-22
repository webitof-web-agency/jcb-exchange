'use client';

import { FormEvent, useMemo, useState } from 'react';
import { Plus, Save, Trash2 } from 'lucide-react';
import { toast } from 'react-toastify';
import api from '@/lib/api';
import SearchableSelect from '@/components/ui/SearchableSelect';
import { apiErrorMessage, formatInr, useFinanceWorkspaceAccess } from '@/lib/financeWorkspaceClient';
import { loadChart } from './ChartOfAccountsModule';
import { optionalChoices } from './ledgerLookups';
import { loadFinancialYears } from './FinancialYearsModule';
import { Badge, Button, EmptyState, ErrorBanner, Field, inputClass, LoadingState, Modal, ModalFooter, Panel, ReadOnlyNotice, tableHeadClass } from './ui';
import { useResource } from './useResource';

type Line = { key: string; accountId: string; partyId: string; billRef: string; billDate: string; dueDate: string; debit: string; credit: string };
type SavedLine = { accountId: string; partyId: string | null; billRef: string | null; billDate: string | null; dueDate: string | null; debit: number; credit: number };
type OpeningResponse = { finalized: boolean; lines: SavedLine[]; totals: { debit: number; credit: number; difference: number } };

let lineSeed = 0;
const newLine = (values: Partial<Line> = {}): Line => {
  lineSeed += 1;
  return { key: `line-${lineSeed}`, accountId: '', partyId: '', billRef: '', billDate: '', dueDate: '', debit: '', credit: '', ...values };
};

const toPaise = (value: string) => {
  const amount = Number(value.replace(/,/g, ''));
  return Number.isFinite(amount) && amount > 0 ? Math.round(amount * 100) : 0;
};

export default function OpeningBalancesModule() {
  const access = useFinanceWorkspaceAccess();
  const canEdit = access.can(['fh.books.manage']);
  const canFinalize = access.can(['fh.books.post']);
  const canReopen = access.can(['fh.period.lock']);
  const [prompt, setPrompt] = useState<null | 'finalize' | 'reopen'>(null);
  const [reason, setReason] = useState('');
  const years = useResource(loadFinancialYears, 'financial-years');
  const chart = useResource(loadChart, 'chart');
  const parties = useResource(async () => (await api.get('/finance-hub/parties', { params: { pageSize: 200 } })).data.parties as Array<{ id: string; code: string; name: string }>, 'opening-parties');
  const [yearId, setYearId] = useState('');
  const year = (years.data ?? []).find((item) => item.id === yearId) || (years.data ?? []).find((item) => item.isCurrent) || years.data?.[0];
  const opening = useResource(async () => (year ? ((await api.get(`/finance-hub/opening-balances/${year.id}`)).data as OpeningResponse) : null), `opening-${year?.id ?? 'none'}`);
  const [draft, setDraft] = useState<{ yearId: string; lines: Line[] } | null>(null);
  const [busy, setBusy] = useState(false);

  const groupsById = useMemo(() => new Map((chart.data?.groups ?? []).map((group) => [group.id, group])), [chart.data]);
  const accountsById = useMemo(() => new Map((chart.data?.accounts ?? []).map((account) => [account.id, account])), [chart.data]);
  const accountOptions = useMemo(
    () => (chart.data?.accounts ?? [])
      .filter((account) => {
        const nature = groupsById.get(account.groupId)?.nature;
        return account.isActive && nature !== 'INCOME' && nature !== 'EXPENSE' && account.systemKey !== 'OPENING_DIFFERENCE';
      })
      .map((account) => ({ id: account.id, name: `${account.code} · ${account.name}` })),
    [chart.data, groupsById],
  );
  const partyOptions = useMemo(() => [{ id: '', name: 'No party' }, ...(parties.data ?? []).map((party) => ({ id: party.id, name: `${party.code} · ${party.name}` }))], [parties.data]);

  const savedLines = useMemo(
    () => (opening.data?.lines ?? []).map((line) => newLine({
      accountId: line.accountId, partyId: line.partyId ?? '', billRef: line.billRef ?? '', billDate: line.billDate ?? '', dueDate: line.dueDate ?? '',
      debit: line.debit ? String(line.debit) : '', credit: line.credit ? String(line.credit) : '',
    })),
    [opening.data],
  );
  const lines = draft && draft.yearId === year?.id ? draft.lines : savedLines;
  const dirty = Boolean(draft && draft.yearId === year?.id);
  const locked = Boolean(opening.data?.finalized) || year?.status === 'LOCKED';
  const editable = canEdit && !locked;

  const totals = useMemo(() => {
    const debit = lines.reduce((sum, line) => sum + toPaise(line.debit), 0);
    const credit = lines.reduce((sum, line) => sum + toPaise(line.credit), 0);
    return { debit: debit / 100, credit: credit / 100, difference: (debit - credit) / 100 };
  }, [lines]);

  const update = (key: string, patch: Partial<Line>) => {
    if (!year) return;
    setDraft({ yearId: year.id, lines: lines.map((line) => (line.key === key ? { ...line, ...patch } : line)) });
  };

  const save = async () => {
    if (!year) return;
    setBusy(true);
    try {
      const payload = lines.map((line) => ({
        accountId: line.accountId, partyId: line.partyId || null, billRef: line.billRef || null, billDate: line.billDate || null,
        dueDate: line.dueDate || null, debit: line.debit || null, credit: line.credit || null,
      })).filter((line) => line.accountId);
      const result = (await api.put(`/finance-hub/opening-balances/${year.id}`, { lines: payload })).data;
      toast.success(`Saved ${result.saved} opening lines.`);
      setDraft(null);
      opening.reload();
    } catch (error) {
      toast.error(apiErrorMessage(error, 'Could not save opening balances.'));
    } finally {
      setBusy(false);
    }
  };

  const submitPrompt = async (event: FormEvent) => {
    event.preventDefault();
    if (!year || !prompt) return;
    setBusy(true);
    try {
      if (prompt === 'finalize') {
        const result = (await api.post(`/finance-hub/opening-balances/${year.id}/finalize`)).data;
        toast.success(`Opening balances posted as ${result.number}.`);
      } else {
        const result = (await api.post(`/finance-hub/opening-balances/${year.id}/reopen`, { reason })).data;
        toast.success(result.reversed ? `Reopened. ${result.reversed} was reversed.` : 'Reopened.');
      }
      setPrompt(null);
      setReason('');
      years.reload();
      opening.reload();
    } catch (error) {
      toast.error(apiErrorMessage(error, prompt === 'finalize' ? 'Could not finalise.' : 'Could not reopen.'));
    } finally {
      setBusy(false);
    }
  };

  const loading = years.loading || chart.loading || opening.loading;
  const failure = years.error || chart.error || opening.error;
  if (loading) return <Panel><LoadingState /></Panel>;
  if (failure) return <Panel><ErrorBanner message={failure} schemaMissing={years.schemaMissing || chart.schemaMissing || opening.schemaMissing} /></Panel>;
  if (!years.data?.length) return <Panel><EmptyState title="Create a financial year first" description="Finance Settings → Financial Year & Periods." /></Panel>;
  if (!chart.data?.installed) return <Panel><EmptyState title="Install the chart of accounts first" description="Accounting & Books → Chart of Accounts." /></Panel>;

  return (
    <Panel
      title="Opening balances"
      description="Balance-sheet ledgers on the first day of the year: bank, cash, debtors and creditors bill-wise, advances, loans and capital. Income and expense ledgers always start at zero."
      actions={
        <>
          <select value={year?.id ?? ''} onChange={(event) => { setYearId(event.target.value); setDraft(null); }} className={`${inputClass} w-auto py-2`} aria-label="Financial year">
            {(years.data ?? []).map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
          {editable ? <Button icon={<Plus className="h-4 w-4" />} onClick={() => year && setDraft({ yearId: year.id, lines: [...lines, newLine()] })}>Add line</Button> : null}
          {editable ? <Button variant="primary" icon={<Save className="h-4 w-4" />} busy={busy} disabled={!dirty} onClick={save}>Save draft</Button> : null}
        </>
      }
    >
      {locked ? <ReadOnlyNotice>{opening.data?.finalized ? 'Opening balances for this year are finalised.' : 'This year is closed.'}</ReadOnlyNotice> : !canEdit ? <ReadOnlyNotice>Editing needs “Create & Edit Draft Vouchers”.</ReadOnlyNotice> : null}
      {lines.length ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1080px] text-left text-sm">
            <thead className={tableHeadClass}><tr><th className="px-3 py-2.5">Ledger</th><th className="px-3 py-2.5">Party</th><th className="px-3 py-2.5">Bill ref.</th><th className="px-3 py-2.5">Bill date</th><th className="px-3 py-2.5">Due date</th><th className="px-3 py-2.5 text-right">Debit</th><th className="px-3 py-2.5 text-right">Credit</th><th className="px-3 py-2.5" /></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {lines.map((line) => {
                const account = accountsById.get(line.accountId);
                const needsParty = Boolean(account?.requiresParty);
                return (
                  <tr key={line.key}>
                    <td className="w-72 px-3 py-2">
                      <SearchableSelect options={accountOptions} value={line.accountId} disabled={!editable} onChange={(option) => update(line.key, { accountId: String(option.id) })} placeholder="Choose ledger" size="sm" />
                    </td>
                    <td className="w-60 px-3 py-2">
                      <SearchableSelect options={optionalChoices(partyOptions, line.partyId)} value={line.partyId} disabled={!editable} highlighted={needsParty && !line.partyId} onChange={(option) => update(line.key, { partyId: String(option.id) })} placeholder={needsParty ? 'Party required' : 'No party'} size="sm" />
                    </td>
                    <td className="px-3 py-2"><input value={line.billRef} disabled={!editable || !line.partyId} onChange={(event) => update(line.key, { billRef: event.target.value.toUpperCase() })} className={`${inputClass} py-2`} maxLength={60} /></td>
                    <td className="px-3 py-2"><input type="date" value={line.billDate} disabled={!editable || !line.partyId} onChange={(event) => update(line.key, { billDate: event.target.value })} className={`${inputClass} py-2`} /></td>
                    <td className="px-3 py-2"><input type="date" value={line.dueDate} disabled={!editable || !line.partyId} onChange={(event) => update(line.key, { dueDate: event.target.value })} className={`${inputClass} py-2`} /></td>
                    <td className="w-36 px-3 py-2"><input type="number" min={0} step="0.01" value={line.debit} disabled={!editable} onChange={(event) => update(line.key, { debit: event.target.value, credit: event.target.value ? '' : line.credit })} className={`${inputClass} py-2 text-right`} /></td>
                    <td className="w-36 px-3 py-2"><input type="number" min={0} step="0.01" value={line.credit} disabled={!editable} onChange={(event) => update(line.key, { credit: event.target.value, debit: event.target.value ? '' : line.debit })} className={`${inputClass} py-2 text-right`} /></td>
                    <td className="px-3 py-2 text-right">{editable ? <button type="button" onClick={() => year && setDraft({ yearId: year.id, lines: lines.filter((item) => item.key !== line.key) })} className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600" aria-label="Remove line"><Trash2 className="h-4 w-4" /></button> : null}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="bg-slate-50 text-sm font-bold text-slate-900">
              <tr><td className="px-3 py-3" colSpan={5}>Total</td><td className="px-3 py-3 text-right">{formatInr(totals.debit)}</td><td className="px-3 py-3 text-right">{formatInr(totals.credit)}</td><td /></tr>
            </tfoot>
          </table>
        </div>
      ) : <EmptyState title="No opening balances entered" description="Add a line per bank/cash ledger, one per customer or seller bill outstanding, advances, loans and capital." action={editable ? <Button variant="primary" onClick={() => year && setDraft({ yearId: year.id, lines: [newLine()] })}>Add first line</Button> : undefined} />}

      <div className="flex flex-col gap-2 border-t border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2 text-sm">
          <span className="text-slate-500">Difference (debit − credit):</span>
          <span className={`font-bold ${totals.difference === 0 ? 'text-emerald-700' : 'text-red-600'}`}>{formatInr(totals.difference)}</span>
          {totals.difference === 0 ? <Badge tone="green">Balanced</Badge> : <Badge tone="red">Not balanced</Badge>}
          {dirty ? <Badge tone="amber">Unsaved changes</Badge> : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!opening.data?.finalized && canFinalize && lines.length ? (
            <Button variant="primary" disabled={dirty || totals.difference !== 0 || busy} title={dirty ? 'Save the draft first' : totals.difference !== 0 ? 'Difference must be zero' : undefined} onClick={() => setPrompt('finalize')}>Finalise &amp; post opening voucher</Button>
          ) : null}
          {opening.data?.finalized && canReopen ? <Button variant="danger" disabled={busy} onClick={() => setPrompt('reopen')}>Reopen opening balances</Button> : null}
          {!opening.data?.finalized ? <p className="text-xs text-slate-500">Finalising posts one opening voucher dated {year ? year.startDate.slice(0, 10).split('-').reverse().join('-') : ''} and locks this grid.</p> : null}
        </div>
      </div>

      {prompt ? (
        <Modal title={prompt === 'finalize' ? 'Finalise opening balances' : 'Reopen opening balances'} subtitle={prompt === 'finalize' ? 'Posts the opening voucher into the books. To change it later, reopen (which reverses it).' : 'The opening voucher is reversed and the grid becomes editable. Recorded in the audit trail.'} onClose={() => { if (!busy) setPrompt(null); }}>
          <form onSubmit={submitPrompt} className="space-y-4 p-5 sm:p-7">
            {prompt === 'finalize' ? (
              <p className="text-sm text-slate-700">Total debit {formatInr(totals.debit)} = total credit {formatInr(totals.credit)} across {lines.length} lines.</p>
            ) : (
              <Field label="Reason *"><textarea value={reason} onChange={(event) => setReason(event.target.value)} className={`${inputClass} min-h-20`} maxLength={500} required /></Field>
            )}
            <ModalFooter><Button onClick={() => setPrompt(null)} disabled={busy}>Cancel</Button><Button type="submit" variant={prompt === 'reopen' ? 'danger' : 'primary'} busy={busy}>Confirm</Button></ModalFooter>
          </form>
        </Modal>
      ) : null}
    </Panel>
  );
}
