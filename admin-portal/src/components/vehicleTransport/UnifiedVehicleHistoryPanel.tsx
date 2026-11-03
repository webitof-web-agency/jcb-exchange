'use client';

import { useEffect, useState } from 'react';
import {
  CarFront,
  CheckCircle2,
  Clock,
  Eye,
  FileCheck2,
  FileWarning,
  History,
  Loader2,
  RefreshCw,
  ScanSearch,
  Search,
  XCircle,
  Copy,
  Check,
  ArrowRight,
} from 'lucide-react';
import Link from 'next/link';
import api from '@/lib/api';
import HistoryPagination from '@/components/ui/HistoryPagination';
import { hasAnyPermission } from '@/lib/permissionUtils';
import { useAuthStore } from '@/store/authStore';
import { sanitizeSearchInput } from '@/lib/verificationSanitizers';

export type VehicleServiceType = 'RC_OWNER' | 'RC_CHALLAN' | 'DRIVING_LICENSE' | 'CHASSIS_TO_RC' | 'RC_TO_MOBILE';

export type UnifiedVehicleRecord = {
  id: string;
  serviceType: VehicleServiceType;
  identifier: string;
  secondaryInfo?: string;
  status: string;
  createdAt: string;
  meta?: Record<string, unknown>;
};

interface UnifiedVehicleHistoryProps {
  onSelectService?: (service: 'driving-license' | 'rc-owner-history' | 'rc-challan' | 'chassis-to-rc' | 'rc-to-mobile') => void;
  onTotalCountChange?: (count: number) => void;
  /** 'recent': the newest 20 with a link to the full history; 'full': every record, paginated. */
  variant?: 'recent' | 'full';
  /** Where "View all" goes in the recent variant. */
  allHistoryHref?: string;
}

const RECENT_LIMIT = 20;

type ServerVehicleRecord = {
  id: string;
  _type: VehicleServiceType;
  status: string;
  createdAt: string;
  maskedLicenseNumber?: string;
  holderName?: string;
  state?: string;
  maskedRcNumber?: string;
  ownerName?: string;
  vehicleCategory?: string;
  totalChallans?: number;
  knownPendingAmount?: string | number;
  maskedChassisNumber?: string;
  rcNumber?: string;
  maskedMobileNumber?: string;
};

/** One row of GET /verification-history/vehicle in the shape the table shows. */
const toUnifiedVehicleRecord = (r: ServerVehicleRecord): UnifiedVehicleRecord => {
  switch (r._type) {
    case 'DRIVING_LICENSE':
      return { id: r.id, serviceType: r._type, identifier: r.maskedLicenseNumber || 'DL-RECORD', secondaryInfo: r.holderName ? `${r.holderName}${r.state ? ` • ${r.state}` : ''}` : undefined, status: r.status, createdAt: r.createdAt };
    case 'RC_OWNER':
      return { id: r.id, serviceType: r._type, identifier: r.maskedRcNumber || 'RC-RECORD', secondaryInfo: r.ownerName ? `${r.ownerName}${r.vehicleCategory ? ` (${r.vehicleCategory})` : ''}` : undefined, status: r.status, createdAt: r.createdAt };
    case 'RC_CHALLAN':
      return { id: r.id, serviceType: r._type, identifier: r.maskedRcNumber || 'CHALLAN-RECORD', secondaryInfo: `${r.totalChallans ?? 0} Challan(s)${Number(r.knownPendingAmount) > 0 ? ` • ₹${r.knownPendingAmount} pending` : ''}`, status: r.status, createdAt: r.createdAt };
    case 'CHASSIS_TO_RC':
      return { id: r.id, serviceType: r._type, identifier: r.maskedChassisNumber || 'CHASSIS-RECORD', secondaryInfo: r.rcNumber ? `RC: ${r.rcNumber}${r.ownerName ? ` (${r.ownerName})` : ''}` : r.ownerName, status: r.status, createdAt: r.createdAt };
    case 'RC_TO_MOBILE':
    default:
      return { id: r.id, serviceType: 'RC_TO_MOBILE', identifier: r.maskedRcNumber || 'RC-RECORD', secondaryInfo: r.maskedMobileNumber ? `Mobile: ${r.maskedMobileNumber}` : undefined, status: r.status, createdAt: r.createdAt };
  }
};

const formatDate = (value: unknown) => {
  if (typeof value !== 'string' || !value.trim()) return 'Not available';
  try {
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) {
      return new Intl.DateTimeFormat('en-IN', {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(d);
    }
  } catch {
    // fallback
  }
  return value;
};

export default function UnifiedVehicleHistoryPanel({
  onSelectService,
  onTotalCountChange,
  variant = 'recent',
  allHistoryHref,
}: UnifiedVehicleHistoryProps) {
  const { user } = useAuthStore();
  const permissions = user?.permissions;
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';

  const canDL = isSuperAdmin || hasAnyPermission(permissions, ['driving-license.verification.read']);
  const canRC = isSuperAdmin || hasAnyPermission(permissions, ['rc.owner-history.read']);
  const canChallan = isSuperAdmin || hasAnyPermission(permissions, ['rc.challan.read']);
  const canChassis = isSuperAdmin || hasAnyPermission(permissions, ['chassis.to-rc.read']);
  const canRcMobile = isSuperAdmin || hasAnyPermission(permissions, ['rc.to-mobile.read']);

  const [records, setRecords] = useState<UnifiedVehicleRecord[]>([]);
  const [filterType, setFilterType] = useState<'ALL' | VehicleServiceType>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [error, setError] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [pageSize, setPageSize] = useState(RECENT_LIMIT);
  const [pagination, setPagination] = useState({ total: 0, totalPages: 0 });
  // Per-type totals for the filter chips; kept from the last unfiltered load.
  const [typeTotals, setTypeTotals] = useState<Record<string, number>>({});
  const isFull = variant === 'full';
  // Any change of filter, search or page size starts again at page 1.
  const viewKey = `${filterType}|${debouncedSearch}|${pageSize}`;
  const [pageState, setPageState] = useState({ key: viewKey, page: 1 });
  const page = isFull && pageState.key === viewKey ? pageState.page : 1;

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(searchQuery.trim()), 350);
    return () => window.clearTimeout(timer);
  }, [searchQuery]);

  // The server merges the services and pages them (GET /verification-history/vehicle), so search
  // and filters cover every record, not only the newest ones. Each request has a key; only the
  // answer for the latest key is shown, so quick page clicks never show a stale page.
  const [refreshCount, setRefreshCount] = useState(0);
  const limit = isFull ? pageSize : RECENT_LIMIT;
  const requestKey = `${filterType}|${debouncedSearch}|${page}|${limit}|${refreshCount}`;
  const [loadedKey, setLoadedKey] = useState('');
  const loading = loadedKey !== requestKey;
  const loadAllHistory = () => setRefreshCount((count) => count + 1);

  useEffect(() => {
    let cancelled = false;
    const params: Record<string, unknown> = { type: filterType, page, limit };
    if (debouncedSearch) params.search = debouncedSearch;
    api.get<{ records: ServerVehicleRecord[]; pagination: { total: number; totalPages: number }; totals: Record<string, number> }>(
      '/verification-history/vehicle',
      { params, timeout: 20000 },
    )
      .then((response) => {
        if (cancelled) return;
        const { records: pageRecords, pagination: info, totals } = response.data;
        setRecords(pageRecords.map(toUnifiedVehicleRecord));
        setPagination({ total: info.total, totalPages: info.totalPages });
        setError('');
        if (!debouncedSearch) {
          setTypeTotals((current) => (filterType === 'ALL' ? totals : { ...current, ...totals }));
          if (filterType === 'ALL') onTotalCountChange?.(info.total);
        }
      })
      .catch((loadError) => {
        if (cancelled) return;
        const message = (loadError as { response?: { data?: { error?: string } } })?.response?.data?.error;
        setError(message || 'Unable to load vehicle verification activity.');
      })
      .finally(() => { if (!cancelled) setLoadedKey(requestKey); });
    return () => { cancelled = true; };
  }, [debouncedSearch, filterType, limit, onTotalCountChange, page, requestKey]);

  const handleCopy = (id: string, text: string) => {
    void navigator.clipboard.writeText(text);
    setCopiedId(id);
    window.setTimeout(() => setCopiedId(null), 1800);
  };

  const counts = {
    all: Object.values(typeTotals).reduce((sum, value) => sum + value, 0),
    rc: typeTotals.RC_OWNER ?? 0,
    challan: typeTotals.RC_CHALLAN ?? 0,
    dl: typeTotals.DRIVING_LICENSE ?? 0,
    chassis: typeTotals.CHASSIS_TO_RC ?? 0,
    rcMobile: typeTotals.RC_TO_MOBILE ?? 0,
  };

  // Search and the type filter run on the server; this is one page of results.
  const filteredRecords = records;

  const getServiceBadge = (type: VehicleServiceType) => {
    switch (type) {
      case 'RC_OWNER':
        return {
          label: 'RC Owner History',
          className: 'bg-violet-50 text-violet-700 border-violet-200/80',
          icon: <FileCheck2 className="h-3 w-3 text-violet-600" />,
          serviceTarget: 'rc-owner-history' as const,
        };
      case 'RC_CHALLAN':
        return {
          label: 'RC Challan',
          className: 'bg-rose-50 text-rose-700 border-rose-200/80',
          icon: <FileWarning className="h-3 w-3 text-rose-600" />,
          serviceTarget: 'rc-challan' as const,
        };
      case 'DRIVING_LICENSE':
        return {
          label: 'Driving License',
          className: 'bg-amber-50 text-amber-800 border-amber-200/80',
          icon: <FileCheck2 className="h-3 w-3 text-amber-600" />,
          serviceTarget: 'driving-license' as const,
        };
      case 'CHASSIS_TO_RC':
        return {
          label: 'Chassis to RC',
          className: 'bg-cyan-50 text-cyan-800 border-cyan-200/80',
          icon: <ScanSearch className="h-3 w-3 text-cyan-600" />,
          serviceTarget: 'chassis-to-rc' as const,
        };
      case 'RC_TO_MOBILE':
        return {
          label: 'RC to Mobile',
          className: 'bg-blue-50 text-blue-700 border-blue-200/80',
          icon: <CarFront className="h-3 w-3 text-blue-600" />,
          serviceTarget: 'rc-to-mobile' as const,
        };
    }
  };

  return (
    <div className="flex flex-col rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      {/* Top Header & Search */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-slate-100 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-50 text-amber-600 border border-amber-200/60">
              <History className="h-4 w-4" />
            </div>
            <h2 className="text-base font-bold text-slate-900">{isFull ? 'Vehicle Verification History' : 'Recent Vehicle Verifications'}</h2>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-600">
              {pagination.total}
            </span>
          </div>
          <p className="mt-0.5 text-xs text-slate-500">
            Real-time audit log of RC, Challan, DL &amp; Chassis queries through Parivahan
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative min-w-[200px] sm:w-64">
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(sanitizeSearchInput(e.target.value))}
              placeholder="Search plate, chassis, name..."
              className="w-full rounded-xl border border-slate-200 bg-slate-50 pl-8 pr-3 py-1.5 text-xs text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-amber-500 focus:bg-white focus:ring-2 focus:ring-amber-500/20"
            />
          </div>
          <button
            type="button"
            onClick={loadAllHistory}
            disabled={loading}
            className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition disabled:opacity-50"
            title="Refresh history"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin text-amber-600' : ''}`} />
          </button>
          {!isFull && allHistoryHref ? (
            <Link
              href={allHistoryHref}
              className="inline-flex h-8 shrink-0 items-center gap-1 rounded-xl border border-slate-200 px-3 text-xs font-bold text-slate-800 transition hover:border-slate-900 hover:bg-slate-900 hover:text-white"
            >
              View all <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          ) : null}
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="mt-3 flex flex-wrap items-center gap-1.5 border-b border-slate-100 pb-3">
        <button
          type="button"
          onClick={() => setFilterType('ALL')}
          className={`rounded-lg px-2.5 py-1 text-xs font-bold transition ${
            filterType === 'ALL'
              ? 'bg-slate-900 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          All Verifications ({counts.all})
        </button>
        {canRC && (
          <button
            type="button"
            onClick={() => setFilterType('RC_OWNER')}
            className={`rounded-lg px-2.5 py-1 text-xs font-bold transition ${
              filterType === 'RC_OWNER'
                ? 'bg-violet-600 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            RC Owner ({counts.rc})
          </button>
        )}
        {canChallan && (
          <button
            type="button"
            onClick={() => setFilterType('RC_CHALLAN')}
            className={`rounded-lg px-2.5 py-1 text-xs font-bold transition ${
              filterType === 'RC_CHALLAN'
                ? 'bg-rose-600 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            RC Challans ({counts.challan})
          </button>
        )}
        {canDL && (
          <button
            type="button"
            onClick={() => setFilterType('DRIVING_LICENSE')}
            className={`rounded-lg px-2.5 py-1 text-xs font-bold transition ${
              filterType === 'DRIVING_LICENSE'
                ? 'bg-amber-600 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            Driving License ({counts.dl})
          </button>
        )}
        {canChassis && (
          <button
            type="button"
            onClick={() => setFilterType('CHASSIS_TO_RC')}
            className={`rounded-lg px-2.5 py-1 text-xs font-bold transition ${
              filterType === 'CHASSIS_TO_RC'
                ? 'bg-cyan-700 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            Chassis to RC ({counts.chassis})
          </button>
        )}
        {canRcMobile && (
          <button
            type="button"
            onClick={() => setFilterType('RC_TO_MOBILE')}
            className={`rounded-lg px-2.5 py-1 text-xs font-bold transition ${
              filterType === 'RC_TO_MOBILE'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            RC Mobile ({counts.rcMobile})
          </button>
        )}
      </div>

      {/* Error state */}
      {error && (
        <div className="mt-3 flex items-center justify-between rounded-xl border border-red-200 bg-red-50 p-2.5 text-xs text-red-700">
          <span>{error}</span>
          <button
            type="button"
            onClick={loadAllHistory}
            className="font-bold underline hover:text-red-900"
          >
            Retry
          </button>
        </div>
      )}

      {/* Table Content */}
      {loading && records.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-14 text-center">
          <Loader2 className="h-6 w-6 animate-spin text-amber-600 mb-2" />
          <p className="text-xs text-slate-500">Loading Parivahan verification records...</p>
        </div>
      ) : filteredRecords.length > 0 ? (
        <div className="mt-3 overflow-x-auto [scrollbar-width:thin] rounded-xl border border-slate-100">
          <table className="w-full min-w-[700px] text-left text-xs border-collapse">
            <thead className="bg-slate-50 border-b border-slate-200/80 text-[11px] font-bold uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-3 py-2.5">Service Type</th>
                <th className="px-3 py-2.5">Vehicle / License ID</th>
                <th className="px-3 py-2.5">Details / Metadata</th>
                <th className="px-3 py-2.5">Gateway Status</th>
                <th className="px-3 py-2.5">Verified Date</th>
                <th className="px-3 py-2.5 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredRecords.map((rec) => {
                const badge = getServiceBadge(rec.serviceType);
                const isRcFormatted = rec.serviceType === 'RC_OWNER' || rec.serviceType === 'RC_CHALLAN' || rec.serviceType === 'RC_TO_MOBILE';
                const isSuccess = rec.status === 'SUCCESS' || rec.status === 'ACTIVE';

                return (
                  <tr key={`${rec.serviceType}-${rec.id}`} className="group hover:bg-slate-50/70 transition">
                    {/* Service Type */}
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[10px] font-bold ${badge.className}`}
                      >
                        {badge.icon}
                        {badge.label}
                      </span>
                    </td>

                    {/* Identifier with Indian plate styling */}
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <div className="inline-flex items-center gap-1.5">
                        {isRcFormatted ? (
                          <div className="inline-flex items-center rounded border border-slate-300 bg-white shadow-2xs font-mono text-[11px] font-bold overflow-hidden">
                            <span className="bg-blue-800 text-[8px] font-black text-white px-1 py-0.5 tracking-tighter">
                              IND
                            </span>
                            <span className="px-2 py-0.5 text-slate-900 tracking-wider">
                              {rec.identifier}
                            </span>
                          </div>
                        ) : (
                          <span className="font-mono text-xs font-bold text-slate-800">
                            {rec.identifier}
                          </span>
                        )}

                        <button
                          type="button"
                          onClick={() => handleCopy(rec.id, rec.identifier)}
                          className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-slate-700 transition"
                          title="Copy identifier"
                        >
                          {copiedId === rec.id ? (
                            <Check className="h-3 w-3 text-emerald-600" />
                          ) : (
                            <Copy className="h-3 w-3" />
                          )}
                        </button>
                      </div>
                    </td>

                    {/* Details / Secondary Info */}
                    <td className="px-3 py-2.5 max-w-[240px] truncate text-slate-600 font-medium">
                      {rec.secondaryInfo || <span className="text-slate-400">Standard record</span>}
                    </td>

                    {/* Gateway Status */}
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                          isSuccess
                            ? 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200'
                            : rec.status === 'PENDING'
                            ? 'bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200'
                            : 'bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-200'
                        }`}
                      >
                        {isSuccess ? (
                          <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                        ) : rec.status === 'PENDING' ? (
                          <Clock className="h-3 w-3 text-amber-600" />
                        ) : (
                          <XCircle className="h-3 w-3 text-rose-600" />
                        )}
                        {rec.status || 'SUCCESS'}
                      </span>
                    </td>

                    {/* Date */}
                    <td className="px-3 py-2.5 whitespace-nowrap text-slate-500 text-[11px]">
                      {formatDate(rec.createdAt)}
                    </td>

                    {/* Action */}
                    <td className="px-3 py-2.5 whitespace-nowrap text-right">
                      <button
                        type="button"
                        onClick={() => onSelectService?.(badge.serviceTarget)}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-bold text-slate-700 shadow-2xs hover:bg-slate-900 hover:text-white hover:border-slate-900 transition"
                      >
                        <Eye className="h-3 w-3" />
                        Open
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 py-12 text-center">
          <CarFront className="h-8 w-8 text-slate-300 mb-2" />
          <p className="text-xs font-bold text-slate-700">No vehicle verification records found</p>
          <p className="text-[11px] text-slate-400 mt-0.5">
            {searchQuery
              ? `No records match "${searchQuery}". Clear your search query.`
              : 'Execute a vehicle lookup to populate this live Parivahan audit log.'}
          </p>
        </div>
      )}

      {isFull ? (
        <HistoryPagination
          page={page}
          pageSize={pageSize}
          total={pagination.total}
          totalPages={pagination.totalPages}
          disabled={loading}
          onPageChange={(nextPage) => setPageState({ key: viewKey, page: nextPage })}
          onPageSizeChange={setPageSize}
        />
      ) : allHistoryHref && pagination.total > 0 ? (
        <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3 text-xs text-slate-600">
          <span>Showing the latest {Math.min(records.length, pagination.total)} of {pagination.total}</span>
          <Link href={allHistoryHref} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 font-bold text-slate-800 transition hover:border-slate-900 hover:bg-slate-900 hover:text-white">
            View all history <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      ) : null}
    </div>
  );
}
