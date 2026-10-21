'use client';

import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowLeft, ArrowRight, Bookmark, Car, CheckCircle2, ClipboardCheck, Copy, ExternalLink, FileText, Handshake, IndianRupee,
  Loader2, MessageCircle, Plus, Repeat, ShoppingCart, Trash2, Truck, Wallet, X,
} from 'lucide-react';
import { toast } from 'react-toastify';
import api from '@/lib/api';
import SearchableSelect from '@/components/ui/SearchableSelect';
import BrandLoader from '@/components/ui/BrandLoader';
import { useAuthStore } from '@/store/authStore';
import { useTranslation } from '@/hooks/useTranslation';
import { hasAnyPermission } from '@/lib/permissionUtils';
import { getAccountCreatePermissions, getAccountUpdatePermissions } from '@/lib/accountsPermissions';
import { deleteSecureFileFromServer, type UploadedFileResult } from '@/lib/fileUpload';
import { normalizeSellAccountDocuments } from '@/lib/sellAccountDocuments.mjs';
import {
  calculateSellAccountFinance,
  deriveSellAccountDealStatus,
  GST_RATE_PERCENT,
  getSellAccountTaxLines,
  SELL_ACCOUNT_EXPENSE_FIELDS,
  sumExpenseBreakdown,
} from '@/lib/sellAccountFinance.mjs';
import {
  getSellAccountValidationErrors,
  normalizeAmountInput,
  normalizeSellAccountChassisNumber,
  toEditableAmount,
} from '@/lib/sellAccountForm.mjs';
import { getListingAccountPrefill } from '@/lib/listingAccountPrefill.mjs';
import { getSellAccountPaymentBalances } from '@/lib/sellAccountPaymentPresentation.mjs';
import {
  applySourceTypeChange,
  getListingDealParties,
  isOwnStockSource,
  JCB_EXCHANGE_BROKER,
  JCB_EXCHANGE_COMPANY_NAME,
  PURCHASE_TYPE_OPTIONS,
  SALE_TYPE_OPTIONS,
  SOURCE_TYPE_OPTIONS,
} from '@/lib/soldVehicleParties.mjs';
import {
  createEmptySellAccountKyc,
  createFailedVerificationState,
  createVerificationState,
  normalizeSellAccountKycNumber,
  SELL_ACCOUNT_KYC_STATUS,
} from '@/lib/sellAccountKyc.mjs';
import { PAN_COMPREHENSIVE_ROUTE, validatePan } from '@/lib/panVerification';
import { validateGstin } from '@/lib/gstVerification';
import { buildVerificationCacheKey, getVerificationCache, setVerificationCache } from '@/lib/verificationRequestCache';
import {
  accountsPortalBase,
  createInitialSellAccountForm,
  DEAL_STATUS_CONFIG,
  formatDisplayDate,
  formatInr,
  normalizeServerSellAccount,
  normalizeSellAccountRecord,
  todayInput,
  type SellAccountApiRecord,
  type SellAccountDealStatus,
  type SellAccountDocument,
  type SellAccountDocumentKey,
  type SellAccountDocuments,
  type SellAccountExpenseBreakdown,
  type SellAccountFormState,
  type SellAccountKycKind,
  type SellAccountKyc,
  type SellAccountKycState,
  type SellAccountPayment,
  type SellAccountRecord,
  type SellAccountSourceType,
  type StoredSellAccountRecord,
} from './soldVehicleModel';
import { DeedDocumentPreview, KycVerificationPreviewModal, PanVerificationField, SellAccountKycFields, SellAccountPdfField, type KycVerificationPreview } from './SellAccountDocumentWidgets';
import CitySelect, { type LocationOption } from '../CitySelect';
import { ApiFillBox, ApiFillLegend } from '@/components/ui/ApiFillBadge';

type NamedOption = { id: string; name: string };

const LOCAL_RECORDS_KEY = 'jcb_sell_accounts_records';
const ESIGN_PLATFORM_URL = 'https://esign.surepass.app/';

const inputClass = 'h-[34px] w-full rounded-lg border bg-white px-2.5 text-[13px] font-medium text-gray-900 placeholder:font-normal placeholder:text-gray-400 outline-none transition focus:border-amber-500 focus:ring-2 focus:ring-amber-500/15 disabled:bg-gray-50 disabled:text-gray-500';
const inputBorder = (hasError?: boolean) => (hasError ? 'border-rose-400' : 'border-gray-200');

const sanitizePhone = (value: string) => value.replace(/\D/g, '').slice(0, 10);
const sanitizeVehicleNumber = (value: string) => value.toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 15);

const apiErrorMessage = (error: unknown, fallback: string) => {
  const response = (error as { response?: { status?: number; data?: { error?: unknown; message?: unknown } } })?.response;
  const detail = response?.data?.error ?? response?.data?.message;
  if (typeof detail === 'string' && detail.trim()) return detail.trim();
  if (typeof response?.status === 'number') return `${fallback} (HTTP ${response.status})`;
  return fallback;
};

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value));

function Field({ label, required, error, hint, className = '', apiFill = null, children }: { label: string; required?: boolean; error?: string; hint?: ReactNode; className?: string; apiFill?: { source: string; filled?: boolean } | null; children: ReactNode }) {
  return (
    <div className={`min-w-0 ${className}`}>
      <label className="mb-1 flex items-center justify-between gap-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
        <span className="truncate">{label}{required ? <span className="ml-0.5 text-rose-500">*</span> : null}</span>
        {hint ? <span className="shrink-0 normal-case tracking-normal text-[11px] font-medium text-gray-400">{hint}</span> : null}
      </label>
      <ApiFillBox apiFill={apiFill}>{children}</ApiFillBox>
      {error ? <p className="mt-0.5 text-[11px] font-medium text-rose-500">{error}</p> : null}
    </div>
  );
}

/** Keeps the typed text (so "0" and "12." are editable) while the form stores numbers. */
function AmountInput({ value, onChange, placeholder = '0', hasError, disabled }: { value: number | undefined; onChange: (value: number) => void; placeholder?: string; hasError?: boolean; disabled?: boolean }) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-xs font-semibold text-gray-400">₹</span>
      <input
        type="text"
        inputMode="decimal"
        disabled={disabled}
        placeholder={placeholder}
        value={draft ?? toEditableAmount(value)}
        onChange={(event) => {
          const normalized = normalizeAmountInput(event.target.value);
          setDraft(normalized.raw);
          onChange(normalized.value);
        }}
        onBlur={() => setDraft(null)}
        className={`${inputClass} ${inputBorder(hasError)} pl-6 font-semibold tabular-nums`}
      />
    </div>
  );
}

function Segmented<T extends string>({ value, options, onChange, disabled }: { value: T; options: Array<{ value: T; label: string }>; onChange: (value: T) => void; disabled?: boolean }) {
  return (
    <div className="inline-flex h-[34px] w-full rounded-lg border border-gray-200 bg-gray-50 p-0.5">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          disabled={disabled}
          onClick={() => onChange(option.value)}
          className={`flex-1 rounded-md px-2 text-xs font-bold transition ${value === option.value ? 'bg-white text-gray-950 shadow-sm ring-1 ring-gray-200' : 'text-gray-500 hover:text-gray-800'}`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function Section({ icon, title, aside, children, className = '' }: { icon: ReactNode; title: ReactNode; aside?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-xl border border-gray-200 bg-white shadow-xs ${className}`}>
      <header className="flex items-center justify-between gap-3 border-b border-gray-100 px-4 py-2.5">
        <h2 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-gray-800">
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-amber-500/10 text-amber-700">{icon}</span>
          {title}
        </h2>
        {aside}
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}

const pickForm = (record: SellAccountRecord): SellAccountFormState => {
  const { id: _id, createdAt: _createdAt, ...rest } = record;
  void _id;
  void _createdAt;
  return { ...rest, purchaserDate: rest.purchaserDate || rest.sellDate };
};

const readLocalRecords = (): StoredSellAccountRecord[] => {
  try {
    const parsed = JSON.parse(localStorage.getItem(LOCAL_RECORDS_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const removeLocalRecord = (id: string) => {
  try {
    localStorage.setItem(LOCAL_RECORDS_KEY, JSON.stringify(readLocalRecords().filter((record) => record.id !== id)));
  } catch {
    // Browser storage is only a legacy cache.
  }
};

const initialPaymentDraft = () => ({
  side: 'PURCHASER_RECEIPT' as SellAccountPayment['side'],
  amount: '',
  paymentDate: todayInput(),
  method: 'BANK_TRANSFER' as SellAccountPayment['method'],
  reference: '',
  note: '',
});

export default function SoldVehicleForm({ recordId }: { recordId?: string }) {
  const copyEsignPlatformLink = async () => {
    try {
      await navigator.clipboard.writeText(ESIGN_PLATFORM_URL);
      toast.success('E-sign platform link copied.');
    } catch {
      toast.error('Unable to copy the E-sign platform link.');
    }
  };

  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { t } = useTranslation();
  const portal = accountsPortalBase(pathname);
  const listPath = `${portal}/accounts/sell-accounts`;
  const rtoBasePath = `${portal}/accounts/rto-work-status`;
  const listingIdParam = searchParams.get('listingId')?.trim() || '';

  const currentUser = useAuthStore((state) => state.user);
  const permissions = currentUser?.permissions || [];
  const isAdmin = currentUser?.role === 'SUPER_ADMIN' || currentUser?.role === 'ADMIN';
  const canCreate = isAdmin || hasAnyPermission(permissions, getAccountCreatePermissions('sell-accounts'));
  const canUpdate = isAdmin || hasAnyPermission(permissions, getAccountUpdatePermissions('sell-accounts'));
  const canManageRto = isAdmin || hasAnyPermission(permissions, [
    ...getAccountCreatePermissions('rto-work-status'),
    ...getAccountUpdatePermissions('rto-work-status'),
  ]);

  const [form, setForm] = useState<SellAccountFormState>(createInitialSellAccountForm);
  const [existingRecord, setExistingRecord] = useState<SellAccountRecord | null>(null);
  const [localDraftId, setLocalDraftId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busyAction, setBusyAction] = useState<'draft' | 'save' | 'rto' | 'payment' | null>(null);
  const [startRtoRequested, setStartRtoRequested] = useState(false);
  const [listedPrice, setListedPrice] = useState(0);
  const [categories, setCategories] = useState<NamedOption[]>([]);
  const [brands, setBrands] = useState<NamedOption[]>([]);
  const [states, setStates] = useState<LocationOption[]>([]);
  const [paymentDraft, setPaymentDraft] = useState(initialPaymentDraft);
  const [verificationPreviews, setVerificationPreviews] = useState<Record<string, KycVerificationPreview>>({});
  const [activeVerificationPreview, setActiveVerificationPreview] = useState<KycVerificationPreview | null>(null);
  const [kycBusyKey, setKycBusyKey] = useState<string | null>(null);
  const [activeUploads, setActiveUploads] = useState(0);
  const [pendingReplacedDocuments, setPendingReplacedDocuments] = useState<SellAccountDocument[]>([]);
  const originalDocumentUrls = useRef<Set<string>>(new Set());
  const restoredVerificationPreviews = useRef(false);

  const isPersisted = Boolean(existingRecord && !existingRecord.id.startsWith('DRAFT-SELL-'));
  const isEditing = Boolean(existingRecord);
  const isDraftRecord = !existingRecord || existingRecord.isDraft === true;
  const hasLinkedRto = Boolean(existingRecord?.rtoRecord?.id);
  const ownStock = isOwnStockSource(form.sourceType);
  // Vehicle and purchase-side details come from the linked listing (fetched from the API).
  const listingApiFill = form.listingId ? { source: 'the linked listing', filled: true } : null;

  // Master data
  useEffect(() => {
    let cancelled = false;
    void Promise.allSettled([api.get('/master/categories'), api.get('/master/brands')]).then(([categoriesResult, brandsResult]) => {
      if (cancelled) return;
      if (categoriesResult.status === 'fulfilled') setCategories(categoriesResult.value.data?.data || []);
      if (brandsResult.status === 'fulfilled') setBrands(brandsResult.value.data?.data || []);
    });
    void (async () => {
      try {
        const countries = await api.get<Array<{ id: string | number; name?: string }>>('/locations/countries');
        const india = (countries.data || []).find((country) => country.name?.trim().toLowerCase() === 'india');
        if (!india) return;
        const response = await api.get<LocationOption[]>(`/locations/states/${india.id}`);
        if (!cancelled) setStates(response.data || []);
      } catch {
        if (!cancelled) setStates([]);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const applyRecord = useCallback((record: SellAccountRecord) => {
    setExistingRecord(record);
    setForm(pickForm(record));
    originalDocumentUrls.current = new Set(
      Object.values(normalizeSellAccountDocuments(record) as SellAccountDocuments)
        .map((document) => document?.fileUrl)
        .filter((url): url is string => Boolean(url)),
    );
  }, []);

  const applyPaymentRecord = (record: SellAccountRecord) => {
    setExistingRecord((current) => current ? {
      ...current,
      payments: record.payments || [],
      balanceAmount: record.balanceAmount,
      dealStatus: record.dealStatus,
      rtoStatusSnapshot: record.rtoStatusSnapshot,
    } : current);
    setForm((current) => ({
      ...current,
      payments: record.payments || [],
      rtoStatusSnapshot: record.rtoStatusSnapshot,
    }));
  };

  // Record / listing prefill
  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setLoadError('');
      try {
        if (recordId) {
          if (recordId.startsWith('DRAFT-SELL-')) {
            const local = readLocalRecords().find((record) => record.id === recordId);
            if (!local) throw new Error('This draft is no longer available in this browser.');
            const record = normalizeSellAccountRecord(local);
            if (!cancelled) {
              setLocalDraftId(record.id);
              setExistingRecord(null);
              setForm(pickForm(record));
            }
            return;
          }
          const response = await api.get<{ record?: SellAccountApiRecord }>(`/recruitment/admin/sell-accounts/${encodeURIComponent(recordId)}`);
          if (!response.data?.record) throw new Error('Sold Vehicle record not found.');
          const record = normalizeServerSellAccount(response.data.record);
          if (record.isLocked) {
            toast.info('This record is locked and can only be viewed.');
            router.replace(`${listPath}/${encodeURIComponent(record.id)}`);
            return;
          }
          if (!cancelled) applyRecord(record);
          return;
        }

        if (listingIdParam) {
          const existing = await api.get<{ records?: SellAccountApiRecord[] }>('/recruitment/admin/sell-accounts')
            .then((response) => (response.data?.records || []).find((record) => String(record.listingId || '') === listingIdParam))
            .catch(() => undefined);
          if (existing?.id) {
            router.replace(`${listPath}/${encodeURIComponent(String(existing.id))}/edit`);
            return;
          }
          const response = await api.get<{ listing?: Record<string, unknown> }>(`/listings/${encodeURIComponent(listingIdParam)}`);
          const listing = response.data?.listing;
          if (!listing) throw new Error('Listing not found.');
          const prefill = getListingAccountPrefill(listing);
          const parties = getListingDealParties(listing);
          if (cancelled) return;
          setListedPrice(parties.listedPrice);
          setForm({
            ...createInitialSellAccountForm(),
            listingId: prefill.listingId,
            listingTitle: prefill.listingTitle,
            ownerName: prefill.ownerName,
            ownerNumber: prefill.ownerNumber,
            vehicleNumber: prefill.vehicleNumber,
            chassisNumber: prefill.chassisNumber,
            vehicleType: prefill.vehicleType,
            brandName: prefill.brandName,
            vehicleModel: prefill.vehicleModel,
            sourceType: (parties.sourceType || '') as SellAccountSourceType | '',
            sellerName: parties.sellerName,
            sellerNumber: parties.sellerNumber,
            sellerCity: parties.sellerCity,
            sellerState: parties.sellerState,
            brokerName: parties.brokerName,
            brokerNumber: parties.brokerNumber,
          });
          return;
        }

        if (!cancelled) {
          setForm({ ...createInitialSellAccountForm(), brokerName: JCB_EXCHANGE_BROKER.name, brokerNumber: JCB_EXCHANGE_BROKER.number });
        }
      } catch (error) {
        if (!cancelled) setLoadError(apiErrorMessage(error, error instanceof Error ? error.message : 'Unable to load this Sold Vehicle record.'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [applyRecord, listPath, listingIdParam, recordId, router]);

  useEffect(() => {
    if (loading || restoredVerificationPreviews.current) return;
    restoredVerificationPreviews.current = true;

    const kyc = form.kyc || createEmptySellAccountKyc();
    const targets: Array<{ side: 'purchase' | 'sell'; kind: 'pan' | 'gst'; number: string; recordId: string }> = [];
    (['purchase', 'sell'] as const).forEach((side) => {
      (['pan', 'gst'] as const).forEach((kind) => {
        const state = kyc[side][kind];
        if (state.status === SELL_ACCOUNT_KYC_STATUS.VERIFIED && state.number && state.verificationRecordId) {
          targets.push({ side, kind, number: state.number, recordId: state.verificationRecordId });
        }
      });
    });
    if (!targets.length) return;

    let cancelled = false;
    void Promise.allSettled(targets.map(async ({ side, kind, number, recordId }) => {
      const endpoint = kind === 'pan' ? `/pan-verification/history/${encodeURIComponent(recordId)}` : `/gst-verification/history/${encodeURIComponent(recordId)}`;
      const response = await api.get<Record<string, unknown>>(endpoint);
      const data = response.data;
      if (cancelled || !data || !isRecord(data.result)) return;
      const preview: KycVerificationPreview = { side, kind, number, response: data };
      setVerificationCache(buildVerificationCacheKey(kind, number), preview);
      setVerificationPreviews((current) => ({ ...current, [`${side}-${kind}`]: preview }));
    })).catch(() => undefined);

    return () => { cancelled = true; };
  }, [form, loading]);

  const update = <K extends keyof SellAccountFormState>(key: K, value: SellAccountFormState[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
    if (errors[key as string]) setErrors((current) => ({ ...current, [key as string]: '' }));
  };

  const expenseTotal = useMemo(() => sumExpenseBreakdown(form.expenseBreakdown), [form.expenseBreakdown]);
  const saleExchangeValue = form.saleType === 'EXCHANGE' ? Number(form.saleExchangeValue || 0) : 0;
  const purchaseExchangeValue = form.purchaseType === 'EXCHANGE' ? Number(form.purchaseExchangeValue || 0) : 0;

  const finance = useMemo(() => calculateSellAccountFinance({
    sellAmount: form.sellAmount,
    purchaseAmount: form.purchaseAmount,
    expenses: expenseTotal,
    sellerState: form.sellerState,
    purchaserState: form.purchaserState,
    saleExchangeValue,
    purchaseExchangeValue,
    payments: form.payments,
  }), [expenseTotal, form.payments, form.purchaseAmount, form.purchaserState, form.sellAmount, form.sellerState, purchaseExchangeValue, saleExchangeValue]);
  const paymentBalances = getSellAccountPaymentBalances(finance.payments);

  const dealStatus = deriveSellAccountDealStatus({
    purchaserPaymentStatus: finance.payments.purchaserPaymentStatus,
    rtoStatus: form.rtoStatusSnapshot,
    rtoLinked: hasLinkedRto,
  }) as SellAccountDealStatus;
  const dealStatusConfig = DEAL_STATUS_CONFIG[dealStatus] || DEAL_STATUS_CONFIG.OPEN;
  const DealStatusIcon = dealStatusConfig.icon;

  const vehicleName = form.listingTitle?.trim() || [form.brandName, form.vehicleModel].filter(Boolean).join(' ') || form.vehicleNumber || '';

  // ---- KYC ----
  const updateKycState = (side: 'purchase' | 'sell', kind: SellAccountKycKind, nextState: SellAccountKycState) => {
    setForm((current) => {
      const kyc = current.kyc || createEmptySellAccountKyc();
      return { ...current, kyc: { ...kyc, [side]: { ...kyc[side], [kind]: nextState } } };
    });
  };

  const handleKycNumberChange = (side: 'purchase' | 'sell', kind: SellAccountKycKind, rawValue: string) => {
    const normalized = normalizeSellAccountKycNumber(kind.toUpperCase(), rawValue);
    const currentState = (form.kyc || createEmptySellAccountKyc())[side][kind];
    const previewKey = `${side}-${kind}`;
    const cachedPreview = kind === 'aadhaar'
      ? null
      : getVerificationCache<KycVerificationPreview>(buildVerificationCacheKey(kind, normalized));
    if (currentState.number !== normalized) {
      setVerificationPreviews((current) => {
        if (!current[previewKey] && !cachedPreview) return current;
        const next = { ...current };
        if (cachedPreview) {
          next[previewKey] = { ...cachedPreview, side, kind: kind as 'pan' | 'gst' };
        } else {
          delete next[previewKey];
        }
        return next;
      });
    }
    if (kind === 'aadhaar') {
      updateKycState(side, kind, { ...currentState, number: normalized, error: '' });
      return;
    }
    if (cachedPreview && cachedPreview.number === normalized) {
      updateKycState(side, kind, createVerificationState({
        kind: kind.toUpperCase(),
        number: normalized,
        response: { ...cachedPreview.response, cacheHit: true },
      }) as SellAccountKycState);
      return;
    }
    updateKycState(side, kind, currentState.number === normalized
      ? { ...currentState, error: '' }
      : { ...currentState, number: normalized, status: SELL_ACCOUNT_KYC_STATUS.NOT_VERIFIED, verificationRecordId: '', verifiedAt: '', cacheHit: false, error: '' });
  };

  const persistVerifiedKyc = async (nextKyc: SellAccountKyc) => {
    if (!isPersisted || !existingRecord?.id) return;
    try {
      await api.put(`/recruitment/admin/sell-accounts/${encodeURIComponent(existingRecord.id)}`, {
        documents: { ...normalizeSellAccountDocuments(form), kyc: nextKyc },
      });
    } catch {
      toast.info('Verification preview is ready. Press Save Changes to link it to this record.');
    }
  };

  const handleKycVerify = async (side: 'purchase' | 'sell', kind: 'pan' | 'gst') => {
    const currentState = (form.kyc || createEmptySellAccountKyc())[side][kind];
    const normalized = normalizeSellAccountKycNumber(kind.toUpperCase(), currentState.number);
    const validationError = kind === 'pan' ? validatePan(normalized) : validateGstin(normalized);
    if (validationError) {
      updateKycState(side, kind, { ...currentState, number: normalized, status: SELL_ACCOUNT_KYC_STATUS.NOT_VERIFIED, error: validationError });
      return;
    }
    const key = `${side}-${kind}`;
    const cacheKey = buildVerificationCacheKey(kind, normalized);
    const cachedPreview = getVerificationCache<KycVerificationPreview>(cacheKey);
    if (cachedPreview) {
      const cachedResponse = { ...cachedPreview.response, cacheHit: true };
      const preview = { ...cachedPreview, side, kind };
      const nextState = createVerificationState({ kind: kind.toUpperCase(), number: normalized, response: cachedResponse }) as SellAccountKycState;
      const nextKyc = {
        ...(form.kyc || createEmptySellAccountKyc()),
        [side]: { ...(form.kyc || createEmptySellAccountKyc())[side], [kind]: nextState },
      } as SellAccountKyc;
      updateKycState(side, kind, nextState);
      setVerificationPreviews((current) => ({
        ...current,
        [key]: preview,
      }));
      setActiveVerificationPreview(preview);
      void persistVerifiedKyc(nextKyc);
      toast.info(`${kind === 'pan' ? 'PAN' : 'GSTIN'} details loaded from temporary cache. No API call was made.`);
      return;
    }
    setKycBusyKey(key);
    updateKycState(side, kind, { ...currentState, number: normalized, status: SELL_ACCOUNT_KYC_STATUS.NOT_VERIFIED, error: '' });
    try {
      const endpoint = kind === 'pan' ? PAN_COMPREHENSIVE_ROUTE : '/gst-verification/verify';
      const response = await api.post<Record<string, unknown>>(endpoint, { id_number: normalized });
      const responseData = response.data;
      const nextState = createVerificationState({ kind: kind.toUpperCase(), number: normalized, response: responseData });
      updateKycState(side, kind, nextState as SellAccountKycState);
      const previewKey = `${side}-${kind}`;
      if (nextState.status === SELL_ACCOUNT_KYC_STATUS.VERIFIED) {
        const preview = { side, kind, number: normalized, response: responseData } as KycVerificationPreview;
        setVerificationCache(cacheKey, preview);
        setVerificationPreviews((current) => ({
          ...current,
          [previewKey]: preview,
        }));
        setActiveVerificationPreview(preview);
        const nextKyc = {
          ...(form.kyc || createEmptySellAccountKyc()),
          [side]: { ...(form.kyc || createEmptySellAccountKyc())[side], [kind]: nextState },
        } as SellAccountKyc;
        void persistVerifiedKyc(nextKyc);
        toast.success(`${kind === 'pan' ? 'PAN' : 'GSTIN'} verified. Preview opened.`);
      } else {
        setVerificationPreviews((current) => {
          if (!current[previewKey]) return current;
          const next = { ...current };
          delete next[previewKey];
          return next;
        });
        toast.error(nextState.error || 'Verification failed.');
      }
    } catch (error) {
      const message = apiErrorMessage(error, `${kind === 'pan' ? 'PAN' : 'GSTIN'} verification failed. Please try again.`);
      updateKycState(side, kind, createFailedVerificationState(kind.toUpperCase(), normalized, message) as SellAccountKycState);
      toast.error(message);
    } finally {
      setKycBusyKey(null);
    }
  };

  const openVerificationPreview = (side: 'purchase' | 'sell', kind: 'pan' | 'gst') => {
    const preview = verificationPreviews[`${side}-${kind}`];
    if (preview) setActiveVerificationPreview(preview);
  };

  // ---- Documents ----
  const documents = normalizeSellAccountDocuments(form) as SellAccountDocuments;
  const deleteDocumentFiles = async (items: Array<SellAccountDocument | null | undefined>) => {
    const urls = [...new Set(items.map((item) => item?.fileUrl).filter(Boolean))] as string[];
    await Promise.allSettled(urls.map((fileUrl) => deleteSecureFileFromServer(fileUrl)));
  };
  const replaceDocument = (key: SellAccountDocumentKey, file: UploadedFileResult | null) => {
    const previous = documents[key];
    if (previous?.fileUrl && previous.fileUrl !== file?.fileUrl) {
      if (originalDocumentUrls.current.has(previous.fileUrl)) {
        // Saved documents are only deleted after the change is saved.
        setPendingReplacedDocuments((current) => [...current, previous]);
      } else {
        void deleteDocumentFiles([previous]);
      }
    }
    setForm((current) => ({ ...current, documents: { ...(normalizeSellAccountDocuments(current) as SellAccountDocuments), [key]: file } }));
  };
  const handleUploadState = (uploading: boolean) => setActiveUploads((count) => Math.max(0, count + (uploading ? 1 : -1)));

  // ---- Payments ----
  const addPayment = async () => {
    if (busyAction) return;
    const amount = Number(paymentDraft.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error('Enter a valid payment amount.');
      return;
    }
    const entry: SellAccountPayment = {
      side: paymentDraft.side,
      amount,
      paymentDate: paymentDraft.paymentDate,
      method: paymentDraft.method,
      reference: paymentDraft.reference.trim(),
      note: paymentDraft.note.trim(),
    };
    if (!isPersisted) {
      setForm((current) => ({ ...current, payments: [...(current.payments || []), entry] }));
      setPaymentDraft(initialPaymentDraft());
      return;
    }

    setBusyAction('payment');
    try {
      const response = await api.post<{ record?: SellAccountApiRecord }>(
        `/recruitment/admin/sell-accounts/${encodeURIComponent(existingRecord!.id)}/payments`,
        entry,
      );
      if (!response.data?.record) throw new Error('Payment was not returned by the server.');
      applyPaymentRecord(normalizeServerSellAccount(response.data.record));
      setPaymentDraft(initialPaymentDraft());
      toast.success('Payment added and balance updated.');
    } catch (error) {
      toast.error(apiErrorMessage(error, 'Unable to add this payment.'));
    } finally {
      setBusyAction(null);
    }
  };
  const removePayment = async (index: number) => {
    if (busyAction) return;
    const payment = form.payments?.[index];
    if (!payment) return;
    if (!isPersisted || !payment.id) {
      setForm((current) => ({ ...current, payments: (current.payments || []).filter((_, itemIndex) => itemIndex !== index) }));
      return;
    }

    setBusyAction('payment');
    try {
      await api.delete(`/recruitment/admin/sell-accounts/${encodeURIComponent(existingRecord!.id)}/payments/${encodeURIComponent(payment.id)}`);
      const remainingPayments = (form.payments || []).filter((_, itemIndex) => itemIndex !== index);
      setForm((current) => ({ ...current, payments: remainingPayments }));
      setExistingRecord((current) => current ? { ...current, payments: remainingPayments } : current);
      try {
        const response = await api.get<{ record?: SellAccountApiRecord }>(`/recruitment/admin/sell-accounts/${encodeURIComponent(existingRecord!.id)}`);
        if (response.data?.record) applyPaymentRecord(normalizeServerSellAccount(response.data.record));
      } catch {
        // The payment delete succeeded; keep the local ledger updated if refresh is temporarily unavailable.
      }
      toast.success('Payment removed and balance reversed.');
    } catch (error) {
      toast.error(apiErrorMessage(error, 'Unable to remove this payment.'));
    } finally {
      setBusyAction(null);
    }
  };
  const sharePaymentOnWhatsApp = (payment: SellAccountPayment) => {
    const number = String(form.purchaserNumber || '').replace(/\D/g, '');
    if (!number) {
      toast.info('Add the customer mobile number before sharing a payment receipt.');
      return;
    }
    const message = [
      `Hello ${form.purchaserName || 'there'},`,
      '',
      `Payment receipt: ₹${payment.amount.toLocaleString('en-IN')}`,
      `Date: ${formatDisplayDate(payment.paymentDate)}`,
      `Method: ${payment.method.replaceAll('_', ' ')}`,
      payment.reference ? `Reference: ${payment.reference}` : '',
      '',
      `Vehicle: ${form.vehicleNumber || 'N/A'}`,
    ].filter((line, index, lines) => line || lines[index - 1]).join('\n');
    window.open(`https://wa.me/${number.length === 10 ? `91${number}` : number}?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer');
  };

  // ---- Save ----
  const buildPayload = (isDraft: boolean) => {
    const breakdown = form.expenseBreakdown as SellAccountExpenseBreakdown;
    return {
      ...form,
      isDraft,
      sellDate: form.purchaserDate || form.sellDate,
      sourceType: form.sourceType || null,
      expenses: expenseTotal,
      expenseBreakdown: breakdown,
      purchaseExchangeValue,
      saleExchangeValue,
      documents: { ...documents, kyc: form.kyc || createEmptySellAccountKyc() },
      remarks: form.remarks || form.noteSheet || '',
      gstRatePercent: GST_RATE_PERCENT,
      payments: (form.payments || []).map((payment) => ({
        side: payment.side,
        amount: payment.amount,
        paymentDate: payment.paymentDate,
        method: payment.method,
        reference: payment.reference || '',
        note: payment.note || '',
      })),
    };
  };

  const validate = () => {
    const nextErrors = getSellAccountValidationErrors({ ...form, dealStatus, sellDate: form.purchaserDate || form.sellDate }, { isEditing }) as unknown as Record<string, string>;
    if (form.purchaseType === 'EXCHANGE' && !(purchaseExchangeValue > 0)) nextErrors.purchaseExchangeValue = 'Enter the exchange vehicle value';
    if (form.purchaseType === 'EXCHANGE' && purchaseExchangeValue > Number(form.purchaseAmount || 0)) nextErrors.purchaseExchangeValue = 'Cannot exceed the purchase amount';
    if (form.saleType === 'EXCHANGE' && !(saleExchangeValue > 0)) nextErrors.saleExchangeValue = 'Enter the exchange vehicle value';
    if (form.saleType === 'EXCHANGE' && saleExchangeValue > Number(form.sellAmount || 0)) nextErrors.saleExchangeValue = 'Cannot exceed the sell amount';
    if ((form.sellerState && !form.purchaserState) || (!form.sellerState && form.purchaserState)) {
      nextErrors[form.sellerState ? 'purchaserState' : 'sellerState'] = 'Both states are needed for the GST split';
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) toast.error('Please complete the highlighted fields.');
    return Object.keys(nextErrors).length === 0;
  };

  const guardBusy = () => {
    if (kycBusyKey) { toast.info('Please wait until identity verification finishes.'); return true; }
    if (activeUploads > 0) { toast.info('Please wait until all document uploads finish.'); return true; }
    return false;
  };

  const afterSaved = async (record: SellAccountRecord) => {
    await deleteDocumentFiles(pendingReplacedDocuments);
    setPendingReplacedDocuments([]);
    if (localDraftId) removeLocalRecord(localDraftId);
    originalDocumentUrls.current = new Set(
      Object.values(normalizeSellAccountDocuments(record) as SellAccountDocuments).map((document) => document?.fileUrl).filter((url): url is string => Boolean(url)),
    );
  };

  const saveDraft = async () => {
    if (!(canCreate || canUpdate) || guardBusy()) return;
    if (existingRecord && !isDraftRecord) {
      toast.info('This record is already saved. Use Save Changes.');
      return;
    }
    if (!(form.listingId || form.ownerName || form.vehicleNumber || form.sellerName || form.purchaserName || form.sellAmount)) {
      toast.info('Enter at least one value before saving a draft.');
      return;
    }
    setBusyAction('draft');
    try {
      const payload = { ...buildPayload(true), draftSavedAt: new Date().toISOString() };
      const response = isPersisted
        ? await api.put<{ record?: SellAccountApiRecord }>(`/recruitment/admin/sell-accounts/${encodeURIComponent(existingRecord!.id)}`, payload)
        : await api.post<{ record?: SellAccountApiRecord }>('/recruitment/admin/sell-accounts', payload);
      if (!response.data?.record) throw new Error('Draft was not returned by the server.');
      const record = normalizeServerSellAccount(response.data.record);
      await afterSaved(record);
      setLocalDraftId(null);
      applyRecord(record);
      toast.success('Draft saved.');
      if (!recordId || recordId !== record.id) router.replace(`${listPath}/${encodeURIComponent(record.id)}/edit`);
    } catch (error) {
      toast.error(apiErrorMessage(error, 'Unable to save this draft. Please try again.'));
    } finally {
      setBusyAction(null);
    }
  };

  const saveRecord = async () => {
    if (!(isPersisted ? canUpdate : canCreate) || guardBusy() || !validate()) return;
    setBusyAction('save');
    try {
      const payload = buildPayload(false);
      const response = isPersisted
        ? await api.put<{ record?: SellAccountApiRecord }>(`/recruitment/admin/sell-accounts/${encodeURIComponent(existingRecord!.id)}`, payload)
        : await api.post<{ record?: SellAccountApiRecord }>('/recruitment/admin/sell-accounts', payload);
      if (!response.data?.record) throw new Error('Record was not returned by the server.');
      const record = normalizeServerSellAccount(response.data.record);
      await afterSaved(record);
      toast.success(isPersisted && !isDraftRecord ? 'Sold Vehicle record updated.' : 'Sold Vehicle record saved.');
      router.push(`${listPath}/${encodeURIComponent(record.id)}`);
    } catch (error) {
      toast.error(apiErrorMessage(error, 'Unable to save this record. Please try again.'));
    } finally {
      setBusyAction(null);
    }
  };

  const saveAndStartRto = async () => {
    if (!canManageRto) { toast.error('RTO Work permission is required.'); return; }
    if (hasLinkedRto && existingRecord?.rtoRecord?.id) {
      router.push(`${rtoBasePath}/${encodeURIComponent(existingRecord.rtoRecord.id)}/edit`);
      return;
    }
    if (guardBusy() || !validate()) return;
    if (finance.payments.purchaserPaymentStatus !== 'FULL') {
      toast.info(`Full customer payment is required before starting RTO work. Balance: ${formatInr(finance.payments.purchaserBalance)}.`);
      return;
    }
    setBusyAction('rto');
    try {
      const endpoint = isPersisted
        ? `/recruitment/admin/sell-accounts/${encodeURIComponent(existingRecord!.id)}/save-and-start-rto`
        : '/recruitment/admin/sell-accounts/save-and-start-rto';
      const response = await api.post<{ record?: SellAccountApiRecord; rtoRecord?: { id?: string } | null }>(endpoint, buildPayload(false));
      const rtoId = response.data?.rtoRecord?.id;
      if (!response.data?.record || !rtoId) throw new Error('RTO work link was not returned by the server.');
      await afterSaved(normalizeServerSellAccount(response.data.record));
      toast.success('Sold Vehicle saved. Continue with the RTO transfer work.');
      router.push(`${rtoBasePath}/${encodeURIComponent(rtoId)}/edit`);
    } catch (error) {
      toast.error(apiErrorMessage(error, 'Unable to save and start RTO work. Please try again.'));
    } finally {
      setBusyAction(null);
    }
  };

  const cancel = async () => {
    const uploadedThisSession = Object.values(documents).filter((document) => document?.fileUrl && !originalDocumentUrls.current.has(document.fileUrl));
    await deleteDocumentFiles(uploadedThisSession);
    router.push(existingRecord && isPersisted ? `${listPath}/${encodeURIComponent(existingRecord.id)}` : listPath);
  };

  if (loading) return <BrandLoader variant="section" size="sm" bg="light" text="Loading sold vehicle..." />;
  if (loadError) {
    return (
      <div className="mx-auto max-w-lg rounded-xl border border-rose-200 bg-rose-50 p-6 text-center">
        <p className="text-sm font-semibold text-rose-700">{loadError}</p>
        <button type="button" onClick={() => router.push(listPath)} className="mt-4 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm ring-1 ring-gray-200 hover:bg-gray-50">Back to Sold Vehicles</button>
      </div>
    );
  }
  if (!(isEditing ? canUpdate : canCreate)) {
    return <div className="rounded-xl border border-gray-200 bg-white p-6 text-center text-sm text-gray-600">You do not have permission to {isEditing ? 'edit' : 'create'} Sold Vehicle records.</div>;
  }

  const breakdown = form.expenseBreakdown as SellAccountExpenseBreakdown;
  const taxLines = getSellAccountTaxLines(finance.gst);
  const busy = busyAction !== null || activeUploads > 0 || Boolean(kycBusyKey);
  const customerPaymentRatio = finance.payments.customerCashReceivable > 0
    ? Math.min(100, Math.round((finance.payments.purchaserReceived / finance.payments.customerCashReceivable) * 100))
    : finance.payments.purchaserPaymentStatus === 'FULL' ? 100 : 0;
  const sellerPaymentRatio = finance.payments.sellerCashPayable > 0
    ? Math.min(100, Math.round((finance.payments.sellerPaid / finance.payments.sellerCashPayable) * 100))
    : finance.payments.sellerPaymentStatus === 'FULL' ? 100 : 0;

  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-3 pb-24">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-xs">
        <div className="flex min-w-0 items-center gap-3">
          <button type="button" onClick={() => void cancel()} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-gray-200 text-gray-500 transition hover:bg-gray-50 hover:text-gray-900" aria-label="Back">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-lg font-extrabold tracking-tight text-gray-950">
                {isEditing ? (isDraftRecord ? 'Complete Sold Vehicle Record' : 'Edit Sold Vehicle Record') : 'Create Sold Vehicle Record'}
              </h1>
              <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${isDraftRecord ? 'border-amber-300 bg-amber-50 text-amber-900' : 'border-blue-200 bg-blue-50 text-blue-800'}`}>
                {existingRecord ? (isDraftRecord ? `Draft · ${existingRecord.recordNumber || existingRecord.id}` : existingRecord.recordNumber || existingRecord.id) : localDraftId ? 'Browser draft' : 'New'}
              </span>
            </div>
            <p className="truncate text-xs font-medium text-gray-500">
              {vehicleName ? <span className="font-semibold text-amber-700">{vehicleName}</span> : 'Vehicle details'}
              {form.listingId ? <span> · linked to listing</span> : null}
            </p>
            {form.listingId ? (
              <div className="mt-1">
                <ApiFillLegend>fields were fetched from the linked listing. Everything else (customer, amounts, payments, documents) is entered manually.</ApiFillLegend>
              </div>
            ) : null}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-bold ${dealStatusConfig.bg} ${dealStatusConfig.text} ${dealStatusConfig.border}`}>
            <DealStatusIcon className="h-3.5 w-3.5" />{dealStatusConfig.label}
          </span>
          {hasLinkedRto ? (
            <button type="button" onClick={() => router.push(`${rtoBasePath}/${encodeURIComponent(existingRecord!.rtoRecord!.id)}/edit`)} className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-bold text-indigo-800 hover:bg-indigo-100">
              <ClipboardCheck className="h-3.5 w-3.5" />Open RTO Work
            </button>
          ) : null}
        </div>
      </div>

      {localDraftId ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900">
          This draft was only stored in this browser. Saving it will move it to the database.
        </p>
      ) : null}

      {/* 1. Vehicle */}
      <Section icon={<Car className="h-3.5 w-3.5" />} title="1. Vehicle & Owner">
        <div className="grid grid-cols-2 gap-x-3 gap-y-2.5 md:grid-cols-4 xl:grid-cols-7">
          <Field label="RC Owner Name" required error={errors.ownerName} className="col-span-2 md:col-span-1" apiFill={listingApiFill}>
            <input className={`${inputClass} ${inputBorder(Boolean(errors.ownerName))}`} value={form.ownerName} placeholder="As on RC" onChange={(event) => update('ownerName', event.target.value)} />
          </Field>
          <Field label="Owner Mobile" required error={errors.ownerNumber}>
            <input className={`${inputClass} ${inputBorder(Boolean(errors.ownerNumber))}`} inputMode="numeric" maxLength={10} value={form.ownerNumber} placeholder="10-digit" onChange={(event) => update('ownerNumber', sanitizePhone(event.target.value))} />
          </Field>
          <Field label="Registration No." required error={errors.vehicleNumber} apiFill={listingApiFill}>
            <input className={`${inputClass} ${inputBorder(Boolean(errors.vehicleNumber))} uppercase`} value={form.vehicleNumber} placeholder="CG-04-AB-1234" onChange={(event) => update('vehicleNumber', sanitizeVehicleNumber(event.target.value))} />
          </Field>
          <Field label="Chassis No." apiFill={listingApiFill}>
            <input className={`${inputClass} ${inputBorder()} uppercase`} maxLength={40} value={form.chassisNumber || ''} placeholder="Optional" onChange={(event) => update('chassisNumber', normalizeSellAccountChassisNumber(event.target.value))} />
          </Field>
          <Field label={t('listingDetails.category', 'Category')} required error={errors.vehicleType} apiFill={listingApiFill}>
            <SearchableSelect size="sm" options={categories.map((item) => ({ id: item.name, name: item.name }))} value={form.vehicleType} displayValue={form.vehicleType || ''} placeholder="Select" searchable onChange={(option) => update('vehicleType', String(option.id))} className="w-full" />
          </Field>
          <Field label={t('listingDetails.brand', 'Brand')} required={!isEditing} error={errors.brandName} apiFill={listingApiFill}>
            <SearchableSelect size="sm" options={brands.map((item) => ({ id: item.id, name: item.name }))} value={form.brandName} displayValue={form.brandName || ''} placeholder="Select" searchable onChange={(option) => update('brandName', option.name)} className="w-full" />
          </Field>
          <Field label="Model" required error={errors.vehicleModel} apiFill={listingApiFill}>
            <input className={`${inputClass} ${inputBorder(Boolean(errors.vehicleModel))}`} value={form.vehicleModel} placeholder="e.g. 3DX Super" onChange={(event) => update('vehicleModel', event.target.value)} />
          </Field>
        </div>
      </Section>

      {/* 2. Deal flow */}
      <Section
        icon={<Handshake className="h-3.5 w-3.5" />}
        title="2. Purchase → Broker → Sale"
        aside={<span className="hidden text-[11px] font-medium text-gray-400 sm:inline">Vehicle purchased → JCB Exchange (broker) → sold to customer</span>}
      >
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,0.62fr)_auto_minmax(0,1fr)]">
          {/* Purchase */}
          <div className="rounded-lg border border-amber-200/80 bg-amber-50/30 p-3">
            <div className="mb-2.5 flex items-center justify-between gap-2">
              <p className="flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wider text-amber-900"><ShoppingCart className="h-3.5 w-3.5" />Vehicle Purchase</p>
              <div className="w-40">
                <SearchableSelect
                  size="sm"
                  options={SOURCE_TYPE_OPTIONS.map((option) => ({ id: option.value, name: option.label }))}
                  value={form.sourceType || ''}
                  displayValue={SOURCE_TYPE_OPTIONS.find((option) => option.value === form.sourceType)?.label || 'Bought from…'}
                  searchable={false}
                  onChange={(option) => setForm((current) => applySourceTypeChange(current, String(option.id)) as SellAccountFormState)}
                  className="w-full"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-x-2.5 gap-y-2">
              <Field label={ownStock ? 'Purchased by' : 'Bought from (name)'} required error={errors.sellerName} className="col-span-2 sm:col-span-1" apiFill={listingApiFill}>
                <input className={`${inputClass} ${inputBorder(Boolean(errors.sellerName))}`} value={form.sellerName} placeholder="Partner / agent / customer" onChange={(event) => update('sellerName', event.target.value)} />
              </Field>
              <Field label="Mobile" required error={errors.sellerNumber} className="col-span-2 sm:col-span-1" apiFill={listingApiFill}>
                <input className={`${inputClass} ${inputBorder(Boolean(errors.sellerNumber))}`} inputMode="numeric" maxLength={10} value={form.sellerNumber} placeholder="10-digit" onChange={(event) => update('sellerNumber', sanitizePhone(event.target.value))} />
              </Field>
              <Field label="Purchase date" required error={errors.sellerDate}>
                <input type="date" className={`${inputClass} ${inputBorder(Boolean(errors.sellerDate))}`} value={form.sellerDate || ''} onChange={(event) => update('sellerDate', event.target.value)} />
              </Field>
              <Field label="Type">
                <Segmented value={form.purchaseType || 'PURCHASE'} options={PURCHASE_TYPE_OPTIONS as Array<{ value: 'PURCHASE' | 'EXCHANGE'; label: string }>} onChange={(value) => update('purchaseType', value)} />
              </Field>
              <Field label="State" error={errors.sellerState} apiFill={listingApiFill}>
                <SearchableSelect size="sm" options={states} value={form.sellerState || ''} displayValue={form.sellerState || ''} placeholder="Select state" searchable onChange={(option) => setForm((current) => ({ ...current, sellerState: option.name, sellerCity: '' }))} className="w-full" />
              </Field>
              <Field label="City" apiFill={listingApiFill}>
                <CitySelect stateName={form.sellerState} states={states} value={form.sellerCity} onChange={(value) => update('sellerCity', value)} />
              </Field>
              <Field label="Purchase amount" required error={errors.purchaseAmount} className="col-span-2" hint={listedPrice > 0 ? `Listed at ${formatInr(listedPrice)}` : undefined}>
                <AmountInput value={form.purchaseAmount} hasError={Boolean(errors.purchaseAmount)} onChange={(value) => update('purchaseAmount', value)} />
              </Field>
              {form.purchaseType === 'EXCHANGE' ? (
                <>
                  <Field label="Vehicle given in exchange" className="col-span-2 sm:col-span-1">
                    <input className={`${inputClass} ${inputBorder()}`} value={form.purchaseExchangeVehicle || ''} placeholder="Model / reg. no." onChange={(event) => update('purchaseExchangeVehicle', event.target.value)} />
                  </Field>
                  <Field label="Exchange value" required error={errors.purchaseExchangeValue} className="col-span-2 sm:col-span-1">
                    <AmountInput value={form.purchaseExchangeValue} hasError={Boolean(errors.purchaseExchangeValue)} onChange={(value) => update('purchaseExchangeValue', value)} />
                  </Field>
                </>
              ) : null}
            </div>
          </div>

          <div className="hidden items-center justify-center text-gray-300 lg:flex"><ArrowRight className="h-5 w-5" /></div>

          {/* Broker */}
          <div className="flex flex-col rounded-lg border border-gray-900/10 bg-gray-950 p-3 text-white">
            <p className="mb-2.5 flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wider text-amber-400"><Handshake className="h-3.5 w-3.5" />Broker · {JCB_EXCHANGE_COMPANY_NAME}</p>
            <div className="grid grid-cols-2 gap-x-2.5 gap-y-2 lg:grid-cols-1">
              <div>
                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-gray-400">Dealing person</label>
                <input className="h-[34px] w-full rounded-lg border border-white/10 bg-white/5 px-2.5 text-[13px] font-semibold text-white outline-none focus:border-amber-400" value={form.brokerName || ''} onChange={(event) => update('brokerName', event.target.value)} placeholder={JCB_EXCHANGE_BROKER.name} />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-gray-400">Mobile</label>
                <input className="h-[34px] w-full rounded-lg border border-white/10 bg-white/5 px-2.5 text-[13px] font-semibold text-white outline-none focus:border-amber-400" inputMode="numeric" maxLength={10} value={form.brokerNumber || ''} onChange={(event) => update('brokerNumber', sanitizePhone(event.target.value))} placeholder={JCB_EXCHANGE_BROKER.number} />
              </div>
            </div>
            <div className="mt-auto space-y-1 border-t border-white/10 pt-2.5 text-xs">
              <div className="flex justify-between gap-2"><span className="text-gray-400">Margin (incl. GST)</span><span className={`font-bold tabular-nums ${finance.gst.marginAmount >= 0 ? 'text-white' : 'text-rose-300'}`}>{formatInr(finance.gst.marginAmount)}</span></div>
              <div className="flex justify-between gap-2"><span className="text-gray-400">GST {GST_RATE_PERCENT}%</span><span className="font-bold tabular-nums text-amber-300">{formatInr(finance.gst.gstAmount)}</span></div>
              <div className="flex justify-between gap-2"><span className="text-gray-400">Final profit</span><span className={`font-extrabold tabular-nums ${finance.gst.netProfitAfterGst >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>{formatInr(finance.gst.netProfitAfterGst)}</span></div>
            </div>
          </div>

          <div className="hidden items-center justify-center text-gray-300 lg:flex"><ArrowRight className="h-5 w-5" /></div>

          {/* Sale */}
          <div className="rounded-lg border border-blue-200/80 bg-blue-50/30 p-3">
            <div className="mb-2.5 flex items-center justify-between gap-2">
              <p className="flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wider text-blue-900"><Wallet className="h-3.5 w-3.5" />Sell to Customer</p>
              <span className="rounded-full border border-blue-200 bg-white px-2 py-0.5 text-[10px] font-bold text-blue-700">End customer</span>
            </div>
            <div className="grid grid-cols-2 gap-x-2.5 gap-y-2">
              <Field label="Customer name" required error={errors.purchaserName} className="col-span-2 sm:col-span-1">
                <input className={`${inputClass} ${inputBorder(Boolean(errors.purchaserName))}`} value={form.purchaserName} placeholder="Buyer name" onChange={(event) => update('purchaserName', event.target.value)} />
              </Field>
              <Field label="Mobile" required error={errors.purchaserNumber} className="col-span-2 sm:col-span-1">
                <input className={`${inputClass} ${inputBorder(Boolean(errors.purchaserNumber))}`} inputMode="numeric" maxLength={10} value={form.purchaserNumber} placeholder="Invoice goes here" onChange={(event) => update('purchaserNumber', sanitizePhone(event.target.value))} />
              </Field>
              <Field label="Sell date" required error={errors.purchaserDate || errors.sellDate}>
                <input type="date" className={`${inputClass} ${inputBorder(Boolean(errors.purchaserDate))}`} value={form.purchaserDate || ''} onChange={(event) => setForm((current) => ({ ...current, purchaserDate: event.target.value, sellDate: event.target.value }))} />
              </Field>
              <Field label="Type">
                <Segmented value={form.saleType || 'SELL'} options={SALE_TYPE_OPTIONS as Array<{ value: 'SELL' | 'EXCHANGE'; label: string }>} onChange={(value) => update('saleType', value)} />
              </Field>
              <Field label="State" error={errors.purchaserState}>
                <SearchableSelect size="sm" options={states} value={form.purchaserState || ''} displayValue={form.purchaserState || ''} placeholder="Select state" searchable onChange={(option) => setForm((current) => ({ ...current, purchaserState: option.name, purchaserCity: '' }))} className="w-full" />
              </Field>
              <Field label="City">
                <CitySelect stateName={form.purchaserState} states={states} value={form.purchaserCity} onChange={(value) => update('purchaserCity', value)} />
              </Field>
              <Field label="Sell amount" required error={errors.sellAmount} className="col-span-2">
                <AmountInput value={form.sellAmount} hasError={Boolean(errors.sellAmount)} onChange={(value) => update('sellAmount', value)} />
              </Field>
              {form.saleType === 'EXCHANGE' ? (
                <>
                  <Field label="Vehicle taken in exchange" className="col-span-2 sm:col-span-1">
                    <input className={`${inputClass} ${inputBorder()}`} value={form.saleExchangeVehicle || ''} placeholder="Model / reg. no." onChange={(event) => update('saleExchangeVehicle', event.target.value)} />
                  </Field>
                  <Field label="Exchange value" required error={errors.saleExchangeValue} className="col-span-2 sm:col-span-1">
                    <AmountInput value={form.saleExchangeValue} hasError={Boolean(errors.saleExchangeValue)} onChange={(value) => update('saleExchangeValue', value)} />
                  </Field>
                </>
              ) : null}
            </div>
            <div className="mt-2.5 rounded-lg border border-blue-100 bg-white p-2.5">
              <p className="mb-1.5 flex items-center justify-between text-[11px] font-bold uppercase tracking-wide text-gray-500">
                <span className="flex items-center gap-1"><Truck className="h-3.5 w-3.5" />Other expenses</span>
                <span className="tabular-nums text-gray-800">{formatInr(expenseTotal)}</span>
              </p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {SELL_ACCOUNT_EXPENSE_FIELDS.map((field) => (
                  <div key={field.key}>
                    <p className="mb-0.5 truncate text-[10px] font-semibold text-gray-500">{field.key === 'other' && breakdown?.otherLabel ? breakdown.otherLabel : field.label}</p>
                    <AmountInput
                      value={Number(breakdown?.[field.key as keyof SellAccountExpenseBreakdown] || 0)}
                      onChange={(value) => update('expenseBreakdown', { ...breakdown, [field.key]: value })}
                    />
                  </div>
                ))}
              </div>
              <input
                className={`${inputClass} ${inputBorder()} mt-2 h-8 text-xs`}
                value={breakdown?.otherLabel || ''}
                maxLength={120}
                placeholder="Describe 'Other' (e.g. crane hire, repair)"
                onChange={(event) => update('expenseBreakdown', { ...breakdown, otherLabel: event.target.value })}
              />
            </div>
          </div>
        </div>
      </Section>

      {/* 3. Finance */}
      <Section
        icon={<IndianRupee className="h-3.5 w-3.5" />}
        title="3. Financial Breakdown & Calculation"
        aside={<span className="text-[11px] font-semibold text-gray-500">{finance.gst.isIntraState ? 'Same state → CGST + SGST' : form.sellerState && form.purchaserState ? 'Different states → IGST' : 'Select both states for the GST split'}</span>}
      >
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-8">
          {([
            { label: 'Purchase', value: form.purchaseAmount, tone: 'text-gray-900', note: form.purchaseType === 'EXCHANGE' ? `incl. ${formatInr(purchaseExchangeValue)} exchange` : 'Bought at' },
            { label: 'Sell', value: form.sellAmount, tone: 'text-gray-900', note: form.saleType === 'EXCHANGE' ? `incl. ${formatInr(saleExchangeValue)} exchange` : 'Sold at' },
            { label: 'Margin (incl. GST)', value: finance.gst.marginAmount, tone: finance.gst.marginAmount >= 0 ? 'text-gray-950' : 'text-rose-600', note: 'Sell − Purchase' },
            ...taxLines.map((line) => ({ label: line.label, value: line.amount, tone: 'text-blue-800', note: 'Extracted from margin', accent: 'blue' })),
            { label: 'Margin after GST', value: finance.gst.taxableAmount, tone: 'text-gray-900', note: 'Taxable value' },
            { label: 'Expenses', value: expenseTotal, tone: 'text-gray-900', note: 'Transport, paperwork, RTO…' },
            { label: 'Final profit', value: finance.gst.netProfitAfterGst, tone: finance.gst.netProfitAfterGst >= 0 ? 'text-emerald-700' : 'text-rose-600', note: 'After GST & expenses', accent: 'emerald' },
          ] as Array<{ label: string; value: number; tone: string; note: string; accent?: 'blue' | 'emerald' }>).map((tile) => (
            <div key={tile.label} className={`rounded-lg border px-3 py-2 ${tile.accent === 'blue' ? 'border-blue-200 bg-blue-50/60' : tile.accent === 'emerald' ? 'border-emerald-200 bg-emerald-50/70' : 'border-gray-200 bg-gray-50/60'}`}>
              <p className="truncate text-[10px] font-bold uppercase tracking-wider text-gray-500">{tile.label}</p>
              <p className={`mt-0.5 text-base font-extrabold tabular-nums ${tile.tone}`}>{formatInr(tile.value)}</p>
              <p className="truncate text-[10px] font-medium text-gray-400">{tile.note}</p>
            </div>
          ))}
        </div>
        <div className="mt-2.5 flex flex-wrap gap-x-5 gap-y-1 text-xs text-gray-600">
          <span>GST {GST_RATE_PERCENT}% on margin (margin scheme): <b className="tabular-nums text-gray-900">{formatInr(finance.gst.gstAmount)}</b></span>
          <span>Customer pays in cash: <b className="tabular-nums text-gray-900">{formatInr(finance.payments.customerCashReceivable)}</b></span>
          <span>Payable to seller in cash: <b className="tabular-nums text-gray-900">{formatInr(finance.payments.sellerCashPayable)}</b></span>
        </div>
      </Section>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        {/* 4. Payments */}
        <Section
          icon={<Wallet className="h-3.5 w-3.5" />}
          title="4. Payment Tracking"
          aside={<span className="text-[11px] font-bold text-gray-600">Customer {customerPaymentRatio}% · Seller {sellerPaymentRatio}%</span>}
        >
          <div className="mb-2.5 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            <div className="rounded-lg border border-blue-100 bg-blue-50/50 px-3 py-2">
              <div className="mb-1 flex items-center justify-between gap-2 text-[11px]">
                <span className="font-bold text-blue-900">From customer</span>
                <span className="font-extrabold tabular-nums text-blue-900">{customerPaymentRatio}%</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-blue-100">
                <div className={`h-full rounded-full ${customerPaymentRatio >= 100 ? 'bg-emerald-500' : 'bg-blue-500'}`} style={{ width: `${customerPaymentRatio}%` }} />
              </div>
              <div className="mt-1 flex justify-between gap-2 text-[10px] font-medium text-blue-800/75">
                <span>Received {formatInr(finance.payments.purchaserReceived)}</span>
                <span>{paymentBalances.customer.label} {formatInr(paymentBalances.customer.amount)}</span>
              </div>
            </div>
            <div className="rounded-lg border border-amber-100 bg-amber-50/50 px-3 py-2">
              <div className="mb-1 flex items-center justify-between gap-2 text-[11px]">
                <span className="font-bold text-amber-900">To seller</span>
                <span className="font-extrabold tabular-nums text-amber-900">{sellerPaymentRatio}%</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-amber-100">
                <div className={`h-full rounded-full ${sellerPaymentRatio >= 100 ? 'bg-emerald-500' : 'bg-amber-500'}`} style={{ width: `${sellerPaymentRatio}%` }} />
              </div>
              <div className="mt-1 flex justify-between gap-2 text-[10px] font-medium text-amber-800/75">
                <span>Paid {formatInr(finance.payments.sellerPaid)}</span>
                <span>{paymentBalances.seller.label} {formatInr(paymentBalances.seller.amount)}</span>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-6">
            <div className="col-span-2">
              <Segmented
                value={paymentDraft.side}
                options={[{ value: 'PURCHASER_RECEIPT', label: 'From customer' }, { value: 'SELLER_PAYMENT', label: 'To seller' }]}
                disabled={busy}
                onChange={(value) => setPaymentDraft((current) => ({ ...current, side: value }))}
              />
            </div>
            <input type="number" min="0.01" step="0.01" disabled={busy} value={paymentDraft.amount} onChange={(event) => setPaymentDraft((current) => ({ ...current, amount: event.target.value }))} placeholder="Amount ₹" className={`${inputClass} ${inputBorder()}`} />
            <input type="date" disabled={busy} value={paymentDraft.paymentDate} onChange={(event) => setPaymentDraft((current) => ({ ...current, paymentDate: event.target.value }))} className={`${inputClass} ${inputBorder()}`} />
            <SearchableSelect
              size="sm"
              options={['CASH', 'UPI', 'BANK_TRANSFER', 'CHEQUE', 'OTHER'].map((method) => ({ id: method, name: method.replace('_', ' ') }))}
              value={paymentDraft.method}
              displayValue={paymentDraft.method.replace('_', ' ')}
              searchable={false}
              disabled={busy}
              onChange={(option) => setPaymentDraft((current) => ({ ...current, method: String(option.id) as SellAccountPayment['method'] }))}
              className="w-full"
            />
            <button type="button" disabled={busy} onClick={() => void addPayment()} className="inline-flex h-[34px] items-center justify-center gap-1 rounded-lg bg-gray-900 px-3 text-xs font-bold text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-60"><Plus className="h-3.5 w-3.5" />{busyAction === 'payment' ? 'Saving…' : 'Add'}</button>
            <input type="text" disabled={busy} value={paymentDraft.reference} onChange={(event) => setPaymentDraft((current) => ({ ...current, reference: event.target.value }))} placeholder="UTR / cheque / receipt no." className={`${inputClass} ${inputBorder()} col-span-2 sm:col-span-3`} />
            <input type="text" disabled={busy} value={paymentDraft.note} onChange={(event) => setPaymentDraft((current) => ({ ...current, note: event.target.value }))} placeholder="Note (optional)" className={`${inputClass} ${inputBorder()} col-span-2 sm:col-span-3`} />
          </div>
          {(form.payments || []).length ? (
            <div className="mt-2.5 overflow-x-auto rounded-lg border border-gray-200">
              <table className="min-w-full text-left text-xs">
                <thead className="bg-gray-50 text-[10px] font-bold uppercase tracking-wider text-gray-500">
                  <tr><th className="px-2.5 py-2">Side</th><th className="px-2.5 py-2">Amount</th><th className="px-2.5 py-2">Date</th><th className="px-2.5 py-2">Method</th><th className="px-2.5 py-2">Ref.</th><th className="px-2.5 py-2 text-right" /></tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {(form.payments || []).map((payment, index) => (
                    <tr key={payment.id || `${payment.paymentDate}-${index}`}>
                      <td className="px-2.5 py-1.5 font-semibold text-gray-800">{payment.side === 'PURCHASER_RECEIPT' ? 'Customer' : 'Seller'}</td>
                      <td className="px-2.5 py-1.5 font-bold tabular-nums text-gray-900">{formatInr(payment.amount)}</td>
                      <td className="px-2.5 py-1.5 text-gray-600">{formatDisplayDate(payment.paymentDate)}</td>
                      <td className="px-2.5 py-1.5 text-gray-600">{payment.method.replace('_', ' ')}</td>
                      <td className="max-w-[140px] truncate px-2.5 py-1.5 font-mono text-[11px] text-gray-500">{payment.reference || '—'}</td>
                      <td className="px-2.5 py-1.5 text-right">
                        <span className="inline-flex items-center gap-1">
                          {payment.side === 'PURCHASER_RECEIPT' ? <button type="button" onClick={() => sharePaymentOnWhatsApp(payment)} className="rounded-md p-1 text-[#25D366] hover:bg-green-50" title="Share receipt on WhatsApp" aria-label="Share receipt on WhatsApp"><MessageCircle className="h-3.5 w-3.5" /></button> : null}
                          <button type="button" disabled={busy} onClick={() => void removePayment(index)} className="rounded-md p-1 text-rose-500 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50" title="Remove payment" aria-label="Remove payment"><Trash2 className="h-3.5 w-3.5" /></button>
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="mt-2.5 rounded-lg border border-dashed border-gray-300 px-3 py-2.5 text-center text-xs text-gray-500">No payments yet. Deal status updates automatically as customer receipts are added.</p>
          )}
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-gray-600">
            <span>Customer balance: <b className="tabular-nums text-gray-900">{formatInr(paymentBalances.customer.amount)}</b></span>
            <span>Seller balance: <b className="tabular-nums text-gray-900">{formatInr(paymentBalances.seller.amount)}</b></span>
          </div>
        </Section>

        {/* 6. Status & transfer */}
        <Section icon={<ClipboardCheck className="h-3.5 w-3.5" />} title="5. Status, Transfer & Remark">
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            <Field label="Deal status (automatic)">
              <div className={`flex h-[34px] items-center gap-1.5 rounded-lg border px-2.5 text-xs font-bold ${dealStatusConfig.bg} ${dealStatusConfig.text} ${dealStatusConfig.border}`}><DealStatusIcon className="h-3.5 w-3.5" />{dealStatusConfig.label}</div>
            </Field>
            <Field label="Transfer details" required error={errors.transferDetails}>
              <input className={`${inputClass} ${inputBorder(Boolean(errors.transferDetails))}`} value={form.transferDetails} placeholder="e.g. NOC pending, hypothecation removed" onChange={(event) => update('transferDetails', event.target.value)} />
            </Field>
            <Field label="Remark" className="sm:col-span-2">
              <textarea rows={2} className={`w-full rounded-lg border ${inputBorder()} bg-white px-2.5 py-2 text-[13px] text-gray-900 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/15`} value={form.remarks || ''} placeholder="Inspection observations, payment terms, transfer notes…" onChange={(event) => update('remarks', event.target.value)} />
            </Field>
          </div>
          {!hasLinkedRto && canManageRto ? (
            <label className="mt-2.5 flex cursor-pointer items-start gap-2.5 rounded-lg border border-indigo-100 bg-indigo-50/60 px-3 py-2.5">
              <input type="checkbox" checked={startRtoRequested} onChange={(event) => setStartRtoRequested(event.target.checked)} className="mt-0.5 h-4 w-4 rounded border-indigo-300 text-indigo-600 focus:ring-indigo-500" />
              <span>
                <span className="block text-sm font-bold text-indigo-950">Start RTO Work after saving</span>
                <span className="block text-xs text-indigo-800/80">Opens the ownership-transfer workspace. Full customer payment is required ({formatInr(finance.payments.purchaserBalance)} pending).</span>
              </span>
            </label>
          ) : null}
        </Section>
      </div>

      {/* Documents */}
      <Section
        icon={<FileText className="h-3.5 w-3.5" />}
        title="6. Deeds, Documents & KYC"
        aside={(
          <div className="flex items-center gap-1.5">
            <a
              href={ESIGN_PLATFORM_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-md border border-indigo-200 bg-indigo-50 px-2.5 py-1.5 text-[11px] font-semibold text-[#3B61D9] transition hover:border-indigo-300 hover:bg-indigo-100"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Open E-sign platform
            </a>
            <button
              type="button"
              onClick={() => void copyEsignPlatformLink()}
              title="Copy E-sign platform link"
              aria-label="Copy E-sign platform link"
              className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-gray-200 bg-white text-gray-500 transition hover:border-indigo-200 hover:bg-indigo-50 hover:text-[#3B61D9]"
            >
              <Copy className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      >
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {([
            { side: 'purchase' as const, title: 'Purchase side', subtitle: form.sellerName || 'Seller', deedKey: 'purchaseDeed' as const, deedLabel: 'Purchase Deed' },
            { side: 'sell' as const, title: 'Sale side', subtitle: form.purchaserName || 'Customer', deedKey: 'sellDeed' as const, deedLabel: 'Sell Deed' },
          ]).map((group) => (
            <div key={group.side} className="space-y-3 rounded-lg border border-gray-200 p-3">
              <p className="flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wider text-gray-700">
                {group.side === 'purchase' ? <ShoppingCart className="h-3.5 w-3.5 text-amber-600" /> : <Wallet className="h-3.5 w-3.5 text-blue-600" />}
                {group.title}<span className="truncate font-semibold normal-case tracking-normal text-gray-400">· {group.subtitle}</span>
              </p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <SellAccountPdfField label={`${group.deedLabel} Document`} document={documents[group.deedKey]} onUploaded={(file) => replaceDocument(group.deedKey, file)} onUploadStateChange={handleUploadState} />
                <PanVerificationField
                  side={group.side}
                  state={(form.kyc || createEmptySellAccountKyc())[group.side].pan}
                  busyKey={kycBusyKey}
                  onNumberChange={(value) => handleKycNumberChange(group.side, 'pan', value)}
                  onVerify={() => void handleKycVerify(group.side, 'pan')}
                  previewAvailable={Boolean(verificationPreviews[`${group.side}-pan`])}
                  onPreview={() => openVerificationPreview(group.side, 'pan')}
                />
              </div>
              <DeedDocumentPreview label={group.deedLabel} document={documents[group.deedKey]} onRemove={() => replaceDocument(group.deedKey, null)} />
              <SellAccountKycFields
                side={group.side}
                values={(form.kyc || createEmptySellAccountKyc())[group.side]}
                busyKey={kycBusyKey}
                onNumberChange={(kind, value) => handleKycNumberChange(group.side, kind, value)}
                onVerify={(kind) => void handleKycVerify(group.side, kind)}
                previewAvailable={Boolean(verificationPreviews[`${group.side}-gst`])}
                onPreview={() => openVerificationPreview(group.side, 'gst')}
              />
            </div>
          ))}
        </div>
      </Section>

      {/* Sticky actions */}
      <div className="sticky bottom-0 z-30 -mx-1 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-gray-200 bg-white/95 px-4 py-2.5 shadow-[0_-8px_24px_rgba(15,23,42,0.08)] backdrop-blur">
        <div className="flex items-center gap-3 text-xs text-gray-600">
          <button type="button" onClick={() => void cancel()} className="inline-flex items-center gap-1 rounded-lg px-3 py-2 font-bold text-gray-700 hover:bg-gray-100"><X className="h-3.5 w-3.5" />Cancel</button>
          <span className="hidden md:inline">Final profit <b className={`tabular-nums ${finance.gst.netProfitAfterGst >= 0 ? 'text-emerald-700' : 'text-rose-600'}`}>{formatInr(finance.gst.netProfitAfterGst)}</b> · GST <b className="tabular-nums text-gray-900">{formatInr(finance.gst.gstAmount)}</b></span>
          {activeUploads > 0 ? <span className="inline-flex items-center gap-1 text-amber-700"><Loader2 className="h-3.5 w-3.5 animate-spin" />Uploading…</span> : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isDraftRecord ? (
            <button type="button" disabled={busy} onClick={() => void saveDraft()} className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3.5 py-2 text-xs font-bold text-amber-900 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50">
              {busyAction === 'draft' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Bookmark className="h-3.5 w-3.5" />}Save draft
            </button>
          ) : null}
          <button type="button" disabled={busy} onClick={() => void saveRecord()} className={`inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-extrabold disabled:cursor-not-allowed disabled:opacity-50 ${startRtoRequested && !hasLinkedRto ? 'border border-gray-300 bg-white text-gray-800 hover:bg-gray-50' : 'bg-[#FFC107] text-gray-950 shadow-sm hover:bg-amber-400'}`}>
            {busyAction === 'save' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
            {isPersisted && !isDraftRecord ? 'Save Changes' : 'Save Record'}
          </button>
          {startRtoRequested && !hasLinkedRto && canManageRto ? (
            <button
              type="button"
              disabled={busy || finance.payments.purchaserPaymentStatus !== 'FULL'}
              onClick={() => void saveAndStartRto()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#FFC107] px-4 py-2 text-xs font-extrabold text-gray-950 shadow-sm hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-50"
              title={finance.payments.purchaserPaymentStatus !== 'FULL' ? 'Full customer payment is required' : undefined}
            >
              {busyAction === 'rto' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Repeat className="h-3.5 w-3.5" />}
              {finance.payments.purchaserPaymentStatus !== 'FULL' ? 'Full Payment Required' : 'Save & Start RTO Work'}
            </button>
          ) : null}
        </div>
      </div>
      {activeVerificationPreview ? (
        <KycVerificationPreviewModal preview={activeVerificationPreview} onClose={() => setActiveVerificationPreview(null)} />
      ) : null}
    </div>
  );
}
