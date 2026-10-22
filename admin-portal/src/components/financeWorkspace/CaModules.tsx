'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Archive, Download, ExternalLink, FileUp, Plus, Upload } from 'lucide-react';
import { toast } from 'react-toastify';
import api from '@/lib/api';
import { uploadFileToServer } from '@/lib/fileUpload';
import { apiErrorMessage, enumLabel, formatDate, formatInr, useFinanceWorkspaceAccess } from '@/lib/financeWorkspaceClient';
import { createSecureDocumentPreviewUrl } from '@/lib/secureDownload';
import { todayIso } from './ledgerLookups';
import { AlertsPanel } from './ReportModules';
import { Badge, Button, cellClass, EmptyState, ErrorBanner, Field, inputClass, LoadingState, Modal, ModalFooter, Panel, ReadOnlyNotice, Tabs, tableHeadClass } from './ui';
import { useResource } from './useResource';
import VoucherDetail from './VoucherDetail';

type Year = { id: string; label: string; status: string; isCurrent: boolean; periods: Array<{ id: string; label: string; status: 'OPEN' | 'SOFT_CLOSED' | 'LOCKED'; startDate: string; endDate: string }> };
const useYears = () => useResource(async () => (await api.get('/finance-hub/financial-years')).data.years as Year[], 'ca-years');
const periodTone = { OPEN: 'amber', SOFT_CLOSED: 'blue', LOCKED: 'green' } as const;
const useModuleHref = () => {
  const pathname = usePathname();
  return (key: string) => `${pathname}?module=${key}`;
};
const fyStart = () => {
  const today = todayIso();
  return `${Number(today.slice(0, 4)) - (Number(today.slice(5, 7)) < 4 ? 1 : 0)}-04-01`;
};
const saveFile = (fileName: string, content: string, type: string) => {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
};

/** Simple CSV parser (quoted cells, header row) returning objects keyed by lower-case header. */
const parseCsv = (text: string) => {
  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  const split = (line: string) => {
    const cells: string[] = [];
    let current = '';
    let quoted = false;
    for (const char of line) {
      if (char === '"') quoted = !quoted;
      else if (char === ',' && !quoted) { cells.push(current.trim()); current = ''; }
      else current += char;
    }
    cells.push(current.trim());
    return cells;
  };
  const header = split(lines.shift() ?? '').map((cell) => cell.toLowerCase().replace(/[^a-z]/g, ''));
  return lines.map((line) => Object.fromEntries(split(line).map((cell, index) => [header[index] ?? `col${index}`, cell])));
};

type CaDashboard = { year: { label: string; status: string } | null; months: Array<{ id: string; label: string; status: 'OPEN' | 'SOFT_CLOSED' | 'LOCKED'; signedOff: boolean; past: boolean }>; queries: { open: number; overdue: number }; documents: number; reviews: Record<string, number>; recent: Array<{ id: string; entityType: string; action: string; createdAt: string; actor: string | null }> };

/** Closing progress, open queries, review status, documents and recent activity for the CA. */
export function CaDashboardModule() {
  const href = useModuleHref();
  const data = useResource(async () => (await api.get('/finance-hub/ca/dashboard')).data as CaDashboard, 'ca-dashboard');
  const d = data.data;
  return (
    <div className="space-y-4">
      <Panel title="CA dashboard" description={d?.year ? `Financial year ${d.year.label} (${enumLabel(d.year.status)}).` : 'Closing progress and audit activity.'}>
        {data.loading ? <LoadingState /> : data.error || !d ? <ErrorBanner message={data.error || 'Could not load.'} schemaMissing={data.schemaMissing} /> : (
          <>
            <div className="grid gap-3 p-4 sm:grid-cols-4">
              <Link href={href('ca-queries-checklist')} className="rounded-xl bg-slate-50 p-3 hover:bg-amber-50"><p className="text-[11px] uppercase tracking-wide text-slate-500">Open queries</p><p className="text-lg font-bold">{d.queries.open}</p>{d.queries.overdue ? <p className="text-[11px] font-semibold text-red-700">{d.queries.overdue} overdue</p> : null}</Link>
              <Link href={href('accounting-review')} className="rounded-xl bg-slate-50 p-3 hover:bg-amber-50"><p className="text-[11px] uppercase tracking-wide text-slate-500">Reviewed / flagged</p><p className="text-lg font-bold">{d.reviews.REVIEWED ?? 0} / {d.reviews.FLAGGED ?? 0}</p></Link>
              <Link href={href('document-vault')} className="rounded-xl bg-slate-50 p-3 hover:bg-amber-50"><p className="text-[11px] uppercase tracking-wide text-slate-500">Documents</p><p className="text-lg font-bold">{d.documents}</p></Link>
              <Link href={href('monthly-closing')} className="rounded-xl bg-slate-50 p-3 hover:bg-amber-50"><p className="text-[11px] uppercase tracking-wide text-slate-500">Months closed</p><p className="text-lg font-bold">{d.months.filter((month) => month.status !== 'OPEN').length} / {d.months.length}</p></Link>
            </div>
            <div className="grid grid-cols-3 gap-2 px-4 pb-4 sm:grid-cols-6 lg:grid-cols-12">
              {d.months.map((month) => <div key={month.id} className={`rounded-lg border p-2 text-center text-xs ${month.past && month.status === 'OPEN' ? 'border-amber-300 bg-amber-50' : 'border-slate-200'}`}><p className="font-semibold">{month.label}</p><Badge tone={periodTone[month.status]}>{enumLabel(month.status)}</Badge>{month.signedOff ? <p className="mt-1 text-[10px] text-emerald-700">Signed off</p> : null}</div>)}
            </div>
          </>
        )}
      </Panel>
      <AlertsPanel />
      {d?.recent.length ? (
        <Panel title="Recent activity">
          <ul className="divide-y divide-slate-100 text-sm">{d.recent.map((item) => <li key={item.id} className="flex justify-between gap-3 px-4 py-2"><span>{enumLabel(item.action)} · {item.entityType.replace(/^Fin/, '')}</span><span className="text-xs text-slate-500">{item.actor ?? 'System'} · {new Date(item.createdAt).toLocaleString('en-IN')}</span></li>)}</ul>
        </Panel>
      ) : null}
    </div>
  );
}

type VaultDocument = { id: string; title: string; category: string; financialYear: string | null; period: string | null; fileUrl: string; fileName: string | null; version: number; previousId: string | null; tags: string[]; notes: string | null; isArchived: boolean; expiresAt: string | null; expired: boolean; uploadedBy: string | null; createdAt: string };
const CATEGORIES = ['GST_RETURN', 'TDS_RETURN', 'INCOME_TAX', 'BANK_STATEMENT', 'AUDIT_REPORT', 'BOARD_DOCUMENT', 'AGREEMENT', 'INVOICE', 'BILL', 'PAYROLL', 'ASSET', 'LICENCE', 'OTHER'];

const openDocument = async (document: VaultDocument) => {
  try {
    const url = /\/uploads\//.test(document.fileUrl) ? await createSecureDocumentPreviewUrl(document.fileUrl, document.fileName ?? document.title) : document.fileUrl;
    window.open(url, '_blank', 'noopener');
  } catch (error) {
    toast.error(apiErrorMessage(error, 'Could not open the document.'));
  }
};

/** Returns, statements, agreements and audit papers with versions and expiry. */
export function DocumentVaultModule() {
  const access = useFinanceWorkspaceAccess();
  const canAdd = access.can(['fh.ca.manage', 'fh.books.manage', 'fh.settings.manage', 'fh.tax.manage', 'fh.payroll.manage']);
  const canArchive = access.can(['fh.ca.manage', 'fh.settings.manage']);
  const [filters, setFilters] = useState({ category: '', financialYear: '', q: '', archived: false });
  const [version, setVersion] = useState(0);
  const list = useResource(async () => (await api.get('/finance-hub/ca/vault', { params: { ...filters, archived: filters.archived ? 'true' : undefined, category: filters.category || undefined, financialYear: filters.financialYear || undefined, q: filters.q || undefined } })).data.documents as VaultDocument[], `vault-${JSON.stringify(filters)}-${version}`);
  const [form, setForm] = useState<{ title: string; category: string; financialYear: string; period: string; link: string; file: File | null; expiresAt: string; tags: string; notes: string; previousId: string | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!form) return;
    setBusy(true);
    try {
      let file = { fileUrl: form.link, fileName: null as string | null, mimeType: null as string | null, size: null as number | null };
      if (form.file) {
        const uploaded = await uploadFileToServer({ file: form.file, visibility: 'secure' });
        file = { fileUrl: uploaded.fileUrl, fileName: uploaded.originalName, mimeType: uploaded.mimeType, size: uploaded.size };
      }
      await api.post('/finance-hub/ca/vault', { ...form, ...file, tags: form.tags.split(',').map((tag) => tag.trim()).filter(Boolean), expiresAt: form.expiresAt || null, period: form.period || null, financialYear: form.financialYear || null });
      toast.success(form.previousId ? 'New version saved; the old one is archived.' : 'Document saved.');
      setForm(null);
      setVersion((value) => value + 1);
    } catch (error) {
      toast.error(apiErrorMessage(error, 'Could not save the document.'));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Panel title="Document vault" description="Keep returns, challans, statements, agreements and audit papers in one place. Files are stored privately; replacing a file keeps the earlier version in the archive." actions={canAdd ? <Button variant="primary" icon={<FileUp className="h-4 w-4" />} onClick={() => setForm({ title: '', category: 'OTHER', financialYear: '', period: '', link: '', file: null, expiresAt: '', tags: '', notes: '', previousId: null })}>Add document</Button> : null}>
      <div className="grid gap-3 border-b border-slate-100 p-4 md:grid-cols-[1fr_200px_140px_auto]">
        <input value={filters.q} onChange={(event) => setFilters({ ...filters, q: event.target.value })} className={inputClass} placeholder="Search title, file or tag" />
        <select value={filters.category} onChange={(event) => setFilters({ ...filters, category: event.target.value })} className={inputClass}><option value="">All categories</option>{CATEGORIES.map((item) => <option key={item} value={item}>{enumLabel(item)}</option>)}</select>
        <input value={filters.financialYear} onChange={(event) => setFilters({ ...filters, financialYear: event.target.value })} className={inputClass} placeholder="FY e.g. 2026-27" />
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={filters.archived} onChange={(event) => setFilters({ ...filters, archived: event.target.checked })} className="h-4 w-4 accent-amber-500" />Archive</label>
      </div>
      {list.loading ? <LoadingState /> : list.error ? <ErrorBanner message={list.error} schemaMissing={list.schemaMissing} /> : !list.data?.length ? <EmptyState title="No documents" /> : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className={tableHeadClass}><tr><th className="px-4 py-2.5">Document</th><th className="px-4 py-2.5">Category</th><th className="px-4 py-2.5">Year / period</th><th className="px-4 py-2.5">Added</th><th className="px-4 py-2.5" /></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {list.data.map((doc) => (
                <tr key={doc.id}>
                  <td className={cellClass}><span className="font-semibold">{doc.title}</span>{doc.version > 1 ? <Badge tone="violet">v{doc.version}</Badge> : null}{doc.expired ? <Badge tone="red">Expired</Badge> : doc.expiresAt ? <span className="block text-[11px] text-slate-500">Valid till {formatDate(doc.expiresAt)}</span> : null}<span className="block text-xs text-slate-400">{doc.fileName ?? doc.fileUrl}{doc.tags.length ? ` · ${doc.tags.join(', ')}` : ''}</span></td>
                  <td className={`${cellClass} text-xs`}>{enumLabel(doc.category)}</td>
                  <td className={`${cellClass} text-xs`}>{doc.financialYear ?? '—'}{doc.period ? ` · ${doc.period}` : ''}</td>
                  <td className={`${cellClass} text-xs`}>{formatDate(doc.createdAt)}<span className="block text-slate-400">{doc.uploadedBy ?? ''}</span></td>
                  <td className={`${cellClass} whitespace-nowrap text-right`}>
                    <Button variant="ghost" icon={<ExternalLink className="h-4 w-4" />} onClick={() => void openDocument(doc)}>Open</Button>
                    {canAdd && !doc.isArchived ? <Button variant="ghost" onClick={() => setForm({ title: doc.title, category: doc.category, financialYear: doc.financialYear ?? '', period: doc.period ?? '', link: '', file: null, expiresAt: doc.expiresAt ?? '', tags: doc.tags.join(', '), notes: doc.notes ?? '', previousId: doc.id })}>New version</Button> : null}
                    {canArchive ? <Button variant="ghost" icon={<Archive className="h-4 w-4" />} onClick={() => void api.post(`/finance-hub/ca/vault/${doc.id}/archive`).then(() => setVersion((value) => value + 1))}>{doc.isArchived ? 'Restore' : 'Archive'}</Button> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {form ? (
        <Modal title={form.previousId ? 'Upload a new version' : 'Add document'} onClose={() => { if (!busy) setForm(null); }}>
          <form onSubmit={save} className="p-5 sm:p-7">
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Title *" wide><input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} className={inputClass} maxLength={200} required /></Field>
              <Field label="Category"><select value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })} className={inputClass}>{CATEGORIES.map((item) => <option key={item} value={item}>{enumLabel(item)}</option>)}</select></Field>
              <Field label="Financial year"><input value={form.financialYear} onChange={(event) => setForm({ ...form, financialYear: event.target.value })} className={inputClass} placeholder="2026-27" maxLength={20} /></Field>
              <Field label="Month"><input type="month" value={form.period} onChange={(event) => setForm({ ...form, period: event.target.value })} className={inputClass} /></Field>
              <Field label="Valid till"><input type="date" value={form.expiresAt} onChange={(event) => setForm({ ...form, expiresAt: event.target.value })} className={inputClass} /></Field>
              <Field label="File (PDF / image, up to 5 MB)" wide><input type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx" onChange={(event) => setForm({ ...form, file: event.target.files?.[0] ?? null })} className="block w-full text-sm" /></Field>
              <Field label="…or a link" wide hint="Google Drive / portal link if the file is stored elsewhere."><input value={form.link} onChange={(event) => setForm({ ...form, link: event.target.value })} className={inputClass} placeholder="https://" maxLength={1000} /></Field>
              <Field label="Tags" wide hint="Comma separated"><input value={form.tags} onChange={(event) => setForm({ ...form, tags: event.target.value })} className={inputClass} /></Field>
              <Field label="Notes" wide><input value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} className={inputClass} maxLength={1000} /></Field>
            </div>
            <ModalFooter><Button onClick={() => setForm(null)} disabled={busy}>Cancel</Button><Button type="submit" variant="primary" busy={busy} disabled={!form.title || (!form.file && !form.link)}>Save</Button></ModalFooter>
          </form>
        </Modal>
      ) : null}
    </Panel>
  );
}

type MonthClose = { period: { id: string; label: string; status: 'OPEN' | 'SOFT_CLOSED' | 'LOCKED'; startDate: string; endDate: string; year: string }; checks: Array<{ key: string; label: string; ok: boolean; detail: string; module: string }>; items: Array<{ key: string; label: string; done: boolean; doneBy: string | null; doneAt: string | null; note: string | null }>; signedOff: { at: string; by: string | null } | null; notes: string | null };

/** Month-end: automatic checks, manual checklist, sign-off, then soft-close and lock. */
export function MonthlyClosingModule() {
  const access = useFinanceWorkspaceAccess();
  const canClose = access.can(['fh.period.lock', 'fh.ca.manage']);
  const canLock = access.can(['fh.period.lock']);
  const href = useModuleHref();
  const years = useYears();
  const [periodId, setPeriodId] = useState('');
  const allPeriods = (years.data ?? []).flatMap((year) => year.periods.map((period) => ({ ...period, year: year.label })));
  const defaultPeriod = allPeriods.filter((period) => period.endDate.slice(0, 10) < todayIso()).sort((a, b) => b.endDate.localeCompare(a.endDate))[0] ?? allPeriods[0];
  const chosen = periodId || defaultPeriod?.id || '';
  const [version, setVersion] = useState(0);
  const data = useResource(async () => (chosen ? (await api.get(`/finance-hub/ca/monthly-close/${chosen}`)).data as MonthClose : null), `month-close-${chosen}-${version}`);
  const [busy, setBusy] = useState(false);
  const act = async (action: () => Promise<unknown>, success: string) => {
    setBusy(true);
    try {
      await action();
      toast.success(success);
      setVersion((value) => value + 1);
      years.reload();
    } catch (error) {
      toast.error(apiErrorMessage(error, 'Action failed.'));
    } finally {
      setBusy(false);
    }
  };
  const close = data.data;
  const toggle = (key: string, done: boolean) => close && void act(() => api.put(`/finance-hub/ca/monthly-close/${close.period.id}`, { items: [{ key, done }] }), done ? 'Ticked.' : 'Unticked.');
  return (
    <Panel title="Monthly closing" description="Work through the checks, tick the checklist, sign off, then soft-close the month (only period managers can post into it) and lock it once the CA agrees.">
      <div className="border-b border-slate-100 p-4"><Field label="Month"><select value={chosen} onChange={(event) => setPeriodId(event.target.value)} className={`${inputClass} max-w-xs`}>{allPeriods.map((period) => <option key={period.id} value={period.id}>{period.label} ({period.year}) · {enumLabel(period.status)}</option>)}</select></Field></div>
      {data.loading || years.loading ? <LoadingState /> : data.error || !close ? <ErrorBanner message={data.error || 'Choose a month.'} schemaMissing={data.schemaMissing} /> : (
        <div className="grid gap-4 p-4 lg:grid-cols-2">
          <div className="rounded-xl border border-slate-200">
            <p className="px-4 pt-3 text-sm font-semibold">Automatic checks</p>
            <ul className="divide-y divide-slate-100">{close.checks.map((check) => <li key={check.key}><Link href={href(check.module)} className="flex items-center justify-between gap-3 px-4 py-2 text-sm hover:bg-amber-50/40"><span>{check.label}</span><Badge tone={check.ok ? 'green' : 'amber'}>{check.ok ? 'OK' : check.detail}</Badge></Link></li>)}</ul>
          </div>
          <div className="rounded-xl border border-slate-200">
            <p className="px-4 pt-3 text-sm font-semibold">Checklist</p>
            <ul className="divide-y divide-slate-100">{close.items.map((item) => <li key={item.key} className="flex items-start gap-3 px-4 py-2 text-sm"><input type="checkbox" checked={item.done} disabled={!canClose || busy || Boolean(close.signedOff)} onChange={(event) => toggle(item.key, event.target.checked)} className="mt-0.5 h-4 w-4 accent-amber-500" /><span className="flex-1">{item.label}{item.done ? <span className="block text-[11px] text-slate-500">{item.doneBy ?? ''} · {item.doneAt ? new Date(item.doneAt).toLocaleDateString('en-IN') : ''}</span> : null}</span></li>)}</ul>
            <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 p-4">
              <Badge tone={periodTone[close.period.status]}>{enumLabel(close.period.status)}</Badge>
              {close.signedOff ? <span className="text-xs text-emerald-700">Signed off by {close.signedOff.by ?? '—'} on {new Date(close.signedOff.at).toLocaleDateString('en-IN')}</span> : null}
              <span className="flex-1" />
              {canClose && !close.signedOff ? <Button variant="primary" busy={busy} disabled={close.items.some((item) => !item.done)} onClick={() => void act(() => api.put(`/finance-hub/ca/monthly-close/${close.period.id}`, { signOff: true }), 'Signed off.')}>Sign off</Button> : null}
              {canClose && close.signedOff && close.period.status === 'OPEN' ? <Button busy={busy} onClick={() => void act(() => api.put(`/finance-hub/ca/monthly-close/${close.period.id}`, { signOff: false }), 'Sign-off removed.')}>Undo sign-off</Button> : null}
              {canLock && close.period.status === 'OPEN' ? <Button busy={busy} onClick={() => void act(() => api.patch(`/finance-hub/periods/${close.period.id}/status`, { status: 'SOFT_CLOSED' }), 'Month soft-closed.')}>Soft-close</Button> : null}
              {canLock && close.period.status === 'SOFT_CLOSED' ? <><Button busy={busy} onClick={() => void act(() => api.patch(`/finance-hub/periods/${close.period.id}/status`, { status: 'OPEN', reason: window.prompt('Reason for reopening:') ?? '' }), 'Month reopened.')}>Reopen</Button><Button variant="primary" busy={busy} onClick={() => { if (window.confirm('Lock the month? Nobody can post into a locked month.')) void act(() => api.patch(`/finance-hub/periods/${close.period.id}/status`, { status: 'LOCKED' }), 'Month locked.'); }}>Lock</Button></> : null}
            </div>
          </div>
          {!canClose ? <ReadOnlyNotice>Signing off and closing months needs “Lock Periods” or “Manage CA Workspace”.</ReadOnlyNotice> : null}
        </div>
      )}
    </Panel>
  );
}

type YearClose = { year: { id: string; label: string; startDate: string; endDate: string; status: string }; periods: Array<{ id: string; label: string; status: 'OPEN' | 'SOFT_CLOSED' | 'LOCKED' }>; profit: number; gates: Array<{ key: string; label: string; ok: boolean; detail: string }>; close: { at: string; profit: number; voucher: { id: string; number: string | null } | null } | null };

/** Year-end close: gates, transfer of profit to retained earnings, reopen by reversal. */
export function YearClosingModule() {
  const access = useFinanceWorkspaceAccess();
  const canClose = access.can(['fh.period.lock']);
  const years = useYears();
  const [yearId, setYearId] = useState('');
  const chosen = yearId || years.data?.find((year) => !year.isCurrent)?.id || years.data?.[0]?.id || '';
  const [version, setVersion] = useState(0);
  const data = useResource(async () => (chosen ? (await api.get(`/finance-hub/ca/year-close/${chosen}`)).data as YearClose : null), `year-close-${chosen}-${version}`);
  const [busy, setBusy] = useState(false);
  const [openVoucher, setOpenVoucher] = useState<string | null>(null);
  const act = async (action: () => Promise<{ data: { number?: string } }>, success: string) => {
    setBusy(true);
    try {
      const result = await action();
      toast.success(result.data.number ? `${success} ${result.data.number}.` : success);
      setVersion((value) => value + 1);
    } catch (error) {
      toast.error(apiErrorMessage(error, 'Action failed.'));
    } finally {
      setBusy(false);
    }
  };
  const y = data.data;
  return (
    <Panel title="Financial year closing" description="After every month is soft-closed and the accounts are final: close the year to move its profit to Retained Earnings and start the next year's profit & loss at zero. Balance-sheet ledgers carry forward automatically.">
      <div className="border-b border-slate-100 p-4"><Field label="Financial year"><select value={chosen} onChange={(event) => setYearId(event.target.value)} className={`${inputClass} max-w-xs`}>{(years.data ?? []).map((year) => <option key={year.id} value={year.id}>{year.label}{year.isCurrent ? ' (current)' : ''}</option>)}</select></Field></div>
      {data.loading ? <LoadingState /> : data.error || !y ? <ErrorBanner message={data.error || 'Choose a year.'} schemaMissing={data.schemaMissing} /> : (
        <div className="grid gap-4 p-4 lg:grid-cols-2">
          <div className="rounded-xl border border-slate-200 p-4">
            <p className="text-sm font-semibold">Profit for {y.year.label}</p>
            <p className={`text-2xl font-bold ${y.profit < 0 ? 'text-red-700' : ''}`}>{formatInr(y.profit)}</p>
            <ul className="mt-3 space-y-2 text-sm">{y.gates.map((gate) => <li key={gate.key} className="flex justify-between gap-3"><span>{gate.label}</span><Badge tone={gate.ok ? 'green' : 'amber'}>{gate.ok ? 'OK' : gate.detail}</Badge></li>)}</ul>
          </div>
          <div className="rounded-xl border border-slate-200 p-4">
            {y.close ? (
              <>
                <Badge tone="green">Closed {new Date(y.close.at).toLocaleDateString('en-IN')}</Badge>
                <p className="mt-2 text-sm">{formatInr(y.close.profit)} transferred to Retained Earnings by {y.close.voucher ? <button type="button" onClick={() => setOpenVoucher(y.close!.voucher!.id)} className="font-mono text-blue-700 hover:underline">{y.close.voucher.number}</button> : 'the closing journal'}.</p>
                {canClose ? <div className="mt-4"><Button variant="danger" busy={busy} onClick={() => { const reason = window.prompt('Reason for reopening the year (the closing journal will be reversed):'); if (reason?.trim()) void act(() => api.post(`/finance-hub/ca/year-close/${y.year.id}/reopen`, { reason }), 'Year reopened.'); }}>Reopen year</Button></div> : null}
              </>
            ) : (
              <>
                <p className="text-sm text-slate-600">Closing posts one journal dated {formatDate(y.year.endDate)}: every income and expense ledger is reversed into Retained Earnings. Lock March afterwards.</p>
                {canClose ? <div className="mt-4"><Button variant="primary" busy={busy} disabled={y.gates.some((gate) => !gate.ok)} onClick={() => { if (window.confirm(`Close ${y.year.label} and transfer ${formatInr(y.profit)} to Retained Earnings?`)) void act(() => api.post(`/finance-hub/ca/year-close/${y.year.id}`), 'Year closed:'); }}>Close the year</Button></div> : <ReadOnlyNotice>Closing the year needs “Lock Periods”.</ReadOnlyNotice>}
              </>
            )}
          </div>
        </div>
      )}
      {openVoucher ? <VoucherDetail key={openVoucher} voucherId={openVoucher} onClose={() => setOpenVoucher(null)} onChanged={() => setVersion((value) => value + 1)} onOpen={setOpenVoucher} onEdit={() => setOpenVoucher(null)} /> : null}
    </Panel>
  );
}

type Query = { id: string; title: string; description: string; category: string | null; priority: string; status: 'OPEN' | 'ANSWERED' | 'CLOSED'; dueDate: string | null; overdue: boolean; raisedBy: string | null; assignedTo: string | null; entityType: string | null; entityId: string | null; responses: Array<{ byName: string | null; at: string; text: string; fileUrl: string | null }>; createdAt: string };
const queryTone = { OPEN: 'amber', ANSWERED: 'blue', CLOSED: 'green' } as const;

/** CA / auditor questions with replies and evidence links. */
export function CaQueriesModule() {
  const access = useFinanceWorkspaceAccess();
  const canWrite = access.can(['fh.ca.manage', 'fh.ca.query', 'fh.books.manage', 'fh.period.lock']);
  const canClose = access.can(['fh.ca.manage', 'fh.ca.query']);
  const [status, setStatus] = useState('');
  const [version, setVersion] = useState(0);
  const list = useResource(async () => (await api.get('/finance-hub/ca/queries', { params: { status: status || undefined } })).data.queries as Query[], `queries-${status}-${version}`);
  const [form, setForm] = useState<{ title: string; description: string; category: string; priority: string; dueDate: string } | null>(null);
  const [replying, setReplying] = useState<Query | null>(null);
  const [reply, setReply] = useState({ text: '', fileUrl: '' });
  const [busy, setBusy] = useState(false);
  const [openVoucher, setOpenVoucher] = useState<string | null>(null);
  const act = async (action: () => Promise<unknown>, success: string) => {
    setBusy(true);
    try {
      await action();
      toast.success(success);
      setVersion((value) => value + 1);
      return true;
    } catch (error) {
      toast.error(apiErrorMessage(error, 'Action failed.'));
      return false;
    } finally {
      setBusy(false);
    }
  };
  return (
    <Panel title="CA queries & checklist" description="Questions from the CA or auditor, the replies with evidence, and their status. Flags from Accounting Review arrive here linked to the voucher." actions={canWrite ? <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => setForm({ title: '', description: '', category: '', priority: 'NORMAL', dueDate: '' })}>Raise query</Button> : null}>
      <div className="border-b border-slate-100 p-4"><select value={status} onChange={(event) => setStatus(event.target.value)} className={`${inputClass} max-w-xs`}><option value="">All queries</option>{(['OPEN', 'ANSWERED', 'CLOSED'] as const).map((item) => <option key={item} value={item}>{enumLabel(item)}</option>)}</select></div>
      {list.loading ? <LoadingState /> : list.error ? <ErrorBanner message={list.error} schemaMissing={list.schemaMissing} /> : !list.data?.length ? <EmptyState title="No queries" /> : (
        <ul className="divide-y divide-slate-100">
          {list.data.map((item) => (
            <li key={item.id} className="p-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={queryTone[item.status]}>{enumLabel(item.status)}</Badge>
                {item.priority === 'HIGH' ? <Badge tone="red">High</Badge> : null}
                {item.overdue ? <Badge tone="red">Overdue</Badge> : null}
                <span className="font-semibold">{item.title}</span>
                <span className="ml-auto text-xs text-slate-500">{item.raisedBy ?? '—'} · {formatDate(item.createdAt)}{item.dueDate ? ` · due ${formatDate(item.dueDate)}` : ''}</span>
              </div>
              <p className="mt-1 whitespace-pre-line text-sm text-slate-700">{item.description}</p>
              {item.entityType === 'FinVoucher' && item.entityId ? <button type="button" onClick={() => setOpenVoucher(item.entityId)} className="mt-1 text-xs font-semibold text-blue-700 hover:underline">Open the voucher</button> : null}
              {item.responses.length ? <ul className="mt-2 space-y-1 border-l-2 border-slate-200 pl-3">{item.responses.map((response, index) => <li key={index} className="text-sm"><span className="text-xs text-slate-500">{response.byName ?? '—'} · {new Date(response.at).toLocaleString('en-IN')}</span><p className="whitespace-pre-line">{response.text}</p>{response.fileUrl ? <a href={response.fileUrl} target="_blank" rel="noreferrer" className="text-xs text-blue-700 hover:underline">evidence</a> : null}</li>)}</ul> : null}
              <div className="mt-2 flex gap-2">
                {item.status !== 'CLOSED' && canWrite ? <Button variant="ghost" onClick={() => { setReplying(item); setReply({ text: '', fileUrl: '' }); }}>Reply</Button> : null}
                {item.status !== 'CLOSED' && canClose ? <Button variant="ghost" busy={busy} onClick={() => void act(() => api.post(`/finance-hub/ca/queries/${item.id}/close`, {}), 'Closed.')}>Close</Button> : null}
                {item.status === 'CLOSED' && canClose ? <Button variant="ghost" busy={busy} onClick={() => void act(() => api.post(`/finance-hub/ca/queries/${item.id}/close`, { reopen: true }), 'Reopened.')}>Reopen</Button> : null}
              </div>
            </li>
          ))}
        </ul>
      )}
      {form ? (
        <Modal title="Raise a query" onClose={() => { if (!busy) setForm(null); }}>
          <form onSubmit={(event) => { event.preventDefault(); void act(() => api.post('/finance-hub/ca/queries', { ...form, dueDate: form.dueDate || null, category: form.category || null }), 'Query raised.').then((ok) => { if (ok) setForm(null); }); }} className="p-5 sm:p-7">
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Title *" wide><input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} className={inputClass} maxLength={200} required /></Field>
              <Field label="Question *" wide><textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} className={`${inputClass} min-h-[100px]`} maxLength={4000} required /></Field>
              <Field label="Category"><input value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })} className={inputClass} maxLength={60} placeholder="GST, TDS, fixed assets…" /></Field>
              <Field label="Priority"><select value={form.priority} onChange={(event) => setForm({ ...form, priority: event.target.value })} className={inputClass}><option value="LOW">Low</option><option value="NORMAL">Normal</option><option value="HIGH">High</option></select></Field>
              <Field label="Reply needed by"><input type="date" value={form.dueDate} onChange={(event) => setForm({ ...form, dueDate: event.target.value })} className={inputClass} /></Field>
            </div>
            <ModalFooter><Button onClick={() => setForm(null)} disabled={busy}>Cancel</Button><Button type="submit" variant="primary" busy={busy} disabled={!form.title || !form.description}>Raise</Button></ModalFooter>
          </form>
        </Modal>
      ) : null}
      {replying ? (
        <Modal title={`Reply: ${replying.title}`} onClose={() => { if (!busy) setReplying(null); }}>
          <form onSubmit={(event) => { event.preventDefault(); void act(() => api.post(`/finance-hub/ca/queries/${replying.id}/reply`, { ...reply, fileUrl: reply.fileUrl || null }), 'Reply sent.').then((ok) => { if (ok) setReplying(null); }); }} className="p-5 sm:p-7">
            <Field label="Reply *"><textarea value={reply.text} onChange={(event) => setReply({ ...reply, text: event.target.value })} className={`${inputClass} min-h-[100px]`} maxLength={4000} required /></Field>
            <div className="mt-3"><Field label="Evidence link" hint="Add the file to the Document Vault and paste its link, or any https link."><input value={reply.fileUrl} onChange={(event) => setReply({ ...reply, fileUrl: event.target.value })} className={inputClass} maxLength={1000} /></Field></div>
            <ModalFooter><Button onClick={() => setReplying(null)} disabled={busy}>Cancel</Button><Button type="submit" variant="primary" busy={busy} disabled={!reply.text.trim()}>Send</Button></ModalFooter>
          </form>
        </Modal>
      ) : null}
      {openVoucher ? <VoucherDetail key={openVoucher} voucherId={openVoucher} onClose={() => setOpenVoucher(null)} onChanged={() => setVersion((value) => value + 1)} onOpen={setOpenVoucher} onEdit={() => setOpenVoucher(null)} /> : null}
    </Panel>
  );
}

type ReviewRow = { id: string; number: string | null; type: string; date: string; narration: string; totalAmount: number; sourceType: string | null; createdBy: string | null; postedBy: string | null; selfApproved: boolean; review: { status: 'REVIEWED' | 'FLAGGED'; note: string | null; reviewedBy: string | null } | null };

/** Review queue: manual, large or suspense vouchers; mark reviewed or flag (raises a query). */
export function AccountingReviewModule() {
  const access = useFinanceWorkspaceAccess();
  const canReview = access.can(['fh.ca.manage', 'fh.ca.query']);
  const [filters, setFilters] = useState({ from: `${todayIso().slice(0, 7)}-01`, to: todayIso(), scope: 'manual', status: 'pending', minAmount: '' });
  const [version, setVersion] = useState(0);
  const list = useResource(async () => (await api.get('/finance-hub/ca/review', { params: { ...filters, minAmount: filters.minAmount || undefined } })).data as { counts: { total: number; reviewed: number; flagged: number; pending: number }; rows: ReviewRow[] }, `review-${JSON.stringify(filters)}-${version}`);
  const [openVoucher, setOpenVoucher] = useState<string | null>(null);
  const mark = async (row: ReviewRow, status: 'REVIEWED' | 'FLAGGED') => {
    const note = status === 'FLAGGED' ? window.prompt('What should be checked?') : '';
    if (status === 'FLAGGED' && !note?.trim()) return;
    try {
      await api.post(`/finance-hub/ca/review/${row.id}`, { status, note });
      toast.success(status === 'FLAGGED' ? 'Flagged; a query was raised.' : 'Marked reviewed.');
      setVersion((value) => value + 1);
    } catch (error) {
      toast.error(apiErrorMessage(error, 'Could not save.'));
    }
  };
  const counts = list.data?.counts;
  return (
    <Panel title="Accounting review" description="Posted vouchers for the CA to check. Self-approved entries (same maker and poster) are highlighted.">
      <div className="grid gap-3 border-b border-slate-100 p-4 md:grid-cols-5">
        <input type="date" value={filters.from} onChange={(event) => setFilters({ ...filters, from: event.target.value })} className={inputClass} aria-label="From" />
        <input type="date" value={filters.to} onChange={(event) => setFilters({ ...filters, to: event.target.value })} className={inputClass} aria-label="To" />
        <select value={filters.scope} onChange={(event) => setFilters({ ...filters, scope: event.target.value })} className={inputClass}><option value="manual">Manual vouchers</option><option value="suspense">Touching Suspense</option><option value="all">All vouchers</option></select>
        <select value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value })} className={inputClass}><option value="pending">Not reviewed</option><option value="flagged">Flagged</option><option value="">All</option></select>
        <input type="number" min={0} value={filters.minAmount} onChange={(event) => setFilters({ ...filters, minAmount: event.target.value })} className={inputClass} placeholder="Min amount" />
      </div>
      {counts ? <p className="px-4 pt-3 text-sm text-slate-600">{counts.total} vouchers · {counts.reviewed} reviewed · {counts.flagged} flagged · {counts.pending} to review</p> : null}
      {list.loading ? <LoadingState /> : list.error ? <ErrorBanner message={list.error} schemaMissing={list.schemaMissing} /> : !list.data?.rows.length ? <EmptyState title="Nothing to review" /> : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[960px] text-left text-sm">
            <thead className={tableHeadClass}><tr><th className="px-4 py-2.5">Date</th><th className="px-4 py-2.5">Voucher</th><th className="px-4 py-2.5">Narration</th><th className="px-4 py-2.5">Made / posted by</th><th className="px-4 py-2.5 text-right">Amount</th><th className="px-4 py-2.5">Review</th><th className="px-4 py-2.5" /></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {list.data.rows.map((row) => (
                <tr key={row.id} className={row.selfApproved ? 'bg-amber-50/40' : ''}>
                  <td className={`${cellClass} whitespace-nowrap`}>{formatDate(row.date)}</td>
                  <td className={cellClass}><button type="button" onClick={() => setOpenVoucher(row.id)} className="font-mono text-xs text-blue-700 hover:underline">{row.number}</button><span className="block text-[11px] text-slate-400">{enumLabel(row.sourceType ?? row.type)}</span></td>
                  <td className={`${cellClass} max-w-[340px] truncate text-xs`} title={row.narration}>{row.narration}</td>
                  <td className={`${cellClass} text-xs`}>{row.createdBy ?? 'System'} / {row.postedBy ?? 'System'}{row.selfApproved ? <span className="block text-amber-700">self-posted</span> : null}</td>
                  <td className={`${cellClass} text-right font-semibold`}>{formatInr(row.totalAmount)}</td>
                  <td className={cellClass}>{row.review ? <Badge tone={row.review.status === 'REVIEWED' ? 'green' : 'red'}>{enumLabel(row.review.status)}</Badge> : <Badge>Pending</Badge>}{row.review?.note ? <span className="block text-[11px] text-slate-500">{row.review.note}</span> : null}</td>
                  <td className={`${cellClass} whitespace-nowrap text-right`}>{canReview ? <><Button variant="ghost" onClick={() => void mark(row, 'REVIEWED')}>OK</Button><Button variant="ghost" onClick={() => void mark(row, 'FLAGGED')}>Flag</Button></> : null}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {openVoucher ? <VoucherDetail key={openVoucher} voucherId={openVoucher} onClose={() => setOpenVoucher(null)} onChanged={() => setVersion((value) => value + 1)} onOpen={setOpenVoucher} onEdit={() => setOpenVoucher(null)} /> : null}
    </Panel>
  );
}

type ImportResult = { batchId: string; dryRun: boolean; vouchers: number; ok: number; failed: number; results: Array<{ ref: string; ok: boolean; errors: string[]; number?: string | null; status?: string; duplicate?: boolean }> };

/** Journal / payment / receipt vouchers from a CSV, checked first, created as drafts (or posted). */
export function ImportTransactionsModule() {
  const access = useFinanceWorkspaceAccess();
  const canImport = access.can(['fh.import.manage']);
  const canPost = access.can(['fh.books.post']);
  const [file, setFile] = useState<{ name: string; rows: Array<Record<string, string>> } | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [post, setPost] = useState(false);
  const [busy, setBusy] = useState(false);
  const template = () => saveFile('voucher-import-template.csv', '﻿ref,date,type,account,party,costCentre,debit,credit,narration,reference,lineNarration\nJV-001,01-10-2026,JOURNAL,6200,,,25000,,Rent for October,,\nJV-001,01-10-2026,JOURNAL,2171,,,,25000,,,\n', 'text/csv');
  const run = async (dryRun: boolean) => {
    if (!file) return;
    setBusy(true);
    try {
      const data = (await api.post('/finance-hub/data/import/vouchers', { rows: file.rows, dryRun, post, fileName: file.name })).data as ImportResult;
      setResult(data);
      toast[data.failed ? 'warning' : 'success'](dryRun ? `${data.ok} of ${data.vouchers} vouchers are ready.` : `${data.ok} vouchers imported, ${data.failed} skipped.`);
    } catch (error) {
      toast.error(apiErrorMessage(error, 'Import failed.'));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Panel title="Import transactions" description="Upload vouchers as CSV: one row per line, rows with the same ref form one voucher (ledgers by code, parties by code or name). Check first; importing creates drafts, or posted vouchers if you tick post. A voucher imported before is skipped." actions={<Button icon={<Download className="h-4 w-4" />} onClick={template}>Template</Button>}>
      {!canImport ? <ReadOnlyNotice>Imports need “Manage Imports”.</ReadOnlyNotice> : (
        <div className="flex flex-wrap items-end gap-3 border-b border-slate-100 p-4">
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold"><Upload className="h-4 w-4" />{file ? `${file.name} (${file.rows.length} rows)` : 'Choose CSV'}<input type="file" accept=".csv,text/csv" className="hidden" onChange={async (event) => { const chosen = event.target.files?.[0]; if (chosen) { setFile({ name: chosen.name, rows: parseCsv(await chosen.text()).map((row) => ({ ...row, costCentre: row.costcentre ?? '', lineNarration: row.linenarration ?? '' })) }); setResult(null); } }} /></label>
          {canPost ? <label className="flex items-center gap-2 pb-2 text-sm"><input type="checkbox" checked={post} onChange={(event) => setPost(event.target.checked)} className="h-4 w-4 accent-amber-500" />Post (approval policy applies)</label> : null}
          <Button busy={busy} disabled={!file} onClick={() => void run(true)}>Check</Button>
          <Button variant="primary" busy={busy} disabled={!file || !result?.dryRun || !result.ok} onClick={() => void run(false)}>Import {result?.dryRun ? result.ok : ''} vouchers</Button>
        </div>
      )}
      {result ? (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className={tableHeadClass}><tr><th className="px-4 py-2">Ref</th><th className="px-4 py-2">Result</th><th className="px-4 py-2">Details</th></tr></thead>
            <tbody className="divide-y divide-slate-100">{result.results.map((row) => <tr key={row.ref}><td className="px-4 py-2 font-mono text-xs">{row.ref}</td><td className="px-4 py-2"><Badge tone={row.ok ? 'green' : row.duplicate ? 'slate' : 'red'}>{row.ok ? (result.dryRun ? 'Ready' : enumLabel(row.status ?? 'DRAFT')) : row.duplicate ? 'Duplicate' : 'Error'}</Badge></td><td className="px-4 py-2 text-xs">{row.number ?? ''}{row.errors.join(' · ')}</td></tr>)}</tbody>
          </table>
        </div>
      ) : <EmptyState title="Choose a CSV to check" description="Columns: ref, date, type (JOURNAL / PAYMENT / RECEIPT / CONTRA / ADJUSTMENT), account, party, costCentre, debit, credit, narration, reference." />}
    </Panel>
  );
}

/** Opening balances from a CSV into the opening-balance draft of a year. */
export function ImportOpeningBalancesModule() {
  const access = useFinanceWorkspaceAccess();
  const canImport = access.can(['fh.import.manage']);
  const href = useModuleHref();
  const years = useYears();
  const [yearId, setYearId] = useState('');
  const chosen = yearId || years.data?.find((year) => year.isCurrent)?.id || '';
  const [mode, setMode] = useState<'merge' | 'replace'>('merge');
  const [file, setFile] = useState<{ name: string; rows: Array<Record<string, string>> } | null>(null);
  const [result, setResult] = useState<{ dryRun: boolean; saved: boolean; errors: Array<{ row: number; error: string }>; lines: number; totals: { debit: number; credit: number; difference: number } } | null>(null);
  const [busy, setBusy] = useState(false);
  const run = async (dryRun: boolean) => {
    if (!file) return;
    setBusy(true);
    try {
      const data = (await api.post('/finance-hub/data/import/opening-balances', { yearId: chosen, mode, dryRun, fileName: file.name, rows: file.rows.map((row) => ({ ...row, billRef: row.billref ?? '', billDate: row.billdate ?? '', dueDate: row.duedate ?? '' })) })).data;
      setResult(data);
      if (data.saved) toast.success('Opening balances saved as a draft. Review and finalise them on Opening Balances.');
    } catch (error) {
      toast.error(apiErrorMessage(error, 'Import failed.'));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Panel title="Import opening balances" description="Ledger balances on the first day of the year (and party-wise bills). The import fills the opening-balance draft; finalise it on Opening Balances once debit = credit." actions={<><Button icon={<Download className="h-4 w-4" />} onClick={() => saveFile('opening-balances-template.csv', '﻿account,party,debit,credit,billRef,billDate,dueDate,note\n1350,,25000,,,,,Cash in hand\n1221,P-000001,118000,,INV-77,15-03-2026,14-04-2026,\n3100,,,143000,,,,Capital\n', 'text/csv')}>Template</Button><Link href={href('opening-balances')} className="text-sm font-semibold text-blue-700 hover:underline">Opening balances →</Link></>}>
      {!canImport ? <ReadOnlyNotice>Imports need “Manage Imports”.</ReadOnlyNotice> : (
        <div className="flex flex-wrap items-end gap-3 border-b border-slate-100 p-4">
          <Field label="Financial year"><select value={chosen} onChange={(event) => setYearId(event.target.value)} className={inputClass}>{(years.data ?? []).map((year) => <option key={year.id} value={year.id}>{year.label}</option>)}</select></Field>
          <Field label="Existing lines"><select value={mode} onChange={(event) => setMode(event.target.value as 'merge' | 'replace')} className={inputClass}><option value="merge">Keep, update matching</option><option value="replace">Replace all</option></select></Field>
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold"><Upload className="h-4 w-4" />{file ? `${file.name} (${file.rows.length})` : 'Choose CSV'}<input type="file" accept=".csv,text/csv" className="hidden" onChange={async (event) => { const chosenFile = event.target.files?.[0]; if (chosenFile) { setFile({ name: chosenFile.name, rows: parseCsv(await chosenFile.text()) }); setResult(null); } }} /></label>
          <Button busy={busy} disabled={!file || !chosen} onClick={() => void run(true)}>Check</Button>
          <Button variant="primary" busy={busy} disabled={!file || !result?.dryRun || result.errors.length > 0} onClick={() => void run(false)}>Save to draft</Button>
        </div>
      )}
      {result ? (
        <div className="p-4 text-sm">
          <p>Lines {result.lines} · Debit {formatInr(result.totals.debit)} · Credit {formatInr(result.totals.credit)} · <span className={result.totals.difference ? 'font-semibold text-red-700' : 'text-emerald-700'}>Difference {formatInr(result.totals.difference)}</span></p>
          {result.errors.length ? <ul className="mt-2 list-disc pl-5 text-red-700">{result.errors.map((error) => <li key={`${error.row}-${error.error}`}>Row {error.row}: {error.error}</li>)}</ul> : null}
        </div>
      ) : null}
    </Panel>
  );
}

const EXPORTS: Array<{ kind: string; label: string; hint: string }> = [
  { kind: 'trial-balance', label: 'Trial balance', hint: 'Opening, movement and closing per ledger' },
  { kind: 'day-book', label: 'Day book (all voucher lines)', hint: 'Every posted line with ledger and party' },
  { kind: 'party-balances', label: 'Party balances', hint: 'Receivable, payable and advances per party' },
  { kind: 'gst-sales', label: 'GST sales register', hint: 'Outward supplies' },
  { kind: 'gst-purchases', label: 'GST purchase register', hint: 'Inward supplies with ITC' },
  { kind: 'tds', label: 'TDS register', hint: 'Deductions and deposits by section' },
  { kind: 'chart-of-accounts', label: 'Chart of accounts', hint: 'Ledgers, groups and roles' },
];

/** Permission-controlled report downloads (every download is logged). */
export function DownloadReportsModule({ tallyOnly = false }: { tallyOnly?: boolean }) {
  const access = useFinanceWorkspaceAccess();
  const canExport = access.can(['fh.export', 'fh.reports.export', 'fh.ca.manage']);
  const [range, setRange] = useState({ from: fyStart(), to: todayIso() });
  const [busy, setBusy] = useState<string | null>(null);
  const download = async (kind: string) => {
    setBusy(kind);
    try {
      const data = (await api.get(kind === 'tally' ? '/finance-hub/data/export/tally' : `/finance-hub/data/export/${kind}`, { params: range })).data as { fileName: string; content: string };
      saveFile(data.fileName, data.content, kind === 'tally' ? 'application/xml' : 'text/csv;charset=utf-8');
    } catch (error) {
      toast.error(apiErrorMessage(error, 'Download failed.'));
    } finally {
      setBusy(null);
    }
  };
  return (
    <Panel title={tallyOnly ? 'Tally / accounting export' : 'Download reports'} description={tallyOnly ? 'Tally Prime XML with ledger masters and the period’s posted vouchers. In Tally: Gateway → Import → Masters, then Transactions. Party lines become party ledgers under Sundry Debtors / Creditors.' : 'CSV files for the CA, auditors or spreadsheets. Each download is recorded in the audit trail.'}>
      <div className="flex flex-wrap items-end gap-3 border-b border-slate-100 p-4">
        <Field label="From"><input type="date" value={range.from} onChange={(event) => setRange({ ...range, from: event.target.value })} className={inputClass} /></Field>
        <Field label="To"><input type="date" value={range.to} onChange={(event) => setRange({ ...range, to: event.target.value })} className={inputClass} /></Field>
      </div>
      {!canExport ? <ReadOnlyNotice>Downloads need “Export Data” or “Export Reports”.</ReadOnlyNotice> : (
        <div className="grid gap-3 p-4 md:grid-cols-2 lg:grid-cols-3">
          {(tallyOnly ? [{ kind: 'tally', label: 'Tally Prime XML', hint: 'Masters + vouchers' }, { kind: 'chart-of-accounts', label: 'Chart of accounts (CSV)', hint: 'For mapping ledgers' }, { kind: 'day-book', label: 'Day book (CSV)', hint: 'For other software' }] : [...EXPORTS, { kind: 'tally', label: 'Tally Prime XML', hint: 'Masters + vouchers' }]).map((item) => (
            <div key={item.kind} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 p-4">
              <div><p className="font-semibold">{item.label}</p><p className="text-xs text-slate-500">{item.hint}</p></div>
              <Button icon={<Download className="h-4 w-4" />} busy={busy === item.kind} onClick={() => void download(item.kind)}>Download</Button>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

/** Hub linking every import and export screen. */
export function ImportExportHubModule() {
  const href = useModuleHref();
  const cards: Array<[string, string, string]> = [
    ['import-bank-statements', 'Bank statements', 'Upload on the Expenses page; reconcile in Banking'],
    ['import-opening-balances', 'Opening balances', 'Ledger and party balances from a sheet'],
    ['import-transactions', 'Transactions', 'Journal / payment / receipt vouchers from CSV'],
    ['tally-accounting-export', 'Tally export', 'Tally Prime XML (masters + vouchers)'],
    ['download-reports', 'Download reports', 'Trial balance, day book, GST, TDS…'],
    ['bulk-upload-history', 'Upload history', 'Every import and export with its result'],
  ];
  return (
    <Panel title="Import / export" description="Bring data in with a check-first step, and take reports out for the CA or Tally.">
      <div className="grid gap-3 p-4 md:grid-cols-2 lg:grid-cols-3">{cards.map(([key, label, hint]) => <Link key={key} href={href(key)} className="rounded-xl border border-slate-200 p-4 hover:border-amber-300 hover:bg-amber-50/40"><p className="font-semibold">{label}</p><p className="text-xs text-slate-500">{hint}</p></Link>)}</div>
    </Panel>
  );
}

type History = { imports: Array<{ id: string; kind: string; source: string; fileName: string | null; dryRun: boolean; totalRows: number; created: number; failed: number; errors: unknown; at: string; by: string | null }>; exports: Array<{ id: string; kind: string; at: string; by: string | null; details: unknown }> };
type HistoryTab = 'imports' | 'exports';

/** Every import (with errors) and every download. */
export function UploadHistoryModule() {
  const [tab, setTab] = useState<HistoryTab>('imports');
  const data = useResource(async () => (await api.get('/finance-hub/data/history')).data as History, 'upload-history');
  const [errorsOf, setErrorsOf] = useState<History['imports'][number] | null>(null);
  return (
    <Panel title="Bulk upload history" description="Imports from this workspace and bank statements uploaded on the Expenses page, plus every report download.">
      <Tabs<HistoryTab> tabs={[{ key: 'imports', label: 'Imports' }, { key: 'exports', label: 'Downloads' }]} active={tab} onChange={setTab} />
      {data.loading ? <LoadingState /> : data.error || !data.data ? <ErrorBanner message={data.error || 'Could not load.'} schemaMissing={data.schemaMissing} /> : tab === 'imports' ? (
        !data.data.imports.length ? <EmptyState title="No imports yet" /> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-left text-sm">
              <thead className={tableHeadClass}><tr><th className="px-4 py-2.5">When</th><th className="px-4 py-2.5">Kind</th><th className="px-4 py-2.5">File</th><th className="px-4 py-2.5 text-right">Rows</th><th className="px-4 py-2.5 text-right">Created</th><th className="px-4 py-2.5 text-right">Failed</th><th className="px-4 py-2.5">By</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {data.data.imports.map((item) => (
                  <tr key={`${item.source}-${item.id}`}>
                    <td className={`${cellClass} whitespace-nowrap text-xs`}>{new Date(item.at).toLocaleString('en-IN')}</td>
                    <td className={cellClass}><Badge>{enumLabel(item.kind)}</Badge>{item.dryRun ? <span className="block text-[11px] text-slate-500">check only</span> : null}</td>
                    <td className={`${cellClass} text-xs`}>{item.fileName ?? '—'}<span className="block text-slate-400">{item.source === 'EXPENSES_PAGE' ? 'Expenses page' : 'Workspace'}</span></td>
                    <td className={`${cellClass} text-right`}>{item.totalRows}</td>
                    <td className={`${cellClass} text-right`}>{item.created}</td>
                    <td className={`${cellClass} text-right`}>{item.failed ? <button type="button" onClick={() => setErrorsOf(item)} className="font-semibold text-red-700 hover:underline">{item.failed}</button> : 0}</td>
                    <td className={`${cellClass} text-xs`}>{item.by ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : !data.data.exports.length ? <EmptyState title="No downloads yet" /> : (
        <ul className="divide-y divide-slate-100 text-sm">{data.data.exports.map((item) => <li key={item.id} className="flex justify-between gap-3 px-4 py-2"><span>{enumLabel(item.kind)}</span><span className="text-xs text-slate-500">{item.by ?? '—'} · {new Date(item.at).toLocaleString('en-IN')}</span></li>)}</ul>
      )}
      {errorsOf ? (
        <Modal title="Import errors" subtitle={errorsOf.fileName ?? undefined} onClose={() => setErrorsOf(null)}>
          <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap p-5 text-xs">{JSON.stringify(errorsOf.errors, null, 2)}</pre>
          <ModalFooter><Button onClick={() => setErrorsOf(null)}>Close</Button></ModalFooter>
        </Modal>
      ) : null}
    </Panel>
  );
}
