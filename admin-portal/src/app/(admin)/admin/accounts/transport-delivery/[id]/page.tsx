'use client';

import { use, useState, useEffect, useCallback } from 'react';
import {
  ArrowLeft,
  Download,
  MapPin,
  Phone,
  CheckCircle2,
  Clock,
  Navigation,
  PackageCheck,
  Send,
  X,
  ClipboardCheck,
} from 'lucide-react';
import api from '@/lib/api';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import { getAccountUpdatePermissions } from '@/lib/accountsPermissions';
import { hasAnyPermission } from '@/lib/permissionUtils';
import BrandLoader from '@/components/ui/BrandLoader';
import TransportStatusModal from '@/components/transport/TransportStatusModal';
import { transportStageLabel, transportStageTone } from '@/components/transport/transportStages';
import { toast } from 'react-toastify';
import { downloadAuthedFile } from '@/lib/authedDownload';

type TransportStatus =
  | 'BOOKED'
  | 'VEHICLE_ASSIGNED'
  | 'DISPATCHED'
  | 'ON_THE_WAY'
  | 'OUT_FOR_DELIVERY'
  | 'DELIVERED'
  | 'CANCELLED';

type TransportParty = {
  name: string;
  gstin: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
};

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
  ewayBillNumber?: string | null;
  currentLocation?: string | null;
  lastRemark?: string | null;
  challanDate?: string | null;
  dispatchName?: string | null;
  dispatchAddress?: string | null;
  dispatchCity?: string | null;
  dispatchState?: string | null;
  dispatchPincode?: string | null;
  dispatchGstin?: string | null;
  deliveryName?: string | null;
  deliveryAddress?: string | null;
  deliveryCity?: string | null;
  deliveryState?: string | null;
  deliveryPincode?: string | null;
  deliveryGstin?: string | null;
  declaredValue?: number | null;
  parties: {
    dispatch: TransportParty;
    delivery: TransportParty;
    declaredValue: number;
  };
  createdAt: string;
  updatedAt: string;
  timeline: TimelineEntry[];
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
    sellerNumber?: string | null;
    purchaserName?: string | null;
    purchaserNumber?: string | null;
    purchaserCity?: string | null;
    purchaserState?: string | null;
  };
};

const STATUS_STEPS: { key: TransportStatus; label: string; icon: typeof Clock }[] = [
  { key: 'BOOKED', label: 'Pending Dispatch', icon: Clock },
  { key: 'OUT_FOR_DELIVERY', label: 'Out For Delivery', icon: MapPin },
  { key: 'ON_THE_WAY', label: 'On The Way', icon: Navigation },
  { key: 'DELIVERED', label: 'Delivered', icon: PackageCheck },
];

const normalizeStatus = (status: TransportStatus): TransportStatus => {
  if (status === 'VEHICLE_ASSIGNED') return 'BOOKED';
  if (status === 'DISPATCHED') return 'ON_THE_WAY';
  return status;
};

const STATUS_ORDER = STATUS_STEPS.map((s) => s.key);

function formatDate(date: string) {
  return new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(date));
}

const STATUS_LABEL: Record<string, string> = {
  BOOKED: 'Pending Dispatch',
  VEHICLE_ASSIGNED: 'Pending Dispatch',
  DISPATCHED: 'On The Way',
  ON_THE_WAY: 'On The Way',
  OUT_FOR_DELIVERY: 'Out For Delivery',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled',
};

const formatShortDate = (date: string) =>
  new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(date));

const joinParts = (parts: Array<string | null | undefined>, separator = ', ') => parts.filter(Boolean).join(separator);

const placeLine = (party: TransportParty) => {
  const place = joinParts([party.city, party.state]);
  return party.pincode ? (place ? `${place} - ${party.pincode}` : party.pincode) : place;
};

export default function TransportDeliveryDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const currentUser = useAuthStore((s) => s.user);
  const userPermissions = currentUser?.permissions || [];
  const isAdmin = currentUser?.role === 'SUPER_ADMIN' || currentUser?.role === 'ADMIN';
  const canManage = isAdmin || hasAnyPermission(userPermissions, getAccountUpdatePermissions('transport-delivery'));

  const [record, setRecord] = useState<TransportRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [showStatusModal, setShowStatusModal] = useState(false);

  const fetchRecord = useCallback(async (options: { silent?: boolean } = {}) => {
    if (!options.silent) setLoading(true);
    try {
      const res = await api.get<{ success: boolean; record: TransportRecord }>(`/vehicle-transports/${id}`);
      setRecord(res.data.record);
    } catch {
      toast.error('Failed to load transport details.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { void fetchRecord(); }, [fetchRecord]);

  const handleDownload = async () => {
    if (!record) return;
    try {
      await downloadAuthedFile(`/vehicle-transports/${record.id}/challan`, `Delivery-Challan-${record.challanNumber}.pdf`);
    } catch {
      toast.error('Failed to download challan.');
    }
  };

  const handleResendWhatsApp = async () => {
    if (!record) return;
    try {
      const res = await api.post<{ success: boolean; message?: string }>(`/vehicle-transports/${record.id}/notify`);
      if (res.data.success) toast.success(res.data.message || 'WhatsApp sent to the customer.');
      else toast.warn(`WhatsApp not sent: ${res.data.message || 'unknown reason'}`);
    } catch {
      toast.error('Failed to queue WhatsApp notification.');
    }
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center"><BrandLoader /></div>;
  if (!record) return <div className="p-10 text-center text-slate-500">Transport record not found.</div>;

  const normalizedStatus = normalizeStatus(record.status);
  const currentStepIdx = Math.max(0, STATUS_ORDER.indexOf(normalizedStatus));
  const isCancelled = record.status === 'CANCELLED';
  // Time is shown only for stages up to the current one, never for a later stage.
  // The timeline arrives newest first, so the first entry seen for a stage is its latest.
  const reachedAt = new Map<TransportStatus, TimelineEntry>();
  record.timeline.forEach((entry) => {
    const key = normalizeStatus(entry.status);
    if (STATUS_ORDER.indexOf(key) > currentStepIdx) return;
    if (!reachedAt.has(key)) reachedAt.set(key, entry);
  });
  const { dispatch, delivery } = record.parties;

  return (
    <div className="min-h-screen bg-gray-50 pb-10">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex items-center gap-4">
        <button onClick={() => router.back()} className="p-2 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-slate-800 transition-colors">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-lg font-semibold text-slate-900 truncate">
              Transport Detail — {record.challanNumber}
            </h1>
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${transportStageTone(record.status)}`}>
              {transportStageLabel(record.status)}
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            {joinParts([
              record.sellAccount.listingTitle || joinParts([record.sellAccount.brandName, record.sellAccount.vehicleModel], ' '),
              record.sellAccount.vehicleNumber,
            ], ' · ')}
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <button onClick={handleDownload} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-600 hover:bg-slate-50 transition-colors">
            <Download className="h-3.5 w-3.5" /> Download Challan
          </button>
          {canManage && (
            <button onClick={handleResendWhatsApp} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-500 hover:bg-green-600 text-white text-xs font-medium transition-colors">
              <Send className="h-3.5 w-3.5" /> WhatsApp
            </button>
          )}
          {canManage && !isCancelled && (
            <button onClick={() => setShowStatusModal(true)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-400 hover:bg-amber-500 text-slate-900 text-xs font-semibold transition-colors">
              <Navigation className="h-3.5 w-3.5" /> Update Status
            </button>
          )}
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-6 space-y-5">
        {isCancelled && (
          <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm font-semibold text-rose-700">
            <X className="h-4 w-4" /> This shipment was cancelled.
          </div>
        )}

        {/* Amazon-style Tracking Stepper */}
        {!isCancelled && (
          <div className="bg-white border border-slate-200 rounded-xl p-6">
            <h2 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2">
              <ClipboardCheck className="h-4 w-4 text-amber-500" /> Shipment Tracking
            </h2>
            <div className="relative">
              <div className="absolute top-5 left-10 right-10 h-0.5 bg-slate-200 z-0" />
              <div
                className="absolute top-5 left-10 h-0.5 bg-amber-400 z-0 transition-all duration-500"
                style={{ width: `calc((100% - 5rem) * ${Math.max(0, currentStepIdx / (STATUS_STEPS.length - 1))})` }}
              />
              <div className="relative flex justify-between z-10">
                {STATUS_STEPS.map((step, idx) => {
                  const isLast = idx === STATUS_STEPS.length - 1;
                  const done = idx < currentStepIdx || (isLast && idx === currentStepIdx);
                  const active = idx === currentStepIdx && !done;
                  const Icon = step.icon;
                  const reached = reachedAt.get(step.key);
                  return (
                    <div key={step.key} className="flex flex-col items-center gap-1.5 w-20 text-center">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center transition-all shadow-sm ${
                        done ? 'bg-amber-400 text-slate-900' : active ? 'bg-amber-400 text-slate-900 ring-4 ring-amber-200' : 'bg-white border-2 border-slate-200 text-slate-400'
                      }`}>
                        {done ? <CheckCircle2 className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                      </div>
                      <span className={`text-[10px] font-medium leading-tight ${active ? 'text-amber-600' : done ? 'text-slate-700' : 'text-slate-400'}`}>
                        {step.label}
                      </span>
                      {reached ? (
                        <span className="text-[9px] leading-tight text-slate-400">
                          {formatShortDate(reached.createdAt)}
                        </span>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Consignor / FROM */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-2">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">FROM (Dispatch / Consignor)</h3>
            {dispatch.name && <p className="font-semibold text-slate-800">{dispatch.name}</p>}
            {dispatch.gstin && <p className="text-sm text-slate-500">GSTIN: {dispatch.gstin}</p>}
            {dispatch.address && <p className="text-sm text-slate-600">{dispatch.address}</p>}
            {placeLine(dispatch) && <p className="text-sm text-slate-600">{placeLine(dispatch)}</p>}
            {record.sellAccount.sellerNumber && (
              <a href={`tel:${record.sellAccount.sellerNumber}`} className="flex items-center gap-1 text-sm text-blue-600 hover:underline">
                <Phone className="h-3.5 w-3.5" />{record.sellAccount.sellerNumber}
              </a>
            )}
          </div>

          {/* Consignee / TO */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-2">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">TO (Delivery / Consignee)</h3>
            {delivery.name && <p className="font-semibold text-slate-800">{delivery.name}</p>}
            {delivery.gstin && <p className="text-sm text-slate-500">GSTIN: {delivery.gstin}</p>}
            {delivery.address && <p className="text-sm text-slate-600">{delivery.address}</p>}
            {placeLine(delivery) && <p className="text-sm text-slate-600">{placeLine(delivery)}</p>}
            {record.sellAccount.purchaserNumber && (
              <a href={`tel:${record.sellAccount.purchaserNumber}`} className="flex items-center gap-1 text-sm text-blue-600 hover:underline">
                <Phone className="h-3.5 w-3.5" />{record.sellAccount.purchaserNumber}
              </a>
            )}
          </div>
        </div>

        {/* Timeline */}
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2">
            <MapPin className="h-4 w-4 text-amber-500" /> Tracking History
          </h2>
          {record.timeline.length === 0 ? (
            <p className="text-xs text-slate-400">No tracking events yet.</p>
          ) : (
            <ol className="relative border-l border-slate-200 ml-3 space-y-4">
              {[...record.timeline].reverse().map((entry) => (
                <li key={entry.id} className="ml-4">
                  <div className="absolute -left-1.5 mt-1 h-3 w-3 rounded-full border-2 border-white bg-amber-400" />
                  <div>
                    <span className="text-xs font-semibold text-slate-700">{STATUS_LABEL[entry.status] || entry.status.replaceAll('_', ' ')}</span>
                    {entry.location && <span className="ml-2 text-xs text-slate-500">· {entry.location}</span>}
                    {entry.notes && <p className="text-xs text-slate-500 mt-0.5">{entry.notes}</p>}
                    <p className="text-[10px] text-slate-400 mt-0.5">
                      {formatDate(entry.createdAt)}{entry.actorName ? ` · by ${entry.actorName}` : ''}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>

      {/* Status Update Modal (shared with the shipment list) */}
      {showStatusModal && (
        <TransportStatusModal
          transportId={record.id}
          status={record.status}
          machineLabel={joinParts([
            record.sellAccount.listingTitle || joinParts([record.sellAccount.brandName, record.sellAccount.vehicleModel], ' '),
            record.sellAccount.vehicleNumber,
          ], ' · ')}
          customerName={delivery.name || record.sellAccount.purchaserName}
          canManage={canManage}
          onClose={() => setShowStatusModal(false)}
          onUpdated={() => { void fetchRecord({ silent: true }); }}
        />
      )}
    </div>
  );
}
