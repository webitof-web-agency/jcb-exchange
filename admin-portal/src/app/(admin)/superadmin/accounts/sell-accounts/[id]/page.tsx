'use client';

import { ComponentType, useEffect, useState } from 'react';
import { useRouter, useParams, usePathname } from 'next/navigation';
import {
  ArrowLeft, CheckCircle2, Clock, Car, User, Phone,
  FileText, DollarSign, AlertTriangle
} from 'lucide-react';
import { SellAccountRecord } from '../page';

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

  useEffect(() => {
    const loadTimer = window.setTimeout(() => {
    if (id) {
      const saved = localStorage.getItem('jcb_sell_accounts_records');
      if (saved) {
        try {
          const parsed = JSON.parse(saved) as StoredSellAccountRecord[];
          const found = parsed.find((r) => r.id === id);
          if (found) {
            // apply migration if needed
            const migrated: SellAccountRecord = {
              ...found,
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
        <div className={`flex items-center justify-center gap-2 rounded-full border px-4 py-1.5 font-semibold shrink-0 ${statusInfo.bg} ${statusInfo.text} ${statusInfo.border}`}>
          <statusInfo.icon className="h-4 w-4" />
          {statusInfo.label}
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
    </div>
  );
}
