/* eslint-disable react-hooks/set-state-in-effect */
'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  BadgeCheck,
  Building2,
  CalendarDays,
  CheckCircle2,
  Eye,
  FileCheck2,
  FileSearch,
  History,
  Loader2,
  Search,
  ShieldAlert,
  ShieldCheck,
  XCircle,
  ScanLine,
  ArrowLeft,
  ArrowRight,
  Phone,
  Sparkles,
  Database,
  Layers,
  Zap,
  RefreshCw,
  Copy,
  Check,
  FileText,
  MapPin,
  User,
  WalletCards,
} from 'lucide-react';
import api from '@/lib/api';
import HistoryPagination from '@/components/ui/HistoryPagination';
import { hasAnyPermission } from '@/lib/permissionUtils';
import { canViewFeature, AADHAAR_DIGILOCKER_VIEW_PERMISSIONS, GST_VIEW_PERMISSIONS, PAN_VIEW_PERMISSIONS } from '@/lib/featurePermissions';
import { useAuthStore } from '@/store/authStore';
import { useHeaderStore } from '@/store/headerStore';
import { useApiBillingSummary } from '@/hooks/useApiBillingSummary';
import { ApiServicePrice } from '@/components/apiBilling/ApiBillingDisplay';
import AadhaarDigiLockerPanel from '@/components/identityHub/AadhaarDigiLockerPanel';
import AadhaarTemplatePreview, { type AadhaarData, type AadhaarTemplateInfo } from '@/components/identityHub/AadhaarTemplatePreview';
import PanTemplatePreview, { formatPanDate } from '@/components/identityHub/PanTemplatePreview';
import GstTemplatePreview from '@/components/identityHub/GstTemplatePreview';
import {
  normalizePan,
  operationLabel,
  PAN_COMPREHENSIVE_OPERATION,
  PAN_COMPREHENSIVE_ROUTE,
  safeApiError as safePanApiError,
  validateDob,
  validatePan,
  type PanRecord,
  type PanResultResponse,
} from '@/lib/panVerification';
import {
  normalizeGstin,
  safeApiError as safeGstApiError,
  validateGstin,
  type GstRecord,
  type GstResultResponse,
} from '@/lib/gstVerification';
import {
  normalizeMobileNumber,
  normalizeMobileToPanName,
  safeApiError as safeMobileToPanApiError,
  validateMobileNumber,
  validateMobileToPanName,
  type MobileToPanRecord,
  type MobileToPanResponse,
} from '@/lib/mobileToPan';
import {
  sanitizePan,
  sanitizeGstin,
  sanitizePersonName,
  sanitizeMobileNumber,
  sanitizeSearchInput,
} from '@/lib/verificationSanitizers';
import { filterDrivingLicenseDobYears, getDrivingLicenseDobYears } from '@/lib/drivingLicenseVerification';
import { dedupeIdentityHistoryRecords } from '@/lib/identityHubHistory.mjs';
import { getAadhaarTemplateBlob } from '@/lib/aadhaarTemplateCache';

// --- Shared Types & Helpers ---
type Tab = 'overview' | 'pan' | 'gst' | 'mobileToPan' | 'aadhaar';
type PanTab = 'verify' | 'aadhaar' | 'contact' | 'comprehensive';
type AadhaarRecord = {
  id: string;
  side: string;
  status: string;
  maskedAadhaar: string;
  provider?: string | null;
  providerClientId?: string | null;
  messageCode: string | null;
  safeMessage: string | null;
  createdAt: string;
  completedAt?: string | null;
  rawDataExpiresAt?: string | null;
  template?: AadhaarTemplateInfo | null;
};
type AadhaarResultResponse = { record: AadhaarRecord; result: AadhaarData | null; template?: AadhaarTemplateInfo | null };
type HistoryDetailResponse = PanResultResponse | GstResultResponse | MobileToPanResponse | AadhaarResultResponse;
type UnifiedRecord = (
  | (PanRecord & { _type: 'PAN' })
  | (GstRecord & { _type: 'GST' })
  | (MobileToPanRecord & { _type: 'MOBILE_TO_PAN' })
  | (AadhaarRecord & { _type: 'AADHAAR' })
);

const inputClass = 'mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20';
const buttonClass = 'inline-flex items-center justify-center gap-2 rounded-xl bg-amber-500 hover:bg-amber-400 px-4 py-2 text-xs font-bold text-slate-950 transition shadow-xs disabled:cursor-not-allowed disabled:opacity-50';

function SearchableDobPicker({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const today = new Date();
  const todayIso = today.toISOString().slice(0, 10);
  const initialYear = Number(value.slice(0, 4)) || today.getFullYear();
  const initialMonth = Number(value.slice(5, 7)) - 1;
  const [open, setOpen] = useState(false);
  const [yearQuery, setYearQuery] = useState(String(initialYear));
  const [viewYear, setViewYear] = useState(initialYear);
  const [viewMonth, setViewMonth] = useState(Number.isInteger(initialMonth) && initialMonth >= 0 ? initialMonth : today.getMonth());
  const pickerRef = useRef<HTMLDivElement>(null);
  const years = getDrivingLicenseDobYears();
  const filteredYears = filterDrivingLicenseDobYears(years, yearQuery);
  const daysInMonth = new Date(Date.UTC(viewYear, viewMonth + 1, 0)).getUTCDate();
  const firstDay = new Date(Date.UTC(viewYear, viewMonth, 1)).getUTCDay();
  const selectedDay = Number(value.slice(8, 10));
  const displayValue = /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value.slice(8, 10)}-${value.slice(5, 7)}-${value.slice(0, 4)}` : '';

  useEffect(() => {
    if (!open) return;
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', closeOnOutsideClick);
    return () => document.removeEventListener('pointerdown', closeOnOutsideClick);
  }, [open]);

  const chooseYear = (year: number) => {
    setViewYear(year);
    setYearQuery(String(year));
  };
  const chooseDay = (day: number) => {
    const date = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    if (date <= todayIso) {
      onChange(date);
      setOpen(false);
    }
  };
  const moveMonth = (offset: number) => {
    const next = new Date(Date.UTC(viewYear, viewMonth + offset, 1));
    if (next.getUTCFullYear() >= 1900 && next <= new Date(Date.UTC(today.getFullYear(), today.getMonth(), 1))) {
      setViewYear(next.getUTCFullYear());
      setViewMonth(next.getUTCMonth());
      setYearQuery(String(next.getUTCFullYear()));
    }
  };

  return <div ref={pickerRef} className="relative">
    <input readOnly value={displayValue} onClick={() => setOpen(true)} className={`${inputClass} pr-11`} placeholder="dd-mm-yyyy" aria-label="Date of birth" />
    <button type="button" onClick={() => setOpen((current) => !current)} className="absolute right-0 top-1 flex h-[calc(100%-0.25rem)] w-10 items-center justify-center text-slate-500 hover:text-slate-900" aria-label="Open date of birth calendar" aria-expanded={open}><CalendarDays className="h-3.5 w-3.5" /></button>
    {open ? <div className="absolute z-30 mt-2 w-full min-w-[290px] rounded-xl border border-slate-200 bg-white p-3 shadow-xl" role="dialog" aria-label="Date of birth calendar">
      <div className="flex items-center justify-between gap-2"><button type="button" onClick={() => moveMonth(-1)} className="rounded-lg px-2 py-1 text-lg text-slate-600 hover:bg-slate-100" aria-label="Previous month">‹</button><p className="text-sm font-bold text-slate-800">{new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(viewYear, viewMonth, 1)))}</p><button type="button" onClick={() => moveMonth(1)} className="rounded-lg px-2 py-1 text-lg text-slate-600 hover:bg-slate-100" aria-label="Next month">›</button></div>
      <div className="relative mt-3"><input value={yearQuery} onFocus={() => setYearQuery('')} onChange={(event) => setYearQuery(event.target.value.replace(/\D/g, '').slice(0, 4))} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20" placeholder="Search year" inputMode="numeric" role="combobox" aria-expanded="true" aria-controls="pan-dob-year-options" aria-label="Search date of birth year" autoComplete="off" />{yearQuery !== String(viewYear) || !value ? <div id="pan-dob-year-options" className="absolute left-0 right-0 top-full z-40 mt-1 max-h-40 overflow-y-auto rounded-lg border border-slate-200 bg-white p-1 shadow-lg" role="listbox">{filteredYears.length ? filteredYears.slice(0, 8).map((year) => <button key={year} type="button" role="option" aria-selected={year === viewYear} onClick={() => chooseYear(year)} className="block w-full rounded-md px-3 py-1.5 text-left text-sm hover:bg-amber-50">{year}</button>) : <p className="px-3 py-2 text-xs text-slate-500">No matching year</p>}</div> : null}</div>
      <div className="mt-3 grid grid-cols-7 text-center text-xs font-semibold text-slate-400">{['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((day) => <span key={day} className="py-1">{day}</span>)}{Array.from({ length: firstDay }, (_, index) => <span key={`blank-${index}`} />)}{Array.from({ length: daysInMonth }, (_, index) => { const day = index + 1; const iso = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`; const disabled = iso > todayIso; return <button key={day} type="button" disabled={disabled} onClick={() => chooseDay(day)} className={`rounded-lg py-1.5 text-sm ${day === selectedDay && viewYear === Number(value.slice(0, 4)) && viewMonth === Number(value.slice(5, 7)) - 1 ? 'bg-amber-500 font-bold text-slate-950' : 'text-slate-700 hover:bg-amber-50'} disabled:cursor-not-allowed disabled:text-slate-300`}>{day}</button>; })}</div>
    </div> : null}
  </div>;
}

const formatDate = (value: unknown, active = false) => {
  if (typeof value !== 'string' || !value.trim()) return null;
  if (/^18\d{2}-\d{2}-\d{2}/.test(value)) return active ? 'Not Applicable' : null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
};

const titleize = (value: string) => value.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());

function SafeValue({ value }: { value: unknown }) {
  if (value === null || value === undefined || value === '') return <span className="text-slate-400 font-normal">Not available</span>;

  if (typeof value === 'boolean') {
    return <span className={value ? 'font-semibold text-emerald-700' : 'text-slate-600'}>{value ? 'Yes / Active' : 'No / Inactive'}</span>;
  }

  if (typeof value === 'string' && /^18\d{2}-\d{2}-\d{2}/.test(value)) {
    return <span className="text-slate-400 font-normal">Not Applicable</span>;
  }

  if (Array.isArray(value)) {
    if (!value.length) return <span className="text-slate-400 font-normal">Not available</span>;
    return (
      <ul className="space-y-1.5 text-slate-800">
        {value.map((item, index) => (
          <li key={index} className="rounded-lg bg-slate-50 px-3 py-1.5 text-xs font-medium">
            {typeof item === 'object' && item !== null ? <SafeValue value={item} /> : String(item)}
          </li>
        ))}
      </ul>
    );
  }

  if (typeof value === 'object') {
    return (
      <div className="space-y-2 rounded-xl border border-slate-200/70 bg-slate-50/70 p-3">
        {Object.entries(value as Record<string, unknown>).map(([key, item]) => {
          if (item === null || item === undefined || item === '') return null;
          return (
            <div key={key} className="flex flex-col border-b border-slate-200/40 pb-1.5 last:border-0 last:pb-0 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
              <span className="shrink-0 text-[11px] font-semibold uppercase tracking-wider text-slate-500">{titleize(key)}</span>
              <span className="min-w-0 break-all text-xs font-semibold text-slate-800 sm:text-right"><SafeValue value={item} /></span>
            </div>
          );
        })}
      </div>
    );
  }

  return <span className="min-w-0 break-all text-slate-800">{String(value)}</span>;
}

function Field({ label, value }: { label: string; value: unknown }) {
  if (value === null || value === undefined || value === '') return null;
  return (
    <div className="min-w-0 rounded-xl border border-slate-200/80 bg-white p-3 shadow-2xs">
      <dt className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</dt>
      <dd className="mt-0.5 min-w-0 break-all text-xs font-semibold text-slate-900"><SafeValue value={value} /></dd>
    </div>
  );
}

function StatusBadge({ status }: { status: unknown }) {
  const label = typeof status === 'string' && status.trim() ? status : 'Not available';
  const normalized = label.toUpperCase();
  const tone = normalized === 'ACTIVE' || normalized === 'SUCCESS' ? 'bg-emerald-100 text-emerald-700' : normalized === 'CANCELLED' || normalized === 'INACTIVE' || normalized === 'FAILED' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700';
  return <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-bold ${tone}`}>{label}</span>;
}

function VerificationHistoryState({
  title,
  record,
}: {
  title: string;
  record: { status: string; safeMessage: string | null; messageCode: string | null; createdAt: string };
}) {
  const isPending = record.status === 'PENDING';
  return (
    <div className={`mt-4 rounded-xl border p-3.5 ${isPending ? 'border-amber-200 bg-amber-50' : 'border-red-200 bg-red-50'}`} role="status" aria-live="polite">
      <div className={`flex items-center gap-2 text-xs font-bold ${isPending ? 'text-amber-800' : 'text-red-800'}`}>
        {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
        {title} {isPending ? 'is still processing' : 'failed'}
      </div>
      <p className={`mt-1.5 text-xs ${isPending ? 'text-amber-800' : 'text-red-800'}`}>
        {record.safeMessage || (isPending ? 'The provider has not completed this verification yet.' : 'The provider did not return a successful result.')}
      </p>
      <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-600">
        {record.messageCode ? <span>Code: <strong>{record.messageCode}</strong></span> : null}
        <span>Requested: <strong>{formatDate(record.createdAt) || 'Not available'}</strong></span>
      </div>
    </div>
  );
}

// --- Detail Panels ---
function PanResultPanel({ response, onUploaded, panNumber }: { response: PanResultResponse; onUploaded?: (response: PanResultResponse) => void; panNumber?: string }) {
  if (response.record.status !== 'SUCCESS') {
    return <VerificationHistoryState title={operationLabel(response.record.operation)} record={response.record} />;
  }
  return <PanTemplatePreview response={response} onUploaded={onUploaded} panNumber={panNumber} />;
}

function AadhaarResultPanel({ response, onUploaded }: { response: AadhaarResultResponse; onUploaded?: (template: AadhaarTemplateInfo) => void }) {
  if (response.record.status !== 'SUCCESS') {
    return <VerificationHistoryState title="Aadhaar verification" record={response.record} />;
  }
  return (
    <AadhaarTemplatePreview
      data={response.result}
      recordId={response.record.id}
      recordMaskedAadhaar={response.record.maskedAadhaar}
      template={response.template || response.record.template || null}
      onUploaded={onUploaded}
    />
  );
}

function MobileToPanResultPanel({ response }: { response: MobileToPanResponse }) {
  if (response.record.status !== 'SUCCESS') {
    return <VerificationHistoryState title="Mobile To PAN lookup" record={response.record} />;
  }
  const result = response.result;
  return (
    <div className="mt-4 space-y-3" role="status" aria-live="polite">
      <div className="flex flex-col gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2 text-xs font-bold text-emerald-800">
          <CheckCircle2 className="h-4 w-4" />Mobile To PAN lookup completed
        </div>
        <div className="text-[11px] font-semibold text-emerald-800">{response.cacheHit ? 'Source: Saved DB result' : 'Source: Surepass API'}</div>
      </div>
      <section className="rounded-xl border border-slate-200 bg-slate-50 p-3 sm:p-4">
        <h2 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-900"><Phone className="h-4 w-4 text-amber-600" />Mobile To PAN Result</h2>
        <dl className="mt-3 grid gap-2.5 sm:grid-cols-2">
          <Field label="Name" value={result?.name} />
          <Field label="Mobile number" value={result?.mobileNumber} />
          <Field label="PAN number" value={result?.panNumber} />
          <Field label="Provider client id" value={result?.providerClientId || response.record.providerClientId} />
        </dl>
      </section>
    </div>
  );
}

function GstResultPanel({ response, onUploaded }: { response: GstResultResponse; onUploaded?: (response: GstResultResponse) => void }) {
  if (response.record.status !== 'SUCCESS') {
    return <VerificationHistoryState title="GST verification" record={response.record} />;
  }
  if (response.template && !response.result) {
    return <GstTemplatePreview response={response} onUploaded={onUploaded} />;
  }
  const result = response.result || {};
  const isActive = typeof result.gstinStatus === 'string' && result.gstinStatus.toUpperCase() === 'ACTIVE';

  return (
    <div className="mt-4 space-y-3" role="status" aria-live="polite">
      <div className="flex flex-col gap-2 rounded-xl border border-emerald-200 bg-emerald-50/90 p-3 sm:flex-row sm:items-center sm:justify-between shadow-2xs">
        <div className="flex items-center gap-2 text-xs font-bold text-emerald-900">
          <BadgeCheck className="h-4 w-4 text-emerald-600 shrink-0" />
          Lookup Completed Successfully
        </div>
        <div className="text-[11px] font-semibold text-emerald-800">
          {response.cacheHit ? 'Source: Saved Database Record' : `Provider Status: ${response.record.status}`}
        </div>
      </div>

      <section className="rounded-xl border border-slate-200 bg-slate-50/60 p-3 sm:p-4">
        <h2 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-900">
          <FileCheck2 className="h-4 w-4 text-amber-600" />
          GST Registration Details
        </h2>
        <dl className="mt-2.5 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="GSTIN" value={result.gstin || response.record.maskedGstin} />
          <div className="min-w-0 rounded-xl border border-slate-200/80 bg-white p-3 shadow-2xs">
            <dt className="text-[10px] font-bold uppercase tracking-wider text-slate-500">GST Status</dt>
            <dd className="mt-1"><StatusBadge status={result.gstinStatus || response.record.gstinStatus} /></dd>
          </div>
          <Field label="Registration Date" value={formatDate(result.dateOfRegistration)} />
          <Field label="Cancellation Date" value={formatDate(result.dateOfCancellation, isActive)} />
          <Field label="Taxpayer Type" value={result.taxpayerType} />
          <Field label="Constitution of Business" value={result.constitutionOfBusiness} />
        </dl>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-3 sm:p-4">
        <h2 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-900">
          <Building2 className="h-4 w-4 text-amber-600" />
          Business Information
        </h2>
        <dl className="mt-2.5 grid gap-2.5 sm:grid-cols-2">
          <Field label="Business Name" value={result.businessName} />
          <Field label="Legal Name" value={result.legalName} />
          <Field label="PAN Number" value={result.panNumber} />
          <Field label="Address" value={result.address} />
        </dl>
      </section>

      {Boolean(result.centerJurisdiction || result.stateJurisdiction || result.natureOfCoreBusinessActivityDescription || result.natureOfBusinessActivities) && (
        <section className="rounded-xl border border-slate-200 bg-white p-3 sm:p-4">
          <h2 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-900">
            <ShieldAlert className="h-4 w-4 text-amber-600" />
            Jurisdiction &amp; Business Activities
          </h2>
          <dl className="mt-2.5 grid gap-2.5 sm:grid-cols-2">
            <Field label="Center Jurisdiction" value={result.centerJurisdiction} />
            <Field label="State Jurisdiction" value={result.stateJurisdiction} />
            <Field label="Core Business Activity" value={result.natureOfCoreBusinessActivityDescription} />
            <Field label="Business Activities" value={result.natureOfBusinessActivities} />
          </dl>
        </section>
      )}

      {Boolean(result.providerData) && (
        <section className="rounded-xl border border-slate-200 bg-white p-3 sm:p-4">
          <h2 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-900 mb-2">
            <FileSearch className="h-4 w-4 text-amber-600" />
            Complete Provider Response Data
          </h2>
          {typeof result.providerData === 'object' ? (
            <details className="rounded-lg border border-slate-200 bg-slate-50 p-2.5">
              <summary className="cursor-pointer text-xs font-semibold text-slate-700">View safe fields from Surepass</summary>
              <pre className="mt-2 max-h-[24rem] overflow-auto whitespace-pre-wrap break-words rounded-lg bg-slate-950 p-2.5 text-[11px] leading-4 text-slate-100">{JSON.stringify(result.providerData, null, 2)}</pre>
            </details>
          ) : <p className="text-xs text-slate-500">No provider detail was returned.</p>}
        </section>
      )}

      <GstTemplatePreview response={response} onUploaded={onUploaded} />
    </div>
  );
}

// ========================================================
// 1. PAN COMPREHENSIVE SUBCOMPONENTS
// ========================================================
function PanTemplatePlaceholderCard() {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs flex flex-col justify-between min-h-[480px]">
      <div>
        <div className="flex items-center justify-between border-b border-slate-100 pb-3.5">
          <div>
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-amber-500" />
              PAN Card Template Studio
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Official Income Tax Department format with photo, QR code &amp; signature.
            </p>
          </div>
          <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] font-bold text-slate-600">
            Awaiting Verification
          </span>
        </div>

        {/* Blueprint Preview Frame */}
        <div className="mt-5 rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50/70 p-6 flex flex-col items-center justify-center text-center min-h-[340px]">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-100 text-amber-700 shadow-xs mb-3">
            <ScanLine className="h-8 w-8" />
          </div>
          <h4 className="text-sm font-bold text-slate-800">No Active Template Generated</h4>
          <p className="text-xs text-slate-500 max-w-sm mt-1.5 leading-relaxed">
            Enter citizen&apos;s PAN number on the left and click <strong>Run Verification</strong> to generate the live official PAN card template.
          </p>

          <div className="mt-6 grid grid-cols-2 gap-2.5 w-full max-w-sm text-left">
            <div className="rounded-xl bg-white border border-slate-200/80 p-2.5 text-xs text-slate-700 font-medium flex items-center gap-2 shadow-2xs">
              <Check className="h-4 w-4 text-amber-600 shrink-0" /> ITD Card Layout
            </div>
            <div className="rounded-xl bg-white border border-slate-200/80 p-2.5 text-xs text-slate-700 font-medium flex items-center gap-2 shadow-2xs">
              <Check className="h-4 w-4 text-amber-600 shrink-0" /> Encrypted QR Code
            </div>
            <div className="rounded-xl bg-white border border-slate-200/80 p-2.5 text-xs text-slate-700 font-medium flex items-center gap-2 shadow-2xs">
              <Check className="h-4 w-4 text-amber-600 shrink-0" /> 1-Click PDF Download
            </div>
            <div className="rounded-xl bg-white border border-slate-200/80 p-2.5 text-xs text-slate-700 font-medium flex items-center gap-2 shadow-2xs">
              <Check className="h-4 w-4 text-amber-600 shrink-0" /> High-Res PNG Output
            </div>
          </div>
        </div>
      </div>

      <p className="mt-4 text-center text-[11px] text-slate-400">
        Template generated directly from verified ITD data · For reference &amp; official KYC verification only
      </p>
    </div>
  );
}

function PanTaxpayerDossier({
  response,
  panNumber,
  onReset,
}: {
  response: PanResultResponse;
  panNumber?: string;
  onReset?: () => void;
}) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const copyToClipboard = (key: string, text: string) => {
    if (!text) return;
    void navigator.clipboard.writeText(text);
    setCopiedKey(key);
    window.setTimeout(() => setCopiedKey(null), 2000);
  };

  const details = (response.result?.panDetails && typeof response.result.panDetails === 'object' && !Array.isArray(response.result.panDetails))
    ? (response.result.panDetails as Record<string, unknown>)
    : {};
  const providerData = (response.result?.providerData && typeof response.result.providerData === 'object' && !Array.isArray(response.result.providerData))
    ? (response.result.providerData as Record<string, unknown>)
    : {};
  const providerDetails = (providerData.pan_details && typeof providerData.pan_details === 'object' && !Array.isArray(providerData.pan_details))
    ? (providerData.pan_details as Record<string, unknown>)
    : {};

  const fullName = String(
    details.fullName ||
    details.full_name ||
    response.result?.fullName ||
    response.result?.name ||
    providerData.full_name ||
    providerData.fullName ||
    providerData.name ||
    providerDetails.full_name ||
    providerDetails.fullName ||
    'NOT SPECIFIED'
  );

  const fatherName = String(
    details.fatherName ||
    details.father_name ||
    response.result?.fatherName ||
    response.result?.father_name ||
    (providerData.pan_to_father_name && typeof providerData.pan_to_father_name === 'object' ? (providerData.pan_to_father_name as Record<string, unknown>).father_name : '') ||
    providerData.father_name ||
    providerData.fatherName ||
    providerData.care_of ||
    providerDetails.father_name ||
    providerDetails.fatherName ||
    'Not Specified'
  );

  const rawDob = String(
    details.dob ||
    details.dateOfBirth ||
    details.inputDob ||
    response.result?.dob ||
    response.result?.dateOfBirth ||
    providerData.dob ||
    providerData.date_of_birth ||
    providerDetails.dob ||
    ''
  );
  const dobFormatted = rawDob ? formatPanDate(rawDob) : 'Not Available';

  const rawPan = String(
    panNumber ||
    response.result?.panNumber ||
    response.result?.pan ||
    providerData.pan_number ||
    response.record.maskedPan ||
    ''
  );

  const panStatus = String(
    details.panStatus ||
    details.pan_status ||
    response.result?.panStatus ||
    response.result?.pan_status ||
    providerData.pan_status ||
    providerData.status ||
    response.record.status ||
    'ACTIVE'
  ).toUpperCase();

  const aadhaarSeeding = String(
    details.aadhaarSeedingStatus ||
    details.aadhaar_seeding_status ||
    response.result?.aadhaarSeedingStatus ||
    response.result?.aadhaar_seeding_status ||
    providerData.aadhaar_seeding_status ||
    'N/A'
  );

  const category = String(
    details.category ||
    response.result?.category ||
    providerData.category ||
    'Individual'
  );

  const gender = String(
    details.gender ||
    response.result?.gender ||
    providerData.gender ||
    'N/A'
  ).toUpperCase();

  const address = String(
    details.address ||
    response.result?.address ||
    providerData.address ||
    ''
  );

  const isOperative = panStatus.includes('OPERATIVE') || panStatus === 'ACTIVE' || panStatus === 'SUCCESS';
  const isAadhaarLinked = aadhaarSeeding.toLowerCase().includes('linked') || aadhaarSeeding.toLowerCase().includes('yes') || aadhaarSeeding.toLowerCase().includes('successful');

  return (
    <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50/40 p-4 space-y-3.5 animate-in fade-in">
      <div className="flex items-center justify-between border-b border-emerald-200/60 pb-2.5">
        <span className="flex items-center gap-1.5 text-xs font-bold text-emerald-900">
          <BadgeCheck className="h-4 w-4 text-emerald-600" /> Official ITD PAN Verification Result
        </span>
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold text-emerald-800">
            {response.cacheHit ? 'Source: Saved Database Record' : 'Source: Surepass ITD Gateway'}
          </span>
          {onReset && (
            <button
              type="button"
              onClick={onReset}
              className="text-[11px] font-bold text-slate-500 hover:text-slate-800 underline ml-1"
            >
              Reset
            </button>
          )}
        </div>
      </div>

      {/* Taxpayer Profile Row */}
      <div className="flex items-center gap-3">
        <div className="relative shrink-0">
          <div className="flex h-14 w-14 items-center justify-center rounded-xl border border-amber-200 bg-amber-50 text-amber-700 shadow-2xs font-bold text-xl">
            {fullName.charAt(0).toUpperCase() || 'P'}
          </div>
          <span className="absolute -bottom-1 -right-1 flex h-4.5 w-4.5 items-center justify-center rounded-full bg-emerald-600 text-white shadow-2xs">
            <Check className="h-2.5 w-2.5 stroke-[3]" />
          </span>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h4 className="text-sm font-black text-slate-900 truncate">
              {fullName}
            </h4>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">
              {category}
            </span>
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="font-mono text-xs font-bold text-slate-800 tracking-wider">
              {rawPan}
            </span>
            <button
              type="button"
              onClick={() => copyToClipboard('pan', rawPan)}
              className="text-slate-400 hover:text-slate-700"
              title="Copy PAN"
            >
              {copiedKey === 'pan' ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
            </button>
            <button
              type="button"
              onClick={() => copyToClipboard('name', fullName)}
              className="text-slate-400 hover:text-slate-700 ml-1 text-[11px]"
              title="Copy Name"
            >
              {copiedKey === 'name' ? <Check className="h-3 w-3 text-emerald-600" /> : <span className="text-[10px] font-medium text-slate-500">Copy Name</span>}
            </button>
          </div>
        </div>
      </div>

      {/* Status Badges Row */}
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-lg bg-white border border-emerald-100 p-2 flex items-center justify-between">
          <span className="text-[10px] text-slate-500 font-medium">PAN Operative Status</span>
          <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold ${
            isOperative ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'
          }`}>
            {panStatus}
          </span>
        </div>
        <div className="rounded-lg bg-white border border-emerald-100 p-2 flex items-center justify-between">
          <span className="text-[10px] text-slate-500 font-medium">Aadhaar Seeding</span>
          <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold ${
            isAadhaarLinked ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
          }`}>
            {aadhaarSeeding}
          </span>
        </div>
      </div>

      {/* Demographics 2x2 */}
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-lg bg-white border border-emerald-100 p-2">
          <span className="text-[10px] text-slate-500 font-medium">Date of Birth</span>
          <p className="mt-0.5 font-bold text-slate-900">{dobFormatted}</p>
        </div>

        <div className="rounded-lg bg-white border border-emerald-100 p-2">
          <span className="text-[10px] text-slate-500 font-medium">Gender</span>
          <p className="mt-0.5 font-bold text-slate-900 uppercase">
            {gender === 'M' ? 'MALE (M)' : gender === 'F' ? 'FEMALE (F)' : gender}
          </p>
        </div>

        <div className="rounded-lg bg-white border border-emerald-100 p-2 col-span-2">
          <span className="text-[10px] text-slate-500 font-medium">Father&apos;s / Guardian&apos;s Name</span>
          <p className="mt-0.5 font-bold text-slate-900 truncate">
            {fatherName}
          </p>
        </div>
      </div>

      {/* Address if available */}
      {address && (
        <div>
          <div className="flex items-center justify-between text-[11px] font-bold text-slate-700 mb-1">
            <span className="flex items-center gap-1">
              <MapPin className="h-3 w-3 text-amber-600" /> Registered Taxpayer Address
            </span>
            <button
              type="button"
              onClick={() => copyToClipboard('addr', address)}
              className="text-[10px] font-semibold text-emerald-800 hover:underline"
            >
              {copiedKey === 'addr' ? 'Copied!' : 'Copy'}
            </button>
          </div>
          <div className="rounded-lg bg-white border border-emerald-100 p-2.5 text-xs text-slate-800 leading-relaxed font-medium">
            {address}
          </div>
        </div>
      )}

      {/* Wallet Billing Notice */}
      <div className="flex items-center justify-between text-[11px] text-slate-600 border-t border-emerald-200/50 pt-2">
        <span className="inline-flex items-center gap-1 text-emerald-800 font-semibold">
          <WalletCards className="h-3.5 w-3.5" /> Wallet billing is disabled — ₹0 deducted
        </span>
        <span>Remaining balance: <strong>₹50,000.00</strong></span>
      </div>
    </div>
  );
}

// ========================================================
// 2. GST VERIFICATION SUBCOMPONENTS
// ========================================================
function GstTemplatePlaceholderCard() {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs flex flex-col justify-between min-h-[480px]">
      <div>
        <div className="flex items-center justify-between border-b border-slate-100 pb-3.5">
          <div>
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <FileText className="h-4 w-4 text-indigo-600" />
              GST Certificate Studio
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Official Form GST REG-06 registration certificate preview &amp; download.
            </p>
          </div>
          <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] font-bold text-slate-600">
            Awaiting Verification
          </span>
        </div>

        {/* Blueprint Preview Frame */}
        <div className="mt-5 rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50/70 p-6 flex flex-col items-center justify-center text-center min-h-[340px]">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-100 text-indigo-700 shadow-xs mb-3">
            <FileCheck2 className="h-8 w-8" />
          </div>
          <h4 className="text-sm font-bold text-slate-800">No Active Certificate Generated</h4>
          <p className="text-xs text-slate-500 max-w-sm mt-1.5 leading-relaxed">
            Enter 15-digit GSTIN on the left and click <strong>Verify GSTIN</strong> to generate the official Government of India REG-06 certificate.
          </p>

          <div className="mt-6 grid grid-cols-2 gap-2.5 w-full max-w-sm text-left">
            <div className="rounded-xl bg-white border border-slate-200/80 p-2.5 text-xs text-slate-700 font-medium flex items-center gap-2 shadow-2xs">
              <Check className="h-4 w-4 text-indigo-600 shrink-0" /> Form GST REG-06
            </div>
            <div className="rounded-xl bg-white border border-slate-200/80 p-2.5 text-xs text-slate-700 font-medium flex items-center gap-2 shadow-2xs">
              <Check className="h-4 w-4 text-indigo-600 shrink-0" /> Government Emblem &amp; Seal
            </div>
            <div className="rounded-xl bg-white border border-slate-200/80 p-2.5 text-xs text-slate-700 font-medium flex items-center gap-2 shadow-2xs">
              <Check className="h-4 w-4 text-indigo-600 shrink-0" /> 1-Click Official PDF
            </div>
            <div className="rounded-xl bg-white border border-slate-200/80 p-2.5 text-xs text-slate-700 font-medium flex items-center gap-2 shadow-2xs">
              <Check className="h-4 w-4 text-indigo-600 shrink-0" /> Auto-Filled Business Info
            </div>
          </div>
        </div>
      </div>

      <p className="mt-4 text-center text-[11px] text-slate-400">
        Certificate generated directly from verified GSTN portal data · For official tax verification only
      </p>
    </div>
  );
}

function GstBusinessDossier({
  response,
  onReset,
}: {
  response: GstResultResponse;
  onReset?: () => void;
}) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const copyToClipboard = (key: string, text: string) => {
    if (!text) return;
    void navigator.clipboard.writeText(text);
    setCopiedKey(key);
    window.setTimeout(() => setCopiedKey(null), 2000);
  };

  const result = response.result || {};
  const gstinVal = String(result.gstin || response.record.maskedGstin || '');
  const legalName = String(result.legalName || result.businessName || 'N/A');
  const tradeName = String(result.tradeName || result.businessName || legalName);
  const statusStr = String(result.gstinStatus || response.record.gstinStatus || 'ACTIVE').toUpperCase();
  const isActive = statusStr === 'ACTIVE' || statusStr === 'SUCCESS';
  const taxpayerType = String(result.taxpayerType || 'Regular');
  const constitution = String(result.constitutionOfBusiness || 'Not Specified');
  const regDate = formatDate(result.dateOfRegistration);
  const cancelDate = formatDate(result.dateOfCancellation, isActive);
  const panNum = String(result.panNumber || '');
  const address = String(result.address || '');
  const centerJurisdiction = String(result.centerJurisdiction || '');
  const stateJurisdiction = String(result.stateJurisdiction || '');
  const coreActivity = String(result.natureOfCoreBusinessActivityDescription || result.natureOfBusinessActivities || '');

  return (
    <div className="mt-4 rounded-xl border border-indigo-200 bg-indigo-50/40 p-4 space-y-3.5 animate-in fade-in">
      <div className="flex items-center justify-between border-b border-indigo-200/60 pb-2.5">
        <span className="flex items-center gap-1.5 text-xs font-bold text-indigo-900">
          <BadgeCheck className="h-4 w-4 text-indigo-600" /> GST Common Portal (GSTN) Verified
        </span>
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold text-indigo-800">
            {response.cacheHit ? 'Source: Saved Database Record' : `Status: ${response.record.status}`}
          </span>
          {onReset && (
            <button
              type="button"
              onClick={onReset}
              className="text-[11px] font-bold text-slate-500 hover:text-slate-800 underline ml-1"
            >
              Reset
            </button>
          )}
        </div>
      </div>

      {/* Business Header Profile */}
      <div className="flex items-center gap-3">
        <div className="relative shrink-0">
          <div className="flex h-14 w-14 items-center justify-center rounded-xl border border-indigo-200 bg-indigo-100 text-indigo-700 shadow-2xs font-bold text-xl">
            <Building2 className="h-7 w-7" />
          </div>
          <span className="absolute -bottom-1 -right-1 flex h-4.5 w-4.5 items-center justify-center rounded-full bg-emerald-600 text-white shadow-2xs">
            <Check className="h-2.5 w-2.5 stroke-[3]" />
          </span>
        </div>

        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-black text-slate-900 truncate">
            {legalName}
          </h4>
          {tradeName !== legalName && (
            <p className="text-[11px] font-medium text-slate-500 truncate">Trade: {tradeName}</p>
          )}
          <div className="flex items-center gap-2 mt-0.5">
            <span className="font-mono text-xs font-bold text-slate-800 tracking-wider">
              {gstinVal}
            </span>
            <button
              type="button"
              onClick={() => copyToClipboard('gstin', gstinVal)}
              className="text-slate-400 hover:text-slate-700"
              title="Copy GSTIN"
            >
              {copiedKey === 'gstin' ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
            </button>
          </div>
        </div>
      </div>

      {/* Status Badges 2x2 */}
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-lg bg-white border border-indigo-100 p-2 flex items-center justify-between">
          <span className="text-[10px] text-slate-500 font-medium">GSTIN Status</span>
          <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold ${
            isActive ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'
          }`}>
            {statusStr}
          </span>
        </div>
        <div className="rounded-lg bg-white border border-indigo-100 p-2 flex items-center justify-between">
          <span className="text-[10px] text-slate-500 font-medium">Taxpayer Type</span>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-700">
            {taxpayerType}
          </span>
        </div>
      </div>

      {/* Business Details Grid */}
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-lg bg-white border border-indigo-100 p-2">
          <span className="text-[10px] text-slate-500 font-medium">Constitution of Business</span>
          <p className="mt-0.5 font-bold text-slate-900 truncate">{constitution}</p>
        </div>

        <div className="rounded-lg bg-white border border-indigo-100 p-2">
          <span className="text-[10px] text-slate-500 font-medium">PAN Number</span>
          <div className="mt-0.5 flex items-center gap-1.5">
            <span className="font-mono font-bold text-slate-900">{panNum || 'N/A'}</span>
            {panNum && (
              <button
                type="button"
                onClick={() => copyToClipboard('pan', panNum)}
                className="text-slate-400 hover:text-slate-700"
              >
                {copiedKey === 'pan' ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
              </button>
            )}
          </div>
        </div>

        <div className="rounded-lg bg-white border border-indigo-100 p-2">
          <span className="text-[10px] text-slate-500 font-medium">Date of Registration</span>
          <p className="mt-0.5 font-bold text-slate-900">{regDate || 'Not Available'}</p>
        </div>

        <div className="rounded-lg bg-white border border-indigo-100 p-2">
          <span className="text-[10px] text-slate-500 font-medium">Cancellation Date</span>
          <p className="mt-0.5 font-bold text-slate-900">{cancelDate || 'N/A'}</p>
        </div>
      </div>

      {/* Jurisdiction */}
      {(centerJurisdiction || stateJurisdiction) && (
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="rounded-lg bg-white border border-indigo-100 p-2">
            <span className="text-[10px] text-slate-500 font-medium">Center Jurisdiction</span>
            <p className="mt-0.5 font-bold text-slate-900 truncate">{centerJurisdiction || 'N/A'}</p>
          </div>
          <div className="rounded-lg bg-white border border-indigo-100 p-2">
            <span className="text-[10px] text-slate-500 font-medium">State Jurisdiction</span>
            <p className="mt-0.5 font-bold text-slate-900 truncate">{stateJurisdiction || 'N/A'}</p>
          </div>
        </div>
      )}

      {/* Principal Place of Business */}
      {address && (
        <div>
          <div className="flex items-center justify-between text-[11px] font-bold text-slate-700 mb-1">
            <span className="flex items-center gap-1">
              <MapPin className="h-3 w-3 text-indigo-600" /> Principal Place of Business
            </span>
            <button
              type="button"
              onClick={() => copyToClipboard('addr', address)}
              className="text-[10px] font-semibold text-indigo-800 hover:underline"
            >
              {copiedKey === 'addr' ? 'Copied!' : 'Copy'}
            </button>
          </div>
          <div className="rounded-lg bg-white border border-indigo-100 p-2.5 text-xs text-slate-800 leading-relaxed font-medium">
            {address}
          </div>
        </div>
      )}

      {/* Core Activity if available */}
      {coreActivity && (
        <div className="rounded-lg bg-white border border-indigo-100 p-2 text-xs">
          <span className="text-[10px] text-slate-500 font-medium">Core Business Activity</span>
          <p className="mt-0.5 font-medium text-slate-800 line-clamp-2">{coreActivity}</p>
        </div>
      )}

      {/* Wallet Billing Notice */}
      <div className="flex items-center justify-between text-[11px] text-slate-600 border-t border-indigo-200/50 pt-2">
        <span className="inline-flex items-center gap-1 text-indigo-800 font-semibold">
          <WalletCards className="h-3.5 w-3.5" /> Wallet billing is disabled — ₹0 deducted
        </span>
        <span>Remaining balance: <strong>₹50,000.00</strong></span>
      </div>
    </div>
  );
}

// ========================================================
// 3. MOBILE TO PAN SUBCOMPONENTS
// ========================================================
function MobileToPanPlaceholderCard() {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs flex flex-col justify-between min-h-[480px]">
      <div>
        <div className="flex items-center justify-between border-b border-slate-100 pb-3.5">
          <div>
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Phone className="h-4 w-4 text-blue-600" />
              Telecom Discovery Studio
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Telecom subscriber cross-reference &amp; PAN identity retrieval.
            </p>
          </div>
          <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] font-bold text-slate-600">
            Awaiting Lookup
          </span>
        </div>

        {/* Blueprint Preview Frame */}
        <div className="mt-5 rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50/70 p-6 flex flex-col items-center justify-center text-center min-h-[340px]">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-100 text-blue-700 shadow-xs mb-3">
            <Phone className="h-8 w-8" />
          </div>
          <h4 className="text-sm font-bold text-slate-800">No Active Lookup Performed</h4>
          <p className="text-xs text-slate-500 max-w-sm mt-1.5 leading-relaxed">
            Enter citizen&apos;s full legal name and 10-digit mobile number on the left and click <strong>Lookup Mobile To PAN</strong>.
          </p>

          <div className="mt-6 grid grid-cols-2 gap-2.5 w-full max-w-sm text-left">
            <div className="rounded-xl bg-white border border-slate-200/80 p-2.5 text-xs text-slate-700 font-medium flex items-center gap-2 shadow-2xs">
              <Check className="h-4 w-4 text-blue-600 shrink-0" /> Telecom Operator Check
            </div>
            <div className="rounded-xl bg-white border border-slate-200/80 p-2.5 text-xs text-slate-700 font-medium flex items-center gap-2 shadow-2xs">
              <Check className="h-4 w-4 text-blue-600 shrink-0" /> Masked PAN Discovery
            </div>
            <div className="rounded-xl bg-white border border-slate-200/80 p-2.5 text-xs text-slate-700 font-medium flex items-center gap-2 shadow-2xs">
              <Check className="h-4 w-4 text-blue-600 shrink-0" /> 1-Click PAN Bridge
            </div>
            <div className="rounded-xl bg-white border border-slate-200/80 p-2.5 text-xs text-slate-700 font-medium flex items-center gap-2 shadow-2xs">
              <Check className="h-4 w-4 text-blue-600 shrink-0" /> Consent Audit Log
            </div>
          </div>
        </div>
      </div>

      <p className="mt-4 text-center text-[11px] text-slate-400">
        Cross-referenced via authorized telecom &amp; NSDL financial registries
      </p>
    </div>
  );
}

function MobileToPanDiscoveryStudio({
  response,
  onVerifyInPan,
}: {
  response: MobileToPanResponse;
  onVerifyInPan?: (panNumber: string) => void;
}) {
  const [copied, setCopied] = useState(false);
  const result = response.result;
  const name = result?.name || 'CITIZEN';
  const mobile = result?.mobileNumber || '';
  const pan = result?.panNumber || '';

  const copyPan = () => {
    if (!pan) return;
    void navigator.clipboard.writeText(pan);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs flex flex-col justify-between min-h-[480px]">
      <div>
        <div className="flex items-center justify-between border-b border-slate-100 pb-3.5">
          <div>
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-blue-600" />
              Discovered PAN Identity Card
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Telecom registry verified identity document.
            </p>
          </div>
          <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-[10px] font-bold text-emerald-800 flex items-center gap-1">
            <Check className="h-3 w-3" /> Identity Matched
          </span>
        </div>

        {/* Discovery Card Visual Studio */}
        <div className="mt-5 rounded-2xl bg-linear-to-br from-slate-900 via-blue-950 to-slate-900 p-6 text-white shadow-lg relative overflow-hidden border border-slate-800">
          {/* Card background watermarks */}
          <div className="absolute right-0 top-0 translate-x-8 -translate-y-8 opacity-10 pointer-events-none">
            <ScanLine className="h-64 w-64" />
          </div>

          <div className="flex items-center justify-between border-b border-white/10 pb-4">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-400 text-slate-950 font-bold text-xs">
                ITD
              </div>
              <div>
                <p className="text-[11px] font-bold tracking-wider uppercase text-amber-300">Income Tax Department</p>
                <p className="text-[9px] text-slate-300">GOVT. OF INDIA · FINANCIAL REGISTRY</p>
              </div>
            </div>
            <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-[10px] font-bold text-emerald-400 border border-emerald-400/30">
              VERIFIED
            </span>
          </div>

          {/* Big Monospace PAN Display */}
          <div className="mt-6 text-center py-4 bg-white/5 rounded-xl border border-white/10 backdrop-blur-xs">
            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Linked PAN Number</span>
            <div className="mt-1 flex items-center justify-center gap-3">
              <span className="font-mono text-2xl sm:text-3xl font-black tracking-widest text-amber-300">
                {pan || 'ABCDE****F'}
              </span>
              {pan && (
                <button
                  type="button"
                  onClick={copyPan}
                  className="rounded-lg bg-white/10 p-1.5 hover:bg-white/20 transition text-slate-200"
                  title="Copy discovered PAN"
                >
                  {copied ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
                </button>
              )}
            </div>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-3 text-xs">
            <div>
              <span className="text-[10px] uppercase font-semibold text-slate-400">Citizen Name</span>
              <p className="font-bold text-slate-100 truncate text-sm">{name}</p>
            </div>
            <div>
              <span className="text-[10px] uppercase font-semibold text-slate-400">Linked Mobile</span>
              <p className="font-mono font-bold text-slate-100 text-sm">{mobile ? `+91 ${mobile}` : 'Verified'}</p>
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-white/10 flex items-center justify-between text-[11px] text-slate-400">
            <span>Security: 256-bit Encrypted</span>
            <span>Status: Verified Active</span>
          </div>
        </div>

        {/* Action Button: Bridge to PAN Comprehensive */}
        {pan && onVerifyInPan && (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50/70 p-3 flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-slate-900">Want full unmasked PAN details?</p>
              <p className="text-[11px] text-slate-500">Run a 1-click comprehensive ITD check using this PAN.</p>
            </div>
            <button
              type="button"
              onClick={() => onVerifyInPan(pan)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-amber-500 px-3.5 py-2 text-xs font-bold text-slate-950 shadow-xs hover:bg-amber-400 transition shrink-0"
            >
              <span>Verify in PAN</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>

      <p className="mt-4 text-center text-[11px] text-slate-400">
        Discovered identity profile · Compliant with telecom consent regulations
      </p>
    </div>
  );
}

function MobileToPanDossier({
  response,
  onReset,
}: {
  response: MobileToPanResponse;
  onReset?: () => void;
}) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const copyToClipboard = (key: string, text: string) => {
    if (!text) return;
    void navigator.clipboard.writeText(text);
    setCopiedKey(key);
    window.setTimeout(() => setCopiedKey(null), 2000);
  };

  const result = response.result;
  const name = result?.name || 'CITIZEN';
  const mobile = result?.mobileNumber || '';
  const pan = result?.panNumber || '';
  const providerClientId = result?.providerClientId || response.record.providerClientId || 'N/A';

  return (
    <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50/40 p-4 space-y-3.5 animate-in fade-in">
      <div className="flex items-center justify-between border-b border-blue-200/60 pb-2.5">
        <span className="flex items-center gap-1.5 text-xs font-bold text-blue-900">
          <BadgeCheck className="h-4 w-4 text-blue-600" /> Telecom &amp; Identity Registry Match Found
        </span>
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold text-blue-800">
            {response.cacheHit ? 'Source: Saved DB Record' : 'Source: Telecom Gateway'}
          </span>
          {onReset && (
            <button
              type="button"
              onClick={onReset}
              className="text-[11px] font-bold text-slate-500 hover:text-slate-800 underline ml-1"
            >
              Reset
            </button>
          )}
        </div>
      </div>

      {/* Profile Row */}
      <div className="flex items-center gap-3">
        <div className="relative shrink-0">
          <div className="flex h-14 w-14 items-center justify-center rounded-xl border border-blue-200 bg-blue-100 text-blue-700 shadow-2xs font-bold text-xl">
            <User className="h-7 w-7" />
          </div>
          <span className="absolute -bottom-1 -right-1 flex h-4.5 w-4.5 items-center justify-center rounded-full bg-emerald-600 text-white shadow-2xs">
            <Check className="h-2.5 w-2.5 stroke-[3]" />
          </span>
        </div>

        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-black text-slate-900 truncate">
            {name}
          </h4>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="font-mono text-xs font-bold text-slate-700">
              {mobile ? `+91 ${mobile}` : 'Mobile verified'}
            </span>
            {mobile && (
              <button
                type="button"
                onClick={() => copyToClipboard('mob', mobile)}
                className="text-slate-400 hover:text-slate-700"
                title="Copy Mobile"
              >
                {copiedKey === 'mob' ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Grid of Results */}
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-lg bg-white border border-blue-100 p-2.5">
          <span className="text-[10px] text-slate-500 font-medium">Discovered Masked PAN</span>
          <div className="mt-1 flex items-center justify-between">
            <span className="font-mono text-xs font-black text-slate-900 tracking-wider">
              {pan || 'Not available'}
            </span>
            {pan && (
              <button
                type="button"
                onClick={() => copyToClipboard('pan', pan)}
                className="text-slate-400 hover:text-slate-700"
                title="Copy PAN"
              >
                {copiedKey === 'pan' ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
              </button>
            )}
          </div>
        </div>

        <div className="rounded-lg bg-white border border-blue-100 p-2.5">
          <span className="text-[10px] text-slate-500 font-medium">Match Status</span>
          <div className="mt-1">
            <span className="inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
              SUCCESSFUL MATCH
            </span>
          </div>
        </div>

        <div className="rounded-lg bg-white border border-blue-100 p-2 col-span-2">
          <span className="text-[10px] text-slate-500 font-medium">Provider Client ID</span>
          <p className="mt-0.5 font-mono text-[11px] text-slate-700 truncate">{providerClientId}</p>
        </div>
      </div>

      {/* Wallet Billing Notice */}
      <div className="flex items-center justify-between text-[11px] text-slate-600 border-t border-blue-200/50 pt-2">
        <span className="inline-flex items-center gap-1 text-blue-800 font-semibold">
          <WalletCards className="h-3.5 w-3.5" /> Wallet billing is disabled — ₹0 deducted
        </span>
        <span>Remaining balance: <strong>₹50,000.00</strong></span>
      </div>
    </div>
  );
}

type IdentityHistoryType = 'PAN' | 'GST' | 'MOBILE_TO_PAN' | 'AADHAAR';

const HISTORY_DETAIL_ROUTES: Record<IdentityHistoryType, string> = {
  PAN: '/pan-verification/history',
  GST: '/gst-verification/history',
  MOBILE_TO_PAN: '/mobile-to-pan/history',
  AADHAAR: '/aadhaar-verification/history',
};

export function UnifiedHistoryPanel({
  refreshTrigger = 0,
  onTotalQueriesChange,
  onSelectDetail,
  activeTab = 'overview',
  panTab = 'comprehensive',
  variant = 'recent',
  allHistoryHref,
}: {
  refreshTrigger?: number;
  onTotalQueriesChange?: (count: number) => void;
  /** Loads a record's detail; without it the panel loads the detail itself and only opens the modal. */
  onSelectDetail?: (type: IdentityHistoryType, id: string) => Promise<HistoryDetailResponse | null>;
  activeTab?: Tab;
  panTab?: PanTab;
  /** 'full' is the dedicated history page (identity-hub/history). */
  variant?: 'recent' | 'full';
  /** Where "View all" goes. */
  allHistoryHref?: string;
}) {
  const { user } = useAuthStore();
  const permissions = user?.permissions;
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';
  const canPanHistory = isSuperAdmin || hasAnyPermission(permissions, ['pan.verification.read']);
  const canGstHistory = isSuperAdmin || hasAnyPermission(permissions, ['gst.verification.read']);
  const canAadhaarHistory = isSuperAdmin || hasAnyPermission(permissions, ['aadhaar.digilocker.read']);

  const [records, setRecords] = useState<UnifiedRecord[]>([]);
  const [filterType, setFilterType] = useState<'ALL' | 'PAN' | 'GST' | 'AADHAAR' | 'MOBILE_TO_PAN'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [pageSize, setPageSize] = useState(20);
  const [pagination, setPagination] = useState({ total: 0, totalPages: 0 });
  // Per-type totals for the filter chips; kept from the last unfiltered load.
  const [typeTotals, setTypeTotals] = useState<Record<string, number>>({});
  const [error, setError] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  
  const [panDetail, setPanDetail] = useState<PanResultResponse | null>(null);
  const [gstDetail, setGstDetail] = useState<GstResultResponse | null>(null);
  const [aadhaarDetail, setAadhaarDetail] = useState<AadhaarResultResponse | null>(null);
  const [mobileToPanDetail, setMobileToPanDetail] = useState<MobileToPanResponse | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  // The server merges the types and pages them (GET /verification-history/identity), so search and
  // filters cover every record, not only the newest ones.
  const requestType = activeTab === 'overview'
    ? filterType
    : activeTab === 'pan' ? 'PAN' : activeTab === 'gst' ? 'GST' : activeTab === 'mobileToPan' ? 'MOBILE_TO_PAN' : 'AADHAAR';
  const targetOperation = panTab === 'aadhaar'
    ? 'PAN_TO_AADHAAR'
    : panTab === 'contact'
      ? 'PAN_CONTACT_LOOKUP'
      : panTab === 'comprehensive'
        ? 'PAN_COMPREHENSIVE_V2'
        : 'PAN_VERIFY';
  // Any change of tab, filter, search or page size starts again at page 1.
  const viewKey = `${activeTab}|${panTab}|${requestType}|${debouncedSearch}|${pageSize}`;
  const [pageState, setPageState] = useState({ key: viewKey, page: 1 });
  const page = pageState.key === viewKey ? pageState.page : 1;

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(searchQuery.trim()), 350);
    return () => window.clearTimeout(timer);
  }, [searchQuery]);

  // Each request has a key; only the answer for the latest key is shown, so quick page clicks or
  // tab changes never show a stale page. refreshTrigger (a new verification) and Refresh load again.
  const [refreshCount, setRefreshCount] = useState(0);
  const requestKey = `${viewKey}|${page}|${refreshTrigger}|${refreshCount}`;
  const [loadedKey, setLoadedKey] = useState('');
  const loadUnifiedHistory = () => setRefreshCount((count) => count + 1);
  const loading = loadedKey !== requestKey;

  useEffect(() => {
    let cancelled = false;
    const params: Record<string, unknown> = { type: requestType, page, limit: pageSize };
    if (debouncedSearch) params.search = debouncedSearch;
    if (activeTab === 'pan') params.operation = targetOperation;
    api.get<{ records: UnifiedRecord[]; pagination: { total: number; totalPages: number }; totals: Record<string, number> }>(
      '/verification-history/identity',
      { params, timeout: 20000 },
    )
      .then((response) => {
        if (cancelled) return;
        const { records: pageRecords, pagination: info, totals } = response.data;
        setRecords(dedupeIdentityHistoryRecords(pageRecords));
        setPagination({ total: info.total, totalPages: info.totalPages });
        setError('');
        if (!debouncedSearch) {
          setTypeTotals((current) => (requestType === 'ALL' ? totals : { ...current, ...totals }));
          if (requestType === 'ALL' || activeTab !== 'overview') onTotalQueriesChange?.(info.total);
        }
      })
      .catch((loadError) => {
        if (cancelled) return;
        const message = (loadError as { response?: { data?: { error?: string } } })?.response?.data?.error;
        setError(message || 'Unable to load history.');
      })
      .finally(() => { if (!cancelled) setLoadedKey(requestKey); });
    return () => { cancelled = true; };
  }, [activeTab, debouncedSearch, onTotalQueriesChange, page, pageSize, requestKey, requestType, targetOperation]);

  const handleCopy = (id: string, text: string) => {
    void navigator.clipboard.writeText(text);
    setCopiedId(id);
    window.setTimeout(() => setCopiedId(null), 1800);
  };

  const loadDetail = async (type: IdentityHistoryType, id: string): Promise<HistoryDetailResponse | null> => {
    if (onSelectDetail) return onSelectDetail(type, id);
    try {
      const result = await api.get<HistoryDetailResponse>(`${HISTORY_DETAIL_ROUTES[type]}/${id}`);
      return result.data;
    } catch (detailError) {
      const message = (detailError as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(message || 'Unable to load verification detail.');
      return null;
    }
  };

  const counts = {
    all: Object.values(typeTotals).reduce((sum, value) => sum + value, 0),
    pan: typeTotals.PAN ?? 0,
    gst: typeTotals.GST ?? 0,
    aadhaar: typeTotals.AADHAAR ?? 0,
    mobileToPan: typeTotals.MOBILE_TO_PAN ?? 0,
  };

  // Search and the type filter run on the server; this is one page of results.
  const filteredRecords = records;

  const panelTitle = activeTab === 'gst'
    ? 'GST History'
    : activeTab === 'pan'
      ? (panTab === 'aadhaar' ? 'Aadhaar Link History' : panTab === 'contact' ? 'Contact History' : panTab === 'comprehensive' ? 'PAN History' : 'Basic Verify History')
      : activeTab === 'mobileToPan'
        ? 'Mobile To PAN History'
        : activeTab === 'aadhaar'
          ? 'Aadhaar History'
          : variant === 'full' ? 'Identity Verification History' : 'Recent Identity Verifications';

  const panelSubtitle = variant === 'full'
    ? 'Every PAN, GSTIN and Aadhaar e-KYC verification, newest first'
    : activeTab === 'overview'
      ? 'Real-time unified audit log across PAN, GSTIN and Aadhaar e-KYC'
      : 'Recent verification records for this service';

  return (
    <div className="flex flex-col rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      {/* Top Header & Search Bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-slate-100 pb-3.5">
        <div>
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-50 text-amber-600 border border-amber-200/60">
              <History className="h-4 w-4" />
            </div>
            <h2 className="text-base font-bold text-slate-900">{panelTitle}</h2>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-600">
              {pagination.total}
            </span>
          </div>
          <p className="mt-0.5 text-xs text-slate-500">{panelSubtitle}</p>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative min-w-[180px] sm:w-60">
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(sanitizeSearchInput(e.target.value))}
              placeholder="Search history..."
              className="w-full rounded-xl border border-slate-200 bg-slate-50 pl-8 pr-3 py-1.5 text-xs text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-amber-500 focus:bg-white focus:ring-2 focus:ring-amber-500/20"
            />
          </div>
          <button
            type="button"
            onClick={loadUnifiedHistory}
            disabled={loading}
            className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition disabled:opacity-50"
            title="Refresh history"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin text-amber-600' : ''}`} />
          </button>
          {allHistoryHref ? (
            <Link
              href={allHistoryHref}
              className="inline-flex h-8 shrink-0 items-center gap-1 rounded-xl border border-slate-200 px-3 text-xs font-bold text-slate-800 transition hover:border-slate-900 hover:bg-slate-900 hover:text-white"
            >
              View all <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          ) : null}
        </div>
      </div>

      {/* Overview Filter Tabs */}
      {activeTab === 'overview' && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5 border-b border-slate-100 pb-3">
          <button
            type="button"
            onClick={() => setFilterType('ALL')}
            className={`rounded-lg px-2.5 py-1 text-xs font-bold transition ${
              filterType === 'ALL'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            All Records ({counts.all})
          </button>
          {canPanHistory && (
            <button
              type="button"
              onClick={() => setFilterType('PAN')}
              className={`rounded-lg px-2.5 py-1 text-xs font-bold transition ${
                filterType === 'PAN'
                  ? 'bg-amber-500 text-slate-950 shadow-xs'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              PAN ({counts.pan})
            </button>
          )}
          {canGstHistory && (
            <button
              type="button"
              onClick={() => setFilterType('GST')}
              className={`rounded-lg px-2.5 py-1 text-xs font-bold transition ${
                filterType === 'GST'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              GST ({counts.gst})
            </button>
          )}
          {canAadhaarHistory && (
            <button
              type="button"
              onClick={() => setFilterType('AADHAAR')}
              className={`rounded-lg px-2.5 py-1 text-xs font-bold transition ${
                filterType === 'AADHAAR'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              Aadhaar ({counts.aadhaar})
            </button>
          )}
        </div>
      )}
      
      {error && (
        <div className="mt-3 flex items-center justify-between rounded-xl border border-red-200 bg-red-50 p-2.5 text-xs text-red-700">
          <span>{error}</span>
          <button type="button" onClick={loadUnifiedHistory} className="font-bold underline hover:text-red-900">
            Retry
          </button>
        </div>
      )}
      
      {loading && records.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <Loader2 className="h-6 w-6 animate-spin text-amber-600 mb-2" />
          <p className="text-xs text-slate-500">Loading verification records...</p>
        </div>
      ) : filteredRecords.length > 0 ? (
        <div className="mt-3 overflow-x-auto [scrollbar-width:thin] rounded-xl border border-slate-100">
          <table className="w-full min-w-[560px] text-left text-xs border-collapse">
            <thead className="bg-slate-50 border-b border-slate-200/80 text-[11px] font-bold uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-3 py-2.5">Type</th>
                <th className="px-3 py-2.5">Identifier</th>
                <th className="px-3 py-2.5">Status</th>
                <th className="px-3 py-2.5">Verified Date</th>
                <th className="px-3 py-2.5 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredRecords.map((record) => {
                const identifierText = record._type === 'PAN'
                  ? record.maskedPan
                  : record._type === 'GST'
                    ? record.maskedGstin
                    : record._type === 'AADHAAR'
                      ? record.maskedAadhaar
                      : `${record.maskedName} · ${record.maskedMobileNumber}`;

                return (
                  <tr key={`${record._type}-${record.id}`} className="group hover:bg-slate-50/70 transition">
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wider ${
                        record._type === 'PAN'
                          ? 'bg-amber-100 text-amber-900 border border-amber-200/80'
                          : record._type === 'GST'
                            ? 'bg-indigo-100 text-indigo-900 border border-indigo-200/80'
                            : record._type === 'AADHAAR'
                              ? 'bg-emerald-100 text-emerald-900 border border-emerald-200/80'
                              : 'bg-blue-100 text-blue-900 border border-blue-200/80'
                      }`}>
                        {record._type === 'PAN'
                          ? record.operation === 'PAN_TO_AADHAAR'
                            ? 'Aadhaar Link'
                            : record.operation === 'PAN_CONTACT_LOOKUP'
                              ? 'Contact'
                              : record.operation === PAN_COMPREHENSIVE_OPERATION
                                ? 'PAN Comprehensive'
                                : 'Basic Verify'
                          : record._type === 'GST'
                            ? 'GST Verification'
                            : record._type === 'AADHAAR'
                              ? 'Aadhaar e-KYC'
                              : 'Mobile To PAN'}
                      </span>
                    </td>

                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <div className="inline-flex items-center gap-1.5">
                        <span className="font-mono text-xs font-bold text-slate-800">
                          {identifierText}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleCopy(record.id, identifierText)}
                          className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-slate-700 transition"
                          title="Copy identifier"
                        >
                          {copiedId === record.id ? (
                            <Check className="h-3 w-3 text-emerald-600" />
                          ) : (
                            <Copy className="h-3 w-3" />
                          )}
                        </button>
                      </div>
                    </td>

                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        <StatusBadge status={record.status} />
                        {((record._type === 'PAN' || record._type === 'GST' || record._type === 'AADHAAR') && record.template) ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-1.5 py-0.5 text-[9px] font-bold text-emerald-700 ring-1 ring-inset ring-emerald-200">
                            <CheckCircle2 className="h-2.5 w-2.5" /> Template
                          </span>
                        ) : null}
                      </div>
                    </td>

                    <td className="px-3 py-2.5 whitespace-nowrap text-slate-500 text-[11px]">
                      {formatDate(record.createdAt)}
                    </td>

                    <td className="px-3 py-2.5 whitespace-nowrap text-right">
                      <button 
                        type="button" 
                        disabled={loadingId === record.id}
                        onClick={async () => {
                          setLoadingId(record.id);
                          try {
                            const aadhaarTemplatePreload = record._type === 'AADHAAR' && record.template
                              ? getAadhaarTemplateBlob(`${record.id}:${record.template.id}`, async () => {
                                  const response = await api.get<Blob>(`/aadhaar-verification/${record.id}/template`, { responseType: 'blob' });
                                  return response.data;
                                })
                              : null;
                            void aadhaarTemplatePreload?.catch(() => undefined);
                            const detail = await loadDetail(record._type, record.id);
                            if (detail && record._type === 'PAN') setPanDetail(detail as PanResultResponse);
                            if (detail && record._type === 'GST') setGstDetail(detail as GstResultResponse);
                            if (detail && record._type === 'AADHAAR') setAadhaarDetail(detail as AadhaarResultResponse);
                            if (detail && record._type === 'MOBILE_TO_PAN') setMobileToPanDetail(detail as MobileToPanResponse);
                          } finally {
                            setLoadingId(null);
                          }
                        }} 
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-bold text-slate-700 shadow-2xs hover:bg-slate-900 hover:text-white hover:border-slate-900 transition disabled:opacity-50"
                      >
                        {loadingId === record.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Eye className="h-3 w-3" />}
                        View
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 py-10 text-center">
          <History className="h-8 w-8 text-slate-300 mb-2" />
          <p className="text-xs font-bold text-slate-700">{searchQuery ? 'No matching records' : 'No recent verifications'}</p>
          <p className="text-[11px] text-slate-400 mt-0.5">{searchQuery ? `No results for "${searchQuery}".` : 'Run a verification above to record activity here.'}</p>
        </div>
      )}

      <HistoryPagination
        page={page}
        pageSize={pageSize}
        total={pagination.total}
        totalPages={pagination.totalPages}
        disabled={loading}
        onPageChange={(nextPage) => setPageState({ key: viewKey, page: nextPage })}
        onPageSizeChange={setPageSize}
      />

      {/* Detail Modals (Only shown on overview tab or when not on the dedicated tab) */}
      {panDetail && activeTab !== 'pan' ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-xs" role="dialog" aria-modal="true">
          <div className="w-full max-w-xl rounded-2xl bg-white p-5 shadow-2xl sm:p-6 max-h-[92vh] overflow-y-auto">
            <div className="flex items-start justify-between border-b border-slate-100 pb-3">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-widest text-amber-600">PAN Verification</p>
                <h2 className="mt-0.5 text-lg font-bold text-slate-900">{operationLabel(panDetail.record.operation)}</h2>
              </div>
              <button type="button" onClick={() => setPanDetail(null)} className="rounded-lg px-2.5 py-1 text-xs font-bold text-slate-600 hover:bg-slate-100 border border-slate-200">Close</button>
            </div>
            <PanResultPanel response={panDetail} />
          </div>
        </div>
      ) : null}

      {gstDetail && activeTab !== 'gst' ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-xs" role="dialog" aria-modal="true">
          <div className="w-full max-w-2xl rounded-2xl bg-white p-5 shadow-2xl sm:p-6 max-h-[92vh] overflow-y-auto">
            <div className="flex items-start justify-between border-b border-slate-100 pb-3">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-widest text-indigo-600">GST Verification</p>
                <h2 className="mt-0.5 text-lg font-bold text-slate-900">Result Details</h2>
              </div>
              <button type="button" onClick={() => setGstDetail(null)} className="rounded-lg px-2.5 py-1 text-xs font-bold text-slate-600 hover:bg-slate-100 border border-slate-200">Close</button>
            </div>
            <GstResultPanel response={gstDetail} onUploaded={(updated) => setGstDetail(updated)} />
          </div>
        </div>
      ) : null}

      {aadhaarDetail && activeTab !== 'aadhaar' ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-xs" role="dialog" aria-modal="true">
          <div className="w-full max-w-2xl rounded-2xl bg-white p-5 shadow-2xl sm:p-6 max-h-[92vh] overflow-y-auto">
            <div className="flex items-start justify-between border-b border-slate-100 pb-3">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-widest text-emerald-600">Aadhaar Verification</p>
                <h2 className="mt-0.5 text-lg font-bold text-slate-900">Saved Template &amp; Result</h2>
              </div>
              <button type="button" onClick={() => setAadhaarDetail(null)} className="rounded-lg px-2.5 py-1 text-xs font-bold text-slate-600 hover:bg-slate-100 border border-slate-200">Close</button>
            </div>
            <AadhaarResultPanel response={aadhaarDetail} onUploaded={(template) => setAadhaarDetail({ ...aadhaarDetail, template, record: { ...aadhaarDetail.record, template } })} />
          </div>
        </div>
      ) : null}

      {mobileToPanDetail && activeTab !== 'mobileToPan' ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-xs" role="dialog" aria-modal="true">
          <div className="w-full max-w-2xl rounded-2xl bg-white p-5 shadow-2xl sm:p-6 max-h-[92vh] overflow-y-auto">
            <div className="flex items-start justify-between border-b border-slate-100 pb-3">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-widest text-blue-600">Mobile To PAN</p>
                <h2 className="mt-0.5 text-lg font-bold text-slate-900">Result Details</h2>
              </div>
              <button type="button" onClick={() => setMobileToPanDetail(null)} className="rounded-lg px-2.5 py-1 text-xs font-bold text-slate-600 hover:bg-slate-100 border border-slate-200">Close</button>
            </div>
            <MobileToPanResultPanel response={mobileToPanDetail} />
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default function IdentityHubPage() {
  const router = useRouter();
  const { user } = useAuthStore();
  const permissions = user?.permissions;
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';
  const accessDeniedHref = user?.role === 'EMPLOYEE' ? '/employee/dashboard' : '/admin/dashboard';
  const setCustomHeader = useHeaderStore((state) => state.setCustomHeader);
  const billing = useApiBillingSummary();
  
  const canPanView = canViewFeature(user?.role, permissions, PAN_VIEW_PERMISSIONS);
  const canGstView = canViewFeature(user?.role, permissions, GST_VIEW_PERMISSIONS);
  const canMobileToPanView = false;
  const canAadhaarView = canViewFeature(user?.role, permissions, AADHAAR_DIGILOCKER_VIEW_PERMISSIONS);
  const canPanVerify = isSuperAdmin || hasAnyPermission(permissions, ['pan.verification.read']);
  const canGstVerify = isSuperAdmin || hasAnyPermission(permissions, ['gst.verification.read']);
  const canMobileToPanLookup = false;

  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [refreshHistory, setRefreshHistory] = useState(0);
  const [totalIdentityCount, setTotalIdentityCount] = useState<number>(0);
  const [selectedAadhaarDetail, setSelectedAadhaarDetail] = useState<AadhaarResultResponse | null>(null);

  const handleSelectDetail = async (type: 'PAN' | 'GST' | 'MOBILE_TO_PAN' | 'AADHAAR', id: string): Promise<HistoryDetailResponse | null> => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    if (type === 'GST') {
      setActiveTab('gst');
      setGstError('');
      setGstResponse(null);
      try {
        const result = await api.get<GstResultResponse>(`/gst-verification/history/${id}`);
        setGstResponse(result.data);
        setGstin(typeof result.data.result?.gstin === 'string' ? result.data.result.gstin : '');
        return result.data;
      } catch (err) {
        setGstError(safeGstApiError(err, 'Unable to load GST result detail.'));
      }
    } else if (type === 'PAN') {
      setActiveTab('pan');
      setPanError('');
      setPanResponse(null);
      try {
        const result = await api.get<PanResultResponse>(`/pan-verification/history/${id}`);
        setPanTab('comprehensive');
        setPanResponse(result.data);
        const panVal = typeof result.data.result?.pan === 'string' ? result.data.result.pan : result.data.record?.maskedPan;
        if (panVal) setPan(String(panVal));
        return result.data;
      } catch (err) {
        setPanError(safePanApiError(err, 'Unable to load PAN result detail.'));
      }
    } else if (type === 'MOBILE_TO_PAN') {
      setActiveTab('mobileToPan');
      setMobileToPanError('');
      setMobileToPanResponse(null);
      try {
        const result = await api.get<MobileToPanResponse>(`/mobile-to-pan/history/${id}`);
        setMobileToPanResponse(result.data);
        if (result.data.result?.name) setMobileToPanName(result.data.result.name);
        if (result.data.result?.mobileNumber) setMobileToPanNumber(result.data.result.mobileNumber);
        return result.data;
      } catch (err) {
        setMobileToPanError(safeMobileToPanApiError(err, 'Unable to load Mobile to PAN detail.'));
      }
    } else if (type === 'AADHAAR') {
      setActiveTab('aadhaar');
      try {
        const result = await api.get<AadhaarResultResponse>(`/aadhaar-verification/history/${id}`);
        setSelectedAadhaarDetail(result.data);
        return result.data;
      } catch (err) {
        setPanError(safePanApiError(err, 'Unable to load Aadhaar result detail.'));
      }
    }
    return null;
  };

  // PAN State
  const [panTab, setPanTab] = useState<PanTab>('comprehensive');
  const [pan, setPan] = useState('');
  const [fullName, setFullName] = useState('');
  const [dob, setDob] = useState('');
  const [fetchEmail, setFetchEmail] = useState(false);
  const [panBusy, setPanBusy] = useState(false);
  const [panError, setPanError] = useState('');
  const [panResponse, setPanResponse] = useState<PanResultResponse | null>(null);

  // GST State
  const [gstin, setGstin] = useState('');
  const [gstBusy, setGstBusy] = useState(false);
  const [gstError, setGstError] = useState('');
  const [gstResponse, setGstResponse] = useState<GstResultResponse | null>(null);

  // Mobile To PAN state
  const [mobileToPanName, setMobileToPanName] = useState('');
  const [mobileToPanNumber, setMobileToPanNumber] = useState('');
  const [mobileToPanBusy, setMobileToPanBusy] = useState(false);
  const [mobileToPanError, setMobileToPanError] = useState('');
  const [mobileToPanResponse, setMobileToPanResponse] = useState<MobileToPanResponse | null>(null);

  const handlePanTabChange = (nextTab: PanTab) => {
    setPanTab(nextTab);
    setPanResponse(null);
    setPanError('');
  };

  useEffect(() => {
    if (!canPanView && !canGstView && !canMobileToPanView && !canAadhaarView) {
      router.replace(accessDeniedHref);
      return;
    }
    if (activeTab === 'pan' && !canPanView) setActiveTab(canGstView ? 'gst' : 'overview');
    if (activeTab === 'gst' && !canGstView) setActiveTab(canPanView ? 'pan' : 'overview');
    if (activeTab === 'mobileToPan' && !canMobileToPanView) setActiveTab(canPanView ? 'pan' : canGstView ? 'gst' : 'overview');
    if (activeTab === 'aadhaar' && !canAadhaarView) setActiveTab(canPanView ? 'pan' : canGstView ? 'gst' : 'overview');
  }, [accessDeniedHref, activeTab, canAadhaarView, canGstView, canMobileToPanView, canPanView, router]);

  useEffect(() => {
    const headerTitle = activeTab === 'pan'
      ? 'PAN Verification'
      : activeTab === 'gst'
        ? 'GST Verification'
        : activeTab === 'mobileToPan'
          ? 'Mobile To PAN'
          : activeTab === 'aadhaar'
            ? 'Aadhaar Verification'
          : null;

    setCustomHeader(
      headerTitle ? <h1 className="truncate text-[17px] font-bold text-gray-900 sm:text-xl">{headerTitle}</h1> : null
    );

    return () => {
      setCustomHeader(null);
    };
  }, [activeTab, setCustomHeader]);

  const triggerHistoryRefresh = () => setRefreshHistory(prev => prev + 1);

  const handlePanTemplateUploaded = (updated: PanResultResponse) => {
    setPanResponse(updated);
    setPan('');
    setFullName('');
    setDob('');
    triggerHistoryRefresh();
  };

  const handleGstTemplateUploaded = (updated: GstResultResponse) => {
    setGstResponse(updated);
    setGstin('');
    triggerHistoryRefresh();
  };

  const submitPan = async (event: FormEvent) => {
    event.preventDefault();
    setPanError('');
    setPanResponse(null);
    const cleanPan = sanitizePan(pan);
    const cleanFullName = sanitizePersonName(fullName, 150, true);
    setPan(cleanPan);
    setFullName(cleanFullName);
    const err = validatePan(cleanPan);
    if (err) return setPanError(err);
    if (panTab === 'verify') {
      if (!cleanFullName.trim()) return setPanError('Full name is required.');
      const dobError = validateDob(dob);
      if (dobError) return setPanError(dobError);
    }
    setPanBusy(true);
    try {
      const endpoint = panTab === 'verify'
        ? '/pan-verification/verify'
        : panTab === 'aadhaar'
          ? '/pan-verification/to-aadhaar'
          : panTab === 'contact'
            ? '/pan-verification/contact'
            : PAN_COMPREHENSIVE_ROUTE;
      const payload = panTab === 'verify'
        ? { id_number: normalizePan(cleanPan), full_name: cleanFullName.replace(/\s+/g, ' '), dob }
        : panTab === 'aadhaar'
          ? { pan_number: normalizePan(cleanPan) }
          : panTab === 'contact'
            ? { id_number: normalizePan(cleanPan), ...(fetchEmail ? { fetch_email: true } : {}) }
            : { id_number: normalizePan(cleanPan) };
      const result = await api.post<PanResultResponse>(endpoint, payload);
      setPanResponse(result.data);
      triggerHistoryRefresh();
    } catch (requestError) {
      setPanError(safePanApiError(requestError, 'PAN verification could not be completed.'));
    } finally {
      setPanBusy(false);
    }
  };

  const submitGst = async (event: FormEvent) => {
    event.preventDefault();
    setGstError('');
    setGstResponse(null);
    const cleanGstin = sanitizeGstin(gstin);
    setGstin(cleanGstin);
    const err = validateGstin(cleanGstin);
    if (err) return setGstError(err);
    setGstBusy(true);
    try {
      const result = await api.post<GstResultResponse>('/gst-verification/verify', { id_number: normalizeGstin(cleanGstin) });
      setGstResponse(result.data);
      triggerHistoryRefresh();
    } catch (requestError) {
      setGstError(safeGstApiError(requestError, 'GST details could not be verified.'));
    } finally {
      setGstBusy(false);
    }
  };

  const submitMobileToPan = async (event: FormEvent) => {
    event.preventDefault();
    setMobileToPanError('');
    setMobileToPanResponse(null);
    const cleanName = sanitizePersonName(mobileToPanName, 150, true);
    const cleanMobile = sanitizeMobileNumber(mobileToPanNumber, 16);
    setMobileToPanName(cleanName);
    setMobileToPanNumber(cleanMobile);
    const nameError = validateMobileToPanName(cleanName);
    if (nameError) return setMobileToPanError(nameError);
    const mobileError = validateMobileNumber(cleanMobile);
    if (mobileError) return setMobileToPanError(mobileError);
    setMobileToPanBusy(true);
    try {
      const result = await api.post<MobileToPanResponse>('/mobile-to-pan/lookup', {
        name: normalizeMobileToPanName(cleanName),
        mobile_no: normalizeMobileNumber(cleanMobile),
      });
      setMobileToPanResponse(result.data);
      triggerHistoryRefresh();
    } catch (requestError) {
      setMobileToPanError(safeMobileToPanApiError(requestError, 'Mobile To PAN lookup could not be completed.'));
    } finally {
      setMobileToPanBusy(false);
    }
  };

  if (!canPanView && !canGstView && !canMobileToPanView && !canAadhaarView) {
    return null;
  }

  // --- OVERVIEW MODE ---
  if (activeTab === 'overview') {
    return (
      <div className="space-y-4 animate-in fade-in duration-300">
        {/* Executive Header & KPI Ribbon */}
        <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-2xs">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-slate-100 pb-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-700">
                  Surepass Identity API Gateway Connected
                </span>
              </div>
              <h1 className="mt-1 text-lg sm:text-xl font-black text-slate-900 tracking-tight">
                Identity &amp; Business Intelligence Hub
              </h1>
              <p className="text-xs text-slate-500 mt-0.5">
                Unified verification portal for PAN Comprehensive, GSTIN Taxpayer and Aadhaar DigiLocker e-KYC.
              </p>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200/80 bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-800">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                100% Operational
              </span>
            </div>
          </div>

          {/* 4 Compact Metric Cards */}
          <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4 sm:gap-3">
            <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3">
              <div className="flex items-center justify-between text-slate-500">
                <span className="text-[11px] font-bold uppercase tracking-wide">Identity Records</span>
                <Database className="h-4 w-4 text-amber-600" />
              </div>
              <div className="mt-1 font-mono text-lg font-black text-slate-900">
                {totalIdentityCount > 0 ? totalIdentityCount : 'Active'}
              </div>
              <p className="text-[10px] text-slate-500 mt-0.5">Verified across all modules</p>
            </div>

            <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3">
              <div className="flex items-center justify-between text-slate-500">
                <span className="text-[11px] font-bold uppercase tracking-wide">Active Gateways</span>
                <Layers className="h-4 w-4 text-indigo-600" />
              </div>
              <div className="mt-1 font-mono text-lg font-black text-slate-900">
                4 Modules
              </div>
              <p className="text-[10px] text-slate-500 mt-0.5">PAN, GST, Aadhaar, Mobile</p>
            </div>

            <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3">
              <div className="flex items-center justify-between text-slate-500">
                <span className="text-[11px] font-bold uppercase tracking-wide">Avg Latency</span>
                <Zap className="h-4 w-4 text-emerald-600" />
              </div>
              <div className="mt-1 text-lg font-black text-emerald-700">
                &lt; 1.5s
              </div>
              <p className="text-[10px] text-slate-500 mt-0.5">High-speed live sync</p>
            </div>

            <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3">
              <div className="flex items-center justify-between text-slate-500">
                <span className="text-[11px] font-bold uppercase tracking-wide">Security Standard</span>
                <ShieldCheck className="h-4 w-4 text-blue-600" />
              </div>
              <div className="mt-1 text-lg font-black text-slate-900">
                256-bit Encrypted
              </div>
              <p className="text-[10px] text-slate-500 mt-0.5">Masked &amp; compliant audit</p>
            </div>
          </div>
        </div>

        {/* 4 Compact Module Cards Grid */}
        <div className="grid grid-cols-2 gap-2.5 sm:gap-3.5 lg:grid-cols-4">
          {canPanView && (
            <div
              onClick={() => {
                setPanTab('comprehensive');
                setPanResponse(null);
                setPanError('');
                setActiveTab('pan');
              }}
              className="group relative cursor-pointer overflow-hidden rounded-xl border border-slate-200 bg-white p-3.5 shadow-2xs transition-all duration-200 hover:-translate-y-0.5 hover:border-amber-500 hover:shadow-md flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between gap-1">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600 transition-colors group-hover:bg-amber-500 group-hover:text-slate-950">
                    <ScanLine className="h-4 w-4" />
                  </div>
                  <span className="inline-flex items-center gap-1 rounded-full border border-amber-200/60 bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-800 truncate">
                    <CheckCircle2 className="h-2.5 w-2.5 shrink-0" /> PAN Check
                  </span>
                </div>

                <div className="mt-3">
                  <h2 className="text-xs sm:text-sm font-bold text-slate-950 group-hover:text-amber-600 transition-colors leading-snug">
                    PAN Verification
                  </h2>
                  <p className="mt-1 text-[11px] text-slate-500 line-clamp-2">
                    Comprehensive ITD check for legal name, Aadhaar seeding &amp; operative status.
                  </p>
                </div>
              </div>

              <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2.5">
                <ApiServicePrice summary={billing.summary} serviceKey="PAN_VERIFICATION" />
                <ArrowRight className="h-3.5 w-3.5 text-slate-400 group-hover:text-amber-600 transition-transform group-hover:translate-x-1 shrink-0" />
              </div>
            </div>
          )}

          {canGstView && (
            <div
              onClick={() => setActiveTab('gst')}
              className="group relative cursor-pointer overflow-hidden rounded-xl border border-slate-200 bg-white p-3.5 shadow-2xs transition-all duration-200 hover:-translate-y-0.5 hover:border-indigo-500 hover:shadow-md flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between gap-1">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-600 transition-colors group-hover:bg-indigo-600 group-hover:text-white">
                    <FileCheck2 className="h-4 w-4" />
                  </div>
                  <span className="inline-flex items-center gap-1 rounded-full border border-indigo-200/60 bg-indigo-50 px-2 py-0.5 text-[10px] font-bold text-indigo-800 truncate">
                    <CheckCircle2 className="h-2.5 w-2.5 shrink-0" /> GSTIN
                  </span>
                </div>

                <div className="mt-3">
                  <h2 className="text-xs sm:text-sm font-bold text-slate-950 group-hover:text-indigo-600 transition-colors leading-snug">
                    GST Verification
                  </h2>
                  <p className="mt-1 text-[11px] text-slate-500 line-clamp-2">
                    Verify GSTIN status, trade name, constitution &amp; tax jurisdiction.
                  </p>
                </div>
              </div>

              <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2.5">
                <ApiServicePrice summary={billing.summary} serviceKey="GST_VERIFICATION" />
                <ArrowRight className="h-3.5 w-3.5 text-slate-400 group-hover:text-indigo-600 transition-transform group-hover:translate-x-1 shrink-0" />
              </div>
            </div>
          )}

          {canAadhaarView && (
            <div
              onClick={() => setActiveTab('aadhaar')}
              className="group relative cursor-pointer overflow-hidden rounded-xl border border-slate-200 bg-white p-3.5 shadow-2xs transition-all duration-200 hover:-translate-y-0.5 hover:border-emerald-500 hover:shadow-md flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between gap-1">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 transition-colors group-hover:bg-emerald-600 group-hover:text-white">
                    <ShieldCheck className="h-4 w-4" />
                  </div>
                  <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200/60 bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-800 truncate">
                    <CheckCircle2 className="h-2.5 w-2.5 shrink-0" /> e-KYC
                  </span>
                </div>

                <div className="mt-3">
                  <h2 className="text-xs sm:text-sm font-bold text-slate-950 group-hover:text-emerald-600 transition-colors leading-snug">
                    Aadhaar Verification
                  </h2>
                  <p className="mt-1 text-[11px] text-slate-500 line-clamp-2">
                    Official DigiLocker consent flow. Generates signed unmasked e-Aadhaar.
                  </p>
                </div>
              </div>

              <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2.5">
                <ApiServicePrice summary={billing.summary} serviceKey="AADHAAR_DIGILOCKER" />
                <ArrowRight className="h-3.5 w-3.5 text-slate-400 group-hover:text-emerald-600 transition-transform group-hover:translate-x-1 shrink-0" />
              </div>
            </div>
          )}

        </div>

        {/* Live Unified Verification History Activity Table */}
        <UnifiedHistoryPanel
          refreshTrigger={refreshHistory}
          onTotalQueriesChange={(cnt) => setTotalIdentityCount(cnt)}
          onSelectDetail={handleSelectDetail}
          activeTab="overview"
          panTab={panTab}
          allHistoryHref={`${user?.role === 'EMPLOYEE' ? '/employee' : '/admin'}/identity-hub/history`}
        />
      </div>
    );
  }

  // --- SUB-SERVICE TABS (PAN, GST, AADHAAR) ---
  return (
    <div className="space-y-4 animate-in fade-in duration-300">
      {/* Sub-Navigation Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 rounded-xl border border-slate-200 bg-white p-2.5 shadow-2xs">
        <button
          type="button"
          onClick={() => setActiveTab('overview')}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-700 shadow-2xs transition hover:border-slate-900 hover:bg-slate-900 hover:text-white"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to Services
        </button>

        <div className="flex flex-wrap items-center gap-1">
          {canPanView && (
            <button
              type="button"
              onClick={() => {
                setPanTab('comprehensive');
                setPanResponse(null);
                setPanError('');
                setActiveTab('pan');
              }}
              className={`rounded-lg px-2.5 py-1 text-xs font-bold transition ${
                activeTab === 'pan'
                  ? 'bg-amber-500 text-slate-950 shadow-xs'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              PAN Comprehensive
            </button>
          )}
          {canGstView && (
            <button
              type="button"
              onClick={() => {
                setGstResponse(null);
                setGstError('');
                setActiveTab('gst');
              }}
              className={`rounded-lg px-2.5 py-1 text-xs font-bold transition ${
                activeTab === 'gst'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              GST Verification
            </button>
          )}
          {canAadhaarView && (
            <button
              type="button"
              onClick={() => setActiveTab('aadhaar')}
              className={`rounded-lg px-2.5 py-1 text-xs font-bold transition ${
                activeTab === 'aadhaar'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              Aadhaar DigiLocker
            </button>
          )}
        </div>
      </div>

      {activeTab === 'aadhaar' ? (
        <AadhaarDigiLockerPanel
          canVerify={canAadhaarView}
          onUploaded={triggerHistoryRefresh}
          selectedDetail={selectedAadhaarDetail}
          onClearSelected={() => setSelectedAadhaarDetail(null)}
          historySlot={
            <UnifiedHistoryPanel
              refreshTrigger={refreshHistory}
              activeTab="aadhaar"
              onSelectDetail={handleSelectDetail}
            />
          }
        />
      ) : activeTab === 'pan' ? (
        <div className="space-y-5">
          {/* Row 1: Left Form & Taxpayer Dossier + Right PAN Card Template Studio */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
            <div className="rounded-2xl border border-slate-200 bg-white shadow-2xs overflow-hidden">
              <div className="bg-slate-50/80 border-b border-slate-200 px-4 py-3 flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <ScanLine className="h-4 w-4 text-amber-600" /> PAN Operations
                  </h2>
                  <p className="text-[11px] text-slate-500">Official Income Tax Department verification.</p>
                </div>
                <ApiServicePrice summary={billing.summary} serviceKey="PAN_VERIFICATION" />
              </div>

              <div className="p-4 sm:p-5">
                <div className="flex gap-1.5 mb-4 border-b border-slate-100 pb-2.5">
                  <button
                    type="button"
                    onClick={() => handlePanTabChange('comprehensive')}
                    className={`px-3 py-1 text-xs font-bold rounded-lg transition ${
                      panTab === 'comprehensive'
                        ? 'bg-amber-500 text-slate-950 shadow-xs'
                        : 'text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    PAN Comprehensive
                  </button>
                </div>

                <form onSubmit={submitPan}>
                  <div className="space-y-3">
                    <label className="block max-w-sm">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-700">PAN Number <span className="text-red-500">*</span></span>
                        <span className="text-[11px] text-slate-400 font-mono">10 characters</span>
                      </div>
                      <input
                        value={pan}
                        onChange={(e) => setPan(sanitizePan(e.target.value))}
                        className={`${inputClass} font-mono uppercase tracking-wider`}
                        placeholder="ABCDE1234F"
                        maxLength={10}
                        autoComplete="off"
                      />
                    </label>

                    {panTab === 'verify' && (
                      <div className="grid gap-3 sm:grid-cols-2">
                        <label className="block">
                          <span className="text-xs font-bold text-slate-700">Full Name <span className="text-red-500">*</span></span>
                          <input
                            value={fullName}
                            onChange={(e) => setFullName(sanitizePersonName(e.target.value, 150, false))}
                            onBlur={() => setFullName((prev) => sanitizePersonName(prev, 150, true))}
                            className={inputClass}
                            placeholder="As per PAN card"
                            maxLength={150}
                            autoComplete="name"
                          />
                        </label>
                        <label className="block">
                          <span className="text-xs font-bold text-slate-700">Date of Birth <span className="text-red-500">*</span></span>
                          <SearchableDobPicker value={dob} onChange={setDob} />
                        </label>
                      </div>
                    )}

                    {panTab === 'contact' && (
                      <label className="flex items-center gap-2 text-xs text-slate-700 mt-2">
                        <input
                          type="checkbox"
                          checked={fetchEmail}
                          onChange={(e) => setFetchEmail(e.target.checked)}
                          className="h-4 w-4 rounded border-slate-300 text-amber-600 focus:ring-amber-500"
                        />
                        Request linked email when available
                      </label>
                    )}
                  </div>

                  {panError && (
                    <div className="mt-3 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-2.5 text-xs text-red-700">
                      <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      {panError}
                    </div>
                  )}

                  <div className="mt-4 flex items-center gap-3">
                    <button
                      type="submit"
                      disabled={panBusy || !canPanVerify}
                      className={buttonClass}
                    >
                      {panBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileSearch className="h-3.5 w-3.5" />}
                      {panBusy ? 'Verifying with ITD...' : 'Run Verification'}
                    </button>
                    {pan && (
                      <button
                        type="button"
                        onClick={() => { setPan(''); setPanError(''); }}
                        className="text-xs font-medium text-slate-500 hover:text-slate-800 underline"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                </form>

                {/* Helpful Feature Guide when no response yet */}
                {!panResponse && (
                  <div className="mt-4 rounded-xl border border-slate-100 bg-slate-50/80 p-3.5">
                    <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-700">
                      <Sparkles className="h-3.5 w-3.5 text-amber-500" />
                      Official NSDL &amp; Income Tax Verification Scope
                    </div>
                    <div className="mt-2.5 grid grid-cols-2 gap-2 text-xs text-slate-600">
                      <div className="flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0"/> Full Legal Holder Name</div>
                      <div className="flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0"/> Aadhaar Seeding Status</div>
                      <div className="flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0"/> Active &amp; Operative Status</div>
                      <div className="flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0"/> DOB &amp; Category Match</div>
                    </div>
                    <div className="mt-3 flex items-center justify-between border-t border-slate-200/60 pt-2 text-[11px] text-slate-500">
                      <span>Format: <strong>5 letters + 4 digits + 1 letter</strong></span>
                      <span className="font-mono text-slate-400">e.g. ABCDE1234F</span>
                    </div>
                  </div>
                )}

                {/* Verified Taxpayer Demographics Dossier */}
                {panResponse && panResponse.record.status === 'SUCCESS' && (
                  <PanTaxpayerDossier
                    response={panResponse}
                    panNumber={pan}
                    onReset={() => {
                      setPanResponse(null);
                      setPan('');
                      setPanError('');
                    }}
                  />
                )}

                {panResponse && panResponse.record.status !== 'SUCCESS' && (
                  <PanResultPanel response={panResponse} panNumber={pan} onUploaded={handlePanTemplateUploaded} />
                )}
              </div>
            </div>

            {/* Right Column: Live PAN Card Template Studio or Blueprint Placeholder */}
            <div className="space-y-4">
              {panResponse && (panResponse.template || panResponse.result) ? (
                <PanTemplatePreview
                  response={panResponse}
                  onUploaded={handlePanTemplateUploaded}
                  panNumber={pan}
                />
              ) : (
                <PanTemplatePlaceholderCard />
              )}
            </div>
          </div>

          {/* Row 2: Full-Width PAN History Card */}
          <div className="w-full">
            <UnifiedHistoryPanel
              refreshTrigger={refreshHistory}
              activeTab="pan"
              panTab={panTab}
              onSelectDetail={handleSelectDetail}
            />
          </div>
        </div>
      ) : activeTab === 'gst' ? (
        <div className="space-y-5">
          {/* Row 1: Left Form & Business Dossier + Right GST Certificate Template Studio */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
            <div className="rounded-2xl border border-slate-200 bg-white shadow-2xs overflow-hidden">
              <div className="bg-slate-50/80 border-b border-slate-200 px-4 py-3 flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <FileCheck2 className="h-4 w-4 text-indigo-600" /> GST Verification
                  </h2>
                  <p className="text-[11px] text-slate-500">Validate business registration details via GSTIN.</p>
                </div>
                <ApiServicePrice summary={billing.summary} serviceKey="GST_VERIFICATION" />
              </div>

              <div className="p-4 sm:p-5">
                <form onSubmit={submitGst}>
                  <label className="block max-w-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-700">GSTIN <span className="text-red-500">*</span></span>
                      <span className="text-[11px] text-slate-400 font-mono">15 characters</span>
                    </div>
                    <input
                      value={gstin}
                      onChange={(e) => setGstin(sanitizeGstin(e.target.value))}
                      className={`${inputClass} font-mono uppercase tracking-wider`}
                      placeholder="08AKWPJ1234H1ZN"
                      maxLength={15}
                      autoComplete="off"
                    />
                  </label>

                  {gstError && (
                    <div className="mt-3 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-2.5 text-xs text-red-700">
                      <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      {gstError}
                    </div>
                  )}

                  <div className="mt-4 flex items-center gap-3">
                    <button
                      type="submit"
                      disabled={gstBusy || !canGstVerify}
                      className={buttonClass}
                    >
                      {gstBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
                      {gstBusy ? 'Verifying with GSTN...' : 'Verify GSTIN'}
                    </button>
                    {gstin && (
                      <button
                        type="button"
                        onClick={() => { setGstin(''); setGstError(''); }}
                        className="text-xs font-medium text-slate-500 hover:text-slate-800 underline"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                </form>

                {/* Helpful Guide when no response yet */}
                {!gstResponse && (
                  <div className="mt-4 rounded-xl border border-slate-100 bg-slate-50/80 p-3.5">
                    <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-700">
                      <Sparkles className="h-3.5 w-3.5 text-indigo-500" />
                      GST Common Portal (GSTN) Live Verification Scope
                    </div>
                    <div className="mt-2.5 grid grid-cols-2 gap-2 text-xs text-slate-600">
                      <div className="flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0"/> Active / Cancelled Status</div>
                      <div className="flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0"/> Legal Business Name</div>
                      <div className="flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0"/> Trade Name &amp; Constitution</div>
                      <div className="flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0"/> Center &amp; State Jurisdiction</div>
                    </div>
                    <div className="mt-3 flex items-center justify-between border-t border-slate-200/60 pt-2 text-[11px] text-slate-500">
                      <span>Format: <strong>15-character alphanumeric GSTIN</strong></span>
                      <span className="font-mono text-slate-400">e.g. 22AAAAA0000A1Z5</span>
                    </div>
                  </div>
                )}

                {/* Verified Business Registration Dossier */}
                {gstResponse && gstResponse.record.status === 'SUCCESS' && (
                  <GstBusinessDossier
                    response={gstResponse}
                    onReset={() => {
                      setGstResponse(null);
                      setGstin('');
                      setGstError('');
                    }}
                  />
                )}

                {gstResponse && gstResponse.record.status !== 'SUCCESS' && (
                  <GstResultPanel response={gstResponse} onUploaded={handleGstTemplateUploaded} />
                )}
              </div>
            </div>

            {/* Right Column: Live GST Certificate Template Studio or Blueprint Placeholder */}
            <div className="space-y-4">
              {gstResponse && (gstResponse.template || gstResponse.result) ? (
                <GstTemplatePreview
                  response={gstResponse}
                  onUploaded={handleGstTemplateUploaded}
                />
              ) : (
                <GstTemplatePlaceholderCard />
              )}
            </div>
          </div>

          {/* Row 2: Full-Width GST History Card */}
          <div className="w-full">
            <UnifiedHistoryPanel
              refreshTrigger={refreshHistory}
              activeTab="gst"
              onSelectDetail={handleSelectDetail}
            />
          </div>
        </div>
      ) : activeTab === 'mobileToPan' ? (
        <div className="space-y-5">
          {/* Row 1: Left Form & Discovery Dossier + Right Discovered PAN Studio */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
            <div className="rounded-2xl border border-slate-200 bg-white shadow-2xs overflow-hidden">
              <div className="bg-slate-50/80 border-b border-slate-200 px-4 py-3 flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <Phone className="h-4 w-4 text-blue-600" /> Mobile To PAN
                  </h2>
                  <p className="text-[11px] text-slate-500">Match citizen name and mobile number to find masked PAN.</p>
                </div>
                <ApiServicePrice summary={billing.summary} serviceKey="MOBILE_TO_PAN" />
              </div>

              <div className="p-4 sm:p-5">
                <div className="mb-4 flex items-start gap-2.5 rounded-xl bg-slate-50 p-2.5 text-xs text-slate-600">
                  <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                  <p>Enter the name and mobile number with appropriate citizen consent. PAN values are masked in the result.</p>
                </div>

                <form onSubmit={submitMobileToPan}>
                  <div className="space-y-3">
                    <label className="block">
                      <span className="text-xs font-bold text-slate-700">Full Name <span className="text-red-500">*</span></span>
                      <input
                        value={mobileToPanName}
                        onChange={(event) => setMobileToPanName(sanitizePersonName(event.target.value, 150, false))}
                        onBlur={() => setMobileToPanName((prev) => sanitizePersonName(prev, 150, true))}
                        className={inputClass}
                        placeholder="As per PAN card"
                        maxLength={150}
                        autoComplete="name"
                      />
                    </label>
                    <label className="block max-w-sm">
                      <span className="text-xs font-bold text-slate-700">Mobile Number <span className="text-red-500">*</span></span>
                      <input
                        value={mobileToPanNumber}
                        onChange={(event) => setMobileToPanNumber(sanitizeMobileNumber(event.target.value, 16))}
                        className={`${inputClass} font-mono`}
                        placeholder="9876543210"
                        maxLength={16}
                        inputMode="numeric"
                        autoComplete="tel"
                      />
                    </label>
                  </div>

                  {mobileToPanError && (
                    <div className="mt-3 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-2.5 text-xs text-red-700">
                      <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      {mobileToPanError}
                    </div>
                  )}

                  <div className="mt-4 flex items-center gap-3">
                    <button
                      type="submit"
                      disabled={mobileToPanBusy || !canMobileToPanLookup}
                      className={buttonClass}
                    >
                      {mobileToPanBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Phone className="h-3.5 w-3.5" />}
                      {mobileToPanBusy ? 'Looking up...' : 'Lookup Mobile To PAN'}
                    </button>
                    {(mobileToPanName || mobileToPanNumber) && (
                      <button
                        type="button"
                        onClick={() => { setMobileToPanName(''); setMobileToPanNumber(''); setMobileToPanError(''); }}
                        className="text-xs font-medium text-slate-500 hover:text-slate-800 underline"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                </form>

                {/* Helpful guide when no response */}
                {!mobileToPanResponse && (
                  <div className="mt-4 rounded-xl border border-slate-100 bg-slate-50/80 p-3.5">
                    <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-700">
                      <Sparkles className="h-3.5 w-3.5 text-blue-500" />
                      Telecom &amp; Financial Registry Lookup Scope
                    </div>
                    <div className="mt-2.5 space-y-1.5 text-xs text-slate-600">
                      <div className="flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0"/> Cross-references user full name and 10-digit mobile number</div>
                      <div className="flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0"/> Securely retrieves masked PAN for consent-based onboarding</div>
                    </div>
                  </div>
                )}

                {/* Verified Mobile To PAN Dossier */}
                {mobileToPanResponse && mobileToPanResponse.record.status === 'SUCCESS' && (
                  <MobileToPanDossier
                    response={mobileToPanResponse}
                    onReset={() => {
                      setMobileToPanResponse(null);
                      setMobileToPanName('');
                      setMobileToPanNumber('');
                      setMobileToPanError('');
                    }}
                  />
                )}

                {mobileToPanResponse && mobileToPanResponse.record.status !== 'SUCCESS' && (
                  <MobileToPanResultPanel response={mobileToPanResponse} />
                )}
              </div>
            </div>

            {/* Right Column: Discovered PAN Identity Card Studio or Blueprint Placeholder */}
            <div className="space-y-4">
              {mobileToPanResponse && mobileToPanResponse.record.status === 'SUCCESS' ? (
                <MobileToPanDiscoveryStudio
                  response={mobileToPanResponse}
                  onVerifyInPan={(discoveredPan) => {
                    setPan(discoveredPan);
                    setPanTab('comprehensive');
                    setActiveTab('pan');
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                />
              ) : (
                <MobileToPanPlaceholderCard />
              )}
            </div>
          </div>

          {/* Row 2: Full-Width Mobile To PAN History Card */}
          <div className="w-full">
            <UnifiedHistoryPanel
              refreshTrigger={refreshHistory}
              activeTab="mobileToPan"
              onSelectDetail={handleSelectDetail}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
