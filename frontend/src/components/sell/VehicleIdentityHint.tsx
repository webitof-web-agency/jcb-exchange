'use client';

import Link from 'next/link';
import { CheckCircle2, Loader2, XCircle } from 'lucide-react';
import type { VehicleIdentityFieldCheck } from '@/hooks/useVehicleIdentityCheck';
import { generateProfileListingDetailPath } from '@/lib/privateRoutePaths';

/** One line under the vehicle / chassis number field saying whether the number is already listed. */
export default function VehicleIdentityHint({
  check,
  ready,
  isChecking,
  label,
}: {
  check: VehicleIdentityFieldCheck | null | undefined;
  /** The number is long enough to check. */
  ready: boolean;
  isChecking: boolean;
  label: string;
}) {
  if (!ready) return null;

  if (isChecking) {
    return (
      <p className="flex items-center gap-1 text-[10px] font-medium text-gray-400">
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

  return (
    <p role="alert" className="flex flex-wrap items-center gap-1 text-[10px] font-semibold text-red-600">
      <XCircle className="h-3 w-3 shrink-0" />
      <span>{check.message || `This ${label} is already listed on JCB Exchange.`}</span>
      {check.listingId ? (
        <Link href={generateProfileListingDetailPath({ id: check.listingId })} className="underline underline-offset-2 hover:text-red-700">
          {check.state === 'OWN_DRAFT' ? 'Open draft' : 'View listing'}
        </Link>
      ) : null}
    </p>
  );
}
