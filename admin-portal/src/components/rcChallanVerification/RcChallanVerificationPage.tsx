/* eslint-disable react-hooks/set-state-in-effect */
'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import {
  AlertTriangle,
  BadgeCheck,
  Check,
  Copy,
  Download,
  Eye,
  FileCheck2,
  FileText,
  Gavel,
  History,
  Loader2,
  Search,
  ShieldAlert,
  ShieldCheck,
  X,
  XCircle,
} from 'lucide-react';
import api from '@/lib/api';
import { hasAnyPermission } from '@/lib/permissionUtils';
import { useAuthStore } from '@/store/authStore';
import VerificationHistoryState from '@/components/vehicleTransport/VerificationHistoryState';
import {
  normalizeRcChallanForm,
  safeApiError,
  validateRcChallanForm,
  type RcChallanFormState,
  type RcChallanRecord,
  type RcChallanResult,
  type RcChallanHistoryRecord,
  type RcChallanHistoryResponse,
  type RcChallanVerificationResponse,
} from '@/lib/rcChallan';
import {
  sanitizeRcNumber,
} from '@/lib/verificationSanitizers';

const inputClass = 'mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20';
const buttonClass = 'inline-flex items-center justify-center gap-2 rounded-xl bg-amber-500 px-5 py-2.5 text-sm font-bold text-slate-950 shadow-sm transition hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-50';

const initialForm: RcChallanFormState = {
  rcNumber: '',
};

const formatDate = (value: unknown) => {
  if (typeof value !== 'string' || !value.trim()) return 'Not available';
  const normalized = value.trim();
  try {
    const d = new Date(normalized);
    if (!Number.isNaN(d.getTime())) {
      return new Intl.DateTimeFormat('en-IN', {
        dateStyle: 'medium',
        timeStyle: normalized.includes('T') ? 'short' : undefined,
      }).format(d);
    }
  } catch {
    // fallback
  }
  return normalized;
};

const formatMoney = (value: unknown) => {
  const amount = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(amount)) return '₹0.00';
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(amount);
};

const titleize = (value: string) => value.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());

function SafeValue({ value }: { value: unknown }) {
  if (value === null || value === undefined || value === '') return <span className="text-slate-400">Not available</span>;
  if (typeof value === 'boolean') return <span>{value ? 'Yes' : 'No'}</span>;
  if (typeof value === 'number') return <span>{value}</span>;
  if (typeof value === 'string') return <span className="break-words">{value.replace(/_/g, ' ')}</span>;
  if (Array.isArray(value)) {
    if (!value.length) return <span className="text-slate-400">No records</span>;
    return (
      <div className="space-y-1.5">
        {value.map((item, index) => (
          <div key={index} className="rounded-lg border border-slate-200 bg-white p-2 text-xs">
            <SafeValue value={item} />
          </div>
        ))}
      </div>
    );
  }
  if (typeof value === 'object') {
    return (
      <dl className="space-y-1 text-xs">
        {Object.entries(value as Record<string, unknown>).map(([key, item]) => (
          <div key={key} className="flex flex-col gap-0.5 py-1 border-b border-slate-100 last:border-none">
            <dt className="font-semibold text-slate-500 shrink-0">{titleize(key)}:</dt>
            <dd className="font-medium text-slate-900 break-words">
              <SafeValue value={item} />
            </dd>
          </div>
        ))}
      </dl>
    );
  }
  return <span>{String(value)}</span>;
}

function Field({ label, value, money = false }: { label: string; value: unknown; money?: boolean }) {
  if (value === null || value === undefined || value === '') {
    return (
      <div className="min-w-0 rounded-xl border border-slate-100 bg-white p-3">
        <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</dt>
        <dd className="mt-1 text-sm text-slate-400">Not available</dd>
      </div>
    );
  }
  return (
    <div className="min-w-0 rounded-xl border border-slate-100 bg-white p-3">
      <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-1 break-words text-sm font-semibold text-slate-900">
        {money ? formatMoney(value) : <SafeValue value={value} />}
      </dd>
    </div>
  );
}

function StatusBadge({ status }: { status: unknown }) {
  const label = typeof status === 'string' && status.trim() ? status : 'Unknown';
  const normalized = label.toUpperCase();
  const tone = normalized === 'PENDING'
    ? 'bg-amber-100 text-amber-800 border border-amber-200'
    : normalized === 'PAID' || normalized === 'SUCCESS' || normalized === 'CLOSED'
      ? 'bg-emerald-100 text-emerald-700 border border-emerald-200'
      : normalized === 'FAILED'
        ? 'bg-red-100 text-red-700 border border-red-200'
        : 'bg-slate-100 text-slate-600 border border-slate-200';
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold ${tone}`}>{label}</span>;
}

function CourtBadge({ value }: { value: boolean | null }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold ${
        value === true
          ? 'bg-red-100 text-red-700 border border-red-200'
          : value === false
            ? 'bg-slate-100 text-slate-600 border border-slate-200'
            : 'bg-amber-100 text-amber-700 border border-amber-200'
      }`}
    >
      {value === true ? 'Yes' : value === false ? 'No' : 'Unknown'}
    </span>
  );
}

function SummaryCards({ summary }: { summary: RcChallanResult['summary'] }) {
  const cards = [
    {
      label: 'Returned Challans',
      value: String(summary.totalChallans),
      sub: formatMoney(summary.totalReturnedAmount),
      tone: 'text-slate-900',
      border: 'border-slate-200',
      bg: 'bg-white',
      icon: <FileText className="h-4 w-4 text-slate-500" />,
    },
    {
      label: 'Known Pending',
      value: String(summary.knownPendingCount),
      sub: formatMoney(summary.knownPendingAmount),
      tone: summary.knownPendingCount > 0 ? 'text-amber-900' : 'text-emerald-700',
      border: summary.knownPendingCount > 0 ? 'border-amber-300' : 'border-emerald-200',
      bg: summary.knownPendingCount > 0 ? 'bg-amber-50/60' : 'bg-emerald-50/40',
      icon: summary.knownPendingCount > 0 ? <AlertTriangle className="h-4 w-4 text-amber-600" /> : <ShieldCheck className="h-4 w-4 text-emerald-600" />,
    },
    {
      label: 'Court Cases',
      value: String(summary.courtChallanCount),
      sub: summary.courtChallanCount > 0 ? 'Pending in Court' : 'No Court Cases',
      tone: summary.courtChallanCount > 0 ? 'text-red-700' : 'text-slate-600',
      border: summary.courtChallanCount > 0 ? 'border-red-300' : 'border-slate-200',
      bg: summary.courtChallanCount > 0 ? 'bg-red-50/50' : 'bg-white',
      icon: <Gavel className="h-4 w-4 text-slate-500" />,
    },
    {
      label: 'Blacklist Status',
      value: summary.blacklistCount > 0 ? `${summary.blacklistCount} Records` : 'Clean',
      sub: summary.blacklistCount > 0 ? 'Vehicle Blacklisted' : 'No Blacklist Records',
      tone: summary.blacklistCount > 0 ? 'text-red-700' : 'text-emerald-700',
      border: summary.blacklistCount > 0 ? 'border-red-300' : 'border-slate-200',
      bg: summary.blacklistCount > 0 ? 'bg-red-50/50' : 'bg-white',
      icon: summary.blacklistCount > 0 ? <ShieldAlert className="h-4 w-4 text-red-600" /> : <ShieldCheck className="h-4 w-4 text-emerald-600" />,
    },
  ];

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map((card) => (
        <div key={card.label} className={`rounded-2xl border ${card.border} ${card.bg} p-4 shadow-sm flex flex-col justify-between`}>
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">{card.label}</span>
            {card.icon}
          </div>
          <div className="mt-2">
            <p className={`font-mono text-2xl font-black ${card.tone}`}>{card.value}</p>
            <p className="mt-0.5 text-xs font-semibold text-slate-500">{card.sub}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

function ChallanCardsList({
  challans,
  onSelect,
}: {
  challans: RcChallanRecord[];
  onSelect: (challan: RcChallanRecord) => void;
}) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const copyChallanNo = async (challanNo: string, key: string) => {
    try {
      await navigator.clipboard.writeText(challanNo);
      setCopiedKey(key);
      window.setTimeout(() => setCopiedKey(null), 1500);
    } catch {
      // ignore
    }
  };

  if (!challans.length) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 bg-white py-12 text-center text-sm font-semibold text-slate-500">
        No challan records were returned for this vehicle registration.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {challans.map((challan, index) => {
        const isPending = (challan.challanStatus || '').toLowerCase().includes('pending');
        const offenses = (challan.offenseDetailsList || [])
          .map((o) => o?.offenseName)
          .filter(Boolean)
          .join(', ') || challan.offenseDetails || 'Traffic Violation';

        return (
          <div
            key={challan.recordKey || index}
            className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden transition hover:border-amber-300"
          >
            {/* Card Header Bar */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-slate-50/80 px-4 py-2.5">
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs font-bold text-slate-400">#{index + 1}</span>
                <span className="font-mono text-sm font-bold text-slate-900">{challan.challanNumber || 'N/A'}</span>
                {challan.challanNumber ? (
                  <button
                    type="button"
                    onClick={() => void copyChallanNo(challan.challanNumber!, challan.recordKey)}
                    className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-[11px] font-medium text-slate-600 hover:bg-slate-100"
                    title="Copy Challan Number"
                  >
                    {copiedKey === challan.recordKey ? (
                      <Check className="h-3 w-3 text-emerald-600" />
                    ) : (
                      <Copy className="h-3 w-3 text-slate-400" />
                    )}
                    {copiedKey === challan.recordKey ? 'Copied' : 'Copy'}
                  </button>
                ) : null}
              </div>
              <div className="flex items-center gap-2">
                <StatusBadge status={challan.challanStatus} />
                <span className={`font-mono text-base font-black ${isPending ? 'text-amber-800' : 'text-slate-900'}`}>
                  {formatMoney(challan.amount)}
                </span>
              </div>
            </div>

            {/* Card Content Body */}
            <div className="p-4 space-y-3">
              {/* Offense description */}
              <div className="rounded-xl border border-rose-100 bg-rose-50/60 p-3">
                <span className="text-[11px] font-bold uppercase tracking-wider text-rose-800">Offense Description</span>
                <p className="mt-0.5 text-sm font-semibold text-rose-950 leading-snug">{offenses}</p>
              </div>

              {/* Grid of Key Info */}
              <div className="grid gap-2 sm:grid-cols-2 text-xs">
                <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-2.5">
                  <span className="font-semibold uppercase tracking-wider text-slate-500">Date &amp; Time</span>
                  <p className="mt-0.5 font-medium text-slate-900">
                    {formatDate(challan.challanDateTime || challan.challanDate)}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-2.5">
                  <span className="font-semibold uppercase tracking-wider text-slate-500">State / RTO</span>
                  <p className="mt-0.5 font-medium text-slate-900">
                    {challan.state || 'N/A'}{challan.rto ? ` • ${challan.rto}` : ''}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-2.5">
                  <span className="font-semibold uppercase tracking-wider text-slate-500">Place of Offense</span>
                  <p className="mt-0.5 font-medium text-slate-900">
                    {challan.challanPlace?.replace(/_/g, ' ') || 'Not specified'}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-2.5">
                  <span className="font-semibold uppercase tracking-wider text-slate-500">Accused / Violator</span>
                  <p className="mt-0.5 font-medium text-slate-900">
                    {challan.accusedName || 'Not available'}
                  </p>
                </div>
              </div>

              {/* Bottom Actions Bar */}
              <div className="flex items-center justify-between pt-1">
                <div className="flex items-center gap-1.5 text-xs text-slate-500">
                  <Gavel className="h-3.5 w-3.5 text-slate-400" />
                  <span>Court:</span>
                  <CourtBadge value={challan.courtChallan} />
                  {challan.courtName ? <span className="text-slate-600 truncate max-w-[200px]">({challan.courtName})</span> : null}
                </div>
                <button
                  type="button"
                  onClick={() => onSelect(challan)}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-bold text-slate-700 shadow-sm transition hover:bg-slate-50"
                >
                  <Eye className="h-3.5 w-3.5 text-slate-500" />
                  Full Details
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ResultPanel({ response }: { response: RcChallanVerificationResponse }) {
  const [selectedChallan, setSelectedChallan] = useState<RcChallanRecord | null>(null);
  const [copiedRc, setCopiedRc] = useState(false);
  const [copiedClientId, setCopiedClientId] = useState(false);
  const [copiedModalRc, setCopiedModalRc] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfError, setPdfError] = useState('');

  if (response.record.status !== 'SUCCESS') {
    return <VerificationHistoryState title="RC Challan lookup was not completed" record={response.record} />;
  }
  const result = response.result;
  if (!result) return null;
  const providerResponse = result.providerResponse ?? {
    statusCode: null,
    success: null,
    message: null,
    messageCode: null,
  };
  const providerData = result.providerData ?? {};
  const rcNumber = result.rcNumber || response.record.maskedRcNumber || 'RC-RECORD';

  const copyRc = async () => {
    try {
      await navigator.clipboard.writeText(rcNumber);
      setCopiedRc(true);
      window.setTimeout(() => setCopiedRc(false), 2000);
    } catch {
      // ignore
    }
  };

  const downloadPdf = async () => {
    setPdfBusy(true);
    setPdfError('');
    try {
      const [{ pdf }, { default: RcChallanPdfDocument }] = await Promise.all([
        import('@react-pdf/renderer'),
        import('./RcChallanPdfDocument'),
      ]);
      const blob = await pdf(<RcChallanPdfDocument result={result} record={response.record} />).toBlob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `RC-Challan-${rcNumber.replace(/[^A-Za-z0-9*-]+/g, '-')}.pdf`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      setPdfError('PDF could not be generated. Please try again.');
    } finally {
      setPdfBusy(false);
    }
  };

  return (
    <div className="mt-6 space-y-5" role="status" aria-live="polite">
      {/* Top Banner with PDF Action */}
      <div className="flex flex-col gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2 text-sm font-bold text-emerald-800">
          <BadgeCheck className="h-5 w-5 text-emerald-600" />
          RC Challan lookup completed
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={response.record.status} />
          {response.cacheHit ? (
            <span className="rounded-full bg-white px-2.5 py-0.5 text-xs font-semibold text-emerald-700 shadow-sm border border-emerald-100">
              24h cached
            </span>
          ) : null}
          <button
            type="button"
            onClick={() => void downloadPdf()}
            disabled={pdfBusy}
            className="inline-flex items-center gap-1.5 rounded-xl border border-amber-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-800 shadow-sm transition hover:bg-amber-50 disabled:opacity-50"
          >
            {pdfBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5 text-amber-600" />}
            {pdfBusy ? 'Generating PDF…' : 'Download PDF'}
          </button>
        </div>
      </div>

      {pdfError ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700" role="alert">
          {pdfError}
        </div>
      ) : null}

      {/* Prominent Vehicle Overview Card */}
      <section className="rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50/70 via-white to-amber-50/30 p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-amber-100">
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-amber-800">Queried Vehicle Registration</span>
            <div className="mt-1 flex items-center gap-2">
              <h2 className="font-mono text-2xl font-black text-slate-900 tracking-wide">{rcNumber}</h2>
              <button
                type="button"
                onClick={() => void copyRc()}
                className="inline-flex items-center gap-1 rounded-lg border border-amber-300 bg-white px-2 py-1 text-xs font-bold text-amber-900 shadow-sm transition hover:bg-amber-100"
              >
                {copiedRc ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5 text-amber-700" />}
                {copiedRc ? 'Copied' : 'Copy'}
              </button>
            </div>
            <p className="mt-1 text-xs text-slate-500 font-mono">
              Client ID: {result.providerClientId || response.record.providerClientId || 'N/A'}
            </p>
          </div>
          <div className="text-right">
            <span className="text-xs text-slate-500">
              Provider: {response.record.providerEnvironment || 'Surepass Gateway'}
            </span>
          </div>
        </div>

        <p className="mt-3 text-xs text-slate-600">
          Amounts below are calculated directly from official records returned by Surepass. Only challans explicitly marked <strong>Pending</strong> are counted in the pending penalty amount.
        </p>
      </section>

      {/* KPI Summary Cards */}
      <SummaryCards summary={result.summary} />

      {/* Challan Records Section */}
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-base font-bold text-slate-900">
              <FileCheck2 className="h-5 w-5 text-amber-600" />
              Challan Records ({result.challans.length})
            </h2>
            <p className="text-xs text-slate-500">All traffic offenses and penalty details are listed below and in the PDF.</p>
          </div>
        </div>
        <ChallanCardsList challans={result.challans} onSelect={setSelectedChallan} />
      </section>

      {/* Blacklist Information Section */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-sm">
        <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-slate-900">
          <ShieldAlert className="h-4 w-4 text-red-600" />
          Blacklist &amp; Impound Information
        </h2>
        {result.blacklist && result.blacklist.length ? (
          <div className="mt-3 space-y-2">
            {result.blacklist.map((item, index) => (
              <div key={index} className="rounded-xl border border-red-100 bg-red-50 p-3 text-sm">
                <SafeValue value={item} />
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-3 flex items-center gap-2 rounded-xl border border-emerald-100 bg-emerald-50/70 p-3 text-sm font-semibold text-emerald-800">
            <ShieldCheck className="h-4 w-4 text-emerald-600" />
            Clean Status — No blacklist records found for this vehicle.
          </div>
        )}
      </section>

      {/* Verification Gateway & Audit Trail */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-sm">
        <details className="group">
          <summary className="flex cursor-pointer items-center justify-between text-sm font-bold text-slate-800 hover:text-slate-900">
            <span className="flex items-center gap-2">
              <FileCheck2 className="h-4 w-4 text-amber-600" />
              Gateway Verification &amp; Audit Trail
            </span>
            <span className="text-xs text-slate-400 group-open:rotate-180 transition">▼</span>
          </summary>
          <div className="mt-4 space-y-3">
            <dl className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-3">
                <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Service Gateway</dt>
                <dd className="mt-1 text-sm font-bold text-slate-900">Surepass National Vehicle Registry</dd>
              </div>
              <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-3">
                <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Gateway Status</dt>
                <dd className="mt-1 text-sm font-bold text-emerald-700">
                  HTTP {providerResponse.statusCode || 200} • Successful Verification
                </dd>
              </div>
              <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-3 sm:col-span-2">
                <div className="flex items-center justify-between">
                  <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Provider Transaction Client ID</dt>
                  {(result.providerClientId || response.record.providerClientId) ? (
                    <button
                      type="button"
                      onClick={() => {
                        const id = result.providerClientId || response.record.providerClientId || '';
                        void navigator.clipboard.writeText(id);
                        setCopiedClientId(true);
                        window.setTimeout(() => setCopiedClientId(false), 2000);
                      }}
                      className="inline-flex items-center gap-1 rounded bg-white px-2 py-0.5 text-xs font-medium text-slate-600 border border-slate-200 hover:bg-slate-50"
                    >
                      {copiedClientId ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3 text-slate-400" />}
                      {copiedClientId ? 'Copied ID' : 'Copy ID'}
                    </button>
                  ) : null}
                </div>
                <dd className="mt-1 font-mono text-xs font-bold text-slate-800 break-all">
                  {result.providerClientId || response.record.providerClientId || 'Not available'}
                </dd>
              </div>
              <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-3">
                <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Records Processed</dt>
                <dd className="mt-1 text-sm font-bold text-slate-900">
                  {result.summary.totalChallans} Challan Record{result.summary.totalChallans === 1 ? '' : 's'}
                </dd>
              </div>
              <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-3">
                <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Data Source</dt>
                <dd className="mt-1 text-sm font-bold text-slate-900">
                  {response.cacheHit ? 'Saved 24h Verified Cache' : 'Live Transport Authority Gateway'}
                </dd>
              </div>
              <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-3">
                <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Verified Timestamp</dt>
                <dd className="mt-1 text-sm font-medium text-slate-700">
                  {formatDate(response.record.completedAt || response.record.createdAt)}
                </dd>
              </div>
              <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-3">
                <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Authorized Operator</dt>
                <dd className="mt-1 text-sm font-medium text-slate-700">
                  {response.record.requestedBy?.name || response.record.requestedBy?.email || 'Authorized Operator'}
                </dd>
              </div>
            </dl>
          </div>
        </details>
      </section>

      {/* Modal for Full Challan Details */}
      {selectedChallan ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/60 p-4 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
          aria-label="Challan detail"
        >
          <div className="my-8 w-full max-w-2xl rounded-2xl bg-white p-5 shadow-2xl sm:p-7 max-h-[92vh] overflow-y-auto [scrollbar-width:thin]">
            {/* Modal Header */}
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-4">
              <div>
                <span className="text-[11px] font-bold uppercase tracking-widest text-amber-600">
                  Challan #{selectedChallan.number || '1'} Full Details
                </span>
                <div className="mt-1 flex items-center gap-2">
                  <h2 className="font-mono text-xl font-black text-slate-900">
                    {selectedChallan.challanNumber || 'Challan Record'}
                  </h2>
                  {selectedChallan.challanNumber ? (
                    <button
                      type="button"
                      onClick={() => {
                        void navigator.clipboard.writeText(selectedChallan.challanNumber!);
                        setCopiedModalRc(true);
                        window.setTimeout(() => setCopiedModalRc(false), 1500);
                      }}
                      className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-0.5 text-xs font-medium text-slate-600 hover:bg-slate-100"
                    >
                      {copiedModalRc ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3 text-slate-400" />}
                      {copiedModalRc ? 'Copied' : 'Copy'}
                    </button>
                  ) : null}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <StatusBadge status={selectedChallan.challanStatus} />
                <span className="font-mono text-lg font-black text-slate-950">
                  {formatMoney(selectedChallan.amount)}
                </span>
                <button
                  type="button"
                  onClick={() => setSelectedChallan(null)}
                  className="rounded-xl border border-slate-200 p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                  aria-label="Close challan details"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div className="mt-5 space-y-4">
              {/* Full Offense Details Box */}
              <div className="rounded-2xl border border-rose-200 bg-rose-50/70 p-4">
                <span className="text-xs font-bold uppercase tracking-wider text-rose-800">
                  Offense &amp; Traffic Violation
                </span>
                <p className="mt-1 text-sm font-bold text-rose-950 leading-relaxed">
                  {selectedChallan.offenseDetails || 'Traffic Violation'}
                </p>

                {/* Offense Details List */}
                {selectedChallan.offenseDetailsList && selectedChallan.offenseDetailsList.length > 0 ? (
                  <div className="mt-3 space-y-2">
                    <span className="text-[11px] font-bold uppercase tracking-wide text-rose-700">Violations Breakdown:</span>
                    {selectedChallan.offenseDetailsList.map((item, idx) => {
                      const name = typeof item === 'string' ? item : item?.offenseName || String(item);
                      return (
                        <div key={idx} className="flex items-start gap-2.5 rounded-xl border border-rose-200/80 bg-white p-2.5 text-xs font-semibold text-rose-950 shadow-xs">
                          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-rose-100 font-mono text-[11px] font-bold text-rose-800">
                            {idx + 1}
                          </span>
                          <span className="mt-0.5 leading-relaxed">{name}</span>
                        </div>
                      );
                    })}
                  </div>
                ) : null}
              </div>

              {/* Grid of Key Metadata */}
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Date &amp; Time</span>
                  <p className="mt-1 font-mono text-sm font-bold text-slate-900">
                    {formatDate(selectedChallan.challanDateTime || selectedChallan.challanDate)}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Place of Offense</span>
                  <p className="mt-1 text-sm font-bold text-slate-900">
                    {selectedChallan.challanPlace?.replace(/_/g, ' ') || 'Not specified'}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">State / RTO</span>
                  <p className="mt-1 text-sm font-bold text-slate-900">
                    {selectedChallan.state || 'N/A'}{selectedChallan.rto ? ` • ${selectedChallan.rto}` : ''}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Accused / Violator</span>
                  <p className="mt-1 text-sm font-bold text-slate-900">
                    {selectedChallan.accusedName || 'Not available'}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Court Proceeding</span>
                  <p className="mt-1 text-sm font-bold text-slate-900">
                    {selectedChallan.courtChallan ? `Yes (Court: ${selectedChallan.courtName || 'Referred'})` : 'No Court Case'}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Upstream Provider Code</span>
                  <p className="mt-1 font-mono text-sm font-bold text-slate-900">
                    {selectedChallan.upstreamCode || 'N/A'}
                  </p>
                </div>
              </div>

              {/* Registry Source Reference (Clean, no JSON) */}
              <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Registry Source Reference</span>
                <p className="mt-1 font-mono text-xs font-bold text-slate-700">
                  Record Serial #{selectedChallan.number || '1'} • Gateway Reference: {selectedChallan.upstreamCode || 'Official Transport Records'}
                </p>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function HistoryTable({ records, onSelect }: { records: RcChallanHistoryRecord[]; onSelect: (id: string) => void }) {
  if (!records.length) {
    return <div className="mt-6 rounded-xl border border-dashed border-slate-300 py-12 text-center text-sm text-slate-500">No RC Challan history found.</div>;
  }

  return (
    <div className="mt-5 overflow-x-auto [scrollbar-width:thin] rounded-xl border border-slate-200">
      <table className="w-full min-w-[620px] text-left text-sm border-collapse">
        <thead className="bg-slate-50 border-b border-slate-200 text-xs font-bold uppercase tracking-wider text-slate-500">
          <tr>
            <th className="sticky left-0 z-10 bg-slate-50 px-3 py-3 shadow-[1px_0_0_0_#e2e8f0]">RC Number</th>
            <th className="px-3 py-3 text-center">Challans</th>
            <th className="px-3 py-3">Pending Fine</th>
            <th className="px-3 py-3">Total Amount</th>
            <th className="px-3 py-3">Result</th>
            <th className="px-3 py-3">Date</th>
            <th className="px-3 py-3 text-right">Action</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {records.map((record) => (
            <tr key={record.id} className="group hover:bg-slate-50/80 transition">
              <td className="sticky left-0 z-10 bg-white px-3 py-3 font-mono font-bold text-slate-900 shadow-[1px_0_0_0_#e2e8f0] group-hover:bg-slate-50 whitespace-nowrap">
                {record.maskedRcNumber}
              </td>
              <td className="px-3 py-3 font-mono text-center text-slate-700">{record.totalChallans}</td>
              <td className="px-3 py-3">
                <span className={`font-mono text-xs font-bold ${Number(record.knownPendingAmount) > 0 ? 'text-amber-800' : 'text-slate-600'}`}>
                  {record.knownPendingCount} · {formatMoney(record.knownPendingAmount)}
                </span>
              </td>
              <td className="px-3 py-3 font-mono text-slate-700">{formatMoney(record.totalReturnedAmount)}</td>
              <td className="px-3 py-3">
                <StatusBadge status={record.status} />
              </td>
              <td className="px-3 py-3 text-xs text-slate-500 whitespace-nowrap">
                {formatDate(record.createdAt)}
              </td>
              <td className="px-3 py-3 text-right">
                <button
                  type="button"
                  onClick={() => onSelect(record.id)}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-bold text-slate-700 shadow-sm hover:bg-slate-100"
                >
                  <Eye className="h-3.5 w-3.5 text-slate-500" />
                  View
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function RcChallanVerificationPage({ embedded = false }: { embedded?: boolean } = {}) {
  const { user } = useAuthStore();
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';
  const permissions = user?.permissions;
  const canVerify = isSuperAdmin || hasAnyPermission(permissions, ['rc.challan.verification.read']);
  const canHistory = isSuperAdmin || hasAnyPermission(permissions, ['rc.challan.verification.read']);
  const [form, setForm] = useState<RcChallanFormState>(initialForm);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [response, setResponse] = useState<RcChallanVerificationResponse | null>(null);
  const [history, setHistory] = useState<RcChallanHistoryResponse | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historySearch, setHistorySearch] = useState('');
  const [historyPage, setHistoryPage] = useState(1);

  const loadHistory = useCallback(async (page = historyPage, search = historySearch) => {
    if (!canHistory) return;
    setHistoryLoading(true);
    try {
      const result = await api.get<RcChallanHistoryResponse>('/rc-challan-verification/history', { params: { page, limit: 20, search: search || undefined } });
      setHistory(result.data);
    } catch (requestError) {
      setError(safeApiError(requestError, 'Unable to load RC Challan history.'));
    } finally {
      setHistoryLoading(false);
    }
  }, [canHistory, historyPage, historySearch]);

  useEffect(() => { void loadHistory(); }, [loadHistory]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setResponse(null);
    const cleanForm = {
      rcNumber: sanitizeRcNumber(form.rcNumber),
    };
    setForm(cleanForm);
    const validationError = validateRcChallanForm(cleanForm);
    if (validationError) { setError(validationError); return; }
    setBusy(true);
    try {
      const result = await api.post<RcChallanVerificationResponse>('/rc-challan-verification/verify', normalizeRcChallanForm(cleanForm));
      setResponse(result.data);
      if (canHistory) { setHistoryPage(1); void loadHistory(1, historySearch); }
    } catch (requestError) {
      setError(safeApiError(requestError, 'RC Challan could not be completed.'));
    } finally {
      setBusy(false);
    }
  };

  const openDetail = async (id: string) => {
    setError('');
    try {
      const result = await api.get<RcChallanVerificationResponse>(`/rc-challan-verification/history/${id}`);
      setResponse(result.data);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (requestError) {
      setError(safeApiError(requestError, 'Unable to load this RC Challan result.'));
    }
  };

  return (
    <main className={embedded ? 'w-full' : 'min-h-full bg-slate-50 p-4 sm:p-6 lg:p-8'}>
      <div className="mx-auto max-w-7xl">
        {!embedded ? (
          <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-amber-600">Vehicle &amp; Transport</p>
              <h1 className="mt-1 text-2xl font-bold text-slate-950 sm:text-3xl">RC Challan</h1>
              <p className="mt-1 max-w-2xl text-sm text-slate-500">Search traffic challan records and blacklist status through the configured Surepass RC Challan service.</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-500">Provider: Surepass</div>
          </div>
        ) : null}

        <div className="grid gap-6 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
          {/* Left Section: Form & Result Cards */}
          <section className="flex flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7 lg:max-h-[calc(100vh-140px)] overflow-hidden">
            <div className="flex-1 overflow-y-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
              <div className="mb-5 flex items-start gap-3 rounded-xl bg-slate-50 p-3 text-sm text-slate-600">
                <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
                <p>Enter the vehicle registration number. It is normalized and validated before any billable provider request.</p>
              </div>

              <form onSubmit={submit} className="space-y-4">
                <label className="block">
                  <span className="text-sm font-semibold text-slate-700">Vehicle Registration Number <span className="text-red-500">*</span></span>
                  <input
                    value={form.rcNumber}
                    onChange={(event) => setForm((current) => ({ ...current, rcNumber: sanitizeRcNumber(event.target.value) }))}
                    className={inputClass}
                    placeholder="HR55AP0244"
                    autoComplete="off"
                    maxLength={30}
                  />
                </label>
                {error ? (
                  <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700" role="alert">
                    <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
                    {error}
                  </div>
                ) : null}
                <button type="submit" disabled={busy || !canVerify} className={`${buttonClass} w-full`}>
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileCheck2 className="h-4 w-4" />}
                  {busy ? 'Verifying…' : canVerify ? 'Verify Challan' : 'Verification not permitted'}
                </button>
              </form>

              {response ? <ResultPanel response={response} /> : null}
            </div>
          </section>

          {/* Right Section: History */}
          {canHistory ? (
            <section className="flex flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7 lg:max-h-[calc(100vh-140px)] overflow-hidden">
              <div className="flex-1 overflow-y-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900">
                      <History className="h-5 w-5 text-amber-600" />
                      RC Challan History
                    </h2>
                    <p className="text-sm text-slate-500">Only masked RC values are shown in history.</p>
                  </div>
                  <div className="flex gap-2">
                    <input
                      value={historySearch}
                      onChange={(event) => setHistorySearch(sanitizeRcNumber(event.target.value))}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          setHistoryPage(1);
                          void loadHistory(1, historySearch);
                        }
                      }}
                      className="min-w-0 rounded-xl border border-slate-200 px-3 py-2 text-sm"
                      placeholder="Search masked RC"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setHistoryPage(1);
                        void loadHistory(1, historySearch);
                      }}
                      className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                      aria-label="Search history"
                    >
                      <Search className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {historyLoading ? (
                  <div className="flex justify-center py-12">
                    <Loader2 className="h-6 w-6 animate-spin text-amber-600" />
                  </div>
                ) : history ? (
                  <HistoryTable records={history.records} onSelect={openDetail} />
                ) : (
                  <div className="mt-6 rounded-xl border border-dashed border-slate-300 py-12 text-center text-sm text-slate-500">
                    No history loaded.
                  </div>
                )}

                {history?.pagination.totalPages && history.pagination.totalPages > 1 ? (
                  <div className="mt-5 flex items-center justify-between text-sm text-slate-600">
                    <span>Page {history.pagination.page} of {history.pagination.totalPages}</span>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={historyPage <= 1}
                        onClick={() => {
                          const next = historyPage - 1;
                          setHistoryPage(next);
                          void loadHistory(next, historySearch);
                        }}
                        className="rounded-lg border border-slate-200 px-3 py-1.5 disabled:opacity-40"
                      >
                        Previous
                      </button>
                      <button
                        type="button"
                        disabled={historyPage >= history.pagination.totalPages}
                        onClick={() => {
                          const next = historyPage + 1;
                          setHistoryPage(next);
                          void loadHistory(next, historySearch);
                        }}
                        className="rounded-lg border border-slate-200 px-3 py-1.5 disabled:opacity-40"
                      >
                        Next
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            </section>
          ) : null}
        </div>
      </div>
    </main>
  );
}
