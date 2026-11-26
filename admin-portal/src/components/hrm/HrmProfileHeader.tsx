'use client';

import Link from 'next/link';
import { ArrowLeftRight } from 'lucide-react';
import type { HrmEmployee } from '@/lib/hrmApi';
import { formatHrmDate, formatHrmStatus, getHrmStatusClass } from '@/lib/hrmUi';
import { currentAssignmentOf, startsLater } from '@/lib/hrmProfile';

const action = 'inline-flex min-h-9 items-center rounded-lg px-3 text-xs font-bold';

const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]!.toUpperCase()).join('') || '?';

/** Who this is (name, code, status, posting) and the lifecycle actions the viewer may take. */
export default function HrmProfileHeader({
  employee,
  onboardingHref,
  saving,
  onConfirmJoining,
  onTransfer,
  onDeactivate,
  showCancelJoining,
  onReactivate,
  onChangeStatus,
}: {
  employee: HrmEmployee;
  onboardingHref: string;
  saving: boolean;
  /** Each action is given only when the viewer may take it. */
  onConfirmJoining?: (() => void) | undefined;
  onTransfer?: (() => void) | undefined;
  onDeactivate?: (() => void) | undefined;
  showCancelJoining: boolean;
  onReactivate?: (() => void) | undefined;
  onChangeStatus?: (() => void) | undefined;
}) {
  const name = employee.preferredName || employee.legalName;
  const assignment = currentAssignmentOf(employee.assignments);
  const facts = [
    employee.employeeCode, assignment?.designation, assignment?.orgUnit?.name, assignment?.officeUnit?.name,
    assignment && startsLater(assignment) ? `from ${formatHrmDate(assignment.effectiveFrom)}` : null,
  ].filter(Boolean);
  return (
    <header className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-amber-100 text-base font-bold text-amber-800" aria-hidden="true">{initials(name)}</span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="break-words text-xl font-bold text-slate-950">{name}</h1>
              <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${getHrmStatusClass(employee.status)}`}>{formatHrmStatus(employee.status)}</span>
              {onChangeStatus ? <button type="button" onClick={onChangeStatus} className="inline-flex min-h-7 items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-2.5 text-xs font-bold text-amber-900 hover:bg-amber-100"><ArrowLeftRight className="h-3.5 w-3.5" aria-hidden="true" /> Change status</button> : null}
            </div>
            <p className="mt-0.5 text-sm text-slate-600">{facts.join(' · ')}</p>
            <p className="mt-0.5 text-[11px] text-slate-400">{employee.source === 'RECRUITMENT' ? 'Joined through recruitment' : 'Added directly by HR'}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2" data-slot="employee-header-actions">
          {onConfirmJoining ? <button type="button" onClick={onConfirmJoining} className={`${action} bg-emerald-600 text-white hover:bg-emerald-700`}>Confirm joining</button> : null}
          {onTransfer ? <button type="button" onClick={onTransfer} className={`${action} border border-slate-200 bg-white text-slate-800 hover:bg-slate-50`}>Transfer</button> : null}
          {onDeactivate ? <button type="button" onClick={onDeactivate} className={`${action} border border-rose-200 bg-white text-rose-700 hover:bg-rose-50`}>Deactivate</button>
            : showCancelJoining ? <Link href={onboardingHref} title="This person has not joined yet: a no-show is closed with Cancel joining on the Onboarding page." className={`${action} border border-rose-200 bg-white text-rose-700 hover:bg-rose-50`}>Cancel joining (Onboarding)</Link> : null}
          {onReactivate ? <button type="button" disabled={saving} onClick={onReactivate} className={`${action} bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60`}>Reactivate</button> : null}
        </div>
      </div>
    </header>
  );
}
