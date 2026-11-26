'use client';

import { useState } from 'react';
import { Loader2, UserCog } from 'lucide-react';
import { hrmApi, type HrmAssignment } from '@/lib/hrmApi';
import { indiaDay } from '@/lib/hrmDay';
import { currentAssignmentOf } from '@/lib/hrmProfile';
import {
  EMPTY_MANAGER_SELECTION, chosenManager, describeManagerChange, managerChangeWindow, openPostingOf, suggestedManager, toManagerParams, validateManagerChange,
  type ManagerChangeErrors, type ManagerSelection,
} from '@/lib/hrmManagers';
import { formatHrmDate, getHrmErrorMessage } from '@/lib/hrmUi';
import HrmModal from './HrmModal';
import HrmManagerSelect from './HrmManagerSelect';

const FORM_ID = 'hrm-change-manager-form';
const inputClass = (error?: string) => `h-10 w-full rounded-lg border bg-white px-3 text-sm text-slate-900 outline-none focus:ring-2 disabled:bg-slate-50 ${error ? 'border-rose-300 focus:border-rose-400 focus:ring-rose-100' : 'border-slate-200 focus:border-amber-400 focus:ring-amber-100'}`;
const Problem = ({ message }: { message: string | undefined }) => (message ? <p role="alert" className="mt-1 text-xs font-medium text-rose-600">{message}</p> : null);

/** Changes only who the person reports to. Their office, department and designation stay; the old line stays in the history. */
export default function HrmChangeManagerDialog({ employee, assignments, onClose, onDone }: {
  employee: { id: string; employeeCode: string; name: string };
  assignments: HrmAssignment[];
  onClose: () => void;
  onDone: (message: string) => void | Promise<void>;
}) {
  const posting = openPostingOf(assignments);
  const current = posting?.managerEmployee ?? null;
  const [today] = useState(() => indiaDay());
  const dates = managerChangeWindow(posting?.effectiveFrom ?? today, today);
  // A change already scheduled for later: the manager of today stays until then, and this change builds on the later one.
  const inForce = currentAssignmentOf(assignments, today);
  const scheduled = dates.startsLater && inForce && inForce.id !== posting?.id ? inForce : null;
  const shown = scheduled ? scheduled.managerEmployee ?? null : current;
  const [mode, setMode] = useState<'set' | 'none'>('set');
  const [manager, setManager] = useState<ManagerSelection>(EMPTY_MANAGER_SELECTION);
  const [effectiveFrom, setEffectiveFrom] = useState(dates.initial);
  const [reason, setReason] = useState('');
  const [errors, setErrors] = useState<ManagerChangeErrors>({});
  const [submitError, setSubmitError] = useState('');
  const [saving, setSaving] = useState(false);
  const query = { employeeId: employee.id };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving || !posting) return;
    const form = { mode, managerId: manager.manager?.id ?? '', effectiveFrom, reason };
    const found = validateManagerChange(form, { currentId: current?.id ?? null, selfId: employee.id, min: dates.min, max: dates.max });
    setErrors(found);
    if (Object.keys(found).length) return;
    setSaving(true);
    setSubmitError('');
    try {
      await hrmApi.changeReportingManager(employee.id, { managerEmployeeId: mode === 'set' ? form.managerId : null, effectiveFrom, ...(reason.trim() ? { reason: reason.trim() } : {}) });
      await onDone(describeManagerChange({ name: employee.name, managerName: mode === 'set' ? manager.manager?.name ?? null : null, effectiveFrom, today }));
    } catch (error) {
      setSubmitError(getHrmErrorMessage(error, 'The reporting manager could not be changed. Nothing was saved.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <HrmModal
      title={current ? 'Change reporting manager' : 'Set reporting manager'}
      description={`${employee.name} (${employee.employeeCode}). Only the reporting line changes: office, department and designation stay.`}
      onClose={onClose}
      busy={saving}
      size="lg"
      error={submitError}
      footer={(
        <>
          <button type="button" onClick={onClose} disabled={saving} className="h-10 rounded-xl border border-slate-200 px-5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60">Cancel</button>
          <button type="submit" form={FORM_ID} disabled={saving || !posting} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-amber-400 px-5 text-sm font-bold text-slate-950 shadow-sm hover:bg-amber-500 disabled:cursor-not-allowed disabled:opacity-60">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserCog className="h-4 w-4" />}{saving ? 'Saving…' : 'Save'}
          </button>
        </>
      )}
    >
      {!posting ? <p role="note" className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-900">This person has no assignment yet. Use Add assignment first: the reporting manager can be chosen there.</p> : (
        <form id={FORM_ID} onSubmit={(event) => void submit(event)} noValidate className="space-y-4">
          <p className="rounded-xl bg-slate-50 px-3 py-2.5 text-sm text-slate-700">Reports to now: {shown ? <strong>{shown.legalName} ({shown.employeeCode})</strong> : <span className="italic text-slate-500">Not set</span>}</p>
          {dates.startsLater ? (
            <p role="note" className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs leading-5 text-amber-900">
              {scheduled
                ? `A change is already scheduled from ${formatHrmDate(dates.began)} (reports to ${current?.legalName ?? 'nobody'}). What you save here applies from that day or later; until then nothing changes.`
                : `Their assignment starts on ${formatHrmDate(dates.began)}, so this change applies from that day or later.`}
            </p>
          ) : null}
          <fieldset disabled={saving}>
            <legend className="mb-1.5 text-sm font-medium text-slate-700">New reporting manager</legend>
            {current ? (
              <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1.5">
                {([['set', 'Choose a manager'], ['none', 'No reporting manager']] as const).map(([id, label]) => (
                  <label key={id} className="inline-flex cursor-pointer items-center gap-2 text-sm text-slate-700">
                    <input type="radio" name="hrm-change-manager-mode" checked={mode === id} onChange={() => { setMode(id); setErrors({}); setSubmitError(''); }} className="h-4 w-4 accent-amber-500" />{label}
                  </label>
                ))}
              </div>
            ) : null}
            {mode === 'set' ? (
              <HrmManagerSelect
                id="hrm-change-manager"
                ariaLabel="New reporting manager"
                value={manager.manager}
                auto={manager.source === 'auto'}
                currentId={current?.id ?? null}
                invalid={Boolean(errors.manager)}
                onChange={(next) => { setManager(chosenManager(next)); setErrors((value) => ({ ...value, manager: undefined })); setSubmitError(''); }}
                load={async (search) => (await hrmApi.getManagerOptions(toManagerParams(query, search))).data}
                loadKey={employee.id}
                // Somebody who has a manager is being given another one: nothing is filled in for them.
                onLoaded={(list) => { if (!current) setManager((value) => suggestedManager(value, list.preselect)); }}
              />
            ) : null}
            <Problem message={errors.manager} />
          </fieldset>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="hrm-change-manager-date" className="mb-1 block text-sm font-medium text-slate-700">Effective from <span className="text-rose-500">*</span></label>
              <input id="hrm-change-manager-date" type="date" value={effectiveFrom} min={dates.min} max={dates.max} disabled={saving} onChange={(event) => { setEffectiveFrom(event.target.value); setErrors((value) => ({ ...value, effectiveFrom: undefined })); setSubmitError(''); }} className={inputClass(errors.effectiveFrom)} />
              <Problem message={errors.effectiveFrom} />
            </div>
            <div>
              <label htmlFor="hrm-change-manager-reason" className="mb-1 block text-sm font-medium text-slate-700">Reason (optional)</label>
              <input id="hrm-change-manager-reason" value={reason} maxLength={500} disabled={saving} autoComplete="off" onChange={(event) => setReason(event.target.value)} placeholder="For example: new team lead" className={inputClass(errors.reason)} />
              <Problem message={errors.reason} />
            </div>
          </div>
        </form>
      )}
    </HrmModal>
  );
}
