'use client';

import Link from 'next/link';
import { CheckCircle2, Circle, ClipboardCheck, Clock3 } from 'lucide-react';
import type { HrmChecklistItem, HrmEmployeeOnboarding } from '@/lib/hrmApi';
import { formatHrmDate } from '@/lib/hrmUi';
import { CHECKLIST_STATE_LABELS, checklistStateClass, ONBOARDING_STATUS_LABELS } from '@/lib/hrmProfile';
import type { checklistAction } from '@/lib/hrmProfileTabs';

type Action = ReturnType<typeof checklistAction>;

const StateIcon = ({ state }: { state: HrmChecklistItem['state'] }) => {
  if (state === 'DONE') return <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />;
  if (state === 'PENDING') return <Clock3 className="h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />;
  return <Circle className="h-4 w-4 shrink-0 text-rose-400" aria-hidden="true" />;
};

/**
 * What is still needed before this person joins: progress, each item's state, and one button that opens exactly the
 * part where the item is done (Complete / Review / View).
 */
export default function HrmJoiningChecklistCard({
  onboarding,
  portal,
  actionFor,
  onOpen,
  canOpenOnboarding = false,
}: {
  onboarding: HrmEmployeeOnboarding;
  portal: 'admin' | 'employee';
  actionFor: (item: HrmChecklistItem) => Action;
  onOpen: (item: HrmChecklistItem, action: Exclude<Action, null>) => void;
  /** The viewer may open the Onboarding page (hrm.onboarding.read or .manage). */
  canOpenOnboarding?: boolean;
}) {
  const { progress, checklist, case: onboardingCase } = onboarding;
  const note = onboardingCase?.status === 'CANCELLED' ? onboardingCase.rejectionReason : onboardingCase?.reviewNote;
  return (
    <section id="hrm-joining-checklist" aria-labelledby="hrm-joining-checklist-title" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-amber-100 p-2.5 text-amber-700"><ClipboardCheck className="h-5 w-5" aria-hidden="true" /></div>
          <div>
            <h2 id="hrm-joining-checklist-title" className="font-bold text-slate-950">Joining checklist</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              {onboardingCase ? <>Onboarding {ONBOARDING_STATUS_LABELS[onboardingCase.status] ?? onboardingCase.status}{onboardingCase.targetJoiningDate ? ` · joining ${formatHrmDate(onboardingCase.targetJoiningDate)}` : ''}</> : 'Added directly by HR (no offer).'}
            </p>
          </div>
        </div>
        <div className="min-w-[180px] flex-1 sm:max-w-xs">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-700"><span>{progress.done} of {progress.total} done</span><span>{progress.percent}%</span></div>
          <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress.percent} aria-label="Joining checklist progress">
            <div className={`h-full rounded-full ${progress.percent === 100 ? 'bg-emerald-500' : 'bg-amber-400'}`} style={{ width: `${progress.percent}%` }} />
          </div>
        </div>
      </div>

      {onboardingCase?.status === 'NEEDS_REVIEW' ? (
        <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">
          {note || 'This accepted offer matches somebody who already has an HR record.'}
          {canOpenOnboarding ? <>{' '}<Link href={`/${portal}/hrm/onboarding`} className="font-bold underline">Decide it on the Onboarding page</Link>.</> : ' HR decides it on the Onboarding page.'}
        </p>
      ) : note ? (
        <p className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-700">{onboardingCase?.status === 'CANCELLED' ? 'Joining cancelled: ' : 'To complete: '}{note}</p>
      ) : null}

      <ul className="mt-4 divide-y divide-slate-100 rounded-xl border border-slate-100">
        {checklist.map((item) => {
          const action = actionFor(item);
          return (
            <li key={item.key} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-3 py-2.5">
              <div className="flex min-w-0 flex-1 items-start gap-2.5">
                <span className="mt-0.5"><StateIcon state={item.state} /></span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-800">{item.label}{item.required ? null : <span className="ml-1 text-[11px] font-normal text-slate-500">(optional)</span>}</p>
                  <p className="mt-0.5 text-[11px] leading-4 text-slate-500">{item.hint}</p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-bold ring-1 ring-inset ${checklistStateClass(item.state)}`}>{CHECKLIST_STATE_LABELS[item.state]}</span>
                {action ? (
                  <button type="button" onClick={() => onOpen(item, action)} aria-label={`${action}: ${item.label}`} className={`min-h-8 w-24 rounded-lg px-3 text-xs font-bold ${action === 'Complete' ? 'bg-amber-400 text-slate-950 hover:bg-amber-500' : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'}`}>{action}</button>
                ) : <span className="w-24" />}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
