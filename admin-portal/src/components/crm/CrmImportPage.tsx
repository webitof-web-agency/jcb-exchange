'use client';

import { useMemo, useRef, useState } from 'react';
import { toast } from 'react-toastify';
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock,
  Download,
  FileSpreadsheet,
  FileText,
  FileUp,
  History,
  Layers,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Upload,
  UserCheck,
  Users,
  X,
} from 'lucide-react';
import api from '@/lib/api';
import {
  Badge,
  Button,
  cellClass,
  EmptyState,
  Field,
  LoadingState,
  Panel,
  tableHeadClass,
} from '@/components/financeWorkspace/ui';
import {
  crmError,
  CrmPageFrame,
  fmtDateTime,
  getJson,
  label,
  LEAD_TYPE_LABELS,
  PageHeader,
  selectClass,
  StatTile,
  useCrmMeta,
  useCrmResource,
} from './crmShared';

type PreviewRow = {
  row: number;
  name: string | null;
  mobile: string | null;
  city: string | null;
  leadType: string;
  source: string;
  budgetMax: number | null;
  errors: string[];
  openLeadId: string | null;
  existingContactId: string | null;
};

type Preview = {
  total: number;
  valid: number;
  duplicates: number;
  invalid: number;
  rows: PreviewRow[];
};

type Result = {
  total: number;
  created: number;
  duplicates: number;
  failed: number;
  errors: Array<{ row: number; error: string }>;
};

type Batch = {
  id: string;
  fileName: string | null;
  totalRows: number;
  createdCount: number;
  duplicateCount: number;
  failedCount: number;
  createdAt: string;
};

const TEMPLATE_CSV =
  'Name,Mobile,City,State,Lead Type,Source,Priority,Budget,Notes,Tags\n' +
  'Ramesh Patel,9876543210,Raipur,Chhattisgarh,BUY,EXHIBITION,HIGH,1800000,Wants JCB 3DX 2020+ with hammer line,Verified Buyer\n' +
  'Suresh Sharma,9823456789,Nagpur,Maharashtra,SELL,WEBSITE,MEDIUM,1450000,2018 JCB 3DX single owner 3500 hrs,Ready to Sell\n' +
  'Amit Verma,9812345670,Bilaspur,Chhattisgarh,RENT_IN,CALL,URGENT,90000,Need backhoe loader for 3 months mining work,Immediate\n';

function ImportLeads() {
  const { meta } = useCrmMeta();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [csv, setCsv] = useState('');
  const [fileName, setFileName] = useState('');
  const [fileSize, setFileSize] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const [defaultSource, setDefaultSource] = useState('IMPORT');
  const [defaultLeadType, setDefaultLeadType] = useState('BUY');
  const [ownerId, setOwnerId] = useState('');

  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewFilter, setPreviewFilter] = useState<'ALL' | 'VALID' | 'DUPLICATES' | 'INVALID'>('ALL');
  const [previewSearch, setPreviewSearch] = useState('');
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);

  const history = useCrmResource(
    () => getJson<Batch[]>('/crm/import/history'),
    `crm-import-${result?.total ?? 0}`
  );

  const handleProcessFile = async (file: File) => {
    if (!file.name.toLowerCase().endsWith('.csv')) {
      toast.error('Please upload a valid CSV file (.csv).');
      return;
    }
    if (file.size > 3 * 1024 * 1024) {
      toast.error('File exceeds maximum allowed size of 3 MB.');
      return;
    }
    const text = await file.text();
    setCsv(text);
    setFileName(file.name);
    setFileSize(file.size);
    setPreview(null);
    setResult(null);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void handleProcessFile(file);
  };

  const clearFile = () => {
    setCsv('');
    setFileName('');
    setFileSize(null);
    setPreview(null);
    setResult(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const requestPayload = () => ({
    csv,
    fileName,
    defaultSource,
    defaultLeadType,
    ...(ownerId ? { ownerId } : {}),
  });

  const runPreview = async () => {
    if (!csv.trim()) {
      toast.error('Please select a CSV file first.');
      return;
    }
    setBusy(true);
    try {
      const res = await api.post('/crm/import', requestPayload());
      setPreview(res.data);
      setResult(null);
      toast.info(`CSV verified: ${res.data.valid} valid leads ready for import.`);
    } catch (error) {
      toast.error(crmError(error, 'Could not read or parse the CSV file.'));
    } finally {
      setBusy(false);
    }
  };

  const commitImport = async () => {
    if (!preview || preview.valid === 0) {
      toast.error('No valid leads available to import.');
      return;
    }
    setBusy(true);
    try {
      const res = (await api.post('/crm/import', { ...requestPayload(), commit: true })).data as Result;
      setResult(res);
      setPreview(null);
      toast.success(`Successfully imported ${res.created} new leads!`);
    } catch (error) {
      toast.error(crmError(error, 'Lead import failed.'));
    } finally {
      setBusy(false);
    }
  };

  const downloadTemplate = () => {
    const url = URL.createObjectURL(new Blob([TEMPLATE_CSV], { type: 'text/csv;charset=utf-8;' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'jcb-crm-leads-template.csv';
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Template downloaded: jcb-crm-leads-template.csv');
  };

  // Filtered rows for inspection table
  const displayedRows = useMemo(() => {
    if (!preview) return [];
    let rows = preview.rows;
    if (previewFilter === 'VALID') {
      rows = rows.filter((r) => !r.errors.length && !r.openLeadId);
    } else if (previewFilter === 'DUPLICATES') {
      rows = rows.filter((r) => Boolean(r.openLeadId));
    } else if (previewFilter === 'INVALID') {
      rows = rows.filter((r) => r.errors.length > 0);
    }
    if (previewSearch.trim()) {
      const q = previewSearch.toLowerCase();
      rows = rows.filter(
        (r) =>
          (r.name && r.name.toLowerCase().includes(q)) ||
          (r.mobile && r.mobile.includes(q)) ||
          (r.city && r.city.toLowerCase().includes(q))
      );
    }
    return rows;
  }, [preview, previewFilter, previewSearch]);

  // Aggregate stats from history
  const historyBatches = history.data || [];
  const totalImportedAllTime = historyBatches.reduce((acc, b) => acc + (b.createdCount || 0), 0);
  const totalDuplicatesSafeguarded = historyBatches.reduce((acc, b) => acc + (b.duplicateCount || 0), 0);

  return (
    <>
      <PageHeader
        title="Import Leads & Ingestion Hub"
        description="Bulk upload leads from exhibitions, IndiaMART / TradeIndia spreadsheets, or marketing call registries. Automatically de-duplicates by mobile & active lead type."
        actions={
          <div className="flex items-center gap-2">
            <Button
              icon={<Download className="h-4 w-4" />}
              onClick={downloadTemplate}
            >
              Download Sample CSV
            </Button>
          </div>
        }
      />

      {/* KPI Command Strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile
          label="All-Time Imported"
          value={totalImportedAllTime.toLocaleString('en-IN')}
          tone="text-emerald-700"
          icon={<FileSpreadsheet className="h-4 w-4" />}
          hint={`${historyBatches.length} batch runs`}
        />
        <StatTile
          label="Duplicates Safeguarded"
          value={totalDuplicatesSafeguarded.toLocaleString('en-IN')}
          tone="text-amber-700"
          icon={<ShieldCheck className="h-4 w-4" />}
          hint="Prevented double calls"
        />
        <StatTile
          label="File Size Limit"
          value="3 MB"
          tone="text-slate-900"
          icon={<FileUp className="h-4 w-4" />}
          hint="Up to 10,000 rows/run"
        />
        <StatTile
          label="Auto Assignment"
          value={ownerId ? 'Custom Staff' : 'Round Robin'}
          tone="text-blue-700"
          icon={<UserCheck className="h-4 w-4" />}
          hint="Configurable routing"
        />
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        {/* Main Ingestion Panel */}
        <div className="space-y-5">
          <Panel
            title="Upload & Ingestion Config"
            description="Upload your spreadsheet, set fallback source & requirement types, then verify rows before saving."
          >
            <div className="p-4 sm:p-5 space-y-4">
              {/* Drag & Drop Zone */}
              {!fileName ? (
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDragging(true);
                  }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className={`group relative flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed p-8 text-center transition-all ${
                    isDragging
                      ? 'border-blue-600 bg-blue-50/70 scale-[0.99]'
                      : 'border-slate-200 bg-slate-50/50 hover:border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv,text/csv"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void handleProcessFile(f);
                    }}
                    className="hidden"
                  />
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-slate-700 shadow-sm border border-slate-200 group-hover:scale-105 transition-transform">
                    <Upload className="h-6 w-6 text-slate-900" />
                  </div>
                  <p className="mt-3 text-xs font-bold text-slate-900">
                    Click to browse or drop your CSV file here
                  </p>
                  <p className="mt-1 text-[11px] text-slate-500">
                    Supports .CSV files up to 3 MB. Columns: Name, Mobile, City, State, Lead Type, Source, Budget...
                  </p>
                </div>
              ) : (
                /* Selected File Card */
                <div className="flex items-center justify-between rounded-2xl border border-blue-200 bg-blue-50/50 p-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-white shadow-xs">
                      <FileSpreadsheet className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-slate-900">{fileName}</p>
                      <p className="text-[11px] text-slate-500">
                        {fileSize ? `${(fileSize / 1024).toFixed(1)} KB` : 'CSV Ready'} · Ready for verification
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={clearFile}
                      className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-semibold text-rose-600 hover:bg-rose-50"
                    >
                      <X className="h-3.5 w-3.5" />
                      Remove
                    </button>
                  </div>
                </div>
              )}

              {/* Ingestion Parameters Grid */}
              <div className="grid gap-3 sm:grid-cols-3 pt-1">
                <Field label="Default Source (If missing in CSV)">
                  <select
                    value={defaultSource}
                    onChange={(e) => setDefaultSource(e.target.value)}
                    className={selectClass}
                  >
                    {(meta?.config.sources || ['IMPORT', 'EXHIBITION', 'INDIAMART', 'JUSTDIAL']).map((s) => (
                      <option key={s} value={s}>
                        {label(s)}
                      </option>
                    ))}
                  </select>
                </Field>

                <Field label="Default Lead Requirement">
                  <select
                    value={defaultLeadType}
                    onChange={(e) => setDefaultLeadType(e.target.value)}
                    className={selectClass}
                  >
                    {(meta?.enums.leadTypes || ['BUY', 'SELL', 'RENT_OUT', 'RENT_IN']).map((t) => (
                      <option key={t} value={t}>
                        {LEAD_TYPE_LABELS[t] || label(t)}
                      </option>
                    ))}
                  </select>
                </Field>

                <Field label="Assign Leads To">
                  <select
                    value={ownerId}
                    onChange={(e) => setOwnerId(e.target.value)}
                    className={selectClass}
                  >
                    <option value="">Current User (Me)</option>
                    {meta?.access.canAssign && (
                      <option value="none">Unassigned (Round-Robin Pool)</option>
                    )}
                    {meta?.access.canAssign &&
                      meta.staff.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                  </select>
                </Field>
              </div>

              {/* Action Buttons Strip */}
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3">
                <div className="flex items-center gap-2">
                  <Button
                    variant="primary"
                    busy={busy && !preview}
                    disabled={!csv}
                    icon={<ShieldCheck className="h-4 w-4" />}
                    onClick={runPreview}
                  >
                    Verify & Analyze CSV
                  </Button>
                  {preview && (
                    <Button
                      variant="primary"
                      icon={<Upload className="h-4 w-4" />}
                      busy={busy}
                      disabled={preview.valid === 0}
                      onClick={commitImport}
                    >
                      Import {preview.valid} Valid Leads
                    </Button>
                  )}
                </div>

                <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
                  <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
                  <span>Deduplication active (Safe import)</span>
                </div>
              </div>
            </div>

            {/* Verification Results Panel */}
            {preview && (
              <div className="border-t border-slate-100 bg-slate-50/30 p-4 sm:p-5 space-y-4">
                {/* Summary Filter Pills */}
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setPreviewFilter('ALL')}
                      className={`rounded-lg px-2.5 py-1 text-xs font-bold transition-all ${
                        previewFilter === 'ALL'
                          ? 'bg-slate-900 text-white'
                          : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      All Rows ({preview.total})
                    </button>
                    <button
                      type="button"
                      onClick={() => setPreviewFilter('VALID')}
                      className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-bold transition-all ${
                        previewFilter === 'VALID'
                          ? 'bg-emerald-600 text-white'
                          : 'bg-emerald-50 border border-emerald-200 text-emerald-800 hover:bg-emerald-100'
                      }`}
                    >
                      <CheckCircle2 className="h-3 w-3" />
                      Ready to Import ({preview.valid})
                    </button>
                    <button
                      type="button"
                      onClick={() => setPreviewFilter('DUPLICATES')}
                      className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-bold transition-all ${
                        previewFilter === 'DUPLICATES'
                          ? 'bg-amber-600 text-white'
                          : 'bg-amber-50 border border-amber-200 text-amber-800 hover:bg-amber-100'
                      }`}
                    >
                      <AlertTriangle className="h-3 w-3" />
                      Duplicates ({preview.duplicates})
                    </button>
                    {preview.invalid > 0 && (
                      <button
                        type="button"
                        onClick={() => setPreviewFilter('INVALID')}
                        className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-bold transition-all ${
                          previewFilter === 'INVALID'
                            ? 'bg-rose-600 text-white'
                            : 'bg-rose-50 border border-rose-200 text-rose-800 hover:bg-rose-100'
                        }`}
                      >
                        <AlertCircle className="h-3 w-3" />
                        Errors ({preview.invalid})
                      </button>
                    )}
                  </div>

                  <div className="relative">
                    <Search className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Filter rows..."
                      value={previewSearch}
                      onChange={(e) => setPreviewSearch(e.target.value)}
                      className="h-8 rounded-lg border border-slate-200 bg-white pr-2.5 pl-8 text-xs font-medium text-slate-800 focus:border-slate-900 focus:outline-none"
                    />
                  </div>
                </div>

                {/* Rows Inspection Table */}
                <div className="max-h-[380px] overflow-auto rounded-xl border border-slate-200 bg-white">
                  <table className="w-full min-w-[700px] text-left text-xs">
                    <thead className={`${tableHeadClass} sticky top-0 bg-slate-50 z-10`}>
                      <tr>
                        <th className="px-3 py-2 w-12">#</th>
                        <th className="px-3 py-2">Contact Name</th>
                        <th className="px-3 py-2">Mobile</th>
                        <th className="px-3 py-2">City</th>
                        <th className="px-3 py-2">Lead Type</th>
                        <th className="px-3 py-2">Source</th>
                        <th className="px-3 py-2">Validation Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-medium">
                      {displayedRows.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="p-6 text-center text-slate-400">
                            No rows match the selected filter.
                          </td>
                        </tr>
                      ) : (
                        displayedRows.map((r) => {
                          const hasError = r.errors.length > 0;
                          const isDuplicate = Boolean(r.openLeadId);

                          return (
                            <tr
                              key={r.row}
                              className={
                                hasError
                                  ? 'bg-rose-50/50 hover:bg-rose-50'
                                  : isDuplicate
                                  ? 'bg-amber-50/40 hover:bg-amber-50/70'
                                  : 'hover:bg-slate-50/80'
                              }
                            >
                              <td className="px-3 py-2 font-mono text-[11px] text-slate-500">{r.row}</td>
                              <td className="px-3 py-2 font-bold text-slate-900">{r.name || '—'}</td>
                              <td className="px-3 py-2 font-mono text-slate-700">{r.mobile || '—'}</td>
                              <td className="px-3 py-2 text-slate-600">{r.city || '—'}</td>
                              <td className="px-3 py-2 font-semibold text-slate-800">
                                {LEAD_TYPE_LABELS[r.leadType] || r.leadType}
                              </td>
                              <td className="px-3 py-2 text-slate-600">{label(r.source)}</td>
                              <td className="px-3 py-2">
                                {hasError ? (
                                  <span className="inline-flex items-center gap-1 rounded bg-rose-100 px-1.5 py-0.5 text-[10px] font-bold text-rose-800">
                                    <AlertCircle className="h-3 w-3" />
                                    {r.errors.join(', ')}
                                  </span>
                                ) : isDuplicate ? (
                                  <span className="inline-flex items-center gap-1 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-800">
                                    <AlertTriangle className="h-3 w-3" />
                                    Open lead exists (Skipped)
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-800">
                                    <CheckCircle2 className="h-3 w-3" />
                                    {r.existingContactId ? 'Lead (Existing Contact)' : 'New Lead & Contact'}
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Post-Import Execution Result Box */}
            {result && (
              <div className="m-4 sm:m-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-900 space-y-3">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                  <h4 className="font-bold text-sm">Import Completed Successfully</h4>
                </div>
                <div className="grid grid-cols-4 gap-2 rounded-xl bg-white/70 p-3 text-center">
                  <div>
                    <p className="text-[10px] text-slate-500 uppercase font-semibold">Total Rows</p>
                    <p className="text-base font-bold text-slate-900">{result.total}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-500 uppercase font-semibold">Created Leads</p>
                    <p className="text-base font-bold text-emerald-700">{result.created}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-500 uppercase font-semibold">Duplicates Skipped</p>
                    <p className="text-base font-bold text-amber-700">{result.duplicates}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-500 uppercase font-semibold">Failed Rows</p>
                    <p className="text-base font-bold text-rose-700">{result.failed}</p>
                  </div>
                </div>

                {result.errors.length > 0 && (
                  <div className="rounded-xl bg-rose-50 border border-rose-200 p-3 text-xs text-rose-800">
                    <p className="font-bold">Errors encountered during ingestion:</p>
                    <ul className="mt-1 list-disc pl-4 space-y-0.5">
                      {result.errors.slice(0, 10).map((err, idx) => (
                        <li key={idx}>
                          Row {err.row}: {err.error}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </Panel>
        </div>

        {/* Sidebar: Batch Import History & Template Guidance */}
        <div className="space-y-4">
          <Panel
            title="Import History"
            description="Audit trail of previous lead file uploads."
            actions={
              <button
                type="button"
                onClick={() => history.reload()}
                className="text-slate-400 hover:text-slate-600"
                title="Refresh history"
              >
                <RefreshCw className="h-3.5 w-3.5" />
              </button>
            }
          >
            {history.loading && !history.data ? (
              <LoadingState />
            ) : !historyBatches.length ? (
              <EmptyState title="No previous imports" description="Files imported in this system will appear here." />
            ) : (
              <div className="divide-y divide-slate-100">
                {historyBatches.map((b) => (
                  <div key={b.id} className="p-3.5 space-y-1.5 hover:bg-slate-50/60 transition-colors">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-slate-900 truncate max-w-[180px]">
                        {b.fileName || 'CSV Spreadsheet'}
                      </span>
                      <span className="text-[11px] text-slate-500 font-mono">
                        {fmtDateTime(b.createdAt)}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 text-[11px]">
                      <span className="rounded bg-emerald-50 px-1.5 py-0.5 font-bold text-emerald-700 border border-emerald-200/60">
                        +{b.createdCount} new
                      </span>
                      {b.duplicateCount > 0 && (
                        <span className="rounded bg-amber-50 px-1.5 py-0.5 font-bold text-amber-700 border border-amber-200/60">
                          {b.duplicateCount} skipped
                        </span>
                      )}
                      {b.failedCount > 0 && (
                        <span className="rounded bg-rose-50 px-1.5 py-0.5 font-bold text-rose-700 border border-rose-200/60">
                          {b.failedCount} failed
                        </span>
                      )}
                      <span className="ml-auto text-slate-400 font-medium">
                        {b.totalRows} rows
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Panel>

          {/* Guidelines Box */}
          <div className="rounded-2xl border border-slate-200/80 bg-white p-4 space-y-2.5 shadow-xs">
            <h4 className="flex items-center gap-1.5 text-xs font-bold text-slate-900 uppercase tracking-wider">
              <Sparkles className="h-3.5 w-3.5 text-blue-600" />
              Ingestion Best Practices
            </h4>
            <ul className="space-y-1.5 text-xs text-slate-600">
              <li className="flex items-start gap-1.5">
                <span className="font-bold text-slate-400">1.</span>
                <span><strong>Mobile Number:</strong> 10-digit Indian mobile is mandatory for customer identification.</span>
              </li>
              <li className="flex items-start gap-1.5">
                <span className="font-bold text-slate-400">2.</span>
                <span><strong>De-duplication:</strong> If mobile has an open lead with the same type (e.g. BUY), it won't duplicate.</span>
              </li>
              <li className="flex items-start gap-1.5">
                <span className="font-bold text-slate-400">3.</span>
                <span><strong>Lead Types:</strong> BUY, SELL, RENT_OUT, RENT_IN, FINANCE.</span>
              </li>
              <li className="flex items-start gap-1.5">
                <span className="font-bold text-slate-400">4.</span>
                <span><strong>CSV Encoding:</strong> UTF-8 formatted CSV for regional character support.</span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </>
  );
}

export default function CrmImportPage() {
  return (
    <CrmPageFrame>
      <ImportLeads />
    </CrmPageFrame>
  );
}
