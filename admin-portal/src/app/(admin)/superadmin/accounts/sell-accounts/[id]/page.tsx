'use client';

import { ComponentType, useEffect, useState } from 'react';
import { useRouter, useParams, usePathname } from 'next/navigation';
import {
  ArrowLeft, CheckCircle2, Clock, Car, User, Phone,
  FileText, DollarSign, AlertTriangle, Edit2, X, TrendingUp, Download
} from 'lucide-react';
import { SellAccountRecord } from '../page';
import type { SellAccountDocument, SellAccountDocuments } from '../page';
import SearchableSelect from '@/components/ui/SearchableSelect';
import api from '@/lib/api';
import { FileUploadField } from '@/components/upload/FileUploadField';
import { deleteSecureFileFromServer, type UploadedFileResult } from '@/lib/fileUpload';
import { normalizeSecureDocumentPath } from '@/lib/secureDocumentPath.mjs';
import { normalizeSellAccountDocuments } from '@/lib/sellAccountDocuments.mjs';

type StoredSellAccountRecord = Omit<SellAccountRecord, 'dealStatus'> & { dealStatus: SellAccountRecord['dealStatus'] | 'COMPLETED' | 'CANCELLED' | 'PENDING' };

const DEAL_STATUS_CONFIG: Record<SellAccountRecord['dealStatus'], { label: string; bg: string; text: string; border: string; icon: ComponentType<{ className?: string }> }> = {
  OPEN: { label: 'Open', bg: 'bg-amber-50', text: 'text-amber-800', border: 'border-amber-200', icon: AlertTriangle },
  IN_PROGRESS: { label: 'In Progress', bg: 'bg-blue-50', text: 'text-blue-800', border: 'border-blue-200', icon: Clock },
  CLOSE: { label: 'Close', bg: 'bg-emerald-50', text: 'text-emerald-800', border: 'border-emerald-200', icon: CheckCircle2 },
};

const formatDate = (dateStr: string) => {
  if (!dateStr) return '';
  const parts = dateStr.split('T')[0].split('-');
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return dateStr;
};

const sanitizePhoneNumber = (val: string) => val.replace(/\D/g, '').slice(0, 10);
const sanitizeVehicleNumber = (val: string) => val.toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 15);

type EditFormData = Omit<SellAccountRecord, 'id' | 'createdAt'>;
type SellAccountDocumentKey = keyof SellAccountDocuments;

const initialRawInputs = {
  purchaseAmount: '',
  sellAmount: '',
  expenses: '',
  balanceAmount: '',
};

function EditPdfField({
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

function SecurePdfDocument({ label, document }: { label: string; document?: SellAccountDocument | null }) {
  const [viewerUrl, setViewerUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => () => {
    if (viewerUrl) URL.revokeObjectURL(viewerUrl);
  }, [viewerUrl]);

  const fetchDocumentBlob = async () => {
    if (!document?.fileUrl) {
      throw new Error('PDF file is not available.');
    }

    const response = await api.get(normalizeSecureDocumentPath(document.fileUrl), { responseType: 'blob' });
    return new Blob([response.data], { type: 'application/pdf' });
  };

  const openDocument = async () => {
    if (!document?.fileUrl || viewerUrl || loading) return;
    setLoading(true);
    setError('');
    try {
      const blob = await fetchDocumentBlob();
      setViewerUrl(URL.createObjectURL(blob));
    } catch {
      setError('Unable to load this PDF.');
    } finally {
      setLoading(false);
    }
  };

  const downloadDocument = async () => {
    if (!document?.fileUrl || downloading) return;
    setDownloading(true);
    setError('');
    try {
      const blob = await fetchDocumentBlob();
      const downloadUrl = URL.createObjectURL(blob);
      const anchor = window.document.createElement('a');
      const requestedName = document.originalName || document.fileName || `${label}.pdf`;
      const safeName = requestedName.replace(/[<>:"/\\|?*\u0000-\u001F]/g, '_').trim() || `${label}.pdf`;
      anchor.href = downloadUrl;
      anchor.download = safeName.toLowerCase().endsWith('.pdf') ? safeName : `${safeName}.pdf`;
      window.document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
    } catch {
      setError('Unable to download this PDF.');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="rounded-xl border border-gray-100 bg-gray-50 p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-wider text-gray-500">{label}</p>
          <p className="truncate text-xs text-gray-700">{document?.originalName || 'No PDF uploaded'}</p>
        </div>
        {document ? (
          <div className="flex shrink-0 flex-wrap justify-end gap-2">
            <button type="button" onClick={() => void openDocument()} disabled={loading || downloading} className="rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-bold text-gray-950 disabled:opacity-60">
              {loading ? 'Loading...' : viewerUrl ? 'Loaded' : 'View PDF'}
            </button>
            <button type="button" onClick={() => void downloadDocument()} disabled={loading || downloading} className="inline-flex items-center gap-1 rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-bold text-amber-800 disabled:opacity-60">
              <Download className="h-3.5 w-3.5" />
              {downloading ? 'Downloading...' : 'Download'}
            </button>
          </div>
        ) : null}
      </div>
      {error ? <p className="mt-2 text-xs font-medium text-rose-600">{error}</p> : null}
      {viewerUrl ? <iframe title={label} src={viewerUrl} className="mt-3 h-56 w-full rounded-lg border border-gray-200 bg-white" /> : null}
    </div>
  );
}

export default function SellAccountDetailView() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useParams();
  const id = params?.id as string;
  const listPath = pathname.startsWith('/employee')
    ? '/employee/accounts/sell-accounts'
    : pathname.startsWith('/admin')
      ? '/admin/accounts/sell-accounts'
      : '/superadmin/accounts/sell-accounts';

  const [record, setRecord] = useState<SellAccountRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);

  // Edit modal state
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editData, setEditData] = useState<EditFormData | null>(null);
  const [editErrors, setEditErrors] = useState<Record<string, string>>({});
  const [rawInputs, setRawInputs] = useState(initialRawInputs);
  const [pendingReplacedDocuments, setPendingReplacedDocuments] = useState<Partial<Record<SellAccountDocumentKey, SellAccountDocument[]>>>({});
  const [activeDocumentUploads, setActiveDocumentUploads] = useState(0);

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

  useEffect(() => {
    const loadTimer = window.setTimeout(() => {
      if (id) {
        const saved = localStorage.getItem('jcb_sell_accounts_records');
        if (saved) {
          try {
            const parsed = JSON.parse(saved) as StoredSellAccountRecord[];
            const found = parsed.find((r) => r.id === id);
            if (found) {
                const migrated: SellAccountRecord = {
                  ...found,
                  documents: normalizeSellAccountDocuments(found) as SellAccountDocuments,
                dealStatus: found.dealStatus === 'COMPLETED' || found.dealStatus === 'CANCELLED' ? 'CLOSE' : found.dealStatus === 'PENDING' ? 'OPEN' : found.dealStatus
              };
              setRecord(migrated);
            }
          } catch { }
        }
        setLoading(false);
      }
    }, 0);
    return () => window.clearTimeout(loadTimer);
  }, [id]);

  // Open edit modal
  const openEdit = () => {
    if (!record) return;
    const fd: EditFormData = {
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
      documents: normalizeSellAccountDocuments(record) as SellAccountDocuments,
    };
    setEditData(fd);
    setRawInputs({
      purchaseAmount: String(record.purchaseAmount),
      sellAmount: String(record.sellAmount),
      expenses: String(record.expenses),
      balanceAmount: String(record.balanceAmount),
    });
    setEditErrors({});
    setPendingReplacedDocuments({});
    setActiveDocumentUploads(0);
    setIsEditOpen(true);
  };

  // Handle edit form change
  const handleEditChange = (field: keyof EditFormData, rawValue: string | number | SellAccountRecord['dealStatus']) => {
    let value = rawValue;

    if (field === 'ownerNumber' || field === 'sellerNumber' || field === 'purchaserNumber') {
      value = sanitizePhoneNumber(String(rawValue));
    } else if (field === 'vehicleNumber') {
      value = sanitizeVehicleNumber(String(rawValue));
    } else if (field === 'purchaseAmount' || field === 'sellAmount' || field === 'expenses' || field === 'balanceAmount') {
      const rawStr = String(rawValue).replace(/[^0-9.]/g, '');
      setRawInputs((prev) => ({ ...prev, [field]: rawStr }));
      value = rawStr === '' || rawStr === '.' ? 0 : parseFloat(rawStr) || 0;
    }

    setEditData((prev) => {
      if (!prev) return prev;
      const updated = { ...prev, [field]: value };
      if (field === 'purchaseAmount' || field === 'sellAmount' || field === 'expenses') {
        updated.netProfit = (Number(updated.sellAmount) || 0) - (Number(updated.purchaseAmount) || 0) - (Number(updated.expenses) || 0);
      }
      return updated;
    });

    if (editErrors[field]) {
      setEditErrors((prev) => ({ ...prev, [field]: '' }));
    }
  };

  const getDocuments = (data: Pick<SellAccountRecord, 'documents'>): SellAccountDocuments =>
    normalizeSellAccountDocuments(data) as SellAccountDocuments;

  const deleteDocumentFiles = async (documents: Array<SellAccountDocument | null | undefined>) => {
    const uniqueUrls = [...new Set(documents.map((document) => document?.fileUrl).filter(Boolean))] as string[];
    await Promise.allSettled(uniqueUrls.map((fileUrl) => deleteSecureFileFromServer(fileUrl)));
  };

  const handleDocumentUploaded = (key: SellAccountDocumentKey, file: UploadedFileResult) => {
    if (!editData) return;
    const previous = getDocuments(editData)[key];
    if (previous && previous.fileUrl !== file.fileUrl) {
      setPendingReplacedDocuments((current) => ({
        ...current,
        [key]: [...(current[key] || []), previous],
      }));
    }
    setEditData((current) => current ? {
      ...current,
      documents: {
        ...getDocuments(current),
        [key]: file,
      },
    } : current);
  };

  const handleDocumentUploadStateChange = (uploading: boolean) => {
    setActiveDocumentUploads((count) => Math.max(0, count + (uploading ? 1 : -1)));
  };

  const closeEdit = async () => {
    if (editData) {
      const currentDocuments = getDocuments(editData);
      const originalDocuments = record ? getDocuments(record) : null;
      const uploadedDuringSession = Object.values(currentDocuments).filter((document) => {
        if (!document) return false;
        return !originalDocuments || !Object.values(originalDocuments).some((item) => item?.fileUrl === document.fileUrl);
      });
      await deleteDocumentFiles(uploadedDuringSession);
    }
    setIsEditOpen(false);
    setPendingReplacedDocuments({});
    setActiveDocumentUploads(0);
  };

  // Validate edit form
  const validateEdit = () => {
    if (!editData) return false;
    const errors: Record<string, string> = {};
    if (!editData.ownerName.trim()) errors.ownerName = 'Owner Name is required';
    if (!editData.ownerNumber || editData.ownerNumber.length < 10) errors.ownerNumber = 'Valid 10-digit phone required';
    if (!editData.vehicleNumber.trim()) errors.vehicleNumber = 'Vehicle Number is required';
    if (!editData.vehicleType.trim()) errors.vehicleType = 'Category is required';
    if (!editData.vehicleModel.trim()) errors.vehicleModel = 'Vehicle Model is required';
    if (!editData.sellDate.trim()) errors.sellDate = 'Sell Date is required';
    if (!editData.sellerName.trim()) errors.sellerName = 'Seller Name is required';
    if (!editData.sellerNumber || editData.sellerNumber.length < 10) errors.sellerNumber = 'Valid 10-digit phone required';
    if (!editData.purchaserName.trim()) errors.purchaserName = 'Purchaser Name is required';
    if (!editData.purchaserNumber || editData.purchaserNumber.length < 10) errors.purchaserNumber = 'Valid 10-digit phone required';
    if (editData.purchaseAmount <= 0) errors.purchaseAmount = 'Purchase amount must be greater than 0';
    if (editData.sellAmount <= 0) errors.sellAmount = 'Sell amount must be greater than 0';
    if (!editData.dealStatus) errors.dealStatus = 'Deal Status is required';
    if (!editData.transferDetails.trim()) errors.transferDetails = 'Transfer Details are required';
    if (!editData.noteSheet.trim()) errors.noteSheet = 'Remark is required';
    setEditErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // Submit edit
  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!record || !editData) return;
    if (activeDocumentUploads > 0) {
      setEditErrors((current) => ({ ...current, documents: 'Please wait until all PDF uploads finish.' }));
      return;
    }
    if (!validateEdit()) return;

    const saved = localStorage.getItem('jcb_sell_accounts_records');
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as SellAccountRecord[];
        const updated = parsed.map((r) =>
          r.id === record.id ? { ...r, ...editData } : r
        );
        localStorage.setItem('jcb_sell_accounts_records', JSON.stringify(updated));
        setRecord({ ...record, ...editData });
      } catch { }
    }
    await deleteDocumentFiles(Object.values(pendingReplacedDocuments).flat());
    setPendingReplacedDocuments({});
    setIsEditOpen(false);
  };

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
        <p className="text-lg font-medium text-gray-600">Record not found</p>
        <button
          onClick={() => router.push(listPath)}
          className="text-blue-600 hover:underline font-medium"
        >
          Go back to list
        </button>
      </div>
    );
  }

  const statusInfo = DEAL_STATUS_CONFIG[record.dealStatus] || DEAL_STATUS_CONFIG['OPEN'];

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
            <h1 className="text-2xl font-bold text-gray-900">Sell Account Details</h1>
            <p className="text-sm font-medium text-gray-500 mt-0.5">Record ID: {record.id}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={openEdit}
            className="flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-700 shadow-sm transition hover:bg-blue-100 hover:border-blue-300"
          >
            <Edit2 className="h-4 w-4" />
            Edit
          </button>
          <div className={`flex items-center justify-center gap-2 rounded-full border px-4 py-1.5 font-semibold shrink-0 ${statusInfo.bg} ${statusInfo.text} ${statusInfo.border}`}>
            <statusInfo.icon className="h-4 w-4" />
            {statusInfo.label}
          </div>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Vehicle & Owner Details */}
        <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
          <h3 className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-amber-700 border-b border-gray-100 pb-2">
            <Car className="h-4 w-4" /> Vehicle & Owner Details
          </h3>
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Vehicle Number</p>
                <p className="font-bold text-gray-900 text-lg mt-0.5">{record.vehicleNumber}</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Vehicle Model</p>
                <p className="font-bold text-gray-900 mt-0.5">{record.vehicleModel}</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Category</p>
                <p className="font-medium text-gray-800 mt-0.5">{record.vehicleType}</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Sell Date</p>
                <p className="font-medium text-gray-800 mt-0.5">{formatDate(record.sellDate)}</p>
              </div>
            </div>
            <div className="rounded-xl bg-gray-50 border border-gray-100 p-4 mt-2 flex items-start gap-3">
              <div className="p-2 bg-white rounded-lg shadow-sm shrink-0">
                <User className="w-5 h-5 text-gray-400" />
              </div>
              <div>
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Owner</p>
                <p className="font-bold text-gray-900">{record.ownerName}</p>
                <a href={`tel:${record.ownerNumber}`} className="mt-1 flex w-fit items-center gap-1.5 text-sm font-medium text-blue-600 hover:underline">
                  <Phone className="h-3.5 w-3.5 text-blue-500" /> {record.ownerNumber}
                </a>
              </div>
            </div>
          </div>
        </div>

        {/* Seller & Purchaser Details */}
        <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
          <h3 className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-amber-700 border-b border-gray-100 pb-2">
            <User className="h-4 w-4" /> Parties Involved
          </h3>
          <div className="space-y-4">
            <div className="rounded-xl border border-gray-100 bg-gray-50/50 p-4 flex items-start gap-3 hover:bg-gray-50 transition-colors">
               <div className="p-2 bg-white rounded-lg shadow-sm shrink-0 border border-gray-100">
                <User className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Seller</p>
                <p className="font-bold text-gray-900">{record.sellerName}</p>
                <a href={`tel:${record.sellerNumber}`} className="mt-1 flex w-fit items-center gap-1.5 text-sm font-medium text-blue-600 hover:underline">
                  <Phone className="h-3.5 w-3.5 text-blue-500" /> {record.sellerNumber}
                </a>
              </div>
            </div>
            <div className="rounded-xl border border-gray-100 bg-gray-50/50 p-4 flex items-start gap-3 hover:bg-gray-50 transition-colors">
               <div className="p-2 bg-white rounded-lg shadow-sm shrink-0 border border-gray-100">
                <User className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Purchaser</p>
                <p className="font-bold text-gray-900">{record.purchaserName}</p>
                <a href={`tel:${record.purchaserNumber}`} className="mt-1 flex w-fit items-center gap-1.5 text-sm font-medium text-blue-600 hover:underline">
                  <Phone className="h-3.5 w-3.5 text-blue-500" /> {record.purchaserNumber}
                </a>
              </div>
            </div>
          </div>
        </div>

        {/* Financial Breakdown */}
        <div className="rounded-2xl border border-amber-100 bg-amber-50/30 p-5 shadow-sm md:col-span-2">
          <h3 className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-amber-800">
            <DollarSign className="h-4 w-4" /> Financial Breakdown
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            <div className="rounded-xl bg-white p-4 shadow-sm border border-amber-100/50 hover:border-amber-300 transition-colors text-center">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Purchase Amount</p>
              <p className="mt-1 text-xl font-bold text-gray-900">₹{record.purchaseAmount.toLocaleString('en-IN')}</p>
            </div>
            <div className="rounded-xl bg-white p-4 shadow-sm border border-amber-100/50 hover:border-amber-300 transition-colors text-center">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Sell Amount</p>
              <p className="mt-1 text-xl font-bold text-emerald-700">₹{record.sellAmount.toLocaleString('en-IN')}</p>
            </div>
            <div className="rounded-xl bg-white p-4 shadow-sm border border-amber-100/50 hover:border-amber-300 transition-colors text-center">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Expenses</p>
              <p className="mt-1 text-xl font-bold text-gray-800">₹{record.expenses.toLocaleString('en-IN')}</p>
            </div>
            <div className="rounded-xl bg-white p-4 shadow-sm border border-amber-300 bg-amber-50 hover:border-amber-400 transition-colors text-center">
              <p className="text-xs font-bold text-amber-800 uppercase tracking-wider">Net Profit</p>
              <p className={`mt-1 text-2xl font-black ${record.netProfit >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                ₹{record.netProfit.toLocaleString('en-IN')}
              </p>
            </div>
          </div>
          {record.balanceAmount > 0 && (
            <div className="mt-3 text-right text-sm text-gray-500">
              Balance Amount: <span className="font-semibold text-gray-700">₹{record.balanceAmount.toLocaleString('en-IN')}</span>
            </div>
          )}
        </div>

        {/* Deed Documents */}
        <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm md:col-span-2">
          <h3 className="mb-4 flex items-center gap-2 border-b border-gray-100 pb-2 text-sm font-bold uppercase tracking-wider text-amber-700">
            <FileText className="h-4 w-4" /> Purchase & Sell Deed Documents
          </h3>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-3">
              <p className="text-xs font-bold uppercase tracking-wider text-amber-800">Purchase Deed PDFs</p>
              <SecurePdfDocument label="Purchase Deed Document" document={getDocuments(record).purchaseDeed} />
              <SecurePdfDocument label="Aadhaar Card" document={getDocuments(record).purchaseAadhaarCard} />
              <SecurePdfDocument label="PAN Card" document={getDocuments(record).purchasePanCard} />
              <SecurePdfDocument label="GST Certificate" document={getDocuments(record).purchaseGstCertificate} />
            </div>
            <div className="space-y-3">
              <p className="text-xs font-bold uppercase tracking-wider text-amber-800">Sell Deed PDFs</p>
              <SecurePdfDocument label="Sell Deed Document" document={getDocuments(record).sellDeed} />
              <SecurePdfDocument label="Aadhaar Card" document={getDocuments(record).sellAadhaarCard} />
              <SecurePdfDocument label="PAN Card" document={getDocuments(record).sellPanCard} />
              <SecurePdfDocument label="GST Certificate" document={getDocuments(record).sellGstCertificate} />
            </div>
          </div>
        </div>

        {/* Transfer Details & Remark */}
        <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm md:col-span-2">
          <h3 className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-amber-700 border-b border-gray-100 pb-2">
            <FileText className="h-4 w-4" /> Transfer Details & Remark
          </h3>
          <div className="grid gap-6 md:grid-cols-2">
            <div className="space-y-2">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Transfer Details</p>
              <div className="rounded-xl bg-gray-50 border border-gray-100 p-4">
                <p className="text-sm font-medium text-gray-900">{record.transferDetails || 'No transfer details specified.'}</p>
              </div>
            </div>
            <div className="space-y-2">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Remark</p>
              <div className="rounded-xl bg-gray-50 border border-gray-100 p-4">
                <p className="text-sm text-gray-900 whitespace-pre-wrap font-medium">{record.noteSheet || 'No additional notes.'}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* EDIT MODAL */}
      {isEditOpen && editData && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-3xl w-full p-6 shadow-2xl border border-gray-200 space-y-6 max-h-[90vh] overflow-y-auto my-auto animate-in fade-in zoom-in duration-200">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-gray-100 pb-4">
              <div>
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-amber-700 bg-amber-50 px-2.5 py-0.5 rounded border border-amber-200/60 w-fit mb-1">
                  Editing: {record.id}
                </div>
                <h3 className="text-xl font-bold text-gray-900">Edit Sell Account Record</h3>
              </div>
              <button
                onClick={() => void closeEdit()}
                className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleEditSubmit} className="space-y-6">
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
                      value={editData.ownerName}
                      onChange={(e) => handleEditChange('ownerName', e.target.value)}
                      className={`w-full px-3 py-2 bg-gray-50 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 ${editErrors.ownerName ? 'border-rose-500' : 'border-gray-200'}`}
                    />
                    {editErrors.ownerName && <p className="text-[11px] text-rose-500 mt-1">{editErrors.ownerName}</p>}
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">Owner Mobile Number *</label>
                    <input
                      type="text"
                      placeholder="e.g. 9876543210"
                      maxLength={10}
                      value={editData.ownerNumber}
                      onChange={(e) => handleEditChange('ownerNumber', e.target.value)}
                      className={`w-full px-3 py-2 bg-gray-50 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 ${editErrors.ownerNumber ? 'border-rose-500' : 'border-gray-200'}`}
                    />
                    {editErrors.ownerNumber && <p className="text-[11px] text-rose-500 mt-1">{editErrors.ownerNumber}</p>}
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">Vehicle Number *</label>
                    <input
                      type="text"
                      placeholder="e.g. MH-12-AB-1234"
                      value={editData.vehicleNumber}
                      onChange={(e) => handleEditChange('vehicleNumber', e.target.value)}
                      className={`w-full px-3 py-2 bg-gray-50 border rounded-xl text-sm uppercase focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 ${editErrors.vehicleNumber ? 'border-rose-500' : 'border-gray-200'}`}
                    />
                    {editErrors.vehicleNumber && <p className="text-[11px] text-rose-500 mt-1">{editErrors.vehicleNumber}</p>}
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">Category *</label>
                    <SearchableSelect
                      options={categories.map((cat) => ({ id: cat.name, name: cat.name }))}
                      value={editData.vehicleType}
                      displayValue={editData.vehicleType || 'Select Category'}
                      onChange={(opt) => handleEditChange('vehicleType', String(opt.id))}
                      searchable={true}
                      placeholder="Select Category"
                      className={`w-full bg-gray-50 ${editErrors.vehicleType ? 'border-rose-500' : 'border-gray-200'}`}
                    />
                    {editErrors.vehicleType && <p className="text-[11px] text-rose-500 mt-1">{editErrors.vehicleType}</p>}
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">Vehicle Model *</label>
                    <input
                      type="text"
                      placeholder="e.g. JCB 3DX Super 2023"
                      value={editData.vehicleModel}
                      onChange={(e) => handleEditChange('vehicleModel', e.target.value)}
                      className={`w-full px-3 py-2 bg-gray-50 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 ${editErrors.vehicleModel ? 'border-rose-500' : 'border-gray-200'}`}
                    />
                    {editErrors.vehicleModel && <p className="text-[11px] text-rose-500 mt-1">{editErrors.vehicleModel}</p>}
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">Sell Date *</label>
                    <input
                      type="date"
                      value={editData.sellDate}
                      onChange={(e) => handleEditChange('sellDate', e.target.value)}
                      className={`w-full px-3 py-2 bg-gray-50 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 ${editErrors.sellDate ? 'border-rose-500' : 'border-gray-200'}`}
                    />
                    {editErrors.sellDate && <p className="text-[11px] text-rose-500 mt-1">{editErrors.sellDate}</p>}
                  </div>
                </div>
              </div>

              {/* SECTION 2: SELLER & PURCHASER DETAILS */}
              <div className="space-y-4">
                <h4 className="text-xs font-bold uppercase tracking-wider text-amber-700 border-b border-amber-100 pb-1 flex items-center gap-2">
                  <User className="w-4 h-4" /> 2. Seller & Purchaser Details
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="p-4 bg-gray-50/80 rounded-xl border border-gray-200/80 space-y-3">
                    <p className="text-xs font-bold text-gray-800 uppercase tracking-wider">Seller Information</p>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Seller Name *</label>
                      <input
                        type="text"
                        placeholder="Seller Name"
                        value={editData.sellerName}
                        onChange={(e) => handleEditChange('sellerName', e.target.value)}
                        className={`w-full px-3 py-2 bg-white border rounded-xl text-sm ${editErrors.sellerName ? 'border-rose-500' : 'border-gray-200'}`}
                      />
                      {editErrors.sellerName && <p className="text-[11px] text-rose-500 mt-1">{editErrors.sellerName}</p>}
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Seller Mobile Number *</label>
                      <input
                        type="text"
                        placeholder="10-digit Mobile"
                        maxLength={10}
                        value={editData.sellerNumber}
                        onChange={(e) => handleEditChange('sellerNumber', e.target.value)}
                        className={`w-full px-3 py-2 bg-white border rounded-xl text-sm ${editErrors.sellerNumber ? 'border-rose-500' : 'border-gray-200'}`}
                      />
                      {editErrors.sellerNumber && <p className="text-[11px] text-rose-500 mt-1">{editErrors.sellerNumber}</p>}
                    </div>
                  </div>

                  <div className="p-4 bg-gray-50/80 rounded-xl border border-gray-200/80 space-y-3">
                    <p className="text-xs font-bold text-gray-800 uppercase tracking-wider">Purchaser Information</p>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Purchaser Name *</label>
                      <input
                        type="text"
                        placeholder="Purchaser Name"
                        value={editData.purchaserName}
                        onChange={(e) => handleEditChange('purchaserName', e.target.value)}
                        className={`w-full px-3 py-2 bg-white border rounded-xl text-sm ${editErrors.purchaserName ? 'border-rose-500' : 'border-gray-200'}`}
                      />
                      {editErrors.purchaserName && <p className="text-[11px] text-rose-500 mt-1">{editErrors.purchaserName}</p>}
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Purchaser Mobile Number *</label>
                      <input
                        type="text"
                        placeholder="10-digit Mobile"
                        maxLength={10}
                        value={editData.purchaserNumber}
                        onChange={(e) => handleEditChange('purchaserNumber', e.target.value)}
                        className={`w-full px-3 py-2 bg-white border rounded-xl text-sm ${editErrors.purchaserNumber ? 'border-rose-500' : 'border-gray-200'}`}
                      />
                      {editErrors.purchaserNumber && <p className="text-[11px] text-rose-500 mt-1">{editErrors.purchaserNumber}</p>}
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
                      onChange={(e) => handleEditChange('purchaseAmount', e.target.value)}
                      className={`w-full px-3 py-2 bg-gray-50 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20 ${editErrors.purchaseAmount ? 'border-rose-500' : 'border-gray-200'}`}
                    />
                    {editErrors.purchaseAmount && <p className="text-[11px] text-rose-500 mt-1">{editErrors.purchaseAmount}</p>}
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">Sell Amount (₹) *</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      placeholder="0"
                      value={rawInputs.sellAmount}
                      onChange={(e) => handleEditChange('sellAmount', e.target.value)}
                      className={`w-full px-3 py-2 bg-gray-50 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20 ${editErrors.sellAmount ? 'border-rose-500' : 'border-gray-200'}`}
                    />
                    {editErrors.sellAmount && <p className="text-[11px] text-rose-500 mt-1">{editErrors.sellAmount}</p>}
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">Expenses (₹)</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      placeholder="0"
                      value={rawInputs.expenses}
                      onChange={(e) => handleEditChange('expenses', e.target.value)}
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
                      onChange={(e) => handleEditChange('balanceAmount', e.target.value)}
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
                  <div className={`text-base font-bold ${editData.netProfit >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                    ₹{editData.netProfit.toLocaleString('en-IN')}
                  </div>
                </div>
              </div>

              {/* SECTION 4: PURCHASE DEED */}
              <div className="space-y-4">
                <h4 className="flex items-center gap-2 border-b border-amber-100 pb-1 text-xs font-bold uppercase tracking-wider text-amber-700">
                  <FileText className="h-4 w-4" /> 4. Purchase Deed
                </h4>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <EditPdfField label="Purchase Deed PDF" document={editData.documents?.purchaseDeed} onUploaded={(file) => handleDocumentUploaded('purchaseDeed', file)} onUploadStateChange={handleDocumentUploadStateChange} />
                  <EditPdfField label="Aadhaar Card PDF" document={editData.documents?.purchaseAadhaarCard} onUploaded={(file) => handleDocumentUploaded('purchaseAadhaarCard', file)} onUploadStateChange={handleDocumentUploadStateChange} />
                  <EditPdfField label="PAN Card PDF" document={editData.documents?.purchasePanCard} onUploaded={(file) => handleDocumentUploaded('purchasePanCard', file)} onUploadStateChange={handleDocumentUploadStateChange} />
                  <EditPdfField label="GST Certificate PDF" document={editData.documents?.purchaseGstCertificate} onUploaded={(file) => handleDocumentUploaded('purchaseGstCertificate', file)} onUploadStateChange={handleDocumentUploadStateChange} />
                </div>
              </div>

              {/* SECTION 5: SELL DEED */}
              <div className="space-y-4">
                <h4 className="flex items-center gap-2 border-b border-amber-100 pb-1 text-xs font-bold uppercase tracking-wider text-amber-700">
                  <FileText className="h-4 w-4" /> 5. Sell Deed
                </h4>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <EditPdfField label="Sell Deed PDF" document={editData.documents?.sellDeed} onUploaded={(file) => handleDocumentUploaded('sellDeed', file)} onUploadStateChange={handleDocumentUploadStateChange} />
                  <EditPdfField label="Aadhaar Card PDF" document={editData.documents?.sellAadhaarCard} onUploaded={(file) => handleDocumentUploaded('sellAadhaarCard', file)} onUploadStateChange={handleDocumentUploadStateChange} />
                  <EditPdfField label="PAN Card PDF" document={editData.documents?.sellPanCard} onUploaded={(file) => handleDocumentUploaded('sellPanCard', file)} onUploadStateChange={handleDocumentUploadStateChange} />
                  <EditPdfField label="GST Certificate PDF" document={editData.documents?.sellGstCertificate} onUploaded={(file) => handleDocumentUploaded('sellGstCertificate', file)} onUploadStateChange={handleDocumentUploadStateChange} />
                </div>
              </div>

              {/* SECTION 6: STATUS, TRANSFER DETAILS & REMARK */}
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
                      value={editData.dealStatus}
                      displayValue={editData.dealStatus === 'OPEN' ? 'Open' : editData.dealStatus === 'IN_PROGRESS' ? 'In Progress' : 'Close'}
                      onChange={(opt) => handleEditChange('dealStatus', String(opt.id))}
                      searchable={false}
                      className={`w-full bg-gray-50 font-semibold ${editErrors.dealStatus ? 'border-rose-500' : 'border-gray-200'}`}
                    />
                    {editErrors.dealStatus && <p className="text-[11px] text-rose-500 mt-1">{editErrors.dealStatus}</p>}
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">Transfer Details *</label>
                    <input
                      type="text"
                      placeholder="e.g. NOC pending at RTO, Hypothecation removed"
                      value={editData.transferDetails}
                      onChange={(e) => handleEditChange('transferDetails', e.target.value)}
                      className={`w-full px-3 py-2 bg-gray-50 border rounded-xl text-sm ${editErrors.transferDetails ? 'border-rose-500' : 'border-gray-200'}`}
                    />
                    {editErrors.transferDetails && <p className="text-[11px] text-rose-500 mt-1">{editErrors.transferDetails}</p>}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Remark *</label>
                  <textarea
                    rows={3}
                    placeholder="Enter remark, inspection observations, payment terms, or transfer notes..."
                    value={editData.noteSheet}
                    onChange={(e) => handleEditChange('noteSheet', e.target.value)}
                    className={`w-full px-3 py-2 bg-gray-50 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20 ${editErrors.noteSheet ? 'border-rose-500' : 'border-gray-200'}`}
                  />
                  {editErrors.noteSheet && <p className="text-[11px] text-rose-500 mt-1">{editErrors.noteSheet}</p>}
                </div>
              </div>

              {/* Modal Actions */}
              <div className="pt-4 border-t border-gray-100 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => void closeEdit()}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={activeDocumentUploads > 0}
                  className="px-6 py-2 text-sm font-bold text-gray-900 bg-[#FFC107] hover:bg-amber-400 rounded-xl transition-all shadow-md shadow-amber-500/20"
                >
                  {activeDocumentUploads > 0 ? 'Uploading PDFs...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
