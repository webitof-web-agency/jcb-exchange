'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, Landmark, Loader2, MapPin } from 'lucide-react';
import api from '@/lib/api';
import SearchableSelect from '@/components/ui/SearchableSelect';
import { hrmApi, type HrmEmployeeFormOptions } from '@/lib/hrmApi';
import { EMPLOYMENT_TYPE_OPTIONS } from '@/lib/hrmDirectory';
import {
  REASON_MAX_LENGTH,
  MIN_START_DATE,
  createEmptyAssignmentForm,
  firstAssignmentError,
  maxStartDate,
  stateOfficeStatus,
  toAssignmentPayload,
  validateAssignmentForm,
  type AssignmentErrors,
  type AssignmentForm,
  type AssignmentLocationType,
} from '@/lib/hrmAssignment';
import { indiaDay } from '@/lib/hrmDay';
import { formatHrmStatus, getHrmErrorMessage } from '@/lib/hrmUi';
import HrmModal from './HrmModal';
import HrmHeadOfficeField from './HrmHeadOfficeField';
import { defaultHeadOffice, headOfficePlace, headOfficeProblem, selectedHeadOffice } from '@/lib/hrmHeadOffice';
import HrmManagerSelect from './HrmManagerSelect';
import { EMPTY_MANAGER_SELECTION, chosenManager, forgetSuggestedManager, suggestedManager, toManagerParams, type ManagerQuery, type ManagerSelection } from '@/lib/hrmManagers';

type CityOption = { id: number; name: string };
type OptionsState =
  | { status: 'loading' }
  | { status: 'error'; message: string; forbidden: boolean }
  | { status: 'ready'; options: HrmEmployeeFormOptions };

const FORM_ID = 'hrm-add-assignment-form';

const inputClass = (error?: string) =>
  `h-10 w-full rounded-lg border bg-white px-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:ring-2 disabled:bg-slate-50 ${error ? 'border-rose-300 focus:border-rose-400 focus:ring-rose-100' : 'border-slate-200 focus:border-amber-400 focus:ring-amber-100'}`;

/** Cities of a state from the location master (the same source every other state/city picker uses). */
const fetchCities = async (stateId: string): Promise<CityOption[]> => (await api.get<CityOption[]>(`/locations/cities/${stateId}`)).data || [];

function Field({ id, label, required, error, hint, children, className = '' }: { id: string; label: string; required?: boolean; error?: string | undefined; hint?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-slate-700">{label}{required ? <span className="text-rose-500"> *</span> : null}</label>
      {children}
      {error ? <p id={`${id}-error`} role="alert" className="mt-1 text-xs font-medium text-rose-600">{error}</p> : hint ? <p className="mt-1 text-xs leading-5 text-slate-500">{hint}</p> : null}
    </div>
  );
}

/**
 * Gives an employee their first assignment: department, designation, employment type and the office they work from.
 * People added from a recruitment offer have none, so they cannot be placed, transferred or made a manager until this
 * is done. (Somebody who already has an open assignment is moved with Transfer instead.)
 */
export default function HrmAddAssignmentDialog({ employee, onClose, onDone }: {
  employee: { id: string; employeeCode: string; name: string };
  onClose: () => void;
  /** Called after the assignment was saved; the profile reloads. */
  onDone: () => void | Promise<void>;
}) {
  const [optionsState, setOptionsState] = useState<OptionsState>({ status: 'loading' });
  const [reloadKey, setReloadKey] = useState(0);
  const [form, setForm] = useState<AssignmentForm | null>(null);
  const [errors, setErrors] = useState<AssignmentErrors>({});
  const [submitError, setSubmitError] = useState('');
  const [saving, setSaving] = useState(false);
  const [cities, setCities] = useState<Record<string, CityOption[]>>({});
  const [citiesLoadingFor, setCitiesLoadingFor] = useState('');
  // Read from the clock once the options arrive (not while rendering).
  const [maxDate, setMaxDate] = useState<string | undefined>(undefined);
  const [cityError, setCityError] = useState('');
  // The state whose cities the person is looking at now: an answer for an earlier choice must not touch the screen.
  const latestStateRef = useRef('');
  const errorRef = useRef<HTMLParagraphElement | null>(null);
  const [manager, setManager] = useState<ManagerSelection>(EMPTY_MANAGER_SELECTION);

  const options = optionsState.status === 'ready' ? optionsState.options : null;

  // Load the form options (departments, designations, states, head office) once, and again on "Try again".
  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setOptionsState({ status: 'loading' });
      try {
        const response = await hrmApi.getEmployeeFormOptions();
        if (cancelled) return;
        const loaded = response.data.options;
        setOptionsState({ status: 'ready', options: loaded });
        setMaxDate(maxStartDate());
        setForm((current) => current ?? createEmptyAssignmentForm(indiaDay(), defaultHeadOffice(loaded.headOffices)?.id ?? null));
      } catch (error) {
        if (cancelled) return;
        const forbidden = (error as { response?: { status?: number } })?.response?.status === 403;
        setOptionsState({
          status: 'error',
          forbidden,
          message: forbidden ? 'You need hrm.employees.manage to load the department and designation lists.' : getHrmErrorMessage(error, 'Unable to load the departments and designations.'),
        });
      }
    }, 0);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [reloadKey]);

  const loadCities = useCallback(async (stateId: string) => {
    latestStateRef.current = stateId;
    if (!stateId || cities[stateId]) return;
    setCitiesLoadingFor(stateId);
    setCityError('');
    try {
      const list = await fetchCities(stateId);
      // The list is cached per state, so a late answer can never show the wrong state's cities.
      setCities((current) => ({ ...current, [stateId]: list }));
    } catch {
      if (latestStateRef.current === stateId) setCityError('Cities could not be loaded. Choose the state again to retry.');
    } finally {
      setCitiesLoadingFor((current) => (current === stateId ? '' : current));
    }
  }, [cities]);

  const update = <K extends keyof AssignmentForm>(key: K, value: AssignmentForm[K]) => {
    setForm((current) => (current ? { ...current, [key]: value } : current));
    setErrors((current) => ({ ...current, [key]: undefined }));
    setSubmitError('');
  };

  const changeState = (stateId: string) => {
    setForm((current) => (current ? { ...current, stateId, cityId: '' } : current));
    setErrors((current) => ({ ...current, stateId: undefined, cityId: undefined }));
    setSubmitError('');
    setCityError('');
    void loadCities(stateId);
  };

  const chooseLocation = (next: AssignmentLocationType) => {
    if (!form || next === form.locationType) return;
    setForm({ ...form, locationType: next });
    setErrors((current) => ({ ...current, locationType: undefined, headOfficeUnitId: undefined, stateId: undefined, cityId: undefined }));
    setSubmitError('');
    setCityError('');
  };

  const states = useMemo(() => options?.states ?? [], [options]);
  const selectedState = form ? states.find((state) => String(state.id) === form.stateId) : undefined;
  const status = stateOfficeStatus(form?.locationType === 'STATE_OFFICE' ? selectedState : undefined, Boolean(options?.abilities.canManageOrg));

  const departmentOptions = useMemo(() => (options?.departments ?? []).map((department) => ({ id: department.id, name: department.name })), [options]);
  const designationOptions = useMemo(() => (options?.designations ?? []).map((designation) => ({ id: designation.id, name: designation.name })), [options]);
  const typeOptions = useMemo(() => EMPLOYMENT_TYPE_OPTIONS.map((type) => ({ id: type, name: formatHrmStatus(type) })), []);
  const stateOptions = useMemo(() => states.map((state) => ({
    id: String(state.id),
    name: state.officeSwitchedOff ? `${state.name} · Office switched off` : !state.hasOffice ? `${state.name} · No office yet` : state.name,
  })), [states]);
  const cityOptions = useMemo(() => (form ? (cities[form.stateId] ?? []).map((city) => ({ id: String(city.id), name: city.name })) : []), [cities, form]);
  const citiesLoading = Boolean(form?.stateId) && citiesLoadingFor === form?.stateId;
  const headOffices = options?.headOffices ?? [];
  const headOfficeAvailable = headOffices.length > 0;
  /** The head office chosen in the form (the default until HR picks another). */
  const headOffice = selectedHeadOffice(headOffices, form?.headOfficeUnitId ?? '');

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving || !form || !options) return;
    const found = validateAssignmentForm(form, {
      headOfficeAvailable, headOfficeMessage: headOfficeProblem(headOffice), states, canManageOrg: options.abilities.canManageOrg,
    });
    setErrors(found);
    const first = firstAssignmentError(found);
    if (first) {
      setSubmitError('');
      window.setTimeout(() => document.getElementById(`hrm-assign-${first}`)?.focus(), 0);
      return;
    }
    setSaving(true);
    setSubmitError('');
    try {
      // Exactly the head office the form showed is sent, also when it was never touched.
      await hrmApi.createAssignment(employee.id, toAssignmentPayload({ ...form, headOfficeUnitId: headOffice?.id ?? '' }, manager.manager?.id));
      await onDone();
    } catch (requestError) {
      setSubmitError(getHrmErrorMessage(requestError, 'Unable to add the assignment. Nothing was saved.'));
      window.setTimeout(() => errorRef.current?.focus(), 0);
    } finally {
      setSaving(false);
    }
  };

  const locationTypes: Array<{ id: AssignmentLocationType; title: string; description: string; disabled: boolean }> = [
    { id: 'HEAD_OFFICE', title: 'Head office', description: headOfficeAvailable ? headOfficePlace(headOffice) || headOffice!.name : 'Set up the head office on the Organisation page first', disabled: !headOfficeAvailable },
    { id: 'STATE_OFFICE', title: 'State office', description: 'A state and city of India', disabled: false },
  ];
  const ready = Boolean(options && form);
  // Who they can report to depends on where they will work.
  const managerQuery: ManagerQuery = { employeeId: employee.id, stateId: form?.stateId, headOffice: form?.locationType === 'HEAD_OFFICE', managerRole: false };
  const blocked = ready && status.kind === 'blocked';

  // The dialog shell moves the focus once, while the body is still the loading text (so it lands on the close button).
  // When the form appears the focus goes to its first field: the chosen work location.
  useEffect(() => {
    if (!ready) return;
    const group = document.getElementById('hrm-assign-locationType');
    (group?.querySelector<HTMLElement>('[role="radio"][aria-checked="true"]:not([disabled])') ?? group?.querySelector<HTMLElement>('[role="radio"]:not([disabled])'))?.focus();
  }, [ready]);

  return (
    <HrmModal
      title="Add assignment"
      description={`Place ${employee.name} (${employee.employeeCode}) in a department and an office. Until then they cannot be transferred or made a manager.`}
      onClose={onClose}
      busy={saving}
      size="lg"
      footer={(
        <>
          <button type="button" onClick={onClose} disabled={saving} className="h-10 rounded-xl border border-slate-200 px-5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60">Cancel</button>
          <button type="submit" form={FORM_ID} disabled={!ready || saving || blocked} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-amber-400 px-5 text-sm font-bold text-slate-950 shadow-sm hover:bg-amber-500 disabled:cursor-not-allowed disabled:opacity-60">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}{saving ? 'Saving…' : 'Add assignment'}
          </button>
        </>
      )}
    >
      {optionsState.status === 'loading' ? (
        <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-500" role="status"><Loader2 className="h-4 w-4 animate-spin" /> Loading departments and designations…</div>
      ) : null}

      {optionsState.status === 'error' ? (
        <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
          <p className="flex items-start gap-2 font-medium"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{optionsState.message}</p>
          {optionsState.forbidden ? null : <button type="button" onClick={() => setReloadKey((value) => value + 1)} className="mt-3 inline-flex h-9 items-center rounded-lg border border-rose-200 bg-white px-3 text-xs font-bold text-rose-700 hover:bg-rose-100">Try again</button>}
        </div>
      ) : null}

      {options && form ? (
        <form id={FORM_ID} onSubmit={(event) => void submit(event)} noValidate className="space-y-5">
          <section className="space-y-3">
            <p className="text-sm font-bold text-slate-900">Work location</p>
            <div id="hrm-assign-locationType" tabIndex={-1} role="radiogroup" aria-label="Work location" className="grid gap-2 sm:grid-cols-2">
              {locationTypes.map((type) => {
                const selected = form.locationType === type.id;
                const Icon = type.id === 'HEAD_OFFICE' ? Landmark : MapPin;
                return (
                  <button key={type.id} type="button" role="radio" aria-checked={selected} disabled={type.disabled || saving} onClick={() => chooseLocation(type.id)} className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-left transition disabled:cursor-not-allowed disabled:opacity-50 ${selected ? 'border-amber-400 bg-amber-50 ring-2 ring-amber-100' : 'border-slate-200 bg-white hover:bg-slate-50'}`}>
                    <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${selected ? 'bg-amber-400 text-slate-950' : 'bg-slate-100 text-slate-500'}`}><Icon className="h-4 w-4" /></span>
                    <span className="min-w-0"><span className="block text-sm font-bold text-slate-900">{type.title}</span><span className="block text-xs text-slate-500">{type.description}</span></span>
                  </button>
                );
              })}
            </div>
            {errors.locationType ? <p role="alert" className="text-xs font-medium text-rose-600">{errors.locationType}</p> : null}

            {form.locationType === 'HEAD_OFFICE' ? (
              <div>
                <label htmlFor="hrm-assign-headOfficeUnitId" className="mb-1 block text-sm font-medium text-slate-700">Head office<span className="text-rose-500"> *</span></label>
                <HrmHeadOfficeField id="hrm-assign-headOfficeUnitId" offices={headOffices} value={form.headOfficeUnitId} onChange={(office) => update('headOfficeUnitId', office.id)} error={errors.headOfficeUnitId} disabled={saving} />
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  id="hrm-assign-stateId"
                  label="State"
                  required
                  error={errors.stateId || (status.kind === 'blocked' ? status.message : undefined)}
                  hint={status.kind === 'create' ? <span className="text-amber-700">{status.message}</span> : 'Every state is listed. A state without an office gets one when you save.'}
                >
                  <SearchableSelect id="hrm-assign-stateId" options={stateOptions} value={form.stateId} displayValue={selectedState?.name ?? ''} onChange={(option) => changeState(String(option.id))} placeholder="Select state" disabled={saving} className="w-full" />
                </Field>
                <Field id="hrm-assign-cityId" label="City" required error={errors.cityId || cityError || undefined}>
                  <SearchableSelect id="hrm-assign-cityId" options={cityOptions} value={form.cityId} displayValue={cityOptions.find((city) => String(city.id) === form.cityId)?.name ?? ''} onChange={(option) => update('cityId', String(option.id))} placeholder={form.stateId ? (citiesLoading ? 'Loading cities…' : 'Select city') : 'Select state first'} disabled={!form.stateId || saving} loading={citiesLoading} className="w-full" />
                </Field>
              </div>
            )}
          </section>

          <section className="grid gap-4 sm:grid-cols-2">
            <Field id="hrm-assign-orgUnitId" label="Department" required error={errors.orgUnitId} hint={departmentOptions.length ? undefined : 'No departments yet. Add one from the Organisation page.'}>
              <SearchableSelect id="hrm-assign-orgUnitId" options={departmentOptions} value={form.orgUnitId} displayValue={departmentOptions.find((department) => department.id === form.orgUnitId)?.name ?? ''} onChange={(option) => update('orgUnitId', String(option.id))} placeholder={departmentOptions.length ? 'Select department' : 'No departments yet'} disabled={!departmentOptions.length || saving} className="w-full" />
            </Field>
            <Field id="hrm-assign-designation" label="Designation" required error={errors.designation} hint={designationOptions.length ? undefined : 'No designations yet.'}>
              <SearchableSelect id="hrm-assign-designation" options={designationOptions} value={designationOptions.find((designation) => designation.name === form.designation)?.id ?? ''} displayValue={form.designation} onChange={(option) => update('designation', option.name)} placeholder={designationOptions.length ? 'Select designation' : 'No designations yet'} disabled={!designationOptions.length || saving} className="w-full" />
            </Field>
            <Field id="hrm-assign-employmentType" label="Employment type" error={errors.employmentType}>
              <SearchableSelect id="hrm-assign-employmentType" options={typeOptions} value={form.employmentType} displayValue={formatHrmStatus(form.employmentType)} onChange={(option) => update('employmentType', String(option.id))} searchable={false} disabled={saving} className="w-full" />
            </Field>
            <div className="sm:col-span-2">
              <label htmlFor="hrm-assign-manager" className="mb-1 block text-sm font-medium text-slate-700">Reporting manager</label>
              {form.locationType === 'HEAD_OFFICE' || form.stateId ? (
                <HrmManagerSelect
                  id="hrm-assign-manager"
                  value={manager.manager}
                  auto={manager.source === 'auto'}
                  onChange={(next) => { setManager(chosenManager(next)); setSubmitError(''); }}
                  load={async (search) => (await hrmApi.getManagerOptions(toManagerParams(managerQuery, search))).data}
                  loadKey={JSON.stringify(toManagerParams(managerQuery))}
                  onLoadStart={() => setManager(forgetSuggestedManager)}
                  onLoaded={(list) => setManager((current) => suggestedManager(current, list.preselect))}
                />
              ) : <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-500">Select the state first.</p>}
              <p className="mt-1 text-xs leading-5 text-slate-500">Optional. Left empty, the profile shows “Reports to: Not set”.</p>
            </div>
            <Field id="hrm-assign-effectiveFrom" label="Start date" required error={errors.effectiveFrom} hint="Takes effect on this day. A future date starts later.">
              <input id="hrm-assign-effectiveFrom" type="date" value={form.effectiveFrom} min={MIN_START_DATE} max={maxDate} onChange={(event) => update('effectiveFrom', event.target.value)} disabled={saving} aria-invalid={Boolean(errors.effectiveFrom)} className={inputClass(errors.effectiveFrom)} />
            </Field>
            <Field id="hrm-assign-reason" label="Reason (optional)" error={errors.reason} className="sm:col-span-2">
              <input id="hrm-assign-reason" value={form.reason} onChange={(event) => update('reason', event.target.value)} maxLength={REASON_MAX_LENGTH} placeholder="For example: joined through recruitment" disabled={saving} autoComplete="off" className={inputClass(errors.reason)} />
            </Field>
          </section>

          {submitError ? <p ref={errorRef} tabIndex={-1} role="alert" className="flex items-start gap-2 rounded-lg bg-rose-50 px-3 py-2.5 text-xs font-medium text-rose-700 outline-none"><AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />{submitError}</p> : null}
        </form>
      ) : null}
    </HrmModal>
  );
}
