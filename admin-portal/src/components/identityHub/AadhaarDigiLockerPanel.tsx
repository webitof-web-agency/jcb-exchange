'use client';

import { FormEvent, useState } from 'react';
import { BadgeCheck, CheckCircle2, ChevronDown, ChevronUp, Download, Eye, EyeOff, Loader2, ShieldCheck, WalletCards, X, XCircle } from 'lucide-react';
import api from '@/lib/api';
import { formatAadhaarNumber, normalizeAadhaarInput, validateAadhaarNumber } from '@/lib/aadhaarVerification';
import { getAadhaarApiError, getAadhaarDisplayFields } from '@/lib/aadhaarDigiLocker.mjs';
import { DigilockerVerificationModal, type DigilockerVerificationSession } from '@/components/accounts/sold-vehicle/DigilockerVerificationModal';
import AadhaarTemplatePreview, { type AadhaarTemplateInfo } from './AadhaarTemplatePreview';

type AadhaarResult = {
  fullName?: string | null;
  fatherName?: string | null;
  careOf?: string | null;
  maskedAadhaar?: string | null;
  aadhaarNumber?: string | null;
  dob?: string | null;
  gender?: string | null;
  mobileNumber?: string | null;
  issueDate?: string | null;
  fullAddress?: string | null;
  profileImage?: string | null;
  xmlUrl?: string | null;
  address?: {
    country?: string | null;
    district?: string | null;
    state?: string | null;
    postOffice?: string | null;
    house?: string | null;
    locality?: string | null;
    vtc?: string | null;
    subDistrict?: string | null;
    street?: string | null;
    landmark?: string | null;
    pincode?: string | null;
  } | null;
};

type AadhaarVerificationResponse = {
  cacheHit?: boolean;
  record?: { id?: string; status?: string; providerClientId?: string | null; template?: AadhaarTemplateInfo | null };
  result?: AadhaarResult;
  template?: AadhaarTemplateInfo | null;
  sdkToken?: string;
  gateway?: 'sandbox' | 'production';
  expirySeconds?: number;
  billing?: AadhaarBillingSummary | null;
};

type AadhaarBillingSummary = {
  charged: boolean;
  billingMode: 'ACTIVE' | 'DISABLED';
  amountRupees: string;
  balanceRupees: string;
  serviceKey: string;
};

function BillingNotice({ billing }: { billing: AadhaarBillingSummary }) {
  const charged = billing.charged && billing.billingMode === 'ACTIVE';
  return (
    <div className={'mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border p-3 text-xs ' + (charged ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-slate-200 bg-slate-50 text-slate-600')} role="status" aria-live="polite">
      <span className="inline-flex items-center gap-2 font-bold">
        <WalletCards className="h-4 w-4" />
        {charged ? 'Wallet charged \u20B9' + billing.amountRupees : 'Wallet billing is disabled \u2014 no amount deducted'}
      </span>
      <span>Remaining balance: <strong>{'\u20B9'}{billing.balanceRupees}</strong></span>
    </div>
  );
}

const inputClass = 'mt-1.5 w-full max-w-sm rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20';
const buttonClass = 'inline-flex items-center justify-center gap-2 rounded-xl bg-amber-500 px-5 py-2.5 text-sm font-bold text-slate-950 shadow-sm transition hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-50';

function AadhaarResultPanel({ result }: { result: AadhaarResult }) {
  const fields = getAadhaarDisplayFields(result);
  const values = [
    ['Full name', fields.name],
    ['Masked Aadhaar', fields.maskedAadhaar],
    ['Date of birth', fields.dob],
    ['Gender', fields.gender],
    ['Mobile number', fields.mobile],
    ['Address', fields.address],
  ] as const;

  return (
    <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-4" role="status" aria-live="polite">
      <div className="flex items-center gap-2 text-sm font-bold text-emerald-800">
        <BadgeCheck className="h-5 w-5" /> Aadhaar data received from DigiLocker
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {values.map(([label, value]) => (
          <div key={label} className={label === 'Address' ? 'sm:col-span-2' : ''}>
            <span className="text-xs text-slate-500">{label}</span>
            <p className="mt-0.5 break-words text-sm font-semibold text-slate-900">{value || 'Not available'}</p>
          </div>
        ))}
      </div>
      {fields.profileImage ? (
        <div className="mt-4 flex items-center gap-3 border-t border-emerald-200 pt-4">
          {/* The provider returns a data URL; Next Image cannot optimize this dynamic payload. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={fields.profileImage} alt="Aadhaar profile" className="h-16 w-16 rounded-xl border border-slate-200 object-cover" />
          <span className="text-xs text-slate-600">Profile image returned by the Aadhaar XML response.</span>
        </div>
      ) : null}
      {fields.xmlUrl.startsWith('https://') ? (
        <a href={fields.xmlUrl} target="_blank" rel="noreferrer" className="mt-4 inline-flex items-center gap-2 text-xs font-bold text-emerald-800 underline hover:text-emerald-950">
          <Download className="h-3.5 w-3.5" /> Open original XML
        </a>
      ) : null}
    </div>
  );
}

export default function AadhaarDigiLockerPanel({ canVerify, onUploaded }: { canVerify: boolean; onUploaded?: () => void }) {
  const [aadhaarNumber, setAadhaarNumber] = useState('');
  const [showDirectDropdown, setShowDirectDropdown] = useState(false);
  const [showAadhaar, setShowAadhaar] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [result, setResult] = useState<AadhaarResult | null>(null);
  const [recordId, setRecordId] = useState('');
  const [template, setTemplate] = useState<AadhaarTemplateInfo | null>(null);
  const [billing, setBilling] = useState<AadhaarBillingSummary | null>(null);
  const [session, setSession] = useState<DigilockerVerificationSession | null>(null);

  const startVerification = async (event?: FormEvent) => {
    if (event) event.preventDefault();
    const rawNumber = aadhaarNumber.trim();
    let normalized = '';
    if (rawNumber) {
      normalized = normalizeAadhaarInput(rawNumber);
      setAadhaarNumber(normalized);
      const validationError = validateAadhaarNumber(normalized);
      if (validationError) {
        setError(validationError);
        return;
      }
    }

    setError('');
    setSuccessMessage('');
    setResult(null);
    setBilling(null);
    setBusy(true);

    try {
      const response = await api.post<AadhaarVerificationResponse>('/aadhaar-verification/initialize', {
        ...(normalized ? { aadhaarNumber: normalized } : {}),
        side: 'SALE',
      });
      const data = response.data;
      if (data.cacheHit && data.result) {
        setResult(data.result);
        setRecordId(data.record?.id || '');
        setTemplate(data.template || data.record?.template || null);
        setSuccessMessage('Loaded verified Aadhaar from active session.');
        return;
      }
      setBilling(data.billing ?? null);
      const recordId = data.record?.id?.trim();
      const clientId = data.record?.providerClientId?.trim();
      if (!recordId || !clientId || !data.sdkToken) throw new Error('DigiLocker session was not created.');
      setSession({
        recordId,
        clientId,
        sdkToken: data.sdkToken,
        gateway: data.gateway === 'production' ? 'production' : 'sandbox',
        expirySeconds: data.expirySeconds,
      });
      setRecordId(recordId);
      setTemplate(null);
    } catch (requestError) {
      setError(getAadhaarApiError(requestError, 'Aadhaar verification could not be started. Please try again.'));
    } finally {
      setBusy(false);
    }
  };

  const startDirectVerification = async () => {
    setError('');
    setSuccessMessage('');
    setResult(null);
    setBilling(null);
    setBusy(true);

    try {
      const response = await api.post<AadhaarVerificationResponse>('/aadhaar-verification/initialize', {
        side: 'SALE',
      });
      const data = response.data;
      if (data.cacheHit && data.result) {
        setResult(data.result);
        setRecordId(data.record?.id || '');
        setTemplate(data.template || data.record?.template || null);
        setSuccessMessage('Loaded verified Aadhaar from active session.');
        return;
      }
      setBilling(data.billing ?? null);
      const recordId = data.record?.id?.trim();
      const clientId = data.record?.providerClientId?.trim();
      if (!recordId || !clientId || !data.sdkToken) throw new Error('DigiLocker session was not created.');
      setSession({
        recordId,
        clientId,
        sdkToken: data.sdkToken,
        gateway: data.gateway === 'production' ? 'production' : 'sandbox',
        expirySeconds: data.expirySeconds,
      });
      setRecordId(recordId);
      setTemplate(null);
    } catch (requestError) {
      setError(getAadhaarApiError(requestError, 'Aadhaar verification could not be started. Please try again.'));
    } finally {
      setBusy(false);
    }
  };

  const complete = async (clientId: string) => {
    const activeRecordId = session?.recordId || recordId;
    if (!activeRecordId) return;
    setBusy(true);
    setError('');
    try {
      const response = await api.post<AadhaarVerificationResponse>('/aadhaar-verification/complete', {
        recordId: activeRecordId,
        clientId,
      });
      if (!response.data.result) throw new Error('Aadhaar data was not returned by DigiLocker.');
      setResult(response.data.result);
      setRecordId(response.data.record?.id || activeRecordId);
      setTemplate(response.data.template || response.data.record?.template || null);
      setSession(null);
      setSuccessMessage('Aadhaar verified successfully with DigiLocker!');
    } catch (requestError) {
      setError(getAadhaarApiError(requestError, 'Aadhaar data could not be retrieved. Please try again.'));
      setSession(null);
    } finally {
      setBusy(false);
    }
  };

  const cancel = async () => {
    const currentSession = session;
    setSession(null);
    if (!currentSession) return;
    try {
      await api.post('/aadhaar-verification/cancel', { recordId: currentSession.recordId });
    } catch {
      // The server safely expires an unused session if the cancel request fails.
    }
  };

  return (
    <>
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-5 py-3.5">
          <div>
            <h2 className="flex items-center gap-2 text-base font-bold text-slate-900"><ShieldCheck className="h-4.5 w-4.5 text-emerald-600" /> Aadhaar Verification</h2>
            <p className="text-xs text-slate-500">Fetch consented Aadhaar details securely through DigiLocker.</p>
          </div>
        </div>
        <div className="p-5 sm:p-6">
          {/* Primary Section: Enter Aadhaar Number for Unmasked Card */}
          <div className="rounded-2xl border border-slate-200 bg-gradient-to-b from-slate-50/70 to-white p-5 sm:p-6 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <ShieldCheck className="h-4.5 w-4.5 text-amber-500" />
                  Unmasked Aadhaar Verification (Full 12 Digits)
                </h3>
                <p className="mt-0.5 text-xs text-slate-500">
                  Enter citizen&apos;s 12-digit Aadhaar number to verify with DigiLocker and generate an unmasked card.
                </p>
              </div>

              {/* Unmasked Aadhaar Badge */}
              <span className="inline-flex items-center gap-1.5 self-start sm:self-auto rounded-full bg-emerald-50 border border-emerald-200/80 px-3 py-1 text-xs font-bold text-emerald-800 shadow-xs">
                <BadgeCheck className="h-4 w-4 text-emerald-600" />
                Unmasked Aadhaar
              </span>
            </div>

            <form onSubmit={startVerification} className="mt-4">
              <label className="block max-w-md">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-700">Aadhaar Number (Unmasked)</span>
                  {aadhaarNumber ? (
                    <span className={`text-[11px] font-semibold ${normalizeAadhaarInput(aadhaarNumber).length === 12 ? 'text-emerald-600 font-bold' : 'text-slate-500'}`}>
                      {normalizeAadhaarInput(aadhaarNumber).length} / 12 digits {normalizeAadhaarInput(aadhaarNumber).length === 12 ? '✓' : ''}
                    </span>
                  ) : (
                    <span className="text-[11px] text-slate-400">12 digits required</span>
                  )}
                </div>

                <div className="relative mt-1.5">
                  <input
                    type={showAadhaar ? 'text' : 'password'}
                    value={showAadhaar ? formatAadhaarNumber(aadhaarNumber) : (aadhaarNumber ? aadhaarNumber.replace(/(\d{4})(?=\d)/g, '$1 ') : '')}
                    onChange={(event) => {
                      setAadhaarNumber(normalizeAadhaarInput(event.target.value));
                      if (error) setError('');
                    }}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-base font-mono tracking-widest text-slate-900 outline-none transition placeholder:text-slate-400 placeholder:font-sans placeholder:tracking-normal focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20"
                    placeholder="1234 5678 9012"
                    maxLength={14}
                    inputMode="numeric"
                    autoComplete="off"
                    disabled={busy || !canVerify}
                  />

                  <button
                    type="button"
                    onClick={() => setShowAadhaar((prev) => !prev)}
                    tabIndex={-1}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 focus:outline-none"
                    title={showAadhaar ? 'Hide Aadhaar digits' : 'Show full Aadhaar digits'}
                    aria-label={showAadhaar ? 'Hide Aadhaar digits' : 'Show full Aadhaar digits'}
                  >
                    {showAadhaar ? <Eye className="h-4 w-4 text-emerald-600" /> : <EyeOff className="h-4 w-4" />}
                  </button>
                </div>

                <div className="mt-1.5 flex items-center justify-between text-[11px] text-slate-500">
                  <span>Generates an <strong>Unmasked card</strong> with all 12 digits</span>
                  {aadhaarNumber ? (
                    <button
                      type="button"
                      onClick={() => {
                        setAadhaarNumber('');
                        setError('');
                      }}
                      className="font-medium text-slate-500 hover:text-rose-600 underline"
                    >
                      Clear
                    </button>
                  ) : null}
                </div>
              </label>

              <div className="mt-4 flex items-center gap-3">
                <button
                  type="submit"
                  disabled={busy || !canVerify}
                  className={`${buttonClass} shadow-md hover:shadow-lg`}
                >
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                  {busy ? 'Opening DigiLocker...' : 'Verify with DigiLocker'}
                </button>
              </div>
            </form>
          </div>

          {/* Secondary Dropdown: Direct 1-Click Verification (Without entering Aadhaar number upfront) */}
          <div className="mt-4 border-t border-slate-100 pt-3">
            <button
              type="button"
              onClick={() => setShowDirectDropdown((prev) => !prev)}
              className="flex items-center justify-between w-full rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-3 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 hover:text-slate-900"
            >
              <div className="flex items-center gap-2">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-100 text-amber-700 text-xs font-black">⚡</span>
                <span>Optional: Instant 1-Click Verification without entering Aadhaar number</span>
              </div>
              <div className="flex items-center gap-1.5 text-slate-400">
                <span className="text-[11px] font-medium text-slate-500">{showDirectDropdown ? 'Hide' : 'Open'}</span>
                {showDirectDropdown ? <ChevronUp className="h-4 w-4 text-slate-600" /> : <ChevronDown className="h-4 w-4 text-slate-600" />}
              </div>
            </button>

            {showDirectDropdown && (
              <div className="mt-3 rounded-2xl border border-amber-200 bg-gradient-to-r from-amber-50/80 via-orange-50/50 to-amber-50/40 p-4 sm:p-5 animate-in fade-in duration-150">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2 font-bold text-slate-900 text-sm">
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-500 text-slate-950 text-xs font-black">✓</span>
                      Direct DigiLocker Verification
                    </div>
                    <p className="mt-1 text-xs text-slate-600 max-w-lg">
                      Citizen will enter their Aadhaar number directly in the official DigiLocker consent window.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => void startDirectVerification()}
                    disabled={busy || !canVerify}
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-5 py-2.5 text-xs font-bold text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50 shrink-0"
                  >
                    {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5 text-amber-400" />}
                    {busy ? 'Opening...' : 'Verify Directly'}
                  </button>
                </div>
              </div>
            )}
          </div>

          {error ? (
            <div className="mt-4 flex flex-col gap-1.5 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">
              <div className="flex items-start gap-2">
                <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            </div>
          ) : null}

          {successMessage ? (
            <div className="mt-4 flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-bold text-emerald-800">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                <span>{successMessage}</span>
              </div>
              <button
                type="button"
                onClick={() => setSuccessMessage('')}
                className="text-emerald-700 hover:text-emerald-950"
                aria-label="Dismiss message"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : null}

          {result && !template ? <AadhaarResultPanel result={result} /> : null}
          {result ? (
            <div className="mt-5">
              <AadhaarTemplatePreview
                data={{
                  ...result,
                  aadhaarNumber: aadhaarNumber || result.aadhaarNumber,
                  issueDate: result.issueDate,
                }}
                recordId={recordId}
                template={template}
                onUploaded={(savedTemplate) => {
                  setTemplate(savedTemplate);
                  onUploaded?.();
                }}
              />
            </div>
          ) : null}
          {billing ? <BillingNotice billing={billing} /> : null}
        </div>
      </div>
      {session ? <DigilockerVerificationModal session={session} onSuccess={(clientId) => void complete(clientId)} onClose={() => void cancel()} /> : null}
    </>
  );
}
