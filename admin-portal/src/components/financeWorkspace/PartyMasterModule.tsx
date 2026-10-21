'use client';

import { FormEvent, useState } from 'react';
import { ChevronLeft, ChevronRight, RefreshCw, Search, UserPlus } from 'lucide-react';
import { toast } from 'react-toastify';
import api from '@/lib/api';
import { apiErrorDetails, apiErrorMessage, enumLabel, formatInr, isConflictError, useFinanceWorkspaceAccess } from '@/lib/financeWorkspaceClient';
import { drCrAmount, PartyStatementModal, type PartyRef } from './receivablesShared';
import { Badge, Button, cellClass, EmptyState, ErrorBanner, Field, inputClass, LoadingState, Modal, ModalFooter, Panel, ReadOnlyNotice, tableHeadClass, Toggle } from './ui';
import { useResource } from './useResource';

export const PARTY_TYPES = ['CUSTOMER', 'SELLER', 'PARTNER', 'BROKER', 'AGENT', 'VENDOR', 'EMPLOYEE', 'OTHER'] as const;
type PartyType = (typeof PARTY_TYPES)[number];

type Party = {
  id: string; code: string; name: string; types: PartyType[]; mobile: string | null; altMobile: string | null; email: string | null; gstin: string | null; pan: string | null;
  address: string | null; city: string | null; state: string | null; pinCode: string | null; bankName: string | null; bankAccountNumber: string | null; ifsc: string | null;
  upiId: string | null; creditLimit: number | null; creditDays: number | null; tdsSection: string | null; isActive: boolean; notes: string | null; _count?: { links: number };
};
type PartyList = { parties: Party[]; total: number; page: number; pageSize: number };
type SyncSummary = { apply: boolean; candidates: number; newParties: number; updatedParties: number; newLinks: number; alreadyLinked: number; nameOnlyMatches: number; sample: Array<{ name: string; mobile: string | null; types: string[]; records: number }> };
type Duplicate = { id: string; code: string; name: string; mobile: string | null; gstin: string | null };

type Form = Omit<Party, 'id' | 'code' | 'creditLimit' | 'creditDays' | '_count'> & { id?: string; creditLimit: string; creditDays: string };

const emptyForm = (types: PartyType[]): Form => ({
  name: '', types, mobile: '', altMobile: '', email: '', gstin: '', pan: '', address: '', city: '', state: '', pinCode: '', bankName: '', bankAccountNumber: '',
  ifsc: '', upiId: '', creditLimit: '', creditDays: '', tdsSection: '', isActive: true, notes: '',
});

const typeTone: Record<PartyType, 'blue' | 'green' | 'violet' | 'amber' | 'slate'> = {
  CUSTOMER: 'green', SELLER: 'amber', PARTNER: 'violet', BROKER: 'blue', AGENT: 'blue', VENDOR: 'amber', EMPLOYEE: 'slate', OTHER: 'slate',
};

/** Party master filtered to the ledger's party types, with each party's ledger balance and statement. */
export default function PartyMasterModule({ types, title }: { types: PartyType[]; title: string }) {
  const access = useFinanceWorkspaceAccess();
  const canManage = access.can(['fh.parties.manage']);
  const [query, setQuery] = useState('');
  const [submittedQuery, setSubmittedQuery] = useState('');
  const [status, setStatus] = useState<'active' | 'inactive' | 'all'>('active');
  const [page, setPage] = useState(1);
  const parties = useResource(
    async () => (await api.get('/finance-hub/parties', { params: { types: types.join(','), q: submittedQuery, status, page, pageSize: 25 } })).data as PartyList,
    `parties-${types.join(',')}-${submittedQuery}-${status}-${page}`,
  );
  const balances = useResource(async () => (await api.get('/finance-hub/parties/balances', { params: { types: types.join(',') } })).data.balances as Record<string, { receivable: number; payable: number; advances: number; net: number }>, `party-balances-${types.join(',')}`);
  const [statementFor, setStatementFor] = useState<PartyRef | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [duplicates, setDuplicates] = useState<Duplicate[]>([]);
  const [sync, setSync] = useState<SyncSummary | null>(null);
  const [busy, setBusy] = useState(false);

  const totalPages = parties.data ? Math.max(Math.ceil(parties.data.total / parties.data.pageSize), 1) : 1;

  const openEdit = async (id: string) => {
    try {
      const party = (await api.get(`/finance-hub/parties/${id}`)).data as Party;
      setDuplicates([]);
      setForm({
        id: party.id, name: party.name, types: party.types, isActive: party.isActive,
        mobile: party.mobile ?? '', altMobile: party.altMobile ?? '', email: party.email ?? '', gstin: party.gstin ?? '', pan: party.pan ?? '', address: party.address ?? '',
        city: party.city ?? '', state: party.state ?? '', pinCode: party.pinCode ?? '', bankName: party.bankName ?? '', bankAccountNumber: party.bankAccountNumber ?? '',
        ifsc: party.ifsc ?? '', upiId: party.upiId ?? '', tdsSection: party.tdsSection ?? '', notes: party.notes ?? '',
        creditLimit: party.creditLimit === null ? '' : String(party.creditLimit), creditDays: party.creditDays === null ? '' : String(party.creditDays),
      });
    } catch (error) {
      toast.error(apiErrorMessage(error, 'Could not open the party.'));
    }
  };

  const save = async (event: FormEvent | null, force = false) => {
    event?.preventDefault();
    if (!form) return;
    setBusy(true);
    try {
      const { id, ...payload } = form;
      const body = { ...payload, creditLimit: payload.creditLimit || null, creditDays: payload.creditDays || null, force };
      if (id) await api.put(`/finance-hub/parties/${id}`, body);
      else await api.post('/finance-hub/parties', body);
      toast.success('Party saved.');
      setForm(null);
      setDuplicates([]);
      parties.reload();
    } catch (error) {
      if (isConflictError(error)) setDuplicates(apiErrorDetails<{ duplicates?: Duplicate[] }>(error)?.duplicates ?? []);
      toast.error(apiErrorMessage(error, 'Could not save the party.'));
    } finally {
      setBusy(false);
    }
  };

  const runSync = async (apply: boolean) => {
    setBusy(true);
    try {
      const result = (await api.post('/finance-hub/parties/sync', { apply })).data as SyncSummary;
      setSync(result);
      if (apply) {
        toast.success(`Created ${result.newParties} parties and linked ${result.newLinks} records.`);
        parties.reload();
      }
    } catch (error) {
      toast.error(apiErrorMessage(error, 'Could not sync parties.'));
    } finally {
      setBusy(false);
    }
  };

  const toggleType = (type: PartyType) => {
    if (!form) return;
    setForm({ ...form, types: form.types.includes(type) ? form.types.filter((item) => item !== type) : [...form.types, type] });
  };

  return (
    <Panel
      title={title}
      description="Party master with ledger balances (posted entries). Dr = the party owes us, Cr = we owe the party. Open a statement for every entry."
      actions={canManage ? (
        <>
          <Button icon={<RefreshCw className="h-4 w-4" />} busy={busy && !form} onClick={() => runSync(false)}>Sync from existing records</Button>
          <Button variant="primary" icon={<UserPlus className="h-4 w-4" />} onClick={() => { setDuplicates([]); setForm(emptyForm([types[0]!])); }}>Add party</Button>
        </>
      ) : null}
    >
      {!canManage ? <ReadOnlyNotice>Adding or editing parties needs “Manage Parties”. Bank account numbers are masked.</ReadOnlyNotice> : null}
      <form onSubmit={(event) => { event.preventDefault(); setPage(1); setSubmittedQuery(query.trim()); }} className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, code, mobile, GSTIN or city…" className={`${inputClass} pl-9`} />
        </div>
        <select value={status} onChange={(event) => { setPage(1); setStatus(event.target.value as typeof status); }} className={`${inputClass} sm:w-40`} aria-label="Status">
          <option value="active">Active</option><option value="inactive">Inactive</option><option value="all">All</option>
        </select>
        <Button type="submit">Search</Button>
      </form>

      {parties.loading ? <LoadingState /> : parties.error ? <ErrorBanner message={parties.error} schemaMissing={parties.schemaMissing} /> : !parties.data?.parties.length ? (
        <EmptyState title="No parties found" description="Use “Sync from existing records” to pull partners and Sold Vehicles sellers, purchasers and brokers. Existing records are only read, never changed." />
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-left text-sm">
              <thead className={tableHeadClass}><tr><th className="px-4 py-2.5">Code</th><th className="px-4 py-2.5">Party</th><th className="px-4 py-2.5">Types</th><th className="px-4 py-2.5">Mobile</th><th className="px-4 py-2.5">GSTIN</th><th className="px-4 py-2.5">City / State</th><th className="px-4 py-2.5">Credit</th><th className="px-4 py-2.5">Linked records</th><th className="px-4 py-2.5 text-right">Balance</th><th className="px-4 py-2.5" /></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {parties.data.parties.map((party) => (
                  <tr key={party.id} className={party.isActive ? '' : 'opacity-60'}>
                    <td className={`${cellClass} font-mono text-xs`}>{party.code}</td>
                    <td className={`${cellClass} font-semibold text-slate-900`}>{party.name}</td>
                    <td className={cellClass}><div className="flex flex-wrap gap-1">{party.types.map((type) => <Badge key={type} tone={typeTone[type]}>{enumLabel(type)}</Badge>)}</div></td>
                    <td className={`${cellClass} font-mono text-xs`}>{party.mobile ?? '—'}</td>
                    <td className={`${cellClass} font-mono text-xs`}>{party.gstin ?? '—'}</td>
                    <td className={`${cellClass} text-xs`}>{[party.city, party.state].filter(Boolean).join(', ') || '—'}</td>
                    <td className={`${cellClass} text-xs`}>{party.creditDays !== null ? `${party.creditDays} days` : '—'}{party.creditLimit !== null ? <span className="block text-slate-400">{formatInr(party.creditLimit)}</span> : null}</td>
                    <td className={cellClass}>{party._count?.links ?? 0}</td>
                    <td className={`${cellClass} whitespace-nowrap text-right font-semibold`}>{balances.data?.[party.id] ? drCrAmount(balances.data[party.id]!.net) : '—'}</td>
                    <td className={`${cellClass} whitespace-nowrap text-right`}><Button variant="ghost" onClick={() => setStatementFor(party)}>Statement</Button><Button variant="ghost" onClick={() => openEdit(party.id)}>{canManage ? 'Edit' : 'View'}</Button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-xs text-slate-500">
            <span>{parties.data.total} parties</span>
            <span className="flex items-center gap-2">
              <Button variant="ghost" disabled={page <= 1} onClick={() => setPage(page - 1)} icon={<ChevronLeft className="h-4 w-4" />}>Prev</Button>
              Page {page} of {totalPages}
              <Button variant="ghost" disabled={page >= totalPages} onClick={() => setPage(page + 1)} icon={<ChevronRight className="h-4 w-4" />}>Next</Button>
            </span>
          </div>
        </>
      )}

      {statementFor ? <PartyStatementModal party={statementFor} onClose={() => setStatementFor(null)} /> : null}
      {form ? (
        <Modal title={form.id ? `Party: ${form.name}` : 'Add party'} subtitle="GSTIN fills PAN and state automatically." onClose={() => { if (!busy) setForm(null); }} wide>
          <form onSubmit={(event) => save(event)} className="p-5 sm:p-7">
            <fieldset disabled={!canManage}>
              <div className="mb-4 flex flex-wrap gap-2">
                {PARTY_TYPES.map((type) => (
                  <button key={type} type="button" onClick={() => toggleType(type)} className={`rounded-full border px-3 py-1 text-xs font-bold transition ${form.types.includes(type) ? 'border-amber-300 bg-amber-50 text-slate-900' : 'border-slate-200 text-slate-500 hover:bg-slate-50'}`}>{enumLabel(type)}</button>
                ))}
              </div>
              <div className="grid gap-4 md:grid-cols-3">
                <Field label="Name *" wide><input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} className={inputClass} maxLength={160} required /></Field>
                <Field label="Mobile"><input value={form.mobile ?? ''} onChange={(event) => setForm({ ...form, mobile: event.target.value })} className={inputClass} maxLength={15} inputMode="tel" /></Field>
                <Field label="Alternate mobile"><input value={form.altMobile ?? ''} onChange={(event) => setForm({ ...form, altMobile: event.target.value })} className={inputClass} maxLength={15} inputMode="tel" /></Field>
                <Field label="Email"><input type="email" value={form.email ?? ''} onChange={(event) => setForm({ ...form, email: event.target.value })} className={inputClass} maxLength={160} /></Field>
                <Field label="GSTIN"><input value={form.gstin ?? ''} onChange={(event) => setForm({ ...form, gstin: event.target.value.toUpperCase() })} className={`${inputClass} font-mono uppercase`} maxLength={15} /></Field>
                <Field label="PAN"><input value={form.pan ?? ''} onChange={(event) => setForm({ ...form, pan: event.target.value.toUpperCase() })} className={`${inputClass} font-mono uppercase`} maxLength={10} /></Field>
                <Field label="City"><input value={form.city ?? ''} onChange={(event) => setForm({ ...form, city: event.target.value })} className={inputClass} maxLength={80} /></Field>
                <Field label="State"><input value={form.state ?? ''} onChange={(event) => setForm({ ...form, state: event.target.value })} className={inputClass} maxLength={80} /></Field>
                <Field label="PIN code"><input value={form.pinCode ?? ''} onChange={(event) => setForm({ ...form, pinCode: event.target.value.replace(/\D/g, '') })} className={inputClass} maxLength={6} /></Field>
                <Field label="Address" wide><input value={form.address ?? ''} onChange={(event) => setForm({ ...form, address: event.target.value })} className={inputClass} maxLength={500} /></Field>
                <Field label="Bank name"><input value={form.bankName ?? ''} onChange={(event) => setForm({ ...form, bankName: event.target.value })} className={inputClass} maxLength={100} /></Field>
                <Field label="Bank account no."><input value={form.bankAccountNumber ?? ''} onChange={(event) => setForm({ ...form, bankAccountNumber: event.target.value.toUpperCase() })} className={`${inputClass} font-mono`} maxLength={34} /></Field>
                <Field label="IFSC"><input value={form.ifsc ?? ''} onChange={(event) => setForm({ ...form, ifsc: event.target.value.toUpperCase() })} className={`${inputClass} font-mono uppercase`} maxLength={11} /></Field>
                <Field label="UPI ID"><input value={form.upiId ?? ''} onChange={(event) => setForm({ ...form, upiId: event.target.value })} className={inputClass} maxLength={80} /></Field>
                <Field label="Credit days"><input type="number" min={0} max={365} value={form.creditDays} onChange={(event) => setForm({ ...form, creditDays: event.target.value })} className={inputClass} /></Field>
                <Field label="Credit limit"><input type="number" min={0} step="0.01" value={form.creditLimit} onChange={(event) => setForm({ ...form, creditLimit: event.target.value })} className={inputClass} /></Field>
                <Field label="TDS section" hint="e.g. 194C for transporters"><input value={form.tdsSection ?? ''} onChange={(event) => setForm({ ...form, tdsSection: event.target.value.toUpperCase() })} className={inputClass} maxLength={10} /></Field>
                <Field label="Notes" wide><input value={form.notes ?? ''} onChange={(event) => setForm({ ...form, notes: event.target.value })} className={inputClass} maxLength={1000} /></Field>
                {form.id ? <div className="flex items-end pb-2"><Toggle checked={form.isActive} onChange={(value) => setForm({ ...form, isActive: value })} label="Active" /></div> : null}
              </div>
            </fieldset>
            {duplicates.length ? (
              <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                <p className="font-bold">Possible duplicates</p>
                {duplicates.map((item) => <p key={item.id}>{item.code} · {item.name} · {item.mobile ?? ''} {item.gstin ?? ''}</p>)}
              </div>
            ) : null}
            <ModalFooter>
              <Button onClick={() => setForm(null)} disabled={busy}>{canManage ? 'Cancel' : 'Close'}</Button>
              {canManage && duplicates.length ? <Button variant="danger" busy={busy} onClick={() => save(null, true)}>Save anyway</Button> : null}
              {canManage ? <Button type="submit" variant="primary" busy={busy} disabled={!form.types.length}>Save party</Button> : null}
            </ModalFooter>
          </form>
        </Modal>
      ) : null}

      {sync ? (
        <Modal title={sync.apply ? 'Parties synced' : 'Sync preview'} subtitle="Reads partners and Sold Vehicles sellers, purchasers and brokers. Matches by GSTIN, then mobile. Source records are never changed." onClose={() => { if (!busy) setSync(null); }}>
          <div className="p-5 sm:p-7">
            <div className="grid gap-3 sm:grid-cols-3">
              {[['Records read', sync.candidates], ['New parties', sync.newParties], ['Existing parties updated', sync.updatedParties], ['New links', sync.newLinks], ['Already linked', sync.alreadyLinked], ['Name-only matches', sync.nameOnlyMatches]].map(([label, value]) => (
                <div key={String(label)} className="rounded-xl bg-slate-50 p-3"><p className="text-[11px] uppercase tracking-wide text-slate-500">{label}</p><p className="text-xl font-bold text-slate-900">{value}</p></div>
              ))}
            </div>
            {sync.nameOnlyMatches ? <p className="mt-3 text-xs text-amber-700">Name-only matches have no mobile or GSTIN — review those parties after syncing.</p> : null}
            {!sync.apply && sync.sample.length ? (
              <div className="mt-4 max-h-48 overflow-y-auto rounded-xl border border-slate-200 text-xs">
                {sync.sample.map((item) => <p key={`${item.name}-${item.mobile}`} className="border-b border-slate-100 px-3 py-2">{item.name} · {item.mobile ?? 'no mobile'} · {item.types.map(enumLabel).join(', ')} · {item.records} record(s)</p>)}
              </div>
            ) : null}
            <ModalFooter>
              <Button onClick={() => setSync(null)} disabled={busy}>Close</Button>
              {!sync.apply && (sync.newParties || sync.updatedParties) ? <Button variant="primary" busy={busy} onClick={() => runSync(true)}>Create & link now</Button> : null}
            </ModalFooter>
          </div>
        </Modal>
      ) : null}
    </Panel>
  );
}
