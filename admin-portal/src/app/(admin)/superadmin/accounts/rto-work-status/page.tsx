/* eslint-disable react-hooks/set-state-in-effect */

'use client';

import { ComponentType, useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Car, Check, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, ClipboardCheck, Clock, Download, Eye, FileText, Loader2, LockKeyhole, Phone, Plus, RefreshCw, Search, Trash2, X } from 'lucide-react';
import api from '@/lib/api';
import { getAccountCreatePermissions, getAccountDeletePermissions, getAccountExportPermission, getAccountUpdatePermissions } from '@/lib/accountsPermissions';
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
  customerName: string; customerNumber: string; vehicleNumber: string; brandName: string; vehicleType: string; vehicleModel: string;
  hirePurchaseStatus: HirePurchase; taxStatus: Validity; taxValidUntil: string | null;
  fitnessStatus: Validity; fitnessValidUntil: string | null; insuranceStatus: Validity; insuranceValidUntil: string | null;
  pucStatus: Validity; pucValidUntil: string | null; hsrpStatus: HsrpStatus;
  sellerName: string; sellerNumber: string; purchaserName: string; purchaserNumber: string;
  rtoOffice: string; rtoAgentName: string; rtoAgentState: string; rtoAgentCity: string; rtoAgentNumber: string;
  rtoExpenses: number; rtoExpensesAdvance: number; rtoExpensesBalance: number; documentSendDate: string | null;
  rtoStatus: Status; noteSheet: string | null; vehicleMaintenanceCost: number;
};

type SelectOption = { value: string; label: string };
type StatusConfig = { label: string; bg: string; text: string; border: string; icon: ComponentType<{ className?: string }> };
type ExportFormat = 'csv' | 'xls';
type PendingQuickStatus = { record: RtoRecord; nextStatus: Status };

const statusConfig: Record<Status, StatusConfig> = {
  RTO_WORK_STARTED: { label: 'RTO Work Start', bg: 'bg-orange-50', text: 'text-orange-800', border: 'border-orange-200', icon: AlertTriangle },
  RTO_WORK_IN_PROGRESS: { label: 'RTO Work Progress', bg: 'bg-blue-50', text: 'text-blue-800', border: 'border-blue-200', icon: Clock },
  RTO_WORK_FAILED: { label: 'RTO Work Failed / Errors', bg: 'bg-rose-50', text: 'text-rose-800', border: 'border-rose-200', icon: AlertTriangle },
  RTO_WORK_COMPLETED: { label: 'RTO Work Completed', bg: 'bg-emerald-50', text: 'text-emerald-800', border: 'border-emerald-200', icon: CheckCircle2 },
  DEAL_DONE: { label: 'Deal Done', bg: 'bg-emerald-50', text: 'text-emerald-900', border: 'border-emerald-300', icon: Check },
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

const exportDateValue = (value: string | null) => value ? new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(value)) : '';

function StyledSelect({ value, options, onChange, placeholder = 'Select', disabled = false, searchable = false }: { value: string; options: SelectOption[]; onChange: (value: string) => void; placeholder?: string; disabled?: boolean; searchable?: boolean }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const selected = options.find((item) => item.value === value);
  const filteredOptions = useMemo(() => filterSelectOptions(options, query) as SelectOption[], [options, query]);
  const close = () => {
    setOpen(false);
    setQuery('');
  };

  return <div
    className="relative"
    onBlur={(event) => {
      const nextFocusedElement = event.relatedTarget;
      if (!nextFocusedElement || !event.currentTarget.contains(nextFocusedElement)) {
        close();
      }
    }}
  >
    <button type="button" disabled={disabled} aria-expanded={open} onClick={() => { if (open) close(); else setOpen(true); }} className={`flex w-full items-center justify-between rounded-xl border bg-gray-50 px-3 py-2.5 text-left text-sm text-gray-900 outline-none transition disabled:cursor-not-allowed disabled:opacity-60 ${open ? 'border-[#FFC107] bg-white ring-2 ring-[#FFC107]/20' : 'border-gray-200 hover:bg-white'}`}>
      <span className={selected?.value ? 'truncate' : 'truncate text-gray-500'}>{selected?.label || placeholder}</span>
      <ChevronDown className={`h-4 w-4 shrink-0 text-gray-500 transition-transform ${open ? 'rotate-180' : ''}`} />
    </button>
    {open ? <div className="absolute right-0 top-full z-50 mt-2 max-h-72 w-full min-w-[200px] overflow-y-auto rounded-2xl border border-gray-100 bg-white p-2 shadow-[0_14px_30px_rgba(15,23,42,0.16)]">
      {searchable ? <div className="relative mb-2">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onMouseDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
          placeholder="Search..."
          aria-label="Search options"
          autoFocus
          className="w-full rounded-xl border border-gray-200 bg-gray-50 py-2 pl-9 pr-3 text-sm text-gray-900 outline-none focus:border-[#FFC107] focus:bg-white focus:ring-2 focus:ring-[#FFC107]/20"
        />
      </div> : null}
      {filteredOptions.length === 0 ? <p className="px-3 py-2 text-sm text-gray-500">No matching options</p> : filteredOptions.map((item) => {
        const selectedItem = item.value === value;
        return <button key={`${item.value}-${item.label}`} type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => { onChange(item.value); close(); }} className={`flex w-full items-center justify-between rounded-xl px-4 py-2.5 text-left text-sm transition ${selectedItem ? 'bg-[#FFF8E6] font-semibold text-[#A85400]' : 'text-gray-800 hover:bg-gray-50'}`}>
          <span className="truncate">{item.label}</span>
          {selectedItem ? <Check className="h-4 w-4 shrink-0 text-[#FF9800]" /> : null}
        </button>;
      })}
    </div> : null}
  </div>;
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
  const [error, setError] = useState('');
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [openStatusDropdownId, setOpenStatusDropdownId] = useState<string | null>(null);
  const [updatingStatusId, setUpdatingStatusId] = useState<string | null>(null);
  const [pendingQuickStatus, setPendingQuickStatus] = useState<PendingQuickStatus | null>(null);
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
      : '/superadmin/accounts/rto-work-status';
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);

  // Older deep links (?edit= from Sold Vehicle, ?listingId= from Listings) now open the workspace pages.
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
    } catch { setError('Unable to load RTO records.'); } finally { setLoading(false); }
  }, [hasHydrated, isAuthenticated]);

  useEffect(() => { void loadRecords(); }, [loadRecords]);

  const statusFilterOptions = useMemo(() => buildRtoStatusFilterOptions(records), [records]);

  useEffect(() => {
    if (statusFilter !== 'ALL' && !statusFilterOptions.some((option) => option.value === statusFilter)) {
      setStatusFilter('ALL');
    }
  }, [statusFilter, statusFilterOptions]);

  const filteredRecords = useMemo(() => records.filter((record) => {
    const query = search.toLowerCase().trim();
    const matchesSearch = !query || [
      record.customerName, record.customerNumber, record.vehicleNumber, record.vehicleType, record.vehicleModel,
      record.brandName,
      record.sellerName, record.sellerNumber, record.purchaserName, record.purchaserNumber, record.rtoOffice, record.rtoAgentName,
    ].some((value) => String(value || '').toLowerCase().includes(query));
    return matchesSearch && (statusFilter === 'ALL' || record.rtoStatus === statusFilter);
  }), [records, search, statusFilter]);

  const exportColumns = useMemo(() => [
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
  ], []);

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
      toast.success(record?.sellAccountId ? 'RTO and connected Sold Vehicle record deleted successfully.' : 'RTO record deleted successfully.');
    } catch (caught) {
      const message = apiErrorMessage(caught, 'Unable to delete RTO record.');
      setError(message);
      toast.error(message);
    }
  };

  const phoneLink = (phoneNumber: string) => phoneNumber ? <a href={`tel:${phoneNumber}`} onClick={(event) => event.stopPropagation()} className="mt-0.5 flex items-center gap-1 text-xs text-blue-600 hover:underline"><Phone className="h-3 w-3 text-blue-500" />{phoneNumber}</a> : <span className="mt-0.5 block text-xs text-gray-400">No number</span>;

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
      const response = await api.put(`/recruitment/admin/rto-records/${record.id}`, { ...record, rtoStatus: nextStatus, statusRemark: remark });
      if (!response.data?.success) throw new Error(response.data?.error || 'Failed to update RTO status.');
      if (nextStatus === 'DEAL_DONE') {
        const lockResponse = await api.post(`/recruitment/admin/rto-records/${record.id}/lock`);
        if (!lockResponse.data?.success) throw new Error(lockResponse.data?.error || 'Unable to lock the record.');
        await loadRecords();
        toast.success('Deal Done record locked. It is now view-only.');
      } else {
        setRecords((prev) => prev.map((item) => (item.id === record.id
          ? { ...record, ...response.data.record, rtoStatus: normalizeRtoStatus(response.data.record?.rtoStatus || nextStatus) as Status }
          : item)));
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
        <span title={record.isLocked ? 'Locked: view only' : undefined} className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold whitespace-nowrap shrink-0 ${config.bg} ${config.text} ${config.border}`}>
          <StatusIcon className="h-3.5 w-3.5" />
          {config.label}
          {record.isLocked ? <LockKeyhole className="h-3.5 w-3.5" /> : null}
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
          className={`group inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold whitespace-nowrap shrink-0 transition-all shadow-xs hover:shadow-sm cursor-pointer select-none disabled:cursor-wait disabled:opacity-75 ${config.bg} ${config.text} ${config.border} hover:brightness-95`}
          title="Click to change RTO status"
          aria-haspopup="true"
          aria-expanded={isOpen}
        >
          {isUpdating ? <Loader2 className="h-3.5 w-3.5 animate-spin text-current" /> : <StatusIcon className="h-3.5 w-3.5" />}
          <span>{config.label}</span>
          <ChevronDown className={`h-3 w-3 text-current transition-transform duration-200 ${isOpen ? 'rotate-180' : 'opacity-70 group-hover:opacity-100'}`} />
        </button>

        {isOpen ? (
          <div
            className={`absolute left-0 ${openUpwards ? 'bottom-full mb-1.5' : 'top-full mt-1.5'} z-50 w-56 rounded-xl border border-gray-200 bg-white p-1.5 shadow-xl`}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider text-gray-400 border-b border-gray-100 mb-1">
              Change RTO Status
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
                  className={`flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-semibold transition cursor-pointer ${
                    isSelected
                      ? `${itemConfig.bg} ${itemConfig.text} ring-1 ring-inset ${itemConfig.border}`
                      : 'text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  <div className="flex items-center gap-2 truncate">
                    <ItemIcon className={`h-3.5 w-3.5 shrink-0 ${isSelected ? itemConfig.text : 'text-gray-400'}`} />
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

  return <div className="space-y-4">
    {error ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
    <div className="rounded-2xl border border-gray-100 bg-white shadow-sm">
      <div className="flex flex-col gap-4 border-b border-gray-100 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-md">
          <input type="text" placeholder="Search vehicle, customer, seller, purchaser, RTO..." value={search} onChange={(event) => setSearch(event.target.value)} className="w-full rounded-lg border border-gray-200 bg-white px-4 py-2 pl-10 text-sm font-medium text-gray-700 shadow-sm outline-none transition focus:border-[#FFC107] focus:ring-1 focus:ring-[#FFC107]" />
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          {search ? <button type="button" onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"><X size={14} /></button> : null}
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
          <div className="w-full sm:w-64">
            <StyledSelect searchable value={statusFilter} options={statusFilterOptions} onChange={setStatusFilter} />
          </div>
          <button type="button" onClick={() => { setSearch(''); setStatusFilter('ALL'); }} className="inline-flex items-center justify-center rounded-lg border border-gray-200 bg-white p-2 text-gray-500 shadow-sm transition hover:bg-gray-50" aria-label="Reset filters"><RefreshCw size={18} /></button>
          {canExportRto ? (
            <div className="relative">
              <button type="button" onClick={() => setExportMenuOpen((current) => !current)} disabled={filteredRecords.length === 0} className="flex w-full items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto" title="Export records">
                <Download size={18} />Export
              </button>
              {exportMenuOpen ? (
                <div className="absolute right-0 top-full z-40 mt-2 w-44 overflow-hidden rounded-xl border border-gray-200 bg-white py-1 shadow-xl">
                  <button type="button" onClick={() => exportRecords('csv')} className="block w-full px-4 py-2.5 text-left text-xs font-semibold text-gray-700 transition hover:bg-gray-50">CSV file</button>
                  <button type="button" onClick={() => exportRecords('xls')} className="block w-full border-t border-gray-100 px-4 py-2.5 text-left text-xs font-semibold text-gray-700 transition hover:bg-gray-50">Excel file</button>
                </div>
              ) : null}
            </div>
          ) : null}
          {canCreateRto ? <button type="button" onClick={() => router.push(`${accountBasePath}/new`)} className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#FFC107] px-4 py-2 text-sm font-semibold text-black shadow-sm transition hover:bg-[#E5AD06] sm:w-auto"><Plus size={18} />Add</button> : null}
        </div>
      </div>

      <div className="overflow-x-auto min-h-[360px]">
        {loading ? <BrandLoader variant="section" size="sm" bg="light" text="Loading RTO records..." /> : <table className="w-full text-left text-xs sm:text-sm">
          <thead className="border-b border-gray-200 bg-gray-50 text-[11px] font-semibold uppercase tracking-wider text-gray-500">
            <tr>
              <th className="px-3.5 py-3.5">Vehicle & Model</th>
              <th className="px-3 py-3.5">Customer Info</th>
              <th className="px-3 py-3.5">Seller Info</th>
              <th className="px-3 py-3.5">Purchaser Info</th>
              <th className="px-3 py-3.5">RTO Agent / Office</th>
              <th className="px-3 py-3.5">Expense</th>
              <th className="px-3 py-3.5">RTO Status</th>
              <th className="px-3.5 py-3.5 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {currentRecords.length > 0 ? (
              currentRecords.map((record, index) => (
                <tr key={record.id} onClick={() => router.push(`${accountBasePath}/${record.id}`)} className="cursor-pointer transition-colors hover:bg-gray-50/80">
                  <td className="px-3.5 py-3.5"><div className="flex items-start gap-1.5"><Car className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" /><div><p className="font-bold text-gray-900 whitespace-nowrap">{vehicleNumberDisplay(record.vehicleNumber)}</p><p className="text-xs text-gray-500">{record.brandName ? `${record.brandName} · ` : ''}{record.vehicleType} {record.vehicleModel}</p><span className="mt-0.5 inline-block rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-600">{label(record.hirePurchaseStatus)}</span></div></div></td>
                  <td className="px-3 py-3.5"><p className="font-semibold text-gray-900 max-w-[130px] truncate" title={record.customerName}>{record.customerName}</p>{phoneLink(record.customerNumber)}</td>
                  <td className="px-3 py-3.5"><p className="font-semibold text-gray-900 max-w-[140px] truncate" title={record.sellerName}>{record.sellerName}</p>{phoneLink(record.sellerNumber)}</td>
                  <td className="px-3 py-3.5"><p className="font-semibold text-gray-900 max-w-[140px] truncate" title={record.purchaserName}>{record.purchaserName}</p>{phoneLink(record.purchaserNumber)}</td>
                  <td className="px-3 py-3.5">
                    <p className="font-semibold text-gray-900 max-w-[150px] truncate" title={`${record.rtoAgentName || 'No Agent'}${record.rtoAgentCity ? ` (${record.rtoAgentCity})` : ''}`}>
                      {record.rtoAgentName || <span className="text-gray-400 font-normal">No Agent</span>}
                      {record.rtoAgentCity ? <span className="ml-1 text-xs font-medium text-amber-700">({record.rtoAgentCity})</span> : null}
                    </p>
                    {phoneLink(record.rtoAgentNumber)}
                    {record.rtoOffice ? (
                      <p className="mt-0.5 text-[11px] font-medium text-gray-500 truncate max-w-[150px]">
                        RTO: <span className="font-bold text-gray-800">{record.rtoOffice}</span>
                      </p>
                    ) : null}
                  </td>
                  <td className="px-3 py-3.5 whitespace-nowrap"><p className="text-xs font-semibold text-gray-900">{formatRtoCurrency(record.rtoExpenses)}</p></td>
                  <td className="px-3 py-3.5 whitespace-nowrap">{renderStatusDropdown(record, index)}</td>
                  <td className="px-3.5 py-3.5 text-right">
                    <div onClick={(event) => event.stopPropagation()}>
                        <PortalActionDropdown
                          align="right"
                          items={[
                            {
                              label: 'View Details',
                              icon: <Eye className="h-4 w-4 text-gray-500" />,
                              onClick: () => router.push(`${accountBasePath}/${record.id}`),
                            },
                            ...(canUpdateRto && !record.isLocked ? [{
                              label: 'Transfer Workspace / Edit',
                              icon: <ClipboardCheck className="h-4 w-4 text-amber-600" />,
                              onClick: () => openWorkspace(record),
                            }] : []),
                            ...(canExportRto ? [{
                              label: 'Download Record',
                              icon: <Download className="h-4 w-4 text-gray-500" />,
                              onClick: () => downloadRecord(record),
                            }] : []),
                            ...(canDeleteRto && !record.isLocked ? [{
                              label: 'Delete Record',
                              icon: <Trash2 className="h-4 w-4 text-red-500" />,
                              variant: 'danger' as const,
                              onClick: () => void remove(record.id),
                            }] : []),
                            ...(record.isLocked ? [{
                              label: 'Locked · View only',
                              icon: <LockKeyhole className="h-4 w-4 text-slate-500" />,
                              onClick: () => router.push(`${accountBasePath}/${record.id}`),
                            }] : []),
                          ]}
                        />
                      </div>
                  </td>
                </tr>
              ))
            ) : (
              <tr><td colSpan={8} className="py-12 text-center text-gray-500"><FileText className="mx-auto mb-2 h-10 w-10 text-gray-300" /><p className="font-medium text-gray-700">No RTO records found matching your filters.</p><p className="mt-1 text-xs text-gray-400">Use Add to create a new RTO record.</p></td></tr>
            )}
          </tbody>
        </table>}
      </div>

      {filteredRecords.length > 0 && (
        <div className="flex flex-col items-center justify-between gap-4 border-t border-gray-100 p-4 sm:flex-row">
          <div className="flex flex-col items-center gap-2 text-sm text-gray-600 sm:flex-row sm:gap-3">
            <span>Showing <span className="font-bold text-gray-900">{(currentPage - 1) * rowsPerPage + 1}</span> to <span className="font-bold text-gray-900">{Math.min(currentPage * rowsPerPage, filteredRecords.length)}</span> of <span className="font-bold text-gray-900">{filteredRecords.length}</span> records</span>
            <div className="flex items-center gap-2"><span className="hidden text-gray-400 sm:inline">|</span><span>Rows per page:</span><select value={rowsPerPage} onChange={(event) => { setRowsPerPage(Number(event.target.value)); setCurrentPage(1); }} className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-sm font-medium text-gray-700 shadow-sm outline-none transition focus:border-[#FFC107] focus:ring-1 focus:ring-[#FFC107]"><option value={10}>10</option><option value={20}>20</option><option value={50}>50</option><option value={100}>100</option></select></div>
          </div>
          <div className="flex items-center gap-1">
            <button type="button" onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))} disabled={currentPage === 1} className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 shadow-sm transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"><ChevronLeft className="h-4 w-4" /><span className="hidden sm:inline">Previous</span></button>
            <div className="flex items-center gap-1 px-1">{paginationItems.map((item, index) => typeof item === 'number' ? <button key={item} type="button" onClick={() => setCurrentPage(item)} className={`h-8 w-8 rounded-lg text-xs font-bold transition ${currentPage === item ? 'bg-[#FFC107] text-black shadow-sm' : 'text-gray-600 hover:bg-gray-100'}`}>{item}</button> : <span key={`ellipsis-${index}`} className="px-1 text-xs font-bold text-gray-400">...</span>)}</div>
            <button type="button" onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))} disabled={currentPage === totalPages || totalPages === 1} className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 shadow-sm transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"><span className="hidden sm:inline">Next</span><ChevronRight className="h-4 w-4" /></button>
          </div>
        </div>
      )}
    </div>

    {pendingQuickStatus ? (
      <RemarkDialog
        title={`Change status to "${statusConfig[pendingQuickStatus.nextStatus].label}"`}
        description={pendingQuickStatus.nextStatus === 'DEAL_DONE'
          ? 'Deal Done locks this record: nobody can edit, delete or change its status afterwards.'
          : `${vehicleNumberDisplay(pendingQuickStatus.record.vehicleNumber)} · the remark is saved in the status activity.`}
        confirmLabel={pendingQuickStatus.nextStatus === 'DEAL_DONE' ? 'Save & lock' : 'Update status'}
        busy={updatingStatusId === pendingQuickStatus.record.id}
        onCancel={() => setPendingQuickStatus(null)}
        onConfirm={(remark) => confirmQuickStatusChange(remark)}
      />
    ) : null}
  </div>;
}
