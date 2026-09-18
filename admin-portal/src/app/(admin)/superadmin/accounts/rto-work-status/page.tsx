/* eslint-disable react-hooks/set-state-in-effect */

'use client';

import { ComponentType, FormEvent, ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Car, Check, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, Clock, Download, Eye, FileText, Filter, MoreVertical, Phone, Plus, RefreshCw, Search, Trash2, X, Pencil } from 'lucide-react';
import api from '@/lib/api';
import { getAccountCreatePermissions, getAccountDeletePermissions, getAccountExportPermission, getAccountUpdatePermissions } from '@/lib/accountsPermissions';
import { buildPaginationItems } from '@/lib/paginationUtils';
import { hasAnyPermission } from '@/lib/permissionUtils';
import { downloadTableFile } from '@/lib/tabularExport';
import { isAuthReady } from '@/lib/authHydration';
import BrandLoader from '@/components/ui/BrandLoader';
import { usePathname, useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';

type Status = 'PENDING' | 'IN_PROGRESS' | 'DOCUMENT_REQUIRED' | 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'COMPLETED' | 'CANCELLED';
type Validity = 'VALID' | 'EXPIRED' | 'NOT_AVAILABLE' | 'LIFETIME' | 'NOT_APPLICABLE' | 'PENDING';
type HsrpStatus = 'YES' | 'NO' | 'PENDING' | 'NOT_APPLICABLE';
type HirePurchase = 'PENDING' | 'ACTIVE' | 'TERMINATED' | 'NOT_APPLICABLE';

type RtoRecord = {
  id: string;
  customerName: string; customerNumber: string; vehicleNumber: string; vehicleType: string; vehicleModel: string;
  hirePurchaseStatus: HirePurchase; taxStatus: Validity; taxValidUntil: string | null;
  fitnessStatus: Validity; fitnessValidUntil: string | null; insuranceStatus: Validity; insuranceValidUntil: string | null;
  pucStatus: Validity; pucValidUntil: string | null; hsrpStatus: HsrpStatus;
  sellerName: string; sellerNumber: string; purchaserName: string; purchaserNumber: string;
  rtoOffice: string; rtoAgentName: string; rtoAgentState: string; rtoAgentCity: string; rtoAgentNumber: string;
  rtoExpenses: number; rtoExpensesAdvance: number; rtoExpensesBalance: number; documentSendDate: string | null;
  rtoStatus: Status; noteSheet: string | null; vehicleMaintenanceCost: number; hourRunning: number | null;
};

type FormState = Omit<RtoRecord, 'id' | 'rtoExpensesBalance'>;
type Option = { id: number; name: string; stateCode?: string };
type CategoryOption = { id: string; name: string };
type SelectOption = { value: string; label: string };
type StatusConfig = { label: string; bg: string; text: string; border: string; icon: ComponentType<{ className?: string }> };
type ExportFormat = 'csv' | 'xls';

const emptyForm: FormState = {
  customerName: '', customerNumber: '', vehicleNumber: '', vehicleType: '', vehicleModel: '', hirePurchaseStatus: 'PENDING',
  taxStatus: 'VALID', taxValidUntil: null, fitnessStatus: 'VALID', fitnessValidUntil: null,
  insuranceStatus: 'VALID', insuranceValidUntil: null, pucStatus: 'VALID', pucValidUntil: null,
  hsrpStatus: 'NO', sellerName: '', sellerNumber: '', purchaserName: '', purchaserNumber: '', rtoOffice: '',
  rtoAgentName: '', rtoAgentState: '', rtoAgentCity: '', rtoAgentNumber: '', rtoExpenses: 0, rtoExpensesAdvance: 0,
  documentSendDate: null, rtoStatus: 'PENDING', noteSheet: '', vehicleMaintenanceCost: 0, hourRunning: null,
};

const statuses: Status[] = ['PENDING', 'IN_PROGRESS', 'DOCUMENT_REQUIRED', 'SUBMITTED', 'APPROVED', 'REJECTED', 'COMPLETED', 'CANCELLED'];
const validities: Validity[] = ['VALID', 'EXPIRED'];
const statusConfig: Record<Status, StatusConfig> = {
  PENDING: { label: 'Pending', bg: 'bg-amber-50', text: 'text-amber-800', border: 'border-amber-200', icon: Clock },
  IN_PROGRESS: { label: 'In Progress', bg: 'bg-blue-50', text: 'text-blue-800', border: 'border-blue-200', icon: Clock },
  DOCUMENT_REQUIRED: { label: 'Document Required', bg: 'bg-orange-50', text: 'text-orange-800', border: 'border-orange-200', icon: AlertTriangle },
  SUBMITTED: { label: 'Submitted', bg: 'bg-sky-50', text: 'text-sky-800', border: 'border-sky-200', icon: FileText },
  APPROVED: { label: 'Approved', bg: 'bg-emerald-50', text: 'text-emerald-800', border: 'border-emerald-200', icon: CheckCircle2 },
  REJECTED: { label: 'Rejected', bg: 'bg-rose-50', text: 'text-rose-800', border: 'border-rose-200', icon: AlertTriangle },
  COMPLETED: { label: 'Completed', bg: 'bg-emerald-50', text: 'text-emerald-800', border: 'border-emerald-200', icon: CheckCircle2 },
  CANCELLED: { label: 'Cancelled', bg: 'bg-gray-50', text: 'text-gray-700', border: 'border-gray-200', icon: X },
};
const label = (value: string) => value.replaceAll('_', ' ').replace(/\b\w/g, (char) => char.toUpperCase());
const dateValue = (value: string | null) => value ? new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(value)) : '—';

const exportDateValue = (value: string | null) => value ? new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(value)) : '';

function Field({ label: fieldLabel, children, wide = false }: { label: string; children: ReactNode; wide?: boolean }) {
  const isRequired = fieldLabel.trim().endsWith('*');
  const labelText = isRequired ? fieldLabel.replace(/\s*\*$/, '') : fieldLabel;
  return <div className={wide ? 'md:col-span-2' : ''}><label className="mb-1 block text-xs font-semibold text-gray-600">{labelText}{isRequired ? <span className="ml-1 text-sm font-black text-red-500">*</span> : null}</label>{children}</div>;
}

function StyledSelect({ value, options, onChange, placeholder = 'Select', disabled = false }: { value: string; options: SelectOption[]; onChange: (value: string) => void; placeholder?: string; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const selected = options.find((item) => item.value === value);

  return <div className="relative" onBlur={() => window.setTimeout(() => setOpen(false), 120)}>
    <button type="button" disabled={disabled} onClick={() => setOpen((current) => !current)} className={`flex w-full items-center justify-between rounded-xl border bg-gray-50 px-3 py-2.5 text-left text-sm text-gray-900 outline-none transition disabled:cursor-not-allowed disabled:opacity-60 ${open ? 'border-[#FFC107] bg-white ring-2 ring-[#FFC107]/20' : 'border-gray-200 hover:bg-white'}`}>
      <span className={selected?.value ? 'truncate' : 'truncate text-gray-500'}>{selected?.label || placeholder}</span>
      <ChevronDown className={`h-4 w-4 shrink-0 text-gray-500 transition-transform ${open ? 'rotate-180' : ''}`} />
    </button>
    {open ? <div className="absolute right-0 top-full z-50 mt-2 max-h-72 w-full min-w-[200px] overflow-y-auto rounded-2xl border border-gray-100 bg-white p-2 shadow-[0_14px_30px_rgba(15,23,42,0.16)]">
      {options.map((item) => {
        const selectedItem = item.value === value;
        return <button key={`${item.value}-${item.label}`} type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => { onChange(item.value); setOpen(false); }} className={`flex w-full items-center justify-between rounded-xl px-4 py-2.5 text-left text-sm transition ${selectedItem ? 'bg-[#FFF8E6] font-semibold text-[#A85400]' : 'text-gray-800 hover:bg-gray-50'}`}>
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

const inputClass = 'w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-900 outline-none transition focus:border-amber-500 focus:bg-white focus:ring-2 focus:ring-amber-500/20';

export default function RTOWorkStatusPage() {
  const [records, setRecords] = useState<RtoRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [form, setForm] = useState<FormState>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selected, setSelected] = useState<RtoRecord | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [error, setError] = useState('');
  const [states, setStates] = useState<Option[]>([]);
  const [cities, setCities] = useState<Option[]>([]);
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [actionMenuId, setActionMenuId] = useState<string | null>(null);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
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
      setRecords(response.data?.records || []);
    } catch { setError('Unable to load RTO records.'); } finally { setLoading(false); }
  }, [hasHydrated, isAuthenticated]);

  useEffect(() => { void loadRecords(); }, [loadRecords]);
  useEffect(() => {
    if (!isAuthReady(hasHydrated, isAuthenticated)) return;

    const loadCategories = async () => {
      try {
        const response = await api.get('/master/categories');
        setCategories(response.data?.data || []);
      } catch { setError('Unable to load vehicle categories.'); }
    };
    void loadCategories();
  }, [hasHydrated, isAuthenticated]);

  useEffect(() => {
    if (!isAuthReady(hasHydrated, isAuthenticated)) return;

    const loadStates = async () => {
      try {
        const countriesResponse = await api.get('/locations/countries');
        const india = (countriesResponse.data || []).find((item: { name?: string }) => item.name?.toLowerCase() === 'india');
        if (india?.id) {
          const response = await api.get(`/locations/states/${india.id}`);
          setStates(response.data || []);
        }
      } catch { setError('Unable to load states.'); }
    };
    void loadStates();
  }, [hasHydrated, isAuthenticated]);

  const statusFilterOptions = useMemo(() => {
    const counts = statuses.reduce((accumulator, status) => ({ ...accumulator, [status]: 0 }), {} as Record<Status, number>);
    records.forEach((record) => { counts[record.rtoStatus] += 1; });
    return [
      { value: 'ALL', label: `All RTO Statuses (${records.length})` },
      ...statuses.filter((status) => counts[status] > 0).map((status) => ({ value: status, label: `${label(status)} (${counts[status]})` })),
    ];
  }, [records]);

  useEffect(() => {
    if (statusFilter !== 'ALL' && !statusFilterOptions.some((option) => option.value === statusFilter)) {
      setStatusFilter('ALL');
    }
  }, [statusFilter, statusFilterOptions]);

  const filteredRecords = useMemo(() => records.filter((record) => {
    const query = search.toLowerCase().trim();
    const matchesSearch = !query || [
      record.customerName, record.customerNumber, record.vehicleNumber, record.vehicleType, record.vehicleModel,
      record.sellerName, record.sellerNumber, record.purchaserName, record.purchaserNumber, record.rtoOffice, record.rtoAgentName,
    ].some((value) => value.toLowerCase().includes(query));
    return matchesSearch && (statusFilter === 'ALL' || record.rtoStatus === statusFilter);
  }), [records, search, statusFilter]);

  const exportColumns = useMemo(() => [
    { header: 'Customer Name', value: (record: RtoRecord) => record.customerName },
    { header: 'Customer Number', value: (record: RtoRecord) => record.customerNumber },
    { header: 'Vehicle Number', value: (record: RtoRecord) => vehicleNumberDisplay(record.vehicleNumber) },
    { header: 'Vehicle Type', value: (record: RtoRecord) => record.vehicleType },
    { header: 'Vehicle Model', value: (record: RtoRecord) => record.vehicleModel },
    { header: 'Hours Running', value: (record: RtoRecord) => record.hourRunning ?? '' },
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
    { header: 'RTO Status', value: (record: RtoRecord) => label(record.rtoStatus) },
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

  const recordCounts = useMemo(() => ({
    all: records.length,
    pending: records.filter((record) => record.rtoStatus === 'PENDING').length,
    completed: records.filter((record) => record.rtoStatus === 'COMPLETED').length,
  }), [records]);

  useEffect(() => {
    setCurrentPage(1);
  }, [search, statusFilter, records]);

  const totalPages = Math.ceil(filteredRecords.length / rowsPerPage) || 1;
  const currentRecords = useMemo(() => {
    return filteredRecords.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage);
  }, [filteredRecords, currentPage, rowsPerPage]);

  const paginationItems = useMemo(() => buildPaginationItems(currentPage, totalPages), [currentPage, totalPages]);

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((current) => ({ ...current, [key]: value }));
  const openCreate = () => { if (!canCreateRto) return; setEditingId(null); setForm(emptyForm); setCities([]); setError(''); setTermsAccepted(false); setModalOpen(true); };
  const openEdit = async (record: RtoRecord) => {
    if (!canUpdateRto) return;
    setEditingId(record.id); setForm({ ...record, taxStatus: record.taxStatus === 'EXPIRED' ? 'EXPIRED' : 'VALID', fitnessStatus: record.fitnessStatus === 'EXPIRED' ? 'EXPIRED' : 'VALID', insuranceStatus: record.insuranceStatus === 'EXPIRED' ? 'EXPIRED' : 'VALID', pucStatus: record.pucStatus === 'EXPIRED' ? 'EXPIRED' : 'VALID', hsrpStatus: record.hsrpStatus === 'YES' ? 'YES' : 'NO', noteSheet: record.noteSheet || '' }); setError(''); setTermsAccepted(false); setModalOpen(true);
    const state = states.find((item) => item.name.toLowerCase() === record.rtoAgentState.toLowerCase());
    if (state) {
      const response = await api.get(`/locations/cities/${state.id}`);
      setCities(response.data || []);
    }
  };
  const changeState = async (stateName: string) => {
    update('rtoAgentState', stateName); update('rtoAgentCity', ''); setCities([]);
    const state = states.find((item) => item.name === stateName);
    if (state) {
      try { const response = await api.get(`/locations/cities/${state.id}`); setCities(response.data || []); } catch { setError('Unable to load cities.'); }
    }
  };

  const save = async (event: FormEvent) => {
    event.preventDefault(); setError('');
    if (editingId ? !canUpdateRto : !canCreateRto) {
      setError('You do not have permission to manage RTO records.');
      return;
    }
    if (!termsAccepted) {
      setError('You must accept the Terms & Conditions to save the RTO record.');
      return;
    }
    if (!form.customerName || !form.vehicleNumber || !form.vehicleType || !form.vehicleModel || !form.sellerName || !form.purchaserName || !form.rtoOffice || !form.rtoAgentName || !form.rtoAgentState || !form.rtoAgentCity) {
      setError('Please fill all required fields.'); return;
    }
    const missingValidity = [
      ['Tax Validity', form.taxStatus, form.taxValidUntil],
      ['Fitness Validity', form.fitnessStatus, form.fitnessValidUntil],
      ['Insurance Validity', form.insuranceStatus, form.insuranceValidUntil],
      ['PUC Validity', form.pucStatus, form.pucValidUntil],
    ].find(([, status, date]) => !status || ((status === 'VALID' || status === 'EXPIRED') && !date));
    if (missingValidity) { setError(`${missingValidity[0]} status and date are required.`); return; }
    if (!form.hirePurchaseStatus) { setError('Hire Purchase is required.'); return; }
    if (!form.hsrpStatus) { setError('HSRP Valid is required.'); return; }
    if (Number(form.rtoExpenses) <= 0) { setError('RTO Expenses is required.'); return; }
    if (Number(form.vehicleMaintenanceCost) <= 0) { setError('Vehicle Maintenance Cost is required.'); return; }
    if (!form.hourRunning || Number(form.hourRunning) <= 0) { setError('Hours Running is required.'); return; }
    if (Number(form.rtoExpensesAdvance) > Number(form.rtoExpenses)) { setError('RTO Expenses Advance cannot exceed RTO Expenses.'); return; }
    try {
      setSaving(true);
      const response = editingId ? await api.put(`/recruitment/admin/rto-records/${editingId}`, form) : await api.post('/recruitment/admin/rto-records', form);
      if (!response.data?.success) throw new Error(response.data?.error || 'Save failed.');
      setModalOpen(false); await loadRecords();
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Unable to save RTO record.'); } finally { setSaving(false); }
  };

  const remove = async (id: string) => {
    if (!canDeleteRto) return;
    if (!window.confirm('Delete this RTO record? This action cannot be undone.')) return;
    try { await api.delete(`/recruitment/admin/rto-records/${id}`); await loadRecords(); } catch { setError('Unable to delete RTO record.'); }
  };

  const currency = (value: number) => `₹${Number(value || 0).toLocaleString('en-IN')}`;
  const phoneLink = (phoneNumber: string) => phoneNumber ? <a href={`tel:${phoneNumber}`} onClick={(event) => event.stopPropagation()} className="mt-0.5 flex items-center gap-1 text-xs text-blue-600 hover:underline"><Phone className="h-3 w-3 text-blue-500" />{phoneNumber}</a> : <span className="mt-0.5 block text-xs text-gray-400">No number</span>;
  const validityCell = (status: Validity, date: string | null) => <span className="whitespace-nowrap">{label(status)}{date ? <small className="block text-gray-400">{dateValue(date)}</small> : null}</span>;
  const statusPill = (status: Status) => {
    const config = statusConfig[status] || statusConfig.PENDING;
    const StatusIcon = config.icon;
    return <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold whitespace-nowrap shrink-0 ${config.bg} ${config.text} ${config.border}`}><StatusIcon className="h-3.5 w-3.5" />{config.label}</span>;
  };
  const columns = ['CUSTOMER NAME', 'CUSTOMER NUMBER', 'VEHICLE NUMBER', 'VEHICLE TYPE', 'VEHICLE MODAL', 'HIRE PURCHASE', 'TAX VALIDITY', 'FITNESS VALIDITY', 'INSURANCE VALIDITY', 'PUC VALIDITY', 'HSRP VALID', 'SELLER NAME', 'SELLER NUMBER', 'PURCHESER NAME', 'PURCHESER NUMBER', 'RTO AGENT NAME LOCATION', 'RTO AGENT NUMBER', 'RTO EXPENSES', 'RTO EXPENSES ADVANCE', 'RTO EXPENSES BALANCE', 'DOCUMENT SEND DATE', 'RTO STATUS', 'NOTE SHEET'];

  return <div className="space-y-4">
    {error && !modalOpen ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
    <div className="rounded-2xl border border-gray-100 bg-white shadow-sm">
      <div className="flex flex-col gap-4 border-b border-gray-100 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-md">
          <input type="text" placeholder="Search vehicle, customer, seller, purchaser, RTO..." value={search} onChange={(event) => setSearch(event.target.value)} className="w-full rounded-lg border border-gray-200 bg-white px-4 py-2 pl-10 text-sm font-medium text-gray-700 shadow-sm outline-none transition focus:border-[#FFC107] focus:ring-1 focus:ring-[#FFC107]" />
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          {search ? <button type="button" onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"><X size={14} /></button> : null}
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
          <div className="w-full sm:w-64">
            <StyledSelect value={statusFilter} options={statusFilterOptions} onChange={setStatusFilter} />
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
          {canCreateRto ? <button type="button" onClick={openCreate} className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#FFC107] px-4 py-2 text-sm font-semibold text-black shadow-sm transition hover:bg-[#E5AD06] sm:w-auto"><Plus size={18} />Add</button> : null}
        </div>
      </div>

      <div className="overflow-x-auto min-h-[360px] [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
        {loading ? <BrandLoader variant="section" size="sm" bg="light" text="Loading RTO records..." /> : <table className="w-full min-w-[1320px] text-left text-sm">
          <thead className="border-b border-gray-200 bg-gray-50 text-xs font-semibold uppercase tracking-wider text-gray-500">
            <tr>
              <th className="px-5 py-4">Vehicle & Model</th>
              <th className="px-5 py-4">Customer Info</th>
              <th className="px-5 py-4">Seller Info</th>
              <th className="px-5 py-4">Purchaser Info</th>
              <th className="px-5 py-4">RTO Agent / Office</th>
              <th className="px-5 py-4">Financials</th>
              <th className="px-5 py-4">RTO Status</th>
              <th className="px-5 py-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {currentRecords.length > 0 ? (
              currentRecords.map((record, idx) => {
                const isNearBottom = currentRecords.length > 3 && idx >= currentRecords.length - 2;
                return (
                  <tr key={record.id} onClick={() => router.push(`${accountBasePath}/${record.id}`)} className="cursor-pointer transition-colors hover:bg-gray-50/80">
                    <td className="px-5 py-4"><div className="flex items-start gap-2"><Car className="mt-1 h-4 w-4 shrink-0 text-amber-600" /><div><p className="font-bold text-gray-900">{vehicleNumberDisplay(record.vehicleNumber)}</p><p className="text-xs text-gray-500">{record.vehicleType} {record.vehicleModel}</p><span className="mt-0.5 inline-block rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-600">{label(record.hirePurchaseStatus)}</span></div></div></td>
                    <td className="px-5 py-4"><p className="font-semibold text-gray-900">{record.customerName}</p>{phoneLink(record.customerNumber)}</td>
                    <td className="px-5 py-4"><p className="font-semibold text-gray-900">{record.sellerName}</p>{phoneLink(record.sellerNumber)}</td>
                    <td className="px-5 py-4"><p className="font-semibold text-gray-900">{record.purchaserName}</p>{phoneLink(record.purchaserNumber)}</td>
                    <td className="px-5 py-4">
                      <p className="font-semibold text-gray-900">
                        {record.rtoAgentName}
                        {record.rtoAgentCity ? <span className="ml-1 text-xs font-medium text-amber-700">({record.rtoAgentCity})</span> : null}
                      </p>
                      {phoneLink(record.rtoAgentNumber)}
                      {record.rtoOffice ? (
                        <p className="mt-0.5 text-[11px] font-medium text-gray-500">
                          RTO Office: <span className="font-bold text-gray-800">{record.rtoOffice}</span>
                        </p>
                      ) : null}
                    </td>
                    <td className="px-5 py-4"><p className="text-xs text-gray-500">Expense: <span className="font-medium text-gray-900">{currency(record.rtoExpenses)}</span></p><p className="mt-0.5 text-xs font-semibold text-emerald-700">Bal: {currency(record.rtoExpensesBalance)}</p></td>
                    <td className="px-5 py-4">{statusPill(record.rtoStatus)}<p className="mt-1 text-[11px] text-gray-400">Doc: {dateValue(record.documentSendDate)}</p></td>
                    <td className="px-5 py-4 text-right">
                      <div className="relative flex justify-end">
                        <button
                          type="button"
                          onClick={(event) => { event.stopPropagation(); setActionMenuId(actionMenuId === record.id ? null : record.id); }}
                          title="Actions"
                          className={`rounded-full border p-2 transition-colors hover:bg-gray-50 ${actionMenuId === record.id ? 'border-[#FFC107] bg-amber-50 text-gray-900' : 'border-gray-200 text-gray-500'}`}
                        >
                          <MoreVertical className="h-4 w-4" />
                        </button>
                        {actionMenuId === record.id ? (
                          <div
                            onClick={(event) => event.stopPropagation()}
                            className={`absolute right-0 ${isNearBottom ? 'bottom-full mb-2' : 'top-full mt-2'} z-50 w-48 overflow-hidden rounded-2xl border border-gray-200 bg-white py-1 shadow-2xl`}
                          >
                            <button type="button" onClick={() => { router.push(`${accountBasePath}/${record.id}`); setActionMenuId(null); }} className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-xs font-semibold text-gray-700 transition hover:bg-gray-50"><Eye className="h-4 w-4 text-gray-500" />View Details</button>
                            {canUpdateRto ? <button type="button" onClick={() => { setActionMenuId(null); void openEdit(record); }} className="flex w-full items-center gap-3 border-t border-gray-100 px-4 py-2.5 text-left text-xs font-semibold text-blue-600 transition hover:bg-blue-50"><Pencil className="h-4 w-4 text-blue-500" />Edit Record</button> : null}
                            {canDeleteRto ? <button type="button" onClick={() => { setActionMenuId(null); void remove(record.id); }} className="flex w-full items-center gap-3 border-t border-gray-100 px-4 py-2.5 text-left text-xs font-semibold text-red-600 transition hover:bg-red-50"><Trash2 className="h-4 w-4 text-red-500" />Delete Record</button> : null}
                          </div>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })
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
    <div className="hidden overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b border-gray-100 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
          {([
            ['ALL', `All RTO Records (${recordCounts.all})`],
            ['PENDING', `Pending (${recordCounts.pending})`],
            ['COMPLETED', `Completed (${recordCounts.completed})`],
          ] as const).map(([value, title]) => (
            <button key={value} type="button" onClick={() => setStatusFilter(value)} className={`whitespace-nowrap rounded-full px-4 py-2 text-xs font-semibold transition cursor-pointer sm:text-sm ${statusFilter === value ? 'bg-[#FFC107] text-black shadow-2xs font-extrabold' : 'border border-gray-200 bg-white text-gray-600 hover:border-[#FFC107] hover:text-gray-900'}`}>
              {title}
            </button>
          ))}
        </div>
        <button onClick={openCreate} className="inline-flex items-center justify-center gap-2 rounded-xl bg-amber-500 px-4 py-2.5 text-sm font-bold text-gray-950 transition hover:bg-amber-600"><Plus size={17} /> Add RTO Record</button>
      </div>
      <div className="flex flex-col gap-3 border-b border-gray-100 bg-gray-50/40 p-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="relative w-full xl:max-w-3xl"><Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" size={17} /><input className={`${inputClass} h-11 rounded-full bg-white pl-10`} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search vehicle, customer, RTO office or agent..." /></div>
        <div className="flex flex-wrap items-center gap-2"><Filter size={16} className="text-gray-400" /><div className="w-full sm:w-64"><StyledSelect value={statusFilter} options={statusFilterOptions} onChange={setStatusFilter} /></div><button onClick={() => { setSearch(''); setStatusFilter('ALL'); }} className="rounded-xl bg-gray-100 p-3 text-gray-600 hover:bg-gray-200" aria-label="Reset filters"><RefreshCw size={17} /></button></div>
      </div>
      <div className="overflow-x-auto"><table className="min-w-[2600px] w-full text-left text-sm"><thead className="border-b border-gray-200 bg-gray-50 text-[10px] font-bold uppercase tracking-wider text-gray-500"><tr>{columns.map((column) => <th key={column} className="whitespace-nowrap px-5 py-4">{column}</th>)}<th className="sticky right-0 bg-gray-50 px-5 py-4">ACTION</th></tr></thead><tbody className="divide-y divide-gray-100">{loading ? <tr><td colSpan={24} className="py-16 text-center text-gray-500">Loading RTO records...</td></tr> : filteredRecords.length ? filteredRecords.map((record) => <tr key={record.id} className="hover:bg-gray-50"><td className="px-5 py-4 font-semibold text-gray-900">{record.customerName}</td><td className="px-5 py-4">{record.customerNumber || '—'}</td><td className="px-5 py-4 font-bold text-gray-900">{record.vehicleNumber}</td><td className="px-5 py-4">{record.vehicleType}</td><td className="px-5 py-4">{record.vehicleModel}</td><td className="px-5 py-4">{label(record.hirePurchaseStatus)}</td><td className="px-5 py-4">{validityCell(record.taxStatus, record.taxValidUntil)}</td><td className="px-5 py-4">{validityCell(record.fitnessStatus, record.fitnessValidUntil)}</td><td className="px-5 py-4">{validityCell(record.insuranceStatus, record.insuranceValidUntil)}</td><td className="px-5 py-4">{validityCell(record.pucStatus, record.pucValidUntil)}</td><td className="px-5 py-4">{label(record.hsrpStatus)}</td><td className="px-5 py-4">{record.sellerName}</td><td className="px-5 py-4">{record.sellerNumber || '—'}</td><td className="px-5 py-4">{record.purchaserName}</td><td className="px-5 py-4">{record.purchaserNumber || '—'}</td><td className="px-5 py-4">{record.rtoAgentName}<small className="block text-gray-400">{record.rtoAgentCity}, {record.rtoAgentState}</small></td><td className="px-5 py-4">{record.rtoAgentNumber || '—'}</td><td className="px-5 py-4">₹{record.rtoExpenses.toLocaleString('en-IN')}</td><td className="px-5 py-4">₹{record.rtoExpensesAdvance.toLocaleString('en-IN')}</td><td className="px-5 py-4 font-semibold">₹{record.rtoExpensesBalance.toLocaleString('en-IN')}</td><td className="px-5 py-4">{dateValue(record.documentSendDate)}</td><td className="px-5 py-4"><span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-700">{label(record.rtoStatus)}</span></td><td className="max-w-xs px-5 py-4">{record.noteSheet || '—'}</td><td className="sticky right-0 bg-white px-5 py-4"><div className="relative flex justify-end"><button type="button" onClick={() => setActionMenuId(actionMenuId === record.id ? null : record.id)} className="rounded-lg p-2 text-gray-500 transition hover:bg-gray-100" aria-label="Open actions"><MoreVertical size={17} /></button>{actionMenuId === record.id ? <div className="absolute right-0 top-full z-20 mt-1 w-40 rounded-xl border border-gray-200 bg-white p-1 shadow-xl"><button type="button" onClick={() => { setSelected(record); setActionMenuId(null); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-semibold text-gray-700 hover:bg-gray-100"><Eye size={14} /> View</button><button type="button" onClick={() => { setActionMenuId(null); void openEdit(record); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-semibold text-gray-700 hover:bg-gray-100"><Pencil size={14} /> Edit</button><button type="button" onClick={() => { setActionMenuId(null); void remove(record.id); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-semibold text-red-600 hover:bg-red-50"><Trash2 size={14} /> Delete</button></div> : null}</div></td></tr>) : <tr><td colSpan={24} className="py-16 text-center text-gray-500"><FileText className="mx-auto mb-2 text-gray-300" size={36} />No RTO records found.</td></tr>}</tbody></table></div>
    </div>

    {selected ? <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"><div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white p-6 shadow-xl"><div className="mb-5 flex items-center justify-between"><h2 className="text-xl font-bold text-gray-900">RTO Record Details</h2><button onClick={() => setSelected(null)} className="rounded-lg p-2 hover:bg-gray-100"><X size={18} /></button></div><div className="grid gap-3 text-sm sm:grid-cols-2">{[['Vehicle Number', vehicleNumberDisplay(selected.vehicleNumber)], ['Vehicle Type', selected.vehicleType], ['Vehicle Model', selected.vehicleModel], ['Customer', `${selected.customerName} (${selected.customerNumber || '—'})`], ['Seller', `${selected.sellerName} (${selected.sellerNumber || '—'})`], ['Purchaser', `${selected.purchaserName} (${selected.purchaserNumber || '—'})`], ['RTO Office', selected.rtoOffice], ['Agent', `${selected.rtoAgentName}, ${selected.rtoAgentCity}, ${selected.rtoAgentState}`], ['Agent Number', selected.rtoAgentNumber || '—'], ['RTO Status', label(selected.rtoStatus)], ['RTO Balance', `₹${selected.rtoExpensesBalance.toLocaleString('en-IN')}`], ['Hour Running', selected.hourRunning !== null ? `${selected.hourRunning} HR` : '—'], ['Maintenance Cost', `₹${selected.vehicleMaintenanceCost.toLocaleString('en-IN')}`]].map(([key, value]) => <div key={key} className="rounded-xl bg-gray-50 p-3"><span className="block text-xs text-gray-500">{key}</span><span className="font-semibold text-gray-900">{value}</span></div>)}</div></div></div> : null}

    {modalOpen ? <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 p-4"><div className="mx-auto my-4 max-w-6xl rounded-2xl bg-white shadow-xl"><div className="flex items-center justify-between border-b border-gray-100 p-5"><div><h2 className="text-xl font-bold text-gray-900">{editingId ? 'Edit RTO Record' : 'Add RTO Record'}</h2><p className="text-xs text-gray-500">All fields match the RTO work status sheet.</p></div><button onClick={() => setModalOpen(false)} className="rounded-lg p-2 hover:bg-gray-100"><X size={18} /></button></div><form onSubmit={save} className="space-y-6 p-5">
      {error ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
      <section><h3 className="mb-3 border-b pb-2 text-sm font-bold uppercase tracking-wide text-amber-700">Customer & Vehicle</h3><div className="grid gap-4 md:grid-cols-3"><Field label="Customer Name *"><input className={inputClass} value={form.customerName} onChange={(e) => update('customerName', e.target.value.toUpperCase())} /></Field><Field label="Customer Number"><input className={inputClass} inputMode="numeric" value={form.customerNumber} onChange={(e) => update('customerNumber', e.target.value.replace(/\D/g, ''))} /></Field><Field label="Vehicle Number *"><input className={inputClass} value={vehicleNumberDisplay(form.vehicleNumber)} onChange={(e) => update('vehicleNumber', vehicleNumberInput(e.target.value))} /></Field><Field label="Vehicle Category *"><StyledSelect value={form.vehicleType} placeholder="Select vehicle category" options={[{ value: '', label: 'Select vehicle category' }, ...categories.map((item) => ({ value: item.name, label: item.name }))]} onChange={(value) => update('vehicleType', value)} /></Field><Field label="Vehicle Modal *"><input className={inputClass} value={form.vehicleModel} onChange={(e) => update('vehicleModel', e.target.value.toUpperCase())} /></Field><Field label="Hours Running *"><div className="flex overflow-hidden rounded-xl border border-gray-200 bg-gray-50 transition focus-within:border-amber-500 focus-within:bg-white focus-within:ring-2 focus-within:ring-amber-500/20"><input className="w-full bg-transparent px-3 py-2.5 text-sm text-gray-900 outline-none" inputMode="numeric" required min={1} value={form.hourRunning ?? ''} onChange={(e) => update('hourRunning', e.target.value.replace(/\D/g, '') ? Number(e.target.value.replace(/\D/g, '')) : null)} /><span className="flex items-center border-l border-gray-200 bg-gray-100 px-3 text-sm font-semibold text-gray-500">HR</span></div></Field></div></section>
      <section><h3 className="mb-3 border-b pb-2 text-sm font-bold uppercase tracking-wide text-amber-700">Hire Purchase & Validity</h3><div className="grid gap-4 md:grid-cols-3"><Field label="Hire Purchase *"><StyledSelect value={form.hirePurchaseStatus} options={(['PENDING', 'ACTIVE', 'TERMINATED', 'NOT_APPLICABLE'] as HirePurchase[]).map((item) => ({ value: item, label: label(item) }))} onChange={(value) => update('hirePurchaseStatus', value as HirePurchase)} /></Field>{([['Tax Validity *', 'taxStatus', 'taxValidUntil'], ['Fitness Validity *', 'fitnessStatus', 'fitnessValidUntil'], ['Insurance Validity *', 'insuranceStatus', 'insuranceValidUntil'], ['PUC Validity *', 'pucStatus', 'pucValidUntil']] as const).map(([title, statusKey, dateKey]) => <Field key={statusKey} label={title}><div className="space-y-2"><StyledSelect value={form[statusKey]} options={validities.map((item) => ({ value: item, label: label(item) }))} onChange={(value) => { const nextStatus = value as Validity; update(statusKey, nextStatus); if (nextStatus !== 'VALID' && nextStatus !== 'EXPIRED') update(dateKey, null); }} />{(form[statusKey] === 'VALID' || form[statusKey] === 'EXPIRED') ? <input className={inputClass} type="date" required value={form[dateKey] ? String(form[dateKey]).slice(0, 10) : ''} onChange={(e) => update(dateKey, e.target.value || null)} /> : null}</div></Field>)}<Field label="HSRP Valid *"><StyledSelect value={form.hsrpStatus} options={(['YES', 'NO'] as HsrpStatus[]).map((item) => ({ value: item, label: label(item) }))} onChange={(value) => update('hsrpStatus', value as HsrpStatus)} /></Field></div></section>
      <section><h3 className="mb-3 border-b pb-2 text-sm font-bold uppercase tracking-wide text-amber-700">Seller, Purchaser & RTO Agent</h3><div className="grid gap-4 md:grid-cols-3"><Field label="Seller Name *"><input className={inputClass} value={form.sellerName} onChange={(e) => update('sellerName', e.target.value.toUpperCase())} /></Field><Field label="Seller Number"><input className={inputClass} inputMode="numeric" value={form.sellerNumber} onChange={(e) => update('sellerNumber', e.target.value.replace(/\D/g, ''))} /></Field><Field label="Purcheser Name *"><input className={inputClass} value={form.purchaserName} onChange={(e) => update('purchaserName', e.target.value.toUpperCase())} /></Field><Field label="Purcheser Number"><input className={inputClass} inputMode="numeric" value={form.purchaserNumber} onChange={(e) => update('purchaserNumber', e.target.value.replace(/\D/g, ''))} /></Field><Field label="RTO Office *"><input className={inputClass} value={form.rtoOffice} onChange={(e) => update('rtoOffice', e.target.value.toUpperCase())} /></Field><Field label="RTO Agent Name *"><input className={inputClass} value={form.rtoAgentName} onChange={(e) => update('rtoAgentName', e.target.value.toUpperCase())} /></Field><Field label="RTO Agent State *"><StyledSelect value={form.rtoAgentState} placeholder="Select state" options={[{ value: '', label: 'Select state' }, ...states.map((item) => ({ value: item.name, label: item.name }))]} onChange={(value) => void changeState(value)} /></Field><Field label="RTO Agent City *"><StyledSelect value={form.rtoAgentCity} placeholder="Select city" disabled={!form.rtoAgentState} options={[{ value: '', label: 'Select city' }, ...cities.map((item) => ({ value: item.name, label: item.name }))]} onChange={(value) => update('rtoAgentCity', value)} /></Field><Field label="RTO Agent Number"><input className={inputClass} inputMode="numeric" value={form.rtoAgentNumber} onChange={(e) => update('rtoAgentNumber', e.target.value.replace(/\D/g, ''))} /></Field></div></section>
      <div className="rounded-xl border border-amber-200/80 bg-amber-50/60 p-4">
        <label className="flex items-start gap-3 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={termsAccepted}
            onChange={(e) => setTermsAccepted(e.target.checked)}
            className="mt-0.5 h-4.5 w-4.5 shrink-0 rounded border-gray-300 text-amber-600 focus:ring-amber-500 cursor-pointer"
          />
          <span className="text-xs font-medium text-gray-700 leading-relaxed">
            I hereby confirm that all submitted customer, vehicle, and RTO details are accurate and verified. I agree to the{' '}
            <a
              href="/terms-and-conditions"
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="font-bold text-amber-800 underline decoration-amber-500 underline-offset-2 hover:text-amber-900"
            >
              Terms & Conditions
            </a>
            {' '}and official compliance rules for managing RTO records.
          </span>
        </label>
      </div>
      <div className="flex justify-end gap-3 border-t border-gray-100 pt-4">
        <button type="button" onClick={() => setModalOpen(false)} className="rounded-xl bg-gray-100 px-5 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-200">Cancel</button>
        <button disabled={!termsAccepted || saving} type="submit" className="rounded-xl bg-amber-500 px-5 py-2.5 text-sm font-bold text-gray-950 hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-50 transition">{saving ? 'Saving...' : editingId ? 'Update Record' : 'Save Record'}</button>
      </div>
    </form></div></div> : null}
  </div>;
}
