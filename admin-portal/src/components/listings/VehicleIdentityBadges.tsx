'use client';

import { AlertTriangle, Copy, History, UserX } from 'lucide-react';
import { formatPortalDate } from '@/lib/partnerPortal';
import type { AdminVehicleIdentity } from '@/hooks/useVehicleIdentityCheck';

/**
 * Admin-only badges for a saved listing: Resale (the vehicle was sold before), Duplicate (another open
 * listing has the same vehicle or chassis number) and the seller-is-not-last-buyer warning.
 * Render this only on admin screens; the API sends `vehicleIdentity` to admins alone.
 */
export default function VehicleIdentityBadges({
  identity,
  detailed = false,
}: {
  identity: AdminVehicleIdentity | null | undefined;
  /** Full sentences (listing detail) instead of compact chips (listing table). */
  detailed?: boolean;
}) {
  if (!identity) return null;
  const { isResale, lastSale, sellerIsLastBuyer, activeDuplicates, otherDrafts } = identity;
  if (!isResale && !activeDuplicates.length && !otherDrafts.length) return null;

  const saleText = lastSale
    ? [
      lastSale.soldAt ? `Sold ${formatPortalDate(lastSale.soldAt)}` : 'Sold earlier',
      lastSale.buyerName ? `to ${lastSale.buyerName}` : '',
      lastSale.recordNumber ? `(${lastSale.recordNumber})` : '',
    ].filter(Boolean).join(' ')
    : '';
  const duplicateText = activeDuplicates
    .map((item) => `${item.title} (${item.status.replace(/_/g, ' ').toLowerCase()}${item.seller ? `, ${item.seller}` : ''})`)
    .join('; ');

  if (!detailed) {
    return (
      <span className="inline-flex flex-wrap items-center gap-1">
        {isResale ? (
          <span title={saleText} className="inline-flex items-center gap-0.5 rounded-full border border-sky-200 bg-sky-50 px-1.5 py-0.5 text-[10px] font-bold text-sky-800">
            <History className="h-2.5 w-2.5" /> Resale
          </span>
        ) : null}
        {activeDuplicates.length ? (
          <span title={`Same vehicle also open on: ${duplicateText}`} className="inline-flex items-center gap-0.5 rounded-full border border-red-200 bg-red-50 px-1.5 py-0.5 text-[10px] font-bold text-red-700">
            <Copy className="h-2.5 w-2.5" /> Duplicate
          </span>
        ) : null}
        {isResale && sellerIsLastBuyer === false ? (
          <span title="The seller's mobile number is not the buyer's number on the last recorded sale." className="inline-flex items-center gap-0.5 rounded-full border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold text-amber-800">
            <UserX className="h-2.5 w-2.5" /> Not last buyer
          </span>
        ) : null}
      </span>
    );
  }

  return (
    <div className="space-y-1.5 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs">
      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Vehicle history (admin only)</p>
      {isResale ? (
        <p className="flex items-start gap-1.5 font-semibold text-sky-800">
          <History className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>Resale vehicle. {saleText}.</span>
        </p>
      ) : null}
      {isResale && sellerIsLastBuyer === false ? (
        <p className="flex items-start gap-1.5 font-semibold text-amber-800">
          <UserX className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>The seller is not the buyer on the last recorded sale. Check ownership before approving.</span>
        </p>
      ) : null}
      {activeDuplicates.length ? (
        <p className="flex items-start gap-1.5 font-semibold text-red-700">
          <Copy className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>Same vehicle is also open on: {duplicateText}.</span>
        </p>
      ) : null}
      {otherDrafts.length ? (
        <p className="flex items-start gap-1.5 font-medium text-slate-600">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            {otherDrafts.length === 1 ? 'Another seller has a draft' : `${otherDrafts.length} other sellers have drafts`} for this vehicle:{' '}
            {otherDrafts.map((item) => `${item.title}${item.seller ? ` (${item.seller})` : ''}`).join('; ')}.
          </span>
        </p>
      ) : null}
    </div>
  );
}
