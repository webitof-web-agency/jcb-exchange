'use client';

import { ComponentType, useEffect, useState, useMemo, useCallback } from 'react';
import { useRouter, useParams, usePathname } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft, CheckCircle2, Clock, Car, User, Phone, Pencil,
  FileText, DollarSign, AlertTriangle, ShieldCheck, Building2,
  ChevronDown, Check, Loader2, LockKeyhole, CalendarDays, ExternalLink,
  Copy, Share2, Printer, MessageSquare, ArrowUpRight, Gauge,
  Award, ShieldAlert, Sparkles, CheckCircle
} from 'lucide-react';
import { toast } from 'react-toastify';
import api from '@/lib/api';
import { getAccountUpdatePermissions } from '@/lib/accountsPermissions';
import { hasAnyPermission } from '@/lib/permissionUtils';
import { useAuthStore } from '@/store/authStore';
import { normalizeRtoStatus } from '@/lib/rtoWorkStatusForm.mjs';
import { getRtoDetailActionState } from '@/lib/rtoDetailView.mjs';
import RemarkDialog from '@/components/accounts/RemarkDialog';

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

const formatLabel = (value: string) => {
  if (!value) return '—';
  if (value === 'NOT_APPLICABLE' || value === 'NOT_REQUIRED') return 'Not Required';
  return value.replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, (char) => char.toUpperCase());
};

const formatDateValue = (value: string | null) =>
  value ? new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(value)) : '—';

const formatDateTimeValue = (value?: string | null) =>
  value ? new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : '—';

const formatRegistrationNumber = (value?: string | null) => {
  const normalized = String(value || '').trim().toUpperCase();
  if (!normalized) return '';

  const compact = normalized.replace(/[\s-]+/g, '');
  const standardMatch = compact.match(/^([A-Z]{2})(\d{1,2})([A-Z]{1,3})(\d{1,4})$/);
  if (standardMatch) return [standardMatch[1], standardMatch[2], standardMatch[3], standardMatch[4]].join('-');

  const stateAndNumberMatch = compact.match(/^([A-Z]{2})(\d{1,2})(\d{1,4})$/);
  if (stateAndNumberMatch) return [stateAndNumberMatch[1], stateAndNumberMatch[2], stateAndNumberMatch[3]].join('-');

  return normalized.replace(/[\s-]+/g, '-');
};

const getWhatsAppUrl = (phone?: string) => {
  if (!phone) return null;
  const digits = phone.replace(/[^0-9]/g, '');
  return digits.length >= 10 ? `https://wa.me/91${digits.slice(-10)}` : null;
};

export default function RtoRecordDetailView() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useParams();
  const id = params?.id as string;

  const basePortalPath = pathname.startsWith('/employee')
    ? '/employee'
    : pathname.startsWith('/admin')
      ? '/admin'
      : '/superadmin';

  const listPath = `${basePortalPath}/accounts/rto-work-status`;

  const currentUser = useAuthStore((state) => state.user);
  const canUpdateRto =
    currentUser?.role === 'SUPER_ADMIN' ||
    currentUser?.role === 'ADMIN' ||
    hasAnyPermission(currentUser?.permissions || [], getAccountUpdatePermissions('rto-work-status'));

  const [record, setRecord] = useState<RtoRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [statusDropdownOpen, setStatusDropdownOpen] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [pendingStatus, setPendingStatus] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const copyText = useCallback((text: string, key: string) => {
    if (!text) return;
    void navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  }, []);

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

  const requestStatusChange = (nextStatus: string) => {
    if (!record || !canUpdateRto || record.isLocked || updatingStatus || record.rtoStatus === nextStatus) return;
    if (nextStatus === 'DEAL_DONE' && record.sellAccountId) {
      toast.info('Finish the transfer tasks and use "Complete Sale" in the RTO workspace to mark this deal done.');
      router.push(`${listPath}/${encodeURIComponent(record.id)}/edit`);
      return;
    }
    setPendingStatus(nextStatus);
  };

  const handleQuickStatusChange = async (nextStatus: string, statusRemark: string) => {
    if (!record || !canUpdateRto || record.isLocked || updatingStatus || record.rtoStatus === nextStatus) return;
    const prevStatus = record.rtoStatus;
    setUpdatingStatus(true);
    setRecord({ ...record, rtoStatus: nextStatus });
    try {
      const response = await api.put(`/recruitment/admin/rto-records/${record.id}`, {
        ...record,
        rtoStatus: nextStatus,
        statusRemark,
      });
      if (!response.data?.success) throw new Error(response.data?.error || 'Failed to update status');
      if (nextStatus === 'DEAL_DONE') {
        const lockResponse = await api.post(`/recruitment/admin/rto-records/${record.id}/lock`);
        if (!lockResponse.data?.success) throw new Error(lockResponse.data?.error || 'Unable to lock the record.');
      }
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
      if (nextStatus === 'DEAL_DONE') setRecord({ ...updated, isLocked: true });
      setPendingStatus(null);
      toast.success(`RTO Status updated to "${STATUS_CONFIG[nextStatus]?.label || nextStatus}"`);
    } catch (err: unknown) {
      setRecord({ ...record, rtoStatus: prevStatus });
      const apiMessage = (err as { response?: { data?: { error?: unknown } } })?.response?.data?.error;
      toast.error(typeof apiMessage === 'string' ? apiMessage : err instanceof Error ? err.message : 'Failed to update RTO status.');
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

  const complianceScore = useMemo(() => {
    if (!record) return { validCount: 0, total: 5, percent: 0 };
    const items = [
      record.taxStatus === 'VALID' || record.taxStatus === 'LIFETIME',
      record.fitnessStatus === 'VALID',
      record.insuranceStatus === 'VALID',
      record.pucStatus === 'VALID',
      record.hsrpStatus === 'YES',
    ];
    const validCount = items.filter(Boolean).length;
    return { validCount, total: items.length, percent: Math.round((validCount / items.length) * 100) };
  }, [record]);

  const financialSummary = useMemo(() => {
    if (!record) return { total: 0, advance: 0, balance: 0, maintenance: 0, paidPercent: 100 };
    const total = Number(record.rtoExpenses || 0);
    const advance = Number(record.rtoExpensesAdvance || 0);
    const balance = record.rtoExpensesBalance != null
      ? Number(record.rtoExpensesBalance)
      : Math.max(0, total - advance);
    const maintenance = Number(record.vehicleMaintenanceCost || 0);
    const paidPercent = total > 0 ? Math.min(100, Math.round((advance / total) * 100)) : 100;
    return { total, advance, balance, maintenance, paidPercent };
  }, [record]);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="flex flex-col items-center gap-2">
          <div className="h-8 w-8 animate-spin rounded-full border-3 border-[#FFC107] border-t-transparent"></div>
          <span className="text-xs font-semibold text-slate-500">Loading RTO dossier...</span>
        </div>
      </div>
    );
  }

  if (!record) {
    return (
      <div className="mx-auto max-w-lg py-12">
        <div className="rounded-2xl border border-rose-200 bg-white p-8 text-center shadow-sm">
          <AlertTriangle className="mx-auto h-12 w-12 text-rose-500" />
          <h3 className="mt-4 text-base font-bold text-slate-900">RTO Record Not Found</h3>
          <p className="mt-1 text-xs text-slate-500">The transfer record you requested could not be located in the database.</p>
          <div className="mt-6">
            <button
              onClick={() => router.push(listPath)}
              className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-slate-800"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>Back to RTO List</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  const statusInfo = STATUS_CONFIG[record.rtoStatus || 'RTO_WORK_IN_PROGRESS'] || STATUS_CONFIG.RTO_WORK_IN_PROGRESS;
  const StatusIcon = statusInfo.icon;
  const detailActions = getRtoDetailActionState({ canUpdate: canUpdateRto, isLocked: record.isLocked === true });
  const formattedPlate = formatRegistrationNumber(record.vehicleNumber);

  const listingDetailUrl = record.listingId ? `${basePortalPath}/listings/${record.listingId}` : null;
  const sellAccountUrl = record.sellAccountId ? `${basePortalPath}/accounts/sell-accounts/${record.sellAccountId}` : null;

  const validityBadge = (val: string | null | undefined, type: 'validity' | 'hp' | 'hsrp') => {
    const v = (val || '').toUpperCase();
    let cls = 'bg-slate-100 text-slate-600 border-slate-200';
    let labelText = val || '—';
    if (type === 'validity') {
      if (v === 'VALID') { cls = 'bg-emerald-50 text-emerald-800 border-emerald-300'; labelText = 'Valid'; }
      else if (v === 'EXPIRED') { cls = 'bg-rose-50 text-rose-800 border-rose-300'; labelText = 'Expired'; }
      else if (v === 'LIFETIME') { cls = 'bg-amber-50 text-amber-900 border-amber-300'; labelText = 'Lifetime'; }
      else if (v === 'NOT_AVAILABLE') { cls = 'bg-slate-100 text-slate-600 border-slate-200'; labelText = 'N/A'; }
    } else if (type === 'hp') {
      if (v === 'TERMINATED') { cls = 'bg-emerald-50 text-emerald-800 border-emerald-300'; labelText = 'Terminated'; }
      else if (v === 'ACTIVE') { cls = 'bg-rose-50 text-rose-800 border-rose-300'; labelText = 'Active Loan'; }
      else if (v === 'NOT_APPLICABLE') { cls = 'bg-slate-100 text-slate-600 border-slate-200'; labelText = 'None'; }
      else { cls = 'bg-yellow-50 text-yellow-800 border-yellow-300'; labelText = 'Pending'; }
    } else if (type === 'hsrp') {
      if (v === 'YES') { cls = 'bg-emerald-50 text-emerald-800 border-emerald-300'; labelText = 'Fitted'; }
      else if (v === 'NO') { cls = 'bg-rose-50 text-rose-800 border-rose-300'; labelText = 'Not Fitted'; }
      else if (v === 'NOT_APPLICABLE') { cls = 'bg-slate-100 text-slate-600 border-slate-200'; labelText = 'N/A'; }
      else { cls = 'bg-yellow-50 text-yellow-800 border-yellow-300'; labelText = 'Pending'; }
    }
    return <span className={`inline-flex items-center rounded border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${cls}`}>{labelText}</span>;
  };

  const RTO_MILESTONES = [
    { label: 'Document Sent', isDone: Boolean(record.documentSendDate), date: record.documentSendDate },
    { label: 'Work Initiated', isDone: ['RTO_WORK_STARTED', 'RTO_WORK_IN_PROGRESS', 'RTO_WORK_COMPLETED', 'DEAL_DONE'].includes(record.rtoStatus) },
    { label: 'In Progress', isDone: ['RTO_WORK_IN_PROGRESS', 'RTO_WORK_COMPLETED', 'DEAL_DONE'].includes(record.rtoStatus) },
    { label: 'RTO Completed', isDone: ['RTO_WORK_COMPLETED', 'DEAL_DONE'].includes(record.rtoStatus) },
    { label: 'Deal Done & Locked', isDone: record.rtoStatus === 'DEAL_DONE' || Boolean(record.isLocked) },
  ];

  return (
    <div className="space-y-4 pb-16 profile-print-target">
      {/* Top Command Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200/90 bg-white px-3.5 py-2.5 shadow-2xs profile-no-print">
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={() => router.push(listPath)}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-600 shadow-2xs transition hover:bg-slate-100 hover:text-slate-900"
            title="Back to RTO list"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">RTO Work Status</span>
              <span className="text-slate-300">•</span>
              <span className="text-xs font-bold text-slate-900">{record.vehicleModel || 'Vehicle Transfer'}</span>
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-[11px] text-slate-500 font-medium">Customer: <strong className="text-slate-800">{record.customerName}</strong></span>
              <span className="text-slate-300">•</span>
              <span className="text-[11px] text-slate-500 font-medium">Office: <strong className="text-slate-800">{record.rtoOffice || 'N/A'}</strong></span>
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Transfer Workspace button */}
          {detailActions.canEdit ? (
            <button
              type="button"
              onClick={() => router.push(`${listPath}/${encodeURIComponent(record.id)}/edit`)}
              className="inline-flex h-8 sm:h-9 items-center justify-center gap-1.5 rounded-lg bg-[#FFC107] px-3 sm:px-3.5 text-xs font-bold text-slate-950 shadow-2xs transition hover:bg-[#E5AD06] cursor-pointer"
            >
              <Pencil className="h-3.5 w-3.5" />
              <span>Transfer Workspace</span>
            </button>
          ) : null}

          {/* Status Dropdown Button */}
          {detailActions.canChangeStatus ? (
            <div className="relative" data-rto-detail-status-dropdown>
              <button
                type="button"
                disabled={updatingStatus}
                onClick={() => setStatusDropdownOpen((prev) => !prev)}
                className={`group flex h-8 sm:h-9 items-center justify-center gap-1.5 rounded-lg border px-3 text-xs font-bold transition shadow-2xs hover:brightness-95 cursor-pointer disabled:cursor-wait disabled:opacity-75 ${statusInfo.bg} ${statusInfo.text} ${statusInfo.border}`}
                title="Change RTO transfer status"
              >
                {updatingStatus ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <StatusIcon className="h-3.5 w-3.5" />
                )}
                <span>{statusInfo.label}</span>
                <ChevronDown className={`h-3 w-3 transition-transform ${statusDropdownOpen ? 'rotate-180' : ''}`} />
              </button>

              {statusDropdownOpen ? (
                <div className="absolute right-0 top-full mt-1.5 z-50 w-56 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl">
                  <div className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-100 mb-1">
                    Update RTO Stage
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
                            requestStatusChange(key);
                          }
                        }}
                        className={`flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs font-semibold transition cursor-pointer ${
                          isSelected
                            ? `${config.bg} ${config.text} ring-1 ring-inset ${config.border}`
                            : 'text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        <div className="flex items-center gap-2 truncate">
                          <ItemIcon className={`h-3.5 w-3.5 shrink-0 ${isSelected ? config.text : 'text-slate-400'}`} />
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
            <div className={`flex h-8 sm:h-9 items-center justify-center gap-1.5 rounded-lg border px-3 text-xs font-bold ${statusInfo.bg} ${statusInfo.text} ${statusInfo.border}`}>
              <StatusIcon className="h-3.5 w-3.5" />
              <span>{statusInfo.label}</span>
            </div>
          )}

          {/* Quick Copy Link */}
          <button
            type="button"
            onClick={() => copyText(typeof window !== 'undefined' ? window.location.href : '', 'pageUrl')}
            className="inline-flex h-8 sm:h-9 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
            title="Copy shareable page link"
          >
            {copiedKey === 'pageUrl' ? (
              <>
                <Check className="h-3.5 w-3.5 text-emerald-600" />
                <span className="text-emerald-700">Copied</span>
              </>
            ) : (
              <>
                <Share2 className="h-3.5 w-3.5 text-slate-500" />
                <span className="hidden sm:inline">Share</span>
              </>
            )}
          </button>

          {/* Print Dossier */}
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex h-8 sm:h-9 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
            title="Print RTO Dossier"
          >
            <Printer className="h-3.5 w-3.5 text-slate-500" />
            <span className="hidden sm:inline">Print</span>
          </button>
        </div>
      </div>

      {/* Locked Record Banner (if record is finalized / locked) */}
      {record.isLocked ? (
        <div className="flex items-start gap-3 rounded-xl border border-slate-300 bg-slate-100/80 p-3.5 shadow-2xs">
          <div className="rounded-lg bg-slate-200 p-2 text-slate-700 shrink-0">
            <LockKeyhole className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-900">
                Finalized Deal — Record Locked (View Only)
              </h4>
              <span className="rounded bg-slate-200 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-slate-700">
                PERMANENT AUDIT ARCHIVE
              </span>
            </div>
            <p className="mt-0.5 text-xs text-slate-600">
              This Deal Done transfer record is permanently locked. Data integrity, financial audit entries, and compliance timestamps are secured against further modification.
            </p>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] font-semibold text-slate-500">
              <span className="inline-flex items-center gap-1">
                <CalendarDays className="h-3 w-3" />
                Locked Date: {formatDateTimeValue(record.lockedAt)}
              </span>
              {record.lockedByName ? (
                <span className="inline-flex items-center gap-1">
                  <User className="h-3 w-3" />
                  Locked By: {record.lockedByName}
                </span>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {/* Executive KPI & Settlement Strip */}
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
        {/* Stat 1: RTO Status */}
        <div className="rounded-xl border border-slate-200/90 bg-white p-3 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Current Phase</span>
            <StatusIcon className="h-3.5 w-3.5 text-amber-500" />
          </div>
          <div className="mt-1 text-sm sm:text-base font-extrabold text-slate-900 truncate">
            {statusInfo.label}
          </div>
          <div className="mt-0.5 text-[10px] font-medium text-slate-500 truncate">
            {record.isLocked ? 'Archived & Locked' : 'Active Pipeline'}
          </div>
        </div>

        {/* Stat 2: Total Expenses */}
        <div className="rounded-xl border border-amber-200 bg-gradient-to-br from-amber-50/70 to-white p-3 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-amber-800">Total Expenses</span>
            <DollarSign className="h-3.5 w-3.5 text-amber-600" />
          </div>
          <div className="mt-1 text-base sm:text-lg font-black text-amber-600 tracking-tight">
            ₹{financialSummary.total.toLocaleString('en-IN')}
          </div>
          <div className="mt-0.5 text-[10px] font-semibold text-slate-500">
            RTO Official &amp; Agent
          </div>
        </div>

        {/* Stat 3: Advance Paid */}
        <div className="rounded-xl border border-emerald-200/90 bg-gradient-to-br from-emerald-50/60 to-white p-3 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-800">Advance Paid</span>
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
          </div>
          <div className="mt-1 text-base sm:text-lg font-bold text-emerald-700 tracking-tight">
            ₹{financialSummary.advance.toLocaleString('en-IN')}
          </div>
          <div className="mt-0.5 text-[10px] font-semibold text-slate-500">
            {financialSummary.paidPercent}% Disbursed
          </div>
        </div>

        {/* Stat 4: Balance Due */}
        <div className={`rounded-xl border p-3 shadow-2xs ${financialSummary.balance > 0 ? 'border-amber-300 bg-amber-50/50' : 'border-slate-200/90 bg-white'}`}>
          <div className="flex items-center justify-between">
            <span className={`text-[10px] font-bold uppercase tracking-wider ${financialSummary.balance > 0 ? 'text-amber-900' : 'text-slate-500'}`}>
              Balance Due
            </span>
            <Clock className={`h-3.5 w-3.5 ${financialSummary.balance > 0 ? 'text-amber-600' : 'text-slate-400'}`} />
          </div>
          <div className={`mt-1 text-base sm:text-lg font-black tracking-tight ${financialSummary.balance > 0 ? 'text-amber-800' : 'text-slate-700'}`}>
            ₹{financialSummary.balance.toLocaleString('en-IN')}
          </div>
          <div className="mt-0.5 text-[10px] font-medium text-slate-500">
            {financialSummary.balance === 0 ? 'Fully Settled' : 'Pending Settlement'}
          </div>
        </div>

        {/* Stat 5: Maintenance Cost */}
        <div className="rounded-xl border border-slate-200/90 bg-white p-3 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Maintenance</span>
            <Car className="h-3.5 w-3.5 text-slate-400" />
          </div>
          <div className="mt-1 text-base sm:text-lg font-bold text-slate-900 tracking-tight">
            ₹{financialSummary.maintenance.toLocaleString('en-IN')}
          </div>
          <div className="mt-0.5 text-[10px] font-medium text-slate-500">
            Vehicle Prep Cost
          </div>
        </div>

        {/* Stat 6: Compliance Health */}
        <div className="rounded-xl border border-slate-200/90 bg-white p-3 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Compliance</span>
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
          </div>
          <div className="mt-1 text-base sm:text-lg font-bold text-slate-900 tracking-tight">
            {complianceScore.validCount} / {complianceScore.total} Valid
          </div>
          <div className="mt-0.5 text-[10px] font-semibold text-emerald-700">
            {complianceScore.percent}% Documents Clear
          </div>
        </div>
      </div>

      {/* Transfer Lifecycle Stepper (Visual Progress Pipeline) */}
      <div className="rounded-xl border border-slate-200/90 bg-white p-3.5 shadow-2xs profile-no-print">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5 text-slate-400" />
            <span>RTO Transfer Lifecycle</span>
          </span>
          {record.documentSendDate ? (
            <span className="text-[11px] font-semibold text-slate-600">
              Docs Sent Date: <strong className="text-slate-900">{formatDateValue(record.documentSendDate)}</strong>
            </span>
          ) : (
            <span className="text-[11px] text-amber-700 font-medium">Docs Not Yet Dispatched</span>
          )}
        </div>

        <div className="grid grid-cols-5 gap-1.5 sm:gap-2">
          {RTO_MILESTONES.map((step, idx) => (
            <div key={step.label} className="flex flex-col gap-1">
              <div
                className={`h-1.5 rounded-full transition-all ${
                  step.isDone
                    ? 'bg-emerald-500'
                    : idx === 0
                      ? 'bg-amber-400'
                      : 'bg-slate-200'
                }`}
              />
              <div className="flex items-center gap-1 mt-0.5">
                {step.isDone ? (
                  <CheckCircle className="h-3 w-3 text-emerald-600 shrink-0" />
                ) : (
                  <div className="h-2 w-2 rounded-full border border-slate-400 bg-white shrink-0" />
                )}
                <span className={`text-[10px] sm:text-[11px] font-bold truncate ${step.isDone ? 'text-slate-900' : 'text-slate-600'}`}>
                  {step.label}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Main Grid: 7 / 5 Layout */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        {/* LEFT COLUMN: Vehicle Details, Compliance Matrix, Note Sheet (7 cols) */}
        <div className="space-y-4 lg:col-span-7 xl:col-span-8">
          {/* CARD 1: Vehicle & Customer Profile */}
          <div className="rounded-xl border border-slate-200/90 bg-white shadow-2xs overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/70 px-4 py-2.5">
              <div className="flex items-center gap-2">
                <Car className="h-4 w-4 text-slate-600" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                  Vehicle &amp; Customer Information
                </h3>
              </div>
              {listingDetailUrl && (
                <Link
                  href={listingDetailUrl}
                  className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-700 hover:text-amber-900 transition"
                  title="Open machine listing details"
                >
                  <span>View Machine Profile</span>
                  <ExternalLink className="h-3 w-3" />
                </Link>
              )}
            </div>

            <div className="p-4 space-y-4">
              {/* Authentic Indian High Security Registration Plate Graphic */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50/80 p-3">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                    Registration Plate
                  </span>
                  <div className="relative inline-flex items-center rounded-md border-2 border-slate-900 bg-white shadow-xs overflow-hidden text-slate-900 font-mono tracking-wider font-black select-all">
                    {/* Left blue strip */}
                    <div className="flex flex-col items-center justify-center bg-blue-700 px-1.5 py-1 text-white self-stretch">
                      <div className="text-[7px] font-bold leading-tight">IND</div>
                      <div className="h-1.5 w-1.5 rounded-full border border-amber-300 bg-blue-900 my-0.5"></div>
                    </div>
                    {/* Registration text */}
                    <div className="px-3 py-1 text-sm sm:text-base font-black uppercase tracking-widest text-slate-950">
                      {formattedPlate || 'UNREGISTERED'}
                    </div>
                    {formattedPlate ? (
                      <button
                        type="button"
                        onClick={() => copyText(formattedPlate, 'regNo')}
                        title="Copy Registration Number"
                        className="border-l border-slate-200 px-2 py-1 text-slate-400 hover:text-slate-800 transition"
                      >
                        {copiedKey === 'regNo' ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                      </button>
                    ) : null}
                  </div>
                </div>

                <div className="flex flex-wrap sm:flex-col sm:items-end gap-2 text-xs">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Hypothecation</span>
                    <div className="mt-0.5">{validityBadge(record.hirePurchaseStatus, 'hp')}</div>
                  </div>
                  {record.financerName && (
                    <div className="text-right">
                      <span className="text-[10px] text-slate-400 font-medium block">Financer Bank</span>
                      <span className="font-bold text-slate-800">{record.financerName}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Machine Specs Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
                <div className="rounded-lg border border-slate-100 bg-slate-50/50 p-2.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Brand</span>
                  <span className="font-bold text-slate-900 mt-0.5 block truncate">{record.brandName || '—'}</span>
                </div>
                <div className="rounded-lg border border-slate-100 bg-slate-50/50 p-2.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Model</span>
                  <span className="font-bold text-slate-900 mt-0.5 block truncate">{record.vehicleModel || '—'}</span>
                </div>
                <div className="rounded-lg border border-slate-100 bg-slate-50/50 p-2.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Category</span>
                  <span className="font-bold text-slate-900 mt-0.5 block truncate">{record.vehicleType || '—'}</span>
                </div>
                <div className="rounded-lg border border-slate-100 bg-slate-50/50 p-2.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Meter Usage</span>
                  <span className="font-bold text-slate-900 mt-0.5 block truncate">
                    {record.hourRunning != null ? `${Number(record.hourRunning).toLocaleString('en-IN')} hrs` : '—'}
                  </span>
                </div>
              </div>

              {/* Primary Customer Profile */}
              <div className="rounded-xl border border-slate-200 bg-gradient-to-r from-slate-50 to-white p-3 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-900 font-bold text-sm">
                    {record.customerName.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Primary Customer</span>
                    <span className="text-sm font-bold text-slate-900">{record.customerName}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {record.customerNumber ? (
                    <>
                      <a
                        href={`tel:${record.customerNumber}`}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
                        title="Call Customer"
                      >
                        <Phone className="h-3 w-3 text-slate-500" />
                        <span>{record.customerNumber}</span>
                      </a>
                      {getWhatsAppUrl(record.customerNumber) && (
                        <a
                          href={getWhatsAppUrl(record.customerNumber)!}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-800 hover:bg-emerald-100 transition"
                          title="WhatsApp Chat"
                        >
                          <MessageSquare className="h-3 w-3 text-emerald-600" />
                          <span>WhatsApp</span>
                        </a>
                      )}
                    </>
                  ) : (
                    <span className="text-xs text-slate-400 italic">No contact number</span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* CARD 2: Compliance & Document Validity Matrix */}
          <div className="rounded-xl border border-slate-200/90 bg-white shadow-2xs overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/70 px-4 py-2.5">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-slate-600" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                  Compliance &amp; Document Validity Matrix
                </h3>
              </div>
              <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-2 py-0.5">
                {complianceScore.validCount} of {complianceScore.total} Compliant
              </span>
            </div>

            <div className="p-4">
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-5 text-xs">
                {/* Tax Status */}
                <div className="rounded-lg border border-slate-100 bg-slate-50/70 p-2.5 text-center">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">Road Tax</span>
                  <div className="mt-1">{validityBadge(record.taxStatus, 'validity')}</div>
                  <span className="text-[11px] font-semibold text-slate-700 mt-1 block truncate">
                    {record.taxStatus === 'LIFETIME' ? 'One-time Lifetime' : formatDateValue(record.taxValidUntil)}
                  </span>
                </div>

                {/* Fitness Status */}
                <div className="rounded-lg border border-slate-100 bg-slate-50/70 p-2.5 text-center">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">Fitness (FC)</span>
                  <div className="mt-1">{validityBadge(record.fitnessStatus, 'validity')}</div>
                  <span className="text-[11px] font-semibold text-slate-700 mt-1 block truncate">
                    {formatDateValue(record.fitnessValidUntil)}
                  </span>
                </div>

                {/* Insurance */}
                <div className="rounded-lg border border-slate-100 bg-slate-50/70 p-2.5 text-center">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">Insurance</span>
                  <div className="mt-1">{validityBadge(record.insuranceStatus, 'validity')}</div>
                  <span className="text-[11px] font-semibold text-slate-700 mt-1 block truncate">
                    {formatDateValue(record.insuranceValidUntil)}
                  </span>
                </div>

                {/* PUC */}
                <div className="rounded-lg border border-slate-100 bg-slate-50/70 p-2.5 text-center">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">Pollution (PUC)</span>
                  <div className="mt-1">{validityBadge(record.pucStatus, 'validity')}</div>
                  <span className="text-[11px] font-semibold text-slate-700 mt-1 block truncate">
                    {formatDateValue(record.pucValidUntil)}
                  </span>
                </div>

                {/* HSRP */}
                <div className="rounded-lg border border-slate-100 bg-slate-50/70 p-2.5 text-center col-span-2 sm:col-span-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">HSRP Plate</span>
                  <div className="mt-1">{validityBadge(record.hsrpStatus, 'hsrp')}</div>
                  <span className="text-[11px] font-semibold text-slate-700 mt-1 block truncate">
                    {record.hsrpNumber ? `No: ${record.hsrpNumber}` : 'High Security Plate'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* CARD 3: Note Sheet & Transfer Remarks */}
          <div className="rounded-xl border border-slate-200/90 bg-white shadow-2xs overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/70 px-4 py-2.5">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-slate-600" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                  Note Sheet &amp; Audit Remarks
                </h3>
              </div>
            </div>

            <div className="p-4">
              <div className="rounded-lg border border-slate-100 bg-slate-50/60 p-3 text-xs leading-relaxed text-slate-700 whitespace-pre-wrap min-h-[4rem]">
                {record.noteSheet || <span className="italic text-slate-400">No additional note sheet entries recorded for this RTO transfer.</span>}
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: Financials, Parties Involved, RTO Agent, Audit Links (5 cols) */}
        <div className="space-y-4 lg:col-span-5 xl:col-span-4">
          {/* CARD 1: Financial Ledger & Settlement Progress */}
          <div className="rounded-xl border border-amber-200 bg-gradient-to-br from-amber-50/40 via-white to-white shadow-2xs overflow-hidden">
            <div className="flex items-center justify-between border-b border-amber-100 bg-amber-50/60 px-4 py-2.5">
              <div className="flex items-center gap-2">
                <DollarSign className="h-4 w-4 text-amber-700" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-amber-900">
                  RTO Expenses &amp; Ledger
                </h3>
              </div>
              <span className={`rounded border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                financialSummary.balance === 0
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                  : 'bg-amber-100 text-amber-900 border-amber-300'
              }`}>
                {financialSummary.balance === 0 ? 'Fully Settled' : 'Balance Pending'}
              </span>
            </div>

            <div className="p-4 space-y-3.5">
              {/* Ledger Numbers Grid */}
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-lg border border-slate-100 bg-white p-2.5 shadow-2xs">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Total Expenses</span>
                  <span className="text-base font-bold text-slate-900 mt-0.5 block">
                    ₹{financialSummary.total.toLocaleString('en-IN')}
                  </span>
                </div>

                <div className="rounded-lg border border-emerald-100 bg-emerald-50/40 p-2.5 shadow-2xs">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-800 block">Advance Paid</span>
                  <span className="text-base font-bold text-emerald-700 mt-0.5 block">
                    ₹{financialSummary.advance.toLocaleString('en-IN')}
                  </span>
                </div>

                <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-2.5 shadow-2xs">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-amber-800 block">Balance Due</span>
                  <span className="text-base font-black text-amber-900 mt-0.5 block">
                    ₹{financialSummary.balance.toLocaleString('en-IN')}
                  </span>
                </div>

                <div className="rounded-lg border border-slate-100 bg-white p-2.5 shadow-2xs">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Maintenance Cost</span>
                  <span className="text-base font-bold text-slate-800 mt-0.5 block">
                    ₹{financialSummary.maintenance.toLocaleString('en-IN')}
                  </span>
                </div>
              </div>

              {/* Expense Disbursement Progress Bar */}
              <div>
                <div className="flex items-center justify-between text-[11px] font-medium text-slate-500 mb-1">
                  <span>Disbursement Progress</span>
                  <span><strong>{financialSummary.paidPercent}%</strong> Paid</span>
                </div>
                <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-emerald-500 to-[#FFC107] transition-all"
                    style={{ width: `${financialSummary.paidPercent}%` }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* CARD 2: Deal Parties (Seller & Purchaser) */}
          <div className="rounded-xl border border-slate-200/90 bg-white shadow-2xs overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/70 px-4 py-2.5">
              <div className="flex items-center gap-2">
                <User className="h-4 w-4 text-slate-600" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                  Deal Parties (Seller &amp; Purchaser)
                </h3>
              </div>
              {sellAccountUrl && (
                <Link
                  href={sellAccountUrl}
                  className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-700 hover:text-amber-900 transition"
                  title="View linked sell account deal"
                >
                  <span>Sell Account</span>
                  <ExternalLink className="h-3 w-3" />
                </Link>
              )}
            </div>

            <div className="p-4 space-y-3">
              {/* Seller */}
              <div className="rounded-lg border border-slate-100 bg-slate-50/60 p-3 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Seller Profile</span>
                  <p className="text-xs sm:text-sm font-bold text-slate-900 truncate mt-0.5">{record.sellerName}</p>
                  {record.sellerNumber && (
                    <p className="text-[11px] text-slate-500 font-medium mt-0.5">{record.sellerNumber}</p>
                  )}
                </div>
                {record.sellerNumber && (
                  <div className="flex items-center gap-1 shrink-0">
                    <a
                      href={`tel:${record.sellerNumber}`}
                      className="p-1.5 rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition"
                      title="Call Seller"
                    >
                      <Phone className="h-3.5 w-3.5" />
                    </a>
                    {getWhatsAppUrl(record.sellerNumber) && (
                      <a
                        href={getWhatsAppUrl(record.sellerNumber)!}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-1.5 rounded-md border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition"
                        title="WhatsApp Seller"
                      >
                        <MessageSquare className="h-3.5 w-3.5" />
                      </a>
                    )}
                  </div>
                )}
              </div>

              {/* Purchaser */}
              <div className="rounded-lg border border-slate-100 bg-slate-50/60 p-3 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Purchaser Profile</span>
                  <p className="text-xs sm:text-sm font-bold text-slate-900 truncate mt-0.5">{record.purchaserName}</p>
                  {record.purchaserNumber && (
                    <p className="text-[11px] text-slate-500 font-medium mt-0.5">{record.purchaserNumber}</p>
                  )}
                </div>
                {record.purchaserNumber && (
                  <div className="flex items-center gap-1 shrink-0">
                    <a
                      href={`tel:${record.purchaserNumber}`}
                      className="p-1.5 rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition"
                      title="Call Purchaser"
                    >
                      <Phone className="h-3.5 w-3.5" />
                    </a>
                    {getWhatsAppUrl(record.purchaserNumber) && (
                      <a
                        href={getWhatsAppUrl(record.purchaserNumber)!}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-1.5 rounded-md border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition"
                        title="WhatsApp Purchaser"
                      >
                        <MessageSquare className="h-3.5 w-3.5" />
                      </a>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* CARD 3: RTO Agent & Office Network */}
          <div className="rounded-xl border border-slate-200/90 bg-white shadow-2xs overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/70 px-4 py-2.5">
              <div className="flex items-center gap-2">
                <Building2 className="h-4 w-4 text-slate-600" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                  RTO Agent &amp; Official Office
                </h3>
              </div>
            </div>

            <div className="p-4 space-y-3 text-xs">
              {/* Office Location */}
              <div className="rounded-lg border border-slate-100 bg-slate-50/60 p-3">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Jurisdiction Office</span>
                <p className="text-sm font-bold text-slate-900 mt-0.5">{record.rtoOffice || 'Office not specified'}</p>
                <span className="inline-block mt-1 text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300 px-2 py-0.5 rounded">
                  Official Transport Authority
                </span>
              </div>

              {/* Agent Card */}
              <div className="rounded-lg border border-slate-100 bg-slate-50/60 p-3 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Handling Agent</span>
                  <p className="text-xs sm:text-sm font-bold text-slate-900 truncate mt-0.5">{record.rtoAgentName || 'Agent not assigned'}</p>
                  {[record.rtoAgentCity, record.rtoAgentState].filter(Boolean).length > 0 && (
                    <p className="text-[11px] font-medium text-slate-500 mt-0.5">
                      {[record.rtoAgentCity, record.rtoAgentState].filter(Boolean).join(', ')}
                    </p>
                  )}
                  {record.rtoAgentNumber && (
                    <p className="text-[11px] font-semibold text-slate-700 mt-0.5">{record.rtoAgentNumber}</p>
                  )}
                </div>

                {record.rtoAgentNumber && (
                  <div className="flex items-center gap-1 shrink-0">
                    <a
                      href={`tel:${record.rtoAgentNumber}`}
                      className="p-1.5 rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition"
                      title="Call Agent"
                    >
                      <Phone className="h-3.5 w-3.5" />
                    </a>
                    {getWhatsAppUrl(record.rtoAgentNumber) && (
                      <a
                        href={getWhatsAppUrl(record.rtoAgentNumber)!}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-1.5 rounded-md border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition"
                        title="WhatsApp Agent"
                      >
                        <MessageSquare className="h-3.5 w-3.5" />
                      </a>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* CARD 4: Audit Metadata & System References */}
          <div className="rounded-xl border border-slate-200/90 bg-white shadow-2xs overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/70 px-4 py-2.5">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-700">Audit &amp; System Details</span>
            </div>
            <div className="p-3 text-[11px] space-y-1.5 text-slate-500">
              <div className="flex items-center justify-between">
                <span>Record ID:</span>
                <span className="font-mono font-semibold text-slate-700">{record.id.slice(0, 13)}...</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Created At:</span>
                <span className="font-semibold text-slate-700">{formatDateTimeValue(record.createdAt)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Last Updated:</span>
                <span className="font-semibold text-slate-700">{formatDateTimeValue(record.updatedAt)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Status Change Dialog with Remark Audit */}
      {pendingStatus ? (
        <RemarkDialog
          title={`Update RTO Status to "${STATUS_CONFIG[pendingStatus]?.label || pendingStatus}"`}
          description={
            pendingStatus === 'DEAL_DONE'
              ? 'Finalizing Deal Done locks this transfer dossier permanently. Further edits or status modifications will be disabled.'
              : 'Please enter a brief remark explaining this status progression (saved in audit logs).'
          }
          confirmLabel={pendingStatus === 'DEAL_DONE' ? 'Confirm & Lock Deal' : 'Save Status Update'}
          busy={updatingStatus}
          onCancel={() => setPendingStatus(null)}
          onConfirm={(remark) => handleQuickStatusChange(pendingStatus, remark)}
        />
      ) : null}
    </div>
  );
}
