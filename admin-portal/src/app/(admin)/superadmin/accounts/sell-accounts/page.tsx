'use client';

import Image from 'next/image';
import { ComponentType, useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  Wallet, Search, CheckCircle2, Clock, DollarSign, Eye, Plus, Edit2, Trash2, X, Car, User, Phone,
  AlertTriangle, ChevronLeft, ChevronRight, MoreVertical, Download, MessageCircle, LockKeyhole,
  FileCheck2, FileText, Bookmark
} from 'lucide-react';
import api from '@/lib/api';
import { normalizeSecureDocumentPath } from '@/lib/secureDocumentPath.mjs';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { getAccountCreatePermissions, getAccountDeletePermissions, getAccountExportPermission, getAccountUpdatePermissions } from '@/lib/accountsPermissions';
import { buildPaginationItems } from '@/lib/paginationUtils';
import { hasAnyPermission } from '@/lib/permissionUtils';
import { downloadTableFile } from '@/lib/tabularExport';
import SearchableSelect from '@/components/ui/SearchableSelect';
import BrandLoader from '@/components/ui/BrandLoader';
import { useAuthStore } from '@/store/authStore';
import { FileUploadField } from '@/components/upload/FileUploadField';
import { deleteSecureFileFromServer, type UploadedFileResult } from '@/lib/fileUpload';
import { createEmptySellAccountDocuments, normalizeSellAccountDocuments, SELL_ACCOUNT_DOCUMENT_ACCEPT } from '@/lib/sellAccountDocuments.mjs';
import { createNextSellAccountId, getSellAccountValidationErrors, normalizeAmountInput, normalizeSellAccountChassisNumber, omitSellAccountEngineNumber, removeSellAccountRecord, replaceSellAccountRecord, toEditableAmount, upsertSellAccountRecord } from '@/lib/sellAccountForm.mjs';
import { calculateSellAccountFinance, deriveSellAccountDealStatus, getSellAccountTaxLines, GST_RATE_PERCENT } from '@/lib/sellAccountFinance.mjs';
import { getAccountSaveErrorToast, getAccountSaveSuccessToast } from '@/lib/accountSaveMessages.mjs';
import { useTranslation } from '@/hooks/useTranslation';
import { toast } from 'react-toastify';
import { getListingAccountPrefill, mergeListingAccountPrefill } from '@/lib/listingAccountPrefill.mjs';
import { createSellAccountDraftId, isSellAccountDraft, mergeSellAccountRecords } from '@/lib/sellAccountDrafts.mjs';
import { shouldShowSaveAndStartRto } from '@/lib/sellAccountRtoAction.mjs';
import {
  createEmptySellAccountKyc,
  createFailedVerificationState,
  createVerificationState,
  normalizeSellAccountKyc,
  normalizeSellAccountKycNumber,
  SELL_ACCOUNT_KYC_STATUS,
} from '@/lib/sellAccountKyc.mjs';
import { PAN_COMPREHENSIVE_ROUTE, validatePan } from '@/lib/panVerification';
import { validateGstin } from '@/lib/gstVerification';

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
type SellAccountKycKind = 'pan' | 'gst' | 'aadhaar';
type SellAccountKycState = {
  number: string;
  status: string;
  verificationRecordId: string;
  verifiedAt: string;
  cacheHit: boolean;
  error: string;
};
type SellAccountKycSide = {
  pan: SellAccountKycState;
  gst: SellAccountKycState;
  aadhaar: SellAccountKycState;
};
type SellAccountKyc = {
  purchase: SellAccountKycSide;
  sell: SellAccountKycSide;
};
type SellAccountRtoRecord = {
  id: string;
  listingId?: string | null;
  sellAccountId?: string | null;
  rtoStatus: string;
  updatedAt?: string;
  isLocked?: boolean;
};
export type SellAccountPayment = {
  id?: string;
  side: 'PURCHASER_RECEIPT' | 'SELLER_PAYMENT';
  amount: number;
  paymentDate: string;
  method: 'CASH' | 'UPI' | 'BANK_TRANSFER' | 'CHEQUE' | 'OTHER';
  reference?: string;
  note?: string;
};
export type SellAccountDealStatus =
  | 'OPEN'
  | 'PARTIAL_PAYMENT_RECEIVED'
  | 'FULL_PAYMENT'
  | 'RTO_WORK_STARTED'
  | 'RTO_WORK_IN_PROGRESS'
  | 'RTO_WORK_FAILED'
  | 'RTO_WORK_COMPLETED'
  | 'DEAL_DONE';

export interface SellAccountRecord {
  id: string;
  isLocked?: boolean;
  isDraft?: boolean;
  draftSavedAt?: string;
  listingId?: string | null;
  listingTitle?: string;
  ownerName: string;
  ownerNumber: string;
  vehicleNumber: string;
  chassisNumber?: string;
  sellDate: string;
  vehicleType: string;
  brandName: string;
  vehicleModel: string;
  sellerName: string;
  sellerNumber: string;
  sellerDate?: string;
  purchaserName: string;
  purchaserNumber: string;
  purchaserDate?: string;
  sellerState?: string;
  purchaserState?: string;
  purchaseAmount: number;
  sellAmount: number;
  transferDetails: string;
  balanceAmount: number;
  expenses: number;
  netProfit: number;
  dealStatus: SellAccountDealStatus;
  noteSheet: string;
  remarks?: string;
  taxMode?: 'INCLUSIVE' | 'EXCLUSIVE';
  gstRatePercent?: number;
  payments?: SellAccountPayment[];
  rtoStatusSnapshot?: string;
  rtoRecord?: SellAccountRtoRecord | null;
  netProfitAfterGst?: number;
  purchaseDeedNumber?: string;
  sellDeedNumber?: string;
  documents?: SellAccountDocuments;
  kyc?: SellAccountKyc;
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
    netProfit: 305000, // 2550000 - 2200000 - 45000
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
    netProfit: 420000, // 4600000 - 4100000 - 80000
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

type StoredSellAccountRecord = Omit<SellAccountRecord, 'dealStatus'> & { dealStatus: SellAccountRecord['dealStatus'] | 'IN_PROGRESS' | 'CLOSE' | 'COMPLETED' | 'CANCELLED' | 'PENDING' };
type ExportFormat = 'csv' | 'xls';

const normalizeSellAccountRecord = (record: StoredSellAccountRecord): SellAccountRecord => ({
  ...(omitSellAccountEngineNumber(record) as Omit<StoredSellAccountRecord, 'engineNumber'>),
  isDraft: record.isDraft === true,
  draftSavedAt: record.draftSavedAt || undefined,
  brandName: record.brandName || '',
  chassisNumber: normalizeSellAccountChassisNumber(record.chassisNumber),
  documents: normalizeSellAccountDocuments(record) as SellAccountDocuments,
  kyc: normalizeSellAccountKyc(record) as SellAccountKyc,
  dealStatus: record.dealStatus === 'COMPLETED' || record.dealStatus === 'CANCELLED' || record.dealStatus === 'CLOSE'
    ? 'DEAL_DONE'
    : record.dealStatus === 'PENDING'
      ? 'OPEN'
      : record.dealStatus === 'IN_PROGRESS'
        ? 'RTO_WORK_IN_PROGRESS'
        : record.dealStatus,
  sellerDate: record.sellerDate || record.sellDate,
  purchaserDate: record.purchaserDate || record.sellDate,
  sellerState: record.sellerState || '',
  purchaserState: record.purchaserState || '',
  // Sell Account policy: GST is inclusive in the profit margin and extracted from it.
  taxMode: 'INCLUSIVE',
  gstRatePercent: GST_RATE_PERCENT,
  payments: Array.isArray(record.payments) ? record.payments : [],
  rtoStatusSnapshot: record.rtoStatusSnapshot || 'PENDING',
  rtoRecord: record.rtoRecord || null,
  remarks: record.remarks ?? record.noteSheet ?? '',
});

const DEAL_STATUS_CONFIG: Record<SellAccountDealStatus, { label: string; shortLabel: string; bg: string; text: string; border: string; icon: ComponentType<{ className?: string }> }> = {
  OPEN: { label: 'Open', shortLabel: 'Open', bg: 'bg-amber-50', text: 'text-amber-800', border: 'border-amber-200', icon: AlertTriangle },
  PARTIAL_PAYMENT_RECEIVED: { label: 'Partial Payment Received', shortLabel: 'Partial Paid', bg: 'bg-orange-50', text: 'text-orange-800', border: 'border-orange-200', icon: Clock },
  FULL_PAYMENT: { label: 'Full Payment', shortLabel: 'Full Paid', bg: 'bg-blue-50', text: 'text-blue-800', border: 'border-blue-200', icon: CheckCircle2 },
  RTO_WORK_STARTED: { label: 'RTO Work Start', shortLabel: 'RTO Started', bg: 'bg-indigo-50', text: 'text-indigo-800', border: 'border-indigo-200', icon: Clock },
  RTO_WORK_IN_PROGRESS: { label: 'RTO Work Progress', shortLabel: 'RTO In Progress', bg: 'bg-blue-50', text: 'text-blue-800', border: 'border-blue-200', icon: Clock },
  RTO_WORK_FAILED: { label: 'RTO Work Failed / Errors', shortLabel: 'RTO Failed', bg: 'bg-rose-50', text: 'text-rose-800', border: 'border-rose-200', icon: AlertTriangle },
  RTO_WORK_COMPLETED: { label: 'RTO Work Completed', shortLabel: 'RTO Completed', bg: 'bg-emerald-50', text: 'text-emerald-800', border: 'border-emerald-200', icon: CheckCircle2 },
  DEAL_DONE: { label: 'Deal Done', shortLabel: 'Deal Done', bg: 'bg-emerald-50', text: 'text-emerald-800', border: 'border-emerald-200', icon: CheckCircle2 },
};

// Input Sanitization Helpers
const sanitizePhoneNumber = (val: string) => val.replace(/\D/g, '').slice(0, 10);
const sanitizeVehicleNumber = (val: string) => val.toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 15);
const toDateInput = (value: unknown, fallback = '') => {
  if (!value) return fallback;
  const text = String(value);
  const match = text.match(/^\d{4}-\d{2}-\d{2}/);
  if (match) return match[0];
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed.toISOString().slice(0, 10);
};

export type SellAccountApiRecord = Record<string, unknown>;

export const normalizeServerSellAccount = (record: SellAccountApiRecord): SellAccountRecord => normalizeSellAccountRecord({
  ...record,
  isLocked: record.isLocked === true,
  id: String(record.id || record.recordNumber || ''),
  listingId: record.listingId || null,
  listingTitle: String(record.listingTitle || ''),
  sellDate: toDateInput(record.sellDate),
  sellerDate: toDateInput(record.sellerDate, toDateInput(record.sellDate)),
  purchaserDate: toDateInput(record.purchaserDate, toDateInput(record.sellDate)),
  ownerName: String(record.ownerName || ''),
  ownerNumber: String(record.ownerNumber || ''),
  vehicleNumber: String(record.vehicleNumber || ''),
  vehicleType: String(record.vehicleType || ''),
  brandName: String(record.brandName || ''),
  vehicleModel: String(record.vehicleModel || ''),
  sellerName: String(record.sellerName || ''),
  sellerNumber: String(record.sellerNumber || ''),
  purchaserName: String(record.purchaserName || ''),
  purchaserNumber: String(record.purchaserNumber || ''),
  purchaseAmount: Number(record.purchaseAmount || 0),
  sellAmount: Number(record.sellAmount || 0),
  expenses: Number(record.expenses || 0),
  balanceAmount: Number(record.balanceAmount || 0),
  netProfit: Number(record.netProfit || 0),
  netProfitAfterGst: Number(record.netProfitAfterGst || 0),
  gstRatePercent: GST_RATE_PERCENT,
  taxMode: 'INCLUSIVE',
  payments: Array.isArray(record.payments) ? record.payments.filter((payment): payment is SellAccountApiRecord => Boolean(payment && typeof payment === 'object')).map((payment) => ({
    id: typeof payment.id === 'string' ? payment.id : undefined,
    side: String(payment.side) as SellAccountPayment['side'],
    amount: Number(payment.amount || 0),
    paymentDate: toDateInput(payment.paymentDate),
    method: String(payment.method) as SellAccountPayment['method'],
    reference: String(payment.reference || ''),
    note: String(payment.note || ''),
  })) : [],
  rtoStatusSnapshot: String(record.rtoStatusSnapshot || 'PENDING'),
  rtoRecord: record.rtoRecord && typeof record.rtoRecord === 'object'
    ? {
      id: String((record.rtoRecord as SellAccountApiRecord).id || ''),
      listingId: (record.rtoRecord as SellAccountApiRecord).listingId ? String((record.rtoRecord as SellAccountApiRecord).listingId) : null,
      sellAccountId: (record.rtoRecord as SellAccountApiRecord).sellAccountId ? String((record.rtoRecord as SellAccountApiRecord).sellAccountId) : null,
      rtoStatus: String((record.rtoRecord as SellAccountApiRecord).rtoStatus || 'PENDING'),
      updatedAt: String((record.rtoRecord as SellAccountApiRecord).updatedAt || ''),
      isLocked: (record.rtoRecord as SellAccountApiRecord).isLocked === true,
    }
    : null,
  noteSheet: String(record.remarks || record.noteSheet || ''),
  remarks: String(record.remarks || record.noteSheet || ''),
  transferDetails: String(record.transferDetails || ''),
  documents: record.documents || createEmptySellAccountDocuments(),
  kyc: record.kyc || undefined,
  createdAt: String(record.createdAt || new Date().toISOString()),
} as StoredSellAccountRecord);

const initialFormState: Omit<SellAccountRecord, 'id' | 'createdAt'> = {
  isDraft: false,
  ownerName: '',
  ownerNumber: '',
  vehicleNumber: '',
  chassisNumber: '',
  sellDate: new Date().toISOString().split('T')[0],
  vehicleType: 'Backhoe Loader',
  brandName: '',
  vehicleModel: '',
  sellerName: '',
  sellerNumber: '',
  sellerDate: new Date().toISOString().split('T')[0],
  purchaserName: '',
  purchaserNumber: '',
  purchaserDate: new Date().toISOString().split('T')[0],
  sellerState: '',
  purchaserState: '',
  purchaseAmount: 0,
  sellAmount: 0,
  transferDetails: '',
  balanceAmount: 0,
  expenses: 0,
  netProfit: 0,
  dealStatus: 'OPEN',
  noteSheet: '',
  remarks: '',
  taxMode: 'INCLUSIVE',
  gstRatePercent: GST_RATE_PERCENT,
  payments: [],
  rtoStatusSnapshot: 'PENDING',
  rtoRecord: null,
  netProfitAfterGst: 0,
  documents: createEmptySellAccountDocuments() as SellAccountDocuments,
  kyc: createEmptySellAccountKyc() as SellAccountKyc,
};

// Raw string state for number inputs so user can type 0
const initialRawInputs = {
  purchaseAmount: '',
  sellAmount: '',
  expenses: '',
  balanceAmount: '',
};

const initialPaymentDraft = {
  side: 'PURCHASER_RECEIPT' as SellAccountPayment['side'],
  amount: '',
  paymentDate: new Date().toISOString().split('T')[0],
  method: 'BANK_TRANSFER' as SellAccountPayment['method'],
  reference: '',
  note: '',
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
  const { t } = useTranslation();

  return (
    <div>
      <label className="mb-1 block text-xs font-semibold text-gray-700">{label}</label>
      <FileUploadField
        accept={SELL_ACCOUNT_DOCUMENT_ACCEPT}
        visibility="secure"
        uploadedFileName={document?.originalName}
        uploadedFileMimeType={document?.mimeType}
        uploadedFileUrl={document?.fileUrl}
        onUploaded={onUploaded}
        onUploadStateChange={onUploadStateChange}
        helperText={t('sellAccounts.documentHelper', 'PDF up to 3MB or JPG, PNG, WEBP up to 5MB.')}
      />
    </div>
  );
}

function DeedDocumentPreview({
  label,
  document,
  onRemove,
}: {
  label: string;
  document?: SellAccountDocument | null;
  onRemove?: () => void;
}) {
  const [viewerUrl, setViewerUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState('');
  const [isOpen, setIsOpen] = useState(true);

  const isImage = Boolean(
    document?.mimeType?.startsWith('image/') ||
    /\.(?:jpe?g|png|webp|gif)$/i.test(document?.originalName || '')
  );

  useEffect(() => {
    if (!document?.fileUrl) {
      return;
    }
    let cancelled = false;
    let createdUrl = '';
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const response = await api.get(normalizeSecureDocumentPath(document.fileUrl), { responseType: 'blob' });
        if (cancelled) return;
        const mimeType = isImage
          ? (document.mimeType?.startsWith('image/') ? document.mimeType : response.data.type || 'image/*')
          : document.mimeType || 'application/pdf';
        const blob = new Blob([response.data], { type: mimeType });
        createdUrl = URL.createObjectURL(blob);
        setViewerUrl(createdUrl);
      } catch {
        if (!cancelled) setError('Unable to load document preview.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
      if (createdUrl) {
        URL.revokeObjectURL(createdUrl);
      }
      setViewerUrl('');
    };
  }, [document?.fileUrl, document?.mimeType, isImage]);

  const downloadDocument = async () => {
    if (!document?.fileUrl || downloading) return;
    setDownloading(true);
    try {
      const response = await api.get(normalizeSecureDocumentPath(document.fileUrl), { responseType: 'blob' });
      const blob = new Blob([response.data], { type: document.mimeType || 'application/pdf' });
      const downloadUrl = URL.createObjectURL(blob);
      const a = window.document.createElement('a');
      a.href = downloadUrl;
      a.download = document.originalName || `${label}.${isImage ? 'jpg' : 'pdf'}`;
      window.document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
    } catch {
      toast.error('Unable to download document.');
    } finally {
      setDownloading(false);
    }
  };

  if (!document?.fileUrl) {
    return null;
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50/70 p-3.5 space-y-3 shadow-2xs">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200/80 pb-2.5">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/10 text-amber-700 shrink-0">
            <FileText className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-bold text-gray-900 truncate">{document.originalName || label}</p>
            <p className="text-[11px] text-gray-500">
              {isImage ? 'Image Document' : 'PDF Document'} · <span className="text-emerald-600 font-semibold">Uploaded</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setIsOpen((prev) => !prev)}
            className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-100 transition shadow-2xs"
          >
            <Eye className="h-3.5 w-3.5 text-gray-500" />
            {isOpen ? 'Hide Preview' : 'Show Preview'}
          </button>
          <button
            type="button"
            onClick={() => void downloadDocument()}
            disabled={downloading}
            className="inline-flex items-center gap-1 rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-100 transition shadow-2xs disabled:opacity-50"
          >
            <Download className="h-3.5 w-3.5 text-amber-700" />
            {downloading ? 'Downloading...' : 'Download'}
          </button>
          {onRemove ? (
            <button
              type="button"
              onClick={onRemove}
              className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100 transition shadow-2xs"
              title="Remove uploaded document"
            >
              <Trash2 className="h-3.5 w-3.5 text-rose-500" />
              Remove
            </button>
          ) : null}
        </div>
      </div>

      {isOpen ? (
        <div className="rounded-lg overflow-hidden bg-white border border-gray-200/90 min-h-[160px] flex items-center justify-center">
          {loading ? (
            <div className="py-8 text-center text-xs text-gray-500 flex flex-col items-center gap-2">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-amber-500 border-t-transparent" />
              Loading preview...
            </div>
          ) : error ? (
            <div className="py-6 text-center text-xs text-rose-500 font-medium">
              {error}
            </div>
          ) : viewerUrl ? (
            isImage ? (
              <div className="p-2 w-full flex justify-center bg-gray-900/5">
                <Image
                  src={viewerUrl}
                  alt={label}
                  width={700}
                  height={400}
                  unoptimized
                  className="max-h-72 w-auto object-contain rounded"
                />
              </div>
            ) : (
              <iframe
                title={label}
                src={viewerUrl}
                className="h-80 w-full rounded border-0"
              />
            )
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function PanVerificationField({
  side,
  state,
  busyKey,
  onNumberChange,
  onVerify,
}: {
  side: 'purchase' | 'sell';
  state: SellAccountKycState;
  busyKey: string | null;
  onNumberChange: (value: string) => void;
  onVerify: () => void;
}) {
  const key = `${side}-pan`;
  const isVerified = state.status === SELL_ACCOUNT_KYC_STATUS.VERIFIED;
  const isFailed = state.status === SELL_ACCOUNT_KYC_STATUS.FAILED;

  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-2">
        <label className="block text-xs font-semibold text-gray-700">
          PAN number
        </label>
        <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
          isVerified
            ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
            : isFailed
              ? 'border-rose-200 bg-rose-50 text-rose-700'
              : 'border-gray-200 bg-gray-50 text-gray-600'
        }`}>
          {isVerified ? 'Verified' : isFailed ? 'Failed' : 'Not verified'}
        </span>
      </div>
      <div className="flex items-stretch gap-2">
        <input
          type="text"
          value={state.number}
          maxLength={10}
          onChange={(event) => onNumberChange(event.target.value)}
          placeholder="ABCDE1234F"
          autoComplete="off"
          className="h-[46px] min-w-0 flex-1 rounded-lg border border-gray-200 bg-[#F5F8FA] px-3.5 text-sm font-semibold uppercase text-gray-900 placeholder:normal-case placeholder:font-normal placeholder:text-gray-400 focus:border-[#FFC107] focus:bg-white focus:outline-none transition"
        />
        <button
          type="button"
          onClick={onVerify}
          disabled={!state.number || busyKey === key}
          className="inline-flex min-w-24 items-center justify-center rounded-lg bg-[#FFC107] px-3 text-xs font-extrabold text-gray-950 transition hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-50 shadow-xs"
        >
          {busyKey === key ? 'Verifying...' : 'Verify'}
        </button>
      </div>
      {state.error ? (
        <p className="mt-1 text-xs font-medium text-rose-600">{state.error}</p>
      ) : (
        <p className="mt-1 text-xs text-gray-500">10-digit alphanumeric PAN of {side === 'purchase' ? 'purchaser' : 'seller'}.</p>
      )}
    </div>
  );
}

function SellAccountKycFields({
  side,
  values,
  busyKey,
  onNumberChange,
  onVerify,
}: {
  side: 'purchase' | 'sell';
  values: SellAccountKycSide;
  busyKey: string | null;
  onNumberChange: (kind: SellAccountKycKind, value: string) => void;
  onVerify: (kind: 'pan' | 'gst') => void;
}) {
  const statusLabel = (status: string) => {
    if (status === SELL_ACCOUNT_KYC_STATUS.VERIFIED) return 'Verified';
    if (status === SELL_ACCOUNT_KYC_STATUS.FAILED) return 'Failed';
    return 'Not verified';
  };

  const statusClass = (status: string) => status === SELL_ACCOUNT_KYC_STATUS.VERIFIED
    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
    : status === SELL_ACCOUNT_KYC_STATUS.FAILED
      ? 'border-rose-200 bg-rose-50 text-rose-700'
      : 'border-gray-200 bg-gray-50 text-gray-600';

  const renderStatus = (state: SellAccountKycState) => (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${statusClass(state.status)}`}>
      {statusLabel(state.status)}
    </span>
  );

  const renderVerificationField = (kind: 'gst', label: string, placeholder: string, state: SellAccountKycState) => {
    const key = `${side}-${kind}`;
    return (
      <div>
        <div className="mb-1 flex items-center justify-between gap-2">
          <label className="block text-xs font-semibold text-gray-700">{label}</label>
          {renderStatus(state)}
        </div>
        <div className="flex items-stretch gap-2">
          <input
            type="text"
            value={state.number}
            onChange={(event) => onNumberChange(kind, event.target.value)}
            placeholder={placeholder}
            autoComplete="off"
            className="h-[46px] min-w-0 flex-1 rounded-lg border border-gray-200 bg-[#F5F8FA] px-3.5 text-sm font-semibold uppercase text-gray-900 placeholder:normal-case placeholder:font-normal placeholder:text-gray-400 focus:border-[#FFC107] focus:bg-white focus:outline-none transition"
          />
          <button
            type="button"
            onClick={() => onVerify(kind)}
            disabled={!state.number || busyKey === key}
            className="inline-flex min-w-24 items-center justify-center rounded-lg bg-[#FFC107] px-3 text-xs font-extrabold text-gray-950 transition hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-50 shadow-xs"
          >
            {busyKey === key ? 'Verifying...' : 'Verify'}
          </button>
        </div>
        {state.error ? <p className="mt-1 text-xs font-medium text-rose-600">{state.error}</p> : null}
      </div>
    );
  };

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {renderVerificationField('gst', 'GSTIN', '08ABCDE1234F1ZN', values.gst)}
      <div>
        <div className="mb-1 flex items-center justify-between gap-2">
          <label className="block text-xs font-semibold text-gray-700">Aadhaar / VID</label>
          <span className="inline-flex items-center rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-gray-600">Input only</span>
        </div>
        <input
          type="text"
          value={values.aadhaar.number}
          onChange={(event) => onNumberChange('aadhaar', event.target.value)}
          placeholder="12-digit Aadhaar or VID"
          inputMode="numeric"
          autoComplete="off"
          className="h-[46px] w-full rounded-lg border border-gray-200 bg-[#F5F8FA] px-3.5 text-sm font-semibold text-gray-900 placeholder:normal-case placeholder:font-normal placeholder:text-gray-400 focus:border-[#FFC107] focus:bg-white focus:outline-none transition"
        />
        <p className="mt-1 text-xs text-gray-500">Aadhaar verification will be enabled after its provider is configured.</p>
      </div>
    </div>
  );
}

export default function SellAccountsPage() {
  const [records, setRecords] = useState<SellAccountRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [vehicleTypeFilter, setVehicleTypeFilter] = useState<string>('ALL');
  const [categories, setCategories] = useState<{ id: string, name: string }[]>([]);
  const [brands, setBrands] = useState<{ id: string, name: string }[]>([]);
  const [states, setStates] = useState<Array<{ id: string | number; name: string }>>([]);
  const { t } = useTranslation();

  useEffect(() => {
    const fetchCategories = async () => {
      try {
        const [categoriesResult, brandsResult] = await Promise.allSettled([
          api.get('/master/categories'),
          api.get('/master/brands'),
        ]);
        if (categoriesResult.status === 'fulfilled') {
          setCategories(categoriesResult.value.data.data || []);
        }
        if (brandsResult.status === 'fulfilled') {
          setBrands(brandsResult.value.data.data || []);
        }
      } catch (err) {
        console.error('Failed to load sell account master data', err);
      }
    };
    fetchCategories();
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadStates = async () => {
      try {
        const countriesResponse = await api.get<Array<{ id: string | number; name?: string }>>('/locations/countries');
        const india = (countriesResponse.data || []).find((country) => country.name?.trim().toLowerCase() === 'india');
        if (!india) return;

        const statesResponse = await api.get<Array<{ id: string | number; name: string }>>(`/locations/states/${india.id}`);
        if (!cancelled) setStates(statesResponse.data || []);
      } catch (error) {
        console.warn('Failed to load states for sell account form.', error);
        if (!cancelled) setStates([]);
      }
    };

    void loadStates();
    return () => {
      cancelled = true;
    };
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
  const searchParams = useSearchParams();
  const currentUser = useAuthStore((state) => state.user);
  const userPermissions = currentUser?.permissions || [];
  const canManageAccounts = currentUser?.role === 'SUPER_ADMIN' || currentUser?.role === 'ADMIN';
  const canCreateSellAccounts = canManageAccounts || hasAnyPermission(userPermissions, getAccountCreatePermissions('sell-accounts'));
  const canUpdateSellAccounts = canManageAccounts || hasAnyPermission(userPermissions, getAccountUpdatePermissions('sell-accounts'));
  const canOpenSellAccountLink = canCreateSellAccounts || canUpdateSellAccounts;
  const canManageRto = canManageAccounts || hasAnyPermission(userPermissions, [
    ...getAccountCreatePermissions('rto-work-status'),
    ...getAccountUpdatePermissions('rto-work-status'),
  ]);
  const canDeleteSellAccounts = canManageAccounts || hasAnyPermission(userPermissions, getAccountDeletePermissions('sell-accounts'));
  const canExportSellAccounts = canManageAccounts || hasAnyPermission(userPermissions, [getAccountExportPermission('sell-accounts')]);
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

  // Form State
  const [formData, setFormData] = useState(initialFormState);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  // Raw string inputs for number fields — allows typing "0" without it being swallowed
  const [rawInputs, setRawInputs] = useState(initialRawInputs);
  const [paymentDraft, setPaymentDraft] = useState(initialPaymentDraft);
  const [kycBusyKey, setKycBusyKey] = useState<string | null>(null);
  const [pendingReplacedDocuments, setPendingReplacedDocuments] = useState<Partial<Record<SellAccountDocumentKey, SellAccountDocument[]>>>({});
  const [activeDocumentUploads, setActiveDocumentUploads] = useState(0);
  const [startingRto, setStartingRto] = useState(false);
  const [startRtoRequested, setStartRtoRequested] = useState(false);
  const [linkedListingTitle, setLinkedListingTitle] = useState('');
  const handledListingIdRef = useRef<string | null>(null);
  const handledEditIdRef = useRef<string | null>(null);

  const activeVehicleName = useMemo(() => {
    return (
      linkedListingTitle?.trim() ||
      formData.listingTitle?.trim() ||
      [formData.brandName, formData.vehicleModel].filter(Boolean).join(' ').trim() ||
      formData.vehicleNumber?.trim() ||
      ''
    );
  }, [linkedListingTitle, formData.listingTitle, formData.brandName, formData.vehicleModel, formData.vehicleNumber]);

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

          // Older records were kept in the browser while the database-backed
          // draft flow was introduced. Restore that legacy seed once if the
          // previous merge has already overwritten the browser cache.
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
        console.warn('Sell Account API unavailable; using local draft records.', error);
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

  // Save to LocalStorage
  useEffect(() => {
    if (typeof window !== 'undefined' && !loading) {
      localStorage.setItem('jcb_sell_accounts_records', JSON.stringify(records));
    }
  }, [loading, records]);

  const recalculateForm = useCallback((data: typeof initialFormState): typeof initialFormState => {
    const finance = calculateSellAccountFinance({
      sellAmount: data.sellAmount,
      purchaseAmount: data.purchaseAmount,
      expenses: data.expenses,
      taxMode: data.taxMode,
      sellerState: data.sellerState,
      purchaserState: data.purchaserState,
      payments: data.payments,
    });
    return {
      ...data,
      balanceAmount: finance.payments.purchaserBalance,
      netProfit: finance.gst.netProfitBeforeGst,
      netProfitAfterGst: finance.gst.netProfitAfterGst,
      gstRatePercent: GST_RATE_PERCENT,
      dealStatus: deriveSellAccountDealStatus({
        purchaserPaymentStatus: finance.payments.purchaserPaymentStatus,
        rtoStatus: data.rtoStatusSnapshot,
        rtoLinked: Boolean(data.rtoRecord?.id),
      }) as SellAccountDealStatus,
    };
  }, []);

  // Handle Form Change with Sanitization & Auto-Calculation
  const handleInputChange = (field: keyof typeof initialFormState, rawValue: string | number | SellAccountRecord['dealStatus']) => {
    let value = rawValue;

    if (field === 'ownerNumber' || field === 'sellerNumber' || field === 'purchaserNumber') {
      value = sanitizePhoneNumber(String(rawValue));
    } else if (field === 'vehicleNumber') {
      value = sanitizeVehicleNumber(String(rawValue));
    } else if (field === 'chassisNumber') {
      value = normalizeSellAccountChassisNumber(rawValue);
    } else if (field === 'purchaseAmount' || field === 'sellAmount' || field === 'expenses' || field === 'balanceAmount') {
      // Keep raw string so user can type "0" — parse numeric for formData
      const normalizedAmount = normalizeAmountInput(String(rawValue));
      setRawInputs((prev) => ({ ...prev, [field]: normalizedAmount.raw }));
      value = normalizedAmount.value;
    }

    setFormData((prev) => recalculateForm({ ...prev, [field]: value }));

    if (formErrors[field]) {
      setFormErrors((prev) => ({ ...prev, [field]: '' }));
    }
  };

  const updateKycState = (side: 'purchase' | 'sell', kind: SellAccountKycKind, nextState: SellAccountKycState) => {
    setFormData((current) => ({
      ...current,
      kyc: {
        ...(current.kyc || createEmptySellAccountKyc()),
        [side]: {
          ...((current.kyc || createEmptySellAccountKyc())[side]),
          [kind]: nextState,
        },
      },
    }));
  };

  const handleKycNumberChange = (side: 'purchase' | 'sell', kind: SellAccountKycKind, rawValue: string) => {
    const normalized = normalizeSellAccountKycNumber(kind.toUpperCase(), rawValue);
    const currentState = (formData.kyc || createEmptySellAccountKyc())[side][kind];
    if (kind === 'aadhaar') {
      updateKycState(side, kind, { ...currentState, number: normalized, error: '' });
      return;
    }

    const nextState = currentState.number === normalized
      ? { ...currentState, error: '' }
      : {
        ...currentState,
        number: normalized,
        status: SELL_ACCOUNT_KYC_STATUS.NOT_VERIFIED,
        verificationRecordId: '',
        verifiedAt: '',
        cacheHit: false,
        error: '',
      };
    updateKycState(side, kind, nextState);
  };

  const handleKycVerify = async (side: 'purchase' | 'sell', kind: 'pan' | 'gst') => {
    const currentState = (formData.kyc || createEmptySellAccountKyc())[side][kind];
    const normalized = normalizeSellAccountKycNumber(kind.toUpperCase(), currentState.number);
    const validationError = kind === 'pan' ? validatePan(normalized) : validateGstin(normalized);
    if (validationError) {
      updateKycState(side, kind, { ...currentState, number: normalized, status: SELL_ACCOUNT_KYC_STATUS.NOT_VERIFIED, error: validationError });
      return;
    }

    const key = `${side}-${kind}`;
    setKycBusyKey(key);
    updateKycState(side, kind, { ...currentState, number: normalized, status: SELL_ACCOUNT_KYC_STATUS.NOT_VERIFIED, error: '' });

    try {
      const endpoint = kind === 'pan' ? PAN_COMPREHENSIVE_ROUTE : '/gst-verification/verify';
      const response = await api.post<Record<string, unknown>>(endpoint, { id_number: normalized });
      const nextState = createVerificationState({ kind: kind.toUpperCase(), number: normalized, response: response.data });
      updateKycState(side, kind, nextState as SellAccountKycState);
      if (nextState.status === SELL_ACCOUNT_KYC_STATUS.VERIFIED) {
        toast.success(`${kind === 'pan' ? 'PAN' : 'GSTIN'} verified. Save the deal to persist this status.`);
      } else {
        toast.error(nextState.error || 'Verification failed.');
      }
    } catch (error) {
      const responseError = error as { response?: { data?: { error?: unknown } } };
      const safeMessage = typeof responseError.response?.data?.error === 'string' && responseError.response.data.error.trim()
        ? responseError.response.data.error.trim()
        : `${kind === 'pan' ? 'PAN' : 'GSTIN'} verification failed. Please try again.`;
      updateKycState(side, kind, createFailedVerificationState(kind.toUpperCase(), normalized, safeMessage) as SellAccountKycState);
      toast.error(safeMessage);
    } finally {
      setKycBusyKey(null);
    }
  };

  // Sync rawInputs when form is populated (create/edit open)
  const syncRawInputs = useCallback((data: typeof initialFormState) => {
    setRawInputs({
      purchaseAmount: toEditableAmount(data.purchaseAmount),
      sellAmount: toEditableAmount(data.sellAmount),
      expenses: toEditableAmount(data.expenses),
      balanceAmount: toEditableAmount(data.balanceAmount),
    });
  }, []);

  const addPaymentEntry = () => {
    const amount = Number(paymentDraft.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error('Enter a valid payment amount.');
      return;
    }
    const entry: SellAccountPayment = {
      side: paymentDraft.side,
      amount,
      paymentDate: paymentDraft.paymentDate,
      method: paymentDraft.method,
      reference: paymentDraft.reference.trim(),
      note: paymentDraft.note.trim(),
    };
    setFormData((current) => recalculateForm({ ...current, payments: [...(current.payments || []), entry] }));
    setPaymentDraft({ ...initialPaymentDraft, paymentDate: new Date().toISOString().split('T')[0] });
  };

  const removePaymentEntry = (index: number) => {
    setFormData((current) => recalculateForm({ ...current, payments: (current.payments || []).filter((_, itemIndex) => itemIndex !== index) }));
  };

  const sharePaymentOnWhatsApp = (payment: SellAccountPayment) => {
    const normalizedNumber = String(formData.purchaserNumber || '').replace(/\D/g, '');
    if (!normalizedNumber) {
      toast.info('Add the purchaser WhatsApp number before sharing a payment receipt.');
      return;
    }

    const whatsappNumber = normalizedNumber.length === 10 ? `91${normalizedNumber}` : normalizedNumber;
    const paymentDetails = [
      `Payment receipt: ₹${payment.amount.toLocaleString('en-IN')}`,
      `Date: ${formatDate(payment.paymentDate)}`,
      `Method: ${payment.method.replaceAll('_', ' ')}`,
      payment.reference ? `Reference: ${payment.reference}` : '',
    ].filter(Boolean).join('\n');
    const message = `Hello ${formData.purchaserName || 'there'},\n\n${paymentDetails}\n\nVehicle: ${formData.vehicleNumber || 'N/A'}`;
    window.open(`https://wa.me/${whatsappNumber}?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer');
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

  const handleDocumentRemoved = (key: SellAccountDocumentKey) => {
    const previous = getDocuments(formData)[key];
    if (editingRecord && previous) {
      setPendingReplacedDocuments((current) => ({
        ...current,
        [key]: [...(current[key] || []), previous],
      }));
    }

    setFormData((current) => ({
      ...current,
      documents: {
        ...getDocuments(current),
        [key]: null,
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
    setKycBusyKey(null);
    setLinkedListingTitle('');
    setPendingReplacedDocuments({});
    setStartRtoRequested(false);
  };

  // Validate Form
  const validateForm = () => {
    const errors = getSellAccountValidationErrors(formData, { isEditing: Boolean(editingRecord) }) as unknown as Record<string, string>;
    setFormErrors(errors);
    if (Object.keys(errors).length > 0) {
      toast.error('Please complete the required fields before saving.');
    }
    return Object.keys(errors).length === 0;
  };

  const buildApiPayload = (data: typeof initialFormState) => ({
    ...data,
    // SellAccount persists documents as JSON. Keep KYC metadata in that JSON
    // namespace so server records, drafts, and edits use the same source of truth.
    documents: {
      ...getDocuments(data),
      kyc: data.kyc || createEmptySellAccountKyc(),
    },
    remarks: data.remarks || data.noteSheet || '',
    gstRatePercent: GST_RATE_PERCENT,
    payments: (data.payments || []).map((payment) => ({
      side: payment.side,
      amount: payment.amount,
      paymentDate: payment.paymentDate,
      method: payment.method,
      reference: payment.reference || '',
      note: payment.note || '',
    })),
  });

  const getSellAccountApiError = (error: unknown, fallback: string) => {
    const response = (error as {
      response?: { status?: number; data?: { error?: unknown; message?: unknown } };
    })?.response;
    const detail = response?.data?.error ?? response?.data?.message;
    if (typeof detail === 'string' && detail.trim()) {
      return detail.trim();
    }
    if (typeof response?.status === 'number') {
      return `${fallback} (HTTP ${response.status})`;
    }
    return fallback;
  };

  // Open Create Modal
  const openCreateModal = () => {
    if (!canCreateSellAccounts) return;
    setLinkedListingTitle('');
    setKycBusyKey(null);
    setFormData(initialFormState);
    setFormErrors({});
    syncRawInputs(initialFormState);
    setPaymentDraft({ ...initialPaymentDraft, paymentDate: new Date().toISOString().split('T')[0] });
    setPendingReplacedDocuments({});
    setActiveDocumentUploads(0);
    setStartRtoRequested(false);
    setIsCreateModalOpen(true);
  };

  // Open Edit Modal
  // The callback is intentionally kept stable because two URL-driven effects depend on it.
  // React Compiler cannot prove stability for the permission selector, although the selector is
  // already part of this callback's dependency list.
  // eslint-disable-next-line react-hooks/preserve-manual-memoization
  const openEditModal = useCallback((record: SellAccountRecord) => {
    if (!canUpdateSellAccounts) return;
    if (record.isLocked) {
      toast.info('This record is locked and can only be viewed.');
      return;
    }
    setEditingRecord(record);
    setLinkedListingTitle(record.listingTitle || [record.brandName, record.vehicleModel].filter(Boolean).join(' ') || record.vehicleNumber || '');
    setKycBusyKey(null);
    const fd = recalculateForm({
      ownerName: record.ownerName,
      isDraft: record.isDraft === true,
      draftSavedAt: record.draftSavedAt,
      listingId: record.listingId || null,
      listingTitle: record.listingTitle || '',
      ownerNumber: record.ownerNumber,
      vehicleNumber: record.vehicleNumber,
      chassisNumber: record.chassisNumber || '',
      sellDate: record.sellDate,
      vehicleType: record.vehicleType,
      brandName: record.brandName || '',
      vehicleModel: record.vehicleModel,
      sellerName: record.sellerName,
      sellerNumber: record.sellerNumber,
      sellerDate: record.sellerDate || record.sellDate,
      purchaserName: record.purchaserName,
      purchaserNumber: record.purchaserNumber,
      purchaserDate: record.purchaserDate || record.sellDate,
      sellerState: record.sellerState || '',
      purchaserState: record.purchaserState || '',
      purchaseAmount: record.purchaseAmount,
      sellAmount: record.sellAmount,
      transferDetails: record.transferDetails,
      balanceAmount: record.balanceAmount,
      expenses: record.expenses,
      netProfit: record.netProfit,
      dealStatus: record.dealStatus,
      noteSheet: record.noteSheet,
      remarks: record.remarks || record.noteSheet,
      taxMode: record.taxMode || 'INCLUSIVE',
      gstRatePercent: GST_RATE_PERCENT,
      payments: record.payments || [],
      rtoStatusSnapshot: record.rtoStatusSnapshot || 'PENDING',
      netProfitAfterGst: record.netProfitAfterGst || 0,
      purchaseDeedNumber: record.purchaseDeedNumber || '',
      sellDeedNumber: record.sellDeedNumber || '',
      documents: normalizeSellAccountDocuments(record) as SellAccountDocuments,
      kyc: normalizeSellAccountKyc(record) as SellAccountKyc,
    });
    setFormData(fd);
    syncRawInputs(fd);
    setFormErrors({});
    setPaymentDraft({ ...initialPaymentDraft, paymentDate: new Date().toISOString().split('T')[0] });
    setPendingReplacedDocuments({});
    setActiveDocumentUploads(0);
    setStartRtoRequested(false);
  // eslint-disable-next-line react-hooks/preserve-manual-memoization
  }, [canUpdateSellAccounts, recalculateForm, syncRawInputs]);

  useEffect(() => {
    const listingId = searchParams.get('listingId')?.trim() || '';
    if (!listingId || loading || isCreateModalOpen || editingRecord || handledListingIdRef.current === listingId || !canOpenSellAccountLink) return;
    handledListingIdRef.current = listingId;

    const loadListingPrefill = async () => {
      const linkedRecord = records.find((record) => record.listingId === listingId);

      try {
        const response = await api.get<{ listing?: Record<string, unknown> }>(`/listings/${encodeURIComponent(listingId)}`);
        const listing = response.data?.listing;
        if (!listing) throw new Error('Listing not found.');
        const prefill = getListingAccountPrefill(listing);
        if (linkedRecord) {
          const mergedRecord = mergeListingAccountPrefill(linkedRecord, prefill) as SellAccountRecord;
          setLinkedListingTitle(prefill.listingTitle);
          openEditModal(mergedRecord);
          router.replace(accountBasePath, { scroll: false });
          return;
        }

        setLinkedListingTitle(prefill.listingTitle);
        const nextForm = {
          ...initialFormState,
          listingId: prefill.listingId,
          listingTitle: prefill.listingTitle,
          ownerName: prefill.ownerName,
          ownerNumber: prefill.ownerNumber,
          vehicleNumber: prefill.vehicleNumber,
          chassisNumber: prefill.chassisNumber,
          vehicleType: prefill.vehicleType || initialFormState.vehicleType,
          brandName: prefill.brandName,
          vehicleModel: prefill.vehicleModel,
          sellerName: prefill.sellerName,
          sellerNumber: prefill.sellerNumber,
          sellerState: prefill.sellerState,
        };
        setFormData(nextForm);
        syncRawInputs(nextForm);
        setFormErrors({});
        setPendingReplacedDocuments({});
        setActiveDocumentUploads(0);
        setStartRtoRequested(false);
        setIsCreateModalOpen(true);
        router.replace(accountBasePath, { scroll: false });
      } catch (caught) {
        if (linkedRecord) {
          setLinkedListingTitle(linkedRecord.listingTitle || linkedRecord.vehicleModel || linkedRecord.vehicleNumber || '');
          openEditModal(linkedRecord);
          router.replace(accountBasePath, { scroll: false });
          return;
        }
        toast.error(caught instanceof Error ? caught.message : 'Unable to load the selected listing.');
        router.replace(accountBasePath, { scroll: false });
      }
    };

    void loadListingPrefill();
  }, [accountBasePath, canOpenSellAccountLink, editingRecord, isCreateModalOpen, loading, openEditModal, records, router, searchParams, syncRawInputs]);

  useEffect(() => {
    const editId = searchParams.get('editId')?.trim() || '';
    if (!editId || loading || isCreateModalOpen || editingRecord || handledEditIdRef.current === editId || !canUpdateSellAccounts) return;

    const record = records.find((item) => item.id === editId);
    if (!record) return;

    handledEditIdRef.current = editId;
    const timer = window.setTimeout(() => {
      openEditModal(record);
      router.replace(accountBasePath, { scroll: false });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [accountBasePath, canUpdateSellAccounts, editingRecord, isCreateModalOpen, loading, openEditModal, records, router, searchParams]);

  const handleSaveDraft = async () => {
    if (!canCreateSellAccounts && !canUpdateSellAccounts) return;
    if (kycBusyKey) {
      toast.info('Please wait until identity verification finishes.');
      return;
    }
    if (activeDocumentUploads > 0) {
      toast.info('Please wait until all document uploads finish.');
      return;
    }

    const hasDraftContent = Boolean(
      formData.listingId ||
      formData.ownerName ||
      formData.vehicleNumber ||
      formData.chassisNumber ||
      formData.sellerName ||
      formData.purchaserName ||
      formData.kyc?.purchase.pan.number ||
      formData.kyc?.purchase.gst.number ||
      formData.kyc?.sell.pan.number ||
      formData.kyc?.sell.gst.number ||
      formData.sellAmount,
    );
    if (!hasDraftContent) {
      toast.info('Enter at least one value before saving a draft.');
      return;
    }
    if (editingRecord && !isSellAccountDraft(editingRecord)) {
      toast.info('This record is already saved. Use Save Changes to update it.');
      return;
    }

    const now = new Date().toISOString();
    const draftRecord = normalizeSellAccountRecord({
      ...formData,
      id: editingRecord?.id || createSellAccountDraftId(formData.listingId),
      isDraft: true,
      draftSavedAt: now,
      createdAt: editingRecord?.createdAt || now,
    } as StoredSellAccountRecord);
    const persistedDraftId = editingRecord && !editingRecord.id.startsWith('DRAFT-SELL-') ? editingRecord.id : null;
    const isPersistedDraft = Boolean(persistedDraftId);

    try {
      const response = isPersistedDraft
        ? await api.put<{ record?: SellAccountApiRecord }>(
          `/recruitment/admin/sell-accounts/${encodeURIComponent(persistedDraftId || '')}`,
          buildApiPayload(draftRecord),
        )
        : await api.post<{ record?: SellAccountApiRecord }>(
          '/recruitment/admin/sell-accounts',
          buildApiPayload(draftRecord),
        );
      if (!response.data?.record) throw new Error('Draft was not returned by the server.');

      const serverRecord = normalizeServerSellAccount(response.data.record);
      setRecords((current) => upsertSellAccountRecord(current, serverRecord));
      setFormData(serverRecord);
      setEditingRecord(serverRecord);
      setIsCreateModalOpen(true);
      syncRawInputs(serverRecord);
      toast.success('Save draft');
    } catch (error) {
      console.warn('Sell Account draft save failed.', error);
      toast.error(getSellAccountApiError(error, 'Unable to save this draft to the database. Please try again.'));
    }
  };

  // Submit Create
  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canCreateSellAccounts) return;
    if (kycBusyKey) {
      toast.info('Please wait until identity verification finishes.');
      return;
    }
    if (activeDocumentUploads > 0) {
      setFormErrors((current) => ({ ...current, documents: 'Please wait until all document uploads finish.' }));
      toast.info('Please wait until all document uploads finish.');
      return;
    }
    if (!validateForm()) return;

    const newRecord: SellAccountRecord = {
      ...formData,
      id: createNextSellAccountId(records),
      createdAt: new Date().toISOString(),
    };

    try {
      const response = await api.post<{ record?: SellAccountApiRecord }>('/recruitment/admin/sell-accounts', buildApiPayload(formData));
      if (response.data?.record) {
        const serverRecord = normalizeServerSellAccount(response.data.record);
        setRecords((current) => upsertSellAccountRecord(current, serverRecord));
        setIsCreateModalOpen(false);
        toast.success(getAccountSaveSuccessToast('Sell Account', 'create'));
        return;
      }
    } catch (error) {
      console.warn('Sell Account API create failed; retaining local draft fallback.', error);
    }

    const nextRecords = upsertSellAccountRecord(records, newRecord);
    try {
      localStorage.setItem('jcb_sell_accounts_records', JSON.stringify(nextRecords));
    } catch {
      setFormErrors((current) => ({ ...current, documents: 'Unable to save this record. Please try again.' }));
      toast.error(getAccountSaveErrorToast('Sell Account'));
      return;
    }
    setRecords(nextRecords);
    setIsCreateModalOpen(false);
    toast.success(getAccountSaveSuccessToast('Sell Account', 'create'));
  };

  // Submit Edit
  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canUpdateSellAccounts) return;
    if (kycBusyKey) {
      toast.info('Please wait until identity verification finishes.');
      return;
    }
    if (activeDocumentUploads > 0) {
      setFormErrors((current) => ({ ...current, documents: 'Please wait until all document uploads finish.' }));
      toast.info('Please wait until all document uploads finish.');
      return;
    }
    if (!editingRecord || !validateForm()) return;

    const editingDraft = isSellAccountDraft(editingRecord);
    const updatedRecord = normalizeSellAccountRecord({ ...editingRecord, ...formData } as StoredSellAccountRecord);

    if (editingDraft) {
      const finalizedRecord = normalizeSellAccountRecord({
        ...updatedRecord,
        isDraft: false,
        draftSavedAt: undefined,
      } as StoredSellAccountRecord);
      try {
        const isPersistedDraft = !editingRecord.id.startsWith('DRAFT-SELL-');
        const response = isPersistedDraft
          ? await api.put<{ record?: SellAccountApiRecord }>(
            `/recruitment/admin/sell-accounts/${encodeURIComponent(editingRecord.id)}`,
            buildApiPayload(finalizedRecord),
          )
          : await api.post<{ record?: SellAccountApiRecord }>(
            '/recruitment/admin/sell-accounts',
            buildApiPayload(finalizedRecord),
          );
        if (response.data?.record) {
          const serverRecord = normalizeServerSellAccount(response.data.record);
          setRecords((current) => [serverRecord, ...current.filter((item) => item.id !== editingRecord.id && item.listingId !== serverRecord.listingId)]);
          setEditingRecord(null);
          setIsCreateModalOpen(false);
          await deleteDocumentFiles(Object.values(pendingReplacedDocuments).flat());
          setPendingReplacedDocuments({});
          toast.success(getAccountSaveSuccessToast('Sell Account', 'create'));
          return;
        }
      } catch (error) {
        console.warn('Sell Account draft finalization failed; retaining local record.', error);
      }

      const finalizedRecords = replaceSellAccountRecord(records, finalizedRecord);
      try {
        localStorage.setItem('jcb_sell_accounts_records', JSON.stringify(finalizedRecords));
      } catch {
        setFormErrors((current) => ({ ...current, documents: 'Unable to save this record. Please try again.' }));
        toast.error(getAccountSaveErrorToast('Sell Account'));
        return;
      }
      setRecords(finalizedRecords);
      setEditingRecord(null);
      setIsCreateModalOpen(false);
      await deleteDocumentFiles(Object.values(pendingReplacedDocuments).flat());
      setPendingReplacedDocuments({});
      toast.success(getAccountSaveSuccessToast('Sell Account', 'create'));
      return;
    }

    try {
      const response = await api.put<{ record?: SellAccountApiRecord }>(`/recruitment/admin/sell-accounts/${encodeURIComponent(editingRecord.id)}`, buildApiPayload(formData));
      if (response.data?.record) {
        const serverRecord = normalizeServerSellAccount(response.data.record);
        setRecords((current) => replaceSellAccountRecord(current, serverRecord));
        setEditingRecord(null);
        await deleteDocumentFiles(Object.values(pendingReplacedDocuments).flat());
        setPendingReplacedDocuments({});
        toast.success(getAccountSaveSuccessToast('Sell Account', 'edit'));
        return;
      }
    } catch (error) {
      console.warn('Sell Account API update failed; retaining local draft fallback.', error);
    }

    const updatedRecords = replaceSellAccountRecord(records, updatedRecord);

    try {
      localStorage.setItem('jcb_sell_accounts_records', JSON.stringify(updatedRecords));
    } catch {
      setFormErrors((current) => ({ ...current, documents: 'Unable to save this record. Please try again.' }));
      toast.error(getAccountSaveErrorToast('Sell Account'));
      return;
    }

    setRecords(updatedRecords);
    setEditingRecord(null);
    await deleteDocumentFiles(Object.values(pendingReplacedDocuments).flat());
    setPendingReplacedDocuments({});
    toast.success(getAccountSaveSuccessToast('Sell Account', 'edit'));
  };

  // Confirm Delete
  const handleDeleteConfirm = async () => {
    if (!canDeleteSellAccounts) return;
    if (!deletingRecordId) return;
    const recordToDelete = records.find((record) => record.id === deletingRecordId);
    if (recordToDelete?.isLocked) {
      toast.info('This record is locked and can only be viewed.');
      setDeletingRecordId(null);
      return;
    }
    if (recordToDelete?.rtoRecord?.id) {
      toast.info('This Sell Account was transferred to RTO Work Status. Delete it from the RTO Work Status section first.');
      setDeletingRecordId(null);
      return;
    }
    try {
      await api.delete(`/recruitment/admin/sell-accounts/${encodeURIComponent(deletingRecordId)}`);
    } catch (error) {
      const message = getSellAccountApiError(error, 'Unable to delete Sell Account.');
      toast.error(message);
      return;
    }
    await deleteDocumentFiles(recordToDelete ? Object.values(getDocuments(recordToDelete)) : []);
    setRecords(removeSellAccountRecord(records, deletingRecordId));
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
        (item.chassisNumber || '').toLowerCase().includes(q) ||
        item.sellerName.toLowerCase().includes(q) ||
        item.sellerNumber.includes(q) ||
        item.purchaserName.toLowerCase().includes(q) ||
        item.purchaserNumber.includes(q) ||
        item.brandName.toLowerCase().includes(q) ||
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
    { header: 'Registration Number', value: (record: SellAccountRecord) => record.vehicleNumber },
    { header: 'Chassis Number', value: (record: SellAccountRecord) => record.chassisNumber || '' },
    { header: 'Sell Date', value: (record: SellAccountRecord) => formatDate(record.sellDate) },
    { header: 'Vehicle Type', value: (record: SellAccountRecord) => record.vehicleType },
    { header: 'Brand', value: (record: SellAccountRecord) => record.brandName },
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

  const financePreview = useMemo(() => calculateSellAccountFinance({
    sellAmount: formData.sellAmount,
    purchaseAmount: formData.purchaseAmount,
    expenses: formData.expenses,
    taxMode: formData.taxMode,
    sellerState: formData.sellerState,
    purchaserState: formData.purchaserState,
    payments: formData.payments,
  }), [formData.expenses, formData.payments, formData.purchaseAmount, formData.purchaserState, formData.sellAmount, formData.sellerState, formData.taxMode]);

  const handleStartRtoWork = async () => {
    if (!editingRecord || !canManageRto) return;
    if (editingRecord.isLocked) {
      toast.info('This record is locked and can only be viewed.');
      return;
    }

    if (isSellAccountDraft(editingRecord)) {
      toast.info('Save the Sell Account record before starting RTO work.');
      return;
    }

    if (editingRecord.rtoRecord?.id) {
      setIsCreateModalOpen(false);
      setEditingRecord(null);
      router.push(`${rtoBasePath}?edit=${encodeURIComponent(editingRecord.rtoRecord.id)}`);
      return;
    }

    if (financePreview.payments.purchaserPaymentStatus !== 'FULL') {
      toast.info('Full purchaser payment is required before starting RTO work.');
      return;
    }

    setStartingRto(true);
    try {
      const response = await api.post<{
        record?: SellAccountApiRecord;
        rtoRecord?: { id?: string } | null;
      }>(`/recruitment/admin/sell-accounts/${encodeURIComponent(editingRecord.id)}/start-rto`);

      if (!response.data?.record || !response.data.rtoRecord?.id) {
        throw new Error('RTO work link was not returned by the server.');
      }

      const serverRecord = normalizeServerSellAccount(response.data.record);
      setRecords((current) => replaceSellAccountRecord(current, serverRecord));
      setEditingRecord(serverRecord);
      setFormData(serverRecord);
      syncRawInputs(serverRecord);
      toast.success('RTO work linked successfully.');
      setIsCreateModalOpen(false);
      setEditingRecord(null);
      router.push(`${rtoBasePath}?edit=${encodeURIComponent(response.data.rtoRecord.id)}`);
    } catch (error) {
      console.warn('Unable to start RTO work from Sell Account.', error);
      toast.error(getSellAccountApiError(error, 'Unable to start RTO work. Please try again.'));
    } finally {
      setStartingRto(false);
    }
  };

  const handleSaveAndStartRtoWork = async () => {
    if (!canManageRto) {
      toast.error('RTO Work Status permission is required.');
      return;
    }
    if (editingRecord?.rtoRecord?.id) {
      await handleStartRtoWork();
      return;
    }
    if (kycBusyKey) {
      toast.info('Please wait until identity verification finishes.');
      return;
    }
    if (activeDocumentUploads > 0) {
      toast.info('Please wait until all document uploads finish.');
      return;
    }
    if (!validateForm()) return;
    if (financePreview.payments.purchaserPaymentStatus !== 'FULL') {
      toast.info('Full purchaser payment is required before starting RTO work.');
      return;
    }

    setStartingRto(true);
    try {
      const payload = { ...buildApiPayload(formData), isDraft: false };
      const isPersistedRecord = Boolean(editingRecord?.id && !editingRecord.id.startsWith('DRAFT-SELL-'));
      const endpoint = isPersistedRecord
        ? `/recruitment/admin/sell-accounts/${encodeURIComponent(editingRecord?.id || '')}/save-and-start-rto`
        : '/recruitment/admin/sell-accounts/save-and-start-rto';
      const response = await api.post<{
        record?: SellAccountApiRecord;
        rtoRecord?: { id?: string } | null;
      }>(endpoint, payload);

      if (!response.data?.record || !response.data.rtoRecord?.id) {
        throw new Error('RTO work link was not returned by the server.');
      }

      const serverRecord = normalizeServerSellAccount(response.data.record);
      setRecords((current) => upsertSellAccountRecord(current, serverRecord));
      setFormData(serverRecord);
      setEditingRecord(serverRecord);
      syncRawInputs(serverRecord);
      await deleteDocumentFiles(Object.values(pendingReplacedDocuments).flat());
      setPendingReplacedDocuments({});
      setStartRtoRequested(false);
      setIsCreateModalOpen(false);
      setEditingRecord(null);
      toast.success('Sell Account saved and RTO work started.');
      router.push(`${rtoBasePath}?edit=${encodeURIComponent(response.data.rtoRecord.id)}`);
    } catch (error) {
      console.warn('Unable to save Sell Account and start RTO work.', error);
      toast.error(getSellAccountApiError(error, 'Unable to save and start RTO work. Please try again.'));
    } finally {
      setStartingRto(false);
    }
  };

  const hasLinkedRtoRecord = Boolean(editingRecord?.rtoRecord?.id);
  const canSaveAndStartRto = shouldShowSaveAndStartRto({
    requested: startRtoRequested,
    canManageRto,
    hasRtoRecord: hasLinkedRtoRecord,
    purchaserPaymentStatus: financePreview.payments.purchaserPaymentStatus,
  });

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
                <th className="px-5 py-4">Vehicle, Brand & Model</th>
                <th className="px-5 py-4">Owner Info</th>
                <th className="px-5 py-4">Seller Info</th>
                <th className="px-5 py-4">Purchaser Info</th>
                <th className="px-5 py-4">Financials (Purchase / Sell)</th>
                <th className="px-5 py-4">Deal Status</th>
                <th className="px-5 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr><td colSpan={7}><BrandLoader variant="section" size="sm" bg="light" text="Loading sell accounts..." /></td></tr>
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
                            <p className="text-xs text-gray-500">{item.brandName ? `${item.brandName} · ` : ''}{item.vehicleModel}</p>
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

                      <td className="px-5 py-4 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border whitespace-nowrap shrink-0 ${statusInfo.bg} ${statusInfo.text} ${statusInfo.border}`}
                          title={statusInfo.label}
                        >
                          <StatusIcon className="w-3.5 h-3.5" />
                          {statusInfo.shortLabel || statusInfo.label}
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
                              {canUpdateSellAccounts && !item.isLocked ? <button
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
                              {canDeleteSellAccounts && !item.isLocked ? <button
                                type="button"
                                onClick={() => {
                                  setActionMenuId(null);
                                  if (item.rtoRecord?.id) {
                                    toast.info('This Sell Account was transferred to RTO Work Status. Delete it from the RTO Work Status section first.');
                                    return;
                                  }
                                  setDeletingRecordId(item.id);
                                }}
                                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-50 transition-colors"
                              >
                                <Trash2 className="w-3.5 h-3.5 text-rose-500" />
                                Delete
                              </button> : null}
                              {item.isLocked ? <div className="flex items-center gap-2 px-3 py-2 text-xs font-semibold text-slate-600"><LockKeyhole className="h-3.5 w-3.5" />Locked · View only</div> : null}
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

      {/* CREATE & EDIT FORM MODAL */}
      {(isCreateModalOpen || editingRecord) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/60 p-3 sm:p-6 backdrop-blur-sm">
          <div className="my-auto flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-gray-200/90 bg-white shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="sticky top-0 z-20 flex shrink-0 items-center justify-between border-b border-gray-100 bg-white/95 px-6 py-4.5 backdrop-blur-md">
              <div className="flex items-center gap-3.5 min-w-0">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-700">
                  <Car className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${editingRecord?.isDraft
                        ? 'border-amber-300 bg-amber-50 text-amber-900'
                        : editingRecord
                          ? 'border-blue-200 bg-blue-50 text-blue-900'
                          : 'border-emerald-200 bg-emerald-50 text-emerald-900'
                        }`}
                    >
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${editingRecord?.isDraft
                          ? 'bg-amber-500 animate-pulse'
                          : editingRecord
                            ? 'bg-blue-600'
                            : 'bg-emerald-600'
                          }`}
                      />
                      {editingRecord
                        ? editingRecord.isDraft
                          ? `Draft: ${editingRecord.id}`
                          : `Record: ${editingRecord.id}`
                        : 'New Sell Account'}
                    </span>
                  </div>
                  <h3 className="text-lg sm:text-xl font-extrabold tracking-tight text-gray-950 truncate">
                    <span>{editingRecord ? 'Edit Sell Account Record' : 'Create Sell Account Record'}</span>
                    {activeVehicleName ? (
                      <span className="text-amber-600 font-bold ml-1.5 sm:ml-2">
                        : {activeVehicleName}
                      </span>
                    ) : null}
                  </h3>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0 ml-3">
                <button
                  type="button"
                  onClick={handleSaveDraft}
                  disabled={activeDocumentUploads > 0 || Boolean(editingRecord && !isSellAccountDraft(editingRecord))}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-amber-300/80 bg-amber-50 px-3.5 py-2 text-xs font-bold text-amber-900 transition hover:bg-amber-100/90 disabled:cursor-not-allowed disabled:opacity-40 shadow-xs"
                  title="Save current progress as draft"
                >
                  <Bookmark className="h-3.5 w-3.5 text-amber-700" />
                  <span className="hidden sm:inline">Save draft</span>
                </button>
                <button
                  type="button"
                  onClick={() => void closeForm()}
                  className="flex h-9 w-9 items-center justify-center rounded-xl text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"
                  aria-label="Close sell account form"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            {/* Form */}
            <form onSubmit={editingRecord ? handleEditSubmit : handleCreateSubmit} className="flex flex-col flex-1 min-h-0">
              {/* Scrollable Body */}
              <div className="flex-1 overflow-y-auto custom-scrollbar p-5 sm:p-6 space-y-6">
                {/* SECTION 1: VEHICLE & OWNER DETAILS */}
                <div className="rounded-2xl border border-gray-200/80 bg-white p-5 shadow-xs space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 pb-3">
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-500/10 text-amber-700">
                        <Car className="h-4 w-4" />
                      </div>
                      <h4 className="text-xs font-bold uppercase tracking-wider text-gray-900">
                        1. Vehicle & Owner Details
                      </h4>
                    </div>
                    <span className="text-[11px] font-semibold text-gray-400">Section 1 of 7</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                        Owner Name <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. Ramesh Patel"
                        value={formData.ownerName}
                        required
                        onChange={(e) => handleInputChange('ownerName', e.target.value)}
                        className={`h-10 w-full rounded-xl border bg-gray-50/60 px-3.5 text-sm font-medium text-gray-900 placeholder:text-gray-400 focus:bg-white focus:outline-none focus:ring-4 focus:ring-amber-500/10 transition-all ${formErrors.ownerName ? 'border-rose-500 focus:border-rose-500 focus:ring-rose-500/10' : 'border-gray-200 focus:border-amber-500'
                          }`}
                      />
                      {formErrors.ownerName && <p className="text-[11px] font-medium text-rose-500 mt-1">{formErrors.ownerName}</p>}
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                        Owner Mobile Number <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. 9876543210"
                        maxLength={10}
                        value={formData.ownerNumber}
                        required
                        onChange={(e) => handleInputChange('ownerNumber', e.target.value)}
                        className={`h-10 w-full rounded-xl border bg-gray-50/60 px-3.5 text-sm font-medium text-gray-900 placeholder:text-gray-400 focus:bg-white focus:outline-none focus:ring-4 focus:ring-amber-500/10 transition-all ${formErrors.ownerNumber ? 'border-rose-500 focus:border-rose-500 focus:ring-rose-500/10' : 'border-gray-200 focus:border-amber-500'
                          }`}
                      />
                      {formErrors.ownerNumber && <p className="text-[11px] font-medium text-rose-500 mt-1">{formErrors.ownerNumber}</p>}
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                        Registration Number <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. MH-12-AB-1234"
                        value={formData.vehicleNumber}
                        required
                        onChange={(e) => handleInputChange('vehicleNumber', e.target.value)}
                        className={`h-10 w-full rounded-xl border bg-gray-50/60 px-3.5 text-sm font-medium uppercase text-gray-900 placeholder:text-gray-400 focus:bg-white focus:outline-none focus:ring-4 focus:ring-amber-500/10 transition-all ${formErrors.vehicleNumber ? 'border-rose-500 focus:border-rose-500 focus:ring-rose-500/10' : 'border-gray-200 focus:border-amber-500'
                          }`}
                      />
                      {formErrors.vehicleNumber && <p className="text-[11px] font-medium text-rose-500 mt-1">{formErrors.vehicleNumber}</p>}
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                        Chassis Number <span className="text-[10px] text-gray-400 font-normal">(Optional)</span>
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. JCB3DX2026CHASSIS"
                        maxLength={40}
                        value={formData.chassisNumber || ''}
                        onChange={(e) => handleInputChange('chassisNumber', e.target.value)}
                        className="h-10 w-full rounded-xl border border-gray-200 bg-gray-50/60 px-3.5 text-sm font-medium uppercase text-gray-900 placeholder:text-gray-400 focus:bg-white focus:border-amber-500 focus:outline-none focus:ring-4 focus:ring-amber-500/10 transition-all"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                        {t('listingDetails.category', 'Category')} <span className="text-rose-500">*</span>
                      </label>
                      <SearchableSelect
                        options={categories.map((cat) => ({ id: cat.name, name: cat.name }))}
                        value={formData.vehicleType}
                        displayValue={formData.vehicleType || t('listingDetails.selectCategory', 'Select Category')}
                        onChange={(opt) => handleInputChange('vehicleType', String(opt.id))}
                        searchable={true}
                        placeholder={t('listingDetails.selectCategory', 'Select Category')}
                        className={`w-full bg-gray-50/60 rounded-xl ${formErrors.vehicleType ? 'border-rose-500' : 'border-gray-200'}`}
                      />
                      {formErrors.vehicleType && <p className="text-[11px] font-medium text-rose-500 mt-1">{formErrors.vehicleType}</p>}
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                        {t('listingDetails.brand', 'Brand')} <span className="text-rose-500">*</span>
                      </label>
                      <SearchableSelect
                        options={brands.map((brand) => ({ id: brand.id, name: brand.name }))}
                        value={formData.brandName}
                        displayValue={formData.brandName || t('listingDetails.selectBrand', 'Select Brand')}
                        onChange={(option) => handleInputChange('brandName', option.name)}
                        searchable
                        placeholder={t('listingDetails.selectBrand', 'Select Brand')}
                        className={`w-full bg-gray-50/60 rounded-xl ${formErrors.brandName ? 'border-rose-500' : 'border-gray-200'}`}
                      />
                      {formErrors.brandName && <p className="text-[11px] font-medium text-rose-500 mt-1">{formErrors.brandName}</p>}
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                        {t('listingDetails.model', 'Vehicle Model')} <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. JCB 3DX Super 2023"
                        value={formData.vehicleModel}
                        required
                        onChange={(e) => handleInputChange('vehicleModel', e.target.value)}
                        className={`h-10 w-full rounded-xl border bg-gray-50/60 px-3.5 text-sm font-medium text-gray-900 placeholder:text-gray-400 focus:bg-white focus:outline-none focus:ring-4 focus:ring-amber-500/10 transition-all ${formErrors.vehicleModel ? 'border-rose-500 focus:border-rose-500 focus:ring-rose-500/10' : 'border-gray-200 focus:border-amber-500'
                          }`}
                      />
                      {formErrors.vehicleModel && <p className="text-[11px] font-medium text-rose-500 mt-1">{formErrors.vehicleModel}</p>}
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                        Sell Date <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="date"
                        value={formData.sellDate}
                        required
                        onChange={(e) => handleInputChange('sellDate', e.target.value)}
                        className={`h-10 w-full rounded-xl border bg-gray-50/60 px-3.5 text-sm font-medium text-gray-900 focus:bg-white focus:outline-none focus:ring-4 focus:ring-amber-500/10 transition-all ${formErrors.sellDate ? 'border-rose-500 focus:border-rose-500 focus:ring-rose-500/10' : 'border-gray-200 focus:border-amber-500'
                          }`}
                      />
                      {formErrors.sellDate && <p className="text-[11px] font-medium text-rose-500 mt-1">{formErrors.sellDate}</p>}
                    </div>
                  </div>
                </div>

                {/* SECTION 2: SELLER & PURCHASER DETAILS */}
                <div className="rounded-2xl border border-gray-200/80 bg-white p-5 shadow-xs space-y-4">
                  <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-500/10 text-blue-700">
                        <User className="h-4 w-4" />
                      </div>
                      <h4 className="text-xs font-bold uppercase tracking-wider text-gray-900">
                        2. Seller & Purchaser Details
                      </h4>
                    </div>
                    <span className="text-[11px] font-semibold text-gray-400">Section 2 of 7</span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    {/* Purchaser Group */}
                    <div className="rounded-xl border border-blue-100 bg-gradient-to-b from-blue-50/30 via-white to-white p-4.5 shadow-xs space-y-3.5">
                      <div className="flex items-center justify-between border-b border-blue-100/70 pb-2.5">
                        <div className="flex items-center gap-2">
                          <span className="flex h-5 w-5 items-center justify-center rounded-md bg-blue-100 text-blue-700 text-[11px] font-bold">P</span>
                          <p className="text-xs font-bold uppercase tracking-wider text-blue-950">Purchaser Information</p>
                        </div>
                        <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-blue-700 border border-blue-200/60">Buyer Side</span>
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-gray-700 mb-1">
                          Purchaser Name <span className="text-rose-500">*</span>
                        </label>
                        <input
                          type="text"
                          placeholder="Purchaser Name"
                          value={formData.purchaserName}
                          required
                          onChange={(e) => handleInputChange('purchaserName', e.target.value)}
                          className={`h-10 w-full rounded-xl border bg-white px-3.5 text-sm font-medium text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-4 focus:ring-blue-500/10 transition-all ${formErrors.purchaserName ? 'border-rose-500 focus:border-rose-500' : 'border-gray-200 focus:border-blue-500'
                            }`}
                        />
                        {formErrors.purchaserName && <p className="text-[11px] font-medium text-rose-500 mt-1">{formErrors.purchaserName}</p>}
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-gray-700 mb-1">
                          Purchaser Mobile Number <span className="text-rose-500">*</span>
                        </label>
                        <input
                          type="text"
                          placeholder="10-digit Mobile"
                          maxLength={10}
                          value={formData.purchaserNumber}
                          required
                          onChange={(e) => handleInputChange('purchaserNumber', e.target.value)}
                          className={`h-10 w-full rounded-xl border bg-white px-3.5 text-sm font-medium text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-4 focus:ring-blue-500/10 transition-all ${formErrors.purchaserNumber ? 'border-rose-500 focus:border-rose-500' : 'border-gray-200 focus:border-blue-500'
                            }`}
                        />
                        {formErrors.purchaserNumber && <p className="text-[11px] font-medium text-rose-500 mt-1">{formErrors.purchaserNumber}</p>}
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-gray-700 mb-1">
                          Purchaser Date <span className="text-rose-500">*</span>
                        </label>
                        <input
                          type="date"
                          value={formData.purchaserDate || ''}
                          required
                          onChange={(e) => handleInputChange('purchaserDate', e.target.value)}
                          className={`h-10 w-full rounded-xl border bg-white px-3.5 text-sm font-medium text-gray-900 focus:outline-none focus:ring-4 focus:ring-blue-500/10 transition-all ${formErrors.purchaserDate ? 'border-rose-500 focus:border-rose-500' : 'border-gray-200 focus:border-blue-500'
                            }`}
                        />
                        {formErrors.purchaserDate && <p className="text-[11px] font-medium text-rose-500 mt-1">{formErrors.purchaserDate}</p>}
                      </div>
                    </div>

                    {/* Seller Group */}
                    <div className="rounded-xl border border-amber-100 bg-gradient-to-b from-amber-50/30 via-white to-white p-4.5 shadow-xs space-y-3.5">
                      <div className="flex items-center justify-between border-b border-amber-100/70 pb-2.5">
                        <div className="flex items-center gap-2">
                          <span className="flex h-5 w-5 items-center justify-center rounded-md bg-amber-100 text-amber-800 text-[11px] font-bold">S</span>
                          <p className="text-xs font-bold uppercase tracking-wider text-amber-950">Seller Information</p>
                        </div>
                        <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-800 border border-amber-200/60">Seller Side</span>
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-gray-700 mb-1">
                          Seller Name <span className="text-rose-500">*</span>
                        </label>
                        <input
                          type="text"
                          placeholder="Seller Name"
                          value={formData.sellerName}
                          required
                          onChange={(e) => handleInputChange('sellerName', e.target.value)}
                          className={`h-10 w-full rounded-xl border bg-white px-3.5 text-sm font-medium text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-4 focus:ring-amber-500/10 transition-all ${formErrors.sellerName ? 'border-rose-500 focus:border-rose-500' : 'border-gray-200 focus:border-amber-500'
                            }`}
                        />
                        {formErrors.sellerName && <p className="text-[11px] font-medium text-rose-500 mt-1">{formErrors.sellerName}</p>}
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-gray-700 mb-1">
                          Seller Mobile Number <span className="text-rose-500">*</span>
                        </label>
                        <input
                          type="text"
                          placeholder="10-digit Mobile"
                          maxLength={10}
                          value={formData.sellerNumber}
                          required
                          onChange={(e) => handleInputChange('sellerNumber', e.target.value)}
                          className={`h-10 w-full rounded-xl border bg-white px-3.5 text-sm font-medium text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-4 focus:ring-amber-500/10 transition-all ${formErrors.sellerNumber ? 'border-rose-500 focus:border-rose-500' : 'border-gray-200 focus:border-amber-500'
                            }`}
                        />
                        {formErrors.sellerNumber && <p className="text-[11px] font-medium text-rose-500 mt-1">{formErrors.sellerNumber}</p>}
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-gray-700 mb-1">
                          Seller Date <span className="text-rose-500">*</span>
                        </label>
                        <input
                          type="date"
                          value={formData.sellerDate || ''}
                          required
                          onChange={(e) => handleInputChange('sellerDate', e.target.value)}
                          className={`h-10 w-full rounded-xl border bg-white px-3.5 text-sm font-medium text-gray-900 focus:outline-none focus:ring-4 focus:ring-amber-500/10 transition-all ${formErrors.sellerDate ? 'border-rose-500 focus:border-rose-500' : 'border-gray-200 focus:border-amber-500'
                            }`}
                        />
                        {formErrors.sellerDate && <p className="text-[11px] font-medium text-rose-500 mt-1">{formErrors.sellerDate}</p>}
                      </div>
                    </div>
                  </div>
                </div>

                {/* SECTION 3: FINANCIAL BREAKDOWN */}
                <div className="rounded-2xl border border-gray-200/80 bg-white p-5 shadow-xs space-y-4">
                  <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-700">
                        <DollarSign className="h-4 w-4" />
                      </div>
                      <h4 className="text-xs font-bold uppercase tracking-wider text-gray-900">
                        3. Financial Breakdown & Calculation
                      </h4>
                    </div>
                    <span className="text-[11px] font-semibold text-gray-400">Section 3 of 7</span>
                  </div>

                  <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1.5 truncate">
                        Purchase Amount (₹) <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="text"
                        inputMode="numeric"
                        placeholder="0"
                        value={rawInputs.purchaseAmount}
                        onChange={(e) => handleInputChange('purchaseAmount', e.target.value)}
                        className={`h-10 w-full rounded-xl border bg-gray-50/60 px-3.5 text-sm font-semibold text-gray-900 placeholder:text-gray-400 focus:bg-white focus:outline-none focus:ring-4 focus:ring-amber-500/10 transition-all ${formErrors.purchaseAmount ? 'border-rose-500 focus:border-rose-500' : 'border-gray-200 focus:border-amber-500'
                          }`}
                      />
                      {formErrors.purchaseAmount && <p className="text-[11px] font-medium text-rose-500 mt-1">{formErrors.purchaseAmount}</p>}
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1.5 truncate">
                        Sell Amount (₹) <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="text"
                        inputMode="numeric"
                        placeholder="0"
                        value={rawInputs.sellAmount}
                        onChange={(e) => handleInputChange('sellAmount', e.target.value)}
                        className={`h-10 w-full rounded-xl border bg-gray-50/60 px-3.5 text-sm font-semibold text-gray-900 placeholder:text-gray-400 focus:bg-white focus:outline-none focus:ring-4 focus:ring-amber-500/10 transition-all ${formErrors.sellAmount ? 'border-rose-500 focus:border-rose-500' : 'border-gray-200 focus:border-amber-500'
                          }`}
                      />
                      {formErrors.sellAmount && <p className="text-[11px] font-medium text-rose-500 mt-1">{formErrors.sellAmount}</p>}
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1.5 truncate">
                        Expenses (₹) <span className="text-[10px] text-gray-400 font-normal">(Optional)</span>
                      </label>
                      <input
                        type="text"
                        inputMode="numeric"
                        placeholder="0"
                        value={rawInputs.expenses}
                        onChange={(e) => handleInputChange('expenses', e.target.value)}
                        className="h-10 w-full rounded-xl border border-gray-200 bg-gray-50/60 px-3.5 text-sm font-semibold text-gray-900 placeholder:text-gray-400 focus:bg-white focus:border-amber-500 focus:outline-none focus:ring-4 focus:ring-amber-500/10 transition-all"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1.5 truncate">Purchaser State</label>
                      <SearchableSelect
                        options={states}
                        value={formData.purchaserState || ''}
                        displayValue={formData.purchaserState || ''}
                        placeholder="Select purchaser state"
                        searchable
                        onChange={(option) => handleInputChange('purchaserState', option.name)}
                        className="w-full [&>button]:h-10 [&>button]:rounded-xl [&>button]:bg-gray-50/60 [&>button]:border-gray-200 [&>button]:px-3.5 [&>button]:text-sm [&>button]:font-medium [&>button]:text-gray-900 [&>button]:transition-all [&>button]:focus:border-amber-500 [&>button]:focus:ring-4 [&>button]:focus:ring-amber-500/10"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1.5 truncate">Seller State</label>
                      <SearchableSelect
                        options={states}
                        value={formData.sellerState || ''}
                        displayValue={formData.sellerState || ''}
                        placeholder="Select seller state"
                        searchable
                        onChange={(option) => handleInputChange('sellerState', option.name)}
                        className="w-full [&>button]:h-10 [&>button]:rounded-xl [&>button]:bg-gray-50/60 [&>button]:border-gray-200 [&>button]:px-3.5 [&>button]:text-sm [&>button]:font-medium [&>button]:text-gray-900 [&>button]:transition-all [&>button]:focus:border-amber-500 [&>button]:focus:ring-4 [&>button]:focus:ring-amber-500/10"
                      />
                    </div>
                  </div>

                  <div className="rounded-2xl border border-gray-200 bg-gray-50/90 p-4 shadow-xs">
                    {/* Breakdown Cards: Gross ➔ Taxable Value ➔ GST ➔ Net Profit */}
                    <div className={`grid grid-cols-2 gap-3 sm:grid-cols-2 ${financePreview.gst.isIntraState ? 'lg:grid-cols-5' : 'lg:grid-cols-4'}`}>
                      {/* 1. Gross */}
                      <div className="rounded-xl border border-gray-200/90 bg-white p-3.5 shadow-2xs">
                        <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500">Gross</p>
                        <p className={`text-base font-extrabold mt-1 ${financePreview.gst.netProfitBeforeGst >= 0 ? 'text-gray-950' : 'text-rose-600'}`}>
                          ₹{financePreview.gst.netProfitBeforeGst.toLocaleString('en-IN')}
                        </p>
                      </div>

                      {/* 2. Taxable Value */}
                      <div className="rounded-xl border border-gray-200/90 bg-white p-3.5 shadow-2xs">
                        <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500">Taxable Value</p>
                        <p className="text-base font-extrabold text-gray-950 mt-1">₹{financePreview.gst.taxableAmount.toLocaleString('en-IN')}</p>
                      </div>

                      {/* 3. GST Component(s): IGST (18%) OR CGST (9%) + SGST (9%) */}
                      {getSellAccountTaxLines(financePreview.gst).map((taxLine) => (
                        <div key={taxLine.key} className="rounded-xl border border-blue-200/80 bg-blue-50/60 p-3.5 shadow-2xs">
                          <p className="text-[11px] font-bold uppercase tracking-wider text-blue-700">{taxLine.label}</p>
                          <p className="text-base font-extrabold text-blue-950 mt-1">₹{taxLine.amount.toLocaleString('en-IN')}</p>
                        </div>
                      ))}

                      {/* 4. Final Net Profit */}
                      <div className="rounded-xl border border-emerald-200/90 bg-emerald-50/70 p-3.5 shadow-2xs">
                        <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-800">Final Net Profit</p>
                        <p className={`text-base font-extrabold mt-1 ${financePreview.gst.netProfitAfterGst >= 0 ? 'text-emerald-700' : 'text-rose-600'}`}>
                          ₹{financePreview.gst.netProfitAfterGst.toLocaleString('en-IN')}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* SECTION 4: PAYMENT TRACKING */}
                <div className="rounded-2xl border border-gray-200/80 bg-white p-5 shadow-xs space-y-4">
                  <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-500/10 text-amber-700">
                        <Wallet className="h-4 w-4" />
                      </div>
                      <h4 className="text-xs font-bold uppercase tracking-wider text-gray-900">
                        4. Payment Tracking
                      </h4>
                    </div>
                    <span className="text-[11px] font-semibold text-gray-400">Section 4 of 7</span>
                  </div>

                  <div className="grid grid-cols-1 gap-3.5 rounded-xl border border-gray-200/80 bg-gray-50/60 p-4 sm:grid-cols-2 lg:grid-cols-6">
                    <div className="lg:col-span-2">
                      <label className="mb-1.5 block text-xs font-semibold text-gray-700">Payment side</label>
                      <div className="flex h-10 items-center rounded-xl border border-gray-200 bg-white px-3.5 text-sm font-semibold text-gray-800">
                        Purchaser receipt
                      </div>
                    </div>
                    <div>
                      <label className="mb-1.5 block text-xs font-semibold text-gray-700">Amount (₹)</label>
                      <input
                        type="number"
                        min="0.01"
                        step="0.01"
                        value={paymentDraft.amount}
                        onChange={(e) => setPaymentDraft((current) => ({ ...current, amount: e.target.value }))}
                        className="h-10 w-full rounded-xl border border-gray-200 bg-white px-3.5 text-sm font-medium focus:border-amber-500 focus:outline-none focus:ring-4 focus:ring-amber-500/10"
                        placeholder="0.00"
                      />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-xs font-semibold text-gray-700">Payment date</label>
                      <input
                        type="date"
                        value={paymentDraft.paymentDate}
                        onChange={(e) => setPaymentDraft((current) => ({ ...current, paymentDate: e.target.value }))}
                        className="h-10 w-full rounded-xl border border-gray-200 bg-white px-3.5 text-sm font-medium focus:border-amber-500 focus:outline-none focus:ring-4 focus:ring-amber-500/10"
                      />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-xs font-semibold text-gray-700">Method</label>
                      <SearchableSelect
                        options={['CASH', 'UPI', 'BANK_TRANSFER', 'CHEQUE', 'OTHER'].map((method) => ({ id: method, name: method.replace('_', ' ') }))}
                        value={paymentDraft.method}
                        displayValue={paymentDraft.method.replace('_', ' ')}
                        onChange={(option) => setPaymentDraft((current) => ({ ...current, method: String(option.id) as SellAccountPayment['method'] }))}
                        searchable={false}
                        className="w-full bg-white rounded-xl"
                      />
                    </div>
                    <div className="flex items-end">
                      <button
                        type="button"
                        onClick={addPaymentEntry}
                        className="h-10 w-full rounded-xl bg-slate-900 px-3.5 text-xs font-bold text-white transition hover:bg-slate-800 shadow-sm"
                      >
                        Add payment
                      </button>
                    </div>
                    <div className="lg:col-span-3">
                      <label className="mb-1.5 block text-xs font-semibold text-gray-700">Reference (optional)</label>
                      <input
                        type="text"
                        value={paymentDraft.reference}
                        onChange={(e) => setPaymentDraft((current) => ({ ...current, reference: e.target.value }))}
                        placeholder="UTR / cheque no. / receipt no."
                        className="h-10 w-full rounded-xl border border-gray-200 bg-white px-3.5 text-sm font-medium focus:border-amber-500 focus:outline-none focus:ring-4 focus:ring-amber-500/10"
                      />
                    </div>
                    <div className="lg:col-span-3">
                      <label className="mb-1.5 block text-xs font-semibold text-gray-700">Payment note (optional)</label>
                      <input
                        type="text"
                        value={paymentDraft.note}
                        onChange={(e) => setPaymentDraft((current) => ({ ...current, note: e.target.value }))}
                        placeholder="Optional payment remark"
                        className="h-10 w-full rounded-xl border border-gray-200 bg-white px-3.5 text-sm font-medium focus:border-amber-500 focus:outline-none focus:ring-4 focus:ring-amber-500/10"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="rounded-xl border border-blue-200/80 bg-blue-50/70 p-3.5">
                      <p className="text-xs font-bold uppercase tracking-wider text-blue-700">Vehicle purchaser received (Customer)</p>
                      <p className="text-xl font-extrabold text-blue-950 mt-1">₹{financePreview.payments.purchaserReceived.toLocaleString('en-IN')}</p>
                      <p className="text-xs text-blue-800 font-medium mt-1">Payable: ₹{formData.sellAmount.toLocaleString('en-IN')} · Balance: ₹{financePreview.payments.purchaserBalance.toLocaleString('en-IN')}</p>
                    </div>
                    <div className="rounded-xl border border-emerald-200/80 bg-emerald-50/70 p-3.5">
                      <p className="text-xs font-bold uppercase tracking-wider text-emerald-700">Automatic deal status</p>
                      <p className="mt-1 text-base font-extrabold text-emerald-950">{DEAL_STATUS_CONFIG[formData.dealStatus].label}</p>
                    </div>
                  </div>

                  {(formData.payments || []).length > 0 ? (
                    <div className="overflow-x-auto rounded-xl border border-gray-200 shadow-xs">
                      <table className="min-w-full text-left text-xs">
                        <thead className="bg-gray-50 text-gray-600 font-bold uppercase tracking-wider">
                          <tr>
                            <th className="px-3.5 py-2.5">Side</th>
                            <th className="px-3.5 py-2.5">Amount</th>
                            <th className="px-3.5 py-2.5">Date</th>
                            <th className="px-3.5 py-2.5">Method</th>
                            <th className="px-3.5 py-2.5">Reference</th>
                            <th className="px-3.5 py-2.5 text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {(formData.payments || []).map((payment, index) => (
                            <tr key={payment.id || `${payment.paymentDate}-${index}`} className="hover:bg-gray-50/60 transition-colors">
                              <td className="px-3.5 py-2.5 font-semibold text-gray-900">
                                {payment.side === 'PURCHASER_RECEIPT' ? 'Purchaser receipt' : 'Seller payment'}
                              </td>
                              <td className="px-3.5 py-2.5 font-bold text-gray-900">₹{payment.amount.toLocaleString('en-IN')}</td>
                              <td className="px-3.5 py-2.5 text-gray-600">{formatDate(payment.paymentDate)}</td>
                              <td className="px-3.5 py-2.5">
                                <span className="rounded-md bg-gray-100 px-2 py-0.5 text-[11px] font-semibold text-gray-700">
                                  {payment.method.replace('_', ' ')}
                                </span>
                              </td>
                              <td className="px-3.5 py-2.5 text-gray-500 font-mono text-[11px]">{payment.reference || '—'}</td>
                              <td className="px-3.5 py-2.5 text-right">
                                <span className="inline-flex items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={() => sharePaymentOnWhatsApp(payment)}
                                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[#25D366] transition hover:bg-green-50 hover:text-[#128C7E]"
                                    title="Share payment receipt on WhatsApp"
                                    aria-label="Share payment receipt on WhatsApp"
                                  >
                                    <MessageCircle className="h-4 w-4" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => removePaymentEntry(index)}
                                    className="text-xs font-bold text-rose-600 hover:text-rose-800 transition-colors"
                                  >
                                    Remove
                                  </button>
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="rounded-xl border border-dashed border-gray-300 p-4 text-center text-xs text-gray-500 font-medium">
                      No payment entries recorded yet. Deal status will automatically update when receipts are added.
                    </p>
                  )}
                </div>

                {/* SECTION 5: PURCHASE DEED */}
                <div className="rounded-2xl border border-gray-200/80 bg-white p-5 shadow-xs space-y-4">
                  <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-500/10 text-amber-700">
                        <FileText className="h-4 w-4" />
                      </div>
                      <h4 className="text-xs font-bold uppercase tracking-wider text-gray-900">
                        5. Purchase Deed & Documents
                      </h4>
                    </div>
                    <span className="text-[11px] font-semibold text-gray-400">Section 5 of 7</span>
                  </div>

                  {formErrors.documents ? (
                    <p className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2 text-xs font-semibold text-rose-700">
                      {formErrors.documents}
                    </p>
                  ) : null}

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <SellAccountPdfField
                        label="Purchase Deed Document"
                        document={formData.documents?.purchaseDeed}
                        onUploaded={(file) => handleDocumentUploaded('purchaseDeed', file)}
                        onUploadStateChange={handleDocumentUploadStateChange}
                      />
                    </div>
                    <div>
                      <PanVerificationField
                        side="purchase"
                        state={(formData.kyc || createEmptySellAccountKyc()).purchase.pan}
                        busyKey={kycBusyKey}
                        onNumberChange={(value) => handleKycNumberChange('purchase', 'pan', value)}
                        onVerify={() => void handleKycVerify('purchase', 'pan')}
                      />
                    </div>
                  </div>

                  <DeedDocumentPreview
                    label="Purchase Deed"
                    document={formData.documents?.purchaseDeed}
                    onRemove={() => handleDocumentRemoved('purchaseDeed')}
                  />

                  <SellAccountKycFields
                    side="purchase"
                    values={(formData.kyc || createEmptySellAccountKyc()).purchase}
                    busyKey={kycBusyKey}
                    onNumberChange={(kind, value) => handleKycNumberChange('purchase', kind, value)}
                    onVerify={(kind) => void handleKycVerify('purchase', kind)}
                  />
                </div>

                {/* SECTION 6: SELL DEED */}
                <div className="rounded-2xl border border-gray-200/80 bg-white p-5 shadow-xs space-y-4">
                  <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-500/10 text-amber-700">
                        <FileText className="h-4 w-4" />
                      </div>
                      <h4 className="text-xs font-bold uppercase tracking-wider text-gray-900">
                        6. Sell Deed & Documents
                      </h4>
                    </div>
                    <span className="text-[11px] font-semibold text-gray-400">Section 6 of 7</span>
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <SellAccountPdfField
                        label="Sell Deed Document"
                        document={formData.documents?.sellDeed}
                        onUploaded={(file) => handleDocumentUploaded('sellDeed', file)}
                        onUploadStateChange={handleDocumentUploadStateChange}
                      />
                    </div>
                    <div>
                      <PanVerificationField
                        side="sell"
                        state={(formData.kyc || createEmptySellAccountKyc()).sell.pan}
                        busyKey={kycBusyKey}
                        onNumberChange={(value) => handleKycNumberChange('sell', 'pan', value)}
                        onVerify={() => void handleKycVerify('sell', 'pan')}
                      />
                    </div>
                  </div>

                  <DeedDocumentPreview
                    label="Sell Deed"
                    document={formData.documents?.sellDeed}
                    onRemove={() => handleDocumentRemoved('sellDeed')}
                  />

                  <SellAccountKycFields
                    side="sell"
                    values={(formData.kyc || createEmptySellAccountKyc()).sell}
                    busyKey={kycBusyKey}
                    onNumberChange={(kind, value) => handleKycNumberChange('sell', kind, value)}
                    onVerify={(kind) => void handleKycVerify('sell', kind)}
                  />
                </div>

                {/* SECTION 7: STATUS, TRANSFER DETAILS & REMARK */}
                <div className="rounded-2xl border border-gray-200/80 bg-white p-5 shadow-xs space-y-4">
                  <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-500/10 text-amber-700">
                        <FileCheck2 className="h-4 w-4" />
                      </div>
                      <h4 className="text-xs font-bold uppercase tracking-wider text-gray-900">
                        7. Status, Transfer Details & Remark
                      </h4>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-[11px] font-semibold text-gray-400">Section 7 of 7</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1.5">Deal Status</label>
                      <div className={`flex min-h-10 items-center gap-2 rounded-xl border px-3.5 py-2 text-sm font-bold shadow-xs ${DEAL_STATUS_CONFIG[formData.dealStatus].bg} ${DEAL_STATUS_CONFIG[formData.dealStatus].text} ${DEAL_STATUS_CONFIG[formData.dealStatus].border}`}>
                        {(() => { const StatusIcon = DEAL_STATUS_CONFIG[formData.dealStatus].icon; return <StatusIcon className="h-4 w-4" />; })()}
                        {DEAL_STATUS_CONFIG[formData.dealStatus].label}
                      </div>
                      <p className="mt-1 text-[11px] text-gray-500">Automatically derived from payment receipts and RTO progress.</p>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                        Transfer Details <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. NOC pending at RTO, Hypothecation removed"
                        value={formData.transferDetails}
                        required
                        onChange={(e) => handleInputChange('transferDetails', e.target.value)}
                        className={`h-10 w-full rounded-xl border bg-gray-50/60 px-3.5 text-sm font-medium text-gray-900 placeholder:text-gray-400 focus:bg-white focus:outline-none focus:ring-4 focus:ring-amber-500/10 transition-all ${formErrors.transferDetails ? 'border-rose-500 focus:border-rose-500' : 'border-gray-200 focus:border-amber-500'
                          }`}
                      />
                      {formErrors.transferDetails && <p className="text-[11px] font-medium text-rose-500 mt-1">{formErrors.transferDetails}</p>}
                    </div>
                  </div>

                  {!hasLinkedRtoRecord && canManageRto ? (
                    <label className="flex items-start gap-3 rounded-xl border border-indigo-100 bg-indigo-50/60 px-3.5 py-3 text-sm text-indigo-950">
                      <input
                        type="checkbox"
                        checked={startRtoRequested}
                        onChange={(event) => setStartRtoRequested(event.target.checked)}
                        className="mt-0.5 h-4 w-4 rounded border-indigo-300 text-indigo-600 focus:ring-indigo-500"
                      />
                      <span>
                        <span className="block font-bold">Start RTO Work after saving this Sell Account</span>
                        <span className="mt-0.5 block text-xs text-indigo-800/80">The Sell Account and RTO handover will be saved together. Full purchaser payment is required.</span>
                      </span>
                    </label>
                  ) : null}

                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1.5">Remark (optional)</label>
                    <textarea
                      rows={3}
                      placeholder="Enter remark, inspection observations, payment terms, or transfer notes..."
                      value={formData.remarks || ''}
                      onChange={(e) => handleInputChange('remarks', e.target.value)}
                      className="w-full rounded-xl border border-gray-200 bg-gray-50/60 p-3.5 text-sm font-medium text-gray-900 placeholder:text-gray-400 focus:bg-white focus:border-amber-500 focus:outline-none focus:ring-4 focus:ring-amber-500/10 transition-all"
                    />
                  </div>
                </div>
              </div>

              {/* Modal Actions Footer */}
              <div className="sticky bottom-0 z-20 flex shrink-0 items-center justify-between border-t border-gray-100 bg-white/95 px-6 py-4 backdrop-blur-md shadow-lg">
                <button
                  type="button"
                  onClick={() => void closeForm()}
                  className="rounded-xl bg-gray-100 px-4 py-2.5 text-sm font-bold text-gray-700 transition hover:bg-gray-200"
                >
                  Cancel
                </button>
                <div className="flex items-center gap-2.5">
                  <button
                    type="button"
                    onClick={handleSaveDraft}
                    disabled={activeDocumentUploads > 0 || Boolean(kycBusyKey) || Boolean(editingRecord && !isSellAccountDraft(editingRecord))}
                    className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm font-bold text-amber-900 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Save draft
                  </button>
                  {startRtoRequested && !hasLinkedRtoRecord && canManageRto ? (
                    <button
                      type="button"
                      onClick={() => void handleSaveAndStartRtoWork()}
                      disabled={
                        activeDocumentUploads > 0 ||
                        Boolean(kycBusyKey) ||
                        startingRto ||
                        !canSaveAndStartRto
                      }
                      className="rounded-xl bg-[#FFC107] px-6 py-2.5 text-sm font-extrabold text-gray-950 transition hover:bg-amber-400 shadow-md shadow-amber-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {startingRto
                        ? 'Saving & Starting RTO...'
                        : !canSaveAndStartRto
                          ? 'Full Payment Required'
                          : 'Save & Start RTO Work'}
                    </button>
                  ) : editingRecord && !editingRecord.isDraft ? (
                    <button
                      type="submit"
                      disabled={activeDocumentUploads > 0 || Boolean(kycBusyKey)}
                      className="rounded-xl bg-[#FFC107] px-6 py-2.5 text-sm font-extrabold text-gray-950 transition hover:bg-amber-400 shadow-md shadow-amber-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {activeDocumentUploads > 0 ? 'Uploading PDFs...' : 'Save Changes'}
                    </button>
                  ) : null}
                </div>
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
