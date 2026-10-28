'use client';

import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowLeft, ArrowRight, Ban, Bookmark, Car, CheckCircle2, ClipboardCheck, Download, FileCheck2, FileText, Handshake, IndianRupee,
  Loader2, MessageCircle, MessageSquareText, Plus, Repeat, ShoppingCart, Trash2, Truck, Wallet, X,
} from 'lucide-react';
import { toast } from 'react-toastify';
import api from '@/lib/api';
import { downloadAuthedFile, readBlobErrorMessage } from '@/lib/authedDownload';
import SearchableSelect from '@/components/ui/SearchableSelect';
import BrandLoader from '@/components/ui/BrandLoader';
import { useAuthStore } from '@/store/authStore';
import { useTranslation } from '@/hooks/useTranslation';
import { hasAnyPermission } from '@/lib/permissionUtils';
import { getAccountCreatePermissions, getAccountUpdatePermissions } from '@/lib/accountsPermissions';
import { deleteSecureFileFromServer, type UploadedFileResult, uploadFileToServer } from '@/lib/fileUpload';
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
import { getSellAccountPaymentBalances, getSellAccountPaymentsForSide } from '@/lib/sellAccountPaymentPresentation.mjs';
import {
  applySourceTypeChange,
  fillBlankFields,
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
import { validateAadhaarNumber } from '@/lib/aadhaarVerification';
import { buildVerificationCacheKey, getVerificationCache, setVerificationCache } from '@/lib/verificationRequestCache';
import { buildAadhaarCardData, hasAadhaarCardData } from './aadhaarVerification.mjs';
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
import { DigilockerVerificationModal, type DigilockerVerificationSession } from './DigilockerVerificationModal';
import CitySelect, { type LocationOption } from '../CitySelect';
import { ApiFillBox, ApiFillLegend } from '@/components/ui/ApiFillBadge';

type NamedOption = { id: string; name: string };

const LOCAL_RECORDS_KEY = 'jcb_sell_accounts_records';

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

type CrmLeadForSoldVehicle = {
  customer?: { name?: string | null; mobile?: string | null; city?: string | null; state?: string | null } | null;
  wonAmount?: number | string | null;
  wonSellAccountId?: string | null;
  activities?: Array<{ type: string; metadata?: Record<string, unknown> | null }>;
};

/** Customer, deal value and (for outside-inventory deals) the machine from a WON CRM lead. */
const fetchLeadDeal = async (leadId: string): Promise<{ fill: Partial<SellAccountFormState>; wonSellAccountId: string | null }> => {
  try {
    const response = await api.get<{ lead?: CrmLeadForSoldVehicle }>(`/crm/leads/${encodeURIComponent(leadId)}`);
    const lead = response.data?.lead;
    if (!lead) return { fill: {}, wonSellAccountId: null };
    const deal = lead.activities?.find((activity) => activity.type === 'STATUS_CHANGE' && activity.metadata?.to === 'WON' && activity.metadata?.soldVehicleMode)?.metadata;
    return {
      fill: {
        purchaserName: lead.customer?.name || '',
        purchaserNumber: String(lead.customer?.mobile || '').replace(/\D/g, '').slice(-10),
        purchaserCity: lead.customer?.city || '',
        purchaserState: lead.customer?.state || '',
        ...(Number(lead.wonAmount) > 0 ? { sellAmount: Number(lead.wonAmount) } : {}),
        ...(deal?.soldVehicleMode === 'OFF_INVENTORY' && deal.soldListingTitle ? { listingTitle: String(deal.soldListingTitle) } : {}),
      },
      wonSellAccountId: lead.wonSellAccountId || null,
    };
  } catch {
    // The CRM lead is only a convenience prefill; the form still works without it.
    return { fill: {}, wonSellAccountId: null };
  }
};

const fetchLeadPrefill = async (leadId: string) => (await fetchLeadDeal(leadId)).fill;

/** Request body for creating / updating a Sold Vehicle from the form state. */
const toSellAccountPayload = (form: SellAccountFormState, { isDraft, crmLeadId }: { isDraft: boolean; crmLeadId?: string }) => {
  const breakdown = form.expenseBreakdown as SellAccountExpenseBreakdown;
  return {
    ...form,
    isDraft,
    ...(crmLeadId ? { crmLeadId } : {}),
    sellDate: form.purchaserDate || form.sellDate,
    sourceType: form.sourceType || null,
    expenses: sumExpenseBreakdown(breakdown),
    expenseBreakdown: breakdown,
    purchaseExchangeValue: form.purchaseType === 'EXCHANGE' ? Number(form.purchaseExchangeValue || 0) : 0,
    saleExchangeValue: form.saleType === 'EXCHANGE' ? Number(form.saleExchangeValue || 0) : 0,
    documents: { ...(normalizeSellAccountDocuments(form) as SellAccountDocuments), kyc: form.kyc || createEmptySellAccountKyc() },
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

/** Vehicle, purchase side and pricing from the linked listing, plus its listed (seller) price. */
const listingFormFill = (listing: Record<string, unknown>) => {
  const prefill = getListingAccountPrefill(listing);
  const parties = getListingDealParties(listing);
  const fill: Partial<SellAccountFormState> = {
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
    ...(parties.purchaseAmount > 0 ? { purchaseAmount: parties.purchaseAmount } : {}),
    ...(parties.expenseBreakdown ? { expenseBreakdown: parties.expenseBreakdown as SellAccountExpenseBreakdown } : {}),
  };
  return { fill, listedPrice: parties.listedPrice };
};

const initialPaymentDraft = (side: SellAccountPayment['side'] = 'PURCHASER_RECEIPT') => ({
  side,
  amount: '',
  paymentDate: todayInput(),
  method: 'BANK_TRANSFER' as SellAccountPayment['method'],
  reference: '',
  drawnOn: '',
  note: '',
});

const RECEIPT_STATUS_BADGE: Record<string, { label: string; className: string }> = {
  DRAFT: { label: 'Draft', className: 'border-amber-200 bg-amber-50 text-amber-800' },
  ISSUED: { label: 'Real', className: 'border-emerald-200 bg-emerald-50 text-emerald-800' },
  CANCELLED: { label: 'Cancelled', className: 'border-gray-300 bg-gray-100 text-gray-500 line-through' },
};

export default function SoldVehicleForm({ recordId }: { recordId?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { t } = useTranslation();
  const portal = accountsPortalBase(pathname);
  const listPath = `${portal}/accounts/sell-accounts`;
  const rtoBasePath = `${portal}/accounts/rto-work-status`;
  const listingIdParam = searchParams.get('listingId')?.trim() || '';
  // Set when a CRM deal closed as WON sends the user here; the new record links back to that lead.
  const leadIdParam = searchParams.get('leadId')?.trim() || '';

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
  const [sendingReceiptKey, setSendingReceiptKey] = useState<string | null>(null);
  const [startRtoRequested, setStartRtoRequested] = useState(false);
  const [listedPrice, setListedPrice] = useState(0);
  const [categories, setCategories] = useState<NamedOption[]>([]);
  const [brands, setBrands] = useState<NamedOption[]>([]);
  const [states, setStates] = useState<LocationOption[]>([]);
  const [paymentDraft, setPaymentDraft] = useState(initialPaymentDraft);
  const [verificationPreviews, setVerificationPreviews] = useState<Record<string, KycVerificationPreview>>({});
  const [activeVerificationPreview, setActiveVerificationPreview] = useState<KycVerificationPreview | null>(null);
  const [kycBusyKey, setKycBusyKey] = useState<string | null>(null);
  const [aadhaarSession, setAadhaarSession] = useState<(DigilockerVerificationSession & { side: 'purchase' | 'sell' }) | null>(null);
  const [activeUploads, setActiveUploads] = useState(0);
  const [pendingReplacedDocuments, setPendingReplacedDocuments] = useState<SellAccountDocument[]>([]);
  const originalDocumentUrls = useRef<Set<string>>(new Set());
  const restoredVerificationPreviews = useRef(false);
  // One automatic draft per CRM deal, even when the load effect runs twice.
  const draftFromLead = useRef<Promise<string | null> | null>(null);

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
      refunds: record.refunds || [],
      balanceAmount: record.balanceAmount,
      dealStatus: record.dealStatus,
      rtoStatusSnapshot: record.rtoStatusSnapshot,
      cancelledAt: record.cancelledAt,
      invoiceNumber: record.invoiceNumber,
      invoiceGeneratedAt: record.invoiceGeneratedAt,
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
          if (!leadIdParam) {
            if (!cancelled) applyRecord(record);
            return;
          }
          // Opened from a CRM deal closed as WON: fill whatever this record still has blank from the
          // listing and the lead, without overwriting anything already entered.
          const [listingResult, leadFill] = await Promise.all([
            record.listingId
              ? api.get<{ listing?: Record<string, unknown> }>(`/listings/${encodeURIComponent(record.listingId)}`).then((res) => res.data?.listing || null).catch(() => null)
              : Promise.resolve(null),
            fetchLeadPrefill(leadIdParam),
          ]);
          if (cancelled) return;
          const listingFill = listingResult ? listingFormFill(listingResult) : null;
          applyRecord(record);
          if (listingFill) setListedPrice(listingFill.listedPrice);
          setForm((current) => fillBlankFields(fillBlankFields(current, leadFill), listingFill?.fill || {}) as SellAccountFormState);
          return;
        }

        const leadQuery = leadIdParam ? `?${new URLSearchParams({ leadId: leadIdParam }).toString()}` : '';
        const openRecord = (id: string) => router.replace(`${listPath}/${encodeURIComponent(id)}/edit${leadQuery}`);
        const leadDeal = leadIdParam ? await fetchLeadDeal(leadIdParam) : null;
        if (leadDeal?.wonSellAccountId) {
          openRecord(leadDeal.wonSellAccountId);
          return;
        }

        let nextForm: SellAccountFormState = { ...createInitialSellAccountForm(), brokerName: JCB_EXCHANGE_BROKER.name, brokerNumber: JCB_EXCHANGE_BROKER.number };
        let price = 0;
        if (listingIdParam) {
          const existing = await api.get<{ records?: SellAccountApiRecord[] }>('/recruitment/admin/sell-accounts')
            .then((response) => (response.data?.records || []).find((record) => String(record.listingId || '') === listingIdParam))
            .catch(() => undefined);
          // A locked record is an earlier sale of this machine that is already closed. A new CRM deal
          // starts its own draft (not linked to the listing) instead of landing on that locked record.
          const startFreshFromLead = Boolean(leadIdParam && existing?.isLocked === true);
          if (existing?.id && !startFreshFromLead) {
            openRecord(String(existing.id));
            return;
          }
          const response = await api.get<{ listing?: Record<string, unknown> }>(`/listings/${encodeURIComponent(listingIdParam)}`);
          const listing = response.data?.listing;
          if (!listing) throw new Error('Listing not found.');
          const listingFill = listingFormFill(listing);
          nextForm = { ...createInitialSellAccountForm(), ...listingFill.fill, ...(startFreshFromLead ? { listingId: null } : {}) };
          price = listingFill.listedPrice;
        }
        nextForm = { ...nextForm, ...(leadDeal?.fill || {}) };

        // Coming from a CRM deal closed as WON: save the prefilled record as a draft right away, so the
        // deal is never lost if the page is left. It stays a draft until the form is completed and saved.
        if (leadIdParam && canCreate) {
          draftFromLead.current = draftFromLead.current || api.post<{ record?: SellAccountApiRecord }>(
            '/recruitment/admin/sell-accounts',
            { ...toSellAccountPayload(nextForm, { isDraft: true, crmLeadId: leadIdParam }), draftSavedAt: new Date().toISOString() },
          ).then((response) => (response.data?.record?.id ? String(response.data.record.id) : null));
          const draftId = await draftFromLead.current.catch(() => null);
          if (cancelled) return;
          if (draftId) {
            openRecord(draftId);
            return;
          }
          toast.error('Could not save the draft automatically. Use Save Draft below.');
        }

        if (cancelled) return;
        setListedPrice(price);
        setForm(nextForm);
      } catch (error) {
        if (!cancelled) setLoadError(apiErrorMessage(error, error instanceof Error ? error.message : 'Unable to load this Sold Vehicle record.'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [applyRecord, canCreate, leadIdParam, listPath, listingIdParam, recordId, router]);

  useEffect(() => {
    if (loading || restoredVerificationPreviews.current) return;
    restoredVerificationPreviews.current = true;

    const kyc = form.kyc || createEmptySellAccountKyc();
    const targets: Array<{ side: 'purchase' | 'sell'; kind: 'pan' | 'gst' | 'aadhaar'; number: string; recordId: string }> = [];
    (['purchase', 'sell'] as const).forEach((side) => {
      (['pan', 'gst', 'aadhaar'] as const).forEach((kind) => {
        const state = kyc[side][kind];
        if (state.status === SELL_ACCOUNT_KYC_STATUS.VERIFIED && state.number && state.verificationRecordId) {
          targets.push({ side, kind, number: state.number, recordId: state.verificationRecordId });
        }
      });
    });
    if (!targets.length) return;

    let cancelled = false;
    void Promise.allSettled(targets.map(async ({ side, kind, number, recordId }) => {
      const endpoint = kind === 'pan'
        ? `/pan-verification/history/${encodeURIComponent(recordId)}`
        : kind === 'gst'
          ? `/gst-verification/history/${encodeURIComponent(recordId)}`
          : `/aadhaar-verification/history/${encodeURIComponent(recordId)}`;
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
    refunds: existingRecord?.refunds || [],
    cancelled: Boolean(existingRecord?.cancelledAt),
  }), [existingRecord?.cancelledAt, existingRecord?.refunds, expenseTotal, form.payments, form.purchaseAmount, form.purchaserState, form.sellAmount, form.sellerState, purchaseExchangeValue, saleExchangeValue]);
  const saleCancelled = Boolean(existingRecord?.cancelledAt);
  const paymentBalances = getSellAccountPaymentBalances(finance.payments);
  const visiblePaymentRows = useMemo(() => {
    const allPayments = form.payments || [];
    const visiblePayments = getSellAccountPaymentsForSide(allPayments, paymentDraft.side);
    return visiblePayments.map((payment) => ({
      payment,
      index: allPayments.indexOf(payment),
    }));
  }, [form.payments, paymentDraft.side]);

  const dealStatus = deriveSellAccountDealStatus({
    purchaserPaymentStatus: finance.payments.purchaserPaymentStatus,
    rtoStatus: form.rtoStatusSnapshot,
    rtoLinked: hasLinkedRto,
    cancelled: saleCancelled,
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
        const next = { ...current };
        if (kind === 'pan') delete next[`${side}-aadhaar`];
        if (!current[previewKey] && !cachedPreview && kind !== 'pan') return current;
        if (cachedPreview) {
          next[previewKey] = { ...cachedPreview, side, kind: kind as 'pan' | 'gst' };
        } else {
          delete next[previewKey];
        }
        return next;
      });
    }
    if (kind === 'aadhaar') {
      updateKycState(side, kind, currentState.number === normalized
        ? { ...currentState, error: '' }
        : { ...currentState, number: normalized, status: SELL_ACCOUNT_KYC_STATUS.NOT_VERIFIED, verificationRecordId: '', verifiedAt: '', cacheHit: false, error: '' });
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

  const buildAadhaarPreview = (side: 'purchase' | 'sell', response: Record<string, unknown>): KycVerificationPreview | null => {
    const result = isRecord(response.result) ? response.result : {};
    const data = buildAadhaarCardData({ side, kind: 'aadhaar', number: '', response }, result);
    if (!hasAadhaarCardData(data)) return null;
    return {
      side,
      kind: 'aadhaar',
      number: data.aadhaarNumber === '—' ? '' : data.aadhaarNumber || '',
      response,
    };
  };

  const handleKycVerify = async (side: 'purchase' | 'sell', kind: 'pan' | 'gst' | 'aadhaar') => {
    const currentState = (form.kyc || createEmptySellAccountKyc())[side][kind];
    const normalized = normalizeSellAccountKycNumber(kind.toUpperCase(), currentState.number);
    const validationError = kind === 'pan' ? validatePan(normalized) : kind === 'gst' ? validateGstin(normalized) : validateAadhaarNumber(normalized);
    if (validationError) {
      updateKycState(side, kind, { ...currentState, number: normalized, status: SELL_ACCOUNT_KYC_STATUS.NOT_VERIFIED, error: validationError });
      return;
    }
    const key = `${side}-${kind}`;
    const cacheKey = buildVerificationCacheKey(kind, normalized);
    const cachedPreview = getVerificationCache<KycVerificationPreview>(cacheKey);
    if (kind === 'aadhaar') {
      setKycBusyKey(key);
      updateKycState(side, kind, { ...currentState, number: normalized, status: SELL_ACCOUNT_KYC_STATUS.NOT_VERIFIED, error: '' });
      let waitingForSdk = false;
      try {
        const response = await api.post<Record<string, unknown>>('/aadhaar-verification/initialize', {
          aadhaarNumber: normalized,
          side: side === 'purchase' ? 'PURCHASE' : 'SALE',
        });
        const responseData = response.data;
        if (responseData.cacheHit === true && isRecord(responseData.result)) {
          const result = responseData.result;
          const verifiedNumber = typeof result.maskedAadhaar === 'string' ? result.maskedAadhaar : normalized;
          const nextState = createVerificationState({ kind: 'AADHAAR', number: verifiedNumber, response: responseData });
          const preview = buildAadhaarPreview(side, responseData);
          updateKycState(side, kind, nextState as SellAccountKycState);
          if (preview) {
            setVerificationPreviews((current) => ({ ...current, [`${side}-aadhaar`]: preview }));
            setActiveVerificationPreview(preview);
          }
          const nextKyc = {
            ...(form.kyc || createEmptySellAccountKyc()),
            [side]: { ...(form.kyc || createEmptySellAccountKyc())[side], aadhaar: nextState },
          } as SellAccountKyc;
          void persistVerifiedKyc(nextKyc);
          toast.success('Aadhaar details loaded from verified cache.');
          return;
        }
        const record = isRecord(responseData.record) ? responseData.record : {};
        if (typeof record.id !== 'string' || typeof responseData.sdkToken !== 'string') throw new Error('DigiLocker session was not created.');
        const providerClientId = typeof record.providerClientId === 'string' ? record.providerClientId.trim() : '';
        if (!providerClientId) throw new Error('DigiLocker session did not return a provider client ID.');
        setAadhaarSession({
          recordId: record.id,
          clientId: providerClientId,
          sdkToken: responseData.sdkToken,
          gateway: responseData.gateway === 'production' ? 'production' : 'sandbox',
          expirySeconds: typeof responseData.expirySeconds === 'number' ? responseData.expirySeconds : undefined,
          side,
        });
        waitingForSdk = true;
      } catch (error) {
        const message = apiErrorMessage(error, 'Aadhaar verification could not be started. Please try again.');
        updateKycState(side, kind, createFailedVerificationState('AADHAAR', normalized, message) as SellAccountKycState);
        toast.error(message);
      } finally {
        if (!waitingForSdk) setKycBusyKey(null);
      }
      return;
    }
    if (cachedPreview) {
      const cachedResponse = { ...cachedPreview.response, cacheHit: true };
      const preview = { ...cachedPreview, side, kind };
      const nextState = createVerificationState({ kind: kind.toUpperCase(), number: normalized, response: cachedResponse }) as SellAccountKycState;
      const nextKyc = {
        ...(form.kyc || createEmptySellAccountKyc()),
        [side]: { ...(form.kyc || createEmptySellAccountKyc())[side], [kind]: nextState },
      } as SellAccountKyc;
      const aadhaarPreview = kind === 'pan' ? buildAadhaarPreview(side, cachedResponse) : null;
      updateKycState(side, kind, nextState);
      setVerificationPreviews((current) => {
        const next = { ...current, [key]: preview };
        if (aadhaarPreview) next[`${side}-aadhaar`] = aadhaarPreview;
        else if (kind === 'pan') delete next[`${side}-aadhaar`];
        return next;
      });
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
        const aadhaarPreview = kind === 'pan' ? buildAadhaarPreview(side, responseData) : null;
        setVerificationCache(cacheKey, preview);
        setVerificationPreviews((current) => {
          const next = { ...current, [previewKey]: preview };
          if (aadhaarPreview) next[`${side}-aadhaar`] = aadhaarPreview;
          else if (kind === 'pan') delete next[`${side}-aadhaar`];
          return next;
        });
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

  const handleDigilockerSuccess = async (clientId: string) => {
    const session = aadhaarSession;
    if (!session) return;
    const currentState = (form.kyc || createEmptySellAccountKyc())[session.side].aadhaar;
    const normalized = normalizeSellAccountKycNumber('AADHAAR', currentState.number);
    try {
      const response = await api.post<Record<string, unknown>>('/aadhaar-verification/complete', {
        recordId: session.recordId,
        clientId,
      });
      const responseData = response.data;
      if (!isRecord(responseData.result)) throw new Error('Aadhaar data was not returned by DigiLocker.');
      const result = responseData.result;
      const verifiedNumber = typeof result.maskedAadhaar === 'string' ? result.maskedAadhaar : normalized;
      const nextState = createVerificationState({ kind: 'AADHAAR', number: verifiedNumber, response: responseData });
      const preview = buildAadhaarPreview(session.side, responseData);
      updateKycState(session.side, 'aadhaar', nextState as SellAccountKycState);
      if (preview) {
        setVerificationPreviews((current) => ({ ...current, [`${session.side}-aadhaar`]: preview }));
        setActiveVerificationPreview(preview);
      }
      const nextKyc = {
        ...(form.kyc || createEmptySellAccountKyc()),
        [session.side]: { ...(form.kyc || createEmptySellAccountKyc())[session.side], aadhaar: nextState },
      } as SellAccountKyc;
      void persistVerifiedKyc(nextKyc);
      setAadhaarSession(null);
      toast.success('Aadhaar verified through DigiLocker. Preview opened.');
    } catch (error) {
      const message = apiErrorMessage(error, 'Aadhaar verification failed. Please try again.');
      updateKycState(session.side, 'aadhaar', createFailedVerificationState('AADHAAR', normalized, message) as SellAccountKycState);
      setAadhaarSession(null);
      toast.error(message);
    } finally {
      setKycBusyKey(null);
    }
  };

  const handleDigilockerClose = async () => {
    const session = aadhaarSession;
    setAadhaarSession(null);
    setKycBusyKey(null);
    if (!session) return;
    try {
      await api.post('/aadhaar-verification/cancel', { recordId: session.recordId });
    } catch {
      toast.info('DigiLocker session closed. The server will expire the unused session automatically.');
    }
  };

  const openVerificationPreview = (side: 'purchase' | 'sell', kind: 'pan' | 'gst' | 'aadhaar') => {
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
  const saveGeneratedKycDocument = async (file: File, key: SellAccountDocumentKey) => {
    setActiveUploads((count) => count + 1);
    try {
      const uploaded = await uploadFileToServer({ file, visibility: 'secure' });
      replaceDocument(key, uploaded);
      toast.success('Verification document uploaded to KYC. Save Changes to finalize it on this account.');
      return uploaded;
    } catch (error) {
      const message = apiErrorMessage(error, 'Unable to upload the verification document.');
      toast.error(message);
      throw new Error(message);
    } finally {
      setActiveUploads((count) => Math.max(0, count - 1));
    }
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
      drawnOn: paymentDraft.drawnOn.trim(),
      note: paymentDraft.note.trim(),
      // Customer receipts are drafts until converted; they do not count in the balance yet.
      receiptStatus: paymentDraft.side === 'PURCHASER_RECEIPT' ? 'DRAFT' : 'ISSUED',
    };
    if (!isPersisted) {
      setForm((current) => ({ ...current, payments: [...(current.payments || []), entry] }));
      setPaymentDraft(initialPaymentDraft(paymentDraft.side));
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
      setPaymentDraft(initialPaymentDraft(paymentDraft.side));
      toast.success(entry.side === 'PURCHASER_RECEIPT'
        ? 'Draft money receipt saved. Convert it to a real receipt once the money is confirmed.'
        : 'Payment added and balance updated.');
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
      toast.success(payment.side === 'PURCHASER_RECEIPT' ? 'Draft receipt removed.' : 'Payment removed and balance reversed.');
    } catch (error) {
      toast.error(apiErrorMessage(error, 'Unable to remove this payment.'));
    } finally {
      setBusyAction(null);
    }
  };
  const paymentPath = (payment: SellAccountPayment, suffix: string) =>
    `/recruitment/admin/sell-accounts/${encodeURIComponent(existingRecord!.id)}/payments/${encodeURIComponent(payment.id!)}/${suffix}`;
  const refreshAfterPaymentAction = (record?: SellAccountApiRecord) => {
    if (record) applyPaymentRecord(normalizeServerSellAccount(record));
  };
  /** Draft → real money receipt: receipt number, PDF link, WhatsApp/SMS; Bill of Supply once fully paid. */
  const issueReceipt = async (payment: SellAccountPayment) => {
    if (busyAction || !payment.id || !isPersisted) return;
    if (!window.confirm(`Convert this draft into a real money receipt for ${formatInr(payment.amount)}?\n\nA receipt number is assigned, the receipt is sent to the customer on WhatsApp/SMS and it is posted to the accounts. It cannot be deleted afterwards.`)) return;
    setBusyAction('payment');
    try {
      const response = await api.post<{ record?: SellAccountApiRecord; delivery?: { anySent?: boolean } | null; finalDocument?: { alreadyIssued?: boolean } | null }>(paymentPath(payment, 'issue'), {});
      refreshAfterPaymentAction(response.data?.record);
      toast.success(response.data?.delivery?.anySent ? 'Real money receipt issued and sent to the customer.' : 'Real money receipt issued. WhatsApp/SMS could not be sent; use the send buttons to retry.');
      if (response.data?.finalDocument && !response.data.finalDocument.alreadyIssued) toast.success('Full payment received: Bill of Supply generated and sent.');
    } catch (error) {
      toast.error(apiErrorMessage(error, 'Unable to convert this receipt.'));
    } finally {
      setBusyAction(null);
    }
  };
  const downloadReceipt = async (payment: SellAccountPayment) => {
    if (!payment.id || !isPersisted) return;
    try {
      await downloadAuthedFile(paymentPath(payment, 'receipt'), `Money-Receipt-${payment.receiptNumber || 'DRAFT'}.pdf`);
    } catch (error) {
      toast.error(await readBlobErrorMessage(error, 'Unable to download the receipt.'));
    }
  };
  /** A real receipt whose money never arrived (bounced cheque, failed transfer). */
  const cancelReceipt = async (payment: SellAccountPayment) => {
    if (busyAction || !payment.id || !isPersisted) return;
    const reason = window.prompt(`Cancel real receipt ${payment.receiptNumber || ''} (${formatInr(payment.amount)})?\n\nUse this only when the money was NOT received (e.g. cheque bounced). Money that was received and is given back must be recorded as a refund.\n\nReason:`);
    if (reason === null) return;
    setBusyAction('payment');
    try {
      const response = await api.post<{ record?: SellAccountApiRecord }>(paymentPath(payment, 'cancel'), { reason });
      refreshAfterPaymentAction(response.data?.record);
      toast.success('Receipt cancelled and reversed in the accounts.');
    } catch (error) {
      toast.error(apiErrorMessage(error, 'Unable to cancel this receipt.'));
    } finally {
      setBusyAction(null);
    }
  };
  const sendPaymentReceipt = (payment: SellAccountPayment, channel: 'SMS' | 'WHATSAPP') => {
    const isCustomerReceipt = payment.side === 'PURCHASER_RECEIPT';
    const number = String((isCustomerReceipt ? form.purchaserNumber : form.sellerNumber) || '').replace(/\D/g, '');
    if (!number) {
      toast.info(`Add the ${isCustomerReceipt ? 'customer' : 'seller'} mobile number before sending this payment.`);
      return;
    }
    if (isCustomerReceipt && isPersisted && existingRecord?.id && payment.id) {
      const key = `${payment.id}-${channel}`;
      if (sendingReceiptKey) return;
      setSendingReceiptKey(key);
      void api.post<{ delivery?: { channels?: Array<{ channel?: string; sent?: boolean }> } }>(
        `/recruitment/admin/sell-accounts/${encodeURIComponent(existingRecord.id)}/payments/${encodeURIComponent(payment.id)}/receipt/resend`,
        { channel },
      )
        .then((response) => {
          const delivery = response.data?.delivery?.channels?.find((item) => item.channel === channel);
          if (delivery?.sent) {
            toast.success(`${channel === 'SMS' ? 'SMS' : 'WhatsApp'} money receipt sent with the public PDF link.`);
          } else {
            toast.warning(`${channel === 'SMS' ? 'SMS' : 'WhatsApp'} is not configured or could not be sent.`);
          }
        })
        .catch((error) => toast.error(apiErrorMessage(error, 'Unable to send this money receipt.')))
        .finally(() => setSendingReceiptKey(null));
      return;
    }
    if (!isCustomerReceipt) {
      toast.info('Save the customer receipt first to send its configured SMS or WhatsApp money receipt.');
      return;
    }
    if (!payment.id) {
      toast.info('Save the payment first to generate its secure public receipt link.');
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
      `Payment received for vehicle: ${form.vehicleNumber || 'N/A'}`,
    ].filter((line, index, lines) => line || lines[index - 1]).join('\n');
    if (channel === 'WHATSAPP') {
      window.open(`https://wa.me/${number.length === 10 ? `91${number}` : number}?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer');
    } else {
      window.open(`sms:${number}?body=${encodeURIComponent(message)}`, '_self');
    }
  };

  // ---- Save ----
  const buildPayload = (isDraft: boolean) => toSellAccountPayload(form, { isDraft, crmLeadId: leadIdParam || undefined });

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
      toast.info(`Full customer payment is required before starting RTO work. Balance: ${formatInr(finance.payments.purchaserBalance)}.${finance.payments.purchaserDraftPending > 0 ? ' Convert the draft receipts to real receipts first.' : ''}`);
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
              {leadIdParam ? <span> · from a CRM deal ({existingRecord ? 'blank fields filled from the deal and listing' : 'customer and deal value filled in'})</span> : null}
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
            { label: 'Expenses', value: expenseTotal, tone: 'text-gray-900', note: 'Transport, paperwork, RTO…' },
            { label: 'Margin (incl. GST)', value: finance.gst.marginAmount, tone: finance.gst.marginAmount >= 0 ? 'text-gray-950' : 'text-rose-600', note: 'Sell − Purchase − Expenses' },
            ...taxLines.map((line) => ({ label: line.label, value: line.amount, tone: 'text-blue-800', note: 'Extracted from margin', accent: 'blue' })),
            { label: 'Final profit', value: finance.gst.netProfitAfterGst, tone: finance.gst.netProfitAfterGst >= 0 ? 'text-emerald-700' : 'text-rose-600', note: 'Margin after GST', accent: 'emerald' },
          ] as Array<{ label: string; value: number; tone: string; note: string; accent?: 'blue' | 'emerald' }>).map((tile) => (
            <div key={tile.label} className={`rounded-lg border px-3 py-2 ${tile.accent === 'blue' ? 'border-blue-200 bg-blue-50/60' : tile.accent === 'emerald' ? 'border-emerald-200 bg-emerald-50/70' : 'border-gray-200 bg-gray-50/60'}`}>
              <p className="truncate text-[10px] font-bold uppercase tracking-wider text-gray-500">{tile.label}</p>
              <p className={`mt-0.5 text-base font-extrabold tabular-nums ${tile.tone}`}>{formatInr(tile.value)}</p>
              <p className="truncate text-[10px] font-medium text-gray-400">{tile.note}</p>
            </div>
          ))}
        </div>
        <div className="mt-2.5 flex flex-wrap gap-x-5 gap-y-1 text-xs text-gray-600">
          <span>GST {GST_RATE_PERCENT}% included in the margin (after purchase + expenses): <b className="tabular-nums text-gray-900">{formatInr(finance.gst.gstAmount)}</b></span>
          <span>Customer pays in cash: <b className="tabular-nums text-gray-900">{formatInr(finance.payments.customerCashReceivable)}</b></span>
          <span>Payable to seller in cash: <b className="tabular-nums text-gray-900">{formatInr(finance.payments.sellerCashPayable)}</b></span>
        </div>
        {existingRecord?.marginBasis === 'SALE_MINUS_PURCHASE' ? (
          <p className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs text-amber-800">
            This record was saved with the old margin (Sell − Purchase). Saving it now recalculates GST and profit on the margin after expenses.
          </p>
        ) : null}
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
            <button type="button" disabled={busy || (saleCancelled && paymentDraft.side === 'PURCHASER_RECEIPT')} onClick={() => void addPayment()} title={saleCancelled && paymentDraft.side === 'PURCHASER_RECEIPT' ? 'This sale is cancelled; refund instead' : undefined} className="inline-flex h-[34px] items-center justify-center gap-1 rounded-lg bg-gray-900 px-3 text-xs font-bold text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-60"><Plus className="h-3.5 w-3.5" />{busyAction === 'payment' ? 'Saving…' : 'Add'}</button>
            <input type="text" disabled={busy} value={paymentDraft.reference} onChange={(event) => setPaymentDraft((current) => ({ ...current, reference: event.target.value }))} placeholder="UTR / cheque / txn no." className={`${inputClass} ${inputBorder()} col-span-2`} />
            <input type="text" disabled={busy} value={paymentDraft.drawnOn} onChange={(event) => setPaymentDraft((current) => ({ ...current, drawnOn: event.target.value }))} placeholder="Drawn on (bank)" className={`${inputClass} ${inputBorder()} col-span-2`} />
            <input type="text" disabled={busy} value={paymentDraft.note} onChange={(event) => setPaymentDraft((current) => ({ ...current, note: event.target.value }))} placeholder="Note (optional)" className={`${inputClass} ${inputBorder()} col-span-2`} />
          </div>
          {paymentDraft.side === 'PURCHASER_RECEIPT' ? (
            <p className="mt-1.5 text-[11px] text-gray-500">
              Customer payments are saved as <b>draft receipts</b>. Convert a draft to a <b>real money receipt</b> once the money is confirmed; only real receipts count in the balance and the accounts.
            </p>
          ) : null}
          {visiblePaymentRows.length ? (
            <div className="mt-2.5 overflow-x-auto rounded-lg border border-gray-200">
              <table className="min-w-full text-left text-xs">
                <thead className="bg-gray-50 text-[10px] font-bold uppercase tracking-wider text-gray-500">
                  <tr><th className="px-2.5 py-2">Side</th><th className="px-2.5 py-2">Amount</th><th className="px-2.5 py-2">Date</th><th className="px-2.5 py-2">Method</th><th className="px-2.5 py-2">Ref.</th><th className="px-2.5 py-2">Receipt</th><th className="px-2.5 py-2 text-right" /></tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {visiblePaymentRows.map(({ payment, index }) => {
                    const isCustomerReceipt = payment.side === 'PURCHASER_RECEIPT';
                    const receiptStatus = payment.receiptStatus || 'ISSUED';
                    const badge = RECEIPT_STATUS_BADGE[receiptStatus] || RECEIPT_STATUS_BADGE.ISSUED;
                    const canSaveAction = isPersisted && Boolean(payment.id);
                    return (
                    <tr key={payment.id || `${payment.paymentDate}-${index}`} className={receiptStatus === 'CANCELLED' ? 'opacity-60' : undefined}>
                      <td className="px-2.5 py-1.5 font-semibold text-gray-800">{isCustomerReceipt ? 'Customer' : 'Seller'}</td>
                      <td className="px-2.5 py-1.5 font-bold tabular-nums text-gray-900">{formatInr(payment.amount)}</td>
                      <td className="px-2.5 py-1.5 text-gray-600">{formatDisplayDate(payment.paymentDate)}</td>
                      <td className="px-2.5 py-1.5 text-gray-600">{payment.method.replace('_', ' ')}</td>
                      <td className="max-w-[140px] truncate px-2.5 py-1.5 font-mono text-[11px] text-gray-500" title={[payment.reference, payment.drawnOn].filter(Boolean).join(' · ')}>{payment.reference || '—'}{payment.drawnOn ? ` · ${payment.drawnOn}` : ''}</td>
                      <td className="px-2.5 py-1.5">
                        {isCustomerReceipt ? (
                          <span className="inline-flex flex-col gap-0.5">
                            <span className={`w-fit rounded-full border px-1.5 py-0.5 text-[10px] font-bold ${badge.className}`} title={payment.cancelReason || undefined}>{badge.label}</span>
                            {payment.receiptNumber ? <span className="font-mono text-[10px] text-gray-500">{payment.receiptNumber}</span> : null}
                          </span>
                        ) : <span className="text-gray-400">—</span>}
                      </td>
                      <td className="px-2.5 py-1.5 text-right">
                        <span className="inline-flex items-center gap-1">
                          {isCustomerReceipt && receiptStatus === 'DRAFT' && canSaveAction ? (
                            <button type="button" disabled={busy || saleCancelled} onClick={() => void issueReceipt(payment)} className="inline-flex items-center gap-1 rounded-md border border-emerald-300 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold text-emerald-800 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50" title="Convert to real money receipt">
                              <FileCheck2 className="h-3 w-3" />Make real
                            </button>
                          ) : null}
                          {isCustomerReceipt && canSaveAction ? (
                            <button type="button" onClick={() => void downloadReceipt(payment)} className="rounded-md p-1 text-gray-600 hover:bg-gray-100" title={receiptStatus === 'DRAFT' ? 'Download draft receipt (not valid)' : 'Download money receipt'} aria-label="Download money receipt">
                              <Download className="h-3.5 w-3.5" />
                            </button>
                          ) : null}
                          {isCustomerReceipt && receiptStatus === 'ISSUED' ? (
                            <>
                              <button type="button" disabled={busy || sendingReceiptKey === `${payment.id}-SMS`} onClick={() => sendPaymentReceipt(payment, 'SMS')} className="rounded-md p-1 text-sky-600 hover:bg-sky-50 disabled:cursor-not-allowed disabled:opacity-50" title="Send customer money receipt by SMS" aria-label="Send customer money receipt by SMS">
                                {sendingReceiptKey === `${payment.id}-SMS` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MessageSquareText className="h-3.5 w-3.5" />}
                              </button>
                              <button type="button" disabled={busy || sendingReceiptKey === `${payment.id}-WHATSAPP`} onClick={() => sendPaymentReceipt(payment, 'WHATSAPP')} className="rounded-md p-1 text-[#25D366] hover:bg-green-50 disabled:cursor-not-allowed disabled:opacity-50" title="Send customer money receipt by WhatsApp" aria-label="Send customer money receipt by WhatsApp">
                                {sendingReceiptKey === `${payment.id}-WHATSAPP` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MessageCircle className="h-3.5 w-3.5" />}
                              </button>
                              {canSaveAction ? (
                                <button type="button" disabled={busy} onClick={() => void cancelReceipt(payment)} className="rounded-md p-1 text-gray-500 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50" title="Cancel receipt (money not received)" aria-label="Cancel receipt"><Ban className="h-3.5 w-3.5" /></button>
                              ) : null}
                            </>
                          ) : null}
                          {/* A real money receipt is never deleted: cancel it or refund instead. */}
                          {!isCustomerReceipt || receiptStatus === 'DRAFT' ? (
                            <button type="button" disabled={busy} onClick={() => void removePayment(index)} className="rounded-md p-1 text-rose-500 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50" title={isCustomerReceipt ? 'Delete draft receipt' : 'Remove payment'} aria-label="Remove payment"><Trash2 className="h-3.5 w-3.5" /></button>
                          ) : null}
                        </span>
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="mt-2.5 rounded-lg border border-dashed border-gray-300 px-3 py-2.5 text-center text-xs text-gray-500">No {paymentDraft.side === 'PURCHASER_RECEIPT' ? 'customer receipts' : 'seller payments'} yet.</p>
          )}
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-gray-600">
            <span>Customer balance: <b className="tabular-nums text-gray-900">{formatInr(paymentBalances.customer.amount)}</b></span>
            <span>Seller balance: <b className="tabular-nums text-gray-900">{formatInr(paymentBalances.seller.amount)}</b></span>
            {finance.payments.purchaserDraftPending > 0 ? (
              <span className="text-amber-700">Draft receipts (not counted yet): <b className="tabular-nums">{formatInr(finance.payments.purchaserDraftPending)}</b></span>
            ) : null}
            {finance.payments.purchaserRefunded > 0 ? (
              <span>Refunded: <b className="tabular-nums text-gray-900">{formatInr(finance.payments.purchaserRefunded)}</b></span>
            ) : null}
          </div>
          {saleCancelled ? (
            <p className="mt-2 rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-xs text-gray-700">
              This sale is cancelled. Refunds are handled from the Sold Vehicle details page.
            </p>
          ) : null}
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
      >
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {([
            { side: 'purchase' as const, title: 'Purchase side', subtitle: form.sellerName || 'Seller', deedKey: 'purchaseDeed' as const, deedLabel: 'Purchase Deed', panKey: 'purchasePanCard' as const, aadhaarKey: 'purchaseAadhaarCard' as const },
            { side: 'sell' as const, title: 'Sale side', subtitle: form.purchaserName || 'Customer', deedKey: 'sellDeed' as const, deedLabel: 'Sell Deed', panKey: 'sellPanCard' as const, aadhaarKey: 'sellAadhaarCard' as const },
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
                aadhaarPreviewAvailable={Boolean(verificationPreviews[`${group.side}-aadhaar`])}
                onPreview={(kind) => openVerificationPreview(group.side, kind)}
              />
              <DeedDocumentPreview label={`${group.title} PAN verification`} document={documents[group.panKey]} onRemove={() => replaceDocument(group.panKey, null)} />
              <DeedDocumentPreview label={`${group.title} Aadhaar verification`} document={documents[group.aadhaarKey]} onRemove={() => replaceDocument(group.aadhaarKey, null)} />
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
        <KycVerificationPreviewModal
          key={`${activeVerificationPreview.side}-${activeVerificationPreview.kind}-${activeVerificationPreview.number}`}
          preview={activeVerificationPreview}
          onClose={() => setActiveVerificationPreview(null)}
          onSaveToKyc={saveGeneratedKycDocument}
        />
      ) : null}
      {aadhaarSession ? (
        <DigilockerVerificationModal
          session={aadhaarSession}
          onSuccess={(clientId) => void handleDigilockerSuccess(clientId)}
          onClose={() => { void handleDigilockerClose(); }}
        />
      ) : null}
    </div>
  );
}
