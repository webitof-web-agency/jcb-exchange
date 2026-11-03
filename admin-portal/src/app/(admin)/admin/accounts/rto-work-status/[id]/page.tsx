'use client';

import { ComponentType, useEffect, useState, useMemo, useCallback } from 'react';
import { useRouter, useParams, usePathname } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft, CheckCircle2, Clock, Car, User, Phone, Pencil,
  FileText, DollarSign, AlertTriangle, ShieldCheck, Building2,
  ChevronDown, Check, Loader2, LockKeyhole, CalendarDays, ExternalLink,
  Copy, Share2, Printer, MessageSquare, ArrowUpRight, Gauge,
  Award, ShieldAlert, Sparkles, CheckCircle, History, Send, Shield, Info, CheckCheck
} from 'lucide-react';
import { toast } from 'react-toastify';
import api from '@/lib/api';
import { getAccountUpdatePermissions } from '@/lib/accountsPermissions';
import { hasAnyPermission } from '@/lib/permissionUtils';
import { useAuthStore } from '@/store/authStore';
import { normalizeRtoStatus } from '@/lib/rtoWorkStatusForm.mjs';
import { getRtoDetailActionState } from '@/lib/rtoDetailView.mjs';
import RemarkDialog from '@/components/accounts/RemarkDialog';
import { generateAdminListingDetailPath, generateAdminSoldVehicleDetailPath } from '@/lib/routePaths';

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

type StatusLog = {
  id: string;
  oldStatus: string | null;
  newStatus: string;
  remark: string;
  createdAt: string;
  changedByName: string | null;
};

const getWhatsAppUrl = (phone?: string, text?: string) => {
  if (!phone) return null;
  const digits = phone.replace(/[^0-9]/g, '');
  if (digits.length < 10) return null;
  const clean = digits.length >= 10 ? (digits.startsWith('91') ? digits : `91${digits.slice(-10)}`) : digits;
  const query = text ? `?text=${encodeURIComponent(text)}` : '';
  return `https://wa.me/${clean}${query}`;
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
      : '/admin';

  const listPath = `${basePortalPath}/accounts/rto-work-status`;

  const currentUser = useAuthStore((state) => state.user);
  const canUpdateRto =
    currentUser?.role === 'SUPER_ADMIN' ||
    currentUser?.role === 'ADMIN' ||
    hasAnyPermission(currentUser?.permissions || [], getAccountUpdatePermissions('rto-work-status'));

  const [record, setRecord] = useState<RtoRecord | null>(null);
  const [statusLogs, setStatusLogs] = useState<StatusLog[]>([]);
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

      // Append new event to status audit timeline
      const newLogItem: StatusLog = {
        id: `log-${Date.now()}`,
        oldStatus: prevStatus,
        newStatus: nextStatus,
        remark: statusRemark,
        createdAt: new Date().toISOString(),
        changedByName: currentUser?.name || 'Administrator',
      };
      setStatusLogs((prev) => [newLogItem, ...prev]);

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

      const decodedParam = decodeURIComponent(String(id || '')).trim();
      const cleanParam = decodedParam.toUpperCase().replace(/[^A-Z0-9]/g, '');

      const matchRecord = (item: RtoRecord) => {
        if (String(item.id).toLowerCase() === decodedParam.toLowerCase()) return true;
        const itemClean = String(item.vehicleNumber || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
        if (itemClean && cleanParam && itemClean === cleanParam) return true;
        return false;
      };

      const syncCanonicalUrl = (foundRecord: RtoRecord) => {
        if (!foundRecord.vehicleNumber) return;
        const canonicalSlug = formatRegistrationNumber(foundRecord.vehicleNumber) || foundRecord.vehicleNumber.trim().toUpperCase() || foundRecord.id;
        const canonicalPath = `${basePortalPath}/accounts/rto-work-status/${encodeURIComponent(canonicalSlug)}`;
        if (pathname !== canonicalPath) {
          router.replace(canonicalPath);
        }
      };

      const getCachedRecord = () => {
        try {
          const saved = localStorage.getItem('jcb_rto_records');
          if (!saved) return null;
          const parsed = JSON.parse(saved) as RtoRecord[];
          return parsed.find(matchRecord) || null;
        } catch {
          return null;
        }
      };

      try {
        const response = await api.get('/recruitment/admin/rto-records');
        const found = ((response.data?.records || []) as RtoRecord[]).find(matchRecord);
        if (isMounted) {
          const resolved = found ? { ...found, rtoStatus: normalizeRtoStatus(found.rtoStatus) } : null;
          setRecord(resolved);
          if (resolved) {
            syncCanonicalUrl(resolved);
            // Fetch live statusLogs & workspace remarks for Section B.4 Timeline
            try {
              const wsRes = await api.get(`/recruitment/admin/rto-records/${encodeURIComponent(resolved.id)}/workspace`);
              if (isMounted && Array.isArray(wsRes.data?.statusLogs)) {
                setStatusLogs(wsRes.data.statusLogs);
              }
            } catch {
              // ignore workspace fetch failure fallback
            }
          }
        }
      } catch {
        const cached = getCachedRecord();
        if (isMounted) {
          const resolved = cached ? { ...cached, rtoStatus: normalizeRtoStatus(cached.rtoStatus) } : null;
          setRecord(resolved);
          if (resolved) {
            syncCanonicalUrl(resolved);
          }
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    void loadRecord();

    return () => {
      isMounted = false;
    };
  }, [id, basePortalPath, pathname, router]);

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

  const formattedPlate = record?.vehicleNumber ? formatRegistrationNumber(record.vehicleNumber) : '';

  const handleShare = useCallback(async () => {
    if (!record) return;
    const shareUrl = typeof window !== 'undefined' ? window.location.href : '';
    const shareTitle = `RTO Work Status - ${formattedPlate || record.vehicleModel || 'Vehicle Transfer'}`;
    const shareText = `Check RTO transfer status for vehicle ${formattedPlate || record.vehicleNumber} (Customer: ${record.customerName})`;

    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({
          title: shareTitle,
          text: shareText,
          url: shareUrl,
        });
        return;
      } catch (err: unknown) {
        if (err instanceof Error && err.name === 'AbortError') {
          return;
        }
      }
    }

    copyText(shareUrl, 'pageUrl');
  }, [record, formattedPlate, copyText]);

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

  // Section B.1: Visual 5-Point Compliance Radar Data with Countdown Days
  const complianceRadarData = useMemo(() => {
    if (!record) return [];

    const now = new Date();
    const getCountdown = (validUntil: string | null | undefined, status: string) => {
      if (status === 'LIFETIME') {
        return { text: 'Lifetime Valid', tone: 'lifetime' as const, days: Infinity, isExpired: false, isNear: false };
      }
      if (status === 'NOT_APPLICABLE' || status === 'NOT_REQUIRED' || status === 'NOT_AVAILABLE') {
        return { text: 'Not Required / N/A', tone: 'slate' as const, days: null, isExpired: false, isNear: false };
      }
      if (!validUntil) {
        return { text: status === 'VALID' ? 'Date Missing' : 'Expired / Pending', tone: 'rose' as const, days: null, isExpired: true, isNear: false };
      }
      const exp = new Date(validUntil);
      if (Number.isNaN(exp.getTime())) {
        return { text: 'Invalid Date', tone: 'rose' as const, days: null, isExpired: true, isNear: false };
      }
      const diffDays = Math.ceil((exp.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      if (diffDays < 0) {
        return { text: `Expired ${Math.abs(diffDays)}d ago`, tone: 'rose' as const, days: diffDays, isExpired: true, isNear: false };
      }
      if (diffDays <= 15) {
        return { text: `Expiring in ${diffDays} days!`, tone: 'amber' as const, days: diffDays, isExpired: false, isNear: true };
      }
      return { text: `Valid for ${diffDays} days`, tone: 'emerald' as const, days: diffDays, isExpired: false, isNear: false };
    };

    return [
      {
        title: 'Road Tax',
        status: record.taxStatus,
        statusLabel: record.taxStatus === 'LIFETIME' ? 'Lifetime' : record.taxStatus === 'VALID' ? 'Valid' : 'Expired / N/A',
        validUntil: record.taxValidUntil,
        countdown: getCountdown(record.taxValidUntil, record.taxStatus),
        icon: DollarSign,
      },
      {
        title: 'Fitness (FC)',
        status: record.fitnessStatus,
        statusLabel: record.fitnessStatus === 'VALID' ? 'Valid' : 'Expired / N/A',
        validUntil: record.fitnessValidUntil,
        countdown: getCountdown(record.fitnessValidUntil, record.fitnessStatus),
        icon: Gauge,
      },
      {
        title: 'Insurance',
        status: record.insuranceStatus,
        statusLabel: record.insuranceStatus === 'VALID' ? 'Valid' : 'Expired / N/A',
        validUntil: record.insuranceValidUntil,
        countdown: getCountdown(record.insuranceValidUntil, record.insuranceStatus),
        icon: ShieldCheck,
      },
      {
        title: 'Pollution (PUC)',
        status: record.pucStatus,
        statusLabel: record.pucStatus === 'VALID' ? 'Valid' : 'Expired / N/A',
        validUntil: record.pucValidUntil,
        countdown: getCountdown(record.pucValidUntil, record.pucStatus),
        icon: Award,
      },
      {
        title: 'HSRP Plate',
        status: record.hsrpStatus,
        statusLabel: record.hsrpStatus === 'YES' ? 'Fitted' : record.hsrpStatus === 'NO' ? 'Not Fitted' : 'Pending',
        validUntil: null,
        extra: record.hsrpNumber ? `Plate #${record.hsrpNumber}` : 'High Security Plate',
        countdown: {
          text: record.hsrpStatus === 'YES' ? 'HSRP IND Fitted' : 'Fitment Pending',
          tone: (record.hsrpStatus === 'YES' ? 'emerald' : 'amber') as 'emerald' | 'amber',
          days: null,
          isExpired: record.hsrpStatus === 'NO',
          isNear: false,
        },
        icon: Car,
      },
    ];
  }, [record]);

  // Section B.2: Interactive RTO Milestone Stepper Configuration
  const RTO_MILESTONES = useMemo(() => {
    if (!record) return [];

    const isDealDone = record.rtoStatus === 'DEAL_DONE' || Boolean(record.isLocked);
    const isCompleted = record.rtoStatus === 'RTO_WORK_COMPLETED' || isDealDone;
    const isInProgress = record.rtoStatus === 'RTO_WORK_IN_PROGRESS' || isCompleted;
    const isStarted = record.rtoStatus === 'RTO_WORK_STARTED' || isInProgress;

    return [
      {
        id: 'DOC_RECEIVED',
        label: 'Doc Received',
        sublabel: 'Dossier Ready',
        statusTarget: null,
        isDone: true,
        isActive: record.rtoStatus === 'RTO_WORK_STARTED' && !record.documentSendDate,
        date: null,
      },
      {
        id: 'RTO_WORK_STARTED',
        label: 'Sent to RTO',
        sublabel: record.documentSendDate ? formatDateValue(record.documentSendDate) : 'Dispatched',
        statusTarget: 'RTO_WORK_STARTED',
        isDone: Boolean(record.documentSendDate) || isStarted,
        isActive: record.rtoStatus === 'RTO_WORK_STARTED',
        date: record.documentSendDate,
      },
      {
        id: 'RTO_WORK_IN_PROGRESS',
        label: 'Work In Progress',
        sublabel: 'RTO Office Scrutiny',
        statusTarget: 'RTO_WORK_IN_PROGRESS',
        isDone: isInProgress,
        isActive: record.rtoStatus === 'RTO_WORK_IN_PROGRESS',
        date: null,
      },
      {
        id: 'RTO_WORK_COMPLETED',
        label: 'Transfer Done',
        sublabel: 'RC Approved',
        statusTarget: 'RTO_WORK_COMPLETED',
        isDone: isCompleted,
        isActive: record.rtoStatus === 'RTO_WORK_COMPLETED',
        date: null,
      },
      {
        id: 'DEAL_DONE',
        label: 'Deal Finalized & Locked',
        sublabel: record.isLocked ? 'Permanent Archive' : 'Final Closure',
        statusTarget: 'DEAL_DONE',
        isDone: isDealDone,
        isActive: isDealDone,
        date: record.lockedAt,
      },
    ];
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

  const listingDetailUrl = record.listingId
    ? generateAdminListingDetailPath(`${basePortalPath}/listings`, { id: record.listingId, title: `${record.brandName || ''} ${record.vehicleModel || ''}`.trim() })
    : null;
  const sellAccountUrl = record.sellAccountId
    ? generateAdminSoldVehicleDetailPath(`${basePortalPath}/accounts/sell-accounts`, {
        id: record.sellAccountId,
        vehicleNumber: record.vehicleNumber,
        listingTitle: `${record.brandName || ''} ${record.vehicleModel || ''}`.trim(),
      })
    : null;

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

          {/* Quick Copy / Native Share Link */}
          <button
            type="button"
            onClick={handleShare}
            className="inline-flex h-8 sm:h-9 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
            title="Share RTO dossier link"
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

      {/* Section B.2: Interactive RTO Milestone Stepper */}
      <div className="rounded-xl border border-slate-200/90 bg-white p-3.5 shadow-2xs profile-no-print">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5 text-slate-400" />
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Interactive RTO Milestone Pipeline
            </span>
            {detailActions.canChangeStatus && !record.isLocked && (
              <span className="text-[10px] font-semibold text-amber-700 bg-amber-50 px-2 py-0.2 rounded-full border border-amber-200">
                Click any milestone to fast-forward stage
              </span>
            )}
          </div>
          {record.documentSendDate ? (
            <span className="text-[11px] font-semibold text-slate-600">
              Dispatched to RTO: <strong className="text-slate-900">{formatDateValue(record.documentSendDate)}</strong>
            </span>
          ) : (
            <span className="text-[11px] text-amber-700 font-medium">Docs Not Yet Dispatched</span>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          {RTO_MILESTONES.map((step, idx) => {
            const isClickable = detailActions.canChangeStatus && !record.isLocked && Boolean(step.statusTarget) && step.statusTarget !== record.rtoStatus;

            return (
              <div
                key={step.id}
                onClick={() => {
                  if (isClickable && step.statusTarget) {
                    requestStatusChange(step.statusTarget);
                  }
                }}
                className={`relative flex flex-col rounded-xl border p-2.5 transition-all select-none ${
                  step.isActive
                    ? 'border-amber-400 bg-amber-50/70 shadow-xs ring-1 ring-amber-400/50'
                    : step.isDone
                      ? 'border-emerald-200 bg-emerald-50/40 text-emerald-950'
                      : 'border-slate-200/80 bg-slate-50/60 text-slate-500'
                } ${isClickable ? 'cursor-pointer hover:border-amber-400 hover:bg-white hover:shadow-xs' : ''}`}
                title={isClickable ? `Click to advance RTO status to "${step.label}"` : step.label}
              >
                {/* Step indicator node */}
                <div className="flex items-center justify-between mb-1.5">
                  <div
                    className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-black shadow-2xs ${
                      step.isActive
                        ? 'bg-[#FFC107] text-slate-950 animate-pulse'
                        : step.isDone
                          ? 'bg-emerald-600 text-white'
                          : 'bg-white border border-slate-300 text-slate-600'
                    }`}
                  >
                    {step.isDone ? <Check className="h-3.5 w-3.5" /> : idx + 1}
                  </div>

                  <span
                    className={`text-[9px] font-black uppercase tracking-wider px-1.5 py-0.2 rounded ${
                      step.isActive
                        ? 'bg-amber-200/80 text-amber-900'
                        : step.isDone
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-slate-200/60 text-slate-600'
                    }`}
                  >
                    {step.isActive ? 'Active Stage' : step.isDone ? 'Completed' : 'Upcoming'}
                  </span>
                </div>

                <h4 className="text-xs font-bold text-slate-900 truncate">{step.label}</h4>
                <p className="text-[10px] text-slate-500 truncate mt-0.5">{step.sublabel}</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Section B.3: Party Contact Matrix (Seller, Purchaser, RTO Agent) */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between px-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
            <User className="h-3.5 w-3.5 text-slate-400" />
            <span>Party Contact &amp; Settlement Matrix</span>
          </span>
          <span className="text-[10px] text-slate-400">1-Click Direct Calls, WhatsApp &amp; Clipboard Actions</span>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {/* Card 1: Seller Party */}
          <div className="flex flex-col justify-between rounded-xl border border-slate-200/90 bg-white p-3.5 shadow-2xs">
            <div>
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <span className="rounded bg-slate-100 px-2 py-0.5 text-[9.5px] font-black uppercase tracking-wider text-slate-600">
                  Seller · Vehicle Origin
                </span>
                {record.sellAccountId && (
                  <Link
                    href={sellAccountUrl || '#'}
                    className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-700 hover:underline"
                    title="Open linked sell account"
                  >
                    <span>Sell Account</span>
                    <ExternalLink className="h-2.5 w-2.5" />
                  </Link>
                )}
              </div>

              <div className="mt-2.5">
                <h4 className="text-sm font-black text-slate-900 truncate" title={record.sellerName}>
                  {record.sellerName || 'Direct Seller'}
                </h4>
                <p className="mt-0.5 text-xs font-medium text-slate-500">
                  {record.sellerNumber || 'No phone number provided'}
                </p>
              </div>
            </div>

            <div className="mt-3 flex items-center gap-1.5 border-t border-slate-50 pt-2.5">
              {record.sellerNumber ? (
                <>
                  <a
                    href={`tel:${record.sellerNumber}`}
                    className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs font-bold text-slate-700 shadow-2xs hover:bg-slate-100 transition"
                    title="Direct Phone Call"
                  >
                    <Phone className="h-3 w-3 text-emerald-600" />
                    <span>Call</span>
                  </a>
                  <a
                    href={getWhatsAppUrl(
                      record.sellerNumber,
                      `Hello ${record.sellerName}, regarding the RTO ownership transfer for vehicle ${formattedPlate || record.vehicleNumber}: our accounts team is processing your transfer. Thank you.`
                    )!}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1.5 text-xs font-bold text-emerald-800 shadow-2xs hover:bg-emerald-100 transition"
                    title="1-Click WhatsApp Update"
                  >
                    <Send className="h-3 w-3 text-emerald-600" />
                    <span>WhatsApp</span>
                  </a>
                  <button
                    type="button"
                    onClick={() => copyText(`${record.sellerName}: ${record.sellerNumber}`, 'sellerContact')}
                    className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-500 hover:bg-slate-100 transition"
                    title="Copy seller details"
                  >
                    {copiedKey === 'sellerContact' ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                  </button>
                </>
              ) : (
                <span className="text-[11px] text-slate-400 italic">No contact actions available</span>
              )}
            </div>
          </div>

          {/* Card 2: Purchaser / Buyer Party */}
          <div className="flex flex-col justify-between rounded-xl border border-slate-200/90 bg-white p-3.5 shadow-2xs">
            <div>
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <span className="rounded bg-blue-50 border border-blue-200/60 px-2 py-0.5 text-[9.5px] font-black uppercase tracking-wider text-blue-800">
                  Purchaser · New Owner
                </span>
                {record.customerName && record.purchaserName && record.customerName !== record.purchaserName && (
                  <span className="text-[10px] text-slate-400 truncate max-w-[120px]" title={`Contact: ${record.customerName}`}>
                    Ref: {record.customerName}
                  </span>
                )}
              </div>

              <div className="mt-2.5">
                <h4 className="text-sm font-black text-slate-900 truncate" title={record.purchaserName || record.customerName}>
                  {record.purchaserName || record.customerName}
                </h4>
                <p className="mt-0.5 text-xs font-medium text-slate-500">
                  {record.purchaserNumber || record.customerNumber || 'No phone number provided'}
                </p>
              </div>
            </div>

            <div className="mt-3 flex items-center gap-1.5 border-t border-slate-50 pt-2.5">
              {(record.purchaserNumber || record.customerNumber) ? (
                <>
                  <a
                    href={`tel:${record.purchaserNumber || record.customerNumber}`}
                    className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs font-bold text-slate-700 shadow-2xs hover:bg-slate-100 transition"
                    title="Direct Phone Call"
                  >
                    <Phone className="h-3 w-3 text-emerald-600" />
                    <span>Call</span>
                  </a>
                  <a
                    href={getWhatsAppUrl(
                      record.purchaserNumber || record.customerNumber,
                      `Hello ${record.purchaserName || record.customerName}, update regarding your vehicle ${formattedPlate || record.vehicleNumber} RC transfer: current status is "${statusInfo.label}". Please feel free to reply if you need any assistance.`
                    )!}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1.5 text-xs font-bold text-emerald-800 shadow-2xs hover:bg-emerald-100 transition"
                    title="1-Click WhatsApp Update"
                  >
                    <Send className="h-3 w-3 text-emerald-600" />
                    <span>WhatsApp</span>
                  </a>
                  <button
                    type="button"
                    onClick={() => copyText(`${record.purchaserName || record.customerName}: ${record.purchaserNumber || record.customerNumber}`, 'purchaserContact')}
                    className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-500 hover:bg-slate-100 transition"
                    title="Copy purchaser details"
                  >
                    {copiedKey === 'purchaserContact' ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                  </button>
                </>
              ) : (
                <span className="text-[11px] text-slate-400 italic">No contact actions available</span>
              )}
            </div>
          </div>

          {/* Card 3: RTO Agent & Office */}
          <div className="flex flex-col justify-between rounded-xl border border-amber-200/90 bg-gradient-to-br from-amber-50/30 to-white p-3.5 shadow-2xs">
            <div>
              <div className="flex items-center justify-between border-b border-amber-100 pb-2">
                <span className="rounded bg-amber-100 border border-amber-300 px-2 py-0.5 text-[9.5px] font-black uppercase tracking-wider text-amber-900">
                  RTO Agent · {record.rtoOffice || 'Authority'}
                </span>
                <span
                  className={`text-[10px] font-black ${
                    financialSummary.balance > 0 ? 'text-amber-900' : 'text-emerald-700'
                  }`}
                >
                  {financialSummary.balance > 0 ? `₹${financialSummary.balance.toLocaleString('en-IN')} Due` : 'Settled'}
                </span>
              </div>

              <div className="mt-2.5">
                <h4 className="text-sm font-black text-slate-900 truncate" title={record.rtoAgentName}>
                  {record.rtoAgentName || 'Agent Not Assigned'}
                </h4>
                <p className="mt-0.5 text-xs font-medium text-slate-500">
                  {[record.rtoAgentCity, record.rtoAgentState].filter(Boolean).join(', ') || record.rtoAgentNumber || 'Pending assignment'}
                </p>
              </div>
            </div>

            <div className="mt-3 flex items-center gap-1.5 border-t border-amber-100/60 pt-2.5">
              {record.rtoAgentNumber ? (
                <>
                  <a
                    href={`tel:${record.rtoAgentNumber}`}
                    className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-bold text-slate-700 shadow-2xs hover:bg-slate-50 transition"
                    title="Direct Phone Call"
                  >
                    <Phone className="h-3 w-3 text-emerald-600" />
                    <span>Call</span>
                  </a>
                  <a
                    href={getWhatsAppUrl(
                      record.rtoAgentNumber,
                      `Hello ${record.rtoAgentName || 'Agent'}, please share the latest RC transfer status and document updates for vehicle ${formattedPlate || record.vehicleNumber} at ${record.rtoOffice || 'RTO'}. Thank you.`
                    )!}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1.5 text-xs font-bold text-emerald-800 shadow-2xs hover:bg-emerald-100 transition"
                    title="1-Click WhatsApp Follow-up"
                  >
                    <Send className="h-3 w-3 text-emerald-600" />
                    <span>WhatsApp</span>
                  </a>
                  <button
                    type="button"
                    onClick={() => copyText(`${record.rtoAgentName}: ${record.rtoAgentNumber} (${record.rtoOffice})`, 'agentContact')}
                    className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 transition"
                    title="Copy agent details"
                  >
                    {copiedKey === 'agentContact' ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                  </button>
                </>
              ) : (
                <span className="text-[11px] text-slate-400 italic">No agent phone recorded</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Main Grid: 7 / 5 Layout */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        {/* LEFT COLUMN: Vehicle Details, Section B.1 Compliance Radar, Note Sheet (7 cols) */}
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
            </div>
          </div>

          {/* CARD 2: Section B.1 Visual 5-Point Compliance Radar */}
          <div className="rounded-xl border border-slate-200/90 bg-white shadow-2xs overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/70 px-4 py-2.5">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-emerald-600" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                  Visual 5-Point Compliance Radar
                </h3>
              </div>
              <span className="text-[11px] font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 rounded px-2 py-0.5">
                {complianceScore.validCount} of {complianceScore.total} Points Clear ({complianceScore.percent}%)
              </span>
            </div>

            <div className="p-4">
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
                {complianceRadarData.map((item) => {
                  const Icon = item.icon;
                  const isExp = item.countdown.isExpired;
                  const isNear = item.countdown.isNear;

                  return (
                    <div
                      key={item.title}
                      className={`flex flex-col justify-between rounded-xl border p-3 shadow-2xs transition-all ${
                        isExp
                          ? 'border-rose-300 bg-gradient-to-b from-rose-50/60 to-white'
                          : isNear
                            ? 'border-amber-300 bg-gradient-to-b from-amber-50/60 to-white'
                            : item.countdown.tone === 'lifetime'
                              ? 'border-amber-300/80 bg-gradient-to-b from-amber-50/40 to-white'
                              : 'border-emerald-200/80 bg-gradient-to-b from-emerald-50/40 to-white'
                      }`}
                    >
                      <div>
                        {/* Title & Icon */}
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-[11px] font-bold text-slate-900">{item.title}</span>
                          <div
                            className={`flex h-6 w-6 items-center justify-center rounded-lg ${
                              isExp
                                ? 'bg-rose-100 text-rose-700'
                                : isNear
                                  ? 'bg-amber-100 text-amber-800'
                                  : 'bg-emerald-100 text-emerald-700'
                            }`}
                          >
                            <Icon className="h-3.5 w-3.5" />
                          </div>
                        </div>

                        {/* Status badge */}
                        <div className="mb-2">
                          {item.title === 'HSRP Plate'
                            ? validityBadge(record.hsrpStatus, 'hsrp')
                            : validityBadge(item.status, 'validity')}
                        </div>

                        {/* Expiry Date */}
                        <p className="text-[11px] font-semibold text-slate-700 truncate">
                          {item.extra ? item.extra : formatDateValue(item.validUntil)}
                        </p>
                      </div>

                      {/* Countdown badge */}
                      <div className="mt-2.5 pt-2 border-t border-slate-100">
                        <span
                          className={`inline-block w-full text-center rounded px-1.5 py-0.75 text-[9.5px] font-black uppercase tracking-wider ${
                            isExp
                              ? 'bg-rose-100 text-rose-800 border border-rose-300 animate-pulse'
                              : isNear
                                ? 'bg-amber-100 text-amber-900 border border-amber-300'
                                : item.countdown.tone === 'lifetime'
                                  ? 'bg-amber-50 text-amber-900 border border-amber-200'
                                  : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                          }`}
                        >
                          {item.countdown.text}
                        </span>
                      </div>
                    </div>
                  );
                })}
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

        {/* RIGHT COLUMN: Financial Ledger, Section B.4 Live Status Audit Timeline, System Metadata (5 cols) */}
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

          {/* CARD 2: Section B.4 Status Audit & Remark History Timeline */}
          <div className="rounded-xl border border-slate-200/90 bg-white shadow-2xs overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/70 px-4 py-2.5">
              <div className="flex items-center gap-2">
                <History className="h-4 w-4 text-slate-600" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                  Status Audit &amp; Remark Timeline
                </h3>
              </div>
              <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">
                {statusLogs.length > 0 ? `${statusLogs.length} Events` : 'Active'}
              </span>
            </div>

            <div className="p-4">
              {statusLogs.length > 0 ? (
                <div className="relative pl-4 space-y-4 before:absolute before:left-1.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200">
                  {statusLogs.map((log, index) => {
                    const cfgNew = STATUS_CONFIG[log.newStatus] || STATUS_CONFIG.RTO_WORK_IN_PROGRESS;
                    return (
                      <div key={log.id || index} className="relative group">
                        {/* Timeline circle dot */}
                        <div className="absolute -left-4 top-1 h-3 w-3 rounded-full border-2 border-white bg-amber-500 shadow-2xs group-hover:scale-125 transition-transform" />
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center justify-between gap-1">
                            <span className="text-[11px] font-bold text-slate-900">
                              {log.changedByName || 'Administrator'}
                            </span>
                            <span className="text-[10px] text-slate-400">
                              {formatDateTimeValue(log.createdAt)}
                            </span>
                          </div>
                          {/* Status transition badge */}
                          <div className="flex items-center gap-1.5 text-[10px] font-semibold">
                            {log.oldStatus && (
                              <>
                                <span className="text-slate-500 line-through">
                                  {STATUS_CONFIG[log.oldStatus]?.label || log.oldStatus}
                                </span>
                                <span className="text-slate-400">➔</span>
                              </>
                            )}
                            <span className={`rounded px-1.5 py-0.2 font-bold ${cfgNew.bg} ${cfgNew.text} border ${cfgNew.border}`}>
                              {cfgNew.label}
                            </span>
                          </div>
                          {/* Remark box */}
                          <div className="mt-1 rounded-lg border border-slate-100 bg-slate-50/80 p-2 text-xs text-slate-700 italic">
                            "{log.remark}"
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-xs text-slate-500 space-y-2">
                  <div className="flex items-center gap-2 text-slate-700 font-semibold">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    <span>Initial RTO transfer case file registered</span>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Created on {formatDateTimeValue(record.createdAt)}. Every status change, advance payment note, and employee remark will appear here in chronological order with full author tracking.
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* CARD 3: Audit Metadata & System References */}
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
