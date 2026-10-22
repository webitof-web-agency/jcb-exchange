'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Wallet,
  Search,
  Eye,
  Plus,
  Pencil,
  Trash2,
  X,
  Car,
  Phone,
  Send,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Download,
  LockKeyhole,
  ClipboardCheck,
  Receipt,
  Copy,
  Check,
  RefreshCw,
  LayoutGrid,
  List,
  ExternalLink,
  TrendingUp,
  ArrowUpRight,
  ShieldCheck,
  CheckCircle2,
  Clock,
  Sparkles,
} from 'lucide-react';
import api from '@/lib/api';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  getAccountCreatePermissions,
  getAccountDeletePermissions,
  getAccountExportPermission,
  getAccountUpdatePermissions,
} from '@/lib/accountsPermissions';
import { buildPaginationItems } from '@/lib/paginationUtils';
import { hasAnyPermission } from '@/lib/permissionUtils';
import { downloadTableFile } from '@/lib/tabularExport';
import SearchableSelect from '@/components/ui/SearchableSelect';
import BrandLoader from '@/components/ui/BrandLoader';
import PortalActionDropdown from '@/components/ui/PortalActionDropdown';
import { useAuthStore } from '@/store/authStore';
import { deleteSecureFileFromServer } from '@/lib/fileUpload';
import { normalizeSellAccountDocuments } from '@/lib/sellAccountDocuments.mjs';
import { removeSellAccountRecord } from '@/lib/sellAccountForm.mjs';
import { calculateSellAccountGst } from '@/lib/sellAccountFinance.mjs';
import { useTranslation } from '@/hooks/useTranslation';
import { toast } from 'react-toastify';
import { mergeSellAccountRecords } from '@/lib/sellAccountDrafts.mjs';
import { getSourceTypeLabel } from '@/lib/soldVehicleParties.mjs';
import { summarizeTransferTasks } from '@/lib/rtoTransferTasks.mjs';
import { isHighlightedSellAccount } from '@/lib/sellAccountListNavigation.mjs';
import {
  DEAL_STATUS_CONFIG,
  formatDisplayDate as formatDate,
  normalizeServerSellAccount,
  normalizeSellAccountRecord,
  type SellAccountApiRecord,
  type SellAccountDealStatus,
  type SellAccountDocuments,
  type SellAccountRecord,
  type StoredSellAccountRecord,
} from '@/components/accounts/sold-vehicle/soldVehicleModel';

const INITIAL_MOCK_RECORDS: SellAccountRecord[] = [
  {
    id: 'SA-2026-001',
    ownerName: 'Ramesh Patel Construction',
    ownerNumber: '9876543210',
    vehicleNumber: 'MH-12-AB-4592',
    sellDate: '2026-09-10',
    vehicleType: 'Backhoe Loader',
    brandName: 'JCB',
    vehicleModel: 'JCB 3DX Super 2023',
    sellerName: 'Gujarat Heavy Infra',
    sellerNumber: '9822011223',
    purchaserName: 'Sharma Builders & Co',
    purchaserNumber: '9421098765',
    purchaseAmount: 2200000,
    sellAmount: 2550000,
    transferDetails: 'MH-12 RTO NOC issued, Bank hypothecation cleared',
    balanceAmount: 50000,
    expenses: 45000,
    netProfit: 305000,
    dealStatus: 'DEAL_DONE',
    noteSheet: 'Vehicle inspected at Pune depot. Full payment received via NEFT.',
    createdAt: '2026-09-10T10:30:00Z',
  },
  {
    id: 'SA-2026-002',
    ownerName: 'Venkatesh Mining Pvt Ltd',
    ownerNumber: '9765432109',
    vehicleNumber: 'KA-05-MN-3310',
    sellDate: '2026-09-12',
    vehicleType: 'Hydraulic Excavator',
    brandName: 'CAT',
    vehicleModel: 'CAT 320D2 GC',
    sellerName: 'South Earthmovers & Traders',
    sellerNumber: '9988776655',
    purchaserName: 'Deccan Granite Works',
    purchaserNumber: '9844112233',
    purchaseAmount: 4100000,
    sellAmount: 4600000,
    transferDetails: 'State re-registration in progress KA to AP RTO',
    balanceAmount: 200000,
    expenses: 80000,
    netProfit: 420000,
    dealStatus: 'RTO_WORK_IN_PROGRESS',
    noteSheet: 'Advance payment of 44 Lacs received. Final balance 2 Lacs due upon RTO transfer.',
    createdAt: '2026-09-12T14:15:00Z',
  },
  {
    id: 'SA-2026-003',
    ownerName: 'Ahmad Freight Carriers',
    ownerNumber: '9123456789',
    vehicleNumber: 'GJ-01-CD-8821',
    sellDate: '2026-09-14',
    vehicleType: 'Heavy Tipper Truck',
    brandName: 'Tata',
    vehicleModel: 'Tata Prima 2830.K',
    sellerName: 'Western Commercial Fleet',
    sellerNumber: '9711223344',
    purchaserName: 'Kutch Logistics Ltd',
    purchaserNumber: '9655443322',
    purchaseAmount: 3100000,
    sellAmount: 3450000,
    transferDetails: 'Fitness & Insurance updated. RTO transfer pending.',
    balanceAmount: 100000,
    expenses: 35000,
    netProfit: 315000,
    dealStatus: 'OPEN',
    noteSheet: 'Token amount 50,000 paid by buyer. Inspection scheduled for tomorrow.',
    createdAt: '2026-09-14T09:00:00Z',
  },
];

type ExportFormat = 'csv' | 'xls';

const formatCurrency = (val: number | null | undefined) => {
  const num = Number(val || 0);
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(num);
};

const recordGst = (record: SellAccountRecord) =>
  calculateSellAccountGst({
    sellAmount: record.sellAmount,
    purchaseAmount: record.purchaseAmount,
    expenses: record.expenses,
    marginBasis: record.marginBasis,
    sellerState: record.sellerState,
    purchaserState: record.purchaserState,
  });

export default function SellAccountsPage() {
  const [records, setRecords] = useState<SellAccountRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [vehicleTypeFilter, setVehicleTypeFilter] = useState<string>('ALL');
  const [viewMode, setViewMode] = useState<'table' | 'grid'>('table');
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const { t } = useTranslation();

  useEffect(() => {
    api
      .get('/master/categories')
      .then((response) => setCategories(response.data.data || []))
      .catch((err) => console.error('Failed to load sold vehicle categories', err));
  }, []);

  const [deletingRecordId, setDeletingRecordId] = useState<string | null>(null);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);

  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentUser = useAuthStore((state) => state.user);
  const userPermissions = currentUser?.permissions || [];

  const canManageAccounts = currentUser?.role === 'SUPER_ADMIN' || currentUser?.role === 'ADMIN';
  const canCreateSellAccounts =
    canManageAccounts || hasAnyPermission(userPermissions, getAccountCreatePermissions('sell-accounts'));
  const canUpdateSellAccounts =
    canManageAccounts || hasAnyPermission(userPermissions, getAccountUpdatePermissions('sell-accounts'));
  const canDeleteSellAccounts =
    canManageAccounts || hasAnyPermission(userPermissions, getAccountDeletePermissions('sell-accounts'));
  const canExportSellAccounts =
    canManageAccounts || hasAnyPermission(userPermissions, [getAccountExportPermission('sell-accounts')]);

  const accountBasePath = pathname.startsWith('/employee')
    ? '/employee/accounts/sell-accounts'
    : pathname.startsWith('/admin')
      ? '/admin/accounts/sell-accounts'
      : '/superadmin/accounts/sell-accounts';
  const rtoBasePath = pathname.startsWith('/employee')
    ? '/employee/accounts/rto-work-status'
    : pathname.startsWith('/admin')
      ? '/admin/accounts/rto-work-status'
      : '/superadmin/accounts/rto-work-status';

  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [highlightedRecordId, setHighlightedRecordId] = useState<string | null>(null);

  // Copy helper
  const copyText = useCallback((text: string, key: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  }, []);

  // Deep links handling
  useEffect(() => {
    const listingId = searchParams.get('listingId')?.trim();
    const editId = searchParams.get('editId')?.trim();
    if (listingId) router.replace(`${accountBasePath}/new?listingId=${encodeURIComponent(listingId)}`);
    else if (editId) router.replace(`${accountBasePath}/${encodeURIComponent(editId)}/edit`);
  }, [accountBasePath, router, searchParams]);

  useEffect(() => {
    let cancelled = false;
    const legacySeedMigrationKey = 'jcb_sell_accounts_legacy_seed_migrated_v2';
    const readLocalRecords = () => {
      const legacyRecords = INITIAL_MOCK_RECORDS.map((record) =>
        normalizeSellAccountRecord(record as StoredSellAccountRecord),
      );
      let nextRecords = legacyRecords;
      const saved = localStorage.getItem('jcb_sell_accounts_records');
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          const savedRecords = Array.isArray(parsed)
            ? (parsed as StoredSellAccountRecord[]).map(normalizeSellAccountRecord)
            : [];
          const shouldRestoreLegacyRecords = !localStorage.getItem(legacySeedMigrationKey);
          nextRecords = shouldRestoreLegacyRecords
            ? mergeSellAccountRecords(savedRecords, legacyRecords)
            : savedRecords;
          if (shouldRestoreLegacyRecords) {
            localStorage.setItem(legacySeedMigrationKey, '1');
          }
        } catch {
          nextRecords = legacyRecords;
        }
      }
      return nextRecords;
    };

    const loadRecords = async () => {
      const localRecords = readLocalRecords();
      try {
        const response = await api.get<{ records?: SellAccountApiRecord[] }>('/recruitment/admin/sell-accounts');
        const serverRecords = Array.isArray(response.data?.records)
          ? response.data.records.map(normalizeServerSellAccount)
          : [];
        if (!cancelled) {
          setRecords(mergeSellAccountRecords(serverRecords, localRecords));
          setLoading(false);
        }
      } catch (error) {
        console.warn('Sold Vehicle API unavailable; using local draft records.', error);
        if (!cancelled) {
          setRecords(localRecords);
          setLoading(false);
        }
      }
    };

    void loadRecords();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined' && !loading) {
      localStorage.setItem('jcb_sell_accounts_records', JSON.stringify(records));
    }
  }, [loading, records]);

  // Executive KPI Calculations
  const metrics = useMemo(() => {
    let totalTurnover = 0;
    let totalPurchaseCost = 0;
    let totalNetProfit = 0;
    let totalBalanceDue = 0;
    let activeDealsCount = 0;
    let dealsDoneCount = 0;

    records.forEach((record) => {
      totalTurnover += Number(record.sellAmount || 0);
      totalPurchaseCost += Number(record.purchaseAmount || 0);
      totalBalanceDue += Number(record.balanceAmount || 0);

      const gst = recordGst(record);
      totalNetProfit += Number(gst.netProfitAfterGst || 0);

      if (record.dealStatus === 'DEAL_DONE') {
        dealsDoneCount++;
      } else {
        activeDealsCount++;
      }
    });

    return {
      totalDeals: records.length,
      totalTurnover,
      totalPurchaseCost,
      totalNetProfit,
      totalBalanceDue,
      activeDealsCount,
      dealsDoneCount,
    };
  }, [records]);

  const openEdit = (record: SellAccountRecord) => {
    if (record.isLocked) {
      toast.info('This record is locked and can only be viewed.');
      return;
    }
    router.push(`${accountBasePath}/${encodeURIComponent(record.id)}/edit`);
  };

  const getSellAccountApiError = (error: unknown, fallback: string) => {
    const response = (error as { response?: { status?: number; data?: { error?: unknown; message?: unknown } } })
      ?.response;
    const detail = response?.data?.error ?? response?.data?.message;
    if (typeof detail === 'string' && detail.trim()) return detail.trim();
    if (typeof response?.status === 'number') return `${fallback} (HTTP ${response.status})`;
    return fallback;
  };

  const handleDeleteConfirm = async () => {
    if (!canDeleteSellAccounts || !deletingRecordId) return;
    const recordToDelete = records.find((record) => record.id === deletingRecordId);
    if (recordToDelete?.isLocked) {
      toast.info('This record is locked and can only be viewed.');
      setDeletingRecordId(null);
      return;
    }
    if (recordToDelete?.rtoRecord?.id) {
      toast.info('This Sold Vehicle was transferred to RTO Work. Delete it from the RTO Work section first.');
      setDeletingRecordId(null);
      return;
    }
    if (!deletingRecordId.startsWith('DRAFT-SELL-')) {
      try {
        await api.delete(`/recruitment/admin/sell-accounts/${encodeURIComponent(deletingRecordId)}`);
      } catch (error) {
        toast.error(getSellAccountApiError(error, 'Unable to delete Sold Vehicle.'));
        return;
      }
    }
    const documents = recordToDelete
      ? (Object.values(normalizeSellAccountDocuments(recordToDelete) as SellAccountDocuments) as any[])
      : [];
    const urls = [...new Set(documents.map((document) => document?.fileUrl).filter(Boolean))] as string[];
    await Promise.allSettled(urls.map((fileUrl) => deleteSecureFileFromServer(fileUrl)));
    setRecords(removeSellAccountRecord(records, deletingRecordId));
    setDeletingRecordId(null);
    toast.success('Sold Vehicle record removed successfully.');
  };

  const filteredRecords = useMemo(() => {
    return records.filter((item) => {
      const q = searchTerm.toLowerCase().trim();
      const matchesSearch =
        !q ||
        item.ownerName.toLowerCase().includes(q) ||
        item.ownerNumber.includes(q) ||
        item.vehicleNumber.toLowerCase().includes(q) ||
        (item.chassisNumber || '').toLowerCase().includes(q) ||
        item.sellerName.toLowerCase().includes(q) ||
        item.sellerNumber.includes(q) ||
        item.purchaserName.toLowerCase().includes(q) ||
        item.purchaserNumber.includes(q) ||
        item.brandName.toLowerCase().includes(q) ||
        item.vehicleModel.toLowerCase().includes(q) ||
        (item.invoiceNumber || '').toLowerCase().includes(q) ||
        (item.recordNumber || item.id).toLowerCase().includes(q);

      const matchesStatus = statusFilter === 'ALL' || item.dealStatus === statusFilter;
      const matchesType = vehicleTypeFilter === 'ALL' || item.vehicleType === vehicleTypeFilter;

      return matchesSearch && matchesStatus && matchesType;
    });
  }, [records, searchTerm, statusFilter, vehicleTypeFilter]);

  const exportColumns = useMemo(
    () => [
      { header: 'Record ID', value: (record: SellAccountRecord) => record.recordNumber || record.id },
      { header: 'Invoice No', value: (record: SellAccountRecord) => record.invoiceNumber || '' },
      { header: 'Owner Name', value: (record: SellAccountRecord) => record.ownerName },
      { header: 'Owner Number', value: (record: SellAccountRecord) => record.ownerNumber },
      { header: 'Registration Number', value: (record: SellAccountRecord) => record.vehicleNumber },
      { header: 'Chassis Number', value: (record: SellAccountRecord) => record.chassisNumber || '' },
      { header: 'Vehicle Type', value: (record: SellAccountRecord) => record.vehicleType },
      { header: 'Brand', value: (record: SellAccountRecord) => record.brandName },
      { header: 'Vehicle Model', value: (record: SellAccountRecord) => record.vehicleModel },
      { header: 'Bought From (Source)', value: (record: SellAccountRecord) => getSourceTypeLabel(record.sourceType) },
      { header: 'Purchase Type', value: (record: SellAccountRecord) => record.purchaseType || 'PURCHASE' },
      { header: 'Seller Name', value: (record: SellAccountRecord) => record.sellerName },
      { header: 'Seller Number', value: (record: SellAccountRecord) => record.sellerNumber },
      { header: 'Purchase Date', value: (record: SellAccountRecord) => formatDate(record.sellerDate) },
      { header: 'Seller City', value: (record: SellAccountRecord) => record.sellerCity || '' },
      { header: 'Seller State', value: (record: SellAccountRecord) => record.sellerState || '' },
      {
        header: 'Broker',
        value: (record: SellAccountRecord) => [record.brokerName, record.brokerNumber].filter(Boolean).join(' / '),
      },
      { header: 'Sale Type', value: (record: SellAccountRecord) => record.saleType || 'SELL' },
      { header: 'Customer Name', value: (record: SellAccountRecord) => record.purchaserName },
      { header: 'Customer Number', value: (record: SellAccountRecord) => record.purchaserNumber },
      {
        header: 'Sell Date',
        value: (record: SellAccountRecord) => formatDate(record.purchaserDate || record.sellDate),
      },
      { header: 'Customer City', value: (record: SellAccountRecord) => record.purchaserCity || '' },
      { header: 'Customer State', value: (record: SellAccountRecord) => record.purchaserState || '' },
      { header: 'Purchase Amount', value: (record: SellAccountRecord) => record.purchaseAmount },
      {
        header: 'Purchase Exchange Value',
        value: (record: SellAccountRecord) =>
          record.purchaseType === 'EXCHANGE' ? record.purchaseExchangeValue || 0 : 0,
      },
      { header: 'Sell Amount', value: (record: SellAccountRecord) => record.sellAmount },
      {
        header: 'Sale Exchange Value',
        value: (record: SellAccountRecord) => (record.saleType === 'EXCHANGE' ? record.saleExchangeValue || 0 : 0),
      },
      { header: 'Margin (incl. GST)', value: (record: SellAccountRecord) => recordGst(record).marginAmount },
      { header: 'Taxable Margin', value: (record: SellAccountRecord) => recordGst(record).taxableAmount },
      { header: 'CGST', value: (record: SellAccountRecord) => recordGst(record).cgst },
      { header: 'SGST', value: (record: SellAccountRecord) => recordGst(record).sgst },
      { header: 'IGST', value: (record: SellAccountRecord) => recordGst(record).igst },
      { header: 'Expenses', value: (record: SellAccountRecord) => record.expenses },
      { header: 'Final Profit', value: (record: SellAccountRecord) => recordGst(record).netProfitAfterGst },
      { header: 'Customer Balance', value: (record: SellAccountRecord) => record.balanceAmount },
      { header: 'Transfer Details', value: (record: SellAccountRecord) => record.transferDetails },
      {
        header: 'Deal Status',
        value: (record: SellAccountRecord) => DEAL_STATUS_CONFIG[record.dealStatus]?.label || record.dealStatus,
      },
      { header: 'Remark', value: (record: SellAccountRecord) => record.noteSheet },
      { header: 'Created At', value: (record: SellAccountRecord) => formatDate(record.createdAt) },
    ],
    [],
  );

  const exportRecords = (format: ExportFormat) => {
    if (!canExportSellAccounts) return;
    downloadTableFile({
      columns: exportColumns,
      rows: filteredRecords,
      fileName: `sold-vehicles-${new Date().toISOString().slice(0, 10)}`,
      format,
    });
    setExportMenuOpen(false);
  };

  useEffect(() => {
    const resetTimer = window.setTimeout(() => setCurrentPage(1), 0);
    return () => window.clearTimeout(resetTimer);
  }, [searchTerm, statusFilter, vehicleTypeFilter, records]);

  const totalPages = Math.ceil(filteredRecords.length / rowsPerPage) || 1;
  const currentRecords = useMemo(() => {
    return filteredRecords.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage);
  }, [filteredRecords, currentPage, rowsPerPage]);

  const highlightId = searchParams.get('highlightId')?.trim() || '';

  useEffect(() => {
    if (loading || !highlightId) return;
    const targetIndex = filteredRecords.findIndex((record) => isHighlightedSellAccount(record, highlightId));
    if (targetIndex < 0) return;

    const targetPage = Math.floor(targetIndex / rowsPerPage) + 1;
    if (targetPage !== currentPage) {
      const pageTimer = window.setTimeout(() => setCurrentPage(targetPage), 0);
      return () => window.clearTimeout(pageTimer);
    }

    const target = filteredRecords[targetIndex];
    const scrollTimer = window.setTimeout(() => {
      setHighlightedRecordId(target.id);
      document.getElementById(`sell-account-row-${encodeURIComponent(target.id)}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 50);
    const clearTimer = window.setTimeout(() => setHighlightedRecordId(null), 4050);

    return () => {
      window.clearTimeout(scrollTimer);
      window.clearTimeout(clearTimer);
    };
  }, [currentPage, filteredRecords, highlightId, loading, rowsPerPage]);

  const paginationItems = useMemo(() => buildPaginationItems(currentPage, totalPages), [currentPage, totalPages]);

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

  return (
    <div className="space-y-4 pb-14">
      {/* 1. EXECUTIVE KPI METRIC RIBBON */}
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
        {/* Metric 1: Total Sold Units */}
        <div className="rounded-xl border border-slate-200/90 bg-white p-3 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Sold Vehicles</span>
            <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
              <Car className="h-3.5 w-3.5" />
            </div>
          </div>
          <div className="mt-1 text-base sm:text-lg font-black text-slate-900 tracking-tight">
            {metrics.totalDeals}
          </div>
          <div className="mt-0.5 text-[10px] font-semibold text-slate-400">
            {metrics.dealsDoneCount} Done • {metrics.activeDealsCount} Active
          </div>
        </div>

        {/* Metric 2: Gross Turnover (Revenue) */}
        <div className="rounded-xl border border-emerald-200/90 bg-gradient-to-br from-emerald-50/50 to-white p-3 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-800">Gross Turnover</span>
            <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
              <TrendingUp className="h-3.5 w-3.5" />
            </div>
          </div>
          <div className="mt-1 text-sm sm:text-base font-black text-emerald-950 truncate" title={formatCurrency(metrics.totalTurnover)}>
            {formatCurrency(metrics.totalTurnover)}
          </div>
          <div className="mt-0.5 text-[10px] font-semibold text-emerald-700">Combined sales value</div>
        </div>

        {/* Metric 3: Sourcing Acquisition Cost */}
        <div className="rounded-xl border border-slate-200/90 bg-white p-3 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Sourcing Cost</span>
            <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
              <Wallet className="h-3.5 w-3.5" />
            </div>
          </div>
          <div className="mt-1 text-sm sm:text-base font-black text-slate-900 truncate" title={formatCurrency(metrics.totalPurchaseCost)}>
            {formatCurrency(metrics.totalPurchaseCost)}
          </div>
          <div className="mt-0.5 text-[10px] font-semibold text-slate-400">Total machinery bought</div>
        </div>

        {/* Metric 4: Net Realized Profit */}
        <div className="rounded-xl border border-amber-300 bg-gradient-to-br from-amber-50 to-white p-3 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-amber-900">Net Realized Profit</span>
            <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-amber-100 text-amber-700">
              <Sparkles className="h-3.5 w-3.5" />
            </div>
          </div>
          <div className="mt-1 text-sm sm:text-base font-black text-amber-950 truncate" title={formatCurrency(metrics.totalNetProfit)}>
            {formatCurrency(metrics.totalNetProfit)}
          </div>
          <div className="mt-0.5 text-[10px] font-semibold text-amber-800">After GST & expenses</div>
        </div>

        {/* Metric 5: Buyer Balance Due (Receivables) */}
        <div
          className={`rounded-xl border p-3 shadow-2xs ${
            metrics.totalBalanceDue > 0
              ? 'border-rose-200 bg-gradient-to-br from-rose-50/50 to-white'
              : 'border-slate-200/90 bg-white'
          }`}
        >
          <div className="flex items-center justify-between">
            <span
              className={`text-[10px] font-bold uppercase tracking-wider ${
                metrics.totalBalanceDue > 0 ? 'text-rose-800' : 'text-slate-500'
              }`}
            >
              Buyer Receivables
            </span>
            <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-slate-100 text-slate-700">
              <Clock className="h-3.5 w-3.5" />
            </div>
          </div>
          <div
            className={`mt-1 text-sm sm:text-base font-black truncate ${
              metrics.totalBalanceDue > 0 ? 'text-rose-700' : 'text-slate-900'
            }`}
          >
            {formatCurrency(metrics.totalBalanceDue)}
          </div>
          <div
            className={`mt-0.5 text-[10px] font-semibold ${
              metrics.totalBalanceDue > 0 ? 'text-rose-700' : 'text-emerald-700'
            }`}
          >
            {metrics.totalBalanceDue > 0 ? 'Pending collection' : 'All balances settled'}
          </div>
        </div>

        {/* Metric 6: Deal Completion Rate */}
        <div className="rounded-xl border border-slate-200/90 bg-white p-3 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Settled Deals</span>
            <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
              <CheckCircle2 className="h-3.5 w-3.5" />
            </div>
          </div>
          <div className="mt-1 text-base sm:text-lg font-black text-slate-900 tracking-tight">
            {metrics.totalDeals > 0 ? Math.round((metrics.dealsDoneCount / metrics.totalDeals) * 100) : 0}%
          </div>
          <div className="mt-0.5 text-[10px] font-semibold text-emerald-700">
            {metrics.dealsDoneCount} of {metrics.totalDeals} Deals Done
          </div>
        </div>
      </div>

      {/* 2. UNIFIED CONTROLS & FILTER SYSTEM */}
      <div className="rounded-2xl border border-slate-200/90 bg-white p-3.5 sm:p-4 shadow-xs">
        {/* Deal Status Quick Chips */}
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
            <span>All Deals</span>
            <span
              className={`rounded px-1.5 py-0.2 text-[10px] font-black ${
                statusFilter === 'ALL' ? 'bg-slate-800 text-white' : 'bg-white text-slate-700'
              }`}
            >
              {records.length}
            </span>
          </button>

          {(
            [
              'OPEN',
              'PARTIAL_PAYMENT_RECEIVED',
              'FULL_PAYMENT',
              'RTO_WORK_IN_PROGRESS',
              'RTO_WORK_COMPLETED',
              'DEAL_DONE',
            ] as SellAccountDealStatus[]
          ).map((st) => {
            const count = records.filter((r) => r.dealStatus === st).length;
            const isSelected = statusFilter === st;
            const cfg = DEAL_STATUS_CONFIG[st];

            return (
              <button
                key={st}
                type="button"
                onClick={() => setStatusFilter(st)}
                className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-bold transition ${
                  isSelected
                    ? `${cfg.bg} ${cfg.text} ring-1 ring-inset ${cfg.border} shadow-2xs`
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                <span>{cfg.shortLabel || cfg.label}</span>
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

        {/* Search, Categories, View Toggles & Actions */}
        <div className="mt-3 flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
          {/* Search Box */}
          <div className="relative flex-1 min-w-[220px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search by registration plate, customer, seller, owner, model, invoice..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50/70 py-2 pl-9 pr-8 text-xs font-semibold text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-amber-400 focus:bg-white focus:ring-2 focus:ring-amber-400/20"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X size={14} />
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Category Dropdown */}
            <div className="w-full sm:w-44">
              <SearchableSelect
                options={[
                  { id: 'ALL', name: 'All Categories' },
                  ...categories.map((cat) => ({ id: cat.name, name: cat.name })),
                ]}
                value={vehicleTypeFilter}
                displayValue={vehicleTypeFilter === 'ALL' ? 'All Categories' : vehicleTypeFilter}
                onChange={(opt) => setVehicleTypeFilter(String(opt.id))}
                searchable={false}
                className="w-full bg-slate-50/70 text-xs font-semibold"
              />
            </div>

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
                setSearchTerm('');
                setStatusFilter('ALL');
                setVehicleTypeFilter('ALL');
              }}
              className="inline-flex h-8 items-center justify-center rounded-xl border border-slate-200 bg-white px-2.5 text-xs font-bold text-slate-600 shadow-2xs transition hover:bg-slate-50"
              title="Reset Filters"
            >
              <RefreshCw size={14} />
            </button>

            {/* Export Menu */}
            {canExportSellAccounts ? (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setExportMenuOpen((current) => !current)}
                  disabled={filteredRecords.length === 0}
                  className="inline-flex h-8 items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 shadow-2xs transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                  title="Export Sold Vehicles"
                >
                  <Download size={14} />
                  <span>Export</span>
                </button>
                {exportMenuOpen && (
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
                )}
              </div>
            ) : null}

            {/* Add Record Primary Button */}
            {canCreateSellAccounts ? (
              <button
                type="button"
                onClick={() => router.push(`${accountBasePath}/new`)}
                className="inline-flex h-8 items-center justify-center gap-1.5 rounded-xl bg-[#FFC107] px-3.5 text-xs font-black text-slate-950 shadow-2xs transition hover:bg-[#E5AD06]"
              >
                <Plus size={15} />
                <span>New Sold Vehicle</span>
              </button>
            ) : null}
          </div>
        </div>
      </div>

      {/* 3. CONTENT AREA: TABLE VIEW OR GRID CARDS VIEW */}
      {loading ? (
        <div className="rounded-2xl border border-slate-200/90 bg-white py-14 shadow-xs">
          <BrandLoader variant="section" size="sm" bg="light" text="Loading sold vehicles registry..." />
        </div>
      ) : filteredRecords.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white py-14 text-center shadow-xs">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
            <Wallet className="h-6 w-6" />
          </div>
          <p className="mt-3 text-sm font-bold text-slate-800">No sold vehicle records found matching your filters.</p>
          <p className="mt-0.5 text-xs text-slate-400">Click &quot;New Sold Vehicle&quot; to add a commercial deal.</p>
          {canCreateSellAccounts && (
            <button
              type="button"
              onClick={() => router.push(`${accountBasePath}/new`)}
              className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-[#FFC107] px-3.5 py-2 text-xs font-bold text-slate-950 shadow-2xs hover:bg-[#E5AD06]"
            >
              <Plus size={14} />
              <span>Record Sold Machine</span>
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
                  <th className="px-3 py-3">Sourced From (Seller)</th>
                  <th className="px-3 py-3">Sold To (Buyer)</th>
                  <th className="px-3 py-3">Trading Financials</th>
                  <th className="px-3 py-3">Status & Workflow</th>
                  <th className="px-3.5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {currentRecords.map((item) => {
                  const statusInfo = DEAL_STATUS_CONFIG[item.dealStatus] || DEAL_STATUS_CONFIG['OPEN'];
                  const StatusIcon = statusInfo.icon;
                  const rtoProgress = summarizeTransferTasks(
                    (item.rtoRecord?.taskStatuses || []).map((status) => ({ status })),
                  );
                  const gst = recordGst(item);
                  const isCopied = copiedKey === `plate-${item.id}`;

                  return (
                    <tr
                      id={`sell-account-row-${encodeURIComponent(item.id)}`}
                      key={item.id}
                      onClick={() => router.push(`${accountBasePath}/${item.id}`)}
                      className={`group cursor-pointer transition-colors hover:bg-slate-50/80 ${highlightedRecordId === item.id ? 'bg-amber-50/90 shadow-[inset_4px_0_0_#f59e0b] animate-pulse' : ''}`}
                    >
                      {/* Vehicle & Plate */}
                      <td className="px-3.5 py-3.5">
                        <div className="flex flex-col gap-1.5">
                          {/* Mini HSRP Plate */}
                          <div className="inline-flex items-center rounded-md border border-slate-800 bg-white shadow-2xs overflow-hidden font-mono tracking-wider font-black select-all w-fit">
                            <div className="flex flex-col items-center justify-center bg-blue-700 px-1 py-0.5 text-white">
                              <span className="text-[6.5px] font-bold leading-none">IND</span>
                            </div>
                            <span className="px-2 py-0.5 text-xs font-black uppercase text-slate-950">
                              {item.vehicleNumber || 'UNREGISTERED'}
                            </span>
                            {item.vehicleNumber && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  copyText(item.vehicleNumber, `plate-${item.id}`);
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
                            )}
                          </div>

                          <div className="text-xs">
                            <p className="font-bold text-slate-900 truncate max-w-[190px]">
                              {item.brandName ? `${item.brandName} ` : ''}
                              {item.vehicleModel}
                            </p>
                            <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[10px]">
                              <span className="rounded bg-slate-100 px-1.5 py-0.25 font-semibold text-slate-600">
                                {item.vehicleType || 'Uncategorised'}
                              </span>
                              {item.listingId && (
                                <span className="text-amber-700 font-bold hover:underline">
                                  Live Listing
                                </span>
                              )}
                              {item.chassisNumber && (
                                <span className="font-mono text-slate-400 truncate max-w-[110px]" title={item.chassisNumber}>
                                  VIN: {item.chassisNumber.slice(-6)}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Sourced From (Seller) */}
                      <td className="px-3 py-3.5">
                        <div className="max-w-[160px]">
                          <p className="font-bold text-slate-900 truncate" title={item.sellerName}>
                            {item.sellerName || 'Direct Seller'}
                          </p>
                          {phoneLink(item.sellerNumber)}
                          <div className="mt-1 flex flex-wrap items-center gap-1 text-[10px]">
                            {item.sourceType && (
                              <span className="rounded bg-amber-50 px-1.5 py-0.2 font-semibold text-amber-800 border border-amber-200/60">
                                {getSourceTypeLabel(item.sourceType)}
                              </span>
                            )}
                            {item.purchaseType === 'EXCHANGE' && (
                              <span className="rounded bg-indigo-50 px-1.5 py-0.2 font-bold text-indigo-700 border border-indigo-200/60">
                                Exchange
                              </span>
                            )}
                          </div>
                          {item.ownerName && item.ownerName !== item.sellerName && (
                            <p className="text-[10px] text-slate-400 truncate mt-0.5" title={`RC Owner: ${item.ownerName}`}>
                              RC: {item.ownerName}
                            </p>
                          )}
                        </div>
                      </td>

                      {/* Sold To (Buyer) */}
                      <td className="px-3 py-3.5">
                        <div className="max-w-[160px]">
                          <p className="font-bold text-slate-900 truncate" title={item.purchaserName}>
                            {item.purchaserName}
                          </p>
                          {phoneLink(item.purchaserNumber)}
                          <div className="mt-1 flex flex-wrap items-center gap-1 text-[10px]">
                            {item.saleType === 'EXCHANGE' && (
                              <span className="rounded bg-blue-50 px-1.5 py-0.2 font-bold text-blue-700 border border-blue-200/60">
                                Exchange Sale
                              </span>
                            )}
                            {item.purchaserCity && (
                              <span className="text-slate-400 font-medium truncate">
                                {item.purchaserCity}
                              </span>
                            )}
                          </div>
                          <p className="text-[10px] text-slate-400 mt-0.5">
                            Sold: {formatDate(item.purchaserDate || item.sellDate)}
                          </p>
                        </div>
                      </td>

                      {/* Trading Financials */}
                      <td className="px-3 py-3.5 whitespace-nowrap">
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] uppercase font-bold text-slate-400">Sell:</span>
                            <span className="text-xs font-black text-emerald-800">
                              {formatCurrency(item.sellAmount)}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 text-[11px]">
                            <span className="text-[10px] uppercase font-bold text-slate-400">Buy:</span>
                            <span className="font-bold text-slate-700">
                              {formatCurrency(item.purchaseAmount)}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 text-[10px]">
                            <span className="uppercase font-bold text-slate-400">Net Profit:</span>
                            <span
                              className={`font-black ${
                                gst.netProfitAfterGst >= 0 ? 'text-amber-800' : 'text-rose-600'
                              }`}
                            >
                              {formatCurrency(gst.netProfitAfterGst)}
                            </span>
                          </div>
                          {item.balanceAmount > 0 ? (
                            <div className="flex items-center gap-1 text-[10px] font-bold text-rose-700">
                              <span>Due:</span>
                              <span>{formatCurrency(item.balanceAmount)}</span>
                            </div>
                          ) : (
                            <span className="text-[9.5px] font-bold text-emerald-700">
                              Fully Settled
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Status & Workflow */}
                      <td className="px-3 py-3.5 whitespace-nowrap">
                        <div>
                          <span
                            className={`inline-flex items-center gap-1.5 px-2.5 py-0.75 rounded-full text-[11px] font-bold border whitespace-nowrap shrink-0 ${statusInfo.bg} ${statusInfo.text} ${statusInfo.border}`}
                          >
                            <StatusIcon className="w-3 h-3" />
                            <span>{statusInfo.shortLabel || statusInfo.label}</span>
                          </span>

                          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px]">
                            {item.rtoRecord?.id ? (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  router.push(`${rtoBasePath}/${item.rtoRecord?.id}`);
                                }}
                                className="inline-flex items-center gap-1 font-bold text-amber-700 hover:text-amber-900 bg-amber-50 border border-amber-200/60 rounded px-1.5 py-0.2"
                                title="Open connected RTO work status"
                              >
                                <ClipboardCheck className="h-3 w-3" />
                                <span>RTO {rtoProgress.total ? `${rtoProgress.done}/${rtoProgress.total}` : 'Active'}</span>
                              </button>
                            ) : null}

                            {item.invoiceNumber && (
                              <span className="inline-flex items-center gap-1 font-bold text-emerald-800 bg-emerald-50 border border-emerald-200/60 rounded px-1.5 py-0.2">
                                <Receipt className="h-3 w-3" />
                                <span>{item.invoiceNumber}</span>
                              </span>
                            )}

                            {item.isDraft && (
                              <span className="font-bold text-slate-500 bg-slate-100 rounded px-1.5 py-0.2">
                                Draft
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Actions */}
                      <td className="px-3.5 py-3.5 text-right">
                        <div onClick={(e) => e.stopPropagation()}>
                          <PortalActionDropdown
                            align="right"
                            items={[
                              {
                                label: 'View Dossier',
                                icon: <Eye className="h-4 w-4 text-slate-500" />,
                                onClick: () => router.push(`${accountBasePath}/${item.id}`),
                              },
                              ...(canUpdateSellAccounts && !item.isLocked
                                ? [
                                    {
                                      label: 'Edit Deal Workspace',
                                      icon: <Pencil className="h-4 w-4 text-amber-600" />,
                                      onClick: () => openEdit(item),
                                    },
                                  ]
                                : []),
                              ...(item.rtoRecord?.id
                                ? [
                                    {
                                      label: 'View Connected RTO File',
                                      icon: <ClipboardCheck className="h-4 w-4 text-blue-600" />,
                                      onClick: () => router.push(`${rtoBasePath}/${item.rtoRecord?.id}`),
                                    },
                                  ]
                                : []),
                              ...(canDeleteSellAccounts && !item.isLocked
                                ? [
                                    {
                                      label: 'Delete Record',
                                      icon: <Trash2 className="h-4 w-4 text-rose-500" />,
                                      variant: 'danger' as const,
                                      onClick: () => {
                                        if (item.rtoRecord?.id) {
                                          toast.info(
                                            'This Sold Vehicle was transferred to RTO Work. Delete it from the RTO Work section first.',
                                          );
                                          return;
                                        }
                                        setDeletingRecordId(item.id);
                                      },
                                    },
                                  ]
                                : []),
                              ...(item.isLocked
                                ? [
                                    {
                                      label: 'Locked · Finalized Deal',
                                      icon: <LockKeyhole className="h-4 w-4 text-slate-500" />,
                                      onClick: () => router.push(`${accountBasePath}/${item.id}`),
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
                  onChange={(e) => {
                    setRowsPerPage(Number(e.target.value));
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
            {currentRecords.map((item) => {
              const statusInfo = DEAL_STATUS_CONFIG[item.dealStatus] || DEAL_STATUS_CONFIG['OPEN'];
              const StatusIcon = statusInfo.icon;
              const gst = recordGst(item);
              const isCopied = copiedKey === `plate-${item.id}`;

              return (
                <div
                  key={item.id}
                  onClick={() => router.push(`${accountBasePath}/${item.id}`)}
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
                          {item.vehicleNumber || 'UNREGISTERED'}
                        </span>
                        {item.vehicleNumber && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              copyText(item.vehicleNumber, `plate-${item.id}`);
                            }}
                            className="border-l border-slate-200 px-1.5 py-0.5 text-slate-400 hover:text-slate-800"
                          >
                            {isCopied ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
                          </button>
                        )}
                      </div>

                      <div className="flex items-center gap-1">
                        <span
                          className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold ${statusInfo.bg} ${statusInfo.text} ${statusInfo.border}`}
                        >
                          <StatusIcon className="h-3 w-3" />
                          <span>{statusInfo.shortLabel || statusInfo.label}</span>
                        </span>
                        {item.isLocked && (
                          <span className="rounded bg-slate-100 p-1 text-slate-600" title="Locked deal">
                            <LockKeyhole className="h-3 w-3" />
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Machine Details */}
                    <div className="mt-3">
                      <h4 className="text-sm font-extrabold text-slate-900 group-hover:text-amber-800 transition-colors">
                        {item.brandName ? `${item.brandName} ` : ''}
                        {item.vehicleModel}
                      </h4>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {item.vehicleType || 'Commercial Equipment'} • Sold: {formatDate(item.purchaserDate || item.sellDate)}
                      </p>
                    </div>

                    {/* Stakeholders Info Grid */}
                    <div className="mt-3 space-y-2 rounded-xl bg-slate-50/70 p-2.5 border border-slate-100 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Buyer</span>
                        <div className="text-right">
                          <p className="font-bold text-slate-900 truncate max-w-[150px]">{item.purchaserName}</p>
                          {phoneLink(item.purchaserNumber)}
                        </div>
                      </div>

                      <div className="flex items-center justify-between border-t border-slate-100/80 pt-1.5">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Seller</span>
                        <div className="text-right">
                          <p className="font-bold text-slate-900 truncate max-w-[150px]">{item.sellerName}</p>
                          {phoneLink(item.sellerNumber)}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Card Bottom: Financials & Action Buttons */}
                  <div className="mt-3 border-t border-slate-100 pt-3">
                    <div className="flex items-baseline justify-between mb-2">
                      <div>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Sell Price</span>
                        <p className="text-xs font-black text-emerald-800">{formatCurrency(item.sellAmount)}</p>
                      </div>
                      <div className="text-right">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Net Profit</span>
                        <p
                          className={`text-xs font-black ${
                            gst.netProfitAfterGst >= 0 ? 'text-amber-800' : 'text-rose-600'
                          }`}
                        >
                          {formatCurrency(gst.netProfitAfterGst)}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-2 border-t border-slate-50 pt-2">
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-700 group-hover:text-amber-700">
                        <span>View Details</span>
                        <ExternalLink className="h-3 w-3" />
                      </span>

                      {canUpdateSellAccounts && !item.isLocked && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            openEdit(item);
                          }}
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-bold text-slate-700 hover:bg-slate-100"
                        >
                          <Pencil className="h-3 w-3" />
                          <span>Edit</span>
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

      {/* Delete Confirmation Modal */}
      {deletingRecordId && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3 text-rose-600">
              <div className="p-3 bg-rose-50 rounded-xl">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-extrabold text-slate-900">Delete Sold Vehicle Record?</h3>
                <p className="text-xs text-slate-500 font-medium">Record ID: {deletingRecordId}</p>
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Are you sure you want to delete this commercial transaction record? This action will permanently remove
              financial records and connected documents.
            </p>

            <div className="pt-2 flex items-center justify-end gap-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setDeletingRecordId(null)}
                className="px-4 py-2 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteConfirm}
                className="px-5 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl transition-colors shadow-sm"
              >
                Confirm Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
