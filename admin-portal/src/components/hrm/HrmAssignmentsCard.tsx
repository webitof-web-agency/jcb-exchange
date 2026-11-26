'use client';

import type { HrmAssignment } from '@/lib/hrmApi';
import { formatHrmDate, formatHrmStatus } from '@/lib/hrmUi';
import { getAssignmentLocation } from '@/lib/hrmDirectory';

/** Department, designation, office and reporting manager over time. */
export default function HrmAssignmentsCard({ assignments, onAdd, onChangeManager }: { assignments: HrmAssignment[]; onAdd?: (() => void) | undefined; onChangeManager?: (() => void) | undefined }) {
  return (
    <section id="hrm-assignments" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-bold text-slate-950">Assignments</h2>
        {onChangeManager ? <button type="button" onClick={onChangeManager} className="ml-auto inline-flex min-h-9 items-center rounded-lg border border-amber-300 bg-amber-50 px-3 text-xs font-bold text-amber-900 hover:bg-amber-100">Change manager</button> : null}
        {onAdd ? <button type="button" onClick={onAdd} className="inline-flex min-h-9 items-center rounded-lg bg-amber-400 px-3 text-xs font-bold text-slate-950 shadow-sm hover:bg-amber-500">Add assignment</button> : null}
      </div>
      {assignments.length ? (
        <ul className="mt-3 space-y-3">
          {assignments.map((assignment) => {
            const details = [getAssignmentLocation(assignment), assignment.managerEmployee ? `Reports to ${assignment.managerEmployee.legalName}` : 'Reports to: Not set'].filter(Boolean);
            return (
              <li key={assignment.id} className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                <p className="font-semibold text-slate-800">{assignment.designation}</p>
                <p className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-slate-500">
                  {assignment.orgUnit?.name || 'Department pending'} · {formatHrmStatus(assignment.status)}
                  {assignment.officeUnit?.name ? <> · {assignment.officeUnit.name}</> : null}
                  {assignment.isOfficeManager ? <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">{assignment.officeUnit?.type === 'REGION' ? 'State Manager' : 'Office manager'}</span> : null}
                </p>
                {details.length ? <p className="mt-1 text-xs text-slate-500">{details.join(' · ')}</p> : null}
                <p className="mt-1 text-xs text-slate-500">From {formatHrmDate(assignment.effectiveFrom)}{assignment.effectiveTo ? ` to ${formatHrmDate(assignment.effectiveTo)}` : ''}</p>
              </li>
            );
          })}
        </ul>
      ) : <p className="mt-3 text-sm text-slate-500">{onAdd ? 'No assignment yet. Add one to place this person in an office.' : 'No assignment has been recorded yet.'}</p>}
    </section>
  );
}
