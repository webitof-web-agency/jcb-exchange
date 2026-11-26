'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import { AlertCircle, Clock3, Loader2, Moon, Pencil, Plus, Power, RefreshCw, Trash2 } from 'lucide-react';
import { hrmApi, type HrmShift } from '@/lib/hrmApi';
import {
  emptyShiftForm, formatMinutes, shiftFormFrom, shiftLengthMinutes, shiftPayloadFromForm, validateShiftForm,
  type ShiftForm, type ShiftFormErrors,
} from '@/lib/hrmOnboardingPage';
import { getHrmErrorMessage } from '@/lib/hrmUi';
import { confirmDelete } from '@/store/confirmDeleteStore';
import HrmModal from './HrmModal';

const th = 'px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500';
const input = 'mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100 disabled:bg-slate-50';

function ShiftDialog({ shift, onClose, onDone }: { shift: HrmShift | null; onClose: () => void; onDone: (message: string) => void }) {
  const [form, setForm] = useState<ShiftForm>(() => (shift ? shiftFormFrom(shift) : emptyShiftForm()));
  const [errors, setErrors] = useState<ShiftFormErrors>({});
  const [saving, setSaving] = useState(false);
  const [initialForm] = useState(form);
  const dirty = JSON.stringify(form) !== JSON.stringify(initialForm);
  const [error, setError] = useState('');
  const set = <K extends keyof ShiftForm>(key: K, value: ShiftForm[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  };
  const submit = async () => {
    if (saving) return;
    const found = validateShiftForm(form);
    setErrors(found);
    if (Object.values(found).some(Boolean)) return;
    setSaving(true);
    setError('');
    try {
      const payload = shiftPayloadFromForm(form);
      if (shift) await hrmApi.updateShift(shift.id, payload);
      else await hrmApi.createShift(payload);
      onDone(shift ? `${payload.name} updated.` : `${payload.name} added.`);
    } catch (requestError) {
      setError(getHrmErrorMessage(requestError, 'The shift could not be saved.'));
    } finally {
      setSaving(false);
    }
  };
  const fieldError = (key: keyof ShiftForm) => errors[key] ? <span id={`hrm-shift-${key}-error`} className="mt-1 block text-xs text-rose-600">{errors[key]}</span> : null;
  const length = /^\d\d:\d\d$/.test(form.startTime) && /^\d\d:\d\d$/.test(form.endTime) && form.startTime !== form.endTime ? shiftLengthMinutes(form.startTime, form.endTime, form.isNightShift) : null;
  const text = (key: keyof ShiftForm, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <label className="block text-sm font-semibold text-slate-700">{label}
      <input {...props} value={String(form[key])} onChange={(event) => set(key, event.target.value as never)} aria-invalid={Boolean(errors[key])} aria-describedby={errors[key] ? `hrm-shift-${key}-error` : undefined} className={input} disabled={saving} />
      {fieldError(key)}
    </label>
  );
  return (
    <HrmModal
      title={shift ? `Edit ${shift.name}` : 'Add shift'}
      description={`${shift ? `Code ${shift.code}.` : 'The code is generated automatically.'} Timings are in Indian time; attendance is judged against the shift a person has on that day.`}
      onClose={onClose}
      busy={saving}
      lockDismiss={saving || dirty}
      size="lg"
      error={error}
      footer={<><button type="button" onClick={onClose} disabled={saving} className="inline-flex min-h-10 items-center rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50">Cancel</button><button type="button" onClick={() => void submit()} disabled={saving} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}Save</button></>}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">{text('name', 'Name', { placeholder: 'General shift', maxLength: 80 })}</div>
        {text('startTime', 'Starts at', { type: 'time' })}
        {text('endTime', 'Ends at', { type: 'time' })}
        <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 sm:col-span-2"><input type="checkbox" checked={form.isNightShift} onChange={(event) => set('isNightShift', event.target.checked)} disabled={saving} className="h-4 w-4 accent-amber-500" /> Night shift (ends the next day)</label>
        {text('breakMinutes', 'Break (minutes)', { inputMode: 'numeric' })}
        {text('graceMinutes', 'Grace for late arrival (minutes)', { inputMode: 'numeric' })}
        {text('halfDayMinutes', 'Worked minutes for a half day', { inputMode: 'numeric', placeholder: 'Leave empty to not use' })}
        {text('fullDayMinutes', 'Worked minutes for a full day', { inputMode: 'numeric', placeholder: 'Leave empty to not use' })}
        {shift ? <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 sm:col-span-2"><input type="checkbox" checked={form.isActive} onChange={(event) => set('isActive', event.target.checked)} disabled={saving} className="h-4 w-4 accent-amber-500" /> Active (can be given to employees)</label> : null}
        <p className="text-xs text-slate-500 sm:col-span-2">{length ? `Shift length ${formatMinutes(length)}.` : 'Choose different start and end times.'}</p>
      </div>
    </HrmModal>
  );
}

/** Shifts master: timings and day rules. View with attendance read; change with attendance manage. */
export default function HrmShifts({ canManage: hasManagePermission }: { canManage: boolean }) {
  const [shifts, setShifts] = useState<HrmShift[]>([]);
  // Shift masters are head office's: creating, editing and deleting also need all-India HRM access (the server answers
  // 403 HRM_ALL_INDIA_REQUIRED otherwise). The list says whether the viewer has it.
  const [allIndia, setAllIndia] = useState(false);
  const canManage = hasManagePermission && allIndia;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [dialog, setDialog] = useState<{ shift: HrmShift | null } | null>(null);
  const [busyId, setBusyId] = useState('');

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError('');
      try {
        const response = await hrmApi.listShifts(true);
        if (!cancelled) { setShifts(response.data.shifts); setAllIndia(Boolean(response.data.abilities?.allIndia)); }
      } catch (requestError) {
        if (!cancelled) setError(getHrmErrorMessage(requestError, 'Unable to load shifts.'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 0);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [reloadKey]);

  const reload = useCallback(() => setReloadKey((value) => value + 1), []);
  const done = (message: string) => { toast.success(message); setDialog(null); reload(); };

  const toggle = async (shift: HrmShift) => {
    if (busyId) return;
    setBusyId(shift.id);
    try {
      await hrmApi.updateShift(shift.id, { isActive: !shift.isActive });
      toast.success(`${shift.name} ${shift.isActive ? 'switched off' : 'switched on'}.`);
      reload();
    } catch (requestError) {
      toast.error(getHrmErrorMessage(requestError, 'The shift could not be changed.'));
    } finally {
      setBusyId('');
    }
  };
  const remove = async (shift: HrmShift) => {
    if (busyId) return;
    const ok = await confirmDelete({ title: 'Delete shift', itemName: shift.name, note: 'Only a shift nobody was ever on can be deleted. Otherwise switch it off.' });
    if (!ok) return;
    setBusyId(shift.id);
    try {
      await hrmApi.deleteShift(shift.id);
      toast.success(`${shift.name} deleted.`);
      reload();
    } catch (requestError) {
      toast.error(getHrmErrorMessage(requestError, 'The shift could not be deleted.'));
    } finally {
      setBusyId('');
    }
  };

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm" aria-labelledby="hrm-shifts-heading">
      <div className="flex flex-col gap-3 border-b border-slate-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-600"><Clock3 className="h-4 w-4" /></span>
          <div>
            <h2 id="hrm-shifts-heading" className="font-bold text-slate-950">Shifts</h2>
            <p className="text-xs text-slate-500">Working hours, break, grace and how a half / full day is counted. Given to employees with their weekly offs.</p>
            {hasManagePermission && !allIndia && !loading ? <p className="mt-1 text-xs text-amber-700">Shifts are managed by head office: changing them needs all-India HRM access.</p> : null}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={reload} disabled={loading} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50"><RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />Refresh</button>
          {canManage ? <button type="button" onClick={() => setDialog({ shift: null })} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-slate-950 px-3 text-xs font-semibold text-white hover:bg-slate-800"><Plus className="h-3.5 w-3.5" />Add shift</button> : null}
        </div>
      </div>
      {error ? (
        <div role="alert" className="flex items-center justify-between gap-3 border-b border-red-100 bg-red-50 px-5 py-3 text-sm text-red-700"><span className="flex items-center gap-2"><AlertCircle className="h-4 w-4" />{error}</span><button type="button" onClick={reload} className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold">Try again</button></div>
      ) : null}
      {loading && !shifts.length ? (
        <div role="status" className="space-y-2 p-4"><span className="sr-only">Loading shifts…</span>{[0, 1].map((index) => <div key={index} className="h-12 animate-pulse rounded-xl bg-slate-100" />)}</div>
      ) : shifts.length ? (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50"><tr><th scope="col" className={th}>Shift</th><th scope="col" className={th}>Timings</th><th scope="col" className={`${th} hidden md:table-cell`}>Break / grace</th><th scope="col" className={`${th} hidden lg:table-cell`}>Half / full day</th><th scope="col" className={th}>On it now</th><th scope="col" className={th}>Status</th>{canManage ? <th scope="col" className={`${th} text-right`}><span className="sr-only">Actions</span></th> : null}</tr></thead>
            <tbody className="divide-y divide-slate-100">
              {shifts.map((shift) => (
                <tr key={shift.id} className={shift.isActive ? '' : 'bg-slate-50/60 text-slate-500'}>
                  <td className="px-4 py-3"><span className="font-semibold text-slate-900">{shift.name}</span><span className="block font-mono text-[11px] text-slate-400">{shift.code}</span></td>
                  <td className="px-4 py-3 whitespace-nowrap">{shift.startTime}–{shift.endTime}{shift.isNightShift ? <Moon className="ml-1 inline h-3.5 w-3.5 text-indigo-500" aria-label="Night shift" /> : null}<span className="block text-[11px] text-slate-400">{formatMinutes(shift.lengthMinutes ?? shiftLengthMinutes(shift.startTime, shift.endTime, shift.isNightShift))}</span></td>
                  <td className="hidden px-4 py-3 md:table-cell">{formatMinutes(shift.breakMinutes)} / {formatMinutes(shift.graceMinutes)}</td>
                  <td className="hidden px-4 py-3 lg:table-cell">{formatMinutes(shift.halfDayMinutes)} / {formatMinutes(shift.fullDayMinutes)}</td>
                  <td className="px-4 py-3">{shift.employeesNow ?? 0}</td>
                  <td className="px-4 py-3"><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${shift.isActive ? 'bg-emerald-50 text-emerald-700 ring-emerald-600/20' : 'bg-slate-100 text-slate-600 ring-slate-500/20'}`}>{shift.isActive ? 'Active' : 'Off'}</span></td>
                  {canManage ? (
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button type="button" onClick={() => setDialog({ shift })} aria-label={`Edit ${shift.name}`} title="Edit" className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><Pencil className="h-4 w-4" /></button>
                        <button type="button" onClick={() => void toggle(shift)} disabled={busyId === shift.id} aria-label={`${shift.isActive ? 'Switch off' : 'Switch on'} ${shift.name}`} title={shift.isActive ? 'Switch off' : 'Switch on'} className={`rounded-lg p-2 hover:bg-slate-100 ${shift.isActive ? 'text-slate-400 hover:text-rose-600' : 'text-emerald-600'}`}><Power className="h-4 w-4" /></button>
                        <button type="button" onClick={() => void remove(shift)} disabled={busyId === shift.id} aria-label={`Delete ${shift.name}`} title="Delete" className="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600"><Trash2 className="h-4 w-4" /></button>
                      </div>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : !error ? (
        <div className="px-6 py-10 text-center"><Clock3 className="mx-auto h-8 w-8 text-slate-300" /><p className="mt-3 text-sm font-semibold text-slate-800">No shifts yet</p><p className="mx-auto mt-1 max-w-sm text-xs text-slate-500">Add the shifts people work, for example a General shift 09:30–18:30.</p></div>
      ) : null}
      {dialog ? <ShiftDialog shift={dialog.shift} onClose={() => setDialog(null)} onDone={done} /> : null}
    </section>
  );
}
