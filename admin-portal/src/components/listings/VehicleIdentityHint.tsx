'use client';

import Link from 'next/link';
import { CheckCircle2, History, Loader2, XCircle } from 'lucide-react';
import { generateAdminListingDetailPath } from '@/lib/routePaths';
import { formatPortalDate } from '@/lib/partnerPortal';
import type { VehicleIdentityCheckResult, VehicleIdentityFieldCheck } from '@/hooks/useVehicleIdentityCheck';

/**
 * One line under the vehicle / chassis number field saying whether the number is already listed.
 * The resale line only appears for admins: the API reports PREVIOUSLY_SOLD to admins alone.
 */
export default function VehicleIdentityHint({
  check,
  result,
  ready,
  isChecking,
  label,
  listingBasePath,
}: {
  check: VehicleIdentityFieldCheck | null | undefined;
  result: VehicleIdentityCheckResult | null;
  /** The number is long enough to check. */
  ready: boolean;
  isChecking: boolean;
  label: string;
  /** e.g. /admin/listings or /partner/listings, for the link to the clashing listing. */
  listingBasePath: string;
}) {
  if (!ready) return null;

  if (isChecking) {
    return (
      <p className="flex items-center gap-1 text-[10px] font-medium text-slate-400">
        <Loader2 className="h-3 w-3 animate-spin" /> Checking JCB Exchange records...
      </p>
    );
  }

  if (!check || check.state === 'EMPTY') return null;

  if (check.state === 'UNIQUE') {
    return (
      <p className="flex items-center gap-1 text-[10px] font-semibold text-emerald-600">
        <CheckCircle2 className="h-3 w-3" /> Unique {label}. Not listed on JCB Exchange yet.
      </p>
    );
  }

  if (check.state === 'PREVIOUSLY_SOLD') {
    const sale = result?.lastSale;
    return (
      <p className="flex flex-wrap items-center gap-1 text-[10px] font-semibold text-sky-700">
        <History className="h-3 w-3 shrink-0" />
        <span>
          Resale: sold on JCB Exchange{sale?.soldAt ? ` on ${formatPortalDate(sale.soldAt)}` : ''}
          {sale?.recordNumber ? ` (${sale.recordNumber})` : ''}. Listing is allowed.
        </span>
      </p>
    );
  }

  const listingId = check.listing?.listingId || check.listingId;
  return (
    <p role="alert" className="flex flex-wrap items-center gap-1 text-[10px] font-semibold text-red-600">
      <XCircle className="h-3 w-3 shrink-0" />
      <span>{check.message || `This ${label} is already listed on JCB Exchange.`}</span>
      {check.listing ? <span className="font-medium text-red-500">({check.listing.title}, {check.listing.status.replace(/_/g, ' ').toLowerCase()})</span> : null}
      {listingId ? (
        <Link
          href={generateAdminListingDetailPath(listingBasePath, { id: listingId, title: check.listing?.title || null })}
          className="underline underline-offset-2 hover:text-red-700"
        >
          {check.state === 'OWN_DRAFT' ? 'Open draft' : 'View listing'}
        </Link>
      ) : null}
    </p>
  );
}
