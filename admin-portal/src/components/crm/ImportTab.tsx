'use client';

import { useState } from 'react';
import { toast } from 'react-toastify';
import { FileUp, Upload } from 'lucide-react';
import api from '@/lib/api';
import { Badge, Button, cellClass, EmptyState, Field, LoadingState, Panel, tableHeadClass } from '@/components/financeWorkspace/ui';
import { crmError, fmtDateTime, getJson, label, LEAD_TYPE_LABELS, selectClass, useCrmMeta, useCrmResource } from './crmShared';

type PreviewRow = { row: number; name: string | null; mobile: string | null; city: string | null; leadType: string; source: string; budgetMax: number | null; errors: string[]; openLeadId: string | null; existingContactId: string | null };
type Preview = { total: number; valid: number; duplicates: number; invalid: number; rows: PreviewRow[] };
type Result = { total: number; created: number; duplicates: number; failed: number; errors: Array<{ row: number; error: string }> };
type Batch = { id: string; fileName: string | null; totalRows: number; createdCount: number; duplicateCount: number; failedCount: number; createdAt: string };

const TEMPLATE = 'Name,Mobile,City,State,Lead Type,Source,Priority,Budget,Notes,Tags\nRamesh Patel,9876543210,Raipur,Chhattisgarh,BUY,EXHIBITION,HIGH,1800000,Wants 3DX 2019+,Finance needed\n';

export default function ImportTab() {
  const { meta } = useCrmMeta();
  const [csv, setCsv] = useState('');
  const [fileName, setFileName] = useState('');
  const [defaultSource, setDefaultSource] = useState('IMPORT');
  const [defaultLeadType, setDefaultLeadType] = useState('BUY');
  const [ownerId, setOwnerId] = useState('');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const history = useCrmResource(() => getJson<Batch[]>('/crm/import/history'), `crm-import-${result?.total ?? 0}`);

  const readFile = async (file: File) => {
    if (file.size > 3 * 1024 * 1024) { toast.error('Max 3 MB.'); return; }
    setCsv(await file.text());
    setFileName(file.name);
    setPreview(null);
    setResult(null);
  };
  const body = () => ({ csv, fileName, defaultSource, defaultLeadType, ...(ownerId ? { ownerId } : {}) });
  const runPreview = async () => {
    setBusy(true);
    try { setPreview((await api.post('/crm/import', body())).data); } catch (error) { toast.error(crmError(error, 'Could not read the file.')); } finally { setBusy(false); }
  };
  const commit = async () => {
    setBusy(true);
    try {
      const r = (await api.post('/crm/import', { ...body(), commit: true })).data as Result;
      setResult(r);
      setPreview(null);
      toast.success(`${r.created} leads imported.`);
    } catch (error) {
      toast.error(crmError(error, 'Import failed.'));
    } finally {
      setBusy(false);
    }
  };
  const downloadTemplate = () => {
    const url = URL.createObjectURL(new Blob([TEMPLATE], { type: 'text/csv' }));
    const a = document.createElement('a'); a.href = url; a.download = 'crm-leads-template.csv'; a.click(); URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <Panel title="Import leads" description="Exhibition lists, IndiaMART/JustDial exports or old registers. Save the sheet as CSV. Duplicates (same mobile with an open lead of that type) are skipped." actions={<Button icon={<FileUp className="h-4 w-4" />} onClick={downloadTemplate}>Download template</Button>}>
        <div className="grid gap-3 p-4 md:grid-cols-4">
          <Field label="CSV file *">
            <input type="file" accept=".csv,text/csv" onChange={(e) => { const f = e.target.files?.[0]; if (f) void readFile(f); }} className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-900 file:px-3 file:py-2 file:text-xs file:font-bold file:text-white" />
          </Field>
          <Field label="Default source">
            <select value={defaultSource} onChange={(e) => setDefaultSource(e.target.value)} className={selectClass}>{(meta?.config.sources || ['IMPORT']).map((s) => <option key={s} value={s}>{label(s)}</option>)}</select>
          </Field>
          <Field label="Default lead type">
            <select value={defaultLeadType} onChange={(e) => setDefaultLeadType(e.target.value)} className={selectClass}>{(meta?.enums.leadTypes || []).map((t) => <option key={t} value={t}>{LEAD_TYPE_LABELS[t] || label(t)}</option>)}</select>
          </Field>
          <Field label="Assign to">
            <select value={ownerId} onChange={(e) => setOwnerId(e.target.value)} className={selectClass}>
              <option value="">Me</option>
              {meta?.access.canAssign ? <option value="none">Unassigned (auto-assign if on)</option> : null}
              {meta?.access.canAssign ? meta.staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>) : null}
            </select>
          </Field>
        </div>
        <div className="flex gap-2 border-t border-slate-100 px-4 py-3">
          <Button busy={busy && !preview} disabled={!csv} onClick={runPreview}>Check file</Button>
          {preview ? <Button variant="primary" icon={<Upload className="h-4 w-4" />} busy={busy} disabled={!preview.valid} onClick={commit}>Import {preview.valid} leads</Button> : null}
        </div>
        {preview ? (
          <>
            <div className="flex flex-wrap gap-2 px-4 pb-3 text-xs">
              <Badge tone="green">{preview.valid} ready</Badge><Badge tone="amber">{preview.duplicates} duplicates</Badge><Badge tone="red">{preview.invalid} with errors</Badge><Badge>{preview.total} rows</Badge>
            </div>
            <div className="max-h-[420px] overflow-auto border-t border-slate-100">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className={`${tableHeadClass} sticky top-0`}><tr><th className="px-4 py-2">Row</th><th className="px-4 py-2">Name</th><th className="px-4 py-2">Mobile</th><th className="px-4 py-2">City</th><th className="px-4 py-2">Type</th><th className="px-4 py-2">Source</th><th className="px-4 py-2">Check</th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {preview.rows.map((r) => (
                    <tr key={r.row} className={r.errors.length ? 'bg-red-50/50' : r.openLeadId ? 'bg-amber-50/50' : ''}>
                      <td className={cellClass}>{r.row}</td><td className={cellClass}>{r.name || '—'}</td><td className={cellClass}>{r.mobile || '—'}</td><td className={cellClass}>{r.city || '—'}</td>
                      <td className={cellClass}>{LEAD_TYPE_LABELS[r.leadType] || r.leadType}</td><td className={cellClass}>{label(r.source)}</td>
                      <td className={cellClass}>{r.errors.length ? <span className="text-xs font-semibold text-red-600">{r.errors.join(', ')}</span> : r.openLeadId ? <span className="text-xs font-semibold text-amber-700">Open lead exists — skipped</span> : <span className="text-xs font-semibold text-emerald-700">{r.existingContactId ? 'New lead, existing contact' : 'New'}</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : null}
        {result ? (
          <div className="m-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
            <p className="font-semibold">{result.created} imported · {result.duplicates} duplicates skipped · {result.failed} failed</p>
            {result.errors.length ? <ul className="mt-2 list-disc pl-5 text-xs text-red-700">{result.errors.slice(0, 20).map((e) => <li key={e.row}>Row {e.row}: {e.error}</li>)}</ul> : null}
          </div>
        ) : null}
      </Panel>
      <Panel title="Import history">
        {history.loading && !history.data ? <LoadingState /> : !history.data?.length ? <EmptyState title="No imports yet" /> : (
          <ul className="divide-y divide-slate-100">
            {history.data.map((b) => <li key={b.id} className="flex justify-between px-4 py-2.5 text-sm"><span className="text-slate-700">{b.fileName || 'CSV import'} <span className="text-xs text-slate-400">· {fmtDateTime(b.createdAt)}</span></span><span className="text-xs text-slate-600">{b.createdCount} new · {b.duplicateCount} dup · {b.failedCount} failed / {b.totalRows}</span></li>)}
          </ul>
        )}
      </Panel>
    </div>
  );
}
