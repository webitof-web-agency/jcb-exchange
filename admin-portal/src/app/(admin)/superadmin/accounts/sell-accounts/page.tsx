'use client';

import { ComponentType, useState, useEffect, useMemo } from 'react';
import {
  Wallet, Search, CheckCircle2, Clock, DollarSign, Eye, Plus, Edit2, Trash2, X, Car, User, Phone,
  FileText, TrendingUp, AlertTriangle, ChevronLeft, ChevronRight, MoreVertical, Download
} from 'lucide-react';
import api from '@/lib/api';
import { usePathname, useRouter } from 'next/navigation';
import { getAccountCreatePermissions, getAccountDeletePermissions, getAccountExportPermission, getAccountUpdatePermissions } from '@/lib/accountsPermissions';
import { buildPaginationItems } from '@/lib/paginationUtils';
import { hasAnyPermission } from '@/lib/permissionUtils';
import { downloadTableFile } from '@/lib/tabularExport';
import SearchableSelect from '@/components/ui/SearchableSelect';
import BrandLoader from '@/components/ui/BrandLoader';
import { useAuthStore } from '@/store/authStore';
import { FileUploadField } from '@/components/upload/FileUploadField';
import { deleteSecureFileFromServer, type UploadedFileResult } from '@/lib/fileUpload';
import { createEmptySellAccountDocuments, normalizeSellAccountDocuments } from '@/lib/sellAccountDocuments.mjs';

const formatDate = (dateStr: string) => {
  if (!dateStr) return '';
  const parts = dateStr.split('T')[0].split('-');
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return dateStr;
};

export type SellAccountDocument = Pick<UploadedFileResult, 'access' | 'fileName' | 'originalName' | 'mimeType' | 'size' | 'fileUrl' | 'absoluteUrl'>;
export type SellAccountDocuments = {
  purchaseDeed: SellAccountDocument | null;
  purchaseAadhaarCard: SellAccountDocument | null;
  purchasePanCard: SellAccountDocument | null;
  purchaseGstCertificate: SellAccountDocument | null;
  sellDeed: SellAccountDocument | null;
  sellAadhaarCard: SellAccountDocument | null;
  sellPanCard: SellAccountDocument | null;
  sellGstCertificate: SellAccountDocument | null;
};
type SellAccountDocumentKey = keyof SellAccountDocuments;

export interface SellAccountRecord {
  id: string;
  ownerName: string;
  ownerNumber: string;
  vehicleNumber: string;
  sellDate: string;
  vehicleType: string;
  vehicleModel: string;
  sellerName: string;
  sellerNumber: string;
  purchaserName: string;
  purchaserNumber: string;
  purchaseAmount: number;
  sellAmount: number;
  transferDetails: string;
  balanceAmount: number;
  expenses: number;
  netProfit: number;
  dealStatus: 'OPEN' | 'IN_PROGRESS' | 'CLOSE';
  noteSheet: string;
  purchaseDeedNumber?: string;
  sellDeedNumber?: string;
  documents?: SellAccountDocuments;
  createdAt: string;
}

const INITIAL_MOCK_RECORDS: SellAccountRecord[] = [
  {
    id: 'SA-2026-001',
    ownerName: 'Ramesh Patel Construction',
    ownerNumber: '9876543210',
    vehicleNumber: 'MH-12-AB-4592',
    sellDate: '2026-09-10',
    vehicleType: 'Backhoe Loader',
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
    netProfit: 305000, // 2550000 - 2200000 - 45000
    dealStatus: 'CLOSE',
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
    netProfit: 420000, // 4600000 - 4100000 - 80000
    dealStatus: 'IN_PROGRESS',
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

type StoredSellAccountRecord = Omit<SellAccountRecord, 'dealStatus'> & { dealStatus: SellAccountRecord['dealStatus'] | 'COMPLETED' | 'CANCELLED' | 'PENDING' };
type ExportFormat = 'csv' | 'xls';

const normalizeSellAccountRecord = (record: StoredSellAccountRecord): SellAccountRecord => ({
  ...record,
  documents: normalizeSellAccountDocuments(record) as SellAccountDocuments,
  dealStatus: record.dealStatus === 'COMPLETED' || record.dealStatus === 'CANCELLED'
    ? 'CLOSE'
    : record.dealStatus === 'PENDING'
      ? 'OPEN'
      : record.dealStatus,
});

const DEAL_STATUS_CONFIG: Record<SellAccountRecord['dealStatus'], { label: string; bg: string; text: string; border: string; icon: ComponentType<{ className?: string }> }> = {
  OPEN: { label: 'Open', bg: 'bg-amber-50', text: 'text-amber-800', border: 'border-amber-200', icon: AlertTriangle },
  IN_PROGRESS: { label: 'In Progress', bg: 'bg-blue-50', text: 'text-blue-800', border: 'border-blue-200', icon: Clock },
  CLOSE: { label: 'Close', bg: 'bg-emerald-50', text: 'text-emerald-800', border: 'border-emerald-200', icon: CheckCircle2 },
};

// Input Sanitization Helpers
const sanitizePhoneNumber = (val: string) => val.replace(/\D/g, '').slice(0, 10);
const sanitizeVehicleNumber = (val: string) => val.toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 15);
const initialFormState: Omit<SellAccountRecord, 'id' | 'createdAt'> = {
  ownerName: '',
  ownerNumber: '',
  vehicleNumber: '',
  sellDate: new Date().toISOString().split('T')[0],
  vehicleType: 'Backhoe Loader',
  vehicleModel: '',
  sellerName: '',
  sellerNumber: '',
  purchaserName: '',
  purchaserNumber: '',
  purchaseAmount: 0,
  sellAmount: 0,
  transferDetails: '',
  balanceAmount: 0,
  expenses: 0,
  netProfit: 0,
  dealStatus: 'OPEN',
  noteSheet: '',
  documents: createEmptySellAccountDocuments() as SellAccountDocuments,
};

// Raw string state for number inputs so user can type 0
const initialRawInputs = {
  purchaseAmount: '',
  sellAmount: '',
  expenses: '',
  balanceAmount: '',
};

function SellAccountPdfField({
  label,
  document,
  onUploaded,
  onUploadStateChange,
}: {
  label: string;
  document?: SellAccountDocument | null;
  onUploaded: (file: UploadedFileResult) => void;
  onUploadStateChange: (uploading: boolean) => void;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-semibold text-gray-700">{label}</label>
      <FileUploadField
        accept="application/pdf,.pdf"
        pdfOnly
        visibility="secure"
        uploadedFileName={document?.originalName}
        uploadedFileUrl={document?.fileUrl}
        onUploaded={onUploaded}
        onUploadStateChange={onUploadStateChange}
        helperText="PDF only, maximum 3MB."
      />
    </div>
  );
}

export default function SellAccountsPage() {
  const [records, setRecords] = useState<SellAccountRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [vehicleTypeFilter, setVehicleTypeFilter] = useState<string>('ALL');
  const [categories, setCategories] = useState<{id: string, name: string}[]>([]);

  useEffect(() => {
    const fetchCategories = async () => {
      try {
        const res = await api.get('/master/categories');
        setCategories(res.data.data || []);
      } catch (err) {
        console.error('Failed to load categories', err);
      }
    };
    fetchCategories();
  }, []);

  // Modals state
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<SellAccountRecord | null>(null);
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

  // Form State
  const [formData, setFormData] = useState(initialFormState);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  // Raw string inputs for number fields — allows typing "0" without it being swallowed
  const [rawInputs, setRawInputs] = useState(initialRawInputs);
  const [pendingReplacedDocuments, setPendingReplacedDocuments] = useState<Partial<Record<SellAccountDocumentKey, SellAccountDocument[]>>>({});
  const [activeDocumentUploads, setActiveDocumentUploads] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const loadRecords = () => {
      let nextRecords = INITIAL_MOCK_RECORDS.map((record) => normalizeSellAccountRecord(record as StoredSellAccountRecord));
      const saved = localStorage.getItem('jcb_sell_accounts_records');
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          nextRecords = (parsed as StoredSellAccountRecord[]).map(normalizeSellAccountRecord);
        } catch {
          nextRecords = INITIAL_MOCK_RECORDS.map((record) => normalizeSellAccountRecord(record as StoredSellAccountRecord));
        }
      }

      if (!cancelled) {
        setRecords(nextRecords);
        setLoading(false);
      }
    };

    loadRecords();
    return () => {
      cancelled = true;
    };
  }, []);

  // Save to LocalStorage
  useEffect(() => {
    if (typeof window !== 'undefined' && !loading) {
      localStorage.setItem('jcb_sell_accounts_records', JSON.stringify(records));
    }
  }, [loading, records]);

  // Handle Form Change with Sanitization & Auto-Calculation
  const handleInputChange = (field: keyof typeof initialFormState, rawValue: string | number | SellAccountRecord['dealStatus']) => {
    let value = rawValue;

    if (field === 'ownerNumber' || field === 'sellerNumber' || field === 'purchaserNumber') {
      value = sanitizePhoneNumber(String(rawValue));
    } else if (field === 'vehicleNumber') {
      value = sanitizeVehicleNumber(String(rawValue));
    } else if (field === 'purchaseAmount' || field === 'sellAmount' || field === 'expenses' || field === 'balanceAmount') {
      // Keep raw string so user can type "0" — parse numeric for formData
      const rawStr = String(rawValue).replace(/[^0-9.]/g, '');
      setRawInputs((prev) => ({ ...prev, [field]: rawStr }));
      value = rawStr === '' || rawStr === '.' ? 0 : parseFloat(rawStr) || 0;
    }

    setFormData((prev) => {
      const updated = { ...prev, [field]: value };

      // Auto-calculate Net Profit whenever Purchase Amount, Sell Amount, or Expenses change
      if (field === 'purchaseAmount' || field === 'sellAmount' || field === 'expenses') {
        const purchase = Number(updated.purchaseAmount) || 0;
        const sell = Number(updated.sellAmount) || 0;
        const exp = Number(updated.expenses) || 0;
        updated.netProfit = sell - purchase - exp;
      }

      return updated;
    });

    if (formErrors[field]) {
      setFormErrors((prev) => ({ ...prev, [field]: '' }));
    }
  };

  // Sync rawInputs when form is populated (create/edit open)
  const syncRawInputs = (data: typeof initialFormState) => {
    setRawInputs({
      purchaseAmount: String(data.purchaseAmount),
      sellAmount: String(data.sellAmount),
      expenses: String(data.expenses),
      balanceAmount: String(data.balanceAmount),
    });
  };

  const getDocuments = (data: Pick<SellAccountRecord, 'documents'>): SellAccountDocuments =>
    normalizeSellAccountDocuments(data) as SellAccountDocuments;

  const deleteDocumentFiles = async (documents: Array<SellAccountDocument | null | undefined>) => {
    const uniqueUrls = [...new Set(documents.map((document) => document?.fileUrl).filter(Boolean))] as string[];
    await Promise.allSettled(uniqueUrls.map((fileUrl) => deleteSecureFileFromServer(fileUrl)));
  };

  const handleDocumentUploaded = (key: SellAccountDocumentKey, file: UploadedFileResult) => {
    const previous = getDocuments(formData)[key];
    if (editingRecord && previous && previous.fileUrl !== file.fileUrl) {
      setPendingReplacedDocuments((current) => ({
        ...current,
        [key]: [...(current[key] || []), previous],
      }));
    }

    setFormData((current) => ({
      ...current,
      documents: {
        ...getDocuments(current),
        [key]: file,
      },
    }));
  };

  const handleDocumentUploadStateChange = (uploading: boolean) => {
    setActiveDocumentUploads((count) => Math.max(0, count + (uploading ? 1 : -1)));
  };

  const closeForm = async () => {
    const currentDocuments = getDocuments(formData);
    const originalDocuments = editingRecord ? getDocuments(editingRecord) : null;
    const uploadedDuringSession = Object.values(currentDocuments).filter((document) => {
      if (!document) return false;
      const original = originalDocuments && Object.values(originalDocuments).find((item) => item?.fileUrl === document.fileUrl);
      return !original;
    });

    await deleteDocumentFiles(uploadedDuringSession);
    setIsCreateModalOpen(false);
    setEditingRecord(null);
    setPendingReplacedDocuments({});
  };

  // Validate Form
  const validateForm = () => {
    const errors: Record<string, string> = {};
    if (!formData.ownerName.trim()) errors.ownerName = 'Owner Name is required';
    if (!formData.ownerNumber || formData.ownerNumber.length < 10) errors.ownerNumber = 'Valid 10-digit phone required';
    if (!formData.vehicleNumber.trim()) errors.vehicleNumber = 'Vehicle Number is required';
    if (!formData.vehicleType.trim()) errors.vehicleType = 'Category is required';
    if (!formData.vehicleModel.trim()) errors.vehicleModel = 'Vehicle Model is required';
    if (!formData.sellDate.trim()) errors.sellDate = 'Sell Date is required';
    if (!formData.sellerName.trim()) errors.sellerName = 'Seller Name is required';
    if (!formData.sellerNumber || formData.sellerNumber.length < 10) errors.sellerNumber = 'Valid 10-digit phone required';
    if (!formData.purchaserName.trim()) errors.purchaserName = 'Purchaser Name is required';
    if (!formData.purchaserNumber || formData.purchaserNumber.length < 10) errors.purchaserNumber = 'Valid 10-digit phone required';
    if (formData.purchaseAmount <= 0) errors.purchaseAmount = 'Purchase amount must be greater than 0';
    if (formData.sellAmount <= 0) errors.sellAmount = 'Sell amount must be greater than 0';
    if (!formData.dealStatus) errors.dealStatus = 'Deal Status is required';
    if (!formData.transferDetails.trim()) errors.transferDetails = 'Transfer Details are required';
    if (!formData.noteSheet.trim()) errors.noteSheet = 'Remark is required';

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // Open Create Modal
  const openCreateModal = () => {
    if (!canCreateSellAccounts) return;
    setFormData(initialFormState);
    setFormErrors({});
    syncRawInputs(initialFormState);
    setPendingReplacedDocuments({});
    setActiveDocumentUploads(0);
    setIsCreateModalOpen(true);
  };

  // Open Edit Modal
  const openEditModal = (record: SellAccountRecord) => {
    if (!canUpdateSellAccounts) return;
    setEditingRecord(record);
    const fd = {
      ownerName: record.ownerName,
      ownerNumber: record.ownerNumber,
      vehicleNumber: record.vehicleNumber,
      sellDate: record.sellDate,
      vehicleType: record.vehicleType,
      vehicleModel: record.vehicleModel,
      sellerName: record.sellerName,
      sellerNumber: record.sellerNumber,
      purchaserName: record.purchaserName,
      purchaserNumber: record.purchaserNumber,
      purchaseAmount: record.purchaseAmount,
      sellAmount: record.sellAmount,
      transferDetails: record.transferDetails,
      balanceAmount: record.balanceAmount,
      expenses: record.expenses,
      netProfit: record.netProfit,
      dealStatus: record.dealStatus,
      noteSheet: record.noteSheet,
      purchaseDeedNumber: record.purchaseDeedNumber || '',
      sellDeedNumber: record.sellDeedNumber || '',
      documents: normalizeSellAccountDocuments(record) as SellAccountDocuments,
    };
    setFormData(fd);
    syncRawInputs(fd);
    setFormErrors({});
    setPendingReplacedDocuments({});
    setActiveDocumentUploads(0);
  };

  // Submit Create
  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canCreateSellAccounts) return;
    if (activeDocumentUploads > 0) {
      setFormErrors((current) => ({ ...current, documents: 'Please wait until all PDF uploads finish.' }));
      return;
    }
    if (!validateForm()) return;

    const newRecord: SellAccountRecord = {
      ...formData,
      id: `SA-2026-${String(records.length + 1).padStart(3, '0')}`,
      createdAt: new Date().toISOString(),
    };

    setRecords([newRecord, ...records]);
    setIsCreateModalOpen(false);
  };

  // Submit Edit
  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canUpdateSellAccounts) return;
    if (activeDocumentUploads > 0) {
      setFormErrors((current) => ({ ...current, documents: 'Please wait until all PDF uploads finish.' }));
      return;
    }
    if (!editingRecord || !validateForm()) return;

    const updatedRecords = records.map((rec) =>
      rec.id === editingRecord.id
        ? {
            ...rec,
            ...formData,
          }
        : rec
    );

    setRecords(updatedRecords);
    setEditingRecord(null);
    await deleteDocumentFiles(Object.values(pendingReplacedDocuments).flat());
    setPendingReplacedDocuments({});
  };

  // Confirm Delete
  const handleDeleteConfirm = async () => {
    if (!canDeleteSellAccounts) return;
    if (!deletingRecordId) return;
    const recordToDelete = records.find((record) => record.id === deletingRecordId);
    await deleteDocumentFiles(recordToDelete ? Object.values(getDocuments(recordToDelete)) : []);
    setRecords(records.filter((r) => r.id !== deletingRecordId));
    setDeletingRecordId(null);
  };

  // Filtered List
  const filteredRecords = useMemo(() => {
    return records.filter((item) => {
      const q = searchTerm.toLowerCase();
      const matchesSearch =
        item.ownerName.toLowerCase().includes(q) ||
        item.ownerNumber.includes(q) ||
        item.vehicleNumber.toLowerCase().includes(q) ||
        item.sellerName.toLowerCase().includes(q) ||
        item.sellerNumber.includes(q) ||
        item.purchaserName.toLowerCase().includes(q) ||
        item.purchaserNumber.includes(q) ||
        item.vehicleModel.toLowerCase().includes(q) ||
        item.id.toLowerCase().includes(q);

      const matchesStatus = statusFilter === 'ALL' || item.dealStatus === statusFilter;
      const matchesType = vehicleTypeFilter === 'ALL' || item.vehicleType === vehicleTypeFilter;

      return matchesSearch && matchesStatus && matchesType;
    });
  }, [records, searchTerm, statusFilter, vehicleTypeFilter]);

  const exportColumns = useMemo(() => [
    { header: 'Record ID', value: (record: SellAccountRecord) => record.id },
    { header: 'Owner Name', value: (record: SellAccountRecord) => record.ownerName },
    { header: 'Owner Number', value: (record: SellAccountRecord) => record.ownerNumber },
    { header: 'Vehicle Number', value: (record: SellAccountRecord) => record.vehicleNumber },
    { header: 'Sell Date', value: (record: SellAccountRecord) => formatDate(record.sellDate) },
    { header: 'Vehicle Type', value: (record: SellAccountRecord) => record.vehicleType },
    { header: 'Vehicle Model', value: (record: SellAccountRecord) => record.vehicleModel },
    { header: 'Seller Name', value: (record: SellAccountRecord) => record.sellerName },
    { header: 'Seller Number', value: (record: SellAccountRecord) => record.sellerNumber },
    { header: 'Purchaser Name', value: (record: SellAccountRecord) => record.purchaserName },
    { header: 'Purchaser Number', value: (record: SellAccountRecord) => record.purchaserNumber },
    { header: 'Purchase Amount', value: (record: SellAccountRecord) => record.purchaseAmount },
    { header: 'Sell Amount', value: (record: SellAccountRecord) => record.sellAmount },
    { header: 'Expenses', value: (record: SellAccountRecord) => record.expenses },
    { header: 'Balance Amount', value: (record: SellAccountRecord) => record.balanceAmount },
    { header: 'Net Profit', value: (record: SellAccountRecord) => record.netProfit },
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
      fileName: `sell-accounts-${new Date().toISOString().slice(0, 10)}`,
      format,
    });
    setExportMenuOpen(false);
  };

  // Pagination Logic
  useEffect(() => {
    const resetTimer = window.setTimeout(() => setCurrentPage(1), 0);
    return () => window.clearTimeout(resetTimer);
  }, [searchTerm, statusFilter, vehicleTypeFilter, records]);

  const totalPages = Math.ceil(filteredRecords.length / rowsPerPage) || 1;
  const currentRecords = useMemo(() => {
    return filteredRecords.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage);
  }, [filteredRecords, currentPage, rowsPerPage]);

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
              placeholder="Search by owner, seller, purchaser, vehicle no, model..."
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
                { id: 'OPEN', name: 'Open' },
                { id: 'IN_PROGRESS', name: 'In Progress' },
                { id: 'CLOSE', name: 'Close' }
              ]}
              value={statusFilter}
              displayValue={statusFilter === 'ALL' ? 'All Statuses' : statusFilter === 'OPEN' ? 'Open' : statusFilter === 'IN_PROGRESS' ? 'In Progress' : 'Close'}
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
              onClick={openCreateModal}
              className="flex w-full sm:w-auto items-center justify-center gap-2 rounded-lg bg-[#FFC107] px-4 py-2 text-sm font-semibold text-black transition hover:bg-[#E5AD06] shadow-sm"
            >
              <Plus size={18} />
              Add
            </button> : null}
          </div>
        </div>

        <div className="overflow-x-auto min-h-[360px] [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
          <table className="w-full min-w-[950px] text-left text-sm">
            <thead className="bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-500 uppercase tracking-wider">
              <tr>
                <th className="px-5 py-4">Vehicle & Model</th>
                <th className="px-5 py-4">Owner Info</th>
                <th className="px-5 py-4">Seller Info</th>
                <th className="px-5 py-4">Purchaser Info</th>
                <th className="px-5 py-4">Financials (Purchase / Sell)</th>
                <th className="px-5 py-4">Net Profit</th>
                <th className="px-5 py-4">Deal Status</th>
                <th className="px-5 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr><td colSpan={8}><BrandLoader variant="section" size="sm" bg="light" text="Loading sell accounts..." /></td></tr>
              ) : currentRecords.length > 0 ? (
                currentRecords.map((item, idx) => {
                  const statusInfo = DEAL_STATUS_CONFIG[item.dealStatus] || DEAL_STATUS_CONFIG['OPEN'];
                  const StatusIcon = statusInfo.icon;
                  const isNearBottom = currentRecords.length > 3 && idx >= currentRecords.length - 2;
                  return (
                    <tr key={item.id} onClick={() => router.push(`${accountBasePath}/${item.id}`)} className="hover:bg-gray-50/80 transition-colors cursor-pointer">
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-2">
                          <Car className="w-4 h-4 text-amber-600 shrink-0" />
                          <div>
                            <p className="font-bold text-gray-900">{item.vehicleNumber}</p>
                            <p className="text-xs text-gray-500">{item.vehicleModel}</p>
                            <span className="inline-block mt-0.5 text-[10px] font-medium bg-gray-100 px-1.5 py-0.5 rounded text-gray-600">
                              {item.vehicleType}
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
                      </td>

                      <td className="px-5 py-4">
                        <p className="font-semibold text-gray-900">{item.purchaserName}</p>
                        <a href={`tel:${item.purchaserNumber}`} onClick={(e) => e.stopPropagation()} className="text-xs text-blue-600 hover:underline flex items-center gap-1 mt-0.5">
                          <Phone className="w-3 h-3 text-blue-500" />
                          {item.purchaserNumber}
                        </a>
                      </td>

                      <td className="px-5 py-4">
                        <p className="text-xs text-gray-500">
                          Buy: <span className="font-medium text-gray-900">₹{item.purchaseAmount.toLocaleString('en-IN')}</span>
                        </p>
                        <p className="text-xs font-semibold text-emerald-700 mt-0.5">
                          Sell: ₹{item.sellAmount.toLocaleString('en-IN')}
                        </p>
                        <p className="text-[11px] text-gray-400 mt-0.5">
                          Date: {formatDate(item.sellDate)}
                        </p>
                      </td>

                      <td className="px-5 py-4">
                        <span className={`font-bold ${item.netProfit >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                          ₹{item.netProfit.toLocaleString('en-IN')}
                        </span>
                        <p className="text-[11px] text-gray-400">Exp: ₹{item.expenses.toLocaleString('en-IN')}</p>
                      </td>

                      <td className="px-5 py-4">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border whitespace-nowrap shrink-0 ${statusInfo.bg} ${statusInfo.text} ${statusInfo.border}`}>
                          <StatusIcon className="w-3.5 h-3.5" />
                          {statusInfo.label}
                        </span>
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
                                <Eye className="w-3.5 h-3.5 text-gray-500" />
                                View
                              </button>
                              {canUpdateSellAccounts ? <button
                                type="button"
                                onClick={() => {
                                  setActionMenuId(null);
                                  openEditModal(item);
                                }}
                                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold text-blue-600 hover:bg-blue-50 transition-colors"
                              >
                                <Edit2 className="w-3.5 h-3.5 text-blue-500" />
                                Edit
                              </button> : null}
                              {canDeleteSellAccounts ? <button
                                type="button"
                                onClick={() => {
                                  setActionMenuId(null);
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
                  <td colSpan={8} className="text-center py-12 text-gray-500">
                    <Wallet className="w-10 h-10 text-gray-300 mx-auto mb-2" />
                    <p className="font-medium text-gray-700">No sell account records found matching your filters.</p>
                    <p className="text-xs text-gray-400 mt-1">Click &quot;Create Sell Account&quot; to add a new record.</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
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
                      className={`h-8 w-8 rounded-lg text-xs font-bold transition ${
                        currentPage === item ? 'bg-[#FFC107] text-black shadow-sm' : 'text-gray-600 hover:bg-gray-100'
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

      {/* CREATE & EDIT FORM MODAL */}
      {(isCreateModalOpen || editingRecord) && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-3xl w-full p-6 shadow-2xl border border-gray-200 space-y-6 max-h-[90vh] overflow-y-auto my-auto animate-in fade-in zoom-in duration-200">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-gray-100 pb-4">
              <div>
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-amber-700 bg-amber-50 px-2.5 py-0.5 rounded border border-amber-200/60 w-fit mb-1">
                  {editingRecord ? `Editing: ${editingRecord.id}` : 'New Sell Account Form'}
                </div>
                <h3 className="text-xl font-bold text-gray-900">
                  {editingRecord ? 'Edit Sell Account Record' : 'Create Sell Account Record'}
                </h3>
              </div>
              <button
                onClick={() => void closeForm()}
                className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={editingRecord ? handleEditSubmit : handleCreateSubmit} className="space-y-6">
              {/* SECTION 1: VEHICLE & OWNER DETAILS */}
              <div className="space-y-4">
                <h4 className="text-xs font-bold uppercase tracking-wider text-amber-700 border-b border-amber-100 pb-1 flex items-center gap-2">
                  <Car className="w-4 h-4" /> 1. Vehicle & Owner Details
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">Owner Name *</label>
                    <input
                      type="text"
                      placeholder="e.g. Ramesh Patel"
                      value={formData.ownerName}
                      required
                      onChange={(e) => handleInputChange('ownerName', e.target.value)}
                      className={`w-full px-3 py-2 bg-gray-50 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 ${formErrors.ownerName ? 'border-rose-500' : 'border-gray-200'}`}
                    />
                    {formErrors.ownerName && <p className="text-[11px] text-rose-500 mt-1">{formErrors.ownerName}</p>}
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">Owner Mobile Number *</label>
                    <input
                      type="text"
                      placeholder="e.g. 9876543210"
                      maxLength={10}
                      value={formData.ownerNumber}
                      required
                      onChange={(e) => handleInputChange('ownerNumber', e.target.value)}
                      className={`w-full px-3 py-2 bg-gray-50 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 ${formErrors.ownerNumber ? 'border-rose-500' : 'border-gray-200'}`}
                    />
                    {formErrors.ownerNumber && <p className="text-[11px] text-rose-500 mt-1">{formErrors.ownerNumber}</p>}
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">Vehicle Number *</label>
                    <input
                      type="text"
                      placeholder="e.g. MH-12-AB-1234"
                      value={formData.vehicleNumber}
                      required
                      onChange={(e) => handleInputChange('vehicleNumber', e.target.value)}
                      className={`w-full px-3 py-2 bg-gray-50 border rounded-xl text-sm uppercase focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 ${formErrors.vehicleNumber ? 'border-rose-500' : 'border-gray-200'}`}
                    />
                    {formErrors.vehicleNumber && <p className="text-[11px] text-rose-500 mt-1">{formErrors.vehicleNumber}</p>}
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">Category *</label>
                    <SearchableSelect
                      options={categories.map((cat) => ({ id: cat.name, name: cat.name }))}
                      value={formData.vehicleType}
                      displayValue={formData.vehicleType || 'Select Category'}
                      onChange={(opt) => handleInputChange('vehicleType', String(opt.id))}
                      searchable={true}
                      placeholder="Select Category"
                      className={`w-full bg-gray-50 ${formErrors.vehicleType ? 'border-rose-500' : 'border-gray-200'}`}
                    />
                    {formErrors.vehicleType && <p className="text-[11px] text-rose-500 mt-1">{formErrors.vehicleType}</p>}
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">Vehicle Model *</label>
                    <input
                      type="text"
                      placeholder="e.g. JCB 3DX Super 2023"
                      value={formData.vehicleModel}
                      required
                      onChange={(e) => handleInputChange('vehicleModel', e.target.value)}
                      className={`w-full px-3 py-2 bg-gray-50 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 ${formErrors.vehicleModel ? 'border-rose-500' : 'border-gray-200'}`}
                    />
                    {formErrors.vehicleModel && <p className="text-[11px] text-rose-500 mt-1">{formErrors.vehicleModel}</p>}
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">Sell Date *</label>
                    <input
                      type="date"
                      value={formData.sellDate}
                      required
                      onChange={(e) => handleInputChange('sellDate', e.target.value)}
                      className={`w-full px-3 py-2 bg-gray-50 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 ${formErrors.sellDate ? 'border-rose-500' : 'border-gray-200'}`}
                    />
                    {formErrors.sellDate && <p className="text-[11px] text-rose-500 mt-1">{formErrors.sellDate}</p>}
                  </div>
                </div>
              </div>

              {/* SECTION 2: SELLER & PURCHASER DETAILS */}
              <div className="space-y-4">
                <h4 className="text-xs font-bold uppercase tracking-wider text-amber-700 border-b border-amber-100 pb-1 flex items-center gap-2">
                  <User className="w-4 h-4" /> 2. Seller & Purchaser Details
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Seller Group */}
                  <div className="p-4 bg-gray-50/80 rounded-xl border border-gray-200/80 space-y-3">
                    <p className="text-xs font-bold text-gray-800 uppercase tracking-wider">Seller Information</p>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Seller Name *</label>
                      <input
                        type="text"
                        placeholder="Seller Name"
                        value={formData.sellerName}
                        required
                        onChange={(e) => handleInputChange('sellerName', e.target.value)}
                        className={`w-full px-3 py-2 bg-white border rounded-xl text-sm ${formErrors.sellerName ? 'border-rose-500' : 'border-gray-200'}`}
                      />
                      {formErrors.sellerName && <p className="text-[11px] text-rose-500 mt-1">{formErrors.sellerName}</p>}
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Seller Mobile Number *</label>
                      <input
                        type="text"
                        placeholder="10-digit Mobile"
                        maxLength={10}
                        value={formData.sellerNumber}
                        required
                        onChange={(e) => handleInputChange('sellerNumber', e.target.value)}
                        className={`w-full px-3 py-2 bg-white border rounded-xl text-sm ${formErrors.sellerNumber ? 'border-rose-500' : 'border-gray-200'}`}
                      />
                      {formErrors.sellerNumber && <p className="text-[11px] text-rose-500 mt-1">{formErrors.sellerNumber}</p>}
                    </div>
                  </div>

                  {/* Purchaser Group */}
                  <div className="p-4 bg-gray-50/80 rounded-xl border border-gray-200/80 space-y-3">
                    <p className="text-xs font-bold text-gray-800 uppercase tracking-wider">Purchaser Information</p>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Purchaser Name *</label>
                      <input
                        type="text"
                        placeholder="Purchaser Name"
                        value={formData.purchaserName}
                        required
                        onChange={(e) => handleInputChange('purchaserName', e.target.value)}
                        className={`w-full px-3 py-2 bg-white border rounded-xl text-sm ${formErrors.purchaserName ? 'border-rose-500' : 'border-gray-200'}`}
                      />
                      {formErrors.purchaserName && <p className="text-[11px] text-rose-500 mt-1">{formErrors.purchaserName}</p>}
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Purchaser Mobile Number *</label>
                      <input
                        type="text"
                        placeholder="10-digit Mobile"
                        maxLength={10}
                        value={formData.purchaserNumber}
                        required
                        onChange={(e) => handleInputChange('purchaserNumber', e.target.value)}
                        className={`w-full px-3 py-2 bg-white border rounded-xl text-sm ${formErrors.purchaserNumber ? 'border-rose-500' : 'border-gray-200'}`}
                      />
                      {formErrors.purchaserNumber && <p className="text-[11px] text-rose-500 mt-1">{formErrors.purchaserNumber}</p>}
                    </div>
                  </div>
                </div>
              </div>

              {/* SECTION 3: FINANCIAL BREAKDOWN */}
              <div className="space-y-4">
                <h4 className="text-xs font-bold uppercase tracking-wider text-amber-700 border-b border-amber-100 pb-1 flex items-center gap-2">
                  <DollarSign className="w-4 h-4" /> 3. Financial Breakdown & Calculation
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">Purchase Amount (₹) *</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      placeholder="0"
                      value={rawInputs.purchaseAmount}
                      onChange={(e) => handleInputChange('purchaseAmount', e.target.value)}
                      className={`w-full px-3 py-2 bg-gray-50 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20 ${formErrors.purchaseAmount ? 'border-rose-500' : 'border-gray-200'}`}
                    />
                    {formErrors.purchaseAmount && <p className="text-[11px] text-rose-500 mt-1">{formErrors.purchaseAmount}</p>}
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">Sell Amount (₹) *</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      placeholder="0"
                      value={rawInputs.sellAmount}
                      onChange={(e) => handleInputChange('sellAmount', e.target.value)}
                      className={`w-full px-3 py-2 bg-gray-50 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20 ${formErrors.sellAmount ? 'border-rose-500' : 'border-gray-200'}`}
                    />
                    {formErrors.sellAmount && <p className="text-[11px] text-rose-500 mt-1">{formErrors.sellAmount}</p>}
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">Expenses (₹)</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      placeholder="0"
                      value={rawInputs.expenses}
                      onChange={(e) => handleInputChange('expenses', e.target.value)}
                      className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">Balance Amount (₹)</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      placeholder="0"
                      value={rawInputs.balanceAmount}
                      onChange={(e) => handleInputChange('balanceAmount', e.target.value)}
                      className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                    />
                  </div>
                </div>

                {/* Live Auto Net Profit Banner */}
                <div className="p-3 bg-amber-50 border border-amber-200/80 rounded-xl flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2 font-medium text-amber-900">
                    <TrendingUp className="w-4 h-4 text-amber-600" />
                    <span>Auto Calculated Net Profit:</span>
                    <span className="text-xs text-amber-700">(Sell Amount - Purchase Amount - Expenses)</span>
                  </div>
                  <div className={`text-base font-bold ${formData.netProfit >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                    ₹{formData.netProfit.toLocaleString('en-IN')}
                  </div>
                </div>
              </div>

              {/* SECTION 4: PURCHASE DEED */}
              <div className="space-y-4">
                <h4 className="flex items-center gap-2 border-b border-amber-100 pb-1 text-xs font-bold uppercase tracking-wider text-amber-700">
                  <FileText className="h-4 w-4" /> 4. Purchase Deed
                </h4>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <SellAccountPdfField label="Purchase Deed PDF" document={formData.documents?.purchaseDeed} onUploaded={(file) => handleDocumentUploaded('purchaseDeed', file)} onUploadStateChange={handleDocumentUploadStateChange} />
                  <SellAccountPdfField label="Aadhaar Card PDF" document={formData.documents?.purchaseAadhaarCard} onUploaded={(file) => handleDocumentUploaded('purchaseAadhaarCard', file)} onUploadStateChange={handleDocumentUploadStateChange} />
                  <SellAccountPdfField label="PAN Card PDF" document={formData.documents?.purchasePanCard} onUploaded={(file) => handleDocumentUploaded('purchasePanCard', file)} onUploadStateChange={handleDocumentUploadStateChange} />
                  <SellAccountPdfField label="GST Certificate PDF" document={formData.documents?.purchaseGstCertificate} onUploaded={(file) => handleDocumentUploaded('purchaseGstCertificate', file)} onUploadStateChange={handleDocumentUploadStateChange} />
                </div>
              </div>

              {/* SECTION 5: SELL DEED */}
              <div className="space-y-4">
                <h4 className="flex items-center gap-2 border-b border-amber-100 pb-1 text-xs font-bold uppercase tracking-wider text-amber-700">
                  <FileText className="h-4 w-4" /> 5. Sell Deed
                </h4>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <SellAccountPdfField label="Sell Deed PDF" document={formData.documents?.sellDeed} onUploaded={(file) => handleDocumentUploaded('sellDeed', file)} onUploadStateChange={handleDocumentUploadStateChange} />
                  <SellAccountPdfField label="Aadhaar Card PDF" document={formData.documents?.sellAadhaarCard} onUploaded={(file) => handleDocumentUploaded('sellAadhaarCard', file)} onUploadStateChange={handleDocumentUploadStateChange} />
                  <SellAccountPdfField label="PAN Card PDF" document={formData.documents?.sellPanCard} onUploaded={(file) => handleDocumentUploaded('sellPanCard', file)} onUploadStateChange={handleDocumentUploadStateChange} />
                  <SellAccountPdfField label="GST Certificate PDF" document={formData.documents?.sellGstCertificate} onUploaded={(file) => handleDocumentUploaded('sellGstCertificate', file)} onUploadStateChange={handleDocumentUploadStateChange} />
                </div>
              </div>

              {/* SECTION 6: TRANSFER DETAILS, STATUS & REMARK */}
              <div className="space-y-4">
                <h4 className="text-xs font-bold uppercase tracking-wider text-amber-700 border-b border-amber-100 pb-1 flex items-center gap-2">
                  <FileText className="w-4 h-4" /> 6. Status, Transfer Details & Remark
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">Deal Status *</label>
                    <SearchableSelect
                      options={[
                        { id: 'OPEN', name: 'Open' },
                        { id: 'IN_PROGRESS', name: 'In Progress' },
                        { id: 'CLOSE', name: 'Close' }
                      ]}
                      value={formData.dealStatus}
                      displayValue={formData.dealStatus === 'OPEN' ? 'Open' : formData.dealStatus === 'IN_PROGRESS' ? 'In Progress' : 'Close'}
                      onChange={(opt) => handleInputChange('dealStatus', String(opt.id))}
                      searchable={false}
                      className={`w-full bg-gray-50 font-semibold ${formErrors.dealStatus ? 'border-rose-500' : 'border-gray-200'}`}
                    />
                    {formErrors.dealStatus && <p className="text-[11px] text-rose-500 mt-1">{formErrors.dealStatus}</p>}
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">Transfer Details *</label>
                    <input
                      type="text"
                      placeholder="e.g. NOC pending at RTO, Hypothecation removed"
                      value={formData.transferDetails}
                      required
                      onChange={(e) => handleInputChange('transferDetails', e.target.value)}
                      className={`w-full px-3 py-2 bg-gray-50 border rounded-xl text-sm ${formErrors.transferDetails ? 'border-rose-500' : 'border-gray-200'}`}
                    />
                    {formErrors.transferDetails && <p className="text-[11px] text-rose-500 mt-1">{formErrors.transferDetails}</p>}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Remark *</label>
                  <textarea
                    rows={3}
                    placeholder="Enter remark, inspection observations, payment terms, or transfer notes..."
                    value={formData.noteSheet}
                    required
                    onChange={(e) => handleInputChange('noteSheet', e.target.value)}
                    className={`w-full px-3 py-2 bg-gray-50 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20 ${formErrors.noteSheet ? 'border-rose-500' : 'border-gray-200'}`}
                  />
                  {formErrors.noteSheet && <p className="text-[11px] text-rose-500 mt-1">{formErrors.noteSheet}</p>}
                </div>
              </div>

              {/* Modal Actions */}
              <div className="pt-4 border-t border-gray-100 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => void closeForm()}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={activeDocumentUploads > 0}
                  className="px-6 py-2 text-sm font-bold text-gray-900 bg-[#FFC107] hover:bg-amber-400 rounded-xl transition-all shadow-md shadow-amber-500/20"
                >
                  {activeDocumentUploads > 0 ? 'Uploading PDFs...' : editingRecord ? 'Save Changes' : 'Create Record'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}


      {/* DELETE CONFIRMATION MODAL */}
      {deletingRecordId && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-gray-200 space-y-4 animate-in fade-in zoom-in duration-200">
            <div className="flex items-center gap-3 text-rose-600">
              <div className="p-3 bg-rose-50 rounded-xl">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-gray-900">Delete Sell Account Record?</h3>
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
