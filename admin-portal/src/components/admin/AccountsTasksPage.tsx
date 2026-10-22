/* eslint-disable react-hooks/set-state-in-effect */
'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  ArrowUpDown,
  Building2,
  Calendar,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Copy,
  Download,
  ExternalLink,
  FileCheck2,
  FileSpreadsheet,
  Filter,
  Layers,
  LayoutGrid,
  ListTodo,
  Loader2,
  MapPin,
  MessageSquare,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Table as TableIcon,
  User,
  X,
} from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { toast } from 'react-toastify';
import api from '@/lib/api';
import BrandLoader from '@/components/ui/BrandLoader';
import RemarkDialog from '@/components/accounts/RemarkDialog';
import { useAuthStore } from '@/store/authStore';
import { hasAnyPermission } from '@/lib/permissionUtils';
import { getAccountUpdatePermissions } from '@/lib/accountsPermissions';
import {
  TRANSFER_TASK_STATUS_OPTIONS,
  getTransferTaskStatus,
  isTransferTaskDone,
} from '@/lib/rtoTransferTasks.mjs';

// Types
type TaskStatus =
  | 'PENDING'
  | 'DOCUMENT_EXPIRED'
  | 'RENEWAL_IN_PROGRESS'
  | 'TRANSFER_INITIATED'
  | 'ISSUE_REPORTED'
  | 'TRANSFERRED'
  | 'NOT_REQUIRED'
  | 'COMPLETED'
  | 'IN_PROGRESS'
  | string;

type TaskRecord = {
  id: string;
  rtoRecordId?: string;
  taskKey: string;
  label: string;
  isOptional?: boolean;
  sortOrder?: number;
  status: TaskStatus;
  remark?: string | null;
  updatedAt?: string | null;
  createdAt?: string | null;
  rtoRecord: {
    id: string;
    vehicleNumber?: string | null;
    customerName?: string | null;
    rtoOffice?: string | null;
    rtoStatus?: string | null;
    sellAccount?: {
      recordNumber?: string | null;
      listingTitle?: string | null;
      brandName?: string | null;
      vehicleModel?: string | null;
      purchaserName?: string | null;
    } | null;
  };
};

type ViewMode = 'table' | 'cards';
type SortField = 'updated_desc' | 'updated_asc' | 'label_asc' | 'vehicle_asc' | 'status';

// Helper: safe api error extract
const apiError = (error: unknown, fallback: string) => {
  const detail = (error as { response?: { data?: { error?: unknown } } })?.response?.data?.error;
  return typeof detail === 'string' && detail.trim()
    ? detail
    : error instanceof Error && error.message
    ? error.message
    : fallback;
};

// Formatting helpers
const formatDate = (value: unknown) => {
  if (!value) return '—';
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime())
    ? '—'
    : new Intl.DateTimeFormat('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      }).format(parsed);
};

const formatTimeAgo = (value: unknown) => {
  if (!value) return '';
  const parsed = new Date(String(value));
  if (Number.isNaN(parsed.getTime())) return '';
  const diffSec = Math.floor((Date.now() - parsed.getTime()) / 1000);
  if (diffSec < 60) return 'Just now';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  if (diffSec < 86400 * 7) return `${Math.floor(diffSec / 86400)}d ago`;
  return formatDate(value);
};

// HSRP Plate Formatting
const vehicleNumberInput = (value: string) =>
  (value || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10);

const vehicleNumberDisplay = (value: string) => {
  const cleaned = vehicleNumberInput(value);
  if (cleaned.length <= 2) return cleaned;
  const state = cleaned.slice(0, 2);
  const district = cleaned.slice(2, 4);
  const series = cleaned.slice(4, Math.max(4, cleaned.length - 4));
  const number = cleaned.slice(-4);
  return [state, district, series, number].filter(Boolean).join(' ');
};

// Visual badge configuration for task statuses
const getStatusBadgeConfig = (status: TaskStatus) => {
  switch (status) {
    case 'TRANSFERRED':
    case 'COMPLETED':
      return {
        label: 'Transferred',
        badge: 'bg-emerald-50 text-emerald-800 border-emerald-300/80',
        dot: 'bg-emerald-500',
        tone: 'emerald' as const,
        icon: CheckCircle2,
      };
    case 'NOT_REQUIRED':
      return {
        label: 'Not Required',
        badge: 'bg-slate-100 text-slate-700 border-slate-300',
        dot: 'bg-slate-400',
        tone: 'slate' as const,
        icon: Check,
      };
    case 'ISSUE_REPORTED':
      return {
        label: 'Issue / Blocker',
        badge: 'bg-rose-50 text-rose-800 border-rose-300/80 font-bold',
        dot: 'bg-rose-500 animate-pulse',
        tone: 'rose' as const,
        icon: AlertTriangle,
      };
    case 'DOCUMENT_EXPIRED':
      return {
        label: 'Document Expired',
        badge: 'bg-orange-50 text-orange-800 border-orange-300/80 font-bold',
        dot: 'bg-orange-500',
        tone: 'orange' as const,
        icon: AlertCircle,
      };
    case 'RENEWAL_IN_PROGRESS':
      return {
        label: 'Renewal In Progress',
        badge: 'bg-amber-50 text-amber-900 border-amber-300/80',
        dot: 'bg-amber-500 animate-pulse',
        tone: 'amber' as const,
        icon: Clock,
      };
    case 'TRANSFER_INITIATED':
    case 'IN_PROGRESS':
      return {
        label: 'Transfer Initiated',
        badge: 'bg-blue-50 text-blue-800 border-blue-300/80',
        dot: 'bg-blue-500 animate-pulse',
        tone: 'blue' as const,
        icon: Loader2,
      };
    case 'PENDING':
    default:
      return {
        label: 'Pending Action',
        badge: 'bg-slate-100 text-slate-700 border-slate-300',
        dot: 'bg-slate-400',
        tone: 'slate' as const,
        icon: Clock,
      };
  }
};

export default function AccountsTasksPage() {
  const pathname = usePathname();
  const router = useRouter();
  const user = useAuthStore((s) => s.user);

  // Permissions
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';
  const canUpdateRto =
    isSuperAdmin || hasAnyPermission(user?.permissions, getAccountUpdatePermissions('rto-work-status'));

  // Base routes for navigation
  const rtoPath = pathname.startsWith('/employee')
    ? '/employee/accounts/rto-work-status'
    : pathname.startsWith('/admin')
    ? '/admin/accounts/rto-work-status'
    : '/superadmin/accounts/rto-work-status';

  const sellPath = pathname.startsWith('/employee')
    ? '/employee/accounts/sell-accounts'
    : pathname.startsWith('/admin')
    ? '/admin/accounts/sell-accounts'
    : '/superadmin/accounts/sell-accounts';

  // State
  const [tasks, setTasks] = useState<TaskRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);

  // Filters & View State
  const [search, setSearch] = useState('');
  const [statusTab, setStatusTab] = useState<'ALL' | 'PENDING' | 'IN_PROGRESS' | 'ISSUES' | 'DONE'>('ALL');
  const [requirementFilter, setRequirementFilter] = useState<'ALL' | 'MANDATORY' | 'OPTIONAL'>('ALL');
  const [rtoOfficeFilter, setRtoOfficeFilter] = useState('ALL');
  const [sortField, setSortField] = useState<SortField>('updated_desc');
  const [viewMode, setViewMode] = useState<ViewMode>('table');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Pagination
  const [pageSize, setPageSize] = useState<number>(25);
  const [currentPage, setCurrentPage] = useState<number>(1);

  // Quick Inline Status Update State
  const [pendingTaskChange, setPendingTaskChange] = useState<{
    task: TaskRecord;
    status: string;
  } | null>(null);
  const [updatingTaskId, setUpdatingTaskId] = useState<string | null>(null);

  // Fetch tasks
  const loadTasks = useCallback(async (isManualRefresh = false) => {
    try {
      if (isManualRefresh) setRefreshing(true);
      else setLoading(true);
      setError('');

      const response = await api.get('/recruitment/admin/rto-transfer-tasks');
      const loadedTasks: TaskRecord[] = Array.isArray(response.data?.tasks) ? response.data.tasks : [];
      setTasks(loadedTasks);
      setLastSyncedAt(new Date());

      if (isManualRefresh) {
        toast.success(`Refreshed ${loadedTasks.length} compliance tasks`);
      }
    } catch (err) {
      setError(apiError(err, 'Unable to load compliance tasks. Please check your network connection.'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadTasks();
  }, [loadTasks]);

  // Copy helper
  const copyText = (text: string, id: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Distinct offices for filter dropdown
  const uniqueOffices = useMemo(() => {
    const set = new Set<string>();
    tasks.forEach((t) => {
      const office = t.rtoRecord?.rtoOffice?.trim();
      if (office) set.add(office);
    });
    return Array.from(set).sort();
  }, [tasks]);

  // Metric Ribbon Calculations
  const metrics = useMemo(() => {
    const total = tasks.length;
    const pending = tasks.filter((t) => t.status === 'PENDING').length;
    const inProgress = tasks.filter((t) =>
      ['RENEWAL_IN_PROGRESS', 'TRANSFER_INITIATED', 'IN_PROGRESS'].includes(t.status)
    ).length;
    const issues = tasks.filter((t) =>
      ['ISSUE_REPORTED', 'DOCUMENT_EXPIRED'].includes(t.status)
    ).length;
    const done = tasks.filter((t) =>
      ['TRANSFERRED', 'COMPLETED', 'NOT_REQUIRED'].includes(t.status)
    ).length;

    const uniqueVehicles = new Set(tasks.map((t) => t.rtoRecord?.id).filter(Boolean)).size;
    const mandatoryCount = tasks.filter((t) => !t.isOptional).length;
    const optionalCount = tasks.filter((t) => t.isOptional).length;
    const completionRate = total > 0 ? Math.round((done / total) * 100) : 0;

    return {
      total,
      pending,
      inProgress,
      issues,
      done,
      uniqueVehicles,
      mandatoryCount,
      optionalCount,
      completionRate,
    };
  }, [tasks]);

  // Filtered & Sorted Tasks
  const filteredTasks = useMemo(() => {
    const query = search.trim().toLowerCase();

    return tasks
      .filter((task) => {
        // Status Tab Filter
        if (statusTab === 'PENDING' && task.status !== 'PENDING') return false;
        if (
          statusTab === 'IN_PROGRESS' &&
          !['RENEWAL_IN_PROGRESS', 'TRANSFER_INITIATED', 'IN_PROGRESS'].includes(task.status)
        )
          return false;
        if (
          statusTab === 'ISSUES' &&
          !['ISSUE_REPORTED', 'DOCUMENT_EXPIRED'].includes(task.status)
        )
          return false;
        if (
          statusTab === 'DONE' &&
          !['TRANSFERRED', 'COMPLETED', 'NOT_REQUIRED'].includes(task.status)
        )
          return false;

        // Requirement Filter
        if (requirementFilter === 'MANDATORY' && task.isOptional) return false;
        if (requirementFilter === 'OPTIONAL' && !task.isOptional) return false;

        // Office Filter
        if (rtoOfficeFilter !== 'ALL' && task.rtoRecord?.rtoOffice !== rtoOfficeFilter) {
          return false;
        }

        // Search Filter
        if (query) {
          const haystack = [
            task.label,
            task.taskKey,
            task.remark,
            task.status,
            task.rtoRecord?.vehicleNumber,
            task.rtoRecord?.customerName,
            task.rtoRecord?.rtoOffice,
            task.rtoRecord?.sellAccount?.recordNumber,
            task.rtoRecord?.sellAccount?.listingTitle,
            task.rtoRecord?.sellAccount?.brandName,
            task.rtoRecord?.sellAccount?.vehicleModel,
            task.rtoRecord?.sellAccount?.purchaserName,
          ]
            .filter(Boolean)
            .join(' ')
            .toLowerCase();

          if (!haystack.includes(query)) return false;
        }

        return true;
      })
      .sort((a, b) => {
        if (sortField === 'updated_desc') {
          return new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime();
        }
        if (sortField === 'updated_asc') {
          return new Date(a.updatedAt || 0).getTime() - new Date(b.updatedAt || 0).getTime();
        }
        if (sortField === 'label_asc') {
          return (a.label || '').localeCompare(b.label || '');
        }
        if (sortField === 'vehicle_asc') {
          return (a.rtoRecord?.vehicleNumber || '').localeCompare(b.rtoRecord?.vehicleNumber || '');
        }
        if (sortField === 'status') {
          return (a.status || '').localeCompare(b.status || '');
        }
        return 0;
      });
  }, [tasks, search, statusTab, requirementFilter, rtoOfficeFilter, sortField]);

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [search, statusTab, requirementFilter, rtoOfficeFilter, sortField]);

  // Paginated Slices
  const paginatedTasks = useMemo(() => {
    if (pageSize === -1) return filteredTasks;
    const start = (currentPage - 1) * pageSize;
    return filteredTasks.slice(start, start + pageSize);
  }, [filteredTasks, currentPage, pageSize]);

  const totalPages = pageSize === -1 ? 1 : Math.ceil(filteredTasks.length / pageSize) || 1;

  // Grouped by Vehicle File (for Cards View)
  const vehicleGroups = useMemo(() => {
    const map = new Map<
      string,
      {
        rtoRecord: TaskRecord['rtoRecord'];
        tasks: TaskRecord[];
        doneCount: number;
        issueCount: number;
        percent: number;
      }
    >();

    for (const task of filteredTasks) {
      const rtoId = task.rtoRecord?.id || 'unknown';
      if (!map.has(rtoId)) {
        map.set(rtoId, {
          rtoRecord: task.rtoRecord,
          tasks: [],
          doneCount: 0,
          issueCount: 0,
          percent: 0,
        });
      }
      const group = map.get(rtoId)!;
      group.tasks.push(task);
      if (['TRANSFERRED', 'COMPLETED', 'NOT_REQUIRED'].includes(task.status)) {
        group.doneCount += 1;
      }
      if (['ISSUE_REPORTED', 'DOCUMENT_EXPIRED'].includes(task.status)) {
        group.issueCount += 1;
      }
      group.percent = Math.round((group.doneCount / group.tasks.length) * 100);
    }

    return Array.from(map.values());
  }, [filteredTasks]);

  // Handle Inline Status Update with RemarkDialog
  const handleTaskStatusUpdate = async (task: TaskRecord, newStatus: string, remark: string) => {
    if (!task?.rtoRecord?.id || !task?.id) return;
    try {
      setUpdatingTaskId(task.id);
      await api.patch(
        `/recruitment/admin/rto-records/${encodeURIComponent(task.rtoRecord.id)}/transfer-tasks/${encodeURIComponent(task.id)}`,
        { status: newStatus, remark }
      );

      // Instantly update task locally
      setTasks((prev) =>
        prev.map((t) =>
          t.id === task.id
            ? {
                ...t,
                status: newStatus,
                remark,
                updatedAt: new Date().toISOString(),
              }
            : t
        )
      );

      const statusMeta = getTransferTaskStatus(newStatus);
      toast.success(`${task.label} updated to ${statusMeta.label}`);
      setPendingTaskChange(null);
    } catch (err) {
      toast.error(apiError(err, 'Unable to update task. Please try again.'));
    } finally {
      setUpdatingTaskId(null);
    }
  };

  // Export Tasks to CSV
  const exportTasksToCsv = () => {
    if (!filteredTasks.length) {
      toast.info('No tasks to export in the current view.');
      return;
    }

    const headers = [
      'Task Label',
      'Task Key',
      'Requirement',
      'Vehicle Number',
      'Brand & Model',
      'Customer Name',
      'Purchaser Name',
      'Sell Account #',
      'RTO Office',
      'Status',
      'Last Updated',
      'Remark / Notes',
    ];

    const rows = filteredTasks.map((t) => [
      `"${(t.label || '').replace(/"/g, '""')}"`,
      `"${(t.taskKey || '').replace(/"/g, '""')}"`,
      t.isOptional ? 'Optional' : 'Mandatory',
      `"${(t.rtoRecord?.vehicleNumber || '').replace(/"/g, '""')}"`,
      `"${([t.rtoRecord?.sellAccount?.brandName, t.rtoRecord?.sellAccount?.vehicleModel].filter(Boolean).join(' ') || '').replace(/"/g, '""')}"`,
      `"${(t.rtoRecord?.customerName || '').replace(/"/g, '""')}"`,
      `"${(t.rtoRecord?.sellAccount?.purchaserName || '').replace(/"/g, '""')}"`,
      `"${(t.rtoRecord?.sellAccount?.recordNumber || '').replace(/"/g, '""')}"`,
      `"${(t.rtoRecord?.rtoOffice || '').replace(/"/g, '""')}"`,
      `"${t.status}"`,
      `"${t.updatedAt ? new Date(t.updatedAt).toISOString() : ''}"`,
      `"${(t.remark || '').replace(/"/g, '""')}"`,
    ]);

    const csvContent =
      'data:text/csv;charset=utf-8,' +
      [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute(
      'download',
      `jcb-transfer-tasks-${new Date().toISOString().slice(0, 10)}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success(`Exported ${filteredTasks.length} tasks to CSV`);
  };

  // Has active filters?
  const hasActiveFilters =
    search.trim() !== '' ||
    statusTab !== 'ALL' ||
    requirementFilter !== 'ALL' ||
    rtoOfficeFilter !== 'ALL';

  const resetAllFilters = () => {
    setSearch('');
    setStatusTab('ALL');
    setRequirementFilter('ALL');
    setRtoOfficeFilter('ALL');
    setSortField('updated_desc');
  };

  return (
    <div className="space-y-3.5 pb-10">
      {/* 1. EXECUTIVE HEADER */}
      <div className="rounded-xl border border-slate-200/90 bg-white p-3.5 shadow-2xs sm:p-4">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-md bg-amber-500/10 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-amber-900 border border-amber-300">
                <ListTodo className="h-3 w-3 text-amber-600" />
                Operations Desk
              </span>
              <span className="text-slate-300">/</span>
              <span className="text-xs font-semibold text-slate-500">
                {metrics.uniqueVehicles} Vehicles Under Transfer
              </span>
            </div>

            <div className="mt-1 flex flex-wrap items-baseline gap-2">
              <h1 className="text-xl font-black tracking-tight text-slate-900 sm:text-2xl">
                RTO Transfer & Compliance Tasks
              </h1>
              <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-bold text-slate-700">
                {tasks.length} Total Tasks
              </span>
            </div>
            <p className="mt-0.5 text-xs text-slate-500">
              Centralized operational register tracking RC transfer, tax clearance, fitness, insurance, and ownership endorsement milestones.
            </p>
          </div>

          {/* Action Toolbar */}
          <div className="flex flex-wrap items-center gap-2">
            {/* View Mode Toggle */}
            <div className="inline-flex items-center rounded-lg border border-slate-200 bg-slate-50/80 p-0.5">
              <button
                type="button"
                onClick={() => setViewMode('table')}
                className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-bold transition-all ${
                  viewMode === 'table'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-500 hover:text-slate-900'
                }`}
                title="Dense Table View"
              >
                <TableIcon className="h-3.5 w-3.5" />
                Table
              </button>
              <button
                type="button"
                onClick={() => setViewMode('cards')}
                className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-bold transition-all ${
                  viewMode === 'cards'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-500 hover:text-slate-900'
                }`}
                title="Grouped by Vehicle Case"
              >
                <LayoutGrid className="h-3.5 w-3.5" />
                By Vehicle
              </button>
            </div>

            {/* Quick Links */}
            <button
              type="button"
              onClick={() => router.push(rtoPath)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition-colors"
            >
              <Building2 className="h-3.5 w-3.5 text-amber-600" />
              RTO Register
            </button>

            <button
              type="button"
              onClick={() => router.push(sellPath)}
              className="hidden sm:inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition-colors"
            >
              <FileSpreadsheet className="h-3.5 w-3.5 text-slate-500" />
              Sell Accounts
            </button>

            {/* Export CSV */}
            <button
              type="button"
              onClick={exportTasksToCsv}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition-colors"
              title="Export visible tasks to CSV"
            >
              <Download className="h-3.5 w-3.5 text-slate-500" />
              Export
            </button>

            {/* Refresh */}
            <button
              type="button"
              disabled={refreshing}
              onClick={() => void loadTasks(true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#FFC107] px-3 py-1.5 text-xs font-black text-slate-950 hover:bg-[#E5AD06] transition-colors shadow-2xs disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>

        {/* Sync Info Strip */}
        {lastSyncedAt && (
          <div className="mt-2.5 flex items-center justify-between border-t border-slate-100 pt-2 text-[11px] text-slate-400">
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              Last synchronized: {formatTimeAgo(lastSyncedAt)}
            </span>
            <span>
              {metrics.mandatoryCount} Mandatory · {metrics.optionalCount} Optional Tasks
            </span>
          </div>
        )}
      </div>

      {/* 2. EXECUTIVE 5-CARD KPI RIBBON WITH COMPLETION PROGRESS */}
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
        {/* Total Tasks */}
        <div className="rounded-xl border border-slate-200/90 bg-white p-3 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Total Checklist
            </span>
            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-slate-100 text-slate-600">
              <Layers className="h-3.5 w-3.5" />
            </span>
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-xl font-black text-slate-900">{metrics.total}</span>
            <span className="text-[11px] font-semibold text-slate-500">milestones</span>
          </div>
          <p className="mt-1 text-[11px] text-slate-500 truncate">
            Across {metrics.uniqueVehicles} vehicle files
          </p>
        </div>

        {/* Pending Action */}
        <div
          onClick={() => setStatusTab(statusTab === 'PENDING' ? 'ALL' : 'PENDING')}
          className={`cursor-pointer rounded-xl border p-3 shadow-2xs transition-all ${
            statusTab === 'PENDING'
              ? 'border-amber-400 bg-amber-50/50 ring-2 ring-amber-400/20'
              : 'border-slate-200/90 bg-white hover:border-amber-300'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-amber-700">
              Pending Action
            </span>
            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-amber-100 text-amber-700">
              <Clock className="h-3.5 w-3.5" />
            </span>
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-xl font-black text-amber-700">{metrics.pending}</span>
            <span className="text-[11px] font-semibold text-amber-600">
              {metrics.total > 0 ? Math.round((metrics.pending / metrics.total) * 100) : 0}%
            </span>
          </div>
          <p className="mt-1 text-[11px] text-amber-700 truncate">Awaiting start / docs</p>
        </div>

        {/* In Progress / Filing */}
        <div
          onClick={() => setStatusTab(statusTab === 'IN_PROGRESS' ? 'ALL' : 'IN_PROGRESS')}
          className={`cursor-pointer rounded-xl border p-3 shadow-2xs transition-all ${
            statusTab === 'IN_PROGRESS'
              ? 'border-blue-400 bg-blue-50/50 ring-2 ring-blue-400/20'
              : 'border-slate-200/90 bg-white hover:border-blue-300'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-blue-700">
              In Processing
            </span>
            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-blue-100 text-blue-700">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            </span>
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-xl font-black text-blue-700">{metrics.inProgress}</span>
            <span className="text-[11px] font-semibold text-blue-600">active</span>
          </div>
          <p className="mt-1 text-[11px] text-blue-600 truncate">Renewal or RTO filed</p>
        </div>

        {/* Issues / Blockers */}
        <div
          onClick={() => setStatusTab(statusTab === 'ISSUES' ? 'ALL' : 'ISSUES')}
          className={`cursor-pointer rounded-xl border p-3 shadow-2xs transition-all ${
            statusTab === 'ISSUES'
              ? 'border-rose-400 bg-rose-50/50 ring-2 ring-rose-400/20'
              : metrics.issues > 0
              ? 'border-rose-200 bg-rose-50/30 hover:border-rose-300'
              : 'border-slate-200/90 bg-white hover:border-slate-300'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-rose-700">
              Issues / Errors
            </span>
            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-rose-100 text-rose-700">
              <AlertTriangle className="h-3.5 w-3.5" />
            </span>
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-xl font-black text-rose-700">{metrics.issues}</span>
            <span className="text-[11px] font-semibold text-rose-600">blockers</span>
          </div>
          <p className="mt-1 text-[11px] text-rose-600 truncate">
            {metrics.issues > 0 ? 'Needs RTO / client fix' : 'No reported blockers'}
          </p>
        </div>

        {/* Transferred / Completed */}
        <div
          onClick={() => setStatusTab(statusTab === 'DONE' ? 'ALL' : 'DONE')}
          className={`col-span-2 sm:col-span-1 cursor-pointer rounded-xl border p-3 shadow-2xs transition-all ${
            statusTab === 'DONE'
              ? 'border-emerald-400 bg-emerald-50/50 ring-2 ring-emerald-400/20'
              : 'border-slate-200/90 bg-white hover:border-emerald-300'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-800">
              Transferred / Done
            </span>
            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-emerald-100 text-emerald-800">
              <CheckCircle2 className="h-3.5 w-3.5" />
            </span>
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-xl font-black text-emerald-800">{metrics.done}</span>
            <span className="text-[11px] font-bold text-emerald-700">
              {metrics.completionRate}%
            </span>
          </div>
          <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-emerald-100">
            <div
              className="h-full bg-emerald-700 rounded-full transition-all duration-500"
              style={{ width: `${Math.min(100, metrics.completionRate)}%` }}
            />
          </div>
        </div>
      </div>

      {/* 3. MULTI-FILTER TOOLBAR & SEARCH */}
      <div className="rounded-xl border border-slate-200/90 bg-white p-3 shadow-2xs">
        <div className="flex flex-col gap-3">
          {/* Top Row: Status Tabs + Search */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2.5">
            {/* Quick Status Chips */}
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => setStatusTab('ALL')}
                className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-bold transition-all ${
                  statusTab === 'ALL'
                    ? 'bg-slate-900 text-white shadow-2xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                All
                <span className="rounded-full bg-black/15 px-1.5 py-0.2 text-[10px]">
                  {metrics.total}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setStatusTab('PENDING')}
                className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-bold transition-all ${
                  statusTab === 'PENDING'
                    ? 'bg-amber-500 text-slate-950 shadow-2xs'
                    : 'bg-amber-50 text-amber-800 hover:bg-amber-100'
                }`}
              >
                Pending
                <span className="rounded-full bg-amber-900/15 px-1.5 py-0.2 text-[10px]">
                  {metrics.pending}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setStatusTab('IN_PROGRESS')}
                className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-bold transition-all ${
                  statusTab === 'IN_PROGRESS'
                    ? 'bg-blue-600 text-white shadow-2xs'
                    : 'bg-blue-50 text-blue-700 hover:bg-blue-100'
                }`}
              >
                In Processing
                <span className="rounded-full bg-blue-900/15 px-1.5 py-0.2 text-[10px]">
                  {metrics.inProgress}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setStatusTab('ISSUES')}
                className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-bold transition-all ${
                  statusTab === 'ISSUES'
                    ? 'bg-rose-600 text-white shadow-2xs'
                    : 'bg-rose-50 text-rose-700 hover:bg-rose-100'
                }`}
              >
                Issues & Errors
                <span className="rounded-full bg-rose-900/15 px-1.5 py-0.2 text-[10px]">
                  {metrics.issues}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setStatusTab('DONE')}
                className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-bold transition-all ${
                  statusTab === 'DONE'
                    ? 'bg-emerald-700 text-white shadow-2xs'
                    : 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                }`}
              >
                Transferred
                <span className="rounded-full bg-emerald-950/15 px-1.5 py-0.2 text-[10px]">
                  {metrics.done}
                </span>
              </button>
            </div>

            {/* Instant Search Bar */}
            <div className="relative w-full lg:w-80">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search vehicle, customer, task key..."
                className="h-8.5 w-full rounded-lg border border-slate-200 bg-slate-50/60 pl-8.5 pr-8 text-xs text-slate-900 placeholder:text-slate-400 outline-none focus:border-amber-400 focus:bg-white focus:ring-2 focus:ring-amber-400/20"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  aria-label="Clear search"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Bottom Row: Requirement Filter + Office Filter + Sort + Count */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-2.5 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              {/* Requirement Type */}
              <div className="flex items-center gap-1">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  Type:
                </span>
                <select
                  value={requirementFilter}
                  onChange={(e) => setRequirementFilter(e.target.value as any)}
                  className="h-7.5 rounded-md border border-slate-200 bg-slate-50 px-2 text-xs font-semibold text-slate-700 outline-none focus:border-amber-400"
                >
                  <option value="ALL">All Requirements</option>
                  <option value="MANDATORY">Mandatory Only</option>
                  <option value="OPTIONAL">Optional Only</option>
                </select>
              </div>

              {/* RTO Office Dropdown */}
              <div className="flex items-center gap-1">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  Office:
                </span>
                <select
                  value={rtoOfficeFilter}
                  onChange={(e) => setRtoOfficeFilter(e.target.value)}
                  className="h-7.5 max-w-[180px] truncate rounded-md border border-slate-200 bg-slate-50 px-2 text-xs font-semibold text-slate-700 outline-none focus:border-amber-400"
                >
                  <option value="ALL">All RTO Offices</option>
                  {uniqueOffices.map((office) => (
                    <option key={office} value={office}>
                      {office}
                    </option>
                  ))}
                </select>
              </div>

              {/* Sort By */}
              <div className="flex items-center gap-1">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  Sort:
                </span>
                <select
                  value={sortField}
                  onChange={(e) => setSortField(e.target.value as SortField)}
                  className="h-7.5 rounded-md border border-slate-200 bg-slate-50 px-2 text-xs font-semibold text-slate-700 outline-none focus:border-amber-400"
                >
                  <option value="updated_desc">Recently Updated</option>
                  <option value="updated_asc">Oldest Updated</option>
                  <option value="vehicle_asc">Vehicle Number (A-Z)</option>
                  <option value="label_asc">Task Name (A-Z)</option>
                  <option value="status">Task Status</option>
                </select>
              </div>

              {/* Clear filters */}
              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={resetAllFilters}
                  className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-bold text-rose-600 hover:bg-rose-50 transition-colors"
                >
                  <X className="h-3 w-3" />
                  Reset Filters
                </button>
              )}
            </div>

            {/* Results Count & Page Sizer */}
            <div className="flex items-center gap-2 text-slate-500 text-[11px]">
              <span>
                Showing <strong className="text-slate-900">{filteredTasks.length}</strong> of{' '}
                {tasks.length} tasks
              </span>
              <span className="text-slate-300">|</span>
              <div className="flex items-center gap-1">
                <span>Per page:</span>
                <select
                  value={pageSize}
                  onChange={(e) => setPageSize(Number(e.target.value))}
                  className="h-6 rounded border border-slate-200 bg-slate-50 px-1 text-[11px] font-bold text-slate-700 outline-none"
                >
                  <option value={15}>15</option>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                  <option value={-1}>All</option>
                </select>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 4. MAIN CONTENT AREA */}
      {loading ? (
        <div className="flex min-h-[360px] items-center justify-center rounded-xl border border-slate-200/90 bg-white p-12">
          <BrandLoader size="sm" />
        </div>
      ) : error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50/70 p-8 text-center shadow-2xs">
          <AlertCircle className="mx-auto h-8 w-8 text-rose-600" />
          <h3 className="mt-2 text-sm font-bold text-rose-900">Failed to load tasks</h3>
          <p className="mt-1 text-xs text-rose-700 max-w-md mx-auto">{error}</p>
          <button
            type="button"
            onClick={() => void loadTasks()}
            className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-rose-700 shadow-2xs"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Try Again
          </button>
        </div>
      ) : filteredTasks.length === 0 ? (
        <div className="rounded-xl border border-slate-200/90 bg-white p-12 text-center shadow-2xs">
          <ListTodo className="mx-auto h-10 w-10 text-slate-300" />
          <h3 className="mt-3 text-sm font-bold text-slate-800">No compliance tasks found</h3>
          <p className="mt-1 text-xs text-slate-500 max-w-sm mx-auto">
            {hasActiveFilters
              ? 'Try relaxing your search terms or clearing status and office filters.'
              : 'No transfer tasks have been initialized yet for active vehicle sales.'}
          </p>
          {hasActiveFilters && (
            <button
              type="button"
              onClick={resetAllFilters}
              className="mt-3.5 inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-bold text-white hover:bg-slate-800 shadow-2xs"
            >
              <RefreshCw className="h-3 w-3" />
              Reset All Filters
            </button>
          )}
        </div>
      ) : viewMode === 'table' ? (
        /* ================= HIGH-DENSITY TABLE VIEW ================= */
        <div className="overflow-hidden rounded-xl border border-slate-200/90 bg-white shadow-2xs">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1050px] text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200/90 bg-slate-50/90 text-[11px] font-bold uppercase tracking-wider text-slate-600">
                  <th className="py-2.5 pl-4 pr-3">Task & Requirement</th>
                  <th className="py-2.5 px-3">Vehicle & Model</th>
                  <th className="py-2.5 px-3">Customer & Case</th>
                  <th className="py-2.5 px-3">RTO Office</th>
                  <th className="py-2.5 px-3">Current Status</th>
                  <th className="py-2.5 px-3">Last Activity</th>
                  <th className="py-2.5 pr-4 pl-3 text-right">Quick Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-normal">
                {paginatedTasks.map((task) => {
                  const statusMeta = getStatusBadgeConfig(task.status);
                  const isDone = ['TRANSFERRED', 'COMPLETED', 'NOT_REQUIRED'].includes(task.status);
                  const vehicleNumber = task.rtoRecord?.vehicleNumber || '';
                  const formattedPlate = vehicleNumberDisplay(vehicleNumber);
                  const isPlateCopied = copiedId === `plate-${task.id}`;
                  const isUpdatingThis = updatingTaskId === task.id;

                  return (
                    <tr
                      key={task.id}
                      className="group transition-colors hover:bg-amber-50/30"
                    >
                      {/* 1. Task & Requirement */}
                      <td className="py-2.5 pl-4 pr-3 align-top">
                        <div className="flex items-start gap-2">
                          <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-amber-500/10 text-amber-800 border border-amber-300">
                            <FileCheck2 className="h-3.5 w-3.5" />
                          </div>
                          <div>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-bold text-slate-900 group-hover:text-amber-900 transition-colors">
                                {task.label}
                              </span>
                              {task.isOptional ? (
                                <span className="inline-flex items-center rounded px-1.5 py-0.2 text-[9px] font-bold uppercase tracking-wider bg-slate-100 text-slate-600 border border-slate-200">
                                  Optional
                                </span>
                              ) : (
                                <span className="inline-flex items-center rounded px-1.5 py-0.2 text-[9px] font-black uppercase tracking-wider bg-amber-100 text-amber-900 border border-amber-300">
                                  Mandatory
                                </span>
                              )}
                            </div>
                            <span className="font-mono text-[10px] text-slate-400">
                              {task.taskKey}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* 2. Vehicle & Model */}
                      <td className="py-2.5 px-3 align-top">
                        <div>
                          {vehicleNumber ? (
                            <div className="inline-flex items-center rounded border border-slate-800 bg-white shadow-2xs overflow-hidden font-mono tracking-wider font-black select-all">
                              <div className="flex flex-col items-center justify-center bg-blue-700 px-1 py-0.5 text-white">
                                <span className="text-[6px] font-bold leading-none">IND</span>
                              </div>
                              <span className="px-1.5 py-0.5 text-[11px] font-black uppercase text-slate-950">
                                {formattedPlate}
                              </span>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  copyText(formattedPlate, `plate-${task.id}`);
                                }}
                                className="border-l border-slate-200 px-1 py-0.5 text-slate-400 hover:text-slate-800"
                                title="Copy Vehicle Number"
                              >
                                {isPlateCopied ? (
                                  <Check className="h-2.5 w-2.5 text-emerald-600" />
                                ) : (
                                  <Copy className="h-2.5 w-2.5" />
                                )}
                              </button>
                            </div>
                          ) : (
                            <span className="text-slate-400 italic">Unassigned</span>
                          )}

                          <div className="mt-0.5 text-[11px] text-slate-600 font-medium truncate max-w-[160px]">
                            {[
                              task.rtoRecord?.sellAccount?.brandName,
                              task.rtoRecord?.sellAccount?.vehicleModel,
                            ]
                              .filter(Boolean)
                              .join(' ') ||
                              task.rtoRecord?.sellAccount?.listingTitle ||
                              '—'}
                          </div>
                        </div>
                      </td>

                      {/* 3. Customer & Case */}
                      <td className="py-2.5 px-3 align-top">
                        <div>
                          <div className="font-bold text-slate-900 flex items-center gap-1 truncate max-w-[180px]">
                            <User className="h-3 w-3 text-slate-400 shrink-0" />
                            <span>
                              {task.rtoRecord?.customerName ||
                                task.rtoRecord?.sellAccount?.purchaserName ||
                                '—'}
                            </span>
                          </div>
                          {task.rtoRecord?.sellAccount?.recordNumber ? (
                            <div className="mt-0.5 text-[10px] font-mono font-semibold text-amber-700">
                              Deal #{task.rtoRecord.sellAccount.recordNumber}
                            </div>
                          ) : (
                            <div className="mt-0.5 text-[10px] text-slate-400">
                              File #{task.rtoRecord?.id?.slice(0, 8)}
                            </div>
                          )}
                        </div>
                      </td>

                      {/* 4. RTO Office */}
                      <td className="py-2.5 px-3 align-top">
                        <div className="flex items-center gap-1 text-slate-700">
                          <MapPin className="h-3 w-3 text-slate-400 shrink-0" />
                          <span className="font-semibold truncate max-w-[130px]">
                            {task.rtoRecord?.rtoOffice || '—'}
                          </span>
                        </div>
                        {task.rtoRecord?.rtoStatus && (
                          <div className="mt-0.5 text-[10px] text-slate-400 capitalize">
                            {task.rtoRecord.rtoStatus.toLowerCase().replace(/_/g, ' ')}
                          </div>
                        )}
                      </td>

                      {/* 5. Current Status with Quick Dropdown/Trigger */}
                      <td className="py-2.5 px-3 align-top">
                        <div className="space-y-1">
                          <span
                            className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-bold border shadow-2xs ${statusMeta.badge}`}
                          >
                            <span className={`h-1.5 w-1.5 rounded-full ${statusMeta.dot}`} />
                            {statusMeta.label}
                          </span>

                          {/* Quick change dropdown for authorized users */}
                          {canUpdateRto && (
                            <div className="flex items-center gap-1">
                              <select
                                disabled={isUpdatingThis}
                                value={task.status}
                                onChange={(e) => {
                                  const next = e.target.value;
                                  if (next !== task.status) {
                                    setPendingTaskChange({ task, status: next });
                                  }
                                }}
                                className="h-6 rounded border border-slate-200 bg-white px-1.5 text-[10px] font-bold text-slate-700 hover:border-amber-400 outline-none cursor-pointer"
                              >
                                {TRANSFER_TASK_STATUS_OPTIONS.map((opt) => (
                                  <option key={opt.value} value={opt.value}>
                                    → {opt.label}
                                  </option>
                                ))}
                              </select>
                            </div>
                          )}
                        </div>
                      </td>

                      {/* 6. Last Activity & Remark */}
                      <td className="py-2.5 px-3 align-top">
                        <div>
                          <div className="flex items-center gap-1 text-[11px] font-medium text-slate-600">
                            <Calendar className="h-3 w-3 text-slate-400 shrink-0" />
                            <span>{formatDate(task.updatedAt)}</span>
                            <span className="text-[10px] text-slate-400">
                              ({formatTimeAgo(task.updatedAt)})
                            </span>
                          </div>

                          {task.remark ? (
                            <div className="mt-1 flex items-start gap-1 text-[11px] text-slate-700 bg-slate-50 border border-slate-200/80 rounded px-1.5 py-0.5 max-w-[200px]">
                              <MessageSquare className="h-3 w-3 text-amber-600 shrink-0 mt-0.5" />
                              <span className="truncate" title={task.remark}>
                                {task.remark}
                              </span>
                            </div>
                          ) : (
                            <div className="mt-0.5 text-[10px] text-slate-400 italic">
                              No remark logged
                            </div>
                          )}
                        </div>
                      </td>

                      {/* 7. Quick Actions */}
                      <td className="py-2.5 pr-4 pl-3 align-top text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* One-Click Transferred Button */}
                          {canUpdateRto && !isDone && (
                            <button
                              type="button"
                              disabled={isUpdatingThis}
                              onClick={() =>
                                setPendingTaskChange({ task, status: 'TRANSFERRED' })
                              }
                              className="inline-flex items-center gap-1 rounded-md bg-emerald-700 px-2 py-1 text-[11px] font-bold text-white hover:bg-emerald-800 shadow-2xs transition-colors"
                              title="Mark as completed & transferred"
                            >
                              <CheckCircle2 className="h-3 w-3" />
                              Mark Done
                            </button>
                          )}

                          {/* Open Workspace / Edit */}
                          <button
                            type="button"
                            onClick={() =>
                              router.push(`${rtoPath}/${task.rtoRecord.id}/edit`)
                            }
                            className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-bold text-slate-700 hover:bg-slate-50 hover:border-slate-300 shadow-2xs transition-colors"
                            title="Open full RTO workspace for this vehicle"
                          >
                            <ExternalLink className="h-3 w-3 text-slate-500" />
                            Workspace
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Table Footer / Pagination */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-slate-200/90 bg-slate-50/70 px-4 py-3 text-xs">
            <span className="text-slate-500">
              Showing{' '}
              <strong className="text-slate-900">
                {pageSize === -1
                  ? filteredTasks.length
                  : Math.min(filteredTasks.length, (currentPage - 1) * pageSize + 1)}
              </strong>{' '}
              to{' '}
              <strong className="text-slate-900">
                {pageSize === -1
                  ? filteredTasks.length
                  : Math.min(filteredTasks.length, currentPage * pageSize)}
              </strong>{' '}
              of <strong className="text-slate-900">{filteredTasks.length}</strong> matching tasks
            </span>

            {pageSize !== -1 && totalPages > 1 && (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={currentPage <= 1}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-40 shadow-2xs"
                >
                  Previous
                </button>
                <span className="px-2 font-bold text-slate-700">
                  {currentPage} / {totalPages}
                </span>
                <button
                  type="button"
                  disabled={currentPage >= totalPages}
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-40 shadow-2xs"
                >
                  Next
                </button>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* ================= GROUPED BY VEHICLE FILE (CARDS VIEW) ================= */
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {vehicleGroups.map((group) => {
            const vehicleNumber = group.rtoRecord?.vehicleNumber || '';
            const formattedPlate = vehicleNumberDisplay(vehicleNumber);
            const isPlateCopied = copiedId === `group-plate-${group.rtoRecord?.id}`;

            return (
              <div
                key={group.rtoRecord?.id}
                className="flex flex-col justify-between rounded-xl border border-slate-200/90 bg-white p-4 shadow-2xs transition-shadow hover:shadow-xs"
              >
                <div>
                  {/* Card Header: Plate & Status */}
                  <div className="flex items-start justify-between gap-2 border-b border-slate-100 pb-3">
                    <div>
                      {vehicleNumber ? (
                        <div className="inline-flex items-center rounded border border-slate-800 bg-white shadow-2xs overflow-hidden font-mono tracking-wider font-black select-all">
                          <div className="flex flex-col items-center justify-center bg-blue-700 px-1 py-0.5 text-white">
                            <span className="text-[6px] font-bold leading-none">IND</span>
                          </div>
                          <span className="px-2 py-0.5 text-xs font-black uppercase text-slate-950">
                            {formattedPlate}
                          </span>
                          <button
                            type="button"
                            onClick={() => copyText(formattedPlate, `group-plate-${group.rtoRecord?.id}`)}
                            className="border-l border-slate-200 px-1.5 py-0.5 text-slate-400 hover:text-slate-800"
                            title="Copy Plate"
                          >
                            {isPlateCopied ? (
                              <Check className="h-3 w-3 text-emerald-600" />
                            ) : (
                              <Copy className="h-3 w-3" />
                            )}
                          </button>
                        </div>
                      ) : (
                        <span className="text-xs font-bold text-slate-500">Unassigned Plate</span>
                      )}

                      <div className="mt-1 text-xs font-bold text-slate-800">
                        {[
                          group.rtoRecord?.sellAccount?.brandName,
                          group.rtoRecord?.sellAccount?.vehicleModel,
                        ]
                          .filter(Boolean)
                          .join(' ') ||
                          group.rtoRecord?.sellAccount?.listingTitle ||
                          'Commercial Vehicle'}
                      </div>
                    </div>

                    <div className="text-right">
                      {group.rtoRecord?.sellAccount?.recordNumber ? (
                        <span className="rounded bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-800 border border-amber-200">
                          #{group.rtoRecord.sellAccount.recordNumber}
                        </span>
                      ) : (
                        <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                          RTO Case
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Customer & Location */}
                  <div className="mt-2.5 grid grid-cols-2 gap-2 text-xs text-slate-600">
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                        Customer
                      </span>
                      <p className="font-semibold text-slate-800 truncate">
                        {group.rtoRecord?.customerName ||
                          group.rtoRecord?.sellAccount?.purchaserName ||
                          '—'}
                      </p>
                    </div>
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                        RTO Office
                      </span>
                      <p className="font-semibold text-slate-800 truncate">
                        {group.rtoRecord?.rtoOffice || '—'}
                      </p>
                    </div>
                  </div>

                  {/* Progress Bar */}
                  <div className="mt-3 rounded-lg bg-slate-50 p-2 border border-slate-100">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="font-bold text-slate-700">Checklist Progress</span>
                      <span className="font-black text-emerald-700">
                        {group.doneCount} / {group.tasks.length} Done ({group.percent}%)
                      </span>
                    </div>
                    <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
                      <div
                        className="h-full bg-emerald-500 rounded-full transition-all duration-300"
                        style={{ width: `${group.percent}%` }}
                      />
                    </div>
                    {group.issueCount > 0 && (
                      <div className="mt-1 text-[10px] font-bold text-rose-600 flex items-center gap-1">
                        <AlertTriangle className="h-3 w-3" />
                        {group.issueCount} issue(s) reported on this case
                      </div>
                    )}
                  </div>

                  {/* Task List in Card */}
                  <div className="mt-3 divide-y divide-slate-100 border-t border-slate-100 text-xs">
                    {group.tasks.map((task) => {
                      const statusMeta = getStatusBadgeConfig(task.status);
                      const isDone = ['TRANSFERRED', 'COMPLETED', 'NOT_REQUIRED'].includes(
                        task.status
                      );

                      return (
                        <div
                          key={task.id}
                          className="flex items-center justify-between gap-2 py-2"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <span className="font-semibold text-slate-900 truncate">
                                {task.label}
                              </span>
                              {task.isOptional && (
                                <span className="text-[9px] text-slate-400">(opt)</span>
                              )}
                            </div>
                            {task.remark ? (
                              <p className="text-[10px] text-slate-500 truncate" title={task.remark}>
                                {task.remark}
                              </p>
                            ) : null}
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            <span
                              className={`rounded-full px-2 py-0.5 text-[10px] font-bold border ${statusMeta.badge}`}
                            >
                              {statusMeta.label}
                            </span>

                            {canUpdateRto && !isDone && (
                              <button
                                type="button"
                                onClick={() =>
                                  setPendingTaskChange({ task, status: 'TRANSFERRED' })
                                }
                                className="rounded p-1 text-slate-400 hover:bg-emerald-50 hover:text-emerald-700"
                                title="Quick mark as transferred"
                              >
                                <Check className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Card Footer Actions */}
                <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
                  <button
                    type="button"
                    onClick={() => router.push(`${rtoPath}/${group.rtoRecord?.id}`)}
                    className="text-xs font-bold text-slate-600 hover:text-slate-900"
                  >
                    View Dossier
                  </button>

                  <button
                    type="button"
                    onClick={() => router.push(`${rtoPath}/${group.rtoRecord?.id}/edit`)}
                    className="inline-flex items-center gap-1 rounded-md bg-slate-900 px-2.5 py-1 text-xs font-bold text-white hover:bg-slate-800 shadow-2xs"
                  >
                    <ExternalLink className="h-3 w-3" />
                    Open Workspace
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 5. INLINE STATUS CHANGE REMARK DIALOG */}
      {pendingTaskChange && (
        <RemarkDialog
          title={`${pendingTaskChange.task.label} → ${
            getTransferTaskStatus(pendingTaskChange.status).label
          }`}
          description={
            <div className="space-y-1">
              <div>
                Vehicle Plate:{' '}
                <strong className="text-slate-900 font-mono">
                  {vehicleNumberDisplay(
                    pendingTaskChange.task.rtoRecord?.vehicleNumber || ''
                  ) || 'Unassigned'}
                </strong>
              </div>
              <div className="text-[11px] text-slate-500">
                {getTransferTaskStatus(pendingTaskChange.status).hint}
              </div>
            </div>
          }
          placeholder="Why is this status changing? (e.g. RC original submitted at counter, Challan cleared, Customer signature received)"
          confirmLabel="Save Task Status"
          tone={
            pendingTaskChange.status === 'TRANSFERRED' || pendingTaskChange.status === 'COMPLETED'
              ? 'emerald'
              : pendingTaskChange.status === 'ISSUE_REPORTED' ||
                pendingTaskChange.status === 'DOCUMENT_EXPIRED'
              ? 'rose'
              : 'amber'
          }
          busy={updatingTaskId === pendingTaskChange.task.id}
          onCancel={() => setPendingTaskChange(null)}
          onConfirm={(remark) =>
            handleTaskStatusUpdate(
              pendingTaskChange.task,
              pendingTaskChange.status,
              remark
            )
          }
        />
      )}
    </div>
  );
}
