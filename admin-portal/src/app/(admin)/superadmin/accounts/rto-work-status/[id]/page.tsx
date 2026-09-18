'use client';

import { ComponentType, useEffect, useState } from 'react';
import { useRouter, useParams, usePathname } from 'next/navigation';
import {
  ArrowLeft, CheckCircle2, Clock, X, Car, User, Phone,
  FileText, DollarSign, AlertTriangle, ShieldCheck, Building2
} from 'lucide-react';
import api from '@/lib/api';

type RtoRecord = {
  id: string;
  customerName: string;
  customerNumber?: string;
  vehicleNumber: string;
  vehicleType?: string;
  vehicleModel?: string;
  hirePurchaseStatus: string;
  taxStatus: string;
  taxValidUntil: string | null;
  fitnessStatus: string;
  fitnessValidUntil: string | null;
  insuranceStatus: string;
  insuranceValidUntil: string | null;
  pucStatus: string;
  pucValidUntil: string | null;
  hsrpStatus: string;
  sellerName: string;
  sellerNumber?: string;
  purchaserName: string;
  purchaserNumber?: string;
  rtoOffice?: string;
  rtoAgentName?: string;
  rtoAgentState?: string;
  rtoAgentCity?: string;
  rtoAgentNumber?: string;
  rtoExpenses?: number;
  rtoExpensesAdvance?: number;
  rtoExpensesBalance?: number;
  documentSendDate: string | null;
  rtoStatus: string;
  noteSheet?: string | null;
  vehicleMaintenanceCost?: number;
  hourRunning?: number | null;
};

const STATUS_CONFIG: Record<string, { label: string; bg: string; text: string; border: string; icon: ComponentType<{ className?: string }> }> = {
  PENDING: { label: 'Pending', bg: 'bg-amber-50', text: 'text-amber-800', border: 'border-amber-200', icon: Clock },
  IN_PROGRESS: { label: 'In Progress', bg: 'bg-blue-50', text: 'text-blue-800', border: 'border-blue-200', icon: Clock },
  DOCUMENT_REQUIRED: { label: 'Document Required', bg: 'bg-orange-50', text: 'text-orange-800', border: 'border-orange-200', icon: AlertTriangle },
  SUBMITTED: { label: 'Submitted', bg: 'bg-sky-50', text: 'text-sky-800', border: 'border-sky-200', icon: FileText },
  APPROVED: { label: 'Approved', bg: 'bg-emerald-50', text: 'text-emerald-800', border: 'border-emerald-200', icon: CheckCircle2 },
  REJECTED: { label: 'Rejected', bg: 'bg-rose-50', text: 'text-rose-800', border: 'border-rose-200', icon: AlertTriangle },
  COMPLETED: { label: 'Completed', bg: 'bg-emerald-50', text: 'text-emerald-800', border: 'border-emerald-200', icon: CheckCircle2 },
  CANCELLED: { label: 'Cancelled', bg: 'bg-gray-50', text: 'text-gray-700', border: 'border-gray-200', icon: X },
};

const label = (value: string) => value ? value.replaceAll('_', ' ').replace(/\b\w/g, (char) => char.toUpperCase()) : '—';
const dateValue = (value: string | null) => value ? new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(value)) : '—';

export default function RtoRecordDetailView() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useParams();
  const id = params?.id as string;
  const listPath = pathname.startsWith('/employee')
    ? '/employee/accounts/rto-work-status'
    : pathname.startsWith('/admin')
      ? '/admin/accounts/rto-work-status'
      : '/superadmin/accounts/rto-work-status';

  const [record, setRecord] = useState<RtoRecord | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const loadRecord = async () => {
      if (typeof window === 'undefined' || !id) {
        return;
      }

      const saved = localStorage.getItem('jcb_rto_records');
      if (saved) {
        try {
          const parsed = JSON.parse(saved) as RtoRecord[];
          const found = parsed.find((item) => String(item.id) === id);
          if (found) {
            if (isMounted) {
              setRecord(found);
              setLoading(false);
            }
            return;
          }
        } catch {
          // Ignore invalid local cache and fall back to the API.
        }
      }

      try {
        const response = await api.get('/recruitment/admin/rto-records');
        const found = ((response.data?.records || []) as RtoRecord[]).find((item) => String(item.id) === id);
        if (isMounted) setRecord(found || null);
      } catch {
        if (isMounted) setRecord(null);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    void loadRecord();

    return () => {
      isMounted = false;
    };
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
        <p className="text-lg font-medium text-gray-600">RTO Record not found</p>
        <button
          onClick={() => router.push(listPath)}
          className="text-blue-600 hover:underline font-medium text-sm"
        >
          Go back to list
        </button>
      </div>
    );
  }

  const statusInfo = STATUS_CONFIG[record.rtoStatus || 'PENDING'] || STATUS_CONFIG['PENDING'];
  const StatusIcon = statusInfo.icon;

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
            <h1 className="text-2xl font-bold text-gray-900">RTO Work Status Details</h1>
            <p className="text-sm font-medium text-gray-500 mt-0.5">Vehicle: <span className="font-bold text-gray-900">{record.vehicleNumber}</span></p>
          </div>
        </div>
        <div className={`flex items-center justify-center gap-2 rounded-full border px-4 py-1.5 font-semibold shrink-0 ${statusInfo.bg} ${statusInfo.text} ${statusInfo.border}`}>
          <StatusIcon className="h-4 w-4" />
          {statusInfo.label}
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Vehicle & Customer Details */}
        <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
          <h3 className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-amber-700 border-b border-gray-100 pb-2">
            <Car className="h-4 w-4" /> Vehicle & Customer Details
          </h3>
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Vehicle Number</p>
                <p className="font-bold text-gray-900 text-lg mt-0.5">{record.vehicleNumber}</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Vehicle Model</p>
                <p className="font-bold text-gray-900 mt-0.5">{record.vehicleModel || '—'}</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Category</p>
                <p className="font-medium text-gray-800 mt-0.5">{record.vehicleType || '—'}</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Hire Purchase</p>
                <span className="inline-block mt-0.5 rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-bold text-gray-700 border border-gray-200">
                  {label(record.hirePurchaseStatus)}
                </span>
              </div>
              {record.hourRunning !== null && record.hourRunning !== undefined && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Hour Running</p>
                  <p className="font-semibold text-gray-800 mt-0.5">{record.hourRunning} HR</p>
                </div>
              )}
            </div>

            <div className="rounded-xl bg-gray-50 border border-gray-100 p-4 flex items-start gap-3">
              <div className="p-2 bg-white rounded-lg shadow-sm shrink-0 border border-gray-100">
                <User className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Customer</p>
                <p className="font-bold text-gray-900">{record.customerName}</p>
                {record.customerNumber ? (
                  <a href={`tel:${record.customerNumber}`} className="mt-1 flex w-fit items-center gap-1.5 text-sm font-medium text-blue-600 hover:underline">
                    <Phone className="h-3.5 w-3.5 text-blue-500" /> {record.customerNumber}
                  </a>
                ) : (
                  <p className="text-xs text-gray-400 mt-1">No contact number</p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Parties Involved & RTO Agent */}
        <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
          <h3 className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-amber-700 border-b border-gray-100 pb-2">
            <User className="h-4 w-4" /> Parties & RTO Agent
          </h3>
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="rounded-xl border border-gray-100 bg-gray-50/50 p-3">
                <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Seller</p>
                <p className="font-bold text-gray-900 text-sm mt-0.5">{record.sellerName}</p>
                {record.sellerNumber && (
                  <a href={`tel:${record.sellerNumber}`} className="mt-1 flex items-center gap-1 text-xs text-blue-600 hover:underline">
                    <Phone className="h-3 w-3 text-blue-500" /> {record.sellerNumber}
                  </a>
                )}
              </div>
              <div className="rounded-xl border border-gray-100 bg-gray-50/50 p-3">
                <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Purchaser</p>
                <p className="font-bold text-gray-900 text-sm mt-0.5">{record.purchaserName}</p>
                {record.purchaserNumber && (
                  <a href={`tel:${record.purchaserNumber}`} className="mt-1 flex items-center gap-1 text-xs text-blue-600 hover:underline">
                    <Phone className="h-3 w-3 text-blue-500" /> {record.purchaserNumber}
                  </a>
                )}
              </div>
            </div>

            <div className="rounded-xl border border-amber-100 bg-amber-50/30 p-4">
              <div className="flex items-center gap-2 mb-2 text-amber-800 font-bold text-xs uppercase tracking-wider">
                <Building2 className="w-4 h-4 text-amber-600" />
                <span>RTO Agent & Office</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">RTO Agent Info</p>
                  <p className="font-bold text-gray-900 mt-0.5">{record.rtoAgentName || '—'}</p>
                  {[record.rtoAgentCity, record.rtoAgentState].filter(Boolean).length > 0 && (
                    <p className="text-xs font-medium text-amber-700 mt-0.5">
                      City: {[record.rtoAgentCity, record.rtoAgentState].filter(Boolean).join(', ')}
                    </p>
                  )}
                  {record.rtoAgentNumber && (
                    <a href={`tel:${record.rtoAgentNumber}`} className="mt-1 flex items-center gap-1 text-xs text-blue-600 hover:underline font-medium">
                      <Phone className="h-3 w-3 text-blue-500" /> {record.rtoAgentNumber}
                    </a>
                  )}
                </div>
                <div>
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">RTO Office Location</p>
                  <p className="font-bold text-gray-900 text-base mt-0.5">{record.rtoOffice || '—'}</p>
                  <span className="inline-block mt-1 text-[11px] font-medium bg-amber-100/60 text-amber-800 px-2 py-0.5 rounded-md">
                    Official RTO Office
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Validity Details */}
        <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm md:col-span-2">
          <h3 className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-amber-700 border-b border-gray-100 pb-2">
            <ShieldCheck className="h-4 w-4" /> Compliance & Validity Breakdown
          </h3>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            <div className="rounded-xl bg-gray-50 p-3.5 border border-gray-100 text-center">
              <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Tax Status</p>
              <p className="mt-1 font-bold text-gray-900 text-sm">{label(record.taxStatus)}</p>
              <p className="text-xs text-gray-500 mt-0.5">{dateValue(record.taxValidUntil)}</p>
            </div>
            <div className="rounded-xl bg-gray-50 p-3.5 border border-gray-100 text-center">
              <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Fitness Status</p>
              <p className="mt-1 font-bold text-gray-900 text-sm">{label(record.fitnessStatus)}</p>
              <p className="text-xs text-gray-500 mt-0.5">{dateValue(record.fitnessValidUntil)}</p>
            </div>
            <div className="rounded-xl bg-gray-50 p-3.5 border border-gray-100 text-center">
              <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Insurance</p>
              <p className="mt-1 font-bold text-gray-900 text-sm">{label(record.insuranceStatus)}</p>
              <p className="text-xs text-gray-500 mt-0.5">{dateValue(record.insuranceValidUntil)}</p>
            </div>
            <div className="rounded-xl bg-gray-50 p-3.5 border border-gray-100 text-center">
              <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">PUC Status</p>
              <p className="mt-1 font-bold text-gray-900 text-sm">{label(record.pucStatus)}</p>
              <p className="text-xs text-gray-500 mt-0.5">{dateValue(record.pucValidUntil)}</p>
            </div>
            <div className="rounded-xl bg-gray-50 p-3.5 border border-gray-100 text-center col-span-2 sm:col-span-1">
              <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">HSRP Valid</p>
              <p className="mt-1 font-bold text-emerald-700 text-sm">{label(record.hsrpStatus)}</p>
            </div>
          </div>
        </div>

        {/* Financial Breakdown */}
        <div className="rounded-2xl border border-amber-100 bg-amber-50/30 p-5 shadow-sm md:col-span-2">
          <h3 className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-amber-800">
            <DollarSign className="h-4 w-4" /> RTO Financials & Expenses
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            <div className="rounded-xl bg-white p-4 shadow-sm border border-amber-100/50 text-center">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Total Expenses</p>
              <p className="mt-1 text-xl font-bold text-gray-900">₹{(record.rtoExpenses || 0).toLocaleString('en-IN')}</p>
            </div>
            <div className="rounded-xl bg-white p-4 shadow-sm border border-amber-100/50 text-center">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Advance Paid</p>
              <p className="mt-1 text-xl font-bold text-emerald-700">₹{(record.rtoExpensesAdvance || 0).toLocaleString('en-IN')}</p>
            </div>
            <div className="rounded-xl bg-white p-4 shadow-sm border border-amber-300 bg-amber-50 text-center">
              <p className="text-xs font-bold text-amber-800 uppercase tracking-wider">Balance Due</p>
              <p className="mt-1 text-xl font-bold text-amber-900">
                ₹{(record.rtoExpensesBalance ?? Math.max(0, (record.rtoExpenses || 0) - (record.rtoExpensesAdvance || 0))).toLocaleString('en-IN')}
              </p>
            </div>
            <div className="rounded-xl bg-white p-4 shadow-sm border border-amber-100/50 text-center">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Maintenance Cost</p>
              <p className="mt-1 text-xl font-bold text-gray-800">₹{(record.vehicleMaintenanceCost || 0).toLocaleString('en-IN')}</p>
            </div>
          </div>
          {record.documentSendDate && (
            <p className="mt-3 text-xs text-gray-500 text-right font-medium">
              Document Send Date: <span className="font-bold text-gray-700">{dateValue(record.documentSendDate)}</span>
            </p>
          )}
        </div>

        {/* Note Sheet / Remarks */}
        <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm md:col-span-2">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-amber-700 border-b border-gray-100 pb-2">
            <FileText className="h-4 w-4" /> Note Sheet / Remarks
          </h3>
          <div className="rounded-xl bg-gray-50 border border-gray-100 p-4">
            <p className="text-sm font-medium text-gray-900 whitespace-pre-wrap">{record.noteSheet || 'No additional note sheet entries recorded.'}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
