'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Truck,
  Search,
  Eye,
  Download,
  RefreshCw,
  CheckCircle2,
  Clock,
  MapPin,
  Phone,
  AlertTriangle,
  Package,
  PackageCheck,
  Navigation,
  Send,
  ChevronLeft,
  ChevronRight,
  Pencil,
  X,
} from 'lucide-react';
import api from '@/lib/api';
import { usePathname, useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import { getAccountUpdatePermissions } from '@/lib/accountsPermissions';
import { hasAnyPermission } from '@/lib/permissionUtils';
import BrandLoader from '@/components/ui/BrandLoader';
import SearchableSelect from '@/components/ui/SearchableSelect';
import TransportStatusModal from '@/components/transport/TransportStatusModal';
import { toast } from 'react-toastify';
import { downloadAuthedFile } from '@/lib/authedDownload';

// ─── Types ───────────────────────────────────────────────────────────────────

type TransportStatus =
  | 'BOOKED'
  | 'ON_THE_WAY'
  | 'OUT_FOR_DELIVERY'
  | 'DELIVERED'
  | 'CANCELLED'
  | 'VEHICLE_ASSIGNED'
  | 'DISPATCHED';

type TimelineEntry = {
  id: string;
  status: TransportStatus;
  location?: string | null;
  notes?: string | null;
  actorName?: string | null;
  createdAt: string;
};

type TransportRecord = {
  id: string;
  challanNumber: string;
  status: TransportStatus;
  carrierVehicleNumber?: string | null;
  transporterName?: string | null;
  driverName?: string | null;
  driverPhone?: string | null;
  lrNumber?: string | null;
  currentLocation?: string | null;
  lastRemark?: string | null;
  challanDate?: string | null;
  createdAt: string;
  updatedAt: string;
  timeline?: TimelineEntry[];
  sellAccount: {
    id: string;
    recordNumber: string;
    vehicleNumber?: string | null;
    listingTitle?: string | null;
    brandName?: string | null;
    vehicleModel?: string | null;
    sellerName?: string | null;
    sellerCity?: string | null;
    sellerState?: string | null;
    purchaserName?: string | null;
    purchaserNumber?: string | null;
    purchaserCity?: string | null;
    purchaserState?: string | null;
  };
};

type Metrics = {
  total: number;
  pendingDispatch: number;
  onTheWay: number;
  outForDelivery: number;
  delivered: number;
};

// ─── Status Config (Flow-Wise) ────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; bg: string; text: string; icon: typeof Clock }> = {
  BOOKED: { label: 'Pending Dispatch', bg: 'bg-slate-100', text: 'text-slate-700', icon: Clock },
  VEHICLE_ASSIGNED: { label: 'Pending Dispatch', bg: 'bg-slate-100', text: 'text-slate-700', icon: Clock },
  DISPATCHED: { label: 'On The Way', bg: 'bg-amber-100', text: 'text-amber-800', icon: Navigation },
  ON_THE_WAY: { label: 'On The Way', bg: 'bg-amber-100', text: 'text-amber-800', icon: Navigation },
  OUT_FOR_DELIVERY: { label: 'Out For Delivery', bg: 'bg-purple-100', text: 'text-purple-800', icon: MapPin },
  DELIVERED: { label: 'Delivered', bg: 'bg-emerald-100', text: 'text-emerald-800', icon: CheckCircle2 },
  CANCELLED: { label: 'Cancelled', bg: 'bg-rose-100', text: 'text-rose-700', icon: AlertTriangle },
};

// Procedure order: Pending Dispatch -> Out For Delivery -> On The Way -> Delivered
const FILTER_TABS: { key: string; label: string }[] = [
  { key: 'ALL', label: 'All Shipments' },
  { key: 'BOOKED', label: 'Pending Dispatch' },
  { key: 'OUT_FOR_DELIVERY', label: 'Out For Delivery' },
  { key: 'ON_THE_WAY', label: 'On The Way' },
  { key: 'DELIVERED', label: 'Delivered' },
];

const ALL_CUSTOMERS = '__all_customers__';

/** Any stage can be changed to any other stage; only cancelled shipments are closed. */
const canAdvance = (status: TransportStatus) => status !== 'CANCELLED';

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function TransportDeliveryPage() {
  const router = useRouter();
  const pathname = usePathname();
  const currentUser = useAuthStore((s) => s.user);
  const userPermissions = currentUser?.permissions || [];
  const isAdmin = currentUser?.role === 'SUPER_ADMIN' || currentUser?.role === 'ADMIN';
  const canManage = isAdmin || hasAnyPermission(userPermissions, getAccountUpdatePermissions('transport-delivery'));

  const [records, setRecords] = useState<TransportRecord[]>([]);
  const [metrics, setMetrics] = useState<Metrics>({ total: 0, pendingDispatch: 0, onTheWay: 0, outForDelivery: 0, delivered: 0 });
  const [stageCounts, setStageCounts] = useState<Metrics>({ total: 0, pendingDispatch: 0, onTheWay: 0, outForDelivery: 0, delivered: 0 });
  const latestRequest = useRef(0);
  const [loading, setLoading] = useState(true);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [customerFilter, setCustomerFilter] = useState('');
  const [customers, setCustomers] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [updatingStatus, setUpdatingStatus] = useState<TransportRecord | null>(null);

  const basePath = pathname.startsWith('/employee') ? '/employee/accounts/transport-delivery' : '/admin/accounts/transport-delivery';

  const fetchRecords = useCallback(async () => {
    const requestId = ++latestRequest.current;
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: '25' });
      if (statusFilter !== 'ALL') params.set('status', statusFilter);
      if (search.trim()) params.set('search', search.trim());
      if (customerFilter) params.set('customer', customerFilter);
      const res = await api.get<{ success: boolean; items: TransportRecord[]; pagination: { totalPages: number }; metrics: Metrics; tabCounts?: Metrics; customers?: string[] }>(`/vehicle-transports?${params}`);
      // A slower, older request must not overwrite the result of a newer one.
      if (requestId !== latestRequest.current) return;
      setRecords(res.data.items || []);
      setTotalPages(res.data.pagination?.totalPages || 1);
      if (res.data.metrics) setMetrics(res.data.metrics);
      const counts = res.data.tabCounts || res.data.metrics;
      if (counts) setStageCounts(counts);
      setCustomers(res.data.customers || []);
    } catch {
      if (requestId === latestRequest.current) toast.error('Failed to load transport records.');
    } finally {
      if (requestId === latestRequest.current) setLoading(false);
    }
  }, [page, statusFilter, search, customerFilter]);

  useEffect(() => { void fetchRecords(); }, [fetchRecords]);

  useEffect(() => {
    const term = searchInput.trim();
    if (term === search) return undefined;
    const timer = window.setTimeout(() => {
      setSearch(term);
      setPage(1);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [searchInput, search]);

  const hasActiveFilters = Boolean(searchInput.trim() || customerFilter);
  const clearFilters = () => {
    setSearchInput('');
    setSearch('');
    setCustomerFilter('');
    setPage(1);
  };

  const handleDownloadChallan = async (id: string, challanNo: string) => {
    try {
      await downloadAuthedFile(`/vehicle-transports/${id}/challan`, `Delivery-Challan-${challanNo}.pdf`);
    } catch {
      toast.error('Failed to download challan.');
    }
  };

  const handleResendWhatsApp = async (id: string) => {
    try {
      const res = await api.post<{ success: boolean; message?: string }>(`/vehicle-transports/${id}/notify`);
      if (res.data.success) toast.success(res.data.message || 'WhatsApp sent to the customer.');
      else toast.warn(`WhatsApp not sent: ${res.data.message || 'unknown reason'}`);
    } catch {
      toast.error('Failed to send WhatsApp notification.');
    }
  };

  // Stage tab badges count the shipments that match the current search / customer filter.
  const tabCounts: Record<string, number> = {
    ALL: stageCounts.total,
    BOOKED: stageCounts.pendingDispatch,
    OUT_FOR_DELIVERY: stageCounts.outForDelivery,
    ON_THE_WAY: stageCounts.onTheWay,
    DELIVERED: stageCounts.delivered,
  };

  const kpiCards = [
    { label: 'Total Shipments', value: metrics.total, color: 'bg-slate-50 border-slate-200', icon: Truck },
    { label: 'Pending Dispatch', value: metrics.pendingDispatch, color: 'bg-blue-50 border-blue-200', icon: Package },
    { label: 'Out For Delivery', value: metrics.outForDelivery, color: 'bg-purple-50 border-purple-200', icon: MapPin },
    { label: 'On The Way', value: metrics.onTheWay, color: 'bg-amber-50 border-amber-200', icon: Navigation },
    { label: 'Delivered', value: metrics.delivered, color: 'bg-emerald-50 border-emerald-200', icon: PackageCheck },
  ];

  return (
    <div className="min-h-screen bg-gray-50 pb-8">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 flex items-center gap-2">
            <Truck className="h-5 w-5 text-amber-500" />
            Transport &amp; Delivery
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">Post-sale vehicle logistics, challan management &amp; Amazon-style tracking</p>
        </div>
        <button onClick={() => { void fetchRecords(); }} className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800 border border-slate-200 rounded-lg px-3 py-1.5 hover:bg-slate-50 transition-colors">
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </button>
      </div>

      <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* KPI Cards (one card per flow stage) */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          {kpiCards.map((card) => {
            const Icon = card.icon;
            return (
              <div key={card.label} className={`${card.color} border rounded-xl p-4 flex items-center gap-3`}>
                <Icon className="h-6 w-6 text-slate-600 shrink-0" />
                <div>
                  <p className="text-2xl font-bold text-slate-900">{card.value}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{card.label}</p>
                </div>
              </div>
            );
          })}
        </div>

        {/* Shipments panel: stage tabs, filters and table */}
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          {/* Compact toolbar: tabs and filters share one row and wrap to a second row when space runs out (never scroll). */}
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2.5 border-b border-slate-100 px-4 py-3">
            <div role="tablist" aria-label="Filter shipments by stage" className="flex flex-wrap items-center gap-0.5 rounded-lg bg-slate-100 p-0.5">
              {FILTER_TABS.map((tab) => {
                const active = statusFilter === tab.key;
                return (
                  <button
                    key={tab.key}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => { setStatusFilter(tab.key); setPage(1); }}
                    className={`flex h-8 items-center gap-1.5 whitespace-nowrap rounded-md px-3 text-[13px] font-medium transition-colors ${
                      active ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    {tab.label}
                    <span
                      className={`min-w-[1.25rem] rounded-full px-1.5 text-center text-[10px] font-semibold leading-4 tabular-nums ${
                        active ? 'bg-amber-400 text-slate-900' : 'bg-slate-200/80 text-slate-600'
                      }`}
                    >
                      {tabCounts[tab.key] ?? 0}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
              <div className="relative w-full sm:w-64">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                <input
                  type="search"
                  aria-label="Search shipments"
                  placeholder="Search plate, customer or challan"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  className="h-9 w-full rounded-lg border border-slate-200 bg-white pl-8 pr-3 text-[13px] placeholder:text-slate-400 focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-200 [&::-webkit-search-cancel-button]:cursor-pointer"
                />
              </div>
              <SearchableSelect
                className="w-full sm:w-48"
                buttonClassName="h-9 bg-white py-0 text-[13px] border-slate-200"
                value={customerFilter || ALL_CUSTOMERS}
                options={[{ id: ALL_CUSTOMERS, name: 'All Customers' }, ...customers.map((name) => ({ id: name, name }))]}
                onChange={(option) => { setCustomerFilter(option.id === ALL_CUSTOMERS ? '' : String(option.id)); setPage(1); }}
                placeholder="All Customers"
              />
              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="flex h-9 shrink-0 items-center gap-1 rounded-lg px-2.5 text-[13px] font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800"
                >
                  <X className="h-3.5 w-3.5" /> Clear
                </button>
              )}
            </div>
          </div>

          {/* Table */}
          {loading && records.length === 0 ? (
            <div className="py-20 flex justify-center"><BrandLoader /></div>
          ) : records.length === 0 ? (
            <div className="py-20 text-center text-slate-400">
              <Truck className="h-10 w-10 mx-auto mb-3 opacity-30" />
              {hasActiveFilters || statusFilter !== 'ALL' ? (
                <>
                  <p className="text-sm text-slate-600">No shipments match these filters.</p>
                  <button
                    type="button"
                    onClick={() => { clearFilters(); setStatusFilter('ALL'); }}
                    className="mt-3 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50"
                  >
                    Show all shipments
                  </button>
                </>
              ) : (
                <>
                  <p className="text-sm">No transport records yet.</p>
                  <p className="text-xs mt-1">Records are created automatically when a vehicle deal is completed.</p>
                </>
              )}
            </div>
          ) : (
            <div className={`overflow-x-auto transition-opacity ${loading ? 'pointer-events-none opacity-60' : ''}`} aria-busy={loading}>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/50">
                    <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3 whitespace-nowrap">Machine &amp; Plate</th>
                    <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3 whitespace-nowrap">Dispatch From</th>
                    <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3 whitespace-nowrap">Deliver To</th>
                    <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3 whitespace-nowrap">Status &amp; Challan</th>
                    <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3 whitespace-nowrap">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {records.map((record) => {
                    const statusCfg = STATUS_CONFIG[record.status] || STATUS_CONFIG.BOOKED;
                    const StatusIcon = statusCfg.icon;
                    return (
                      <tr key={record.id} className="hover:bg-slate-50/50 transition-colors">
                        {/* Machine & Plate */}
                        <td className="px-4 py-3">
                          <div>
                            <p className="font-medium text-slate-800 text-xs leading-snug max-w-[180px] truncate">
                              {record.sellAccount.listingTitle || [record.sellAccount.brandName, record.sellAccount.vehicleModel].filter(Boolean).join(' ') || 'Machine'}
                            </p>
                            {record.sellAccount.vehicleNumber && (
                              <span className="inline-block mt-0.5 text-[10px] font-mono font-bold bg-slate-800 text-white px-1.5 py-0.5 rounded">
                                {record.sellAccount.vehicleNumber}
                              </span>
                            )}
                            <p className="text-[10px] text-slate-400 mt-0.5">{record.sellAccount.recordNumber}</p>
                          </div>
                        </td>

                        {/* Dispatch From */}
                        <td className="px-4 py-3">
                          <p className="text-xs font-medium text-slate-700">{record.sellAccount.sellerName || '—'}</p>
                          <p className="text-[10px] text-slate-400 mt-0.5">
                            {[record.sellAccount.sellerCity, record.sellAccount.sellerState].filter(Boolean).join(', ') || '—'}
                          </p>
                        </td>

                        {/* Deliver To */}
                        <td className="px-4 py-3">
                          <p className="text-xs font-medium text-slate-700">{record.sellAccount.purchaserName || '—'}</p>
                          <p className="text-[10px] text-slate-400 mt-0.5">
                            {[record.sellAccount.purchaserCity, record.sellAccount.purchaserState].filter(Boolean).join(', ') || '—'}
                          </p>
                          {record.sellAccount.purchaserNumber && (
                            <a href={`tel:${record.sellAccount.purchaserNumber}`} className="flex items-center gap-0.5 text-[10px] text-blue-600 hover:underline mt-0.5">
                              <Phone className="h-2.5 w-2.5" />{record.sellAccount.purchaserNumber}
                            </a>
                          )}
                        </td>

                        {/* Status & Challan (Interactive quick status change) */}
                        <td className="px-4 py-3">
                          <button
                            onClick={() => canManage && canAdvance(record.status) && setUpdatingStatus(record)}
                            disabled={!canManage || !canAdvance(record.status)}
                            title={canManage && canAdvance(record.status) ? 'Click to update status' : undefined}
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${statusCfg.bg} ${statusCfg.text} transition-all text-left group ${canManage && canAdvance(record.status) ? 'hover:ring-2 hover:ring-amber-400/50' : 'cursor-default'}`}
                          >
                            <StatusIcon className="h-3 w-3 shrink-0" />
                            <span>{statusCfg.label}</span>
                            {canManage && canAdvance(record.status) && <Pencil className="h-2.5 w-2.5 opacity-40 group-hover:opacity-100 ml-0.5" />}
                          </button>
                          <p className="text-[10px] text-slate-500 mt-1">Challan: <strong className="text-slate-700">{record.challanNumber}</strong></p>
                      </td>

                        {/* Actions */}
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => router.push(`${basePath}/${record.id}`)}
                              title="View Detail"
                              className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-500 hover:text-slate-800 transition-colors"
                            >
                              <Eye className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => handleDownloadChallan(record.id, record.challanNumber)}
                              title="Download Challan PDF"
                              className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-500 hover:text-slate-800 transition-colors"
                            >
                              <Download className="h-3.5 w-3.5" />
                            </button>
                            {canManage && (
                              <button
                                onClick={() => handleResendWhatsApp(record.id)}
                                title="Resend WhatsApp"
                                className="p-1.5 rounded-lg border border-green-200 hover:bg-green-50 text-green-600 hover:text-green-800 transition-colors"
                              >
                                <Send className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="px-4 py-3 border-t border-slate-100 flex items-center justify-between">
              <p className="text-xs text-slate-500">Page {page} of {totalPages}</p>
              <div className="flex gap-1">
                <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="p-1.5 rounded border border-slate-200 disabled:opacity-40 hover:bg-slate-50 transition-colors">
                  <ChevronLeft className="h-3.5 w-3.5" />
                </button>
                <button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} className="p-1.5 rounded border border-slate-200 disabled:opacity-40 hover:bg-slate-50 transition-colors">
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Status Update Modal */}
      {updatingStatus && (
        <TransportStatusModal
          transportId={updatingStatus.id}
          status={updatingStatus.status}
          machineLabel={updatingStatus.sellAccount.listingTitle || [updatingStatus.sellAccount.brandName, updatingStatus.sellAccount.vehicleModel].filter(Boolean).join(' ') || updatingStatus.sellAccount.vehicleNumber || updatingStatus.sellAccount.recordNumber}
          customerName={updatingStatus.sellAccount.purchaserName}
          canManage={canManage}
          onClose={() => setUpdatingStatus(null)}
          onUpdated={() => { void fetchRecords(); }}
        />
      )}
    </div>
  );
}
