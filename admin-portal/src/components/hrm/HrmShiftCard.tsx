'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Clock3, Loader2, RefreshCw } from 'lucide-react';
import { toast } from 'react-toastify';
import { hrmApi, type HrmShift, type HrmShiftAssignment, type HrmWeekDay } from '@/lib/hrmApi';
import { formatHrmDate, formatHrmStatus, getHrmErrorMessage, hasHrmPermission } from '@/lib/hrmUi';
import { describeShiftTimes, describeWeeklyOffs, indiaToday, validateWeeklyOffs, WEEK_DAYS } from '@/lib/hrmProfile';
import { useAuthStore } from '@/store/authStore';
import HrmModal from './HrmModal';

const DAY_SHORT: Record<HrmWeekDay, string> = { MON: 'Mon', TUE: 'Tue', WED: 'Wed', THU: 'Thu', FRI: 'Fri', SAT: 'Sat', SUN: 'Sun' };

/** The employee's shift and weekly offs (effective-dated history) and assigning a new one. */
export default function HrmShiftCard({
  employeeId,
  portal,
  canAssign,
  assigning,
  onAssigningChange,
  onChanged,
}: {
  employeeId: string;
  portal: 'admin' | 'employee';
  canAssign: boolean;
  assigning: boolean;
  onAssigningChange: (open: boolean) => void;
  onChanged?: () => void;
}) {
  const [data, setData] = useState<{ currentId: string | null; assignments: HrmShiftAssignment[] } | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const requestRef = useRef(0);

  const load = useCallback(async () => {
    const request = ++requestRef.current;
    setLoading(true);
    try {
      const response = await hrmApi.listEmployeeShifts(employeeId);
      if (request !== requestRef.current) return;
      setData({ currentId: response.data.currentId, assignments: response.data.assignments });
      setError('');
    } catch (requestError) {
      if (request === requestRef.current) setError(getHrmErrorMessage(requestError, 'The shift could not be loaded.'));
    } finally {
      if (request === requestRef.current) setLoading(false);
    }
  }, [employeeId]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const current = data?.assignments.find((row) => row.id === data.currentId) ?? null;
  const history = data?.assignments.filter((row) => row.id !== data.currentId) ?? [];

  return (
    <section id="hrm-shift" aria-labelledby="hrm-shift-title" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2"><Clock3 className="h-4 w-4 text-amber-600" aria-hidden="true" /><h2 id="hrm-shift-title" className="font-bold text-slate-950">Shift & weekly off</h2></div>
        {canAssign ? <button type="button" onClick={() => onAssigningChange(true)} className="inline-flex min-h-8 items-center rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-bold text-slate-800 hover:bg-slate-50">{current ? 'Change shift' : 'Assign shift'}</button> : null}
      </div>
      {loading && !data ? <p className="mt-3 flex items-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</p> : null}
      {error ? <p role="alert" className="mt-3 flex items-center gap-2 text-sm text-rose-700">{error}<button type="button" onClick={() => void load()} className="inline-flex items-center gap-1 text-xs font-bold underline"><RefreshCw className="h-3 w-3" /> Try again</button></p> : null}
      {data ? (
        current ? (
          <div className="mt-3 rounded-xl border border-slate-100 bg-slate-50 p-3 text-sm">
            <p className="font-semibold text-slate-900">{current.shift.name} <span className="font-normal text-slate-500">· {describeShiftTimes(current.shift)}</span></p>
            <p className="mt-1 text-xs text-slate-600">Weekly off: {describeWeeklyOffs(current.weeklyOffs)}</p>
            <p className="mt-1 text-xs text-slate-500">From {formatHrmDate(current.effectiveFrom)}{current.effectiveTo ? ` to ${formatHrmDate(current.effectiveTo)}` : ''}</p>
          </div>
        ) : <p className="mt-3 text-sm text-slate-500">No shift assigned yet.</p>
      ) : null}
      {history.length ? (
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer text-xs font-bold text-slate-600">History ({history.length})</summary>
          <ul className="mt-2 space-y-1.5">{history.map((row) => <li key={row.id} className="flex flex-wrap justify-between gap-2 text-xs"><span className="text-slate-700">{row.shift.name} · {describeWeeklyOffs(row.weeklyOffs)}</span><span className="text-slate-500">{formatHrmDate(row.effectiveFrom)}{row.effectiveTo ? ` – ${formatHrmDate(row.effectiveTo)}` : ''} · {formatHrmStatus(row.status)}</span></li>)}</ul>
        </details>
      ) : null}
      {/* Opened only once the shifts are loaded, so the form starts from the current one. */}
      {assigning && data ? <AssignShiftDialog employeeId={employeeId} portal={portal} current={current} onClose={() => onAssigningChange(false)} onDone={async () => { onAssigningChange(false); await load(); onChanged?.(); }} /> : null}
    </section>
  );
}

function AssignShiftDialog({ employeeId, portal, current, onClose, onDone }: { employeeId: string; portal: 'admin' | 'employee'; current: HrmShiftAssignment | null; onClose: () => void; onDone: () => Promise<void> }) {
  const [shifts, setShifts] = useState<HrmShift[] | null>(null);
  const [loadError, setLoadError] = useState('');
  const [shiftId, setShiftId] = useState(current?.shift.isActive ? current.shiftId : '');
  const [days, setDays] = useState<HrmWeekDay[]>(current?.weeklyOffs.days ?? ['SUN']);
  const [saturdays, setSaturdays] = useState<number[]>(current?.weeklyOffs.saturdays ?? []);
  const [effectiveFrom, setEffectiveFrom] = useState(indiaToday());
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [initial] = useState(() => JSON.stringify({ shiftId, days, saturdays, effectiveFrom, reason }));
  const dirty = JSON.stringify({ shiftId, days, saturdays, effectiveFrom, reason }) !== initial;
  const { user } = useAuthStore();
  // The Shifts master is on the Organisation page, which needs hrm.org.read.
  const canOpenOrganisation = hasHrmPermission(user?.permissions, ['hrm.org.read', 'hrm.org.manage'], user?.role === 'SUPER_ADMIN');

  const loadShifts = useCallback(async () => {
    setLoadError('');
    try {
      const response = await hrmApi.listShifts();
      setShifts(response.data.shifts.filter((shift) => shift.isActive));
    } catch (requestError) {
      setLoadError(getHrmErrorMessage(requestError, 'The shifts could not be loaded.'));
    }
  }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => { void loadShifts(); }, 0);
    return () => window.clearTimeout(timer);
  }, [loadShifts]);

  const toggleDay = (day: HrmWeekDay) => {
    setDays((currentDays) => (currentDays.includes(day) ? currentDays.filter((value) => value !== day) : [...currentDays, day]));
    if (day === 'SAT') setSaturdays([]);
  };
  const toggleSaturday = (week: number) => setSaturdays((currentWeeks) => (currentWeeks.includes(week) ? currentWeeks.filter((value) => value !== week) : [...currentWeeks, week].sort()));

  const submit = async () => {
    if (saving) return;
    if (!shiftId) { setError('Choose the shift.'); return; }
    const problem = validateWeeklyOffs({ days, saturdays });
    if (problem) { setError(problem); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveFrom)) { setError('Choose the date the shift applies from.'); return; }
    setSaving(true); setError('');
    try {
      await hrmApi.assignShift(employeeId, { shiftId, weeklyOffs: { days, saturdays }, effectiveFrom, reason: reason.trim() || null });
      toast.success('Shift assigned.');
      await onDone();
    } catch (requestError) {
      setError(getHrmErrorMessage(requestError, 'The shift could not be assigned.'));
    } finally { setSaving(false); }
  };

  return (
    <HrmModal title={current ? 'Change shift' : 'Assign shift'} description="The shift in force ends the day before the new one starts; history is kept." onClose={onClose} busy={saving} lockDismiss={saving || dirty} size="md" error={error}
      footer={<>
        <button type="button" onClick={onClose} disabled={saving} className="min-h-10 rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50">Cancel</button>
        <button type="button" onClick={() => void submit()} disabled={saving || !shifts?.length} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-slate-950 px-4 text-sm font-bold text-white disabled:opacity-60">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}Save</button>
      </>}>
      <div className="space-y-4">
        {loadError ? <p role="alert" className="text-sm text-rose-700">{loadError} <button type="button" onClick={() => void loadShifts()} className="font-bold underline">Try again</button></p> : null}
        {!shifts && !loadError ? <p className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading shifts…</p> : null}
        {shifts && !shifts.length ? <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">No shifts are set up yet. {canOpenOrganisation ? <>Add them on <Link href={`/${portal}/hrm/organisation?tab=shifts`} className="font-bold underline">Organisation › Shifts</Link> first.</> : 'Ask somebody who manages attendance to add them on Organisation › Shifts.'}</p> : null}
        {shifts?.length ? (
          <label className="block text-xs font-semibold text-slate-700">Shift
            <select value={shiftId} onChange={(event) => setShiftId(event.target.value)} className="mt-1 min-h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-normal">
              <option value="">Choose a shift</option>
              {shifts.map((shift) => <option key={shift.id} value={shift.id}>{shift.name} ({describeShiftTimes(shift)})</option>)}
            </select>
          </label>
        ) : null}
        <fieldset>
          <legend className="text-xs font-semibold text-slate-700">Weekly off — every week</legend>
          <div className="mt-1.5 flex flex-wrap gap-1.5">{WEEK_DAYS.map((day) => <button type="button" key={day} aria-pressed={days.includes(day)} onClick={() => toggleDay(day)} className={`min-h-8 rounded-lg px-3 text-xs font-bold ${days.includes(day) ? 'bg-slate-950 text-white' : 'border border-slate-200 bg-white text-slate-700'}`}>{DAY_SHORT[day]}</button>)}</div>
        </fieldset>
        {days.includes('SAT') ? null : (
          <fieldset>
            <legend className="text-xs font-semibold text-slate-700">Saturdays of the month that are off</legend>
            <div className="mt-1.5 flex flex-wrap gap-1.5">{[1, 2, 3, 4, 5].map((week) => <button type="button" key={week} aria-pressed={saturdays.includes(week)} onClick={() => toggleSaturday(week)} className={`min-h-8 rounded-lg px-3 text-xs font-bold ${saturdays.includes(week) ? 'bg-slate-950 text-white' : 'border border-slate-200 bg-white text-slate-700'}`}>{week === 1 ? '1st' : week === 2 ? '2nd' : week === 3 ? '3rd' : `${week}th`}</button>)}</div>
          </fieldset>
        )}
        <p className="text-xs text-slate-600">Weekly off: <strong>{describeWeeklyOffs({ days, saturdays })}</strong></p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs font-semibold text-slate-700">Applies from<input type="date" value={effectiveFrom} onChange={(event) => setEffectiveFrom(event.target.value)} className="mt-1 min-h-10 w-full rounded-lg border border-slate-200 px-3 text-sm font-normal" /></label>
          <label className="text-xs font-semibold text-slate-700">Reason (optional)<input value={reason} maxLength={1000} onChange={(event) => setReason(event.target.value)} className="mt-1 min-h-10 w-full rounded-lg border border-slate-200 px-3 text-sm font-normal" /></label>
        </div>
      </div>
    </HrmModal>
  );
}
