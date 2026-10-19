'use client';

import { ComponentType, useEffect, useState } from 'react';
import { useRouter, useParams, usePathname } from 'next/navigation';
import {
  ArrowLeft, CheckCircle2, Clock, Car, User, Phone, Pencil,
  FileText, DollarSign, AlertTriangle, ShieldCheck, Building2,
  ChevronDown, Check, Loader2, LockKeyhole, CalendarDays
} from 'lucide-react';
import { toast } from 'react-toastify';
import api from '@/lib/api';
import { getAccountUpdatePermissions } from '@/lib/accountsPermissions';
import { hasAnyPermission } from '@/lib/permissionUtils';
import { useAuthStore } from '@/store/authStore';
import { normalizeRtoStatus } from '@/lib/rtoWorkStatusForm.mjs';
import { getRtoDetailActionState } from '@/lib/rtoDetailView.mjs';

type RtoRecord = {
  id: string;
  isLocked?: boolean;
  lockedAt?: string | null;
  lockedById?: string | null;
  lockedByName?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  listingId?: string | null;
  sellAccountId?: string | null;
  customerName: string;
  customerNumber?: string;
  vehicleNumber: string;
  brandName?: string;
  vehicleType?: string;
  vehicleModel?: string;
  hirePurchaseStatus: string;
  taxStatus: string;
  taxValidUntil: string | null;
  fitnessStatus: string;
  fitnessValidUntil: string | null;
  insuranceStatus: string;
  insuranceValidUntil: string | null;
  pucStatus: string;
  pucValidUntil: string | null;
  hsrpStatus: string;
  hsrpNumber?: string | null;
  financerName?: string | null;
  sellerName: string;
  sellerNumber?: string;
  purchaserName: string;
  purchaserNumber?: string;
  rtoOffice?: string;
  rtoAgentName?: string;
  rtoAgentState?: string;
  rtoAgentCity?: string;
  rtoAgentNumber?: string;
  rtoExpenses?: number;
  rtoExpensesAdvance?: number;
  rtoExpensesBalance?: number;
  documentSendDate: string | null;
  rtoStatus: string;
  noteSheet?: string | null;
  vehicleMaintenanceCost?: number;
  hourRunning?: number | null;
};

const STATUS_CONFIG: Record<string, { label: string; bg: string; text: string; border: string; icon: ComponentType<{ className?: string }> }> = {
  RTO_WORK_STARTED: { label: 'RTO Work Start', bg: 'bg-orange-50', text: 'text-orange-800', border: 'border-orange-200', icon: AlertTriangle },
  RTO_WORK_IN_PROGRESS: { label: 'RTO Work Progress', bg: 'bg-blue-50', text: 'text-blue-800', border: 'border-blue-200', icon: Clock },
  RTO_WORK_FAILED: { label: 'RTO Work Failed / Errors', bg: 'bg-rose-50', text: 'text-rose-800', border: 'border-rose-200', icon: AlertTriangle },
  RTO_WORK_COMPLETED: { label: 'RTO Work Completed', bg: 'bg-emerald-50', text: 'text-emerald-800', border: 'border-emerald-200', icon: CheckCircle2 },
  DEAL_DONE: { label: 'Deal Done', bg: 'bg-emerald-50', text: 'text-emerald-900', border: 'border-emerald-300', icon: CheckCircle2 },
};

const label = (value: string) => {
  if (!value) return '—';
  if (value === 'NOT_APPLICABLE' || value === 'NOT_REQUIRED') return 'Not Required';
  return value.replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, (char) => char.toUpperCase());
};
const dateValue = (value: string | null) => value ? new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(value)) : '—';
const dateTimeValue = (value?: string | null) => value ? new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : '—';

export default function RtoRecordDetailView() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useParams();
  const id = params?.id as string;
  const listPath = pathname.startsWith('/employee')
    ? '/employee/accounts/rto-work-status'
    : pathname.startsWith('/admin')
      ? '/admin/accounts/rto-work-status'
      : '/superadmin/accounts/rto-work-status';
  const currentUser = useAuthStore((state) => state.user);
  const canUpdateRto = currentUser?.role === 'SUPER_ADMIN' || currentUser?.role === 'ADMIN' || hasAnyPermission(currentUser?.permissions || [], getAccountUpdatePermissions('rto-work-status'));

  const [record, setRecord] = useState<RtoRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [statusDropdownOpen, setStatusDropdownOpen] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);

  useEffect(() => {
    if (!statusDropdownOpen) return;

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && !target.closest('[data-rto-detail-status-dropdown]')) {
        setStatusDropdownOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setStatusDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [statusDropdownOpen]);

  const handleQuickStatusChange = async (nextStatus: string) => {
    if (!record || !canUpdateRto || record.isLocked || updatingStatus || record.rtoStatus === nextStatus) return;
    const prevStatus = record.rtoStatus;
    setUpdatingStatus(true);
    setRecord({ ...record, rtoStatus: nextStatus });
    try {
      const response = await api.put(`/recruitment/admin/rto-records/${record.id}`, {
        ...record,
        rtoStatus: nextStatus,
      });
      if (!response.data?.success) throw new Error(response.data?.error || 'Failed to update status');
      const updated = {
        ...record,
        ...response.data.record,
        rtoStatus: normalizeRtoStatus(response.data.record?.rtoStatus || nextStatus),
      };
      setRecord(updated);
      try {
        const cached = localStorage.getItem('jcb_rto_records');
        if (cached) {
          const list = JSON.parse(cached) as Array<Record<string, unknown>>;
          const idx = list.findIndex((item) => String(item.id) === String(record.id));
          if (idx !== -1) {
            list[idx] = updated;
            localStorage.setItem('jcb_rto_records', JSON.stringify(list));
          }
        }
      } catch {
        // ignore cache write error
      }
      toast.success(`RTO Status updated to "${STATUS_CONFIG[nextStatus]?.label || nextStatus}"`);
    } catch (err: unknown) {
      setRecord({ ...record, rtoStatus: prevStatus });
      toast.error(err instanceof Error ? err.message : 'Failed to update RTO status.');
    } finally {
      setUpdatingStatus(false);
      setStatusDropdownOpen(false);
    }
  };

  useEffect(() => {
    let isMounted = true;

    const loadRecord = async () => {
      if (typeof window === 'undefined' || !id) {
        return;
      }

      const getCachedRecord = () => {
        try {
          const saved = localStorage.getItem('jcb_rto_records');
          if (!saved) return null;
          const parsed = JSON.parse(saved) as RtoRecord[];
          return parsed.find((item) => String(item.id) === id) || null;
        } catch {
          return null;
        }
      };

      try {
        const response = await api.get('/recruitment/admin/rto-records');
        const found = ((response.data?.records || []) as RtoRecord[]).find((item) => String(item.id) === id);
        if (isMounted) setRecord(found ? { ...found, rtoStatus: normalizeRtoStatus(found.rtoStatus) } : null);
      } catch {
        const cached = getCachedRecord();
        if (isMounted) setRecord(cached ? { ...cached, rtoStatus: normalizeRtoStatus(cached.rtoStatus) } : null);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    void loadRecord();

    return () => {
      isMounted = false;
    };
  }, [id]);

  if (loading) {
    return (
      <div className="flex h-[400px] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-amber-500 border-t-transparent"></div>
      </div>
    );
  }

  if (!record) {
    return (
      <div className="flex h-[400px] flex-col items-center justify-center space-y-4">
        <AlertTriangle className="h-12 w-12 text-gray-400" />
        <p className="text-lg font-medium text-gray-600">RTO Record not found</p>
        <button
          onClick={() => router.push(listPath)}
          className="text-blue-600 hover:underline font-medium text-sm"
        >
          Go back to list
        </button>
      </div>
    );
  }

  const statusInfo = STATUS_CONFIG[record.rtoStatus || 'RTO_WORK_IN_PROGRESS'] || STATUS_CONFIG.RTO_WORK_IN_PROGRESS;
  const StatusIcon = statusInfo.icon;
  const detailActions = getRtoDetailActionState({ canUpdate: canUpdateRto, isLocked: record.isLocked === true });

  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.push(listPath)}
            className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-gray-500 shadow-sm border border-gray-200 transition hover:bg-gray-50 hover:text-gray-900 shrink-0"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">RTO Work Status Details</h1>
            <p className="text-sm font-medium text-gray-500 mt-0.5">Registration: <span className="font-bold text-gray-900">{record.vehicleNumber}</span></p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {detailActions.canEdit ? <button type="button" onClick={() => router.push(`${listPath}?edit=${encodeURIComponent(record.id)}`)} className="inline-flex items-center gap-2 rounded-xl bg-amber-500 px-4 py-2 text-sm font-bold text-gray-950 transition hover:bg-amber-600"><Pencil className="h-4 w-4" />Edit Record</button> : null}
          {detailActions.canChangeStatus ? (
            <div className="relative" data-rto-detail-status-dropdown>
              <button
                type="button"
                disabled={updatingStatus}
                onClick={() => setStatusDropdownOpen((prev) => !prev)}
                className={`group flex items-center justify-center gap-2 rounded-full border px-4 py-1.5 font-semibold shrink-0 transition-all shadow-xs hover:shadow-sm cursor-pointer select-none disabled:cursor-wait disabled:opacity-75 ${statusInfo.bg} ${statusInfo.text} ${statusInfo.border} hover:brightness-95`}
                title="Click to change RTO status"
              >
                {updatingStatus ? (
                  <Loader2 className="h-4 w-4 animate-spin text-current" />
                ) : (
                  <StatusIcon className="h-4 w-4" />
                )}
                <span>{statusInfo.label}</span>
                <ChevronDown className={`h-3.5 w-3.5 text-current transition-transform duration-200 ${statusDropdownOpen ? 'rotate-180' : 'opacity-70 group-hover:opacity-100'}`} />
              </button>

              {statusDropdownOpen ? (
                <div className="absolute right-0 top-full mt-2 z-50 w-56 rounded-xl border border-gray-200 bg-white p-1.5 shadow-xl">
                  <div className="px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider text-gray-400 border-b border-gray-100 mb-1">
                    Change RTO Status
                  </div>
                  {Object.entries(STATUS_CONFIG).map(([key, config]) => {
                    const isSelected = record.rtoStatus === key;
                    const ItemIcon = config.icon;
                    return (
                      <button
                        key={key}
                        type="button"
                        disabled={updatingStatus}
                        onClick={() => {
                          setStatusDropdownOpen(false);
                          if (!isSelected) {
                            void handleQuickStatusChange(key);
                          }
                        }}
                        className={`flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-semibold transition cursor-pointer ${
                          isSelected
                            ? `${config.bg} ${config.text} ring-1 ring-inset ${config.border}`
                            : 'text-gray-700 hover:bg-gray-50'
                        }`}
                      >
                        <div className="flex items-center gap-2 truncate">
                          <ItemIcon className={`h-3.5 w-3.5 shrink-0 ${isSelected ? config.text : 'text-gray-400'}`} />
                          <span className="truncate">{config.label}</span>
                        </div>
                        {isSelected ? <Check className="h-3.5 w-3.5 shrink-0 text-current" /> : null}
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </div>
          ) : (
            <div className={`flex items-center justify-center gap-2 rounded-full border px-4 py-1.5 font-semibold shrink-0 ${statusInfo.bg} ${statusInfo.text} ${statusInfo.border}`}>
              <StatusIcon className="h-4 w-4" />
              {statusInfo.label}
            </div>
          )}
        </div>
      </div>

      {record.isLocked ? (
        <section className="rounded-2xl border border-slate-300 bg-slate-50 p-4 shadow-sm" aria-label="Locked record notice">
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-slate-200 p-2.5 text-slate-700"><LockKeyhole className="h-5 w-5" /></div>
            <div className="min-w-0">
              <p className="font-bold text-slate-900">Locked record — view only</p>
              <p className="mt-1 text-sm leading-6 text-slate-600">This Deal Done record is permanently locked. Editing, status changes, deletion, payment changes and Start RTO actions are unavailable for every portal user.</p>
              <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs font-semibold text-slate-500">
                <span className="inline-flex items-center gap-1.5"><CalendarDays className="h-3.5 w-3.5" />Locked: {dateTimeValue(record.lockedAt)}</span>
                {record.lockedById ? <span className="inline-flex items-center gap-1.5"><User className="h-3.5 w-3.5" />Locked by: {record.lockedByName || 'User'}</span> : null}
              </div>
            </div>
          </div>
        </section>
      ) : null}

      <div className="grid gap-6 md:grid-cols-2">
        {/* Vehicle & Customer Details */}
        <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
          <h3 className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-amber-700 border-b border-gray-100 pb-2">
            <Car className="h-4 w-4" /> Vehicle & Customer Details
          </h3>
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Registration Number</p>
                <p className="font-bold text-gray-900 text-lg mt-0.5">{record.vehicleNumber}</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Vehicle Model</p>
                <p className="font-bold text-gray-900 mt-0.5">{record.vehicleModel || '—'}</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Brand</p>
                <p className="font-bold text-gray-900 mt-0.5">{record.brandName || '—'}</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Category</p>
                <p className="font-medium text-gray-800 mt-0.5">{record.vehicleType || '—'}</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Hire Purchase</p>
                <span className="inline-block mt-0.5 rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-bold text-gray-700 border border-gray-200">
                  {label(record.hirePurchaseStatus)}
                </span>
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Financer</p>
                <p className="font-medium text-gray-800 mt-0.5">{record.financerName || '—'}</p>
              </div>
              {record.hourRunning !== null && record.hourRunning !== undefined && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Hour Running</p>
                  <p className="font-semibold text-gray-800 mt-0.5">{record.hourRunning} HR</p>
                </div>
              )}
            </div>

            <div className="rounded-xl bg-gray-50 border border-gray-100 p-4 flex items-start gap-3">
              <div className="p-2 bg-white rounded-lg shadow-sm shrink-0 border border-gray-100">
                <User className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Customer</p>
                <p className="font-bold text-gray-900">{record.customerName}</p>
                {record.customerNumber ? (
                  <a href={`tel:${record.customerNumber}`} className="mt-1 flex w-fit items-center gap-1.5 text-sm font-medium text-blue-600 hover:underline">
                    <Phone className="h-3.5 w-3.5 text-blue-500" /> {record.customerNumber}
                  </a>
                ) : (
                  <p className="text-xs text-gray-400 mt-1">No contact number</p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Parties Involved & RTO Agent */}
        <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
          <h3 className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-amber-700 border-b border-gray-100 pb-2">
            <User className="h-4 w-4" /> Parties & RTO Agent
          </h3>
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="rounded-xl border border-gray-100 bg-gray-50/50 p-3">
                <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Seller</p>
                <p className="font-bold text-gray-900 text-sm mt-0.5">{record.sellerName}</p>
                {record.sellerNumber && (
                  <a href={`tel:${record.sellerNumber}`} className="mt-1 flex items-center gap-1 text-xs text-blue-600 hover:underline">
                    <Phone className="h-3 w-3 text-blue-500" /> {record.sellerNumber}
                  </a>
                )}
              </div>
              <div className="rounded-xl border border-gray-100 bg-gray-50/50 p-3">
                <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Purchaser</p>
                <p className="font-bold text-gray-900 text-sm mt-0.5">{record.purchaserName}</p>
                {record.purchaserNumber && (
                  <a href={`tel:${record.purchaserNumber}`} className="mt-1 flex items-center gap-1 text-xs text-blue-600 hover:underline">
                    <Phone className="h-3 w-3 text-blue-500" /> {record.purchaserNumber}
                  </a>
                )}
              </div>
            </div>

            <div className="rounded-xl border border-amber-100 bg-amber-50/30 p-4">
              <div className="flex items-center gap-2 mb-2 text-amber-800 font-bold text-xs uppercase tracking-wider">
                <Building2 className="w-4 h-4 text-amber-600" />
                <span>RTO Agent & Office</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">RTO Agent Info</p>
                  <p className="font-bold text-gray-900 mt-0.5">{record.rtoAgentName || '—'}</p>
                  {[record.rtoAgentCity, record.rtoAgentState].filter(Boolean).length > 0 && (
                    <p className="text-xs font-medium text-amber-700 mt-0.5">
                      City: {[record.rtoAgentCity, record.rtoAgentState].filter(Boolean).join(', ')}
                    </p>
                  )}
                  {record.rtoAgentNumber && (
                    <a href={`tel:${record.rtoAgentNumber}`} className="mt-1 flex items-center gap-1 text-xs text-blue-600 hover:underline font-medium">
                      <Phone className="h-3 w-3 text-blue-500" /> {record.rtoAgentNumber}
                    </a>
                  )}
                </div>
                <div>
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">RTO Office Location</p>
                  <p className="font-bold text-gray-900 text-base mt-0.5">{record.rtoOffice || '—'}</p>
                  <span className="inline-block mt-1 text-[11px] font-medium bg-amber-100/60 text-amber-800 px-2 py-0.5 rounded-md">
                    Official RTO Office
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Validity Details */}
        <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm md:col-span-2">
          <h3 className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-amber-700 border-b border-gray-100 pb-2">
            <ShieldCheck className="h-4 w-4" /> Compliance & Validity Breakdown
          </h3>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            <div className="rounded-xl bg-gray-50 p-3.5 border border-gray-100 text-center">
              <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Tax Status</p>
              <p className="mt-1 font-bold text-gray-900 text-sm">{label(record.taxStatus)}</p>
              <p className="text-xs text-gray-500 mt-0.5">{dateValue(record.taxValidUntil)}</p>
            </div>
            <div className="rounded-xl bg-gray-50 p-3.5 border border-gray-100 text-center">
              <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Fitness Status</p>
              <p className="mt-1 font-bold text-gray-900 text-sm">{label(record.fitnessStatus)}</p>
              <p className="text-xs text-gray-500 mt-0.5">{dateValue(record.fitnessValidUntil)}</p>
            </div>
            <div className="rounded-xl bg-gray-50 p-3.5 border border-gray-100 text-center">
              <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Insurance</p>
              <p className="mt-1 font-bold text-gray-900 text-sm">{label(record.insuranceStatus)}</p>
              <p className="text-xs text-gray-500 mt-0.5">{dateValue(record.insuranceValidUntil)}</p>
            </div>
            <div className="rounded-xl bg-gray-50 p-3.5 border border-gray-100 text-center">
              <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">PUC Status</p>
              <p className="mt-1 font-bold text-gray-900 text-sm">{label(record.pucStatus)}</p>
              <p className="text-xs text-gray-500 mt-0.5">{dateValue(record.pucValidUntil)}</p>
            </div>
            <div className="rounded-xl bg-gray-50 p-3.5 border border-gray-100 text-center col-span-2 sm:col-span-1">
              <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">HSRP Valid</p>
              <p className="mt-1 font-bold text-emerald-700 text-sm">{label(record.hsrpStatus)}</p>
              {record.hsrpNumber ? <p className="text-xs text-gray-500 mt-0.5">No: {record.hsrpNumber}</p> : null}
            </div>
          </div>
        </div>

        {/* Financial Breakdown */}
        <div className="rounded-2xl border border-amber-100 bg-amber-50/30 p-5 shadow-sm md:col-span-2">
          <h3 className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-amber-800">
            <DollarSign className="h-4 w-4" /> RTO Financials & Expenses
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            <div className="rounded-xl bg-white p-4 shadow-sm border border-amber-100/50 text-center">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Total Expenses</p>
              <p className="mt-1 text-xl font-bold text-gray-900">₹{(record.rtoExpenses || 0).toLocaleString('en-IN')}</p>
            </div>
            <div className="rounded-xl bg-white p-4 shadow-sm border border-amber-100/50 text-center">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Advance Paid</p>
              <p className="mt-1 text-xl font-bold text-emerald-700">₹{(record.rtoExpensesAdvance || 0).toLocaleString('en-IN')}</p>
            </div>
            <div className="rounded-xl bg-white p-4 shadow-sm border border-amber-300 bg-amber-50 text-center">
              <p className="text-xs font-bold text-amber-800 uppercase tracking-wider">Balance Due</p>
              <p className="mt-1 text-xl font-bold text-amber-900">
                ₹{(record.rtoExpensesBalance ?? Math.max(0, (record.rtoExpenses || 0) - (record.rtoExpensesAdvance || 0))).toLocaleString('en-IN')}
              </p>
            </div>
            <div className="rounded-xl bg-white p-4 shadow-sm border border-amber-100/50 text-center">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Maintenance Cost</p>
              <p className="mt-1 text-xl font-bold text-gray-800">₹{(record.vehicleMaintenanceCost || 0).toLocaleString('en-IN')}</p>
            </div>
          </div>
          {record.documentSendDate && (
            <p className="mt-3 text-xs text-gray-500 text-right font-medium">
              Document Send Date: <span className="font-bold text-gray-700">{dateValue(record.documentSendDate)}</span>
            </p>
          )}
        </div>

        {/* Note Sheet / Remarks */}
        <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm md:col-span-2">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-amber-700 border-b border-gray-100 pb-2">
            <FileText className="h-4 w-4" /> Note Sheet / Remarks
          </h3>
          <div className="rounded-xl bg-gray-50 border border-gray-100 p-4">
            <p className="text-sm font-medium text-gray-900 whitespace-pre-wrap">{record.noteSheet || 'No additional note sheet entries recorded.'}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
