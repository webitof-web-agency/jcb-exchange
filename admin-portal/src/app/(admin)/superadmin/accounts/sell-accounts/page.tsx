'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  Wallet, Search, Eye, Plus, Edit2, Trash2, X, Car, Phone,
  AlertTriangle, ChevronLeft, ChevronRight, MoreVertical, Download, LockKeyhole, ClipboardCheck, Receipt,
} from 'lucide-react';
import api from '@/lib/api';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { getAccountCreatePermissions, getAccountDeletePermissions, getAccountExportPermission, getAccountUpdatePermissions } from '@/lib/accountsPermissions';
import { buildPaginationItems } from '@/lib/paginationUtils';
import { hasAnyPermission } from '@/lib/permissionUtils';
import { downloadTableFile } from '@/lib/tabularExport';
import SearchableSelect from '@/components/ui/SearchableSelect';
import BrandLoader from '@/components/ui/BrandLoader';
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

const recordGst = (record: SellAccountRecord) => calculateSellAccountGst({
  sellAmount: record.sellAmount,
  purchaseAmount: record.purchaseAmount,
  expenses: record.expenses,
  sellerState: record.sellerState,
  purchaserState: record.purchaserState,
});

export default function SellAccountsPage() {
  const [records, setRecords] = useState<SellAccountRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [vehicleTypeFilter, setVehicleTypeFilter] = useState<string>('ALL');
  const [categories, setCategories] = useState<{ id: string, name: string }[]>([]);
  const { t } = useTranslation();

  useEffect(() => {
    api.get('/master/categories')
      .then((response) => setCategories(response.data.data || []))
      .catch((err) => console.error('Failed to load sold vehicle categories', err));
  }, []);

  const [deletingRecordId, setDeletingRecordId] = useState<string | null>(null);
  const [actionMenuId, setActionMenuId] = useState<string | null>(null);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);

  useEffect(() => {
    const handleClickOutside = () => setActionMenuId(null);
    window.addEventListener('click', handleClickOutside);
    return () => window.removeEventListener('click', handleClickOutside);
  }, []);

  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentUser = useAuthStore((state) => state.user);
  const userPermissions = currentUser?.permissions || [];
  const canManageAccounts = currentUser?.role === 'SUPER_ADMIN' || currentUser?.role === 'ADMIN';
  const canCreateSellAccounts = canManageAccounts || hasAnyPermission(userPermissions, getAccountCreatePermissions('sell-accounts'));
  const canUpdateSellAccounts = canManageAccounts || hasAnyPermission(userPermissions, getAccountUpdatePermissions('sell-accounts'));
  const canDeleteSellAccounts = canManageAccounts || hasAnyPermission(userPermissions, getAccountDeletePermissions('sell-accounts'));
  const canExportSellAccounts = canManageAccounts || hasAnyPermission(userPermissions, [getAccountExportPermission('sell-accounts')]);
  const accountBasePath = pathname.startsWith('/employee')
    ? '/employee/accounts/sell-accounts'
    : pathname.startsWith('/admin')
      ? '/admin/accounts/sell-accounts'
      : '/superadmin/accounts/sell-accounts';
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [highlightedRecordId, setHighlightedRecordId] = useState<string | null>(null);

  // Older deep links (?listingId= from Listings, ?editId= from the detail page) now open the form page.
  useEffect(() => {
    const listingId = searchParams.get('listingId')?.trim();
    const editId = searchParams.get('editId')?.trim();
    if (listingId) router.replace(`${accountBasePath}/new?listingId=${encodeURIComponent(listingId)}`);
    else if (editId) router.replace(`${accountBasePath}/${encodeURIComponent(editId)}/edit`);
  }, [accountBasePath, router, searchParams]);

  useEffect(() => {
    let cancelled = false;
    // v2 intentionally re-runs the legacy recovery once. The previous v1
    // migration could already be marked before the API-backed list was
    // introduced, after which a cache containing only the new DB record hid
    // the older local records permanently.
    const legacySeedMigrationKey = 'jcb_sell_accounts_legacy_seed_migrated_v2';
    const readLocalRecords = () => {
      const legacyRecords = INITIAL_MOCK_RECORDS.map((record) => normalizeSellAccountRecord(record as StoredSellAccountRecord));
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

  const openEdit = (record: SellAccountRecord) => {
    if (record.isLocked) {
      toast.info('This record is locked and can only be viewed.');
      return;
    }
    router.push(`${accountBasePath}/${encodeURIComponent(record.id)}/edit`);
  };

  const getSellAccountApiError = (error: unknown, fallback: string) => {
    const response = (error as { response?: { status?: number; data?: { error?: unknown; message?: unknown } } })?.response;
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
    const documents = recordToDelete ? Object.values(normalizeSellAccountDocuments(recordToDelete) as SellAccountDocuments) : [];
    const urls = [...new Set(documents.map((document) => document?.fileUrl).filter(Boolean))] as string[];
    await Promise.allSettled(urls.map((fileUrl) => deleteSecureFileFromServer(fileUrl)));
    setRecords(removeSellAccountRecord(records, deletingRecordId));
    setDeletingRecordId(null);
  };

  const filteredRecords = useMemo(() => {
    return records.filter((item) => {
      const q = searchTerm.toLowerCase();
      const matchesSearch =
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

  const exportColumns = useMemo(() => [
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
    { header: 'Broker', value: (record: SellAccountRecord) => [record.brokerName, record.brokerNumber].filter(Boolean).join(' / ') },
    { header: 'Sale Type', value: (record: SellAccountRecord) => record.saleType || 'SELL' },
    { header: 'Customer Name', value: (record: SellAccountRecord) => record.purchaserName },
    { header: 'Customer Number', value: (record: SellAccountRecord) => record.purchaserNumber },
    { header: 'Sell Date', value: (record: SellAccountRecord) => formatDate(record.purchaserDate || record.sellDate) },
    { header: 'Customer City', value: (record: SellAccountRecord) => record.purchaserCity || '' },
    { header: 'Customer State', value: (record: SellAccountRecord) => record.purchaserState || '' },
    { header: 'Purchase Amount', value: (record: SellAccountRecord) => record.purchaseAmount },
    { header: 'Purchase Exchange Value', value: (record: SellAccountRecord) => record.purchaseType === 'EXCHANGE' ? record.purchaseExchangeValue || 0 : 0 },
    { header: 'Sell Amount', value: (record: SellAccountRecord) => record.sellAmount },
    { header: 'Sale Exchange Value', value: (record: SellAccountRecord) => record.saleType === 'EXCHANGE' ? record.saleExchangeValue || 0 : 0 },
    { header: 'Margin (incl. GST)', value: (record: SellAccountRecord) => recordGst(record).marginAmount },
    { header: 'Taxable Margin', value: (record: SellAccountRecord) => recordGst(record).taxableAmount },
    { header: 'CGST', value: (record: SellAccountRecord) => recordGst(record).cgst },
    { header: 'SGST', value: (record: SellAccountRecord) => recordGst(record).sgst },
    { header: 'IGST', value: (record: SellAccountRecord) => recordGst(record).igst },
    { header: 'Expenses', value: (record: SellAccountRecord) => record.expenses },
    { header: 'Final Profit', value: (record: SellAccountRecord) => recordGst(record).netProfitAfterGst },
    { header: 'Customer Balance', value: (record: SellAccountRecord) => record.balanceAmount },
    { header: 'Transfer Details', value: (record: SellAccountRecord) => record.transferDetails },
    { header: 'Deal Status', value: (record: SellAccountRecord) => DEAL_STATUS_CONFIG[record.dealStatus]?.label || record.dealStatus },
    { header: 'Remark', value: (record: SellAccountRecord) => record.noteSheet },
    { header: 'Created At', value: (record: SellAccountRecord) => formatDate(record.createdAt) },
  ], []);

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

  const paginationItems = useMemo(
    () => buildPaginationItems(currentPage, totalPages),
    [currentPage, totalPages]
  );

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-gray-100 bg-white shadow-sm">
        <div className="flex flex-col gap-4 border-b border-gray-100 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full sm:max-w-md">
            <input
              type="text"
              placeholder={t('sellAccounts.searchPlaceholder', 'Search by owner, seller, purchaser, registration no, model...')}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full rounded-lg border border-gray-200 bg-white px-4 py-2 pl-10 text-sm font-medium text-gray-700 shadow-sm outline-none transition focus:border-[#FFC107] focus:ring-1 focus:ring-[#FFC107]"
            />
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
              >
                <X size={14} />
              </button>
            )}
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
            <SearchableSelect
              options={[
                { id: 'ALL', name: 'All Statuses' },
                ...Object.keys(DEAL_STATUS_CONFIG).map((id) => ({
                  id,
                  name: DEAL_STATUS_CONFIG[id as SellAccountDealStatus].label,
                }))
              ]}
              value={statusFilter}
              displayValue={statusFilter === 'ALL' ? 'All Statuses' : DEAL_STATUS_CONFIG[statusFilter as SellAccountDealStatus]?.label || statusFilter}
              onChange={(opt) => setStatusFilter(String(opt.id))}
              searchable={false}
              className="w-full sm:w-40 bg-white"
            />

            <SearchableSelect
              options={[
                { id: 'ALL', name: 'All Categories' },
                ...categories.map((cat) => ({ id: cat.name, name: cat.name }))
              ]}
              value={vehicleTypeFilter}
              displayValue={vehicleTypeFilter === 'ALL' ? 'All Categories' : vehicleTypeFilter}
              onChange={(opt) => setVehicleTypeFilter(String(opt.id))}
              searchable={false}
              className="w-full sm:w-48 bg-white"
            />

            {canExportSellAccounts ? <div className="relative">
              <button
                type="button"
                onClick={() => setExportMenuOpen((current) => !current)}
                disabled={filteredRecords.length === 0}
                className="flex w-full sm:w-auto items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 shadow-sm disabled:cursor-not-allowed disabled:opacity-50"
                title="Export records"
              >
                <Download size={18} />
                Export
              </button>
              {exportMenuOpen && (
                <div className="absolute right-0 top-full z-40 mt-2 w-44 overflow-hidden rounded-xl border border-gray-200 bg-white py-1 shadow-xl">
                  <button type="button" onClick={() => exportRecords('csv')} className="block w-full px-4 py-2.5 text-left text-xs font-semibold text-gray-700 transition hover:bg-gray-50">CSV file</button>
                  <button type="button" onClick={() => exportRecords('xls')} className="block w-full border-t border-gray-100 px-4 py-2.5 text-left text-xs font-semibold text-gray-700 transition hover:bg-gray-50">Excel file</button>
                </div>
              )}
            </div> : null}

            {canCreateSellAccounts ? <button
              onClick={() => router.push(`${accountBasePath}/new`)}
              className="flex w-full sm:w-auto items-center justify-center gap-2 rounded-lg bg-[#FFC107] px-4 py-2 text-sm font-semibold text-black transition hover:bg-[#E5AD06] shadow-sm"
            >
              <Plus size={18} />
              Add
            </button> : null}
          </div>
        </div>

        <div className="overflow-x-auto min-h-[360px] [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
          <table className="w-full min-w-[1000px] text-left text-sm">
            <thead className="bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-500 uppercase tracking-wider">
              <tr>
                <th className="px-5 py-4">Vehicle, Brand & Model</th>
                <th className="px-5 py-4">Owner Info</th>
                <th className="px-5 py-4">Purchased From</th>
                <th className="px-5 py-4">Sold To</th>
                <th className="px-5 py-4">Financials</th>
                <th className="px-5 py-4">Deal Status</th>
                <th className="px-5 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr><td colSpan={7}><BrandLoader variant="section" size="sm" bg="light" text="Loading sold vehicles..." /></td></tr>
              ) : currentRecords.length > 0 ? (
                currentRecords.map((item, idx) => {
                  const statusInfo = DEAL_STATUS_CONFIG[item.dealStatus] || DEAL_STATUS_CONFIG['OPEN'];
                  const StatusIcon = statusInfo.icon;
                  const isNearBottom = currentRecords.length > 3 && idx >= currentRecords.length - 2;
                  const rtoProgress = summarizeTransferTasks((item.rtoRecord?.taskStatuses || []).map((status) => ({ status })));
                  const gst = recordGst(item);
                  return (
                    <tr
                      id={`sell-account-row-${encodeURIComponent(item.id)}`}
                      key={item.id}
                      onClick={() => router.push(`${accountBasePath}/${item.id}`)}
                      className={`cursor-pointer transition-colors hover:bg-gray-50/80 ${highlightedRecordId === item.id ? 'bg-amber-50/90 shadow-[inset_4px_0_0_#f59e0b] animate-pulse' : ''}`}
                    >
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-2">
                          <Car className="w-4 h-4 text-amber-600 shrink-0" />
                          <div>
                            <p className="font-bold text-gray-900">{item.vehicleNumber || '—'}</p>
                            <p className="text-xs text-gray-500">{item.brandName ? `${item.brandName} · ` : ''}{item.vehicleModel}</p>
                            <span className="inline-block mt-0.5 text-[10px] font-medium bg-gray-100 px-1.5 py-0.5 rounded text-gray-600">
                              {item.vehicleType || 'Uncategorised'}
                            </span>
                          </div>
                        </div>
                      </td>

                      <td className="px-5 py-4">
                        <p className="font-semibold text-gray-900">{item.ownerName}</p>
                        <a href={`tel:${item.ownerNumber}`} onClick={(e) => e.stopPropagation()} className="text-xs text-blue-600 hover:underline flex items-center gap-1 mt-0.5">
                          <Phone className="w-3 h-3 text-blue-500" />
                          {item.ownerNumber}
                        </a>
                      </td>

                      <td className="px-5 py-4">
                        <p className="font-semibold text-gray-900">{item.sellerName}</p>
                        <a href={`tel:${item.sellerNumber}`} onClick={(e) => e.stopPropagation()} className="text-xs text-blue-600 hover:underline flex items-center gap-1 mt-0.5">
                          <Phone className="w-3 h-3 text-blue-500" />
                          {item.sellerNumber}
                        </a>
                        {item.sourceType ? <span className="mt-0.5 inline-block rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">{getSourceTypeLabel(item.sourceType)}{item.purchaseType === 'EXCHANGE' ? ' · Exchange' : ''}</span> : null}
                      </td>

                      <td className="px-5 py-4">
                        <p className="font-semibold text-gray-900">{item.purchaserName}</p>
                        <a href={`tel:${item.purchaserNumber}`} onClick={(e) => e.stopPropagation()} className="text-xs text-blue-600 hover:underline flex items-center gap-1 mt-0.5">
                          <Phone className="w-3 h-3 text-blue-500" />
                          {item.purchaserNumber}
                        </a>
                        {item.saleType === 'EXCHANGE' ? <span className="mt-0.5 inline-block rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-semibold text-blue-800">Exchange</span> : null}
                      </td>

                      <td className="px-5 py-4">
                        <p className="text-xs text-gray-500">
                          Buy: <span className="font-medium text-gray-900">₹{item.purchaseAmount.toLocaleString('en-IN')}</span>
                        </p>
                        <p className="text-xs font-semibold text-emerald-700 mt-0.5">
                          Sell: ₹{item.sellAmount.toLocaleString('en-IN')}
                        </p>
                        <p className="text-[11px] text-gray-400 mt-0.5">
                          Profit: <span className={gst.netProfitAfterGst >= 0 ? 'font-semibold text-gray-700' : 'font-semibold text-rose-600'}>₹{gst.netProfitAfterGst.toLocaleString('en-IN')}</span> · {formatDate(item.purchaserDate || item.sellDate)}
                        </p>
                      </td>

                      <td className="px-5 py-4 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border whitespace-nowrap shrink-0 ${statusInfo.bg} ${statusInfo.text} ${statusInfo.border}`}
                          title={statusInfo.label}
                        >
                          <StatusIcon className="w-3.5 h-3.5" />
                          {statusInfo.shortLabel || statusInfo.label}
                        </span>
                        <div className="mt-1 flex items-center gap-2 text-[10px] font-semibold text-gray-500">
                          {rtoProgress.total ? <span className="inline-flex items-center gap-1"><ClipboardCheck className="h-3 w-3" />RTO {rtoProgress.done}/{rtoProgress.total}</span> : null}
                          {item.invoiceNumber ? <span className="inline-flex items-center gap-1 text-emerald-700"><Receipt className="h-3 w-3" />Invoiced</span> : null}
                          {item.isDraft ? <span className="text-amber-700">Draft</span> : null}
                        </div>
                      </td>

                      <td className="px-5 py-4 text-right">
                        <div className="relative inline-block text-left" onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            onClick={() => setActionMenuId(actionMenuId === item.id ? null : item.id)}
                            className={`rounded-full border p-2 transition-colors hover:bg-gray-50 ${actionMenuId === item.id ? 'border-[#FFC107] bg-amber-50 text-gray-900' : 'border-gray-200 text-gray-500'}`}
                            title="Actions"
                          >
                            <MoreVertical className="w-4 h-4" />
                          </button>
                          {actionMenuId === item.id && (
                            <div className={`absolute right-0 ${isNearBottom ? 'bottom-full mb-2' : 'top-full mt-2'} z-50 w-48 overflow-hidden rounded-2xl border border-gray-200 bg-white py-1 shadow-2xl text-left`}>
                              <button
                                type="button"
                                onClick={() => {
                                  setActionMenuId(null);
                                  router.push(`${accountBasePath}/${item.id}`);
                                }}
                                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-100 transition-colors"
                              >
                                {item.isLocked ? <LockKeyhole className="w-3.5 h-3.5 text-slate-500" /> : <Eye className="w-3.5 h-3.5 text-gray-500" />}
                                View
                              </button>
                              {canUpdateSellAccounts && !item.isLocked ? <button
                                type="button"
                                onClick={() => {
                                  setActionMenuId(null);
                                  openEdit(item);
                                }}
                                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold text-blue-600 hover:bg-blue-50 transition-colors"
                              >
                                <Edit2 className="w-3.5 h-3.5 text-blue-500" />
                                Edit
                              </button> : null}
                              {canDeleteSellAccounts && !item.isLocked ? <button
                                type="button"
                                onClick={() => {
                                  setActionMenuId(null);
                                  if (item.rtoRecord?.id) {
                                    toast.info('This Sold Vehicle was transferred to RTO Work. Delete it from the RTO Work section first.');
                                    return;
                                  }
                                  setDeletingRecordId(item.id);
                                }}
                                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-50 transition-colors"
                              >
                                <Trash2 className="w-3.5 h-3.5 text-rose-500" />
                                Delete
                              </button> : null}
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-gray-500">
                    <Wallet className="w-10 h-10 text-gray-300 mx-auto mb-2" />
                    <p className="font-medium text-gray-700">No sold vehicle records found matching your filters.</p>
                    <p className="text-xs text-gray-400 mt-1">Click &quot;Add&quot; to add a new record.</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {filteredRecords.length > 0 && (
          <div className="flex flex-col items-center justify-between gap-4 border-t border-gray-100 p-4 sm:flex-row">
            <div className="flex items-center gap-3 text-sm text-gray-600">
              <span>
                Showing <span className="font-bold text-gray-900">{(currentPage - 1) * rowsPerPage + 1}</span> to{' '}
                <span className="font-bold text-gray-900">{Math.min(currentPage * rowsPerPage, filteredRecords.length)}</span> of{' '}
                <span className="font-bold text-gray-900">{filteredRecords.length}</span> records
              </span>
              <div className="flex items-center gap-2">
                <span className="text-gray-400">|</span>
                <span>Rows per page:</span>
                <select
                  value={rowsPerPage}
                  onChange={(e) => {
                    setRowsPerPage(Number(e.target.value));
                    setCurrentPage(1);
                  }}
                  className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-sm font-medium text-gray-700 shadow-sm outline-none transition focus:border-[#FFC107] focus:ring-1 focus:ring-[#FFC107]"
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
                className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 shadow-sm transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ChevronLeft className="h-4 w-4" />
                <span className="hidden sm:inline">Previous</span>
              </button>

              <div className="flex items-center gap-1 px-1">
                {paginationItems.map((item, index) =>
                  typeof item === 'number' ? (
                    <button
                      key={item}
                      type="button"
                      onClick={() => setCurrentPage(item)}
                      className={`h-8 w-8 rounded-lg text-xs font-bold transition ${currentPage === item ? 'bg-[#FFC107] text-black shadow-sm' : 'text-gray-600 hover:bg-gray-100'
                        }`}
                    >
                      {item}
                    </button>
                  ) : (
                    <span key={`ellipsis-${index}`} className="px-1 text-xs font-bold text-gray-400">
                      ...
                    </span>
                  )
                )}
              </div>

              <button
                type="button"
                onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
                disabled={currentPage === totalPages || totalPages === 1}
                className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 shadow-sm transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <span className="hidden sm:inline">Next</span>
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {deletingRecordId && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-gray-200 space-y-4 animate-in fade-in zoom-in duration-200">
            <div className="flex items-center gap-3 text-rose-600">
              <div className="p-3 bg-rose-50 rounded-xl">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-gray-900">Delete Sold Vehicle Record?</h3>
                <p className="text-xs text-gray-500">Record ID: {deletingRecordId}</p>
              </div>
            </div>

            <p className="text-sm text-gray-600">
              Are you sure you want to delete this record? This action will permanently remove it from your records.
            </p>

            <div className="pt-2 flex items-center justify-end gap-3 border-t border-gray-100">
              <button
                onClick={() => setDeletingRecordId(null)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteConfirm}
                className="px-5 py-2 text-sm font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl transition-colors shadow-md shadow-rose-600/20"
              >
                Yes, Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
