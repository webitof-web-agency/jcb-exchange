'use client';

import Link from 'next/link';
import type { HrmKycSummary } from '@/lib/hrmApi';
import { getHrmModulePath } from '@/lib/hrmUi';
import { HRM_DOCUMENT_VIEW_PERMISSIONS, viewerHasAny } from '@/lib/hrmAccess';
import { useAuthStore } from '@/store/authStore';

/**
 * PAN / Aadhaar / Bank status for one employee, linking to the KYC & Bank tab when something is missing. The tab
 * needs document access (hrm.documents.read, .manage or .verify): without it the chips are shown as plain status.
 */
export default function HrmKycChips({ portal, employeeId, kyc }: { portal: 'admin' | 'employee'; employeeId: string; kyc?: HrmKycSummary }) {
  const user = useAuthStore((state) => state.user);
  if (!kyc) return <span className="text-xs text-slate-500">—</span>;
  const items = [
    { label: 'PAN', done: kyc.pan },
    { label: 'Aadhaar', done: kyc.aadhaar },
    { label: 'Bank', done: kyc.bankAccounts > 0 },
  ];
  const complete = items.every((item) => item.done);
  const chips = items.map((item) => (
    <span key={item.label} className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${item.done ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200' : 'bg-slate-50 text-slate-600 ring-1 ring-slate-200'}`}>
      {item.done ? '✓ ' : ''}{item.label}
    </span>
  ));
  if (!viewerHasAny(user, HRM_DOCUMENT_VIEW_PERMISSIONS)) {
    return <span title={complete ? 'KYC complete' : 'KYC pending'} className="inline-flex flex-wrap items-center gap-1 p-0.5">{chips}</span>;
  }
  return (
    <Link href={getHrmModulePath(portal, employeeId, 'kyc')} title={complete ? 'KYC complete' : 'Complete KYC & bank details'} className="inline-flex flex-wrap items-center gap-1 rounded-lg p-0.5 hover:bg-slate-100">
      {chips}
    </Link>
  );
}
