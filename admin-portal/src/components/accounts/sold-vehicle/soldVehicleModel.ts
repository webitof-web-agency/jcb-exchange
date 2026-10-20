import { AlertTriangle, CheckCircle2, Clock } from 'lucide-react';
import type { ComponentType } from 'react';
import type { UploadedFileResult } from '@/lib/fileUpload';
import { createEmptySellAccountDocuments, normalizeSellAccountDocuments } from '@/lib/sellAccountDocuments.mjs';
import { createEmptySellAccountKyc, normalizeSellAccountKyc } from '@/lib/sellAccountKyc.mjs';
import { createEmptyExpenseBreakdown, GST_RATE_PERCENT, normalizeExpenseBreakdown } from '@/lib/sellAccountFinance.mjs';
import { normalizeSellAccountChassisNumber, omitSellAccountEngineNumber } from '@/lib/sellAccountForm.mjs';

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
export type SellAccountDocumentKey = keyof SellAccountDocuments;
export type SellAccountKycKind = 'pan' | 'gst' | 'aadhaar';
export type SellAccountKycState = {
  number: string;
  status: string;
  verificationRecordId: string;
  verifiedAt: string;
  cacheHit: boolean;
  error: string;
};
export type SellAccountKycSide = {
  pan: SellAccountKycState;
  gst: SellAccountKycState;
  aadhaar: SellAccountKycState;
};
export type SellAccountKyc = {
  purchase: SellAccountKycSide;
  sell: SellAccountKycSide;
};
export type SellAccountRtoRecord = {
  id: string;
  listingId?: string | null;
  sellAccountId?: string | null;
  rtoStatus: string;
  updatedAt?: string;
  isLocked?: boolean;
  taskStatuses?: string[];
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
export type SellAccountSourceType = 'PARTNER' | 'AGENT' | 'DIRECT_CUSTOMER' | 'JCB_EXCHANGE';
export type SellAccountPurchaseType = 'PURCHASE' | 'EXCHANGE';
export type SellAccountSaleType = 'SELL' | 'EXCHANGE';
export type SellAccountExpenseBreakdown = { transport: number; paperwork: number; rtoWork: number; other: number; otherLabel: string };
export type SellAccountInvoiceDelivery = {
  attemptedAt?: string;
  channels?: Array<{ channel: 'WHATSAPP' | 'SMS'; sent: boolean; status: string; detail?: string | null }>;
};

export interface SellAccountRecord {
  id: string;
  recordNumber?: string;
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
  sourceType?: SellAccountSourceType | '';
  purchaseType?: SellAccountPurchaseType;
  saleType?: SellAccountSaleType;
  sellerName: string;
  sellerNumber: string;
  sellerDate?: string;
  sellerCity?: string;
  purchaserName: string;
  purchaserNumber: string;
  purchaserDate?: string;
  purchaserCity?: string;
  sellerState?: string;
  purchaserState?: string;
  brokerName?: string;
  brokerNumber?: string;
  purchaseExchangeValue?: number;
  purchaseExchangeVehicle?: string;
  saleExchangeValue?: number;
  saleExchangeVehicle?: string;
  expenseBreakdown?: SellAccountExpenseBreakdown;
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
  completedAt?: string | null;
  invoiceNumber?: string | null;
  invoiceGeneratedAt?: string | null;
  invoiceSentAt?: string | null;
  invoiceDelivery?: SellAccountInvoiceDelivery | null;
  hasPublicInvoiceLink?: boolean;
  createdAt: string;
}

export type SellAccountApiRecord = Record<string, unknown>;
export type StoredSellAccountRecord = Omit<SellAccountRecord, 'dealStatus'> & { dealStatus: SellAccountRecord['dealStatus'] | 'IN_PROGRESS' | 'CLOSE' | 'COMPLETED' | 'CANCELLED' | 'PENDING' };
export type SellAccountFormState = Omit<SellAccountRecord, 'id' | 'createdAt'>;

export const DEAL_STATUS_CONFIG: Record<SellAccountDealStatus, { label: string; shortLabel: string; bg: string; text: string; border: string; icon: ComponentType<{ className?: string }> }> = {
  OPEN: { label: 'Open', shortLabel: 'Open', bg: 'bg-amber-50', text: 'text-amber-800', border: 'border-amber-200', icon: AlertTriangle },
  PARTIAL_PAYMENT_RECEIVED: { label: 'Partial Payment Received', shortLabel: 'Partial Paid', bg: 'bg-orange-50', text: 'text-orange-800', border: 'border-orange-200', icon: Clock },
  FULL_PAYMENT: { label: 'Full Payment', shortLabel: 'Full Paid', bg: 'bg-blue-50', text: 'text-blue-800', border: 'border-blue-200', icon: CheckCircle2 },
  RTO_WORK_STARTED: { label: 'RTO Work Start', shortLabel: 'RTO Started', bg: 'bg-indigo-50', text: 'text-indigo-800', border: 'border-indigo-200', icon: Clock },
  RTO_WORK_IN_PROGRESS: { label: 'RTO Work Progress', shortLabel: 'RTO In Progress', bg: 'bg-blue-50', text: 'text-blue-800', border: 'border-blue-200', icon: Clock },
  RTO_WORK_FAILED: { label: 'RTO Work Failed / Errors', shortLabel: 'RTO Failed', bg: 'bg-rose-50', text: 'text-rose-800', border: 'border-rose-200', icon: AlertTriangle },
  RTO_WORK_COMPLETED: { label: 'RTO Work Completed', shortLabel: 'RTO Completed', bg: 'bg-emerald-50', text: 'text-emerald-800', border: 'border-emerald-200', icon: CheckCircle2 },
  DEAL_DONE: { label: 'Deal Done', shortLabel: 'Deal Done', bg: 'bg-emerald-50', text: 'text-emerald-800', border: 'border-emerald-200', icon: CheckCircle2 },
};

export const formatDisplayDate = (dateStr?: string | null) => {
  if (!dateStr) return '';
  const parts = dateStr.split('T')[0].split('-');
  if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
  return dateStr;
};

export const formatInr = (value: number | undefined | null) => `₹${Number(value || 0).toLocaleString('en-IN')}`;

export const toDateInput = (value: unknown, fallback = '') => {
  if (!value) return fallback;
  const text = String(value);
  const match = text.match(/^\d{4}-\d{2}-\d{2}/);
  if (match) return match[0];
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed.toISOString().slice(0, 10);
};

export const todayInput = () => new Date().toISOString().split('T')[0];

const isSourceType = (value: unknown): value is SellAccountSourceType =>
  ['PARTNER', 'AGENT', 'DIRECT_CUSTOMER', 'JCB_EXCHANGE'].includes(String(value));

export const normalizeSellAccountRecord = (record: StoredSellAccountRecord): SellAccountRecord => ({
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
  sellerCity: record.sellerCity || '',
  purchaserCity: record.purchaserCity || '',
  sourceType: isSourceType(record.sourceType) ? record.sourceType : '',
  purchaseType: record.purchaseType === 'EXCHANGE' ? 'EXCHANGE' : 'PURCHASE',
  saleType: record.saleType === 'EXCHANGE' ? 'EXCHANGE' : 'SELL',
  brokerName: record.brokerName || '',
  brokerNumber: record.brokerNumber || '',
  purchaseExchangeValue: Number(record.purchaseExchangeValue || 0),
  purchaseExchangeVehicle: record.purchaseExchangeVehicle || '',
  saleExchangeValue: Number(record.saleExchangeValue || 0),
  saleExchangeVehicle: record.saleExchangeVehicle || '',
  expenseBreakdown: (normalizeExpenseBreakdown(record.expenseBreakdown) || {
    ...createEmptyExpenseBreakdown(),
    // Older records only have a single expenses total.
    other: Number(record.expenses || 0),
  }) as SellAccountExpenseBreakdown,
  // Sell Account policy: GST is inclusive in the margin and extracted from it.
  taxMode: 'INCLUSIVE',
  gstRatePercent: GST_RATE_PERCENT,
  payments: Array.isArray(record.payments) ? record.payments : [],
  rtoStatusSnapshot: record.rtoStatusSnapshot || 'PENDING',
  rtoRecord: record.rtoRecord || null,
  remarks: record.remarks ?? record.noteSheet ?? '',
});

const optionalString = (value: unknown) => (value === null || value === undefined ? null : String(value));

export const normalizeServerSellAccount = (record: SellAccountApiRecord): SellAccountRecord => normalizeSellAccountRecord({
  ...record,
  isLocked: record.isLocked === true,
  id: String(record.id || record.recordNumber || ''),
  recordNumber: String(record.recordNumber || record.id || ''),
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
  sellerCity: String(record.sellerCity || ''),
  purchaserCity: String(record.purchaserCity || ''),
  brokerName: String(record.brokerName || ''),
  brokerNumber: String(record.brokerNumber || ''),
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
    ? (() => {
      const rto = record.rtoRecord as SellAccountApiRecord;
      return {
        id: String(rto.id || ''),
        listingId: rto.listingId ? String(rto.listingId) : null,
        sellAccountId: rto.sellAccountId ? String(rto.sellAccountId) : null,
        rtoStatus: String(rto.rtoStatus || 'PENDING'),
        updatedAt: String(rto.updatedAt || ''),
        isLocked: rto.isLocked === true,
        taskStatuses: Array.isArray(rto.transferTasks)
          ? (rto.transferTasks as SellAccountApiRecord[]).map((task) => String(task.status || 'PENDING'))
          : [],
      };
    })()
    : null,
  noteSheet: String(record.remarks || record.noteSheet || ''),
  remarks: String(record.remarks || record.noteSheet || ''),
  transferDetails: String(record.transferDetails || ''),
  documents: record.documents || createEmptySellAccountDocuments(),
  kyc: record.kyc || undefined,
  completedAt: optionalString(record.completedAt),
  invoiceNumber: optionalString(record.invoiceNumber),
  invoiceGeneratedAt: optionalString(record.invoiceGeneratedAt),
  invoiceSentAt: optionalString(record.invoiceSentAt),
  invoiceDelivery: record.invoiceDelivery && typeof record.invoiceDelivery === 'object' ? record.invoiceDelivery as SellAccountInvoiceDelivery : null,
  hasPublicInvoiceLink: record.hasPublicInvoiceLink === true,
  createdAt: String(record.createdAt || new Date().toISOString()),
} as StoredSellAccountRecord);

export const createInitialSellAccountForm = (): SellAccountFormState => ({
  isDraft: false,
  ownerName: '',
  ownerNumber: '',
  vehicleNumber: '',
  chassisNumber: '',
  sellDate: todayInput(),
  vehicleType: '',
  brandName: '',
  vehicleModel: '',
  sourceType: '',
  purchaseType: 'PURCHASE',
  saleType: 'SELL',
  sellerName: '',
  sellerNumber: '',
  sellerDate: todayInput(),
  sellerCity: '',
  purchaserName: '',
  purchaserNumber: '',
  purchaserDate: todayInput(),
  purchaserCity: '',
  sellerState: '',
  purchaserState: '',
  brokerName: '',
  brokerNumber: '',
  purchaseExchangeValue: 0,
  purchaseExchangeVehicle: '',
  saleExchangeValue: 0,
  saleExchangeVehicle: '',
  expenseBreakdown: createEmptyExpenseBreakdown() as SellAccountExpenseBreakdown,
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
});

export const accountsPortalBase = (pathname: string) => (
  pathname.startsWith('/employee') ? '/employee' : pathname.startsWith('/admin') ? '/admin' : '/superadmin'
);
