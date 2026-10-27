'use client';

import { FormEvent, useState } from 'react';
import { BadgeCheck, ChevronDown, ChevronUp, Download, Eye, EyeOff, Loader2, ShieldCheck, WalletCards, XCircle } from 'lucide-react';
import api from '@/lib/api';
import { formatAadhaarNumber, normalizeAadhaarInput, validateAadhaarNumber } from '@/lib/aadhaarVerification';
import { getAadhaarApiError, getAadhaarDisplayFields } from '@/lib/aadhaarDigiLocker.mjs';
import { DigilockerVerificationModal, type DigilockerVerificationSession } from '@/components/accounts/sold-vehicle/DigilockerVerificationModal';
import AadhaarTemplatePreview from './AadhaarTemplatePreview';

type AadhaarResult = {
  fullName?: string | null;
  fatherName?: string | null;
  careOf?: string | null;
  maskedAadhaar?: string | null;
  dob?: string | null;
  gender?: string | null;
  mobileNumber?: string | null;
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
  record?: { id?: string; providerClientId?: string | null };
  result?: AadhaarResult;
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

export default function AadhaarDigiLockerPanel({ canVerify }: { canVerify: boolean }) {
  const [aadhaarNumber, setAadhaarNumber] = useState('');
  const [showOptionalInput, setShowOptionalInput] = useState(false);
  const [showAadhaar, setShowAadhaar] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<AadhaarResult | null>(null);
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
    } catch (requestError) {
      setError(getAadhaarApiError(requestError, 'Aadhaar verification could not be started. Please try again.'));
    } finally {
      setBusy(false);
    }
  };

  const complete = async (clientId: string) => {
    if (!session) return;
    setBusy(true);
    setError('');
    try {
      const response = await api.post<AadhaarVerificationResponse>('/aadhaar-verification/complete', {
        recordId: session.recordId,
        clientId,
      });
      if (!response.data.result) throw new Error('Aadhaar data was not returned by DigiLocker.');
      setResult(response.data.result);
      setSession(null);
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
          {/* Direct 1-Click Verification Banner */}
          <div className="rounded-2xl border border-amber-200 bg-gradient-to-r from-amber-50/80 via-orange-50/50 to-amber-50/40 p-4 sm:p-5">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="flex items-center gap-2 font-bold text-slate-900 text-sm">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-500 text-slate-950 text-xs font-black">✓</span>
                Instant DigiLocker Verification
              </div>

              <button
                type="button"
                onClick={() => void startVerification()}
                disabled={busy || !canVerify}
                className={`${buttonClass} w-full sm:w-auto shrink-0 shadow-md hover:shadow-lg`}
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                {busy ? 'Opening DigiLocker...' : canVerify ? 'Verify with DigiLocker' : 'Verification not permitted'}
              </button>
            </div>
          </div>

          {/* Optional: Match against a specific Aadhaar number */}
          <div className="mt-5 border-t border-slate-100 pt-4">
            <button
              type="button"
              onClick={() => setShowOptionalInput((prev) => !prev)}
              className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800 transition"
            >
              {showOptionalInput ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              <span>Optional: Match against a specific Aadhaar number before verifying</span>
            </button>

            {showOptionalInput && (
              <form onSubmit={startVerification} className="mt-3.5 max-w-xl rounded-xl border border-slate-100 bg-slate-50/70 p-4">
                <label className="block">
                  <div className="flex items-center justify-between max-w-sm">
                    <span className="text-xs font-bold text-slate-700">Aadhaar number (Optional match)</span>
                    {aadhaarNumber ? (
                      <span className="text-[11px] font-semibold text-slate-500">
                        {normalizeAadhaarInput(aadhaarNumber).length} / 12 digits
                      </span>
                    ) : null}
                  </div>
                  <div className="relative mt-1.5 max-w-sm">
                    <input
                      type={showAadhaar ? 'text' : 'password'}
                      value={showAadhaar ? formatAadhaarNumber(aadhaarNumber) : (aadhaarNumber ? aadhaarNumber.replace(/(\d{4})(?=\d)/g, '$1 ') : '')}
                      onChange={(event) => {
                        setAadhaarNumber(normalizeAadhaarInput(event.target.value));
                        if (error) setError('');
                      }}
                      className={`${inputClass} mt-0 pr-10 font-mono tracking-wider`}
                      placeholder="XXXX XXXX XXXX (Optional)"
                      maxLength={14}
                      inputMode="numeric"
                      autoComplete="off"
                      disabled={busy || !canVerify}
                    />
                    <button
                      type="button"
                      onClick={() => setShowAadhaar((prev) => !prev)}
                      tabIndex={-1}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 focus:outline-none"
                      title={showAadhaar ? 'Hide Aadhaar number' : 'Show Aadhaar number'}
                      aria-label={showAadhaar ? 'Hide Aadhaar number' : 'Show Aadhaar number'}
                    >
                      {showAadhaar ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  <span className="mt-1 block text-xs text-slate-400">Leave blank to verify any citizen directly, or fill in to enforce matching.</span>
                </label>

                <div className="mt-3.5 flex items-center gap-3">
                  <button type="submit" disabled={busy || !canVerify} className={buttonClass}>
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                    {busy ? 'Processing...' : 'Verify with Match'}
                  </button>
                  {aadhaarNumber ? (
                    <button
                      type="button"
                      onClick={() => {
                        setAadhaarNumber('');
                        setError('');
                      }}
                      className="text-xs text-slate-500 hover:text-slate-800 underline"
                    >
                      Clear
                    </button>
                  ) : null}
                </div>
              </form>
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

          {result ? <AadhaarResultPanel result={result} /> : null}
          {result ? (
            <div className="mt-5">
              <AadhaarTemplatePreview data={result} />
            </div>
          ) : null}
          {billing ? <BillingNotice billing={billing} /> : null}
        </div>
      </div>
      {session ? <DigilockerVerificationModal session={session} onSuccess={(clientId) => void complete(clientId)} onClose={() => void cancel()} /> : null}
    </>
  );
}
