'use client';

import { FormEvent, useEffect, useState } from 'react';
import {
  BadgeCheck,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Download,
  Eye,
  EyeOff,
  Loader2,
  ShieldCheck,
  WalletCards,
  X,
  XCircle,
  Copy,
  Check,
  MapPin,
  Sparkles,
  PlusCircle,
  User,
} from 'lucide-react';
import api from '@/lib/api';
import { formatAadhaarNumber, normalizeAadhaarInput, validateAadhaarNumber } from '@/lib/aadhaarVerification';
import { getAadhaarApiError, getAadhaarDisplayFields } from '@/lib/aadhaarDigiLocker.mjs';
import { DigilockerVerificationModal, type DigilockerVerificationSession } from '@/components/accounts/sold-vehicle/DigilockerVerificationModal';
import AadhaarTemplatePreview, { type AadhaarData, type AadhaarTemplateInfo } from './AadhaarTemplatePreview';

export type AadhaarResult = {
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

export type AadhaarRecord = {
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

export type AadhaarResultResponse = {
  record: AadhaarRecord;
  result: AadhaarData | null;
  template?: AadhaarTemplateInfo | null;
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

function formatDobWithAge(dobStr?: string | null): { formatted: string; age: string } {
  if (!dobStr) return { formatted: 'Not available', age: '' };
  let year = 0;
  let formatted = dobStr;
  if (/^\d{4}-\d{2}-\d{2}$/.test(dobStr)) {
    const parts = dobStr.split('-');
    year = Number(parts[0]);
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const mIdx = Number(parts[1]) - 1;
    formatted = `${parts[2]} ${months[mIdx] || parts[1]} ${parts[0]}`;
  } else if (/^\d{2}-\d{2}-\d{4}$/.test(dobStr)) {
    const parts = dobStr.split('-');
    year = Number(parts[2]);
  }
  const age = year > 1900 ? `${new Date().getFullYear() - year} Yrs` : '';
  return { formatted, age };
}

function TemplatePlaceholderCard() {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs flex flex-col justify-between min-h-[500px]">
      <div>
        <div className="flex items-center justify-between border-b border-slate-100 pb-3.5">
          <div>
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-amber-500" />
              Aadhaar Card Template
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Official UIDAI format with front &amp; back verification cards.
            </p>
          </div>
          <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] font-bold text-slate-600">
            Awaiting Verification
          </span>
        </div>

        {/* Blueprint Preview Frame */}
        <div className="mt-5 rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50/70 p-6 flex flex-col items-center justify-center text-center min-h-[380px]">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-100 text-amber-700 shadow-xs mb-3">
            <ShieldCheck className="h-8 w-8" />
          </div>
          <h4 className="text-sm font-bold text-slate-800">No Active Template Generated</h4>
          <p className="text-xs text-slate-500 max-w-sm mt-1.5 leading-relaxed">
            Enter citizen&apos;s Aadhaar number on the left and click <strong>Verify with DigiLocker</strong> to generate the live official e-Aadhaar card.
          </p>

          <div className="mt-6 grid grid-cols-2 gap-2.5 w-full max-w-sm text-left">
            <div className="rounded-xl bg-white border border-slate-200/80 p-2.5 text-xs text-slate-700 font-medium flex items-center gap-2 shadow-2xs">
              <Check className="h-4 w-4 text-emerald-600 shrink-0" /> Front Card with Photo
            </div>
            <div className="rounded-xl bg-white border border-slate-200/80 p-2.5 text-xs text-slate-700 font-medium flex items-center gap-2 shadow-2xs">
              <Check className="h-4 w-4 text-emerald-600 shrink-0" /> Back Card with QR
            </div>
            <div className="rounded-xl bg-white border border-slate-200/80 p-2.5 text-xs text-slate-700 font-medium flex items-center gap-2 shadow-2xs">
              <Check className="h-4 w-4 text-emerald-600 shrink-0" /> 1-Click PDF Download
            </div>
            <div className="rounded-xl bg-white border border-slate-200/80 p-2.5 text-xs text-slate-700 font-medium flex items-center gap-2 shadow-2xs">
              <Check className="h-4 w-4 text-emerald-600 shrink-0" /> High-Res PNG Output
            </div>
          </div>
        </div>
      </div>

      <p className="mt-4 text-center text-[11px] text-slate-400">
        Template generated directly from verified DigiLocker data · For reference &amp; official KYC verification only
      </p>
    </div>
  );
}

interface AadhaarDigiLockerPanelProps {
  canVerify: boolean;
  onUploaded?: () => void;
  selectedDetail?: AadhaarResultResponse | null;
  onClearSelected?: () => void;
  historySlot?: React.ReactNode;
}

export default function AadhaarDigiLockerPanel({
  canVerify,
  onUploaded,
  selectedDetail,
  onClearSelected,
  historySlot,
}: AadhaarDigiLockerPanelProps) {
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
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Sync selected record from history if clicked by operator
  useEffect(() => {
    if (!selectedDetail?.result) return undefined;

    const selectedResult = selectedDetail.result;
    let cancelled = false;
    const frame = window.requestAnimationFrame(() => {
      if (cancelled) return;
      setResult(selectedResult as AadhaarResult);
      setRecordId(selectedDetail.record?.id || '');
      setTemplate(selectedDetail.template || selectedDetail.record?.template || null);
      if (selectedResult.aadhaarNumber) {
        setAadhaarNumber(selectedResult.aadhaarNumber);
      } else if (selectedDetail.record?.maskedAadhaar) {
        setAadhaarNumber(selectedDetail.record.maskedAadhaar);
      }
      setSuccessMessage(`Viewing verified record: ${selectedResult.fullName || selectedDetail.record?.maskedAadhaar}`);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frame);
    };
  }, [selectedDetail]);

  const copyToClipboard = (key: string, text: string) => {
    if (!text) return;
    void navigator.clipboard.writeText(text);
    setCopiedKey(key);
    window.setTimeout(() => setCopiedKey(null), 2000);
  };

  const resetVerification = () => {
    setResult(null);
    setRecordId('');
    setTemplate(null);
    setBilling(null);
    setAadhaarNumber('');
    setError('');
    setSuccessMessage('');
    onClearSelected?.();
  };

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
      const recId = data.record?.id?.trim();
      const clientId = data.record?.providerClientId?.trim();
      if (!recId || !clientId || !data.sdkToken) throw new Error('DigiLocker session was not created.');
      setSession({
        recordId: recId,
        clientId,
        sdkToken: data.sdkToken,
        gateway: data.gateway === 'production' ? 'production' : 'sandbox',
        expirySeconds: data.expirySeconds,
      });
      setRecordId(recId);
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
      const recId = data.record?.id?.trim();
      const clientId = data.record?.providerClientId?.trim();
      if (!recId || !clientId || !data.sdkToken) throw new Error('DigiLocker session was not created.');
      setSession({
        recordId: recId,
        clientId,
        sdkToken: data.sdkToken,
        gateway: data.gateway === 'production' ? 'production' : 'sandbox',
        expirySeconds: data.expirySeconds,
      });
      setRecordId(recId);
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
      onUploaded?.();
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
      // Safely expires
    }
  };

  const displayFields = result ? getAadhaarDisplayFields(result) : null;
  const dobInfo = displayFields ? formatDobWithAge(displayFields.dob) : { formatted: '', age: '' };
  const effectiveAadhaar = aadhaarNumber || result?.aadhaarNumber || displayFields?.maskedAadhaar || '';

  return (
    <div className="space-y-5">
      {/* ======================================================== */}
      {/* ROW 1: TWO COLUMNS (LEFT: AADHAAR VERIFICATION | RIGHT: AADHAAR CARD TEMPLATE) */}
      {/* ======================================================== */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
        
        {/* ======================================================== */}
        {/* LEFT COLUMN: AADHAAR VERIFICATION CARD */}
        {/* ======================================================== */}
        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white shadow-xs overflow-hidden">
            {/* Card Header */}
            <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/70 px-5 py-3.5">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700 shadow-2xs">
                  <ShieldCheck className="h-4.5 w-4.5" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    Aadhaar Verification
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.2 text-[10px] font-bold text-emerald-800">
                      DigiLocker
                    </span>
                  </h2>
                  <p className="text-[11px] text-slate-500">Fetch consented Aadhaar details securely through DigiLocker.</p>
                </div>
              </div>

              {result && (
                <button
                  type="button"
                  onClick={resetVerification}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-bold text-slate-700 shadow-2xs hover:bg-slate-50 transition"
                  title="Run new verification"
                >
                  <PlusCircle className="h-3.5 w-3.5 text-amber-500" />
                  <span>New</span>
                </button>
              )}
            </div>

            <div className="p-5 space-y-4">
              {/* Form Box: Unmasked Aadhaar Verification */}
              <div className="rounded-xl border border-slate-200/90 bg-gradient-to-b from-slate-50/60 to-white p-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                  <div>
                    <h3 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                      <ShieldCheck className="h-4 w-4 text-amber-500" />
                      Unmasked Aadhaar Verification (Full 12 Digits)
                    </h3>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Enter citizen&apos;s 12-digit Aadhaar number to verify with DigiLocker and generate an unmasked card.
                    </p>
                  </div>
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200/80 px-2.5 py-0.5 text-[10px] font-bold text-emerald-800 shrink-0">
                    <BadgeCheck className="h-3.5 w-3.5 text-emerald-600" />
                    Unmasked
                  </span>
                </div>

                <form onSubmit={startVerification} className="mt-3">
                  <div className="flex items-center justify-between text-xs font-bold text-slate-700 mb-1">
                    <span>Aadhaar Number (Unmasked)</span>
                    {aadhaarNumber ? (
                      <span className={`text-[11px] font-semibold ${normalizeAadhaarInput(aadhaarNumber).length === 12 ? 'text-emerald-600 font-bold' : 'text-slate-500'}`}>
                        {normalizeAadhaarInput(aadhaarNumber).length} / 12 digits {normalizeAadhaarInput(aadhaarNumber).length === 12 ? '✓' : ''}
                      </span>
                    ) : (
                      <span className="text-[10px] font-normal text-slate-400">12 digits required</span>
                    )}
                  </div>

                  <div className="relative">
                    <input
                      type={showAadhaar ? 'text' : 'password'}
                      value={showAadhaar ? formatAadhaarNumber(aadhaarNumber) : (aadhaarNumber ? aadhaarNumber.replace(/(\d{4})(?=\d)/g, '$1 ') : '')}
                      onChange={(event) => {
                        setAadhaarNumber(normalizeAadhaarInput(event.target.value));
                        if (error) setError('');
                      }}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-mono tracking-widest text-slate-900 outline-none transition placeholder:text-slate-400 placeholder:font-sans placeholder:tracking-normal focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20"
                      placeholder="1234 5678 9012"
                      maxLength={14}
                      inputMode="numeric"
                      autoComplete="off"
                      disabled={busy || !canVerify}
                    />

                    <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                      {aadhaarNumber ? (
                        <button
                          type="button"
                          onClick={() => {
                            setAadhaarNumber('');
                            setError('');
                          }}
                          className="p-1 text-slate-400 hover:text-rose-600 rounded"
                          title="Clear"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => setShowAadhaar((prev) => !prev)}
                        className="p-1 text-slate-400 hover:text-slate-700 rounded"
                        title={showAadhaar ? 'Mask digits' : 'Unmask digits'}
                      >
                        {showAadhaar ? <Eye className="h-3.5 w-3.5 text-emerald-600" /> : <EyeOff className="h-3.5 w-3.5" />}
                      </button>
                    </div>
                  </div>

                  <div className="mt-1.5 flex items-center justify-between text-[11px] text-slate-500">
                    <span>Generates an <strong>Unmasked card</strong> with all 12 digits</span>
                  </div>

                  <div className="mt-3">
                    <button
                      type="submit"
                      disabled={busy || !canVerify}
                      className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-amber-500 hover:bg-amber-400 px-4 py-2.5 text-xs font-bold text-slate-950 transition shadow-xs disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                      {busy ? 'Connecting DigiLocker...' : 'Verify with DigiLocker'}
                    </button>
                  </div>
                </form>

                {/* Collapsible 1-Click Verification Trigger */}
                <div className="mt-3 border-t border-slate-100 pt-2.5">
                  <button
                    type="button"
                    onClick={() => setShowDirectDropdown((prev) => !prev)}
                    className="flex items-center justify-between w-full rounded-lg border border-slate-200/80 bg-slate-50/70 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
                  >
                    <div className="flex items-center gap-1.5">
                      <span className="flex h-4 w-4 items-center justify-center rounded-full bg-amber-100 text-amber-700 text-[10px] font-black">⚡</span>
                      <span className="text-[11px]">Optional: Instant 1-Click Verification without entering number</span>
                    </div>
                    {showDirectDropdown ? <ChevronUp className="h-3.5 w-3.5 text-slate-500" /> : <ChevronDown className="h-3.5 w-3.5 text-slate-500" />}
                  </button>

                  {showDirectDropdown && (
                    <div className="mt-2 rounded-xl border border-amber-200 bg-amber-50/50 p-3 text-xs animate-in fade-in">
                      <p className="text-[11px] text-slate-600 mb-2">
                        Citizen will enter their Aadhaar number directly in the official DigiLocker consent window.
                      </p>
                      <button
                        type="button"
                        onClick={() => void startDirectVerification()}
                        disabled={busy || !canVerify}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-bold text-white shadow-xs hover:bg-slate-800 disabled:opacity-50"
                      >
                        {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <ShieldCheck className="h-3 w-3 text-amber-400" />}
                        <span>Verify Directly in DigiLocker</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Error Message */}
              {error && (
                <div className="flex items-start justify-between rounded-xl border border-red-200 bg-red-50 p-2.5 text-xs text-red-700 animate-in fade-in">
                  <div className="flex items-center gap-2">
                    <XCircle className="h-4 w-4 shrink-0 text-red-600" />
                    <span>{error}</span>
                  </div>
                  <button type="button" onClick={() => setError('')} className="text-red-500 hover:text-red-800">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}

              {/* Success Banner */}
              {successMessage && (
                <div className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-800 animate-in fade-in">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                    <span>{successMessage}</span>
                  </div>
                  <button type="button" onClick={() => setSuccessMessage('')} className="text-emerald-700 hover:text-emerald-950">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}

              {/* VERIFIED CITIZEN DOSSIER (Rendered inside left card when result is active) */}
              {result && !template && (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-4 space-y-3.5 animate-in fade-in">
                  <div className="flex items-center justify-between border-b border-emerald-200/60 pb-2.5">
                    <span className="flex items-center gap-1.5 text-xs font-bold text-emerald-900">
                      <BadgeCheck className="h-4 w-4 text-emerald-600" /> Aadhaar Data Received from DigiLocker
                    </span>
                    {displayFields?.xmlUrl && displayFields.xmlUrl.startsWith('https://') && (
                      <a
                        href={displayFields.xmlUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-800 hover:underline"
                      >
                        <Download className="h-3 w-3" /> Signed XML
                      </a>
                    )}
                  </div>

                  {/* Citizen Profile Row */}
                  <div className="flex items-center gap-3">
                    <div className="relative shrink-0">
                      {displayFields?.profileImage ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={displayFields.profileImage}
                          alt="Citizen"
                          className="h-14 w-14 rounded-xl border border-slate-200 object-cover shadow-2xs bg-white"
                        />
                      ) : (
                        <div className="flex h-14 w-14 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-400">
                          <User className="h-6 w-6" />
                        </div>
                      )}
                      <span className="absolute -bottom-1 -right-1 flex h-4.5 w-4.5 items-center justify-center rounded-full bg-emerald-600 text-white shadow-2xs">
                        <Check className="h-2.5 w-2.5 stroke-[3]" />
                      </span>
                    </div>

                    <div className="flex-1 min-w-0">
                      <h4 className="text-sm font-black text-slate-900 truncate">
                        {displayFields?.name || 'CITIZEN NAME'}
                      </h4>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="font-mono text-xs font-bold text-slate-700">
                          {displayFields?.maskedAadhaar || 'XXXXXXXX0000'}
                        </span>
                        <button
                          type="button"
                          onClick={() => copyToClipboard('aadhaar', aadhaarNumber || displayFields?.maskedAadhaar || '')}
                          className="text-slate-400 hover:text-slate-700"
                          title="Copy number"
                        >
                          {copiedKey === 'aadhaar' ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Demographics 2x2 */}
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded-lg bg-white border border-emerald-100 p-2">
                      <span className="text-[10px] text-slate-500 font-medium">Date of Birth</span>
                      <div className="mt-0.5 flex items-center gap-1">
                        <span className="font-bold text-slate-900">{dobInfo.formatted || 'N/A'}</span>
                        {dobInfo.age && (
                          <span className="rounded bg-amber-100 px-1 text-[9px] font-bold text-amber-800">
                            {dobInfo.age}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="rounded-lg bg-white border border-emerald-100 p-2">
                      <span className="text-[10px] text-slate-500 font-medium">Gender</span>
                      <p className="mt-0.5 font-bold text-slate-900 uppercase">
                        {displayFields?.gender === 'M' ? 'MALE (M)' : displayFields?.gender === 'F' ? 'FEMALE (F)' : displayFields?.gender || 'N/A'}
                      </p>
                    </div>

                    <div className="rounded-lg bg-white border border-emerald-100 p-2">
                      <span className="text-[10px] text-slate-500 font-medium">Mobile Number</span>
                      <p className="mt-0.5 font-bold text-slate-900 font-mono">
                        {displayFields?.mobile ? `+91 ${displayFields.mobile}` : 'Not Linked'}
                      </p>
                    </div>

                    <div className="rounded-lg bg-white border border-emerald-100 p-2">
                      <span className="text-[10px] text-slate-500 font-medium">Care Of / Relation</span>
                      <p className="mt-0.5 font-bold text-slate-900 truncate">
                        {result.careOf || result.fatherName || 'Not Specified'}
                      </p>
                    </div>
                  </div>

                  {/* Address Box */}
                  <div>
                    <div className="flex items-center justify-between text-[11px] font-bold text-slate-700 mb-1">
                      <span className="flex items-center gap-1">
                        <MapPin className="h-3 w-3 text-amber-600" /> Permanent Residential Address
                      </span>
                      {displayFields?.address && (
                        <button
                          type="button"
                          onClick={() => copyToClipboard('addr', displayFields.address)}
                          className="text-[10px] font-semibold text-emerald-800 hover:underline"
                        >
                          {copiedKey === 'addr' ? 'Copied!' : 'Copy'}
                        </button>
                      )}
                    </div>
                    <div className="rounded-lg bg-white border border-emerald-100 p-2.5 text-xs text-slate-800 leading-relaxed font-medium">
                      {displayFields?.address || 'No address data returned.'}
                    </div>
                  </div>

                  {/* Wallet Billing Notice */}
                  <div className="flex items-center justify-between text-[11px] text-slate-600 border-t border-emerald-200/50 pt-2">
                    <span className="inline-flex items-center gap-1 text-emerald-800 font-semibold">
                      <WalletCards className="h-3.5 w-3.5" /> Wallet billing is disabled — ₹0 deducted
                    </span>
                    <span>Remaining balance: <strong>₹50,000.00</strong></span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ======================================================== */}
        {/* RIGHT COLUMN: AADHAAR CARD TEMPLATE STUDIO */}
        {/* ======================================================== */}
        <div className="space-y-4">
          {result ? (
            <AadhaarTemplatePreview
              data={{
                ...result,
                aadhaarNumber: effectiveAadhaar,
                issueDate: result.issueDate,
              }}
              recordId={recordId}
              template={template}
              onUploaded={(savedTemplate) => {
                setTemplate(savedTemplate);
                onUploaded?.();
              }}
            />
          ) : (
            <TemplatePlaceholderCard />
          )}
        </div>
      </div>

      {/* ======================================================== */}
      {/* ROW 2: FULL WIDTH AADHAAR HISTORY CARD (NICHE FULL WIDTH ME) */}
      {/* ======================================================== */}
      {historySlot && (
        <div className="w-full">
          {historySlot}
        </div>
      )}

      {/* DIGILOCKER MODAL SESSION */}
      {session && (
        <DigilockerVerificationModal
          session={session}
          onSuccess={(clientId) => void complete(clientId)}
          onClose={() => void cancel()}
        />
      )}
    </div>
  );
}
