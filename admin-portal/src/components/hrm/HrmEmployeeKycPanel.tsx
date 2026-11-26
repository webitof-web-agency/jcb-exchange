'use client';

import { useEffect, useState } from 'react';
import { BadgeCheck, Banknote, CreditCard, Eye, Fingerprint, Landmark, Loader2, Plus, RefreshCw, ShieldCheck, Star, Trash2, X } from 'lucide-react';
import { toast } from 'react-toastify';
import api from '@/lib/api';
import { hrmApi, type HrmBankAccount, type HrmDocument, type HrmKycDocumentType } from '@/lib/hrmApi';
import {
  EMPTY_BANK_ACCOUNT_FORM,
  getActiveKycDocument,
  getMaskedKycIdentifier,
  isSuccessfulVerification,
  normalizeAccountNumber,
  normalizeIfsc,
  toBankAccountPayload,
  validateBankAccountForm,
  type BankAccountForm,
} from '@/lib/hrmKyc';
import { formatHrmDate, getHrmErrorMessage } from '@/lib/hrmUi';
import { PAN_COMPREHENSIVE_ROUTE, validatePan } from '@/lib/panVerification';
import { validateAadhaarNumber } from '@/lib/aadhaarVerification';
import { KycVerificationPreviewModal, type KycVerificationPreview } from '@/components/accounts/sold-vehicle/SellAccountDocumentWidgets';
import { DigilockerVerificationModal, type DigilockerVerificationSession } from '@/components/accounts/sold-vehicle/DigilockerVerificationModal';

type HrmEmployeeKycPanelProps = {
  employeeId: string;
  employeeName: string;
  documents: HrmDocument[];
  bankAccounts: HrmBankAccount[];
  canManage: boolean;
  /** hrm.documents.read: needed to open the stored card file. */
  canViewDocuments: boolean;
  /** Signed-in user; a cached PAN result started by someone else cannot be saved by this user. */
  currentUserId: string | null;
  /** Reloads the employee after a change so every section shows the saved state. */
  onChanged: () => Promise<void> | void;
  /** Show only this part (opened from the joining checklist). */
  only?: 'PAN' | 'AADHAAR' | 'BANK' | null;
  /** Open the bank account form straight away ("Complete" on the bank item). */
  openBankForm?: boolean;
};

/** Blob responses hide the server's JSON error; read it back so the real message is shown. */
const readBlobError = async (error: unknown) => {
  const data = (error as { response?: { data?: unknown } })?.response?.data;
  if (typeof Blob === 'undefined' || !(data instanceof Blob)) return null;
  try {
    const parsed = JSON.parse(await data.text()) as { error?: unknown };
    return typeof parsed.error === 'string' && parsed.error.trim() ? parsed.error : null;
  } catch {
    return null;
  }
};

const requestedById = (response: Record<string, unknown>) => {
  const record = response.record;
  if (!isObject(record)) return null;
  if (typeof record.requestedById === 'string') return record.requestedById;
  return isObject(record.requestedBy) && typeof record.requestedBy.id === 'string' ? record.requestedBy.id : null;
};

type ActivePreview = { documentType: HrmKycDocumentType; preview: KycVerificationPreview };
type TemplateView = { title: string; url: string; mimeType: string };

const isObject = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value));

const failureMessage = (response: unknown, fallback: string) => {
  if (isObject(response) && isObject(response.record) && typeof response.record.safeMessage === 'string' && response.record.safeMessage.trim()) {
    return response.record.safeMessage;
  }
  return fallback;
};

const inputClass = 'h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-amber-400 focus:ring-2 focus:ring-amber-100 disabled:bg-slate-50';

/**
 * Employee KYC (PAN + Aadhaar through the existing Surepass flows and templates) and bank accounts.
 * The verified card template is saved on Google Drive by the shared verification service, which then
 * deletes the provider's raw data; HRM keeps only the masked number and a link to that template.
 */
export default function HrmEmployeeKycPanel({ employeeId, employeeName, documents, bankAccounts, canManage, canViewDocuments, currentUserId, onChanged, only = null, openBankForm = false }: HrmEmployeeKycPanelProps) {
  const [panNumber, setPanNumber] = useState('');
  const [aadhaarNumber, setAadhaarNumber] = useState('');
  const [busy, setBusy] = useState<HrmKycDocumentType | null>(null);
  const [fieldError, setFieldError] = useState<Partial<Record<HrmKycDocumentType, string>>>({});
  const [reverify, setReverify] = useState<Partial<Record<HrmKycDocumentType, boolean>>>({});
  const [activePreview, setActivePreview] = useState<ActivePreview | null>(null);
  const [aadhaarSession, setAadhaarSession] = useState<(DigilockerVerificationSession & { number: string }) | null>(null);
  const [templateView, setTemplateView] = useState<TemplateView | null>(null);
  const [openingTemplate, setOpeningTemplate] = useState<string | null>(null);

  const panDocument = getActiveKycDocument(documents, 'PAN');
  const aadhaarDocument = getActiveKycDocument(documents, 'AADHAAR');

  useEffect(() => () => { if (templateView) URL.revokeObjectURL(templateView.url); }, [templateView]);

  const setError = (type: HrmKycDocumentType, message: string) => setFieldError((current) => ({ ...current, [type]: message }));

  const openPreview = (documentType: HrmKycDocumentType, number: string, response: Record<string, unknown>) => {
    setActivePreview({ documentType, preview: { side: 'sell', kind: documentType === 'PAN' ? 'pan' : 'aadhaar', number, response } });
  };

  const verifyPan = async () => {
    const pan = panNumber.trim().toUpperCase();
    const invalid = validatePan(pan);
    if (invalid) { setError('PAN', invalid); return; }
    setError('PAN', '');
    setBusy('PAN');
    try {
      const response = await api.post<Record<string, unknown>>(PAN_COMPREHENSIVE_ROUTE, { id_number: pan });
      if (!isSuccessfulVerification(response.data)) {
        setError('PAN', failureMessage(response.data, 'PAN could not be verified. Check the number and try again.'));
        return;
      }
      // A cached result (same PAN verified in the last few minutes) belongs to whoever ran it.
      // Saving it here would be refused, so stop before the template is generated.
      const owner = requestedById(response.data);
      if (response.data.cacheHit === true && owner && currentUserId && owner !== currentUserId) {
        setError('PAN', 'This PAN was verified by another team member a few minutes ago. Please try again in 5 minutes.');
        return;
      }
      openPreview('PAN', pan, response.data);
    } catch (error) {
      setError('PAN', getHrmErrorMessage(error, 'PAN verification failed. Please try again.'));
    } finally {
      setBusy(null);
    }
  };

  const verifyAadhaar = async () => {
    const number = aadhaarNumber.replace(/\D/g, '');
    const invalid = validateAadhaarNumber(number);
    if (invalid) { setError('AADHAAR', invalid); return; }
    setError('AADHAAR', '');
    setBusy('AADHAAR');
    let waitingForDigilocker = false;
    try {
      const response = await api.post<Record<string, unknown>>('/aadhaar-verification/initialize', { aadhaarNumber: number, side: 'SALE' });
      const data = response.data;
      if (data.cacheHit === true && isObject(data.result)) {
        openPreview('AADHAAR', number, data);
        return;
      }
      const record = isObject(data.record) ? data.record : {};
      const clientId = typeof record.providerClientId === 'string' ? record.providerClientId.trim() : '';
      if (typeof record.id !== 'string' || typeof data.sdkToken !== 'string' || !clientId) {
        throw new Error('DigiLocker session could not be started. Please try again.');
      }
      setAadhaarSession({
        recordId: record.id,
        clientId,
        sdkToken: data.sdkToken,
        gateway: data.gateway === 'production' ? 'production' : 'sandbox',
        ...(typeof data.expirySeconds === 'number' ? { expirySeconds: data.expirySeconds } : {}),
        number,
      });
      waitingForDigilocker = true;
    } catch (error) {
      setError('AADHAAR', getHrmErrorMessage(error, 'Aadhaar verification could not be started.'));
    } finally {
      if (!waitingForDigilocker) setBusy(null);
    }
  };

  const completeAadhaar = async (clientId: string) => {
    const session = aadhaarSession;
    if (!session) return;
    try {
      const response = await api.post<Record<string, unknown>>('/aadhaar-verification/complete', { recordId: session.recordId, clientId });
      if (!isObject(response.data.result)) throw new Error('Aadhaar data was not returned by DigiLocker.');
      openPreview('AADHAAR', session.number, response.data);
    } catch (error) {
      setError('AADHAAR', getHrmErrorMessage(error, 'Aadhaar verification failed. Please try again.'));
    } finally {
      setAadhaarSession(null);
      setBusy(null);
    }
  };

  const closeDigilocker = async () => {
    const session = aadhaarSession;
    setAadhaarSession(null);
    setBusy(null);
    if (!session) return;
    try {
      await api.post('/aadhaar-verification/cancel', { recordId: session.recordId });
    } catch {
      // The server expires unused DigiLocker sessions on its own.
    }
  };

  const linkTemplate = async (documentType: HrmKycDocumentType, recordId: string) => {
    await hrmApi.linkKycVerification(employeeId, { documentType, verificationRecordId: recordId });
    toast.success(`${documentType === 'PAN' ? 'PAN' : 'Aadhaar'} saved to ${employeeName}'s profile.`);
    if (documentType === 'PAN') setPanNumber(''); else setAadhaarNumber('');
    setReverify((current) => ({ ...current, [documentType]: false }));
    await onChanged();
  };

  const viewTemplate = async (document: HrmDocument) => {
    setOpeningTemplate(document.id);
    try {
      const response = await hrmApi.getDocumentFile(document.id);
      const mimeType = response.data.type || document.mimeType || 'image/png';
      setTemplateView({ title: document.title, url: URL.createObjectURL(response.data), mimeType });
    } catch (error) {
      toast.error((await readBlobError(error)) || getHrmErrorMessage(error, 'Unable to open the saved template.'));
    } finally {
      setOpeningTemplate(null);
    }
  };

  const renderKycCard = (documentType: HrmKycDocumentType) => {
    const isPan = documentType === 'PAN';
    const document = isPan ? panDocument : aadhaarDocument;
    const value = isPan ? panNumber : aadhaarNumber;
    const showForm = canManage && (!document || reverify[documentType]);
    const Icon = isPan ? CreditCard : Fingerprint;
    return (
      <section className="flex flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${document ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'}`}>
              <Icon className="h-5 w-5" />
            </span>
            <div>
              <h3 className="font-bold text-slate-950">{isPan ? 'PAN card' : 'Aadhaar card'}</h3>
              <p className="mt-0.5 text-xs text-slate-500">{isPan ? 'Verified with Surepass (PAN comprehensive).' : 'Verified with Surepass through DigiLocker.'}</p>
            </div>
          </div>
          <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold ${document ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
            {document ? <BadgeCheck className="h-3.5 w-3.5" /> : null}
            {document ? 'Verified' : 'Not verified'}
          </span>
        </div>

        {document ? (
          <div className="mt-4 rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{isPan ? 'PAN' : 'Aadhaar'}</dt>
                <dd className="mt-0.5 font-mono font-semibold tracking-wider text-slate-900">{getMaskedKycIdentifier(document) || '—'}</dd>
              </div>
              <div>
                <dt className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Verified on</dt>
                <dd className="mt-0.5 font-semibold text-slate-900">{formatHrmDate(document.verifiedAt || document.createdAt)}</dd>
              </div>
            </dl>
            <div className="mt-3 flex flex-wrap gap-2">
              {canViewDocuments ? <button type="button" onClick={() => void viewTemplate(document)} disabled={openingTemplate === document.id} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 disabled:opacity-60">
                {openingTemplate === document.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Eye className="h-3.5 w-3.5" />} View card
              </button> : null}
              {canManage && !reverify[documentType] ? (
                <button type="button" onClick={() => setReverify((current) => ({ ...current, [documentType]: true }))} className="inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold text-slate-500 transition hover:bg-slate-100 hover:text-slate-800">
                  <RefreshCw className="h-3.5 w-3.5" /> Re-verify
                </button>
              ) : null}
            </div>
          </div>
        ) : !canManage ? (
          <p className="mt-4 text-sm text-slate-500">Not verified yet.</p>
        ) : null}

        {showForm ? (
          <div className="mt-4">
            <label htmlFor={`hrm-kyc-${documentType}`} className="text-xs font-semibold text-slate-700">
              {isPan ? 'PAN number' : 'Aadhaar number'}
            </label>
            <div className="mt-1 flex gap-2">
              <input
                id={`hrm-kyc-${documentType}`}
                value={value}
                onChange={(event) => {
                  const next = isPan ? event.target.value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 10) : event.target.value.replace(/\D/g, '').slice(0, 12);
                  if (isPan) setPanNumber(next); else setAadhaarNumber(next);
                  if (fieldError[documentType]) setError(documentType, '');
                }}
                placeholder={isPan ? 'ABCDE1234F' : '12-digit Aadhaar'}
                inputMode={isPan ? 'text' : 'numeric'}
                autoComplete="off"
                className={`${inputClass} min-w-0 flex-1 font-mono tracking-wider`}
              />
              <button
                type="button"
                onClick={() => void (isPan ? verifyPan() : verifyAadhaar())}
                disabled={!value || busy !== null}
                className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-lg bg-amber-400 px-4 text-xs font-bold text-slate-950 transition hover:bg-amber-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {busy === documentType ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />}
                {busy === documentType ? 'Verifying...' : 'Verify'}
              </button>
              {document && reverify[documentType] ? (
                <button type="button" onClick={() => setReverify((current) => ({ ...current, [documentType]: false }))} className="inline-flex h-10 shrink-0 items-center rounded-lg px-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Cancel re-verification">
                  <X className="h-4 w-4" />
                </button>
              ) : null}
            </div>
            {fieldError[documentType] ? (
              <p className="mt-1.5 text-xs font-medium text-rose-600">{fieldError[documentType]}</p>
            ) : (
              <p className="mt-1.5 text-xs text-slate-500">
                After verification, review the card and press <strong>Save to employee</strong>. The card is stored on Google Drive and the raw verification data is deleted.
              </p>
            )}
          </div>
        ) : null}
      </section>
    );
  };

  return (
    <div className="space-y-5">
      {only === 'BANK' ? null : (
        <div className={only ? 'max-w-2xl' : 'grid gap-5 lg:grid-cols-2'}>
          {only === 'AADHAAR' ? null : renderKycCard('PAN')}
          {only === 'PAN' ? null : renderKycCard('AADHAAR')}
        </div>
      )}

      {only === 'PAN' || only === 'AADHAAR' ? null : <BankAccountsSection employeeId={employeeId} employeeName={employeeName} bankAccounts={bankAccounts} canManage={canManage} onChanged={onChanged} startOpen={openBankForm} />}

      {activePreview ? (
        <KycVerificationPreviewModal
          key={`${activePreview.documentType}-${activePreview.preview.number}`}
          preview={activePreview.preview}
          contextLabel={`HRM employee · ${employeeName}`}
          templateSaveLabel="Save to employee"
          onTemplateSaved={(recordId) => linkTemplate(activePreview.documentType, recordId)}
          onClose={() => setActivePreview(null)}
        />
      ) : null}

      {aadhaarSession ? (
        <DigilockerVerificationModal
          session={aadhaarSession}
          onSuccess={(clientId) => void completeAadhaar(clientId)}
          onClose={() => { void closeDigilocker(); }}
        />
      ) : null}

      {templateView ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/65 p-4" onMouseDown={() => setTemplateView(null)}>
          <div role="dialog" aria-modal="true" aria-label={templateView.title} className="flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl" onMouseDown={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
              <h3 className="font-semibold text-slate-900">{templateView.title}</h3>
              <div className="flex items-center gap-2">
                <a href={templateView.url} download={`${templateView.title.replace(/[^A-Za-z0-9]+/g, '-')}.${templateView.mimeType === 'application/pdf' ? 'pdf' : 'png'}`} className="inline-flex h-8 items-center rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50">Download</a>
                <button type="button" onClick={() => setTemplateView(null)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Close"><X className="h-4 w-4" /></button>
              </div>
            </div>
            <div className="min-h-0 overflow-auto bg-slate-50 p-4">
              {templateView.mimeType === 'application/pdf' ? (
                <iframe title={templateView.title} src={templateView.url} className="h-[70vh] w-full rounded-lg border-0" />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element -- blob URL from an authenticated download
                <img src={templateView.url} alt={templateView.title} className="mx-auto max-h-[70vh] w-auto rounded-lg shadow-sm" />
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function BankAccountsSection({ employeeId, employeeName, bankAccounts, canManage, onChanged, startOpen = false }: {
  employeeId: string;
  employeeName: string;
  bankAccounts: HrmBankAccount[];
  canManage: boolean;
  onChanged: () => Promise<void> | void;
  startOpen?: boolean;
}) {
  const [showForm, setShowForm] = useState(() => startOpen && canManage);
  const [form, setForm] = useState<BankAccountForm>(() => ({ ...EMPTY_BANK_ACCOUNT_FORM, accountHolderName: employeeName, isPrimary: bankAccounts.length === 0 }));
  const [errors, setErrors] = useState<Partial<Record<keyof BankAccountForm, string>>>({});
  const [saving, setSaving] = useState(false);
  const [busyAccount, setBusyAccount] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  // The first account is always the salary account (the server enforces the same rule).
  const isFirstAccount = bankAccounts.length === 0;

  const update = (key: keyof BankAccountForm, value: string | boolean) => {
    setForm((current) => ({ ...current, [key]: value }));
    if (errors[key]) setErrors((current) => ({ ...current, [key]: undefined }));
  };

  const openForm = () => {
    setForm({ ...EMPTY_BANK_ACCOUNT_FORM, accountHolderName: employeeName, isPrimary: bankAccounts.length === 0 });
    setErrors({});
    setShowForm(true);
  };

  const save = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextErrors = validateBankAccountForm(form);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;
    setSaving(true);
    try {
      await hrmApi.createBankAccount(employeeId, toBankAccountPayload({ ...form, isPrimary: isFirstAccount || form.isPrimary }));
      toast.success('Bank account saved securely.');
      setShowForm(false);
      setForm(EMPTY_BANK_ACCOUNT_FORM);
      await onChanged();
    } catch (error) {
      toast.error(getHrmErrorMessage(error, 'Unable to save the bank account.'));
    } finally {
      setSaving(false);
    }
  };

  const makePrimary = async (accountId: string) => {
    setBusyAccount(accountId);
    try {
      await hrmApi.setPrimaryBankAccount(employeeId, accountId);
      toast.success('Primary salary account updated.');
      await onChanged();
    } catch (error) {
      toast.error(getHrmErrorMessage(error, 'Unable to update the primary account.'));
    } finally {
      setBusyAccount(null);
    }
  };

  const remove = async (accountId: string) => {
    setBusyAccount(accountId);
    try {
      await hrmApi.removeBankAccount(employeeId, accountId);
      toast.success('Bank account removed.');
      setConfirmRemove(null);
      await onChanged();
    } catch (error) {
      toast.error(getHrmErrorMessage(error, 'Unable to remove the bank account.'));
    } finally {
      setBusyAccount(null);
    }
  };

  const fieldClass = (key: keyof BankAccountForm) => `${inputClass} ${errors[key] ? 'border-rose-300 focus:border-rose-400 focus:ring-rose-100' : ''}`;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-50 text-sky-600"><Landmark className="h-5 w-5" /></span>
          <div>
            <h3 className="font-bold text-slate-950">Bank accounts</h3>
            <p className="mt-0.5 text-xs text-slate-500">Account numbers are encrypted. Only the last four digits are ever shown.</p>
          </div>
        </div>
        {canManage && !showForm ? (
          <button type="button" onClick={openForm} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-slate-950 px-3 text-xs font-bold text-white transition hover:bg-slate-800">
            <Plus className="h-3.5 w-3.5" /> Add bank account
          </button>
        ) : null}
      </div>

      {showForm ? (
        <form onSubmit={save} noValidate className="mt-4 rounded-xl border border-slate-200 bg-slate-50/70 p-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-xs font-semibold text-slate-700">
              Account holder name <span className="text-rose-500">*</span>
              <input value={form.accountHolderName} onChange={(event) => update('accountHolderName', event.target.value)} autoComplete="off" className={`mt-1 ${fieldClass('accountHolderName')}`} />
              {errors.accountHolderName ? <span className="mt-1 block font-medium text-rose-600">{errors.accountHolderName}</span> : null}
            </label>
            <label className="text-xs font-semibold text-slate-700">
              Bank name
              <input value={form.bankName} onChange={(event) => update('bankName', event.target.value)} placeholder="State Bank of India" autoComplete="off" className={`mt-1 ${fieldClass('bankName')}`} />
              {errors.bankName ? <span className="mt-1 block font-medium text-rose-600">{errors.bankName}</span> : null}
            </label>
            <label className="text-xs font-semibold text-slate-700">
              Account number <span className="text-rose-500">*</span>
              <input value={form.accountNumber} onChange={(event) => update('accountNumber', normalizeAccountNumber(event.target.value))} inputMode="numeric" autoComplete="off" className={`mt-1 font-mono tracking-wider ${fieldClass('accountNumber')}`} />
              {errors.accountNumber ? <span className="mt-1 block font-medium text-rose-600">{errors.accountNumber}</span> : null}
            </label>
            <label className="text-xs font-semibold text-slate-700">
              Confirm account number <span className="text-rose-500">*</span>
              <input value={form.confirmAccountNumber} onChange={(event) => update('confirmAccountNumber', normalizeAccountNumber(event.target.value))} onPaste={(event) => event.preventDefault()} inputMode="numeric" autoComplete="off" className={`mt-1 font-mono tracking-wider ${fieldClass('confirmAccountNumber')}`} />
              {errors.confirmAccountNumber ? <span className="mt-1 block font-medium text-rose-600">{errors.confirmAccountNumber}</span> : null}
            </label>
            <label className="text-xs font-semibold text-slate-700">
              IFSC <span className="text-rose-500">*</span>
              <input value={form.ifsc} onChange={(event) => update('ifsc', normalizeIfsc(event.target.value))} placeholder="SBIN0001234" autoComplete="off" className={`mt-1 font-mono uppercase tracking-wider ${fieldClass('ifsc')}`} />
              {errors.ifsc ? <span className="mt-1 block font-medium text-rose-600">{errors.ifsc}</span> : null}
            </label>
            <label className="flex items-center gap-2 self-end pb-2 text-xs font-semibold text-slate-700">
              <input type="checkbox" checked={isFirstAccount || form.isPrimary} disabled={isFirstAccount} onChange={(event) => update('isPrimary', event.target.checked)} className="h-4 w-4 rounded accent-amber-500 disabled:opacity-70" />
              {isFirstAccount ? 'Primary salary account (first account)' : 'Use as primary salary account'}
            </label>
          </div>
          <div className="mt-4 flex justify-end gap-2 border-t border-slate-200 pt-4">
            <button type="button" onClick={() => setShowForm(false)} disabled={saving} className="h-9 rounded-lg border border-slate-200 bg-white px-4 text-xs font-semibold text-slate-600 hover:bg-slate-50">Cancel</button>
            <button type="submit" disabled={saving} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-amber-400 px-4 text-xs font-bold text-slate-950 hover:bg-amber-500 disabled:opacity-60">
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Banknote className="h-3.5 w-3.5" />} {saving ? 'Saving...' : 'Save bank account'}
            </button>
          </div>
        </form>
      ) : null}

      <div className="mt-4">
        {bankAccounts.length ? (
          <ul className="divide-y divide-slate-100 rounded-xl border border-slate-100">
            {bankAccounts.map((account) => (
              <li key={account.id} className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold text-slate-900">{account.bankName || 'Bank account'}</p>
                    {account.isPrimary ? <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-800"><Star className="h-3 w-3" /> Primary</span> : null}
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    {account.accountHolderName || '—'} · <span className="font-mono tracking-wider text-slate-700">{account.maskedAccountNumber || '—'}</span> · <span className="font-mono">{account.ifsc || '—'}</span>
                  </p>
                  <p className="mt-0.5 text-[11px] text-slate-400">Added {formatHrmDate(account.createdAt)}</p>
                </div>
                {canManage ? (
                  <div className="flex shrink-0 items-center gap-2">
                    {confirmRemove === account.id ? (
                      <>
                        <span className="text-xs font-medium text-slate-600">Remove this account?</span>
                        <button type="button" onClick={() => void remove(account.id)} disabled={busyAccount === account.id} className="inline-flex h-8 items-center gap-1 rounded-lg bg-rose-600 px-3 text-xs font-semibold text-white hover:bg-rose-700 disabled:opacity-60">
                          {busyAccount === account.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null} Remove
                        </button>
                        <button type="button" onClick={() => setConfirmRemove(null)} className="h-8 rounded-lg px-2 text-xs font-semibold text-slate-500 hover:bg-slate-100">Keep</button>
                      </>
                    ) : (
                      <>
                        {!account.isPrimary ? (
                          <button type="button" onClick={() => void makePrimary(account.id)} disabled={busyAccount === account.id} className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60">
                            {busyAccount === account.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Star className="h-3.5 w-3.5" />} Make primary
                          </button>
                        ) : null}
                        <button type="button" onClick={() => setConfirmRemove(account.id)} className="inline-flex h-8 items-center rounded-lg px-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600" aria-label={`Remove ${account.bankName || 'bank account'}`}>
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </>
                    )}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-xl border border-dashed border-slate-200 px-4 py-6 text-center text-sm text-slate-500">No bank account saved yet.</p>
        )}
      </div>
    </section>
  );
}
