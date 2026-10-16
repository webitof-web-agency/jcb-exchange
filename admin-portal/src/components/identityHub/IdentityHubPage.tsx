/* eslint-disable react-hooks/set-state-in-effect */
'use client';

import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { BadgeCheck, Building2, CalendarDays, CheckCircle2, Eye, FileCheck2, FileSearch, History, Loader2, Search, ShieldAlert, XCircle, ScanLine, ArrowLeft, ArrowRight, Phone } from 'lucide-react';
import api from '@/lib/api';
import { hasAnyPermission } from '@/lib/permissionUtils';
import { canViewFeature, GST_VIEW_PERMISSIONS, MOBILE_TO_PAN_VIEW_PERMISSIONS, PAN_VIEW_PERMISSIONS } from '@/lib/featurePermissions';
import { useAuthStore } from '@/store/authStore';
import { useHeaderStore } from '@/store/headerStore';
import { useApiBillingSummary } from '@/hooks/useApiBillingSummary';
import { ApiServicePrice } from '@/components/apiBilling/ApiBillingDisplay';
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

// --- Shared Types & Helpers ---
type Tab = 'overview' | 'pan' | 'gst' | 'mobileToPan';
type PanTab = 'verify' | 'aadhaar' | 'contact' | 'comprehensive';
type HistoryResponse<T> = { records: T[]; pagination: { page: number; limit: number; total: number; totalPages: number } };
type UnifiedRecord = (
  | (PanRecord & { _type: 'PAN' })
  | (GstRecord & { _type: 'GST' })
  | (MobileToPanRecord & { _type: 'MOBILE_TO_PAN' })
);

const inputClass = 'mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20';
const buttonClass = 'inline-flex items-center justify-center gap-2 rounded-xl bg-amber-500 hover:bg-amber-400 px-5 py-2.5 text-sm font-bold text-slate-950 transition shadow-sm disabled:cursor-not-allowed disabled:opacity-50';

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
    <button type="button" onClick={() => setOpen((current) => !current)} className="absolute right-0 top-1.5 flex h-[calc(100%-0.375rem)] w-11 items-center justify-center text-slate-500 hover:text-slate-900" aria-label="Open date of birth calendar" aria-expanded={open}><CalendarDays className="h-4 w-4" /></button>
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

  if (typeof value === 'string' && /^18d{2}-d{2}-d{2}/.test(value)) {
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
    <div className="min-w-0 rounded-xl border border-slate-200/80 bg-white p-3.5 shadow-2xs">
      <dt className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{label}</dt>
      <dd className="mt-1 min-w-0 break-all text-sm font-semibold text-slate-900"><SafeValue value={value} /></dd>
    </div>
  );
}

function StatusBadge({ status }: { status: unknown }) {
  const label = typeof status === 'string' && status.trim() ? status : 'Not available';
  const normalized = label.toUpperCase();
  const tone = normalized === 'ACTIVE' || normalized === 'SUCCESS' ? 'bg-emerald-100 text-emerald-700' : normalized === 'CANCELLED' || normalized === 'INACTIVE' || normalized === 'FAILED' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700';
  return <span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${tone}`}>{label}</span>;
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
    <div className={`mt-5 rounded-2xl border p-4 ${isPending ? 'border-amber-200 bg-amber-50' : 'border-red-200 bg-red-50'}`} role="status" aria-live="polite">
      <div className={`flex items-center gap-2 text-sm font-bold ${isPending ? 'text-amber-800' : 'text-red-800'}`}>
        {isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : <XCircle className="h-5 w-5" />}
        {title} {isPending ? 'is still processing' : 'failed'}
      </div>
      <p className={`mt-2 text-sm ${isPending ? 'text-amber-800' : 'text-red-800'}`}>
        {record.safeMessage || (isPending ? 'The provider has not completed this verification yet.' : 'The provider did not return a successful result.')}
      </p>
      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-600">
        {record.messageCode ? <span>Code: <strong>{record.messageCode}</strong></span> : null}
        <span>Requested: <strong>{formatDate(record.createdAt) || 'Not available'}</strong></span>
      </div>
    </div>
  );
}

// --- Components ---

function PanComprehensiveV2ResultPanel({ response }: { response: PanResultResponse }) {
  const result = response.result || {};
  const details = result.panDetails && typeof result.panDetails === 'object' ? result.panDetails as Record<string, unknown> : {};
  const address = details.address && typeof details.address === 'object' ? details.address as Record<string, unknown> : {};
  const nameParts = Array.isArray(details.fullNameSplit) ? details.fullNameSplit.filter((item): item is string => typeof item === 'string').join(' · ') : '';
  const booleanValue = (value: unknown) => typeof value === 'boolean' ? (value ? 'Yes' : 'No') : 'Not available';
  const addressValue = address.full || [address.line1, address.streetName, address.city, address.state, address.zip, address.country].filter(Boolean).join(', ');

  return (
    <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-4" role="status" aria-live="polite">
      <div className="flex items-center gap-2 text-sm font-bold text-emerald-800">
        <BadgeCheck className="h-5 w-5" /> PAN Comprehensive completed{response.cacheHit ? ' · served from saved result' : ''}
      </div>
      <div className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
        <div><span className="text-slate-500">PAN</span><p className="font-semibold text-slate-900">{String(result.panNumber || result.pan || response.record.maskedPan)}</p></div>
        <div><span className="text-slate-500">Full name</span><p className="font-semibold text-slate-900">{String(details.fullName || 'Not available')}</p></div>
        <div><span className="text-slate-500">Name parts</span><p className="font-semibold text-slate-900">{nameParts || 'Not available'}</p></div>
        <div><span className="text-slate-500">Category</span><p className="font-semibold text-slate-900">{String(details.category || 'Not available')}</p></div>
        <div><span className="text-slate-500">Date of birth</span><p className="font-semibold text-slate-900">{String(details.dob || 'Not available')}</p></div>
        <div><span className="text-slate-500">Input DOB</span><p className="font-semibold text-slate-900">{String(details.inputDob || 'Not available')}</p></div>
        <div><span className="text-slate-500">Gender</span><p className="font-semibold text-slate-900">{String(details.gender || 'Not available')}</p></div>
        <div><span className="text-slate-500">Provider status</span><p className="font-semibold text-slate-900">{String(details.status || 'Not available')}</p></div>
        <div><span className="text-slate-500">Masked Aadhaar</span><p className="font-semibold text-slate-900">{String(details.maskedAadhaar || 'Not available')}</p></div>
        <div><span className="text-slate-500">Email</span><p className="font-semibold text-slate-900">{String(details.email || 'Not available')}</p></div>
        <div><span className="text-slate-500">Phone</span><p className="font-semibold text-slate-900">{String(details.phoneNumber || 'Not available')}</p></div>
        <div><span className="text-slate-500">Aadhaar linked</span><p className="font-semibold text-slate-900">{booleanValue(details.aadhaarLinked)}</p></div>
        <div><span className="text-slate-500">DOB verified</span><p className="font-semibold text-slate-900">{booleanValue(details.dobVerified)}</p></div>
        <div><span className="text-slate-500">DOB check</span><p className="font-semibold text-slate-900">{booleanValue(details.dobCheck)}</p></div>
        <div><span className="text-slate-500">Limited information</span><p className="font-semibold text-slate-900">{booleanValue(details.lessInfo)}</p></div>
        <div><span className="text-slate-500">Sole proprietor</span><p className="font-semibold text-slate-900">{booleanValue(result.isSoleProprietor)}</p></div>
        <div><span className="text-slate-500">Director</span><p className="font-semibold text-slate-900">{booleanValue(result.isDirector)}</p></div>
        <div><span className="text-slate-500">Salaried</span><p className="font-semibold text-slate-900">{booleanValue(result.isSalaried)}</p></div>
        <div className="sm:col-span-2"><span className="text-slate-500">Address</span><p className="font-semibold text-slate-900">{String(addressValue || 'Not available')}</p></div>
        <div><span className="text-slate-500">Address line 1</span><p className="font-semibold text-slate-900">{String(address.line1 || 'Not available')}</p></div>
        <div><span className="text-slate-500">Address line 2</span><p className="font-semibold text-slate-900">{String(address.line2 || 'Not available')}</p></div>
        <div><span className="text-slate-500">Street</span><p className="font-semibold text-slate-900">{String(address.streetName || 'Not available')}</p></div>
        <div><span className="text-slate-500">City</span><p className="font-semibold text-slate-900">{String(address.city || 'Not available')}</p></div>
        <div><span className="text-slate-500">State</span><p className="font-semibold text-slate-900">{String(address.state || 'Not available')}</p></div>
        <div><span className="text-slate-500">ZIP</span><p className="font-semibold text-slate-900">{String(address.zip || 'Not available')}</p></div>
        <div><span className="text-slate-500">Country</span><p className="font-semibold text-slate-900">{String(address.country || 'Not available')}</p></div>
      </div>
      {result.providerData && typeof result.providerData === 'object' ? (
        <details className="mt-4 rounded-xl border border-slate-200 bg-white p-3">
          <summary className="cursor-pointer text-sm font-semibold text-slate-700">Complete provider response data</summary>
          <pre className="mt-3 max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-slate-950 p-3 text-xs text-slate-100">{JSON.stringify(result.providerData, null, 2)}</pre>
        </details>
      ) : null}
    </div>
  );
}

function PanResultPanel({ response }: { response: PanResultResponse }) {
  if (response.record.status !== 'SUCCESS') {
    return <VerificationHistoryState title={operationLabel(response.record.operation)} record={response.record} />;
  }
  if (response.record.operation === PAN_COMPREHENSIVE_OPERATION) {
    return <PanComprehensiveV2ResultPanel response={response} />;
  }
  const result = response.result || {};
  return (
    <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-4" role="status" aria-live="polite">
      <div className="flex items-center gap-2 text-sm font-bold text-emerald-800">
        <CheckCircle2 className="h-5 w-5" />
        {operationLabel(response.record.operation)} completed{response.cacheHit ? ' · served from saved result' : ''}
      </div>
      <div className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
        <div><span className="text-slate-500">PAN</span><p className="font-semibold text-slate-900">{String(result.pan || response.record.maskedPan)}</p></div>
        {'fullName' in result ? <div><span className="text-slate-500">Full name</span><p className="font-semibold text-slate-900">{String(result.fullName || '—')}</p></div> : null}
        {'dob' in result ? <div><span className="text-slate-500">Date of birth</span><p className="font-semibold text-slate-900">{String(result.dob || '—')}</p></div> : null}
        {'status' in result ? <div><span className="text-slate-500">Provider status</span><p className="font-semibold text-slate-900">{String(result.status || '—')}</p></div> : null}
         {'aadhaarNumber' in result ? <div><span className="text-slate-500">Aadhaar</span><p className="font-semibold text-slate-900">{String(result.aadhaarNumber || 'Not available')}</p></div> : null}
       </div>
     </div>
  );
}

function MobileToPanResultPanel({ response }: { response: MobileToPanResponse }) {
  if (response.record.status !== 'SUCCESS') {
    return <VerificationHistoryState title="Mobile To PAN lookup" record={response.record} />;
  }
  const result = response.result;
  return (
    <div className="mt-5 space-y-4" role="status" aria-live="polite">
      <div className="flex flex-col gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2 text-sm font-bold text-emerald-800">
          <CheckCircle2 className="h-5 w-5" />Mobile To PAN lookup completed
        </div>
        <div className="text-xs font-semibold text-emerald-800">{response.cacheHit ? 'Source: Saved DB result' : 'Source: Surepass API'}</div>
      </div>
      <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:p-5">
        <h2 className="flex items-center gap-2 text-base font-bold text-slate-900"><Phone className="h-5 w-5 text-amber-600" />Mobile To PAN Result</h2>
        <dl className="mt-4 grid gap-3 sm:grid-cols-2">
          <Field label="Name" value={result?.name} />
          <Field label="Mobile number" value={result?.mobileNumber} />
          <Field label="PAN number" value={result?.panNumber} />
          <Field label="Provider client id" value={result?.providerClientId || response.record.providerClientId} />
        </dl>
      </section>
    </div>
  );
}

function GstResultPanel({ response }: { response: GstResultResponse }) {
  if (response.record.status !== 'SUCCESS') {
    return <VerificationHistoryState title="GST verification" record={response.record} />;
  }
  const result = response.result || {};
  const isActive = typeof result.gstinStatus === 'string' && result.gstinStatus.toUpperCase() === 'ACTIVE';

  return (
    <div className="mt-5 space-y-4" role="status" aria-live="polite">
      <div className="flex flex-col gap-2 rounded-2xl border border-emerald-200 bg-emerald-50/90 p-4 sm:flex-row sm:items-center sm:justify-between shadow-2xs">
        <div className="flex items-center gap-2 text-sm font-bold text-emerald-900">
          <BadgeCheck className="h-5 w-5 text-emerald-600 shrink-0" />
          Lookup Completed Successfully
        </div>
        <div className="text-xs font-semibold text-emerald-800">
          {response.cacheHit ? 'Source: Saved Database Record' : `Provider Status: ${response.record.status}`}
        </div>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4 sm:p-5">
        <h2 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-900">
          <FileCheck2 className="h-4.5 w-4.5 text-amber-600" />
          GST Registration Details
        </h2>
        <dl className="mt-3.5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="GSTIN" value={result.gstin || response.record.maskedGstin} />
          <div className="min-w-0 rounded-xl border border-slate-200/80 bg-white p-3.5 shadow-2xs">
            <dt className="text-[11px] font-bold uppercase tracking-wider text-slate-500">GST Status</dt>
            <dd className="mt-1.5"><StatusBadge status={result.gstinStatus || response.record.gstinStatus} /></dd>
          </div>
          <Field label="Registration Date" value={formatDate(result.dateOfRegistration)} />
          <Field label="Cancellation Date" value={formatDate(result.dateOfCancellation, isActive)} />
          <Field label="Taxpayer Type" value={result.taxpayerType} />
          <Field label="Constitution of Business" value={result.constitutionOfBusiness} />
        </dl>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
        <h2 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-900">
          <Building2 className="h-4.5 w-4.5 text-amber-600" />
          Business Information
        </h2>
        <dl className="mt-3.5 grid gap-3 sm:grid-cols-2">
          <Field label="Business Name" value={result.businessName} />
          <Field label="Legal Name" value={result.legalName} />
          <Field label="PAN Number" value={result.panNumber} />
          <Field label="Address" value={result.address} />
        </dl>
      </section>

      {Boolean(result.centerJurisdiction || result.stateJurisdiction || result.natureOfCoreBusinessActivityDescription || result.natureOfBusinessActivities) && (
        <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
          <h2 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-900">
            <ShieldAlert className="h-4.5 w-4.5 text-amber-600" />
            Jurisdiction & Business Activities
          </h2>
          <dl className="mt-3.5 grid gap-3 sm:grid-cols-2">
            <Field label="Center Jurisdiction" value={result.centerJurisdiction} />
            <Field label="State Jurisdiction" value={result.stateJurisdiction} />
            <Field label="Core Business Activity" value={result.natureOfCoreBusinessActivityDescription} />
            <Field label="Business Activities" value={result.natureOfBusinessActivities} />
          </dl>
        </section>
      )}

      {Boolean(result.providerData) && (
        <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
          <h2 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-900 mb-3">
            <FileSearch className="h-4.5 w-4.5 text-amber-600" />
            Complete Provider Response Data
          </h2>
          {typeof result.providerData === 'object' ? (
            <details className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <summary className="cursor-pointer text-sm font-semibold text-slate-700">View every safe field returned by Surepass</summary>
              <pre className="mt-3 max-h-[32rem] overflow-auto whitespace-pre-wrap break-words rounded-lg bg-slate-950 p-3 text-xs leading-5 text-slate-100">{JSON.stringify(result.providerData, null, 2)}</pre>
            </details>
          ) : <p className="text-sm text-slate-500">No provider detail was returned.</p>}
        </section>
      )}
    </div>
  );
}

function UnifiedHistoryPanel({ refreshTrigger, onTotalQueriesChange, onSelectDetail, activeTab = 'overview', panTab = 'verify' }: { refreshTrigger: number; onTotalQueriesChange?: (count: number) => void; onSelectDetail?: (type: "PAN" | "GST" | "MOBILE_TO_PAN", id: string) => Promise<void>; activeTab?: Tab; panTab?: PanTab }) {
  const { user } = useAuthStore();
  const permissions = user?.permissions;
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';
  const canPanHistory = isSuperAdmin || hasAnyPermission(permissions, ['pan.verification.read']);
  const canGstHistory = isSuperAdmin || hasAnyPermission(permissions, ['gst.verification.read']);
  const canMobileToPanHistory = isSuperAdmin || hasAnyPermission(permissions, ['pan.mobile-to-pan.read']);

  const [loading, setLoading] = useState(false);
  const [records, setRecords] = useState<UnifiedRecord[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [error, setError] = useState('');
  
  const [panDetail, setPanDetail] = useState<PanResultResponse | null>(null);
  const [gstDetail, setGstDetail] = useState<GstResultResponse | null>(null);
  const [mobileToPanDetail, setMobileToPanDetail] = useState<MobileToPanResponse | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const loadUnifiedHistory = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const fetchPan = canPanHistory && (activeTab === 'overview' || activeTab === 'pan');
      const fetchGst = canGstHistory && (activeTab === 'overview' || activeTab === 'gst');
      const fetchMobileToPan = canMobileToPanHistory && (activeTab === 'overview' || activeTab === 'mobileToPan');

      const targetOperation = panTab === 'aadhaar'
        ? 'PAN_TO_AADHAAR'
        : panTab === 'contact'
          ? 'PAN_CONTACT_LOOKUP'
          : panTab === 'comprehensive'
            ? 'PAN_COMPREHENSIVE_V2'
            : 'PAN_VERIFY';

      const panParams: Record<string, unknown> = { page: 1, limit: 50 };
      if (activeTab === 'pan') {
        panParams.operation = targetOperation;
      }

      const [panRes, gstRes, mobileToPanRes] = await Promise.allSettled([
        fetchPan ? api.get<HistoryResponse<PanRecord>>('/pan-verification/history', { params: panParams, timeout: 15000 }) : Promise.resolve(null),
        fetchGst ? api.get<HistoryResponse<GstRecord>>('/gst-verification/history', { params: { page: 1, limit: 50 }, timeout: 15000 }) : Promise.resolve(null),
        fetchMobileToPan ? api.get<HistoryResponse<MobileToPanRecord>>('/mobile-to-pan/history', { params: { page: 1, limit: 50 }, timeout: 15000 }) : Promise.resolve(null),
      ]);

      let combined: UnifiedRecord[] = [];
      let totalCount = 0;
      if (panRes.status === 'fulfilled' && panRes.value?.data) {
        let panRecords = panRes.value.data.records;
        if (activeTab === 'pan') {
          panRecords = panRecords.filter((r) => r.operation === targetOperation);
        }
        combined = [...combined, ...panRecords.map((r): UnifiedRecord => ({ ...r, _type: 'PAN' }))];
        totalCount += panRes.value.data.pagination?.total ?? panRes.value.data.records.length;
      }
      if (gstRes.status === 'fulfilled' && gstRes.value?.data) {
        combined = [...combined, ...gstRes.value.data.records.map((r): UnifiedRecord => ({ ...r, _type: 'GST' }))];
        totalCount += gstRes.value.data.pagination?.total ?? gstRes.value.data.records.length;
      }
      if (mobileToPanRes && mobileToPanRes.status === 'fulfilled' && mobileToPanRes.value?.data) {
        combined = [...combined, ...mobileToPanRes.value.data.records.map((r): UnifiedRecord => ({ ...r, _type: 'MOBILE_TO_PAN' }))];
        totalCount += mobileToPanRes.value.data.pagination?.total ?? mobileToPanRes.value.data.records.length;
      }

      const failedModules = [
        fetchPan && panRes.status === 'rejected' ? 'PAN' : null,
        fetchGst && gstRes.status === 'rejected' ? 'GST' : null,
        fetchMobileToPan && mobileToPanRes?.status === 'rejected' ? 'Mobile To PAN' : null,
      ].filter((module): module is string => Boolean(module));
      setError(failedModules.length ? `${failedModules.join(' and ')} history could not be loaded. You can retry.` : '');

      onTotalQueriesChange?.(totalCount);

      // Sort by latest first
      combined.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      
      // Deduplicate consecutive/duplicate checks for the same identifier to keep UI clean
      const uniqueCombined: UnifiedRecord[] = [];
      const seenKeys = new Set<string>();
      for (const rec of combined) {
        const identifierKey = rec._type === 'PAN' 
          ? `${rec._type}_${rec.operation}_${rec.maskedPan}`
          : rec._type === 'GST' 
            ? `${rec._type}_${rec.maskedGstin}`
            : `${rec._type}_${rec.maskedName}_${rec.maskedMobileNumber}`;
        
        if (!seenKeys.has(identifierKey)) {
          seenKeys.add(identifierKey);
          uniqueCombined.push(rec);
        }
      }
      
      setRecords(uniqueCombined.slice(0, 30));
    } catch {
      setError('Unable to load history.');
    } finally {
      setLoading(false);
    }
  }, [activeTab, canGstHistory, canMobileToPanHistory, canPanHistory, onTotalQueriesChange, panTab]);

  useEffect(() => {
    void loadUnifiedHistory();
  }, [loadUnifiedHistory, refreshTrigger]);

  const panelTitle = activeTab === 'gst'
    ? 'GST History'
    : activeTab === 'pan'
          ? (panTab === 'aadhaar' ? 'Aadhaar Link History' : panTab === 'contact' ? 'Fetch Contact History' : panTab === 'comprehensive' ? 'PAN Comprehensive History' : 'Basic Verify History')
      : activeTab === 'mobileToPan'
        ? 'Mobile To PAN History'
        : 'Recent History';

  const panelSubtitle = activeTab === 'gst'
    ? 'Recent GST verifications'
    : activeTab === 'pan'
      ? (panTab === 'aadhaar' ? 'Recent PAN to Aadhaar checks' : panTab === 'contact' ? 'Recent PAN contact lookups' : panTab === 'comprehensive' ? 'Recent PAN Comprehensive checks' : 'Recent basic PAN verifications')
      : activeTab === 'mobileToPan'
        ? 'Recent Mobile to PAN lookups'
        : 'Latest verifications across all modules';

  const filteredRecords = records.filter((rec) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.trim().toLowerCase();
    const type = rec._type.toLowerCase();
    const status = (rec.status || '').toLowerCase();

    if (rec._type === 'PAN') {
      const maskedPan = (rec.maskedPan || '').toLowerCase();
      const op = (rec.operation || '').toLowerCase();
      return maskedPan.includes(q) || status.includes(q) || type.includes(q) || op.includes(q);
    }
    if (rec._type === 'GST') {
      const maskedGst = (rec.maskedGstin || '').toLowerCase();
      const businessName = (rec.businessName || '').toLowerCase();
      return maskedGst.includes(q) || businessName.includes(q) || status.includes(q) || type.includes(q);
    }
    if (rec._type === 'MOBILE_TO_PAN') {
      const name = (rec.maskedName || '').toLowerCase();
      const mobile = (rec.maskedMobileNumber || '').toLowerCase();
      return name.includes(q) || mobile.includes(q) || status.includes(q) || type.includes(q);
    }
    return true;
  });

  return (
    <div className="flex flex-col h-full lg:max-h-[calc(100vh-140px)] rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5 overflow-hidden">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900"><History className="h-5 w-5 text-amber-600" />{panelTitle}</h2>
          <p className="text-sm text-slate-500">{panelSubtitle}</p>
        </div>
        <div className="relative min-w-[180px] sm:w-56">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(sanitizeSearchInput(e.target.value))}
            placeholder="Search history..."
            className="w-full rounded-xl border border-slate-200 bg-slate-50 pl-8 pr-3 py-1.5 text-xs text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-amber-500 focus:bg-white focus:ring-2 focus:ring-amber-500/20"
          />
        </div>
      </div>
      
      {error && <div className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"><span>{error}</span><button type="button" onClick={() => void loadUnifiedHistory()} className="shrink-0 rounded-lg bg-white px-3 py-1.5 text-xs font-bold text-red-700 shadow-sm ring-1 ring-red-200 hover:bg-red-100">Retry</button></div>}
      
      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-amber-600" /></div>
      ) : filteredRecords.length > 0 ? (
        <div className="flex-1 overflow-x-auto overflow-y-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
          <table className="w-full min-w-[500px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                <th className="px-3 py-3">Type</th>
                <th className="px-3 py-3">Identifier</th>
                <th className="px-3 py-3">Status</th>
                <th className="px-3 py-3">Date</th>
                <th className="px-3 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredRecords.map((record) => (
                <tr key={`${record._type}-${record.id}`} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="px-3 py-3">
                    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold tracking-wider ${
                      record._type === 'PAN'
                        ? 'bg-amber-100 text-amber-900 border border-amber-200/80'
                        : record._type === 'GST'
                          ? 'bg-purple-100 text-purple-800 border border-purple-200/80'
                          : 'bg-emerald-100 text-emerald-800 border border-emerald-200/80'
                    }`}>
                      {record._type === 'PAN'
                        ? record.operation === 'PAN_TO_AADHAAR'
                          ? 'Aadhaar Link'
                          : record.operation === 'PAN_CONTACT_LOOKUP'
                            ? 'Fetch Contact'
                            : record.operation === PAN_COMPREHENSIVE_OPERATION
                              ? 'PAN Comprehensive'
                              : 'Basic Verify'
                        : record._type === 'GST'
                          ? 'GST Verification'
                          : 'Mobile To PAN'}
                    </span>
                  </td>
                  <td className="px-3 py-3 font-mono font-semibold text-slate-800">
                    {record._type === 'PAN' ? record.maskedPan : record._type === 'GST' ? record.maskedGstin : `${record.maskedName} · ${record.maskedMobileNumber}`}
                  </td>
                  <td className="px-3 py-3">
                    <StatusBadge status={record.status} />
                  </td>
                  <td className="px-3 py-3 text-slate-500">{formatDate(record.createdAt)}</td>
                  <td className="px-3 py-3 text-right">
                    <button 
                      type="button" 
                      disabled={loadingId === record.id}
                      onClick={async () => {
                        setLoadingId(record.id);
                        try {
                          await onSelectDetail?.(record._type, record.id);
                        } finally {
                          setLoadingId(null);
                        }
                      }} 
                      className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-bold text-amber-900 bg-amber-100 hover:bg-amber-200 transition disabled:opacity-50"
                    >
                      <Eye className="h-3.5 w-3.5 text-amber-700" />
                      View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 py-12 text-center">
          {searchQuery ? <Search className="mb-2 h-8 w-8 text-slate-300" /> : <History className="mb-2 h-8 w-8 text-slate-300" />}
          <p className="text-sm font-medium text-slate-600">{searchQuery ? 'No matching history records' : 'No recent verifications'}</p>
          <p className="text-xs text-slate-500">{searchQuery ? `No results for "${searchQuery}". Try another keyword.` : 'Run a verification to see it here.'}</p>
        </div>
      )}

      {/* Detail Modals */}
      {panDetail ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-xl rounded-2xl bg-white p-5 shadow-2xl sm:p-7">
            <div className="flex items-start justify-between">
              <div><p className="text-xs font-bold uppercase tracking-widest text-blue-600">PAN Verification</p><h2 className="mt-1 text-xl font-bold text-slate-900">{operationLabel(panDetail.record.operation)}</h2></div>
              <button type="button" onClick={() => setPanDetail(null)} className="rounded-lg px-2 py-1 text-slate-500 hover:bg-slate-100">Close</button>
            </div>
            <PanResultPanel response={panDetail} />
          </div>
        </div>
      ) : null}

      {gstDetail ? (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/50 p-4" role="dialog" aria-modal="true">
          <div className="mx-auto my-4 w-full max-w-2xl rounded-2xl bg-white p-5 shadow-2xl sm:p-7">
            <div className="flex items-start justify-between">
              <div><p className="text-xs font-bold uppercase tracking-widest text-purple-600">GST Verification</p><h2 className="mt-1 text-xl font-bold text-slate-900">Result Details</h2></div>
              <button type="button" onClick={() => setGstDetail(null)} className="rounded-lg px-2 py-1 text-slate-500 hover:bg-slate-100">Close</button>
            </div>
            <GstResultPanel response={gstDetail} />
          </div>
        </div>
      ) : null}

      {mobileToPanDetail ? (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/50 p-4" role="dialog" aria-modal="true">
          <div className="mx-auto my-4 w-full max-w-2xl rounded-2xl bg-white p-5 shadow-2xl sm:p-7">
            <div className="flex items-start justify-between">
              <div><p className="text-xs font-bold uppercase tracking-widest text-amber-600">Mobile To PAN</p><h2 className="mt-1 text-xl font-bold text-slate-900">Result Details</h2></div>
              <button type="button" onClick={() => setMobileToPanDetail(null)} className="rounded-lg px-2 py-1 text-slate-500 hover:bg-slate-100">Close</button>
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
  const canMobileToPanView = canViewFeature(user?.role, permissions, MOBILE_TO_PAN_VIEW_PERMISSIONS);
  const canPanVerify = isSuperAdmin || hasAnyPermission(permissions, ['pan.verification.read']);
  const canGstVerify = isSuperAdmin || hasAnyPermission(permissions, ['gst.verification.read']);
  const canMobileToPanLookup = isSuperAdmin || hasAnyPermission(permissions, ['pan.mobile-to-pan.read']);

  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [refreshHistory, setRefreshHistory] = useState(0);

  const handleSelectDetail = async (type: 'PAN' | 'GST' | 'MOBILE_TO_PAN', id: string) => {
    if (type === 'GST') {
      setActiveTab('gst');
      setGstError('');
      setGstResponse(null);
      try {
        const result = await api.get<GstResultResponse>(`/gst-verification/history/${id}`);
        setGstResponse(result.data);
        const gstinVal = typeof result.data.result?.gstin === 'string' ? result.data.result.gstin : result.data.record?.maskedGstin;
        if (gstinVal) setGstin(String(gstinVal));
      } catch (err) {
        setGstError(safeGstApiError(err, 'Unable to load GST result detail.'));
      }
    } else if (type === 'PAN') {
      setActiveTab('pan');
      setPanError('');
      setPanResponse(null);
      try {
        const result = await api.get<PanResultResponse>(`/pan-verification/history/${id}`);
        const operationTab: PanTab = result.data.record.operation === 'PAN_TO_AADHAAR'
          ? 'aadhaar'
          : result.data.record.operation === 'PAN_CONTACT_LOOKUP'
            ? 'contact'
            : result.data.record.operation === PAN_COMPREHENSIVE_OPERATION
              ? 'comprehensive'
              : 'verify';
        setPanTab(operationTab);
        setPanResponse(result.data);
        const panVal = typeof result.data.result?.pan === 'string' ? result.data.result.pan : result.data.record?.maskedPan;
        if (panVal) setPan(String(panVal));
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
      } catch (err) {
        setMobileToPanError(safeMobileToPanApiError(err, 'Unable to load Mobile to PAN detail.'));
      }
    }
  };

  // PAN State
  const [panTab, setPanTab] = useState<PanTab>('verify');
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
    if (!canPanView && !canGstView && !canMobileToPanView) {
      router.replace(accessDeniedHref);
      return;
    }
    if (activeTab === 'pan' && !canPanView) setActiveTab(canGstView ? 'gst' : 'overview');
    if (activeTab === 'gst' && !canGstView) setActiveTab(canPanView ? 'pan' : 'overview');
    if (activeTab === 'mobileToPan' && !canMobileToPanView) setActiveTab(canPanView ? 'pan' : canGstView ? 'gst' : 'overview');
  }, [accessDeniedHref, activeTab, canGstView, canMobileToPanView, canPanView, router]);

  useEffect(() => {
    const headerTitle = activeTab === 'pan'
      ? 'PAN Verification'
      : activeTab === 'gst'
        ? 'GST Verification'
        : activeTab === 'mobileToPan'
          ? 'Mobile To PAN'
          : null;

    setCustomHeader(
      headerTitle ? <h1 className="truncate text-[17px] font-bold text-gray-900 sm:text-xl">{headerTitle}</h1> : null
    );

    return () => {
      setCustomHeader(null);
    };
  }, [activeTab, setCustomHeader]);

  const triggerHistoryRefresh = () => setRefreshHistory(prev => prev + 1);

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

  if (!canPanView && !canGstView && !canMobileToPanView) {
    return null;
  }

  if (activeTab === 'overview') {
    return (
      <div className="space-y-6 animate-in fade-in duration-300">
        <div className="grid grid-cols-2 gap-2.5 sm:gap-4 lg:grid-cols-3">
          {canPanView && (
            <div
              onClick={() => setActiveTab('pan')}
              className="group relative flex cursor-pointer flex-col justify-between overflow-hidden rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-amber-500 hover:shadow-md sm:rounded-2xl sm:p-5"
            >
              <div>
                <div className="flex items-center justify-between gap-1">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600 transition-colors group-hover:bg-amber-500 group-hover:text-slate-950 sm:h-10 sm:w-10 sm:rounded-xl">
                    <ScanLine className="h-4 w-4 sm:h-5 sm:w-5" />
                  </div>
                  <span className="inline-flex max-w-[95px] items-center gap-1 truncate rounded-full border border-amber-200/60 bg-amber-50 px-1.5 py-0.5 text-[9px] font-semibold text-amber-800 sm:max-w-none sm:px-2.5 sm:text-xs">
                    <CheckCircle2 className="h-2.5 w-2.5 shrink-0 sm:h-3 sm:w-3" /> PAN Verification
                  </span>
                </div>
                <div className="mt-3 sm:mt-4">
                  <h2 className="line-clamp-2 text-xs font-bold leading-snug text-slate-950 transition-colors group-hover:text-amber-600 sm:text-base">
                    PAN Verification
                  </h2>
                </div>
              </div>
              <div className="mt-4 flex items-center justify-between border-t border-slate-100/90 pt-3">
                <ApiServicePrice summary={billing.summary} serviceKey="PAN_VERIFICATION" />
                <ArrowRight className="h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform group-hover:translate-x-1 group-hover:text-amber-600 sm:h-4 sm:w-4" />
              </div>
            </div>
          )}

          {canGstView && (
            <div
              onClick={() => setActiveTab('gst')}
              className="group relative flex cursor-pointer flex-col justify-between overflow-hidden rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-amber-500 hover:shadow-md sm:rounded-2xl sm:p-5"
            >
              <div>
                <div className="flex items-center justify-between gap-1">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-600 transition-colors group-hover:bg-amber-500 group-hover:text-slate-950 sm:h-10 sm:w-10 sm:rounded-xl">
                    <FileCheck2 className="h-4 w-4 sm:h-5 sm:w-5" />
                  </div>
                  <span className="inline-flex max-w-[95px] items-center gap-1 truncate rounded-full border border-indigo-200/60 bg-indigo-50 px-1.5 py-0.5 text-[9px] font-semibold text-indigo-800 sm:max-w-none sm:px-2.5 sm:text-xs">
                    <CheckCircle2 className="h-2.5 w-2.5 shrink-0 sm:h-3 sm:w-3" /> GST Verification
                  </span>
                </div>
                <div className="mt-3 sm:mt-4">
                  <h2 className="line-clamp-2 text-xs font-bold leading-snug text-slate-950 transition-colors group-hover:text-amber-600 sm:text-base">
                    GST Verification
                  </h2>
                </div>
              </div>
              <div className="mt-4 flex items-center justify-between border-t border-slate-100/90 pt-3">
                <ApiServicePrice summary={billing.summary} serviceKey="GST_VERIFICATION" />
                <ArrowRight className="h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform group-hover:translate-x-1 group-hover:text-amber-600 sm:h-4 sm:w-4" />
              </div>
            </div>
          )}

          {canMobileToPanView && (
            <div
              onClick={() => setActiveTab('mobileToPan')}
              className="group relative flex cursor-pointer flex-col justify-between overflow-hidden rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-amber-500 hover:shadow-md sm:rounded-2xl sm:p-5"
            >
              <div>
                <div className="flex items-center justify-between gap-1">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 transition-colors group-hover:bg-amber-500 group-hover:text-slate-950 sm:h-10 sm:w-10 sm:rounded-xl">
                    <Phone className="h-4 w-4 sm:h-5 sm:w-5" />
                  </div>
                  <span className="inline-flex max-w-[95px] items-center gap-1 truncate rounded-full border border-emerald-200/60 bg-emerald-50 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-800 sm:max-w-none sm:px-2.5 sm:text-xs">
                    <CheckCircle2 className="h-2.5 w-2.5 shrink-0 sm:h-3 sm:w-3" /> Contact Lookup
                  </span>
                </div>
                <div className="mt-3 sm:mt-4">
                  <h2 className="line-clamp-2 text-xs font-bold leading-snug text-slate-950 transition-colors group-hover:text-amber-600 sm:text-base">
                    Mobile To PAN
                  </h2>
                </div>
              </div>
              <div className="mt-4 flex items-center justify-between border-t border-slate-100/90 pt-3">
                <ApiServicePrice summary={billing.summary} serviceKey="MOBILE_TO_PAN" />
                <ArrowRight className="h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform group-hover:translate-x-1 group-hover:text-amber-600 sm:h-4 sm:w-4" />
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div>
        <button
          type="button"
          onClick={() => setActiveTab('overview')}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 shadow-sm transition hover:border-slate-900 hover:bg-slate-900 hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Services
        </button>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,620px)_1fr]">
          
          {/* LEFT COLUMN: Active Tab Content */}
          <div className="flex flex-col gap-5">
            
            {activeTab === 'pan' && (
              <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden flex flex-col lg:max-h-[calc(100vh-140px)]">
                <div className="bg-slate-50 border-b border-slate-200 px-5 py-3.5 flex items-center justify-between shrink-0">
                  <div>
                    <h2 className="text-base font-bold text-slate-900 flex items-center gap-2"><ScanLine className="h-4.5 w-4.5 text-amber-600"/> PAN Operations</h2>
                    <p className="text-xs text-slate-500">Verify details using Permanent Account Number.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveTab('overview')}
                    className="inline-flex items-center gap-1 text-xs font-bold text-slate-500 hover:text-amber-600 transition"
                  >
                    <ArrowLeft className="h-3.5 w-3.5" /> Back to Cards
                  </button>
                </div>
                <div className="p-5 sm:p-6 flex-1 overflow-y-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
                   <div className="flex gap-2 mb-5 border-b border-slate-100 pb-3.5">
                     <button type="button" onClick={()=>handlePanTabChange('verify')} className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition ${panTab==='verify'?'bg-amber-500 text-slate-950 shadow-sm':'text-slate-600 hover:bg-slate-100'}`}>Basic Verify</button>
                     <button type="button" onClick={()=>handlePanTabChange('aadhaar')} className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition ${panTab==='aadhaar'?'bg-amber-500 text-slate-950 shadow-sm':'text-slate-600 hover:bg-slate-100'}`}>Aadhaar Link</button>
                     <button type="button" onClick={()=>handlePanTabChange('contact')} className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition ${panTab==='contact'?'bg-amber-500 text-slate-950 shadow-sm':'text-slate-600 hover:bg-slate-100'}`}>Fetch Contact</button>
                     <button type="button" onClick={()=>handlePanTabChange('comprehensive')} className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition ${panTab==='comprehensive'?'bg-amber-500 text-slate-950 shadow-sm':'text-slate-600 hover:bg-slate-100'}`}>PAN Comprehensive</button>
                   </div>
                   <form onSubmit={submitPan} className="max-w-xl">
                    <div className="space-y-3.5">
                      <label className="block max-w-sm">
                        <span className="text-xs font-bold text-slate-700">PAN number <span className="text-red-500">*</span></span>
                        <input value={pan} onChange={(e) => setPan(sanitizePan(e.target.value))} className={inputClass} placeholder="ABCDE1234F" maxLength={10} autoComplete="off" />
                      </label>
                      {panTab === 'verify' && (
                        <div className="grid gap-3.5 sm:grid-cols-2">
                          <label className="block"><span className="text-xs font-bold text-slate-700">Full name <span className="text-red-500">*</span></span><input value={fullName} onChange={(e) => setFullName(sanitizePersonName(e.target.value, 150, false))} onBlur={() => setFullName((prev) => sanitizePersonName(prev, 150, true))} className={inputClass} placeholder="As per PAN record" maxLength={150} autoComplete="name" /></label>
                          <label className="block"><span className="text-xs font-bold text-slate-700">Date of birth <span className="text-red-500">*</span></span><SearchableDobPicker value={dob} onChange={setDob} /></label>
                        </div>
                      )}
                      {panTab === 'contact' && (
                        <label className="flex items-center gap-2.5 text-xs text-slate-700 mt-2">
                          <input type="checkbox" checked={fetchEmail} onChange={(e) => setFetchEmail(e.target.checked)} className="h-4 w-4 rounded border-slate-300 text-amber-600 focus:ring-amber-500" />
                          Request linked email when available
                        </label>
                      )}
                    </div>
                    {panError && <div className="mt-3.5 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700"><XCircle className="mt-0.5 h-4 w-4 shrink-0" />{panError}</div>}
                    <button type="submit" disabled={panBusy || !canPanVerify} className={`${buttonClass} mt-5 w-full sm:w-auto`}>
                      {panBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSearch className="h-4 w-4" />}
                      {panBusy ? 'Processing...' : 'Run Verification'}
                    </button>
                   </form>
                   {panResponse && <PanResultPanel response={panResponse} />}
                </div>
              </div>
            )}

            {activeTab === 'gst' && (
              <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden flex flex-col lg:max-h-[calc(100vh-140px)]">
                <div className="bg-slate-50 border-b border-slate-200 px-5 py-3.5 flex items-center justify-between shrink-0">
                  <div>
                    <h2 className="text-base font-bold text-slate-900 flex items-center gap-2"><FileCheck2 className="h-4.5 w-4.5 text-amber-600"/> GST Verification</h2>
                    <p className="text-xs text-slate-500">Validate business registration details via GSTIN.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveTab('overview')}
                    className="inline-flex items-center gap-1 text-xs font-bold text-slate-500 hover:text-amber-600 transition"
                  >
                    <ArrowLeft className="h-3.5 w-3.5" /> Back to Cards
                  </button>
                </div>
                <div className="p-5 sm:p-6 flex-1 overflow-y-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
                   <form onSubmit={submitGst} className="max-w-md">
                     <label className="block">
                       <span className="text-xs font-bold text-slate-700">GSTIN <span className="text-red-500">*</span></span>
                       <input value={gstin} onChange={(e) => setGstin(sanitizeGstin(e.target.value))} className={inputClass} placeholder="08AKWPJ1234H1ZN" maxLength={15} autoComplete="off" />
                       <p className="mt-1 text-xs text-slate-400">15-character alphanumeric ID.</p>
                     </label>
                     {gstError && <div className="mt-3.5 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700"><XCircle className="mt-0.5 h-4 w-4 shrink-0" />{gstError}</div>}
                     <button type="submit" disabled={gstBusy || !canGstVerify} className={`${buttonClass} mt-5 w-full sm:w-auto`}>
                      {gstBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                      {gstBusy ? 'Verifying...' : 'Verify GSTIN'}
                    </button>
                   </form>
                   {gstResponse && <GstResultPanel response={gstResponse} />}
                </div>
              </div>
            )}

            {activeTab === 'mobileToPan' && (
              <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden flex flex-col lg:max-h-[calc(100vh-140px)]">
                <div className="bg-slate-50 border-b border-slate-200 px-5 py-3.5 flex items-center justify-between shrink-0">
                  <div>
                    <h2 className="text-base font-bold text-slate-900 flex items-center gap-2"><Phone className="h-4.5 w-4.5 text-amber-600" /> Mobile To PAN</h2>
                    <p className="text-xs text-slate-500">Match a name and mobile number to retrieve a masked PAN result.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveTab('overview')}
                    className="inline-flex items-center gap-1 text-xs font-bold text-slate-500 hover:text-amber-600 transition"
                  >
                    <ArrowLeft className="h-3.5 w-3.5" /> Back to Cards
                  </button>
                </div>
                <div className="p-5 sm:p-6 flex-1 overflow-y-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
                  <div className="mb-5 flex items-start gap-3 rounded-xl bg-slate-50 p-3 text-sm text-slate-600">
                    <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
                    <p>Enter the name and mobile number only with appropriate user consent. PAN values are masked in the result and encrypted in saved history.</p>
                  </div>
                  <form onSubmit={submitMobileToPan} className="max-w-xl">
                    <div className="space-y-3.5">
                      <label className="block">
                        <span className="text-xs font-bold text-slate-700">Full name <span className="text-red-500">*</span></span>
                        <input value={mobileToPanName} onChange={(event) => setMobileToPanName(sanitizePersonName(event.target.value, 150, false))} onBlur={() => setMobileToPanName((prev) => sanitizePersonName(prev, 150, true))} className={inputClass} placeholder="As per PAN record" maxLength={150} autoComplete="name" />
                      </label>
                      <label className="block max-w-sm">
                        <span className="text-xs font-bold text-slate-700">Mobile number <span className="text-red-500">*</span></span>
                        <input value={mobileToPanNumber} onChange={(event) => setMobileToPanNumber(sanitizeMobileNumber(event.target.value, 16))} className={inputClass} placeholder="8888808969" maxLength={16} inputMode="numeric" autoComplete="tel" />
                      </label>
                    </div>
                    {mobileToPanError && <div className="mt-3.5 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700"><XCircle className="mt-0.5 h-4 w-4 shrink-0" />{mobileToPanError}</div>}
                    <button type="submit" disabled={mobileToPanBusy || !canMobileToPanLookup} className={`${buttonClass} mt-5 w-full sm:w-auto`}>
                      {mobileToPanBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Phone className="h-4 w-4" />}
                      {mobileToPanBusy ? 'Looking up...' : canMobileToPanLookup ? 'Lookup Mobile To PAN' : 'Lookup not permitted'}
                    </button>
                  </form>
                  {mobileToPanResponse && <MobileToPanResultPanel response={mobileToPanResponse} />}
                </div>
              </div>
            )}

          </div>

          {/* RIGHT COLUMN: Tab-Specific History */}
          <div className="hidden lg:block lg:max-h-[calc(100vh-140px)] lg:sticky lg:top-5">
             <UnifiedHistoryPanel refreshTrigger={refreshHistory} activeTab={activeTab} panTab={panTab} onSelectDetail={handleSelectDetail} />
          </div>

        </div>
        
        {/* Mobile View History (shown below content on small screens) */}
        <div className="mt-6 lg:hidden">
           <UnifiedHistoryPanel refreshTrigger={refreshHistory} activeTab={activeTab} panTab={panTab} onSelectDetail={handleSelectDetail} />
        </div>

      </div>
  );
}
