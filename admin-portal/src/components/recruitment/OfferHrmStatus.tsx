'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { toast } from 'react-toastify';
import { ExternalLink, Loader2, RefreshCw, UserPlus } from 'lucide-react';
import {
  apiErrorMessage,
  canOpenHrmProfile,
  describeHandoffOutcome,
  describeOfferHrm,
  hrmProfileHref,
  offerHrmApi,
  type OfferHrmTone,
  type StoredOfferHrm,
} from '@/lib/offerHrm';
import { useAuthStore } from '@/store/authStore';

const TONE: Record<OfferHrmTone, string> = {
  success: 'border-emerald-200 bg-emerald-50 text-emerald-900',
  info: 'border-sky-200 bg-sky-50 text-sky-900',
  danger: 'border-rose-200 bg-rose-50 text-rose-900',
  warning: 'border-amber-200 bg-amber-50 text-amber-900',
  neutral: 'border-gray-200 bg-gray-50 text-gray-800',
};
const BADGE: Record<OfferHrmTone, string> = {
  success: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  info: 'bg-sky-50 text-sky-700 border-sky-200',
  danger: 'bg-rose-50 text-rose-700 border-rose-200',
  warning: 'bg-amber-50 text-amber-800 border-amber-200',
  neutral: 'bg-gray-50 text-gray-600 border-gray-200',
};

/** A small badge for the offers list row. */
export function OfferHrmBadge({ hrm }: { hrm: StoredOfferHrm | null | undefined }) {
  const view = describeOfferHrm(hrm);
  return <span className={`mt-1 inline-block rounded-lg border px-2 py-0.5 text-[10px] font-bold ${BADGE[view.tone]}`} title={view.detail ?? undefined}>{view.label}</span>;
}

/**
 * Where an accepted offer stands in HRM (the pre-joining record): link to the profile when it is there (only for
 * viewers who can read HRM employees; others see the employee code as text), the reason when it is not, and
 * Retry / Add to HRM for people allowed to change offer status. Cancelled / dismissed handoffs are final.
 */
export default function OfferHrmStatus({
  offerId,
  hrm,
  canRun,
  onChanged,
}: {
  offerId: string;
  hrm: StoredOfferHrm | null | undefined;
  canRun: boolean;
  onChanged: () => void | Promise<void>;
}) {
  const pathname = usePathname() ?? '';
  const canOpenProfile = canOpenHrmProfile(useAuthStore((state) => state.user));
  const [running, setRunning] = useState(false);
  const view = describeOfferHrm(hrm);
  // A cancelled joining keeps its (archived / earlier) HR record; a done handoff links to the new one.
  const profileId = (hrm?.status === 'DONE' || hrm?.status === 'CANCELLED') ? hrm.employeeId : null;
  const profileLabel = hrm?.status === 'DONE' ? 'Open in HRM' : 'Open HR record';

  const run = async () => {
    if (running) return;
    setRunning(true);
    try {
      const response = await offerHrmApi.runHrmHandoff(offerId);
      const outcome = describeHandoffOutcome(response.data.result, hrm?.employeeCode);
      if (outcome.kind === 'success') toast.success(outcome.message);
      else if (outcome.kind === 'warning') toast.warning(outcome.message);
      else toast.info(outcome.message);
    } catch (error) {
      toast.error(apiErrorMessage(error, 'The HRM record could not be created.'));
    } finally {
      setRunning(false);
      await onChanged();
    }
  };

  return (
    <div className={`rounded-xl border p-3 text-xs ${TONE[view.tone]}`} aria-live="polite">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {/* Without hrm.employees.read the label ("In HRM · <code>") is the plain-text reference to the record. */}
        <p className="font-bold" title={profileId && !canOpenProfile ? 'Opening the HR profile needs the hrm.employees.read permission.' : undefined}>{view.label}</p>
        <div className="flex flex-wrap items-center gap-2">
          {profileId && canOpenProfile ? (
            <Link href={hrmProfileHref(pathname, profileId)} className="inline-flex items-center gap-1 rounded-lg bg-white/80 px-2.5 py-1 font-bold text-emerald-800 ring-1 ring-emerald-200 hover:bg-white">
              {profileLabel} <ExternalLink className="h-3 w-3" aria-hidden="true" />
            </Link>
          ) : null}
          {hrm?.status === 'PENDING' ? (
            <button type="button" onClick={() => void onChanged()} className="inline-flex items-center gap-1 rounded-lg bg-white/80 px-2.5 py-1 font-bold ring-1 ring-sky-200 hover:bg-white">
              <RefreshCw className="h-3 w-3" aria-hidden="true" /> Refresh
            </button>
          ) : null}
          {view.canRun && canRun ? (
            <button type="button" onClick={() => void run()} disabled={running} className="inline-flex items-center gap-1 rounded-lg bg-gray-900 px-2.5 py-1 font-bold text-white hover:bg-gray-800 disabled:opacity-60">
              {running ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" /> : <UserPlus className="h-3 w-3" aria-hidden="true" />}
              {running ? 'Working…' : view.runLabel}
            </button>
          ) : null}
        </div>
      </div>
      {view.detail ? <p className="mt-1.5 leading-5">{view.detail}</p> : null}
    </div>
  );
}
