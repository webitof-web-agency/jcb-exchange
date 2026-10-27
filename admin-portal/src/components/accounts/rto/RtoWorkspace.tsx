'use client';

import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  AlertTriangle, ArrowLeft, ArrowRight, Check, CheckCircle2, ChevronDown, CircleDashed, ClipboardCheck, Copy,
  Download, FileText, History, Loader2, LockKeyhole, Receipt, RefreshCw, Save, ShieldAlert, ShieldCheck,
  Sparkles, Wand2,
} from 'lucide-react';
import { toast } from 'react-toastify';
import api from '@/lib/api';
import SearchableSelect from '@/components/ui/SearchableSelect';
import BrandLoader from '@/components/ui/BrandLoader';
import RemarkDialog from '@/components/accounts/RemarkDialog';
import CitySelect, { type LocationOption } from '@/components/accounts/CitySelect';
import RtoTermsModal from '@/components/accounts/rto/RtoTermsModal';
import { ApiFillBox, ApiFillLegend } from '@/components/ui/ApiFillBadge';
import { useAuthStore } from '@/store/authStore';
import { hasAnyPermission } from '@/lib/permissionUtils';
import { getAccountCreatePermissions, getAccountUpdatePermissions } from '@/lib/accountsPermissions';
import { normalizeAmountInput, toEditableAmount } from '@/lib/sellAccountForm.mjs';
import { getListingAccountPrefill } from '@/lib/listingAccountPrefill.mjs';
import { buildListingListUrl } from '@/lib/listingListNavigation.mjs';
import {
  getHsrpStatusOptions,
  getInitialTermsAccepted,
  getRtoStatusLabel,
  getRtoStatusOptions,
  getValidityOptions,
  isValidityDateRequired,
  normalizeHsrpStatus,
  normalizeRemark,
  normalizeRtoStatus,
  normalizeValidityForEdit,
} from '@/lib/rtoWorkStatusForm.mjs';
import {
  getTransferTaskStatus,
  summarizeTransferTasks,
  TASK_TONE_CLASSES,
  TRANSFER_TASK_STATUS_OPTIONS,
} from '@/lib/rtoTransferTasks.mjs';
import { getSourceTypeLabel, JCB_EXCHANGE_COMPANY_NAME } from '@/lib/soldVehicleParties.mjs';
import { downloadAuthedFile, readBlobErrorMessage } from '@/lib/authedDownload';
import { accountsPortalBase, DEAL_STATUS_CONFIG, formatInr, type SellAccountDealStatus } from '@/components/accounts/sold-vehicle/soldVehicleModel';

type Status = 'RTO_WORK_STARTED' | 'RTO_WORK_IN_PROGRESS' | 'RTO_WORK_FAILED' | 'RTO_WORK_COMPLETED' | 'DEAL_DONE';
type Validity = 'VALID' | 'EXPIRED' | 'NOT_AVAILABLE' | 'LIFETIME' | 'NOT_APPLICABLE' | 'PENDING';
type HsrpStatus = 'YES' | 'NO' | 'PENDING' | 'NOT_APPLICABLE';
type HirePurchase = 'PENDING' | 'ACTIVE' | 'TERMINATED' | 'NOT_APPLICABLE';

type RtoRecord = {
  id: string;
  isLocked?: boolean;
  sellAccountId?: string | null;
  listingId?: string | null;
  customerName: string; customerNumber: string; vehicleNumber: string; brandName: string; vehicleType: string; vehicleModel: string;
  hirePurchaseStatus: HirePurchase; financerName?: string;
  taxStatus: Validity; taxValidUntil: string | null;
  fitnessStatus: Validity; fitnessValidUntil: string | null; insuranceStatus: Validity; insuranceValidUntil: string | null;
  pucStatus: Validity; pucValidUntil: string | null; hsrpStatus: HsrpStatus; hsrpNumber?: string;
  sellerName: string; sellerNumber: string; purchaserName: string; purchaserNumber: string;
  rtoOffice: string; rtoAgentName: string; rtoAgentState: string; rtoAgentCity: string; rtoAgentNumber: string;
  rtoExpenses: number; rtoExpensesAdvance: number; rtoExpensesBalance?: number; documentSendDate: string | null;
  rtoStatus: Status; noteSheet: string | null; vehicleMaintenanceCost: number;
};
type FormState = Omit<RtoRecord, 'id' | 'rtoExpensesBalance' | 'isLocked'>;

type ComplianceCheck = { key: string; label: string; level: 'OK' | 'WARN' | 'BLOCK'; message: string; action?: string };
type Compliance = {
  checkedAt: string;
  source: 'RECORD' | 'LISTING_VERIFICATION' | 'RC_API';
  canTransfer: boolean;
  blockers: ComplianceCheck[];
  warnings: ComplianceCheck[];
  checks: ComplianceCheck[];
  suggested: Partial<Record<'taxStatus' | 'taxValidUntil' | 'insuranceStatus' | 'insuranceValidUntil' | 'fitnessStatus' | 'fitnessValidUntil' | 'pucStatus' | 'pucValidUntil' | 'hirePurchaseStatus' | 'financerName', string>>;
};
type TaskLog = { id: string; oldStatus: string | null; newStatus: string; remark: string; createdAt: string; changedByName: string | null };
type Task = { id: string; taskKey: string; label: string; isOptional: boolean; status: string; remark: string | null; updatedAt: string; updatedByName: string | null; logs: TaskLog[] };
type SellSummary = {
  id: string; recordNumber: string; listingTitle?: string | null; vehicleNumber?: string | null; ownerName?: string | null;
  sourceType?: string | null; purchaseType?: string; saleType?: string;
  sellerName?: string | null; sellerNumber?: string | null; sellerCity?: string | null; sellerState?: string | null;
  brokerName?: string | null; brokerNumber?: string | null;
  purchaserName?: string | null; purchaserNumber?: string | null; purchaserCity?: string | null; purchaserState?: string | null;
  sellAmount: number; dealStatus: SellAccountDealStatus; isLocked: boolean; completedAt?: string | null;
  invoiceNumber?: string | null; invoiceSentAt?: string | null;
  invoiceDelivery?: { channels?: Array<{ channel: string; sent: boolean; status: string; detail?: string | null }> } | null;
  payments: { customerCashReceivable: number; purchaserReceived: number; purchaserBalance: number; purchaserPaymentStatus: string };
};
type Workspace = {
  record: RtoRecord;
  listing: { id: string; title: string; hasRcVerification: boolean } | null;
  sellAccount: SellSummary | null;
  tasks: Task[];
  progress: { done: number; total: number; allDone: boolean; pendingLabels: string[] };
  statusLogs: Array<{ id: string; oldStatus: string | null; newStatus: string; remark: string; createdAt: string; changedByName: string | null }>;
  compliance: Compliance | null;
  isLocked: boolean;
  canComplete: boolean;
};

const emptyForm: FormState = {
  listingId: null,
  customerName: '', customerNumber: '', vehicleNumber: '', brandName: '', vehicleType: '', vehicleModel: '', hirePurchaseStatus: 'PENDING', financerName: '',
  taxStatus: 'VALID', taxValidUntil: null, fitnessStatus: 'VALID', fitnessValidUntil: null,
  insuranceStatus: 'VALID', insuranceValidUntil: null, pucStatus: 'VALID', pucValidUntil: null,
  hsrpStatus: 'NO', hsrpNumber: '', sellerName: '', sellerNumber: '', purchaserName: '', purchaserNumber: '', rtoOffice: '',
  rtoAgentName: '', rtoAgentState: '', rtoAgentCity: '', rtoAgentNumber: '', rtoExpenses: 0, rtoExpensesAdvance: 0,
  documentSendDate: null, rtoStatus: 'RTO_WORK_STARTED', noteSheet: '', vehicleMaintenanceCost: 0,
};

const STATUS_TONES: Record<Status, string> = {
  RTO_WORK_STARTED: 'border-orange-200 bg-orange-50 text-orange-800',
  RTO_WORK_IN_PROGRESS: 'border-blue-200 bg-blue-50 text-blue-800',
  RTO_WORK_FAILED: 'border-rose-200 bg-rose-50 text-rose-800',
  RTO_WORK_COMPLETED: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  DEAL_DONE: 'border-emerald-300 bg-emerald-100 text-emerald-900',
};

const inputClass = 'h-[34px] w-full rounded-lg border border-gray-200 bg-white px-2.5 text-[13px] font-medium text-gray-900 placeholder:font-normal placeholder:text-gray-400 outline-none transition focus:border-amber-500 focus:ring-2 focus:ring-amber-500/15 disabled:bg-gray-50 disabled:text-gray-500';
const labelText = (value: string) => {
  if (value === 'NOT_APPLICABLE' || value === 'NOT_REQUIRED') return 'Not Required';
  return value.replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, (char) => char.toUpperCase());
};
const dateTime = (value?: string | null) => (value ? new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(value)) : '');
const vehicleNumberInput = (value: string) => value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10);
const digitsOnly = (value: string) => value.replace(/\D/g, '').slice(0, 10);
const dateInput = (value: string | null | undefined) => (value ? String(value).slice(0, 10) : '');

const apiError = (error: unknown, fallback: string) => {
  const detail = (error as { response?: { data?: { error?: unknown } } })?.response?.data?.error;
  return typeof detail === 'string' && detail.trim() ? detail : error instanceof Error && error.message ? error.message : fallback;
};

const toFormState = (record: RtoRecord): FormState => {
  const taxStatus = normalizeValidityForEdit(record.taxStatus) as Validity;
  const fitnessStatus = normalizeValidityForEdit(record.fitnessStatus) as Validity;
  const insuranceStatus = normalizeValidityForEdit(record.insuranceStatus) as Validity;
  const pucStatus = normalizeValidityForEdit(record.pucStatus) as Validity;
  const { id: _id, rtoExpensesBalance: _balance, isLocked: _locked, ...rest } = record;
  void _id; void _balance; void _locked;
  return {
    ...emptyForm,
    ...rest,
    brandName: record.brandName || '',
    financerName: record.financerName || '',
    hsrpNumber: record.hsrpNumber || '',
    rtoStatus: normalizeRtoStatus(record.rtoStatus) as Status,
    taxStatus,
    taxValidUntil: isValidityDateRequired(taxStatus) ? record.taxValidUntil : null,
    fitnessStatus,
    fitnessValidUntil: isValidityDateRequired(fitnessStatus) ? record.fitnessValidUntil : null,
    insuranceStatus,
    insuranceValidUntil: isValidityDateRequired(insuranceStatus) ? record.insuranceValidUntil : null,
    pucStatus,
    pucValidUntil: isValidityDateRequired(pucStatus) ? record.pucValidUntil : null,
    hsrpStatus: normalizeHsrpStatus(record.hsrpStatus) as HsrpStatus,
    noteSheet: normalizeRemark(record.noteSheet),
  };
};

function Field({ label, required, children, className = '', apiFill = null }: { label: string; required?: boolean; children: ReactNode; className?: string; apiFill?: { source: string; filled?: boolean } | null }) {
  return (
    <div className={`min-w-0 ${className}`}>
      <label className="mb-1 block truncate text-[11px] font-semibold uppercase tracking-wide text-gray-500">{label}{required ? <span className="ml-0.5 text-rose-500">*</span> : null}</label>
      <ApiFillBox apiFill={apiFill}>{children}</ApiFillBox>
    </div>
  );
}

function Panel({ title, icon, aside, children, className = '' }: { title: string; icon: ReactNode; aside?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-xl border border-gray-200 bg-white shadow-xs ${className}`}>
      <header className="flex items-center justify-between gap-2 border-b border-gray-100 px-4 py-2.5">
        <h2 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-gray-800">
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-amber-500/10 text-amber-700">{icon}</span>{title}
        </h2>
        {aside}
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}

function AmountField({ value, onChange, disabled }: { value: number; onChange: (value: number) => void; disabled?: boolean }) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <input
      type="text"
      inputMode="decimal"
      placeholder="0"
      disabled={disabled}
      value={draft ?? toEditableAmount(value)}
      onChange={(event) => { const normalized = normalizeAmountInput(event.target.value); setDraft(normalized.raw); onChange(normalized.value); }}
      onBlur={() => setDraft(null)}
      className={`${inputClass} tabular-nums`}
    />
  );
}

type PendingTaskChange = { task: Task; status: string };
type PendingStatusSave = { payload: Record<string, unknown>; lockAfter: boolean };

export default function RtoWorkspace({ recordId }: { recordId?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const portal = accountsPortalBase(pathname);
  const listPath = `${portal}/accounts/rto-work-status`;
  const sellPath = `${portal}/accounts/sell-accounts`;
  const listingPath = `${portal}/listings`;
  const listingIdParam = searchParams.get('listingId')?.trim() || '';

  const currentUser = useAuthStore((state) => state.user);
  const permissions = currentUser?.permissions || [];
  const isAdmin = currentUser?.role === 'SUPER_ADMIN' || currentUser?.role === 'ADMIN';
  const canCreateRto = isAdmin || hasAnyPermission(permissions, getAccountCreatePermissions('rto-work-status'));
  const canUpdateRto = isAdmin || hasAnyPermission(permissions, getAccountUpdatePermissions('rto-work-status'));
  const canUpdateSell = isAdmin || hasAnyPermission(permissions, getAccountUpdatePermissions('sell-accounts'));
  const canUseRcApi = isAdmin || hasAnyPermission(permissions, ['rc.full.read']);

  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [saving, setSaving] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(getInitialTermsAccepted(recordId ? 'edit' : 'create'));
  const [termsOpen, setTermsOpen] = useState(false);
  const [linkedListingTitle, setLinkedListingTitle] = useState('');
  const [categories, setCategories] = useState<Array<{ id: string; name: string }>>([]);
  const [brands, setBrands] = useState<Array<{ id: string; name: string }>>([]);
  const [states, setStates] = useState<LocationOption[]>([]);
  const [pendingTaskChange, setPendingTaskChange] = useState<PendingTaskChange | null>(null);
  const [pendingStatusSave, setPendingStatusSave] = useState<PendingStatusSave | null>(null);
  const [completeOpen, setCompleteOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(!recordId);
  const [invoiceUrl, setInvoiceUrl] = useState('');

  const isCreate = !recordId;
  const isLocked = Boolean(workspace?.isLocked);
  const readOnly = isLocked || !(isCreate ? canCreateRto : canUpdateRto);

  useEffect(() => {
    let cancelled = false;
    void Promise.allSettled([api.get('/master/categories'), api.get('/master/brands')]).then(([categoryResult, brandResult]) => {
      if (cancelled) return;
      if (categoryResult.status === 'fulfilled') setCategories(categoryResult.value.data?.data || []);
      if (brandResult.status === 'fulfilled') setBrands((brandResult.value.data?.data || []).filter((item: { id?: string; name?: string }) => item.id && item.name));
    });
    void (async () => {
      try {
        const countries = await api.get<Array<{ id: string | number; name?: string }>>('/locations/countries');
        const india = (countries.data || []).find((item) => item.name?.toLowerCase() === 'india');
        if (!india) return;
        const response = await api.get<LocationOption[]>(`/locations/states/${india.id}`);
        if (!cancelled) setStates(response.data || []);
      } catch {
        if (!cancelled) setStates([]);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const applyWorkspace = useCallback((next: Workspace, resetForm = true) => {
    setWorkspace(next);
    if (resetForm) setForm(toFormState(next.record));
  }, []);

  const loadWorkspace = useCallback(async (id: string) => {
    const response = await api.get<Workspace & { success?: boolean }>(`/recruitment/admin/rto-records/${encodeURIComponent(id)}/workspace`);
    return response.data;
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setLoadError('');
      try {
        if (recordId) {
          const data = await loadWorkspace(recordId);
          if (!cancelled) applyWorkspace(data);
          return;
        }
        if (listingIdParam) {
          const existing = await api.get<{ records?: Array<{ id: string; listingId?: string | null }> }>('/recruitment/admin/rto-records')
            .then((response) => (response.data?.records || []).find((record) => record.listingId === listingIdParam))
            .catch(() => undefined);
          if (existing?.id) {
            router.replace(`${listPath}/${encodeURIComponent(existing.id)}/edit`);
            return;
          }
          const response = await api.get<{ listing?: Record<string, unknown> }>(`/listings/${encodeURIComponent(listingIdParam)}`);
          if (!response.data?.listing) throw new Error('Listing not found.');
          const prefill = getListingAccountPrefill(response.data.listing);
          if (cancelled) return;
          setLinkedListingTitle(prefill.listingTitle);
          setForm({
            ...emptyForm,
            listingId: prefill.listingId,
            customerName: prefill.ownerName || prefill.sellerName,
            customerNumber: prefill.ownerNumber || prefill.sellerNumber,
            vehicleNumber: vehicleNumberInput(prefill.vehicleNumber || ''),
            brandName: prefill.brandName,
            vehicleType: prefill.vehicleType,
            vehicleModel: prefill.vehicleModel,
            sellerName: prefill.sellerName || prefill.ownerName,
            sellerNumber: prefill.ownerNumber || prefill.sellerNumber,
          });
        }
      } catch (error) {
        if (!cancelled) setLoadError(apiError(error, 'Unable to load this RTO record.'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [applyWorkspace, listPath, listingIdParam, loadWorkspace, recordId, router]);

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((current) => ({ ...current, [key]: value }));

  const progress = useMemo(() => summarizeTransferTasks(workspace?.tasks || []), [workspace?.tasks]);
  const compliance = workspace?.compliance || null;
  const sell = workspace?.sellAccount || null;
  const linkedListingId = workspace?.record.listingId || workspace?.listing?.id || '';
  const listingListUrl = linkedListingId ? buildListingListUrl(listingPath, linkedListingId) : '';
  const savedStatus = workspace ? normalizeRtoStatus(workspace.record.rtoStatus) as Status : form.rtoStatus;

  // ---------- Record form ----------
  const buildPayload = () => ({
    ...form,
    taxValidUntil: form.taxStatus === 'VALID' ? form.taxValidUntil : null,
    fitnessValidUntil: form.fitnessStatus === 'VALID' ? form.fitnessValidUntil : null,
    insuranceValidUntil: form.insuranceStatus === 'VALID' ? form.insuranceValidUntil : null,
    pucValidUntil: form.pucStatus === 'VALID' ? form.pucValidUntil : null,
    hsrpStatus: normalizeHsrpStatus(form.hsrpStatus),
    rtoAgentName: (form.rtoAgentName || '').trim(),
    rtoAgentState: (form.rtoAgentState || '').trim(),
    rtoAgentCity: (form.rtoAgentCity || '').trim(),
    rtoExpenses: Number(form.rtoExpenses || 0),
    rtoExpensesAdvance: Number(form.rtoExpensesAdvance || 0),
    vehicleMaintenanceCost: Number(form.vehicleMaintenanceCost || 0),
  });

  const validateForm = () => {
    if (!termsAccepted) return 'Accept the Terms & Conditions to save the RTO record.';
    if (!form.customerName || !form.vehicleNumber || !form.brandName || !form.vehicleType || !form.vehicleModel || !form.sellerName || !form.purchaserName || !form.rtoOffice) {
      return 'Please fill all required fields (customer, vehicle, brand, category, model, seller, purchaser, RTO office).';
    }
    const missingValidity = ([
      ['Tax', form.taxStatus, form.taxValidUntil],
      ['Fitness', form.fitnessStatus, form.fitnessValidUntil],
      ['Insurance', form.insuranceStatus, form.insuranceValidUntil],
      ['PUC', form.pucStatus, form.pucValidUntil],
    ] as const).find(([, status, date]) => !status || (status === 'VALID' && !date));
    if (missingValidity) return `${missingValidity[0]} validity date is required when marked as Valid.`;
    if (Number(form.rtoExpensesAdvance || 0) > Number(form.rtoExpenses || 0)) return 'RTO expenses advance cannot exceed RTO expenses.';
    return null;
  };

  const persistRecord = async (payload: Record<string, unknown>, lockAfter = false) => {
    setSaving(true);
    try {
      if (isCreate) {
        const response = await api.post<{ record?: { id?: string } }>('/recruitment/admin/rto-records', payload);
        const id = response.data?.record?.id;
        if (!id) throw new Error('RTO record was not returned by the server.');
        toast.success('RTO record created.');
        router.replace(`${listPath}/${encodeURIComponent(id)}/edit`);
        return;
      }
      await api.put(`/recruitment/admin/rto-records/${encodeURIComponent(recordId!)}`, payload);
      if (lockAfter) await api.post(`/recruitment/admin/rto-records/${encodeURIComponent(recordId!)}/lock`);
      applyWorkspace(await loadWorkspace(recordId!));
      setPendingStatusSave(null);
      toast.success(lockAfter ? 'Deal done. The record is now locked.' : 'RTO record saved.');
    } catch (error) {
      toast.error(apiError(error, 'Unable to save the RTO record.'));
    } finally {
      setSaving(false);
    }
  };

  const saveForm = async () => {
    const error = validateForm();
    if (error) { toast.error(error); return; }
    const payload = buildPayload();
    if (!isCreate && form.rtoStatus !== savedStatus) {
      if (form.rtoStatus === 'DEAL_DONE' && workspace?.record.sellAccountId) {
        toast.info('Use "Complete Sale" below to mark this deal done — it issues the invoice and locks the records.');
        return;
      }
      setPendingStatusSave({ payload, lockAfter: form.rtoStatus === 'DEAL_DONE' });
      return;
    }
    await persistRecord(payload);
  };

  const applySuggestions = () => {
    if (!compliance?.suggested) return;
    const suggested = compliance.suggested;
    setForm((current) => ({
      ...current,
      ...(suggested.taxStatus ? { taxStatus: suggested.taxStatus as Validity, taxValidUntil: suggested.taxValidUntil || null } : {}),
      ...(suggested.insuranceStatus ? { insuranceStatus: suggested.insuranceStatus as Validity, insuranceValidUntil: suggested.insuranceValidUntil || null } : {}),
      ...(suggested.fitnessStatus ? { fitnessStatus: suggested.fitnessStatus as Validity, fitnessValidUntil: suggested.fitnessValidUntil || null } : {}),
      ...(suggested.pucStatus ? { pucStatus: suggested.pucStatus as Validity, pucValidUntil: suggested.pucValidUntil || null } : {}),
      ...(suggested.hirePurchaseStatus ? { hirePurchaseStatus: suggested.hirePurchaseStatus as HirePurchase } : {}),
      ...(suggested.financerName ? { financerName: suggested.financerName } : {}),
    }));
    setFormOpen(true);
    toast.info('RC dates copied into the record. Review and click Save Record.');
  };

  // ---------- Tasks ----------
  const changeTask = async (remark: string) => {
    if (!pendingTaskChange || !recordId) return;
    setBusy('task');
    try {
      const response = await api.patch<Workspace>(
        `/recruitment/admin/rto-records/${encodeURIComponent(recordId)}/transfer-tasks/${encodeURIComponent(pendingTaskChange.task.id)}`,
        { status: pendingTaskChange.status, remark },
      );
      applyWorkspace(response.data, false);
      setForm((current) => ({ ...current, rtoStatus: normalizeRtoStatus(response.data.record.rtoStatus) as Status }));
      setPendingTaskChange(null);
      toast.success(`${pendingTaskChange.task.label}: ${getTransferTaskStatus(pendingTaskChange.status).label}`);
    } catch (error) {
      toast.error(apiError(error, 'Unable to update the task.'));
    } finally {
      setBusy(null);
    }
  };

  const createChecklist = async () => {
    if (!recordId) return;
    setBusy('init');
    try {
      const response = await api.post<Workspace>(`/recruitment/admin/rto-records/${encodeURIComponent(recordId)}/transfer-tasks`);
      applyWorkspace(response.data, false);
      toast.success('Ownership transfer checklist created.');
    } catch (error) {
      toast.error(apiError(error, 'Unable to create the checklist.'));
    } finally {
      setBusy(null);
    }
  };

  const runCompliance = async (mode: 'record' | 'rc-api') => {
    if (!recordId) return;
    if (mode === 'rc-api' && !window.confirm('Fetch live RC details for this vehicle? This uses one RC verification from the API wallet (results are cached for 24 hours).')) return;
    setBusy(mode);
    try {
      const response = await api.post<Workspace>(`/recruitment/admin/rto-records/${encodeURIComponent(recordId)}/compliance${mode === 'rc-api' ? '/rc-api' : ''}`);
      applyWorkspace(response.data, false);
      toast.success(response.data.compliance?.canTransfer ? 'No blocking issue found.' : 'Transfer blockers found — see the reasons.');
    } catch (error) {
      toast.error(apiError(error, 'Compliance check failed.'));
    } finally {
      setBusy(null);
    }
  };

  const downloadCertificate = async () => {
    if (!recordId) return;
    setBusy('certificate');
    try {
      await downloadAuthedFile(`/recruitment/admin/rto-records/${encodeURIComponent(recordId)}/transfer-certificate`, `Ownership-Transfer-${form.vehicleNumber || recordId}.pdf`);
    } catch (error) {
      toast.error(await readBlobErrorMessage(error, 'Unable to download the transfer summary.'));
    } finally {
      setBusy(null);
    }
  };

  const completeSale = async (remark: string) => {
    if (!sell) return;
    setBusy('complete');
    try {
      const response = await api.post<{ delivery?: { invoiceUrl?: string; anySent?: boolean; channels?: Array<{ channel: string; sent: boolean; status: string }> } }>(
        `/recruitment/admin/sell-accounts/${encodeURIComponent(sell.id)}/complete`,
        { remark },
      );
      setCompleteOpen(false);
      setInvoiceUrl(response.data?.delivery?.invoiceUrl || '');
      applyWorkspace(await loadWorkspace(recordId!));
      if (response.data?.delivery?.anySent) toast.success('Sale completed. Invoice sent to the customer.');
      else toast.warn('Sale completed and locked, but the invoice could not be sent. Check WhatsApp/SMS automation, then resend from the Sold Vehicle page.');
    } catch (error) {
      toast.error(apiError(error, 'Unable to complete the sale.'));
    } finally {
      setBusy(null);
    }
  };

  if (loading) return <BrandLoader variant="section" size="sm" bg="light" text="Loading RTO work..." />;
  if (loadError) {
    return (
      <div className="mx-auto max-w-lg rounded-xl border border-rose-200 bg-rose-50 p-6 text-center">
        <p className="text-sm font-semibold text-rose-700">{loadError}</p>
        <button type="button" onClick={() => router.push(listPath)} className="mt-4 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm ring-1 ring-gray-200">Back to RTO Work</button>
      </div>
    );
  }

  const statusTone = STATUS_TONES[savedStatus] || STATUS_TONES.RTO_WORK_IN_PROGRESS;
  const dealConfig = sell ? DEAL_STATUS_CONFIG[sell.dealStatus] || DEAL_STATUS_CONFIG.OPEN : null;
  const DealIcon = dealConfig?.icon;
  // Vehicle/party fields are prefilled from the linked Sold Vehicle or listing; validity fields from the RC API.
  const prefillApiFill = workspace?.record.sellAccountId
    ? { source: 'the Sold Vehicle record', filled: true }
    : form.listingId ? { source: 'the linked listing', filled: true } : null;
  const rcApiFill = (key: keyof Compliance['suggested']) => (isCreate ? null : {
    source: 'the RC API (Transfer Readiness → Fetch from RC API / Apply RC dates)',
    filled: Boolean(compliance?.suggested?.[key]) && String(form[key as keyof FormState] ?? '') === String(compliance?.suggested?.[key]),
  });
  const validityOptions = (key: 'taxStatus' | 'fitnessStatus' | 'insuranceStatus' | 'pucStatus') =>
    (getValidityOptions(form[key], key === 'taxStatus') as Array<{ value: string; label: string }>).map((option) => ({ id: option.value, name: option.label }));

  const recordForm = (
    <div className="space-y-3">
      {linkedListingTitle ? <p className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-800">Prefilled from listing “{linkedListingTitle}”. Review before saving.</p> : null}
      {prefillApiFill || !isCreate ? <ApiFillLegend>fields can be filled from the API (linked record / RC API). Others are entered manually.</ApiFillLegend> : null}
      <div className="grid grid-cols-2 gap-x-3 gap-y-2.5 md:grid-cols-3 xl:grid-cols-6">
        <Field label="Customer name" required className="col-span-2 md:col-span-1" apiFill={prefillApiFill}><input disabled={readOnly} className={inputClass} value={form.customerName} onChange={(event) => update('customerName', event.target.value.toUpperCase())} /></Field>
        <Field label="Customer number" apiFill={prefillApiFill}><input disabled={readOnly} className={inputClass} inputMode="numeric" value={form.customerNumber} onChange={(event) => update('customerNumber', digitsOnly(event.target.value))} /></Field>
        <Field label="Registration no." required apiFill={prefillApiFill}><input disabled={readOnly} className={`${inputClass} uppercase`} value={form.vehicleNumber} onChange={(event) => update('vehicleNumber', vehicleNumberInput(event.target.value))} /></Field>
        <Field label="Category" required apiFill={prefillApiFill}>
          <SearchableSelect size="sm" disabled={readOnly} options={categories.map((item) => ({ id: item.name, name: item.name }))} value={form.vehicleType} displayValue={form.vehicleType} placeholder="Select" searchable onChange={(option) => update('vehicleType', String(option.id))} className="w-full" />
        </Field>
        <Field label="Brand" required apiFill={prefillApiFill}>
          <SearchableSelect size="sm" disabled={readOnly} options={brands} value={form.brandName} displayValue={form.brandName} placeholder="Select" searchable onChange={(option) => update('brandName', option.name)} className="w-full" />
        </Field>
        <Field label="Model" required apiFill={prefillApiFill}><input disabled={readOnly} className={inputClass} value={form.vehicleModel} onChange={(event) => update('vehicleModel', event.target.value.toUpperCase())} /></Field>
      </div>

      <div className="rounded-lg border border-gray-100 bg-gray-50/60 p-3">
        <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-gray-600">Document validity</p>
        <div className="grid grid-cols-2 gap-x-3 gap-y-2.5 md:grid-cols-3 xl:grid-cols-6 items-start">
          <Field label="Hire purchase" required apiFill={rcApiFill('hirePurchaseStatus')}>
            <div className="space-y-1.5">
              <SearchableSelect size="sm" disabled={readOnly} options={(['PENDING', 'ACTIVE', 'TERMINATED', 'NOT_APPLICABLE'] as HirePurchase[]).map((item) => ({ id: item, name: labelText(item) }))} value={form.hirePurchaseStatus} displayValue={labelText(form.hirePurchaseStatus)} searchable={false} onChange={(option) => update('hirePurchaseStatus', String(option.id) as HirePurchase)} className="w-full" />
              {(['ACTIVE', 'TERMINATED'] as string[]).includes(form.hirePurchaseStatus) ? (
                <input disabled={readOnly} className={`${inputClass} text-xs`} placeholder="Financer / Bank name" value={form.financerName || ''} onChange={(event) => update('financerName', event.target.value)} />
              ) : null}
            </div>
          </Field>
          {([['Tax', 'taxStatus', 'taxValidUntil'], ['Insurance', 'insuranceStatus', 'insuranceValidUntil'], ['PUC', 'pucStatus', 'pucValidUntil'], ['Fitness', 'fitnessStatus', 'fitnessValidUntil']] as const).map(([title, statusKey, dateKey]) => (
            <Field key={statusKey} label={title} required apiFill={rcApiFill(statusKey)}>
              <div className="space-y-1.5">
                <SearchableSelect size="sm" disabled={readOnly} options={validityOptions(statusKey)} value={form[statusKey]} displayValue={validityOptions(statusKey).find((option) => option.id === form[statusKey])?.name || ''} searchable={false} onChange={(option) => { const next = String(option.id) as Validity; update(statusKey, next); if (!isValidityDateRequired(next)) update(dateKey, null); }} className="w-full" />
                {isValidityDateRequired(form[statusKey]) ? (
                  <input type="date" disabled={readOnly} className={`${inputClass} text-xs`} value={dateInput(form[dateKey])} onChange={(event) => update(dateKey, event.target.value || null)} aria-label={`${title} valid until`} />
                ) : null}
              </div>
            </Field>
          ))}
          <Field label="HSRP">
            <SearchableSelect size="sm" disabled={readOnly} options={(getHsrpStatusOptions() as Array<{ value: string; label: string }>).map((option) => ({ id: option.value, name: option.label }))} value={form.hsrpStatus} displayValue={(getHsrpStatusOptions() as Array<{ value: string; label: string }>).find((option) => option.value === form.hsrpStatus)?.label || ''} searchable={false} onChange={(option) => update('hsrpStatus', normalizeHsrpStatus(option.id) as HsrpStatus)} className="w-full" />
          </Field>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-x-3 gap-y-2.5 md:grid-cols-3 xl:grid-cols-6">
        <Field label="Seller (1st owner)" required apiFill={prefillApiFill}><input disabled={readOnly} className={inputClass} value={form.sellerName} onChange={(event) => update('sellerName', event.target.value.toUpperCase())} /></Field>
        <Field label="Seller number" apiFill={prefillApiFill}><input disabled={readOnly} className={inputClass} inputMode="numeric" value={form.sellerNumber} onChange={(event) => update('sellerNumber', digitsOnly(event.target.value))} /></Field>
        <Field label="Purchaser (2nd owner)" required apiFill={workspace?.record.sellAccountId ? prefillApiFill : null}><input disabled={readOnly} className={inputClass} value={form.purchaserName} onChange={(event) => update('purchaserName', event.target.value.toUpperCase())} /></Field>
        <Field label="Purchaser number" apiFill={workspace?.record.sellAccountId ? prefillApiFill : null}><input disabled={readOnly} className={inputClass} inputMode="numeric" value={form.purchaserNumber} onChange={(event) => update('purchaserNumber', digitsOnly(event.target.value))} /></Field>
        <Field label="RTO office" required><input disabled={readOnly} className={inputClass} value={form.rtoOffice} onChange={(event) => update('rtoOffice', event.target.value.toUpperCase())} /></Field>
        <Field label="Doc. send date"><input type="date" disabled={readOnly} className={inputClass} value={dateInput(form.documentSendDate)} onChange={(event) => update('documentSendDate', event.target.value || null)} /></Field>
        <Field label="RTO agent"><input disabled={readOnly} className={inputClass} value={form.rtoAgentName} onChange={(event) => update('rtoAgentName', event.target.value.toUpperCase())} /></Field>
        <Field label="Agent number"><input disabled={readOnly} className={inputClass} inputMode="numeric" value={form.rtoAgentNumber} onChange={(event) => update('rtoAgentNumber', digitsOnly(event.target.value))} /></Field>
        <Field label="Agent state">
          <SearchableSelect size="sm" disabled={readOnly} options={states} value={form.rtoAgentState} displayValue={form.rtoAgentState} placeholder="Select" searchable onChange={(option) => setForm((current) => ({ ...current, rtoAgentState: option.name, rtoAgentCity: '' }))} className="w-full" />
        </Field>
        <Field label="Agent city"><CitySelect disabled={readOnly} stateName={form.rtoAgentState} states={states} value={form.rtoAgentCity} onChange={(value) => update('rtoAgentCity', value)} /></Field>
        <Field label="RTO expenses ₹"><AmountField disabled={readOnly} value={form.rtoExpenses} onChange={(value) => update('rtoExpenses', value)} /></Field>
        <Field label="Advance paid ₹"><AmountField disabled={readOnly} value={form.rtoExpensesAdvance} onChange={(value) => update('rtoExpensesAdvance', value)} /></Field>
        <Field label="Maintenance cost ₹"><AmountField disabled={readOnly} value={form.vehicleMaintenanceCost} onChange={(value) => update('vehicleMaintenanceCost', value)} /></Field>
        <Field label="RTO status" required>
          <SearchableSelect size="sm" disabled={readOnly} options={(getRtoStatusOptions() as Array<{ value: string; label: string }>).map((option) => ({ id: option.value, name: option.label }))} value={form.rtoStatus} displayValue={getRtoStatusLabel(form.rtoStatus)} searchable={false} onChange={(option) => update('rtoStatus', normalizeRtoStatus(option.id) as Status)} className="w-full" />
        </Field>
        <Field label="Note sheet" className="col-span-2 md:col-span-2 xl:col-span-2">
          <input disabled={readOnly} className={inputClass} maxLength={5000} value={form.noteSheet || ''} placeholder="Follow-up notes, document updates…" onChange={(event) => update('noteSheet', event.target.value)} />
        </Field>
      </div>

      {!readOnly ? (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 pt-3">
          <label className="flex cursor-pointer items-start gap-2 text-xs text-gray-700">
            <input type="checkbox" checked={termsAccepted} onChange={(event) => setTermsAccepted(event.target.checked)} className="mt-0.5 h-4 w-4 rounded border-gray-300 text-amber-600 focus:ring-amber-500" />
            <span>I confirm these customer, vehicle and RTO details are accurate and agree to the <button type="button" onClick={() => setTermsOpen(true)} className="font-bold text-amber-800 underline underline-offset-2">Terms &amp; Conditions</button>.</span>
          </label>
          <button type="button" disabled={saving || !termsAccepted} onClick={() => void saveForm()} className="inline-flex items-center gap-1.5 rounded-lg bg-[#FFC107] px-4 py-2 text-xs font-extrabold text-gray-950 shadow-sm hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-50">
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}{isCreate ? 'Save Record' : 'Save Record'}
          </button>
        </div>
      ) : null}
    </div>
  );

  // ---------- Create mode: just the compact form ----------
  if (isCreate) {
    return (
      <div className="mx-auto w-full max-w-[1600px] space-y-3 pb-12">
        <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-xs">
          <button type="button" onClick={() => router.push(listPath)} className="flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50" aria-label="Back"><ArrowLeft className="h-4 w-4" /></button>
          <div>
            <h1 className="text-lg font-extrabold text-gray-950">Add RTO Record</h1>
            <p className="text-xs text-gray-500">After saving, the ownership-transfer workspace opens for this vehicle.</p>
          </div>
        </div>
        <Panel title="RTO Record" icon={<FileText className="h-3.5 w-3.5" />}>{recordForm}</Panel>
        {termsOpen ? <RtoTermsModal onClose={() => setTermsOpen(false)} /> : null}
      </div>
    );
  }

  const record = workspace!.record;
  const blockers = compliance?.blockers || [];
  const warnings = compliance?.warnings || [];

  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-3 pb-12">
      {/* Header */}
      <div className="rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <button type="button" onClick={() => router.push(listPath)} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50" aria-label="Back"><ArrowLeft className="h-4 w-4" /></button>
            {listingListUrl ? (
              <button
                type="button"
                onClick={() => router.push(listingListUrl)}
                className="group min-w-0 cursor-pointer text-left"
                title="Open this vehicle in Platform Listings"
                aria-label={`Open ${record.vehicleNumber || 'vehicle'} in Platform Listings`}
              >
                <h1 className="truncate text-lg font-extrabold text-gray-950 group-hover:text-amber-700">
                  RTO Transfer · <span className="text-amber-700">{record.vehicleNumber}</span>
                </h1>
                <p className="truncate text-xs font-medium text-gray-500 group-hover:text-gray-700">
                  {[record.brandName, record.vehicleModel, record.vehicleType].filter(Boolean).join(' · ')}
                  {sell ? <> · Deal <span className="font-semibold text-blue-600 group-hover:underline">{sell.recordNumber}</span></> : null}
                </p>
              </button>
            ) : (
              <div className="min-w-0">
                <h1 className="truncate text-lg font-extrabold text-gray-950">
                  RTO Transfer · <span className="text-amber-700">{record.vehicleNumber}</span>
                </h1>
                <p className="truncate text-xs font-medium text-gray-500">
                  {[record.brandName, record.vehicleModel, record.vehicleType].filter(Boolean).join(' · ')}
                </p>
              </div>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-bold ${statusTone}`}>{getRtoStatusLabel(savedStatus)}</span>
            {dealConfig && DealIcon ? (
              <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-bold ${dealConfig.bg} ${dealConfig.text} ${dealConfig.border}`} title="Final deal status">
                <DealIcon className="h-3.5 w-3.5" />Deal: {dealConfig.label}
              </span>
            ) : null}
            {isLocked ? <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-bold text-slate-700"><LockKeyhole className="h-3.5 w-3.5" />Locked</span> : null}
          </div>
        </div>
        {progress.total ? (
          <div className="mt-3 flex items-center gap-3">
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-gray-100">
              <div className={`h-full rounded-full transition-all ${progress.allDone ? 'bg-emerald-500' : progress.issues ? 'bg-orange-500' : 'bg-amber-500'}`} style={{ width: `${progress.percent}%` }} />
            </div>
            <span className="shrink-0 text-sm font-extrabold tabular-nums text-gray-900">{progress.done}/{progress.total} done</span>
          </div>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-3">
          {/* Tasks */}
          <Panel
            title="Ownership Transfer Tasks"
            icon={<ClipboardCheck className="h-3.5 w-3.5" />}
            aside={<span className="text-[11px] font-medium text-gray-400">Every status change needs a remark</span>}
          >
            {workspace!.tasks.length ? (
              <ul className="divide-y divide-gray-100">
                {workspace!.tasks.map((task) => {
                  const status = getTransferTaskStatus(task.status);
                  const done = task.status === 'TRANSFERRED' || task.status === 'NOT_REQUIRED';
                  const expanded = expandedTaskId === task.id;
                  return (
                    <li key={task.id} className="py-2.5 first:pt-0 last:pb-0">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                        <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${done ? 'bg-emerald-100 text-emerald-700' : task.status === 'ISSUE_REPORTED' || task.status === 'DOCUMENT_EXPIRED' ? 'bg-rose-100 text-rose-700' : 'bg-gray-100 text-gray-500'}`}>
                          {done ? <Check className="h-4 w-4" /> : task.status === 'ISSUE_REPORTED' || task.status === 'DOCUMENT_EXPIRED' ? <AlertTriangle className="h-3.5 w-3.5" /> : <CircleDashed className="h-4 w-4" />}
                        </span>
                        <div className="min-w-[160px] flex-1">
                          <p className="text-sm font-bold text-gray-900">{task.label}{task.isOptional ? <span className="ml-1.5 rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold text-gray-500">Optional</span> : null}</p>
                          {task.remark ? <p className="line-clamp-2 text-xs text-gray-600">{task.remark}</p> : null}
                          <p className="text-[10px] text-gray-400">{[task.updatedByName, dateTime(task.updatedAt)].filter(Boolean).join(' · ')}</p>
                        </div>
                        <span className={`rounded-full border px-2 py-0.5 text-[11px] font-bold ${TASK_TONE_CLASSES[status.tone as keyof typeof TASK_TONE_CLASSES]}`}>{status.label}</span>
                        <div className="flex items-center gap-1.5">
                          {!isLocked && canUpdateRto && task.status !== 'TRANSFERRED' ? (
                            <button type="button" onClick={() => setPendingTaskChange({ task, status: 'TRANSFERRED' })} className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-[11px] font-bold text-white hover:bg-emerald-700">
                              <CheckCircle2 className="h-3.5 w-3.5" />Transferred
                            </button>
                          ) : null}
                          {!isLocked && canUpdateRto ? (
                            <div className="w-40">
                              <SearchableSelect
                                size="sm"
                                options={TRANSFER_TASK_STATUS_OPTIONS.filter((option) => option.value !== task.status).map((option) => ({ id: option.value, name: option.label }))}
                                value=""
                                displayValue="Change status…"
                                searchable={false}
                                onChange={(option) => setPendingTaskChange({ task, status: String(option.id) })}
                                className="w-full"
                              />
                            </div>
                          ) : null}
                          <button type="button" onClick={() => setExpandedTaskId(expanded ? null : task.id)} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700" title="History" aria-label={`${task.label} history`}>
                            <History className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                      {expanded ? (
                        <ol className="ml-10 mt-2 space-y-1.5 border-l border-gray-200 pl-3">
                          {task.logs.map((log) => (
                            <li key={log.id} className="text-xs">
                              <span className="font-semibold text-gray-800">{log.oldStatus ? `${getTransferTaskStatus(log.oldStatus).label} → ` : ''}{getTransferTaskStatus(log.newStatus).label}</span>
                              <span className="text-gray-400"> · {[log.changedByName, dateTime(log.createdAt)].filter(Boolean).join(' · ')}</span>
                              <p className="text-gray-600">{log.remark}</p>
                            </li>
                          ))}
                        </ol>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <div className="rounded-lg border border-dashed border-gray-300 p-4 text-center">
                <p className="text-sm text-gray-600">No transfer checklist for this record yet.</p>
                {!isLocked && canUpdateRto ? (
                  <button type="button" disabled={busy === 'init'} onClick={() => void createChecklist()} className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-60">
                    {busy === 'init' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}Create checklist
                  </button>
                ) : null}
              </div>
            )}
          </Panel>

          {/* Record form */}
          <section className="rounded-xl border border-gray-200 bg-white shadow-xs">
            <button type="button" onClick={() => setFormOpen((open) => !open)} className="flex w-full items-center justify-between gap-2 px-4 py-2.5 text-left">
              <span className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-gray-800">
                <span className="flex h-6 w-6 items-center justify-center rounded-md bg-amber-500/10 text-amber-700"><FileText className="h-3.5 w-3.5" /></span>
                RTO Record Details
              </span>
              <span className="flex items-center gap-2 text-[11px] font-medium text-gray-500">
                {record.rtoOffice ? `RTO ${record.rtoOffice}` : 'RTO office not set'}{record.rtoAgentName ? ` · ${record.rtoAgentName}` : ''}
                <ChevronDown className={`h-4 w-4 transition ${formOpen ? 'rotate-180' : ''}`} />
              </span>
            </button>
            {formOpen ? <div className="border-t border-gray-100 p-4">{recordForm}</div> : null}
          </section>
        </div>

        {/* Right rail */}
        <div className="space-y-3 xl:sticky xl:top-0 xl:self-start">
          {/* Completion */}
          <Panel title="Final Step" icon={<Receipt className="h-3.5 w-3.5" />}>
            {sell?.completedAt ? (
              <div className="space-y-2">
                <p className="flex items-center gap-1.5 text-sm font-bold text-emerald-700"><CheckCircle2 className="h-4 w-4" />Sale completed & locked</p>
                <p className="text-xs text-gray-600">Invoice <b>{sell.invoiceNumber}</b>{sell.invoiceSentAt ? ` · sent ${dateTime(sell.invoiceSentAt)}` : ' · not sent yet'}</p>
                <div className="flex flex-wrap gap-1.5">
                  {(sell.invoiceDelivery?.channels || []).map((channel) => (
                    <span key={channel.channel} title={channel.detail || undefined} className={`rounded-full border px-2 py-0.5 text-[11px] font-bold ${channel.sent ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-rose-200 bg-rose-50 text-rose-700'}`}>{channel.channel === 'WHATSAPP' ? 'WhatsApp' : 'SMS'}: {channel.sent ? 'Sent' : labelText(channel.status)}</span>
                  ))}
                </div>
                {invoiceUrl ? (
                  <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-2 py-1.5">
                    <p className="min-w-0 flex-1 truncate font-mono text-[11px] text-gray-600">{invoiceUrl}</p>
                    <button type="button" onClick={() => { void navigator.clipboard?.writeText(invoiceUrl); toast.success('Link copied.'); }} className="rounded p-1 text-gray-500 hover:bg-white" aria-label="Copy invoice link"><Copy className="h-3.5 w-3.5" /></button>
                  </div>
                ) : null}
                <div className="flex flex-wrap gap-2">
                  <button type="button" disabled={busy === 'certificate'} onClick={() => void downloadCertificate()} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-bold text-gray-800 hover:bg-gray-50"><Download className="h-3.5 w-3.5" />Transfer summary</button>
                  <button type="button" onClick={() => router.push(`${sellPath}/${encodeURIComponent(sell.id)}`)} className="inline-flex items-center gap-1.5 rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-bold text-white"><Receipt className="h-3.5 w-3.5" />Invoice & deal</button>
                </div>
              </div>
            ) : progress.allDone ? (
              <div className="space-y-2.5">
                <p className="flex items-center gap-1.5 text-sm font-bold text-emerald-700"><CheckCircle2 className="h-4 w-4" />All {progress.total} transfers done</p>
                <button type="button" disabled={busy === 'certificate'} onClick={() => void downloadCertificate()} className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-xs font-bold text-gray-800 hover:bg-gray-50 disabled:opacity-60">
                  {busy === 'certificate' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}Download transfer summary (PDF)
                </button>
                {sell ? (
                  <>
                    {sell.payments.purchaserPaymentStatus !== 'FULL' ? (
                      <p className="rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2 text-xs font-medium text-amber-900">Customer balance {formatInr(sell.payments.purchaserBalance)} is pending. Record the payment on the Sold Vehicle page and convert it to a real money receipt to complete the sale.</p>
                    ) : null}
                    {canUpdateSell && canUpdateRto && !isLocked ? (
                      <button type="button" disabled={!workspace!.canComplete} onClick={() => setCompleteOpen(true)} className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-extrabold text-white shadow-sm hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50">
                        <Receipt className="h-3.5 w-3.5" />Complete Sale & Send Invoice
                      </button>
                    ) : null}
                    <p className="text-[11px] text-gray-500">Locks the Sold Vehicle and RTO records, issues the invoice and sends it to {sell.purchaserName || 'the customer'} on WhatsApp (PDF) and SMS (link).</p>
                  </>
                ) : <p className="text-xs text-gray-500">This RTO record is not linked to a Sold Vehicle, so no invoice is issued.</p>}
              </div>
            ) : (
              <div className="space-y-1.5">
                <p className="text-xs text-gray-600">Complete every task (Transferred or Not required) to finish the sale.</p>
                {progress.total ? (
                  <ul className="space-y-1">
                    {workspace!.tasks.filter((task) => task.status !== 'TRANSFERRED' && task.status !== 'NOT_REQUIRED').map((task) => (
                      <li key={task.id} className="flex items-center justify-between gap-2 text-xs">
                        <span className="font-semibold text-gray-800">{task.label}</span>
                        <span className="text-gray-500">{getTransferTaskStatus(task.status).label}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            )}
          </Panel>

          {/* Compliance */}
          <Panel
            title="Transfer Readiness"
            icon={compliance?.canTransfer === false ? <ShieldAlert className="h-3.5 w-3.5" /> : <ShieldCheck className="h-3.5 w-3.5" />}
            aside={compliance ? <span className="text-[10px] font-medium text-gray-400">{compliance.source === 'RC_API' ? 'RC API' : compliance.source === 'LISTING_VERIFICATION' ? 'Listing RC' : 'Saved data'} · {dateTime(compliance.checkedAt)}</span> : null}
          >
            {compliance ? (
              <div className="space-y-2">
                <div className={`rounded-lg px-3 py-2 text-xs font-bold ${compliance.canTransfer ? 'bg-emerald-50 text-emerald-800' : 'bg-rose-50 text-rose-800'}`}>
                  {compliance.canTransfer ? 'No blocking issue — transfer can proceed.' : `Transfer will be blocked — ${blockers.length} issue${blockers.length === 1 ? '' : 's'} to fix first.`}
                </div>
                {[...blockers, ...warnings].map((check) => (
                  <div key={`${check.key}-${check.level}`} className={`rounded-lg border px-2.5 py-2 ${check.level === 'BLOCK' ? 'border-rose-200 bg-rose-50/60' : 'border-amber-200 bg-amber-50/60'}`}>
                    <p className={`text-xs font-bold ${check.level === 'BLOCK' ? 'text-rose-800' : 'text-amber-900'}`}>{check.label}</p>
                    <p className="text-xs text-gray-700">{check.message}</p>
                    {check.action ? <p className="mt-0.5 text-[11px] font-medium text-gray-500">→ {check.action}</p> : null}
                  </div>
                ))}
                {compliance.checks.filter((check) => check.level === 'OK').length ? (
                  <p className="text-[11px] text-gray-500">OK: {compliance.checks.filter((check) => check.level === 'OK').map((check) => check.label).join(', ')}</p>
                ) : null}
              </div>
            ) : <p className="text-xs text-gray-500">Not checked yet.</p>}
            {!isLocked && canUpdateRto ? (
              <div className="mt-2.5 flex flex-wrap gap-2">
                <button type="button" disabled={busy !== null} onClick={() => void runCompliance('record')} className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1.5 text-[11px] font-bold text-gray-700 hover:bg-gray-50 disabled:opacity-60">
                  {busy === 'record' ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}Re-check{workspace!.listing?.hasRcVerification ? ' (+ listing RC)' : ''}
                </button>
                {canUseRcApi ? (
                  <button type="button" disabled={busy !== null} onClick={() => void runCompliance('rc-api')} className="inline-flex items-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-[11px] font-bold text-blue-800 hover:bg-blue-100 disabled:opacity-60">
                    {busy === 'rc-api' ? <Loader2 className="h-3 w-3 animate-spin" /> : <ShieldCheck className="h-3 w-3" />}Fetch from RC API
                  </button>
                ) : null}
                {compliance && Object.keys(compliance.suggested || {}).length ? (
                  <button type="button" onClick={applySuggestions} className="inline-flex items-center gap-1 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[11px] font-bold text-amber-900 hover:bg-amber-100">
                    <Wand2 className="h-3 w-3" />Apply RC dates
                  </button>
                ) : null}
              </div>
            ) : null}
          </Panel>

          {/* Deal parties */}
          {sell ? (
            <Panel title="Deal" icon={<Receipt className="h-3.5 w-3.5" />}>
              <div className="space-y-1.5 text-xs">
                <div className="flex items-start justify-between gap-2"><span className="text-gray-500">Bought from ({getSourceTypeLabel(sell.sourceType)})</span><span className="text-right font-semibold text-gray-900">{sell.sellerName}<br /><span className="font-normal text-gray-500">{[sell.sellerCity, sell.sellerState].filter(Boolean).join(', ')}</span></span></div>
                <div className="flex items-center justify-center text-gray-300"><ArrowRight className="h-3.5 w-3.5 rotate-90" /></div>
                <div className="flex items-start justify-between gap-2"><span className="text-gray-500">Broker</span><span className="text-right font-semibold text-gray-900">{JCB_EXCHANGE_COMPANY_NAME}<br /><span className="font-normal text-gray-500">{[sell.brokerName, sell.brokerNumber].filter(Boolean).join(' · ')}</span></span></div>
                <div className="flex items-center justify-center text-gray-300"><ArrowRight className="h-3.5 w-3.5 rotate-90" /></div>
                <div className="flex items-start justify-between gap-2"><span className="text-gray-500">Sold to</span><span className="text-right font-semibold text-gray-900">{sell.purchaserName}<br /><span className="font-normal text-gray-500">{[sell.purchaserNumber, [sell.purchaserCity, sell.purchaserState].filter(Boolean).join(', ')].filter(Boolean).join(' · ')}</span></span></div>
                <div className="mt-2 flex justify-between border-t border-gray-100 pt-2"><span className="text-gray-500">Customer paid</span><span className="font-bold tabular-nums text-gray-900">{formatInr(sell.payments.purchaserReceived)} / {formatInr(sell.payments.customerCashReceivable)}</span></div>
              </div>
            </Panel>
          ) : null}

          {/* Activity */}
          {workspace!.statusLogs.length ? (
            <Panel title="Status Activity" icon={<History className="h-3.5 w-3.5" />}>
              <ol className="max-h-64 space-y-2 overflow-y-auto pr-1">
                {workspace!.statusLogs.map((log) => (
                  <li key={log.id} className="text-xs">
                    <p className="font-semibold text-gray-800">{log.oldStatus ? `${getRtoStatusLabel(log.oldStatus)} → ` : ''}{getRtoStatusLabel(log.newStatus)}</p>
                    <p className="text-gray-600">{log.remark}</p>
                    <p className="text-[10px] text-gray-400">{[log.changedByName, dateTime(log.createdAt)].filter(Boolean).join(' · ')}</p>
                  </li>
                ))}
              </ol>
            </Panel>
          ) : null}
        </div>
      </div>

      {pendingTaskChange ? (
        <RemarkDialog
          title={`${pendingTaskChange.task.label} → ${getTransferTaskStatus(pendingTaskChange.status).label}`}
          description={getTransferTaskStatus(pendingTaskChange.status).hint}
          confirmLabel="Update task"
          tone={pendingTaskChange.status === 'TRANSFERRED' ? 'emerald' : pendingTaskChange.status === 'ISSUE_REPORTED' ? 'rose' : 'amber'}
          busy={busy === 'task'}
          onCancel={() => setPendingTaskChange(null)}
          onConfirm={(remark) => changeTask(remark)}
        />
      ) : null}

      {pendingStatusSave ? (
        <RemarkDialog
          title={`Change RTO status to "${getRtoStatusLabel(String(pendingStatusSave.payload.rtoStatus))}"`}
          description={pendingStatusSave.lockAfter ? 'Deal Done locks this record: nobody can edit, delete or change its status afterwards.' : 'The remark is saved in the status activity.'}
          confirmLabel={pendingStatusSave.lockAfter ? 'Save & lock' : 'Save'}
          busy={saving}
          onCancel={() => setPendingStatusSave(null)}
          onConfirm={(remark) => persistRecord({ ...pendingStatusSave.payload, statusRemark: remark }, pendingStatusSave.lockAfter)}
        />
      ) : null}

      {completeOpen && sell ? (
        <RemarkDialog
          title="Complete sale & send invoice"
          tone="emerald"
          confirmLabel="Complete sale"
          busy={busy === 'complete'}
          placeholder="e.g. RC transferred to customer, all documents handed over"
          description={<span>Both records will be locked. Invoice goes to <b>{sell.purchaserName}</b> ({sell.purchaserNumber}) on WhatsApp and SMS.</span>}
          onCancel={() => setCompleteOpen(false)}
          onConfirm={(remark) => completeSale(remark)}
        />
      ) : null}

      {termsOpen ? <RtoTermsModal onClose={() => setTermsOpen(false)} /> : null}
    </div>
  );
}
