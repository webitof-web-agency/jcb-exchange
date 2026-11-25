'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'react-toastify';
import { AlertCircle, CalendarDays, Loader2, Pencil, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { hrmApi, type HrmHoliday, type HrmHolidayAbilities } from '@/lib/hrmApi';
import { canChangeHoliday } from '@/lib/hrmAccess';
import { groupHolidaysByMonth, holidayScopeLabel, holidayYears, validateHolidayForm, type HolidayForm, type HolidayFormErrors } from '@/lib/hrmOnboardingPage';
import { getHrmErrorMessage } from '@/lib/hrmUi';
import { confirmDelete } from '@/store/confirmDeleteStore';
import SearchableSelect from '@/components/ui/SearchableSelect';
import HrmModal from './HrmModal';

type StateOption = { id: number; name: string };
const input = 'mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100';

function HolidayDialog({ holiday, states, reach, year, onClose, onDone }: { holiday: HrmHoliday | null; states: StateOption[]; reach: HrmHolidayAbilities; year: number; onClose: () => void; onDone: (message: string) => void }) {
  // All-India holidays need all-India access; a state holiday only for the viewer's own states (every state when all-India).
  const allowedStates = reach.allIndia ? states : states.filter((state) => reach.stateIds.includes(state.id));
  const [form, setForm] = useState<HolidayForm>(() => holiday
    ? { date: holiday.date.slice(0, 10), name: holiday.name, scope: holiday.scope, stateId: holiday.stateId ? String(holiday.stateId) : '', isOptional: holiday.isOptional }
    : { date: `${year}-01-01`, name: '', scope: reach.allIndia ? 'ALL_INDIA' : 'STATE', stateId: !reach.allIndia && allowedStates.length === 1 ? String(allowedStates[0].id) : '', isOptional: false });
  const [errors, setErrors] = useState<HolidayFormErrors>({});
  const [saving, setSaving] = useState(false);
  const [initialForm] = useState(form);
  const dirty = JSON.stringify(form) !== JSON.stringify(initialForm);
  const [error, setError] = useState('');
  const set = <K extends keyof HolidayForm>(key: K, value: HolidayForm[K]) => { setForm((current) => ({ ...current, [key]: value })); setErrors((current) => ({ ...current, [key]: undefined })); };
  const submit = async () => {
    if (saving) return;
    const found = validateHolidayForm(form);
    setErrors(found);
    if (Object.values(found).some(Boolean)) return;
    setSaving(true);
    setError('');
    const payload = { date: form.date, name: form.name.trim(), scope: form.scope, stateId: form.scope === 'STATE' ? Number(form.stateId) : null, isOptional: form.isOptional };
    try {
      if (holiday) await hrmApi.updateHoliday(holiday.id, payload);
      else await hrmApi.createHoliday(payload);
      onDone(holiday ? `${payload.name} updated.` : `${payload.name} added.`);
    } catch (requestError) {
      setError(getHrmErrorMessage(requestError, 'The holiday could not be saved.'));
    } finally {
      setSaving(false);
    }
  };
  return (
    <HrmModal
      title={holiday ? 'Edit holiday' : 'Add holiday'}
      description="A holiday for all of India, or for one state's offices."
      onClose={onClose}
      busy={saving}
      lockDismiss={saving || dirty}
      error={error}
      footer={<><button type="button" onClick={onClose} disabled={saving} className="inline-flex min-h-10 items-center rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50">Cancel</button><button type="button" onClick={() => void submit()} disabled={saving} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}Save</button></>}
    >
      <div className="grid gap-4">
        <label className="block text-sm font-semibold text-slate-700">Date<input type="date" value={form.date} onChange={(event) => set('date', event.target.value)} className={input} disabled={saving} aria-invalid={Boolean(errors.date)} />{errors.date ? <span className="mt-1 block text-xs text-rose-600">{errors.date}</span> : null}</label>
        <label className="block text-sm font-semibold text-slate-700">Name<input value={form.name} onChange={(event) => set('name', event.target.value)} maxLength={120} placeholder="Republic Day" className={input} disabled={saving} aria-invalid={Boolean(errors.name)} />{errors.name ? <span className="mt-1 block text-xs text-rose-600">{errors.name}</span> : null}</label>
        <fieldset>
          <legend className="text-sm font-semibold text-slate-700">Applies to</legend>
          <div className="mt-2 flex flex-wrap gap-4 text-sm">
            {reach.allIndia ? <label className="inline-flex items-center gap-2"><input type="radio" name="hrm-holiday-scope" checked={form.scope === 'ALL_INDIA'} onChange={() => set('scope', 'ALL_INDIA')} className="accent-amber-500" disabled={saving} />All India</label> : null}
            <label className="inline-flex items-center gap-2"><input type="radio" name="hrm-holiday-scope" checked={form.scope === 'STATE'} onChange={() => set('scope', 'STATE')} className="accent-amber-500" disabled={saving} />One state</label>
          </div>
          {!reach.allIndia ? <p className="mt-1 text-xs text-slate-500">All India holidays are managed by head office; you can add holidays for your own state{allowedStates.length === 1 ? '' : 's'}.</p> : null}
        </fieldset>
        {form.scope === 'STATE' ? (
          <div>
            <span className="text-sm font-semibold text-slate-700">State</span>
            <SearchableSelect id="hrm-holiday-state" options={allowedStates} value={form.stateId} displayValue={allowedStates.find((state) => String(state.id) === form.stateId)?.name ?? ''} onChange={(option) => set('stateId', String(option.id))} placeholder="Select state" disabled={saving} className="mt-1 w-full" />
            {errors.stateId ? <span className="mt-1 block text-xs text-rose-600">{errors.stateId}</span> : null}
          </div>
        ) : null}
        <label className="inline-flex items-center gap-2 text-sm font-semibold text-slate-700"><input type="checkbox" checked={form.isOptional} onChange={(event) => set('isOptional', event.target.checked)} className="h-4 w-4 accent-amber-500" disabled={saving} />Optional holiday (people may choose it; not a day off for everyone)</label>
      </div>
    </HrmModal>
  );
}

/** Holiday calendar: All India and state holidays by year. View with attendance read; change with attendance manage. */
export default function HrmHolidays({ canManage, states }: { canManage: boolean; states: StateOption[] }) {
  const [year, setYear] = useState(() => new Date().getFullYear());
  /** Which holidays the viewer may change (from the list): ALL_INDIA needs all-India access, STATE their own states. */
  const [reach, setReach] = useState<HrmHolidayAbilities | null>(null);
  const [stateFilter, setStateFilter] = useState('');
  const [holidays, setHolidays] = useState<HrmHoliday[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [dialog, setDialog] = useState<{ holiday: HrmHoliday | null } | null>(null);
  const [busyId, setBusyId] = useState('');
  const requestRef = useRef(0);

  useEffect(() => {
    const ticket = ++requestRef.current;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError('');
      try {
        const response = await hrmApi.listHolidays({ year, ...(stateFilter ? { stateId: Number(stateFilter) } : {}) });
        if (ticket === requestRef.current) { setHolidays(response.data.holidays); setReach(response.data.abilities ?? null); }
      } catch (requestError) {
        if (ticket === requestRef.current) setError(getHrmErrorMessage(requestError, 'Unable to load holidays.'));
      } finally {
        if (ticket === requestRef.current) setLoading(false);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [year, stateFilter, reloadKey]);

  const reload = useCallback(() => setReloadKey((value) => value + 1), []);
  const groups = useMemo(() => groupHolidaysByMonth(holidays), [holidays]);
  const done = (message: string) => { toast.success(message); setDialog(null); reload(); };
  const remove = async (holiday: HrmHoliday) => {
    if (busyId) return;
    if (!(await confirmDelete({ title: 'Delete holiday', itemName: `${holiday.name} (${holiday.date.slice(0, 10)})` }))) return;
    setBusyId(holiday.id);
    try {
      await hrmApi.deleteHoliday(holiday.id);
      toast.success(`${holiday.name} deleted.`);
      reload();
    } catch (requestError) {
      toast.error(getHrmErrorMessage(requestError, 'The holiday could not be deleted.'));
    } finally {
      setBusyId('');
    }
  };
  const canAdd = canManage && Boolean(reach && (reach.allIndia || reach.stateIds.length > 0));
  const stateOptions = [{ id: '', name: 'All India + every state' }, ...states.map((state) => ({ id: String(state.id), name: `All India + ${state.name}` }))];

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm" aria-labelledby="hrm-holidays-heading">
      <div className="flex flex-col gap-3 border-b border-slate-100 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-600"><CalendarDays className="h-4 w-4" /></span>
          <div>
            <h2 id="hrm-holidays-heading" className="font-bold text-slate-950">Holidays</h2>
            <p className="text-xs text-slate-500">All India holidays and each state&apos;s own holidays. Attendance uses the holidays of the state a person works in.</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="sr-only" htmlFor="hrm-holiday-year">Year</label>
          <select id="hrm-holiday-year" value={year} onChange={(event) => setYear(Number(event.target.value))} className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-sm">
            {holidayYears(new Date(), year).map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
          {states.length ? <SearchableSelect id="hrm-holiday-filter" options={stateOptions} value={stateFilter} displayValue={stateOptions.find((option) => option.id === stateFilter)?.name ?? ''} onChange={(option) => setStateFilter(String(option.id))} placeholder="All India + every state" className="w-60" size="sm" /> : null}
          <button type="button" onClick={reload} disabled={loading} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50"><RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />Refresh</button>
          {canAdd ? <button type="button" onClick={() => setDialog({ holiday: null })} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-slate-950 px-3 text-xs font-semibold text-white hover:bg-slate-800"><Plus className="h-3.5 w-3.5" />Add holiday</button> : null}
        </div>
      </div>
      {error ? <div role="alert" className="flex items-center justify-between gap-3 border-b border-red-100 bg-red-50 px-5 py-3 text-sm text-red-700"><span className="flex items-center gap-2"><AlertCircle className="h-4 w-4" />{error}</span><button type="button" onClick={reload} className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold">Try again</button></div> : null}
      {loading && !holidays.length ? (
        <div role="status" className="space-y-2 p-4"><span className="sr-only">Loading holidays…</span>{[0, 1, 2].map((index) => <div key={index} className="h-10 animate-pulse rounded-xl bg-slate-100" />)}</div>
      ) : groups.length ? (
        <div className="divide-y divide-slate-100">
          {groups.map((group) => (
            <div key={group.key} className="px-5 py-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{group.label}</p>
              <ul className="mt-2 space-y-1">
                {group.holidays.map((holiday) => (
                  <li key={holiday.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg px-2 py-1.5 hover:bg-slate-50">
                    <span className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="w-24 font-mono text-xs text-slate-500">{new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', weekday: 'short', timeZone: 'UTC' }).format(new Date(holiday.date))}</span>
                      <span className="font-semibold text-slate-900">{holiday.name}</span>
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${holiday.scope === 'ALL_INDIA' ? 'bg-sky-50 text-sky-700 ring-sky-600/20' : 'bg-violet-50 text-violet-700 ring-violet-600/20'}`}>{holidayScopeLabel(holiday)}</span>
                      {holiday.isOptional ? <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">Optional</span> : null}
                    </span>
                    {canManage && canChangeHoliday(reach, holiday) ? (
                      <span className="flex items-center gap-1">
                        <button type="button" onClick={() => setDialog({ holiday })} aria-label={`Edit ${holiday.name}`} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><Pencil className="h-4 w-4" /></button>
                        <button type="button" onClick={() => void remove(holiday)} disabled={busyId === holiday.id} aria-label={`Delete ${holiday.name}`} className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"><Trash2 className="h-4 w-4" /></button>
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      ) : !error ? (
        <div className="px-6 py-10 text-center"><CalendarDays className="mx-auto h-8 w-8 text-slate-300" /><p className="mt-3 text-sm font-semibold text-slate-800">No holidays for {year}</p><p className="mx-auto mt-1 max-w-sm text-xs text-slate-500">Add the All India holidays first, then each state&apos;s own holidays.</p></div>
      ) : null}
      {dialog && reach ? <HolidayDialog holiday={dialog.holiday} states={states} reach={reach} year={year} onClose={() => setDialog(null)} onDone={done} /> : null}
    </section>
  );
}
