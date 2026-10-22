/* eslint-disable react-hooks/set-state-in-effect */

'use client';

import { ComponentType, useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Car,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Clock,
  Download,
  Eye,
  FileText,
  Loader2,
  LockKeyhole,
  Phone,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  X,
  Copy,
  Send,
  ExternalLink,
  ShieldCheck,
  DollarSign,
  LayoutGrid,
  List,
  Building2,
  Wallet,
  Pencil,
  CheckCircle,
} from 'lucide-react';
import api from '@/lib/api';
import {
  getAccountCreatePermissions,
  getAccountDeletePermissions,
  getAccountExportPermission,
  getAccountUpdatePermissions,
} from '@/lib/accountsPermissions';
import { buildPaginationItems } from '@/lib/paginationUtils';
import { hasAnyPermission } from '@/lib/permissionUtils';
import { downloadTableFile } from '@/lib/tabularExport';
import { isAuthReady } from '@/lib/authHydration';
import BrandLoader from '@/components/ui/BrandLoader';
import PortalActionDropdown from '@/components/ui/PortalActionDropdown';
import RemarkDialog from '@/components/accounts/RemarkDialog';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import { filterSelectOptions, getRtoStatusLabel, normalizeRtoStatus } from '@/lib/rtoWorkStatusForm.mjs';
import { buildRtoStatusFilterOptions } from '@/lib/rtoWorkStatusFilter.mjs';
import { formatRtoCurrency } from '@/lib/rtoWorkStatusDisplay.mjs';
import { toast } from 'react-toastify';

type Status = 'RTO_WORK_STARTED' | 'RTO_WORK_IN_PROGRESS' | 'RTO_WORK_FAILED' | 'RTO_WORK_COMPLETED' | 'DEAL_DONE';
type Validity = 'VALID' | 'EXPIRED' | 'NOT_AVAILABLE' | 'LIFETIME' | 'NOT_APPLICABLE' | 'PENDING';
type HsrpStatus = 'YES' | 'NO' | 'PENDING' | 'NOT_APPLICABLE';
type HirePurchase = 'PENDING' | 'ACTIVE' | 'TERMINATED' | 'NOT_APPLICABLE';

type RtoRecord = {
  id: string;
  isLocked?: boolean;
  lockedAt?: string | null;
  sellAccountId?: string | null;
  listingId?: string | null;
  customerName: string;
  customerNumber: string;
  vehicleNumber: string;
  brandName: string;
  vehicleType: string;
  vehicleModel: string;
  hirePurchaseStatus: HirePurchase;
  taxStatus: Validity;
  taxValidUntil: string | null;
  fitnessStatus: Validity;
  fitnessValidUntil: string | null;
  insuranceStatus: Validity;
  insuranceValidUntil: string | null;
  pucStatus: Validity;
  pucValidUntil: string | null;
  hsrpStatus: HsrpStatus;
  sellerName: string;
  sellerNumber: string;
  purchaserName: string;
  purchaserNumber: string;
  rtoOffice: string;
  rtoAgentName: string;
  rtoAgentState: string;
  rtoAgentCity: string;
  rtoAgentNumber: string;
  rtoExpenses: number;
  rtoExpensesAdvance: number;
  rtoExpensesBalance: number;
  documentSendDate: string | null;
  rtoStatus: Status;
  noteSheet: string | null;
  vehicleMaintenanceCost: number;
};

type SelectOption = { value: string; label: string };
type StatusConfig = { label: string; bg: string; text: string; border: string; icon: ComponentType<{ className?: string }> };
type ExportFormat = 'csv' | 'xls';
type PendingQuickStatus = { record: RtoRecord; nextStatus: Status };

const statusConfig: Record<Status, StatusConfig> = {
  RTO_WORK_STARTED: { label: 'RTO Work Start', bg: 'bg-amber-50', text: 'text-amber-800', border: 'border-amber-200/80', icon: AlertTriangle },
  RTO_WORK_IN_PROGRESS: { label: 'RTO Work Progress', bg: 'bg-blue-50', text: 'text-blue-800', border: 'border-blue-200/80', icon: Clock },
  RTO_WORK_FAILED: { label: 'RTO Work Failed / Errors', bg: 'bg-rose-50', text: 'text-rose-800', border: 'border-rose-200/80', icon: AlertTriangle },
  RTO_WORK_COMPLETED: { label: 'RTO Work Completed', bg: 'bg-emerald-50', text: 'text-emerald-800', border: 'border-emerald-200/80', icon: CheckCircle2 },
  DEAL_DONE: { label: 'Deal Done', bg: 'bg-emerald-100/80', text: 'text-emerald-950', border: 'border-emerald-300', icon: Check },
};

const RTO_STATUS_OPTIONS: Array<{ value: Status; label: string }> = [
  { value: 'RTO_WORK_STARTED', label: 'RTO Work Start' },
  { value: 'RTO_WORK_IN_PROGRESS', label: 'RTO Work Progress' },
  { value: 'RTO_WORK_FAILED', label: 'RTO Work Failed / Errors' },
  { value: 'RTO_WORK_COMPLETED', label: 'RTO Work Completed' },
  { value: 'DEAL_DONE', label: 'Deal Done' },
];

const label = (value: string) => {
  if (!value) return '—';
  if (['PENDING', 'IN_PROGRESS', 'DOCUMENT_REQUIRED', 'SUBMITTED', 'APPROVED', 'REJECTED', 'COMPLETED', 'CANCELLED', 'RTO_WORK_STARTED', 'RTO_WORK_IN_PROGRESS', 'RTO_WORK_FAILED', 'RTO_WORK_COMPLETED', 'DEAL_DONE'].includes(value)) {
    return getRtoStatusLabel(value);
  }
  if (value === 'NOT_APPLICABLE' || value === 'NOT_REQUIRED') return 'Not Required';
  return value.replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, (char) => char.toUpperCase());
};

const exportDateValue = (value: string | null) =>
  value ? new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(value)) : '';

function StyledSelect({
  value,
  options,
  onChange,
  placeholder = 'Select',
  disabled = false,
  searchable = false,
}: {
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  searchable?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const selected = options.find((item) => item.value === value);
  const filteredOptions = useMemo(() => filterSelectOptions(options, query) as SelectOption[], [options, query]);
  const close = () => {
    setOpen(false);
    setQuery('');
  };

  return (
    <div
      className="relative"
      onBlur={(event) => {
        const nextFocusedElement = event.relatedTarget;
        if (!nextFocusedElement || !event.currentTarget.contains(nextFocusedElement)) {
          close();
        }
      }}
    >
      <button
        type="button"
        disabled={disabled}
        aria-expanded={open}
        onClick={() => {
          if (open) close();
          else setOpen(true);
        }}
        className={`flex w-full items-center justify-between rounded-xl border bg-slate-50/70 px-3 py-2 text-left text-xs font-semibold text-slate-900 outline-none transition disabled:cursor-not-allowed disabled:opacity-60 ${
          open ? 'border-[#FFC107] bg-white ring-2 ring-[#FFC107]/20' : 'border-slate-200 hover:bg-white'
        }`}
      >
        <span className={selected?.value ? 'truncate' : 'truncate text-slate-500'}>{selected?.label || placeholder}</span>
        <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-slate-500 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open ? (
        <div className="absolute right-0 top-full z-50 mt-1.5 max-h-72 w-full min-w-[220px] overflow-y-auto rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl animate-in fade-in duration-150">
          {searchable ? (
            <div className="relative mb-1.5">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onMouseDown={(event) => event.stopPropagation()}
                onClick={(event) => event.stopPropagation()}
                placeholder="Search options..."
                aria-label="Search options"
                autoFocus
                className="w-full rounded-lg border border-slate-200 bg-slate-50 py-1.5 pl-8 pr-3 text-xs text-slate-900 outline-none focus:border-[#FFC107] focus:bg-white focus:ring-2 focus:ring-[#FFC107]/20"
              />
            </div>
          ) : null}
          {filteredOptions.length === 0 ? (
            <p className="px-3 py-2 text-xs text-slate-500">No matching options</p>
          ) : (
            filteredOptions.map((item) => {
              const selectedItem = item.value === value;
              return (
                <button
                  key={`${item.value}-${item.label}`}
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    onChange(item.value);
                    close();
                  }}
                  className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-xs transition ${
                    selectedItem ? 'bg-amber-50 font-bold text-amber-900' : 'text-slate-800 hover:bg-slate-50'
                  }`}
                >
                  <span className="truncate">{item.label}</span>
                  {selectedItem ? <Check className="h-3.5 w-3.5 shrink-0 text-amber-600" /> : null}
                </button>
              );
            })
          )}
        </div>
      ) : null}
    </div>
  );
}

const vehicleNumberInput = (value: string) => value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10);
const vehicleNumberDisplay = (value: string) => {
  const cleaned = vehicleNumberInput(value);
  if (cleaned.length <= 2) return cleaned;
  const state = cleaned.slice(0, 2);
  const district = cleaned.slice(2, 4);
  const series = cleaned.slice(4, Math.max(4, cleaned.length - 4));
  const number = cleaned.length > 4 ? cleaned.slice(-4) : '';
  return [state, district, series, number].filter(Boolean).join('-');
};

const apiErrorMessage = (error: unknown, fallback: string) => {
  const detail = (error as { response?: { data?: { error?: unknown } } })?.response?.data?.error;
  return typeof detail === 'string' && detail.trim() ? detail : error instanceof Error && error.message ? error.message : fallback;
};

export default function RTOWorkStatusPage() {
  const [records, setRecords] = useState<RtoRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [viewMode, setViewMode] = useState<'table' | 'grid'>('table');
  const [error, setError] = useState('');
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [openStatusDropdownId, setOpenStatusDropdownId] = useState<string | null>(null);
  const [updatingStatusId, setUpdatingStatusId] = useState<string | null>(null);
  const [pendingQuickStatus, setPendingQuickStatus] = useState<PendingQuickStatus | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentUser = useAuthStore((state) => state.user);
  const hasHydrated = useAuthStore((state) => state.hasHydrated);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const userPermissions = currentUser?.permissions || [];
  const canManageAccounts = currentUser?.role === 'SUPER_ADMIN' || currentUser?.role === 'ADMIN';
  const canCreateRto = canManageAccounts || hasAnyPermission(userPermissions, getAccountCreatePermissions('rto-work-status'));
  const canUpdateRto = canManageAccounts || hasAnyPermission(userPermissions, getAccountUpdatePermissions('rto-work-status'));
  const canDeleteRto = canManageAccounts || hasAnyPermission(userPermissions, getAccountDeletePermissions('rto-work-status'));
  const canExportRto = canManageAccounts || hasAnyPermission(userPermissions, [getAccountExportPermission('rto-work-status')]);
  const accountBasePath = pathname.startsWith('/employee')
    ? '/employee/accounts/rto-work-status'
    : pathname.startsWith('/admin')
      ? '/admin/accounts/rto-work-status'
      : '/admin/accounts/rto-work-status';
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);

  // Copy helper
  const copyText = useCallback((text: string, key: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  }, []);

  // Deep links redirection
  useEffect(() => {
    const editId = searchParams.get('edit')?.trim();
    const listingId = searchParams.get('listingId')?.trim();
    if (editId) router.replace(`${accountBasePath}/${encodeURIComponent(editId)}/edit`);
    else if (listingId) router.replace(`${accountBasePath}/new?listingId=${encodeURIComponent(listingId)}`);
  }, [accountBasePath, router, searchParams]);

  useEffect(() => {
    if (typeof window !== 'undefined' && records.length > 0) {
      localStorage.setItem('jcb_rto_records', JSON.stringify(records));
    }
  }, [records]);

  const loadRecords = useCallback(async () => {
    if (!isAuthReady(hasHydrated, isAuthenticated)) return;

    try {
      setLoading(true);
      const response = await api.get('/recruitment/admin/rto-records');
      setRecords((response.data?.records || []).map((record: RtoRecord) => ({ ...record, rtoStatus: normalizeRtoStatus(record.rtoStatus) as Status })));
    } catch {
      setError('Unable to load RTO records.');
    } finally {
      setLoading(false);
    }
  }, [hasHydrated, isAuthenticated]);

  useEffect(() => {
    void loadRecords();
  }, [loadRecords]);

  // Executive KPI Ribbon Calculations
  const metrics = useMemo(() => {
    const totalFiles = records.length;
    let activePipeline = 0;
    let completedDeals = 0;
    let failedIssues = 0;
    let totalExpensesSum = 0;
    let advancePaidSum = 0;
    let balanceDueSum = 0;

    records.forEach((r) => {
      if (r.rtoStatus === 'RTO_WORK_IN_PROGRESS' || r.rtoStatus === 'RTO_WORK_STARTED') {
        activePipeline++;
      } else if (r.rtoStatus === 'RTO_WORK_COMPLETED' || r.rtoStatus === 'DEAL_DONE') {
        completedDeals++;
      } else if (r.rtoStatus === 'RTO_WORK_FAILED') {
        failedIssues++;
      }

      totalExpensesSum += Number(r.rtoExpenses || 0);
      advancePaidSum += Number(r.rtoExpensesAdvance || 0);
      balanceDueSum += Number(r.rtoExpensesBalance || 0);
    });

    return {
      totalFiles,
      activePipeline,
      completedDeals,
      failedIssues,
      totalExpensesSum,
      advancePaidSum,
      balanceDueSum,
    };
  }, [records]);

  const statusFilterOptions = useMemo(() => buildRtoStatusFilterOptions(records), [records]);

  useEffect(() => {
    if (statusFilter !== 'ALL' && !statusFilterOptions.some((option) => option.value === statusFilter)) {
      setStatusFilter('ALL');
    }
  }, [statusFilter, statusFilterOptions]);

  const filteredRecords = useMemo(() => {
    return records.filter((record) => {
      const query = search.toLowerCase().trim();
      const matchesSearch =
        !query ||
        [
          record.customerName,
          record.customerNumber,
          record.vehicleNumber,
          record.vehicleType,
          record.vehicleModel,
          record.brandName,
          record.sellerName,
          record.sellerNumber,
          record.purchaserName,
          record.purchaserNumber,
          record.rtoOffice,
          record.rtoAgentName,
          record.rtoAgentCity,
        ].some((value) => String(value || '').toLowerCase().includes(query));
      return matchesSearch && (statusFilter === 'ALL' || record.rtoStatus === statusFilter);
    });
  }, [records, search, statusFilter]);

  const exportColumns = useMemo(
    () => [
      { header: 'Customer Name', value: (record: RtoRecord) => record.customerName },
      { header: 'Customer Number', value: (record: RtoRecord) => record.customerNumber },
      { header: 'Registration Number', value: (record: RtoRecord) => vehicleNumberDisplay(record.vehicleNumber) },
      { header: 'Brand', value: (record: RtoRecord) => record.brandName },
      { header: 'Vehicle Type', value: (record: RtoRecord) => record.vehicleType },
      { header: 'Vehicle Model', value: (record: RtoRecord) => record.vehicleModel },
      { header: 'Vehicle Maintenance Cost', value: (record: RtoRecord) => record.vehicleMaintenanceCost },
      { header: 'Hire Purchase', value: (record: RtoRecord) => label(record.hirePurchaseStatus) },
      { header: 'Tax Status', value: (record: RtoRecord) => label(record.taxStatus) },
      { header: 'Tax Valid Until', value: (record: RtoRecord) => exportDateValue(record.taxValidUntil) },
      { header: 'Fitness Status', value: (record: RtoRecord) => label(record.fitnessStatus) },
      { header: 'Fitness Valid Until', value: (record: RtoRecord) => exportDateValue(record.fitnessValidUntil) },
      { header: 'Insurance Status', value: (record: RtoRecord) => label(record.insuranceStatus) },
      { header: 'Insurance Valid Until', value: (record: RtoRecord) => exportDateValue(record.insuranceValidUntil) },
      { header: 'PUC Status', value: (record: RtoRecord) => label(record.pucStatus) },
      { header: 'PUC Valid Until', value: (record: RtoRecord) => exportDateValue(record.pucValidUntil) },
      { header: 'HSRP Valid', value: (record: RtoRecord) => label(record.hsrpStatus) },
      { header: 'Seller Name', value: (record: RtoRecord) => record.sellerName },
      { header: 'Seller Number', value: (record: RtoRecord) => record.sellerNumber },
      { header: 'Purchaser Name', value: (record: RtoRecord) => record.purchaserName },
      { header: 'Purchaser Number', value: (record: RtoRecord) => record.purchaserNumber },
      { header: 'RTO Office', value: (record: RtoRecord) => record.rtoOffice },
      { header: 'RTO Agent Name', value: (record: RtoRecord) => record.rtoAgentName },
      { header: 'RTO Agent State', value: (record: RtoRecord) => record.rtoAgentState },
      { header: 'RTO Agent City', value: (record: RtoRecord) => record.rtoAgentCity },
      { header: 'RTO Agent Number', value: (record: RtoRecord) => record.rtoAgentNumber },
      { header: 'RTO Expenses', value: (record: RtoRecord) => record.rtoExpenses },
      { header: 'RTO Expenses Advance', value: (record: RtoRecord) => record.rtoExpensesAdvance },
      { header: 'RTO Expenses Balance', value: (record: RtoRecord) => record.rtoExpensesBalance },
      { header: 'Document Send Date', value: (record: RtoRecord) => exportDateValue(record.documentSendDate) },
      { header: 'RTO Status', value: (record: RtoRecord) => getRtoStatusLabel(record.rtoStatus) },
      { header: 'Note Sheet', value: (record: RtoRecord) => record.noteSheet || '' },
    ],
    [],
  );

  const exportRecords = (format: ExportFormat) => {
    if (!canExportRto) return;
    downloadTableFile({
      columns: exportColumns,
      rows: filteredRecords,
      fileName: `rto-work-status-${new Date().toISOString().slice(0, 10)}`,
      format,
    });
    setExportMenuOpen(false);
  };

  const downloadRecord = (record: RtoRecord) => {
    if (!canExportRto) return;
    downloadTableFile({
      columns: exportColumns,
      rows: [record],
      fileName: `rto-record-${record.vehicleNumber || record.id}`,
      format: 'xls',
    });
  };

  useEffect(() => {
    setCurrentPage(1);
  }, [search, statusFilter, records]);

  const totalPages = Math.ceil(filteredRecords.length / rowsPerPage) || 1;
  const currentRecords = useMemo(() => {
    return filteredRecords.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage);
  }, [filteredRecords, currentPage, rowsPerPage]);

  const paginationItems = useMemo(() => buildPaginationItems(currentPage, totalPages), [currentPage, totalPages]);

  const openWorkspace = (record: RtoRecord) => {
    if (record.isLocked) {
      router.push(`${accountBasePath}/${record.id}`);
      return;
    }
    router.push(`${accountBasePath}/${encodeURIComponent(record.id)}/edit`);
  };

  const remove = async (id: string) => {
    if (!canDeleteRto) return;
    const record = records.find((item) => item.id === id);
    if (record?.isLocked) {
      toast.info('This record is locked and can only be viewed.');
      return;
    }
    if (!window.confirm('Delete this RTO record? This action cannot be undone.')) return;
    try {
      await api.delete(`/recruitment/admin/rto-records/${id}`);
      await loadRecords();
      toast.success(
        record?.sellAccountId
          ? 'RTO and connected Sold Vehicle record deleted successfully.'
          : 'RTO record deleted successfully.',
      );
    } catch (caught) {
      const message = apiErrorMessage(caught, 'Unable to delete RTO record.');
      setError(message);
      toast.error(message);
    }
  };

  const phoneLink = (phoneNumber: string) => {
    const cleanNumber = (phoneNumber || '').replace(/\D/g, '');
    if (!cleanNumber) return <span className="text-[10px] text-slate-400">No phone</span>;

    return (
      <div className="mt-0.5 flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
        <a
          href={`tel:${cleanNumber}`}
          className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-700 hover:text-emerald-700"
          title={`Call ${phoneNumber}`}
        >
          <Phone className="h-3 w-3 text-emerald-600" />
          <span>{phoneNumber}</span>
        </a>
        <a
          href={`https://wa.me/91${cleanNumber}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-slate-400 hover:text-emerald-600"
          title="WhatsApp Chat"
        >
          <Send className="h-3 w-3" />
        </a>
      </div>
    );
  };

  useEffect(() => {
    if (!openStatusDropdownId) return;

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && !target.closest('[data-rto-status-dropdown]')) {
        setOpenStatusDropdownId(null);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpenStatusDropdownId(null);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [openStatusDropdownId]);

  const requestQuickStatusChange = (record: RtoRecord, nextStatus: Status) => {
    if (!canUpdateRto || updatingStatusId) return;
    if (record.isLocked) {
      toast.info('This record is locked and can only be viewed.');
      return;
    }
    if (record.rtoStatus === nextStatus) return;
    if (nextStatus === 'DEAL_DONE' && record.sellAccountId) {
      toast.info('Finish the transfer tasks and use "Complete Sale" in the RTO workspace to mark this deal done.');
      router.push(`${accountBasePath}/${encodeURIComponent(record.id)}/edit`);
      return;
    }
    setPendingQuickStatus({ record, nextStatus });
  };

  const confirmQuickStatusChange = async (remark: string) => {
    if (!pendingQuickStatus) return;
    const { record, nextStatus } = pendingQuickStatus;
    const previousStatus = record.rtoStatus;
    setUpdatingStatusId(record.id);
    setRecords((prev) => prev.map((item) => (item.id === record.id ? { ...item, rtoStatus: nextStatus } : item)));

    try {
      const response = await api.put(`/recruitment/admin/rto-records/${record.id}`, {
        ...record,
        rtoStatus: nextStatus,
        statusRemark: remark,
      });
      if (!response.data?.success) throw new Error(response.data?.error || 'Failed to update RTO status.');
      if (nextStatus === 'DEAL_DONE') {
        const lockResponse = await api.post(`/recruitment/admin/rto-records/${record.id}/lock`);
        if (!lockResponse.data?.success) throw new Error(lockResponse.data?.error || 'Unable to lock the record.');
        await loadRecords();
        toast.success('Deal Done record locked. It is now view-only.');
      } else {
        setRecords((prev) =>
          prev.map((item) =>
            item.id === record.id
              ? {
                  ...record,
                  ...response.data.record,
                  rtoStatus: normalizeRtoStatus(response.data.record?.rtoStatus || nextStatus) as Status,
                }
              : item,
          ),
        );
        toast.success(`RTO Status updated to "${statusConfig[nextStatus]?.label || nextStatus}"`);
      }
      setPendingQuickStatus(null);
    } catch (err: unknown) {
      setRecords((prev) => prev.map((item) => (item.id === record.id ? { ...item, rtoStatus: previousStatus } : item)));
      toast.error(apiErrorMessage(err, 'Unable to update RTO status.'));
    } finally {
      setUpdatingStatusId(null);
    }
  };

  const renderStatusDropdown = (record: RtoRecord, index: number) => {
    const config = statusConfig[record.rtoStatus] || statusConfig.RTO_WORK_IN_PROGRESS;
    const StatusIcon = config.icon;
    const isOpen = openStatusDropdownId === record.id;
    const isUpdating = updatingStatusId === record.id;
    const openUpwards = index >= Math.max(0, currentRecords.length - 2) && currentRecords.length > 2;

    if (!canUpdateRto || record.isLocked) {
      return (
        <span
          title={record.isLocked ? 'Locked: permanent audit archive' : undefined}
          className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.75 text-[11px] font-bold whitespace-nowrap shrink-0 ${config.bg} ${config.text} ${config.border}`}
        >
          <StatusIcon className="h-3 w-3" />
          {config.label}
          {record.isLocked ? <LockKeyhole className="h-3 w-3 text-slate-500 ml-0.5" /> : null}
        </span>
      );
    }

    return (
      <div className={`relative inline-block ${isOpen ? 'z-40' : 'z-10'}`} data-rto-status-dropdown>
        <button
          type="button"
          disabled={isUpdating}
          onClick={(event) => {
            event.stopPropagation();
            setOpenStatusDropdownId((current) => (current === record.id ? null : record.id));
          }}
          className={`group inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.75 text-[11px] font-bold whitespace-nowrap shrink-0 transition-all shadow-2xs hover:shadow-xs cursor-pointer select-none disabled:cursor-wait disabled:opacity-75 ${config.bg} ${config.text} ${config.border} hover:brightness-95`}
          title="Click to update transfer status"
          aria-haspopup="true"
          aria-expanded={isOpen}
        >
          {isUpdating ? <Loader2 className="h-3 w-3 animate-spin text-current" /> : <StatusIcon className="h-3 w-3" />}
          <span>{config.label}</span>
          <ChevronDown
            className={`h-3 w-3 text-current transition-transform duration-200 ${
              isOpen ? 'rotate-180' : 'opacity-70 group-hover:opacity-100'
            }`}
          />
        </button>

        {isOpen ? (
          <div
            className={`absolute left-0 ${openUpwards ? 'bottom-full mb-1.5' : 'top-full mt-1.5'} z-50 w-56 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl animate-in fade-in zoom-in-95 duration-150`}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-100 mb-1">
              Select RTO Stage
            </div>
            {RTO_STATUS_OPTIONS.map((opt) => {
              const isSelected = record.rtoStatus === opt.value;
              const itemConfig = statusConfig[opt.value] || statusConfig.RTO_WORK_IN_PROGRESS;
              const ItemIcon = itemConfig.icon;
              return (
                <button
                  key={opt.value}
                  type="button"
                  disabled={isUpdating}
                  onClick={(event) => {
                    event.stopPropagation();
                    setOpenStatusDropdownId(null);
                    if (!isSelected) requestQuickStatusChange(record, opt.value);
                  }}
                  className={`flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs font-semibold transition cursor-pointer ${
                    isSelected
                      ? `${itemConfig.bg} ${itemConfig.text} ring-1 ring-inset ${itemConfig.border}`
                      : 'text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center gap-2 truncate">
                    <ItemIcon className={`h-3.5 w-3.5 shrink-0 ${isSelected ? itemConfig.text : 'text-slate-400'}`} />
                    <span className="truncate">{itemConfig.label}</span>
                  </div>
                  {isSelected ? <Check className="h-3.5 w-3.5 shrink-0 text-current" /> : null}
                </button>
              );
            })}
          </div>
        ) : null}
      </div>
    );
  };

  return (
    <div className="space-y-4 pb-14">
      {error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-bold text-rose-700">
          {error}
        </div>
      ) : null}

      {/* 1. EXECUTIVE METRIC RIBBON */}
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
        {/* Metric 1: Total Files */}
        <div className="rounded-xl border border-slate-200/90 bg-white p-3 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">RTO Case Files</span>
            <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
              <ClipboardCheck className="h-3.5 w-3.5" />
            </div>
          </div>
          <div className="mt-1 text-base sm:text-lg font-black text-slate-900 tracking-tight">
            {metrics.totalFiles}
          </div>
          <div className="mt-0.5 text-[10px] font-semibold text-slate-400">Total registered transfers</div>
        </div>

        {/* Metric 2: Active Pipeline */}
        <div className="rounded-xl border border-blue-200/90 bg-gradient-to-br from-blue-50/50 to-white p-3 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-blue-800">In Pipeline</span>
            <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-blue-100 text-blue-700">
              <Clock className="h-3.5 w-3.5" />
            </div>
          </div>
          <div className="mt-1 text-base sm:text-lg font-black text-blue-900 tracking-tight">
            {metrics.activePipeline}
          </div>
          <div className="mt-0.5 text-[10px] font-semibold text-blue-700">Pending at RTO offices</div>
        </div>

        {/* Metric 3: Completed / Deal Done */}
        <div className="rounded-xl border border-emerald-200/90 bg-gradient-to-br from-emerald-50/50 to-white p-3 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-800">Deals Done</span>
            <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
              <CheckCircle className="h-3.5 w-3.5" />
            </div>
          </div>
          <div className="mt-1 text-base sm:text-lg font-black text-emerald-900 tracking-tight">
            {metrics.completedDeals}
          </div>
          <div className="mt-0.5 text-[10px] font-semibold text-emerald-700">Successfully finalized</div>
        </div>

        {/* Metric 4: Failed / Issues */}
        <div className="rounded-xl border border-rose-200/90 bg-gradient-to-br from-rose-50/50 to-white p-3 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-rose-800">Errors / Rejection</span>
            <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-rose-100 text-rose-700">
              <AlertTriangle className="h-3.5 w-3.5" />
            </div>
          </div>
          <div className="mt-1 text-base sm:text-lg font-black text-rose-900 tracking-tight">
            {metrics.failedIssues}
          </div>
          <div className="mt-0.5 text-[10px] font-semibold text-rose-700">Action required</div>
        </div>

        {/* Metric 5: Total Expenses Disbursed */}
        <div className="rounded-xl border border-slate-200/90 bg-white p-3 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Expenses Advance</span>
            <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-slate-100 text-slate-700">
              <Wallet className="h-3.5 w-3.5" />
            </div>
          </div>
          <div className="mt-1 text-sm sm:text-base font-black text-slate-900 truncate">
            {formatRtoCurrency(metrics.advancePaidSum)}
          </div>
          <div className="mt-0.5 text-[10px] font-semibold text-slate-400">Total fees disbursed</div>
        </div>

        {/* Metric 6: Outstanding Balance Due */}
        <div
          className={`rounded-xl border p-3 shadow-2xs ${
            metrics.balanceDueSum > 0
              ? 'border-amber-300 bg-gradient-to-br from-amber-50 to-white'
              : 'border-slate-200/90 bg-white'
          }`}
        >
          <div className="flex items-center justify-between">
            <span
              className={`text-[10px] font-bold uppercase tracking-wider ${
                metrics.balanceDueSum > 0 ? 'text-amber-900' : 'text-slate-500'
              }`}
            >
              Agent Balance Due
            </span>
            <DollarSign className={`h-3.5 w-3.5 ${metrics.balanceDueSum > 0 ? 'text-amber-600' : 'text-slate-400'}`} />
          </div>
          <div
            className={`mt-1 text-sm sm:text-base font-black truncate ${
              metrics.balanceDueSum > 0 ? 'text-amber-900' : 'text-slate-900'
            }`}
          >
            {formatRtoCurrency(metrics.balanceDueSum)}
          </div>
          <div
            className={`mt-0.5 text-[10px] font-semibold ${
              metrics.balanceDueSum > 0 ? 'text-amber-700' : 'text-emerald-700'
            }`}
          >
            {metrics.balanceDueSum > 0 ? 'Pending settlement' : 'All accounts settled'}
          </div>
        </div>
      </div>

      {/* 2. UNIFIED CONTROLS & FILTER SYSTEM */}
      <div className="rounded-2xl border border-slate-200/90 bg-white p-3.5 sm:p-4 shadow-xs">
        {/* Status Filter Chips Row */}
        <div className="flex flex-wrap items-center gap-1.5 border-b border-slate-100 pb-3">
          <button
            type="button"
            onClick={() => setStatusFilter('ALL')}
            className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-bold transition ${
              statusFilter === 'ALL'
                ? 'bg-slate-900 text-white shadow-2xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <span>All Stages</span>
            <span
              className={`rounded px-1.5 py-0.2 text-[10px] font-black ${
                statusFilter === 'ALL' ? 'bg-slate-800 text-white' : 'bg-white text-slate-700'
              }`}
            >
              {records.length}
            </span>
          </button>

          {RTO_STATUS_OPTIONS.map((opt) => {
            const count = records.filter((r) => r.rtoStatus === opt.value).length;
            const isSelected = statusFilter === opt.value;
            const cfg = statusConfig[opt.value];

            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => setStatusFilter(opt.value)}
                className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-bold transition ${
                  isSelected
                    ? `${cfg.bg} ${cfg.text} ring-1 ring-inset ${cfg.border} shadow-2xs`
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                <span>{cfg.label}</span>
                <span
                  className={`rounded px-1.5 py-0.2 text-[10px] font-black ${
                    isSelected ? 'bg-white/80 text-current' : 'bg-white text-slate-700'
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Search, View Toggles & Actions */}
        <div className="mt-3 flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
          {/* Search Box */}
          <div className="relative flex-1 min-w-[220px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search vehicle reg plate, customer, seller, buyer, agent, RTO office..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50/70 py-2 pl-9 pr-8 text-xs font-semibold text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-amber-400 focus:bg-white focus:ring-2 focus:ring-amber-400/20"
            />
            {search ? (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X size={14} />
              </button>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* View Mode Switcher */}
            <div className="flex items-center rounded-xl border border-slate-200 bg-slate-50 p-0.5">
              <button
                type="button"
                onClick={() => setViewMode('table')}
                className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-bold transition ${
                  viewMode === 'table' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-500 hover:text-slate-900'
                }`}
                title="Table View"
              >
                <List className="h-3.5 w-3.5" />
                <span className="hidden md:inline">Table</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('grid')}
                className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-bold transition ${
                  viewMode === 'grid' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-500 hover:text-slate-900'
                }`}
                title="Grid Cards View"
              >
                <LayoutGrid className="h-3.5 w-3.5" />
                <span className="hidden md:inline">Cards</span>
              </button>
            </div>

            {/* Reset Filters */}
            <button
              type="button"
              onClick={() => {
                setSearch('');
                setStatusFilter('ALL');
              }}
              className="inline-flex h-8 items-center justify-center rounded-xl border border-slate-200 bg-white px-2.5 text-xs font-bold text-slate-600 shadow-2xs transition hover:bg-slate-50"
              title="Reset Filters"
            >
              <RefreshCw size={14} />
            </button>

            {/* Export Menu */}
            {canExportRto ? (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setExportMenuOpen((current) => !current)}
                  disabled={filteredRecords.length === 0}
                  className="inline-flex h-8 items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 shadow-2xs transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                  title="Export RTO records"
                >
                  <Download size={14} />
                  <span>Export</span>
                </button>
                {exportMenuOpen ? (
                  <div className="absolute right-0 top-full z-40 mt-1.5 w-40 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-xl animate-in fade-in duration-150">
                    <button
                      type="button"
                      onClick={() => exportRecords('csv')}
                      className="block w-full px-3.5 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      Export CSV (.csv)
                    </button>
                    <button
                      type="button"
                      onClick={() => exportRecords('xls')}
                      className="block w-full border-t border-slate-100 px-3.5 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      Export Excel (.xls)
                    </button>
                  </div>
                ) : null}
              </div>
            ) : null}

            {/* Add Record Primary Button */}
            {canCreateRto ? (
              <button
                type="button"
                onClick={() => router.push(`${accountBasePath}/new`)}
                className="inline-flex h-8 items-center justify-center gap-1.5 rounded-xl bg-[#FFC107] px-3.5 text-xs font-black text-slate-950 shadow-2xs transition hover:bg-[#E5AD06]"
              >
                <Plus size={15} />
                <span>New Transfer</span>
              </button>
            ) : null}
          </div>
        </div>
      </div>

      {/* 3. CONTENT AREA: TABLE VIEW OR CARDS VIEW */}
      {loading ? (
        <div className="rounded-2xl border border-slate-200/90 bg-white py-14 shadow-xs">
          <BrandLoader variant="section" size="sm" bg="light" text="Loading RTO work registry..." />
        </div>
      ) : filteredRecords.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white py-14 text-center shadow-xs">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
            <FileText className="h-6 w-6" />
          </div>
          <p className="mt-3 text-sm font-bold text-slate-800">No RTO records match your query.</p>
          <p className="mt-0.5 text-xs text-slate-400">Try adjusting your status filter or search keywords.</p>
          {canCreateRto && (
            <button
              type="button"
              onClick={() => router.push(`${accountBasePath}/new`)}
              className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-[#FFC107] px-3.5 py-2 text-xs font-bold text-slate-950 shadow-2xs hover:bg-[#E5AD06]"
            >
              <Plus size={14} />
              <span>Create New Record</span>
            </button>
          )}
        </div>
      ) : viewMode === 'table' ? (
        /* TABLE VIEW */
        <div className="rounded-2xl border border-slate-200/90 bg-white shadow-xs overflow-hidden">
          <div className="overflow-x-auto min-h-[360px]">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50/90 text-[11px] font-bold uppercase tracking-wider text-slate-600">
                <tr>
                  <th className="px-3.5 py-3">Vehicle & Plate</th>
                  <th className="px-3 py-3">Customer / Buyer</th>
                  <th className="px-3 py-3">Seller Source</th>
                  <th className="px-3 py-3">RTO Office & Agent</th>
                  <th className="px-3 py-3">Settlement / Fee</th>
                  <th className="px-3 py-3">Transfer Stage</th>
                  <th className="px-3.5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {currentRecords.map((record, index) => {
                  const formattedPlate = vehicleNumberDisplay(record.vehicleNumber);
                  const isCopied = copiedKey === `plate-${record.id}`;

                  return (
                    <tr
                      key={record.id}
                      onClick={() => router.push(`${accountBasePath}/${record.id}`)}
                      className="group cursor-pointer transition-colors hover:bg-slate-50/80"
                    >
                      {/* Vehicle & HSRP Plate */}
                      <td className="px-3.5 py-3.5">
                        <div className="flex flex-col gap-1.5">
                          {/* Mini HSRP Plate */}
                          <div className="inline-flex items-center rounded-md border border-slate-800 bg-white shadow-2xs overflow-hidden font-mono tracking-wider font-black select-all w-fit">
                            <div className="flex flex-col items-center justify-center bg-blue-700 px-1 py-0.5 text-white">
                              <span className="text-[6.5px] font-bold leading-none">IND</span>
                            </div>
                            <span className="px-2 py-0.5 text-xs font-black uppercase text-slate-950">
                              {formattedPlate || 'UNREGISTERED'}
                            </span>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                copyText(formattedPlate, `plate-${record.id}`);
                              }}
                              className="border-l border-slate-200 px-1.5 py-0.5 text-slate-400 hover:text-slate-800 transition"
                              title="Copy Plate Number"
                            >
                              {isCopied ? (
                                <Check className="h-3 w-3 text-emerald-600" />
                              ) : (
                                <Copy className="h-3 w-3" />
                              )}
                            </button>
                          </div>

                          <div className="text-xs">
                            <p className="font-bold text-slate-900 truncate max-w-[180px]">
                              {record.brandName ? `${record.brandName} ` : ''}
                              {record.vehicleModel || record.vehicleType}
                            </p>
                            <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[10px]">
                              <span className="rounded bg-slate-100 px-1.5 py-0.25 font-semibold text-slate-600">
                                {label(record.hirePurchaseStatus)}
                              </span>
                              {record.listingId && (
                                <span className="text-amber-700 font-bold hover:underline">
                                  Linked Machine
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Customer / Purchaser (Buyer) */}
                      <td className="px-3 py-3.5">
                        <div className="max-w-[150px]">
                          <p className="font-bold text-slate-900 truncate" title={record.purchaserName || record.customerName}>
                            {record.purchaserName || record.customerName}
                          </p>
                          {record.purchaserName && record.customerName && record.purchaserName !== record.customerName && (
                            <p className="text-[10px] text-slate-400 truncate" title={`Contact: ${record.customerName}`}>
                              Ref: {record.customerName}
                            </p>
                          )}
                          {phoneLink(record.purchaserNumber || record.customerNumber)}
                        </div>
                      </td>

                      {/* Seller Source */}
                      <td className="px-3 py-3.5">
                        <div className="max-w-[150px]">
                          <p className="font-bold text-slate-900 truncate" title={record.sellerName}>
                            {record.sellerName || 'Direct Seller'}
                          </p>
                          {phoneLink(record.sellerNumber)}
                          {record.sellAccountId && (
                            <span className="mt-0.5 inline-block text-[9.5px] font-bold text-blue-700 bg-blue-50 border border-blue-200/60 rounded px-1.5 py-0.2">
                              Sell Account
                            </span>
                          )}
                        </div>
                      </td>

                      {/* RTO Office & Agent */}
                      <td className="px-3 py-3.5">
                        <div className="max-w-[160px]">
                          <div className="flex items-center gap-1">
                            <Building2 className="h-3 w-3 text-slate-400 shrink-0" />
                            <p className="font-bold text-slate-900 truncate" title={record.rtoOffice}>
                              {record.rtoOffice || 'RTO Not Assigned'}
                            </p>
                          </div>
                          <div className="mt-0.5 flex items-center gap-1 text-[11px] font-semibold text-slate-700">
                            <span className="truncate">{record.rtoAgentName || 'No Agent'}</span>
                            {record.rtoAgentCity ? (
                              <span className="text-[10px] font-bold text-amber-700 shrink-0">
                                ({record.rtoAgentCity})
                              </span>
                            ) : null}
                          </div>
                          {phoneLink(record.rtoAgentNumber)}
                        </div>
                      </td>

                      {/* Settlement / Fee */}
                      <td className="px-3 py-3.5 whitespace-nowrap">
                        <div className="space-y-0.5">
                          <p className="text-xs font-black text-slate-900">
                            {formatRtoCurrency(record.rtoExpenses)}
                          </p>
                          <div className="flex items-center gap-1.5 text-[10px]">
                            <span className="text-slate-400 font-medium">Adv:</span>
                            <span className="font-bold text-emerald-700">
                              {formatRtoCurrency(record.rtoExpensesAdvance)}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 text-[10px]">
                            <span className="text-slate-400 font-medium">Bal:</span>
                            <span
                              className={`font-black ${
                                record.rtoExpensesBalance > 0 ? 'text-amber-800' : 'text-slate-500'
                              }`}
                            >
                              {formatRtoCurrency(record.rtoExpensesBalance)}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Transfer Stage */}
                      <td className="px-3 py-3.5 whitespace-nowrap">
                        {renderStatusDropdown(record, index)}
                      </td>

                      {/* Actions */}
                      <td className="px-3.5 py-3.5 text-right">
                        <div onClick={(event) => event.stopPropagation()}>
                          <PortalActionDropdown
                            align="right"
                            items={[
                              {
                                label: 'View Dossier',
                                icon: <Eye className="h-4 w-4 text-slate-500" />,
                                onClick: () => router.push(`${accountBasePath}/${record.id}`),
                              },
                              ...(canUpdateRto && !record.isLocked
                                ? [
                                    {
                                      label: 'Transfer Workspace / Edit',
                                      icon: <Pencil className="h-4 w-4 text-amber-600" />,
                                      onClick: () => openWorkspace(record),
                                    },
                                  ]
                                : []),
                              ...(canExportRto
                                ? [
                                    {
                                      label: 'Download Record (.xls)',
                                      icon: <Download className="h-4 w-4 text-slate-500" />,
                                      onClick: () => downloadRecord(record),
                                    },
                                  ]
                                : []),
                              ...(canDeleteRto && !record.isLocked
                                ? [
                                    {
                                      label: 'Delete Record',
                                      icon: <Trash2 className="h-4 w-4 text-rose-500" />,
                                      variant: 'danger' as const,
                                      onClick: () => void remove(record.id),
                                    },
                                  ]
                                : []),
                              ...(record.isLocked
                                ? [
                                    {
                                      label: 'Locked · Finalized Archive',
                                      icon: <LockKeyhole className="h-4 w-4 text-slate-500" />,
                                      onClick: () => router.push(`${accountBasePath}/${record.id}`),
                                    },
                                  ]
                                : []),
                            ]}
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Table Pagination Bar */}
          <div className="flex flex-col items-center justify-between gap-3 border-t border-slate-100 p-3.5 sm:flex-row text-xs">
            <div className="flex flex-wrap items-center gap-2 text-slate-600">
              <span>
                Showing <strong className="text-slate-900 font-bold">{(currentPage - 1) * rowsPerPage + 1}</strong> to{' '}
                <strong className="text-slate-900 font-bold">
                  {Math.min(currentPage * rowsPerPage, filteredRecords.length)}
                </strong>{' '}
                of <strong className="text-slate-900 font-bold">{filteredRecords.length}</strong> records
              </span>
              <div className="flex items-center gap-1.5 ml-2">
                <span className="text-slate-300">•</span>
                <span className="text-slate-500">Rows:</span>
                <select
                  value={rowsPerPage}
                  onChange={(event) => {
                    setRowsPerPage(Number(event.target.value));
                    setCurrentPage(1);
                  }}
                  className="rounded-lg border border-slate-200 bg-white px-2 py-0.75 text-xs font-bold text-slate-800 outline-none"
                >
                  <option value={10}>10</option>
                  <option value={20}>20</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
              </div>
            </div>

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
                disabled={currentPage === 1}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-bold text-slate-700 shadow-2xs transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Prev</span>
              </button>
              <div className="flex items-center gap-1 px-1">
                {paginationItems.map((item, index) =>
                  typeof item === 'number' ? (
                    <button
                      key={item}
                      type="button"
                      onClick={() => setCurrentPage(item)}
                      className={`h-7 w-7 rounded-lg text-xs font-extrabold transition ${
                        currentPage === item
                          ? 'bg-[#FFC107] text-slate-950 shadow-2xs'
                          : 'text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      {item}
                    </button>
                  ) : (
                    <span key={`ellipsis-${index}`} className="px-1 text-xs font-bold text-slate-400">
                      ...
                    </span>
                  ),
                )}
              </div>
              <button
                type="button"
                onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
                disabled={currentPage === totalPages || totalPages === 1}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-bold text-slate-700 shadow-2xs transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <span className="hidden sm:inline">Next</span>
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>
      ) : (
        /* GRID CARDS VIEW */
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-3">
            {currentRecords.map((record, index) => {
              const formattedPlate = vehicleNumberDisplay(record.vehicleNumber);
              const isCopied = copiedKey === `plate-${record.id}`;
              const cfg = statusConfig[record.rtoStatus] || statusConfig.RTO_WORK_IN_PROGRESS;
              const StatusIcon = cfg.icon;

              return (
                <div
                  key={record.id}
                  onClick={() => router.push(`${accountBasePath}/${record.id}`)}
                  className="group flex flex-col justify-between rounded-2xl border border-slate-200/90 bg-white p-4 shadow-xs transition hover:border-amber-300 hover:shadow-md cursor-pointer"
                >
                  <div>
                    {/* Card Top: HSRP Plate & Status */}
                    <div className="flex items-start justify-between gap-2 border-b border-slate-100 pb-3">
                      <div className="inline-flex items-center rounded-md border border-slate-800 bg-white shadow-2xs overflow-hidden font-mono tracking-wider font-black select-all">
                        <div className="flex flex-col items-center justify-center bg-blue-700 px-1 py-0.5 text-white">
                          <span className="text-[6px] font-bold leading-none">IND</span>
                        </div>
                        <span className="px-2 py-0.5 text-xs font-black uppercase text-slate-950">
                          {formattedPlate || 'UNREGISTERED'}
                        </span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            copyText(formattedPlate, `plate-${record.id}`);
                          }}
                          className="border-l border-slate-200 px-1.5 py-0.5 text-slate-400 hover:text-slate-800"
                        >
                          {isCopied ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
                        </button>
                      </div>

                      <div className="flex items-center gap-1">
                        <span
                          className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold ${cfg.bg} ${cfg.text} ${cfg.border}`}
                        >
                          <StatusIcon className="h-3 w-3" />
                          <span>{cfg.label}</span>
                        </span>
                        {record.isLocked && (
                          <span className="rounded bg-slate-100 p-1 text-slate-600" title="Locked archive">
                            <LockKeyhole className="h-3 w-3" />
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Machine Details */}
                    <div className="mt-3">
                      <h4 className="text-sm font-extrabold text-slate-900 group-hover:text-amber-800 transition-colors">
                        {record.brandName ? `${record.brandName} ` : ''}
                        {record.vehicleModel || record.vehicleType}
                      </h4>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {record.vehicleType} • HP: {label(record.hirePurchaseStatus)}
                      </p>
                    </div>

                    {/* Stakeholders Info Grid */}
                    <div className="mt-3 space-y-2 rounded-xl bg-slate-50/70 p-2.5 border border-slate-100 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Buyer</span>
                        <div className="text-right">
                          <p className="font-bold text-slate-900 truncate max-w-[150px]">
                            {record.purchaserName || record.customerName}
                          </p>
                          {phoneLink(record.purchaserNumber || record.customerNumber)}
                        </div>
                      </div>

                      <div className="flex items-center justify-between border-t border-slate-100/80 pt-1.5">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Seller</span>
                        <div className="text-right">
                          <p className="font-bold text-slate-900 truncate max-w-[150px]">{record.sellerName}</p>
                          {phoneLink(record.sellerNumber)}
                        </div>
                      </div>

                      <div className="flex items-center justify-between border-t border-slate-100/80 pt-1.5">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">RTO Office</span>
                        <div className="text-right">
                          <p className="font-bold text-slate-900 truncate max-w-[150px]">
                            {record.rtoOffice || 'Not set'}
                          </p>
                          <p className="text-[10px] text-slate-500">
                            {record.rtoAgentName ? `${record.rtoAgentName} (${record.rtoAgentCity})` : 'No agent'}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Card Bottom: Financials & Action Buttons */}
                  <div className="mt-3 border-t border-slate-100 pt-3">
                    <div className="flex items-baseline justify-between mb-2">
                      <div>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Total Fee</span>
                        <p className="text-xs font-black text-slate-900">{formatRtoCurrency(record.rtoExpenses)}</p>
                      </div>
                      <div className="text-right">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Balance Due</span>
                        <p
                          className={`text-xs font-black ${
                            record.rtoExpensesBalance > 0 ? 'text-amber-800' : 'text-emerald-700'
                          }`}
                        >
                          {formatRtoCurrency(record.rtoExpensesBalance)}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-2 border-t border-slate-50 pt-2">
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-700 group-hover:text-amber-700">
                        <span>View Dossier</span>
                        <ExternalLink className="h-3 w-3" />
                      </span>

                      {canUpdateRto && !record.isLocked && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            openWorkspace(record);
                          }}
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-bold text-slate-700 hover:bg-slate-100"
                        >
                          <Pencil className="h-3 w-3" />
                          <span>Workspace</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Cards Pagination */}
          <div className="flex flex-col items-center justify-between gap-3 rounded-2xl border border-slate-200/90 bg-white p-3.5 shadow-xs sm:flex-row text-xs">
            <span className="text-slate-600">
              Showing <strong>{(currentPage - 1) * rowsPerPage + 1}</strong> to{' '}
              <strong>{Math.min(currentPage * rowsPerPage, filteredRecords.length)}</strong> of{' '}
              <strong>{filteredRecords.length}</strong> records
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
                disabled={currentPage === 1}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-bold text-slate-700 disabled:opacity-40"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                <span>Prev</span>
              </button>
              <button
                type="button"
                onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
                disabled={currentPage === totalPages || totalPages === 1}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-bold text-slate-700 disabled:opacity-40"
              >
                <span>Next</span>
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Remark Dialog for Quick Status Change */}
      {pendingQuickStatus ? (
        <RemarkDialog
          title={`Change status to "${statusConfig[pendingQuickStatus.nextStatus].label}"`}
          description={
            pendingQuickStatus.nextStatus === 'DEAL_DONE'
              ? 'Deal Done locks this record: nobody can edit, delete or change its status afterwards.'
              : `${vehicleNumberDisplay(pendingQuickStatus.record.vehicleNumber)} · the remark is saved in the status activity audit trail.`
          }
          confirmLabel={pendingQuickStatus.nextStatus === 'DEAL_DONE' ? 'Save & lock' : 'Update status'}
          busy={updatingStatusId === pendingQuickStatus.record.id}
          onCancel={() => setPendingQuickStatus(null)}
          onConfirm={(remark) => confirmQuickStatusChange(remark)}
        />
      ) : null}
    </div>
  );
}
