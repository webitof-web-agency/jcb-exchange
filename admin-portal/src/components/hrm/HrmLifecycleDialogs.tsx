'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'react-toastify';
import { AlertCircle, ArrowRightLeft, Loader2, Power, RefreshCw, UserCog, UserPlus } from 'lucide-react';
import api from '@/lib/api';
import SearchableSelect from '@/components/ui/SearchableSelect';
import {
  hrmApi,
  type HrmLifecycleContext,
  type HrmMoveResult,
  type HrmOrganisation,
  type HrmOrganisationUnit,
} from '@/lib/hrmApi';
import { getInitials } from '@/lib/hrmDirectory';
import {
  DESIGNATION_REQUIRED_CODE,
  EXIT_OUTCOME_OPTIONS,
  KEEP_MANAGER,
  OUTGOING_DESIGNATION_HINT,
  REPLACE_DATE_MESSAGE,
  createAppointForm,
  createDeactivateForm,
  createReplaceForm,
  createTransferForm,
  describeDeactivation,
  describeOfficeOption,
  destinationKindOf,
  effectiveDateBounds,
  errorCodeOf,
  outgoingActionOptions,
  selectableOffices,
  setManager,
  stopsBeingManager,
  toAppointPayload,
  toDeactivatePayload,
  toReplacePayload,
  toTransferPayload,
  toServerDay,
  validateAppointForm,
  validateDeactivateForm,
  validateReplaceForm,
  validateTransferForm,
  type AppointErrors,
  type DeactivateErrors,
  type ExitOutcome,
  type ManagerChoice,
  type ManagerMode,
  type ReplaceErrors,
  type TransferErrors,
} from '@/lib/hrmLifecycle';
import { getHrmErrorMessage } from '@/lib/hrmUi';
import HrmEmployeePicker, { type PickedEmployee } from './HrmEmployeePicker';
import HrmModal from './HrmModal';

/* ------------------------------ shared pieces ------------------------------ */

type NationalManager = { id: string; employeeCode: string; name: string };
type CityOption = { id: number; name: string };
type SelectOption = { id: string; name: string };
type Loaded<T> = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; data: T };

const inputClass = (error?: string) =>
  `h-10 w-full rounded-lg border bg-white px-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:ring-2 disabled:bg-slate-50 ${error ? 'border-rose-300 focus:border-rose-400 focus:ring-rose-100' : 'border-slate-200 focus:border-amber-400 focus:ring-amber-100'}`;
const cancelButton = 'h-10 rounded-xl border border-slate-200 px-5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60';
const primaryButton = 'inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-amber-400 px-5 text-sm font-bold text-slate-950 shadow-sm hover:bg-amber-500 disabled:opacity-60';
const dangerButton = 'inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-rose-600 px-5 text-sm font-bold text-white shadow-sm hover:bg-rose-700 disabled:opacity-60';

function Field({ id, label, required, error, hint, children, className = '' }: { id: string; label: string; required?: boolean; error?: string | undefined; hint?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-slate-700">{label}{required ? <span className="text-rose-500"> *</span> : null}</label>
      {children}
      {error ? <p role="alert" className="mt-1 text-xs font-medium text-rose-600">{error}</p> : hint ? <p className="mt-1 text-xs leading-5 text-slate-500">{hint}</p> : null}
    </div>
  );
}

function Notice({ tone, children }: { tone: 'info' | 'warning' | 'danger'; children: React.ReactNode }) {
  const palette = tone === 'danger' ? 'border-rose-200 bg-rose-50 text-rose-800' : tone === 'warning' ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-slate-200 bg-slate-50 text-slate-700';
  return <div className={`flex items-start gap-2 rounded-xl border px-3 py-2.5 text-xs leading-5 ${palette}`}><AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" /><div className="min-w-0">{children}</div></div>;
}

function PersonCard({ name, code, detail }: { name: string; code: string; detail?: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2.5">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-100 text-xs font-bold text-amber-800" aria-hidden="true">{getInitials(name)}</span>
      <div className="min-w-0"><p className="truncate text-sm font-bold text-slate-900">{name}</p><p className="truncate text-xs text-slate-500">{[code, detail].filter(Boolean).join(' · ')}</p></div>
    </div>
  );
}

function DateField({ id, value, onChange, today, allowFuture, error, disabled }: { id: string; value: string; onChange: (value: string) => void; today: string; allowFuture: boolean; error?: string | undefined; disabled?: boolean }) {
  const bounds = effectiveDateBounds(today, allowFuture);
  return <input id={id} type="date" value={value} min={bounds.min} max={bounds.max} disabled={disabled} onChange={(event) => onChange(event.target.value)} aria-invalid={Boolean(error)} className={inputClass(error)} />;
}

/** Radio cards (native radio inputs, so the keyboard works): used for outcomes and for what happens to the outgoing manager. */
function ChoiceCards<T extends string>({ name, legend, options, value, onChange, disabled }: { name: string; legend: string; options: ReadonlyArray<{ id: T; title: string; description: string }>; value: T; onChange: (value: T) => void; disabled?: boolean }) {
  return (
    <fieldset className="min-w-0">
      <legend className="mb-1.5 text-sm font-medium text-slate-700">{legend}</legend>
      <div className="grid gap-2 sm:grid-cols-2">
        {options.map((option) => {
          const selected = value === option.id;
          return (
            <label key={option.id} className={`flex cursor-pointer items-start gap-2.5 rounded-xl border p-3 transition ${selected ? 'border-amber-400 bg-amber-50 ring-2 ring-amber-100' : 'border-slate-200 bg-white hover:border-slate-300'} ${disabled ? 'opacity-60' : ''}`}>
              <input type="radio" name={name} value={option.id} checked={selected} disabled={disabled} onChange={() => onChange(option.id)} className="mt-0.5 h-4 w-4 accent-amber-500" />
              <span><span className="block text-sm font-bold text-slate-900">{option.title}</span><span className="mt-0.5 block text-xs leading-4 text-slate-500">{option.description}</span></span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

/** A dialog body that is still loading, or failed to load, instead of the form. */
function LoadGate({ state, onRetry, label }: { state: Loaded<unknown>; onRetry: () => void; label: string }) {
  if (state.status === 'loading') return <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />{label}</div>;
  if (state.status === 'error') {
    return (
      <div className="py-6 text-center">
        <AlertCircle className="mx-auto h-7 w-7 text-rose-400" />
        <p role="alert" className="mt-2 text-sm font-medium text-slate-800">{state.message}</p>
        <button type="button" onClick={onRetry} className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"><RefreshCw className="h-3.5 w-3.5" />Try again</button>
      </div>
    );
  }
  return null;
}

/**
 * The dialog frame: header, scrolling body, and a footer that carries the error banner above the buttons, outside the
 * scrolling area, so a server error is never hidden below the fold.
 */
function LifecycleModal({
  title, description, formId, busy, error, submitLabel, busyLabel, icon: Icon, submitDisabled, danger, onClose, children,
}: {
  title: string; description: string; formId: string; busy: boolean; error: string; submitLabel: string; busyLabel: string; icon: typeof Power;
  submitDisabled?: boolean; danger?: boolean; onClose: () => void; children: React.ReactNode;
}) {
  const errorRef = useRef<HTMLParagraphElement | null>(null);
  useEffect(() => { if (error) errorRef.current?.focus(); }, [error]);
  return (
    <HrmModal
      title={title}
      description={description}
      onClose={onClose}
      busy={busy}
      size="lg"
      footer={(
        <div className="w-full">
          {error ? <p ref={errorRef} tabIndex={-1} role="alert" className="mb-3 flex items-start gap-2 rounded-lg bg-rose-50 px-3 py-2.5 text-xs font-medium text-rose-700 outline-none"><AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />{error}</p> : null}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button type="button" onClick={onClose} disabled={busy} className={cancelButton}>Cancel</button>
            <button type="submit" form={formId} disabled={busy || submitDisabled} className={danger ? dangerButton : primaryButton}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon className="h-4 w-4" />}{busy ? busyLabel : submitLabel}
            </button>
          </div>
        </div>
      )}
    >
      {children}
    </HrmModal>
  );
}

/** Loads something once when the dialog opens. setState only runs inside the timer callback. */
function useLoaded<T>(load: () => Promise<T>, fallbackMessage: string) {
  const [state, setState] = useState<Loaded<T>>({ status: 'loading' });
  const [reloadKey, setReloadKey] = useState(0);
  const loadRef = useRef(load);
  useEffect(() => { loadRef.current = load; });
  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setState({ status: 'loading' });
      try {
        const data = await loadRef.current();
        if (!cancelled) setState({ status: 'ready', data });
      } catch (error) {
        if (!cancelled) setState({ status: 'error', message: getHrmErrorMessage(error, fallbackMessage) });
      }
    }, 0);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [reloadKey, fallbackMessage]);
  return { state, reload: () => setReloadKey((current) => current + 1) };
}

const loadOrganisation = async () => (await hrmApi.getOrganisation()).data.organisation;
const loadContext = async (employeeId: string) => (await hrmApi.getLifecycleContext(employeeId)).data.context;
const loadActiveDesignations = async () => (await hrmApi.listDesignations()).data.designations.filter((designation) => designation.isActive);

const KEEP_DESIGNATION = '__keep__';

/**
 * Designation picker over the managed list (switched-off entries are not offered). With `emptyLabel` the first choice
 * means "no change" and the value stays empty; the server only accepts names that are on the list.
 */
function DesignationSelect({ id, value, onChange, emptyLabel }: { id: string; value: string; onChange: (name: string) => void; emptyLabel?: string }) {
  const loaded = useLoaded(loadActiveDesignations, 'Unable to load the designations.');
  const rows = useMemo(() => (loaded.state.status === 'ready' ? loaded.state.data : []), [loaded.state]);
  const options = useMemo(
    () => [...(emptyLabel ? [{ id: KEEP_DESIGNATION, name: emptyLabel }] : []), ...rows.map((designation) => ({ id: designation.id, name: designation.name }))],
    [rows, emptyLabel],
  );
  const key = value.replace(/\s+/g, ' ').trim().toLowerCase();
  const match = key ? rows.find((designation) => designation.name.toLowerCase() === key) : undefined;
  const selectedId = key ? (match?.id ?? '') : (emptyLabel ? KEEP_DESIGNATION : '');
  return (
    <>
      <SearchableSelect
        id={id}
        options={options}
        value={selectedId}
        displayValue={key ? value : (emptyLabel ?? '')}
        onChange={(option) => onChange(option.id === KEEP_DESIGNATION ? '' : option.name)}
        placeholder={loaded.state.status === 'loading' ? 'Loading designations…' : 'Select designation'}
        loading={loaded.state.status === 'loading'}
        disabled={loaded.state.status === 'error'}
        className="w-full"
      />
      {loaded.state.status === 'error' ? (
        <p role="alert" className="mt-1 text-xs font-medium text-rose-600">
          {loaded.state.message}{' '}
          <button type="button" onClick={loaded.reload} className="font-semibold underline-offset-2 hover:underline">Try again</button>
        </p>
      ) : null}
    </>
  );
}

/** Cities of the states a dialog needs, loaded once each from the location master (the same source the Add employee form uses). */
function useCities(stateIds: ReadonlyArray<number | null | undefined>) {
  const [cities, setCities] = useState<Record<string, CityOption[]>>({});
  const [loadingFor, setLoadingFor] = useState<Record<string, boolean>>({});
  const [error, setError] = useState('');
  // Bumped by retry(): the effect below runs again and loads every state whose cities are not there yet.
  const [retryNonce, setRetryNonce] = useState(0);
  const requested = useRef(new Set<string>());
  const key = stateIds.filter((id): id is number => Boolean(id)).join(',');

  useEffect(() => {
    const ids = key ? key.split(',') : [];
    const timer = window.setTimeout(() => {
      for (const stateId of ids) {
        if (requested.current.has(stateId)) continue;
        requested.current.add(stateId);
        setLoadingFor((current) => ({ ...current, [stateId]: true }));
        setError('');
        api.get<CityOption[]>(`/locations/cities/${stateId}`)
          .then((response) => setCities((current) => ({ ...current, [stateId]: response.data || [] })))
          .catch(() => { requested.current.delete(stateId); setError('Cities could not be loaded. Use “Try again” to load them.'); })
          .finally(() => setLoadingFor((current) => ({ ...current, [stateId]: false })));
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [key, retryNonce]);

  const optionsFor = useCallback((stateId?: number | null): SelectOption[] => (stateId ? (cities[String(stateId)] ?? []).map((city) => ({ id: String(city.id), name: city.name })) : []), [cities]);
  const isLoading = (stateId?: number | null) => Boolean(stateId && loadingFor[String(stateId)]);
  /** Loads the cities again: for one state, or (no argument) for every state of this dialog that has none yet. */
  const retry = (stateId?: number | null) => {
    const ids = stateId ? [String(stateId)] : (key ? key.split(',') : []);
    for (const id of ids) if (!cities[id]) requested.current.delete(id);
    setError('');
    setRetryNonce((current) => current + 1);
  };
  return { optionsFor, isLoading, error, retry };
}

/** The "Try again" link shown under a city field whose list could not be loaded. */
function CityRetry({ error, onRetry }: { error: string; onRetry: () => void }) {
  return error ? <button type="button" onClick={onRetry} className="mt-1 text-xs font-semibold text-amber-700 underline">Try again</button> : null;
}

function nationalManagerAsPicked(manager: NationalManager | null | undefined): PickedEmployee | null {
  return manager ? { id: manager.id, name: manager.name, employeeCode: manager.employeeCode, designation: 'National Operations Manager', location: '', officeUnitId: null, isOfficeManager: false } : null;
}

const MANAGER_MODE_LABELS = (keepLabel: string): Array<{ id: ManagerMode; label: string }> => [
  { id: 'keep', label: keepLabel },
  { id: 'set', label: 'Choose a manager' },
  { id: 'none', label: 'No reporting manager' },
];

/** Who the person reports to: the server default, a chosen person (with a quick pick for the National Operations Manager) or nobody. */
function ReportingManagerField({
  idPrefix, choice, picked, onChange, keepLabel, nationalManager, selfId, excludeIds, error,
}: {
  idPrefix: string; choice: ManagerChoice; picked: PickedEmployee | null; onChange: (choice: ManagerChoice, picked: PickedEmployee | null) => void;
  keepLabel: string; nationalManager: NationalManager | null; selfId?: string; excludeIds?: readonly string[]; error?: string | undefined;
}) {
  const quickPick = nationalManager && nationalManager.id !== selfId && !(choice.mode === 'set' && choice.employeeId === nationalManager.id) ? nationalManager : null;
  return (
    <fieldset className="min-w-0">
      <legend className="mb-1.5 text-sm font-medium text-slate-700">Reporting manager</legend>
      <div className="flex flex-wrap gap-x-4 gap-y-1.5">
        {MANAGER_MODE_LABELS(keepLabel).map((mode) => (
          <label key={mode.id} className="inline-flex cursor-pointer items-center gap-2 text-sm text-slate-700">
            <input
              type="radio"
              name={`${idPrefix}-manager-mode`}
              checked={choice.mode === mode.id}
              onChange={() => onChange(mode.id === 'set' ? setManager(picked?.id ?? '') : { mode: mode.id, employeeId: '' }, mode.id === 'set' ? picked : null)}
              className="h-4 w-4 accent-amber-500"
            />
            {mode.label}
          </label>
        ))}
      </div>
      {choice.mode === 'set' ? (
        <div className="mt-2 space-y-2">
          <HrmEmployeePicker
            id={`${idPrefix}-manager`}
            ariaLabel="Reporting manager"
            value={picked}
            invalid={Boolean(error)}
            excludeIds={[...(excludeIds ?? []), ...(selfId ? [selfId] : [])]}
            onChange={(employee) => onChange(setManager(employee?.id ?? ''), employee)}
          />
          {quickPick ? (
            <button type="button" onClick={() => onChange(setManager(quickPick.id), nationalManagerAsPicked(quickPick))} className="rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800 hover:bg-amber-100">
              Use National Operations Manager · {quickPick.name}
            </button>
          ) : null}
        </div>
      ) : null}
      {error ? <p role="alert" className="mt-1 text-xs font-medium text-rose-600">{error}</p> : null}
    </fieldset>
  );
}

/** Office, city and (optionally) department of a destination. The city only appears for a state office. */
function DestinationFields({
  idPrefix, offices, departments, officeId, cityId, departmentId, cityOptions, citiesLoading, cityError, onRetryCities, errors, onOffice, onCity, onDepartment, showDepartment = true, officeLabel = 'New office',
}: {
  idPrefix: string; offices: HrmOrganisationUnit[]; departments: SelectOption[]; officeId: string; cityId: string; departmentId: string;
  cityOptions: SelectOption[]; citiesLoading: boolean; cityError: string; onRetryCities: () => void;
  errors: { office?: string | undefined; city?: string | undefined };
  onOffice: (id: string) => void; onCity: (id: string) => void; onDepartment: (id: string) => void; showDepartment?: boolean; officeLabel?: string;
}) {
  const unit = offices.find((office) => office.id === officeId);
  const kind = destinationKindOf(unit);
  const officeOptions = useMemo(() => offices.map((office) => ({ id: office.id, name: describeOfficeOption(office) })), [offices]);
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field id={`${idPrefix}-office`} label={officeLabel} required error={errors.office}>
        <SearchableSelect id={`${idPrefix}-office`} options={officeOptions} value={officeId} displayValue={officeOptions.find((option) => option.id === officeId)?.name ?? ''} onChange={(option) => onOffice(String(option.id))} placeholder="Select the office" />
      </Field>
      {kind === 'STATE' ? (
        <Field id={`${idPrefix}-city`} label="City" required error={errors.city ?? (cityError || undefined)} hint={cityError ? undefined : 'The city the person will work from.'}>
          <SearchableSelect id={`${idPrefix}-city`} options={cityOptions} value={cityId} displayValue={cityOptions.find((option) => option.id === cityId)?.name ?? ''} loading={citiesLoading} onChange={(option) => onCity(String(option.id))} placeholder={citiesLoading ? 'Loading cities…' : 'Select the city'} />
          <CityRetry error={cityError} onRetry={onRetryCities} />
        </Field>
      ) : kind === 'HEAD_OFFICE' ? (
        <div className="self-end pb-2 text-xs leading-5 text-slate-500">Works from {[unit?.city?.name, unit?.state?.name].filter(Boolean).join(', ') || 'the head office city'}.</div>
      ) : <div className="hidden sm:block" />}
      {showDepartment ? (
        <Field id={`${idPrefix}-department`} label="Department" hint="Leave empty to keep the current department." className="sm:col-span-2">
          <SearchableSelect id={`${idPrefix}-department`} options={departments} value={departmentId} displayValue={departments.find((option) => option.id === departmentId)?.name ?? ''} clearable onClear={() => onDepartment('')} onChange={(option) => onDepartment(String(option.id))} placeholder="Keep current department" />
        </Field>
      ) : null}
    </div>
  );
}

const departmentOptionsOf = (organisation?: HrmOrganisation | null): SelectOption[] =>
  (organisation?.units ?? []).filter((unit) => unit.kind === 'DEPARTMENT' && unit.isActive).map((unit) => ({ id: unit.id, name: unit.name })).sort((a, b) => a.name.localeCompare(b.name));

const singleNationalManager = (managers: ReadonlyArray<NationalManager> | undefined) => (managers?.length === 1 ? managers[0]! : null);

/* --------------------------------- transfer --------------------------------- */

/** Moves a person to another office on a chosen date; the current assignment ends the day before. */
export function TransferDialog({
  employee, currentOfficeUnitId, defaultOfficeUnitId, onClose, onDone,
}: {
  employee: { id: string; name: string; employeeCode: string };
  currentOfficeUnitId?: string | null;
  defaultOfficeUnitId?: string;
  onClose: () => void;
  onDone: (result: HrmMoveResult) => void;
}) {
  const [today] = useState(() => toServerDay(new Date()));
  const organisation = useLoaded(loadOrganisation, 'Unable to load the offices.');
  const context = useLoaded<HrmLifecycleContext | null>(useCallback(async () => {
    try { return await loadContext(employee.id); } catch { return null; }
  }, [employee.id]), 'Unable to load the employee.');
  const [form, setForm] = useState(() => createTransferForm(today, defaultOfficeUnitId && defaultOfficeUnitId !== currentOfficeUnitId ? defaultOfficeUnitId : ''));
  const [managerPicked, setManagerPicked] = useState<PickedEmployee | null>(null);
  const [errors, setErrors] = useState<TransferErrors>({});
  const [submitError, setSubmitError] = useState('');
  const [saving, setSaving] = useState(false);

  const org = organisation.state.status === 'ready' ? organisation.state.data : null;
  const offices = useMemo(() => selectableOffices(org?.units ?? [], currentOfficeUnitId), [org, currentOfficeUnitId]);
  const departments = useMemo(() => departmentOptionsOf(org), [org]);
  const destination = offices.find((office) => office.id === form.toOfficeUnitId);
  const kind = destinationKindOf(destination);
  const cities = useCities([kind === 'STATE' ? destination?.state?.id : null]);
  const managesOffice = context.state.status === 'ready' && (context.state.data?.managerOf.length ?? 0) > 0;
  // A person without any assignment (for example added from a recruitment offer) has nothing to transfer yet.
  const noAssignment = context.state.status === 'ready' && context.state.data?.employee.hasAssignment === false;
  const losesManagerRole = stopsBeingManager({ managesOffice, destinationKind: kind, keepManagerRole: form.keepManagerRole });
  const nationalManager = singleNationalManager(org?.nationalOperationsManagers);

  const update = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => (current[key as keyof TransferErrors] ? { ...current, [key]: undefined } : current));
    setSubmitError('');
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving || !org || noAssignment) return;
    const found = validateTransferForm(form, { today, destinationKind: kind, employeeId: employee.id });
    setErrors(found);
    if (Object.keys(found).length) return;
    setSaving(true);
    setSubmitError('');
    try {
      const response = await hrmApi.transferEmployee(employee.id, toTransferPayload(form, { destinationKind: kind, managesOffice }));
      onDone(response.data);
    } catch (error) {
      setSubmitError(getHrmErrorMessage(error, 'Unable to transfer the employee. Nothing was changed.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <LifecycleModal
      title={`Transfer ${employee.name}`}
      description="The current assignment ends the day before the effective date and a new one starts on it. History is kept."
      formId="hrm-transfer-form"
      busy={saving}
      error={submitError}
      submitLabel="Transfer"
      busyLabel="Transferring…"
      icon={ArrowRightLeft}
      submitDisabled={!org || noAssignment}
      onClose={onClose}
    >
      {noAssignment ? (
        <div className="space-y-4">
          <PersonCard name={employee.name} code={employee.employeeCode} />
          <Notice tone="warning">This person has no assignment yet. Open their profile and use Add assignment first.</Notice>
          <div className="flex justify-end"><button type="button" onClick={onClose} className={cancelButton}>Close</button></div>
        </div>
      ) : !org ? <LoadGate state={organisation.state} onRetry={organisation.reload} label="Loading offices…" /> : (
        <form id="hrm-transfer-form" onSubmit={submit} noValidate className="space-y-5">
          <PersonCard name={employee.name} code={employee.employeeCode} />
          <DestinationFields
            idPrefix="hrm-transfer"
            offices={offices}
            departments={departments}
            officeId={form.toOfficeUnitId}
            cityId={form.cityId}
            departmentId={form.orgUnitId}
            cityOptions={cities.optionsFor(destination?.state?.id)}
            citiesLoading={cities.isLoading(destination?.state?.id)}
            cityError={cities.error}
            onRetryCities={() => cities.retry(destination?.state?.id)}
            errors={{ office: errors.toOfficeUnitId, city: errors.cityId }}
            onOffice={(id) => { setForm((current) => ({ ...current, toOfficeUnitId: id, cityId: '' })); setErrors((current) => ({ ...current, toOfficeUnitId: undefined, cityId: undefined })); setSubmitError(''); }}
            onCity={(id) => update('cityId', id)}
            onDepartment={(id) => update('orgUnitId', id)}
          />
          {losesManagerRole ? <Notice tone="info">They stop being a manager, so choose a new designation below.</Notice> : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="hrm-transfer-date" label="Effective from" required error={errors.effectiveFrom} hint="Today, a past date up to 90 days back, or a date up to a year ahead.">
              <DateField id="hrm-transfer-date" value={form.effectiveFrom} onChange={(value) => update('effectiveFrom', value)} today={today} allowFuture error={errors.effectiveFrom} />
            </Field>
            <Field id="hrm-transfer-designation" label="New designation" error={errors.designation} hint="Leave empty to keep the current one.">
              <DesignationSelect id="hrm-transfer-designation" value={form.designation} onChange={(name) => update('designation', name)} emptyLabel="Keep the current designation" />
            </Field>
          </div>
          <ReportingManagerField
            idPrefix="hrm-transfer"
            choice={form.manager}
            picked={managerPicked}
            keepLabel="Keep the current one"
            nationalManager={nationalManager}
            selfId={employee.id}
            error={errors.manager}
            onChange={(choice, picked) => { update('manager', choice); setManagerPicked(picked); }}
          />
          {kind === 'STATE' && managesOffice ? (
            <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-slate-200 p-3">
              <input type="checkbox" checked={form.keepManagerRole} onChange={(event) => update('keepManagerRole', event.target.checked)} className="mt-0.5 h-4 w-4 rounded accent-amber-500" />
              <span><span className="block text-sm font-semibold text-slate-900">Keep the manager role in the new state</span><span className="block text-xs leading-4 text-slate-500">Untick to move them as a regular member. Their current office will have no manager if they were the only one.</span></span>
            </label>
          ) : null}
          {managesOffice && context.state.status === 'ready' && context.state.data ? (
            <Notice tone="warning">{employee.name} manages {context.state.data.managerOf.map((office) => office.name).join(', ')}. If they were the only manager, that office will have no manager after the transfer.</Notice>
          ) : null}
          <Field id="hrm-transfer-reason" label="Reason" error={errors.reason} hint="Optional. Kept in the assignment history.">
            <textarea id="hrm-transfer-reason" value={form.reason} onChange={(event) => update('reason', event.target.value)} rows={2} maxLength={500} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100" />
          </Field>
        </form>
      )}
    </LifecycleModal>
  );
}

/* -------------------------------- deactivate -------------------------------- */

function OutcomeAndLogin({ outcome, onOutcome, disableLogin, onDisableLogin, showLogin, idPrefix, disabled }: { outcome: ExitOutcome; onOutcome: (value: ExitOutcome) => void; disableLogin: boolean; onDisableLogin: (value: boolean) => void; showLogin: boolean; idPrefix: string; disabled?: boolean }) {
  return (
    <div className="space-y-3">
      <ChoiceCards name={`${idPrefix}-outcome`} legend="What happens to them?" options={EXIT_OUTCOME_OPTIONS} value={outcome} onChange={onOutcome} {...(disabled !== undefined ? { disabled } : {})} />
      {showLogin ? (
        <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-slate-200 p-3">
          <input type="checkbox" checked={disableLogin} disabled={disabled} onChange={(event) => onDisableLogin(event.target.checked)} className="mt-0.5 h-4 w-4 rounded accent-amber-500" />
          <span><span className="block text-sm font-semibold text-slate-900">Also disable their login</span><span className="block text-xs leading-4 text-slate-500">They can no longer sign in to the portal. A suspended person can be reactivated, which enables the login again.</span></span>
        </label>
      ) : null}
    </div>
  );
}

/** Deactivates an employee (exit or suspension), moving the people who report to them and optionally closing their login. */
export function DeactivateDialog({
  employee, onClose, onDone,
}: {
  employee: { id: string; name: string; employeeCode: string };
  onClose: () => void;
  onDone: () => void;
}) {
  const [todayUtc] = useState(() => toServerDay(new Date())); // the server (IST) day
  const context = useLoaded(useCallback(() => loadContext(employee.id), [employee.id]), 'Unable to load the employee.');
  const organisation = useLoaded<HrmOrganisation | null>(useCallback(async () => {
    try { return await loadOrganisation(); } catch { return null; }
  }, []), 'Unable to load the organisation.');
  const [form, setForm] = useState(() => createDeactivateForm(todayUtc));
  const [reassignPicked, setReassignPicked] = useState<PickedEmployee | null>(null);
  const [errors, setErrors] = useState<DeactivateErrors>({});
  const [submitError, setSubmitError] = useState('');
  const [saving, setSaving] = useState(false);

  const info = context.state.status === 'ready' ? context.state.data : null;
  const directReports = info?.directReports ?? [];
  const nationalManager = singleNationalManager(organisation.state.status === 'ready' ? organisation.state.data?.nationalOperationsManagers : undefined);
  const outcomeWord = form.outcome === 'EXITED' ? 'Deactivate' : 'Suspend';

  const update = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => (current[key as keyof DeactivateErrors] ? { ...current, [key]: undefined } : current));
    setSubmitError('');
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving || !info) return;
    const found = validateDeactivateForm(form, { todayUtc, directReports: directReports.length, employeeId: employee.id });
    setErrors(found);
    if (Object.keys(found).length) return;
    setSaving(true);
    setSubmitError('');
    try {
      const response = await hrmApi.deactivateEmployee(employee.id, toDeactivatePayload(form, { hasLogin: info.employee.hasLogin, directReports: directReports.length }));
      toast.success(describeDeactivation(response.data, form.outcome, Object.fromEntries(info.managerOf.map((office) => [office.id, office.name]))));
      onDone();
    } catch (error) {
      setSubmitError(getHrmErrorMessage(error, 'Unable to deactivate the employee. Nothing was changed.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <LifecycleModal
      title={`${outcomeWord} ${employee.name}`}
      description="Their assignments, reporting lines and login are taken care of together, so nothing is left pointing at someone who is no longer working."
      formId="hrm-deactivate-form"
      busy={saving}
      error={submitError}
      submitLabel={outcomeWord}
      busyLabel={`${outcomeWord === 'Suspend' ? 'Suspending' : 'Deactivating'}…`}
      icon={Power}
      danger
      submitDisabled={!info}
      onClose={onClose}
    >
      {!info ? <LoadGate state={context.state} onRetry={context.reload} label="Checking reporting lines…" /> : (
        <form id="hrm-deactivate-form" onSubmit={submit} noValidate className="space-y-5">
          <PersonCard name={info.employee.name} code={info.employee.employeeCode} detail={info.employee.hasLogin ? 'Has a login' : 'No login'} />
          {info.managerOf.length ? (
            <Notice tone="danger"><strong>{info.employee.name} manages {info.managerOf.map((office) => office.name).join(', ')}.</strong> {info.managerOf.length === 1 ? 'That office' : 'Those offices'} will have no manager unless another manager is appointed.</Notice>
          ) : null}
          <OutcomeAndLogin idPrefix="hrm-deactivate" outcome={form.outcome} onOutcome={(value) => update('outcome', value)} disableLogin={form.disableLogin} onDisableLogin={(value) => update('disableLogin', value)} showLogin={info.employee.hasLogin} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="hrm-deactivate-date" label="Effective date" required error={errors.effectiveDate} hint="Today, or a past date up to 90 days back.">
              <DateField id="hrm-deactivate-date" value={form.effectiveDate} onChange={(value) => update('effectiveDate', value)} today={todayUtc} allowFuture={false} error={errors.effectiveDate} />
            </Field>
            <Field id="hrm-deactivate-reason" label="Reason" required error={errors.reason}>
              <input id="hrm-deactivate-reason" value={form.reason} onChange={(event) => update('reason', event.target.value)} maxLength={500} placeholder="For example: resigned" className={inputClass(errors.reason)} />
            </Field>
          </div>
          {directReports.length ? (
            <div className="space-y-2 rounded-xl border border-amber-200 bg-amber-50/60 p-3">
              <p className="text-sm font-bold text-slate-900">Who do these {directReports.length} {directReports.length === 1 ? 'person' : 'people'} report to from now on?</p>
              <p className="text-xs leading-5 text-slate-600">{directReports.slice(0, 5).map((person) => `${person.name} (${person.employeeCode})`).join(', ')}{directReports.length > 5 ? ` and ${directReports.length - 5} more` : ''} currently report to {info.employee.name}.</p>
              <HrmEmployeePicker id="hrm-deactivate-reassign" ariaLabel="New reporting manager" value={reassignPicked} invalid={Boolean(errors.reassignToId)} excludeIds={[employee.id]} onChange={(picked) => { setReassignPicked(picked); update('reassignToId', picked?.id ?? ''); }} />
              {nationalManager && nationalManager.id !== employee.id && reassignPicked?.id !== nationalManager.id ? (
                <button type="button" onClick={() => { setReassignPicked(nationalManagerAsPicked(nationalManager)); update('reassignToId', nationalManager.id); }} className="rounded-lg border border-amber-200 bg-white px-2.5 py-1 text-xs font-semibold text-amber-800 hover:bg-amber-100">Use National Operations Manager · {nationalManager.name}</button>
              ) : null}
              {errors.reassignToId ? <p role="alert" className="text-xs font-medium text-rose-600">{errors.reassignToId}</p> : null}
            </div>
          ) : null}
        </form>
      )}
    </LifecycleModal>
  );
}

/* --------------------------------- appoint --------------------------------- */

/** Makes an existing employee a manager (State Manager) of a state office. An office can have more than one. */
export function AppointManagerDialog({
  office, nationalOperationsManagers, onClose, onDone,
}: {
  office: { id: string; name: string; stateId?: number | null };
  nationalOperationsManagers: NationalManager[];
  onClose: () => void;
  onDone: (result: HrmMoveResult) => void;
}) {
  const [today] = useState(() => toServerDay(new Date()));
  const nationalManager = singleNationalManager(nationalOperationsManagers);
  const needsState = office.stateId === undefined;
  const organisation = useLoaded<HrmOrganisation | null>(useCallback(async () => (needsState ? loadOrganisation() : null), [needsState]), 'Unable to load the office.');
  const [form, setForm] = useState(() => createAppointForm(today, 'State Manager', nationalManager?.id ?? ''));
  const [picked, setPicked] = useState<PickedEmployee | null>(null);
  const [managerPicked, setManagerPicked] = useState<PickedEmployee | null>(() => nationalManagerAsPicked(nationalManager));
  const [errors, setErrors] = useState<AppointErrors>({});
  const [submitError, setSubmitError] = useState('');
  const [saving, setSaving] = useState(false);

  const resolvedStateId = office.stateId ?? (organisation.state.status === 'ready' ? organisation.state.data?.units.find((unit) => unit.id === office.id)?.state?.id ?? null : null);
  const cities = useCities([resolvedStateId]);
  const alreadyInOffice = picked?.officeUnitId === office.id;
  const blocked = needsState && organisation.state.status !== 'ready';

  const update = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => (current[key as keyof AppointErrors] ? { ...current, [key]: undefined } : current));
    setSubmitError('');
  };

  const choosePerson = (employee: PickedEmployee | null) => {
    setPicked(employee);
    setForm((current) => ({
      ...current,
      employeeId: employee?.id ?? '',
      // A person cannot report to themselves: fall back to the default manager.
      manager: employee && current.manager.mode === 'set' && current.manager.employeeId === employee.id ? KEEP_MANAGER : current.manager,
    }));
    setErrors((current) => ({ ...current, employeeId: undefined, cityId: undefined }));
    setSubmitError('');
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving || blocked) return;
    const found = validateAppointForm(form, { today, alreadyInOffice });
    setErrors(found);
    if (Object.keys(found).length) return;
    setSaving(true);
    setSubmitError('');
    try {
      const response = await hrmApi.appointOfficeManager(office.id, toAppointPayload(form));
      onDone(response.data);
    } catch (error) {
      setSubmitError(getHrmErrorMessage(error, 'Unable to appoint the manager. Nothing was changed.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <LifecycleModal
      title={`Appoint a manager for ${office.name}`}
      description="Pick an existing employee. A person who works elsewhere is moved to this office at the same time."
      formId="hrm-appoint-form"
      busy={saving}
      error={submitError}
      submitLabel="Appoint manager"
      busyLabel="Appointing…"
      icon={UserPlus}
      submitDisabled={blocked}
      onClose={onClose}
    >
      {blocked ? <LoadGate state={organisation.state} onRetry={organisation.reload} label="Loading the office…" /> : (
        <form id="hrm-appoint-form" onSubmit={submit} noValidate className="space-y-5">
          <Field id="hrm-appoint-person" label="Employee" required error={errors.employeeId}>
            <HrmEmployeePicker id="hrm-appoint-person" ariaLabel="Employee to appoint" value={picked} invalid={Boolean(errors.employeeId)} onChange={choosePerson} />
          </Field>
          {picked ? (
            alreadyInOffice
              ? <Notice tone="info">{picked.name} already works from {office.name}, so they only gain the manager role.</Notice>
              : <Notice tone="info">{picked.name} {picked.location ? `works in ${picked.location} today` : 'does not work from this office yet'}, so they will be moved to {office.name}.</Notice>
          ) : null}
          <div className="grid gap-4 sm:grid-cols-2">
            {picked && !alreadyInOffice ? (
              <Field id="hrm-appoint-city" label="City" required error={errors.cityId ?? (cities.error || undefined)} hint="The city they will work from in this state.">
                <SearchableSelect id="hrm-appoint-city" options={cities.optionsFor(resolvedStateId)} value={form.cityId} displayValue={cities.optionsFor(resolvedStateId).find((option) => option.id === form.cityId)?.name ?? ''} loading={cities.isLoading(resolvedStateId)} onChange={(option) => update('cityId', String(option.id))} placeholder="Select the city" />
                <CityRetry error={cities.error} onRetry={() => cities.retry(resolvedStateId)} />
              </Field>
            ) : (
              <Field id="hrm-appoint-city" label="City" error={cities.error || undefined} hint="Only needed when the person works elsewhere today.">
                <SearchableSelect id="hrm-appoint-city" options={cities.optionsFor(resolvedStateId)} value={form.cityId} displayValue={cities.optionsFor(resolvedStateId).find((option) => option.id === form.cityId)?.name ?? ''} loading={cities.isLoading(resolvedStateId)} clearable onClear={() => update('cityId', '')} onChange={(option) => update('cityId', String(option.id))} placeholder="Optional" />
                <CityRetry error={cities.error} onRetry={() => cities.retry(resolvedStateId)} />
              </Field>
            )}
            <Field id="hrm-appoint-date" label="Effective from" required error={errors.effectiveFrom} hint="Today, a past date up to 90 days back, or a date up to a year ahead.">
              <DateField id="hrm-appoint-date" value={form.effectiveFrom} onChange={(value) => update('effectiveFrom', value)} today={today} allowFuture error={errors.effectiveFrom} />
            </Field>
            <Field id="hrm-appoint-designation" label="Designation" error={errors.designation}>
              <DesignationSelect id="hrm-appoint-designation" value={form.designation} onChange={(name) => update('designation', name)} />
            </Field>
          </div>
          <ReportingManagerField
            idPrefix="hrm-appoint"
            choice={form.manager}
            picked={managerPicked}
            keepLabel="Default"
            nationalManager={nationalManager}
            {...(picked ? { selfId: picked.id } : {})}
            error={errors.manager}
            onChange={(choice, pickedManager) => { update('manager', choice); setManagerPicked(pickedManager); }}
          />
          <p className="-mt-3 text-xs leading-5 text-slate-500">{nationalManager ? `State Managers report to ${nationalManager.name} (National Operations Manager) by default.` : 'No single National Operations Manager is set, so the person keeps their current reporting manager unless you choose one.'}</p>
          <Field id="hrm-appoint-reason" label="Reason" error={errors.reason} hint="Optional. Kept in the assignment history.">
            <textarea id="hrm-appoint-reason" value={form.reason} onChange={(event) => update('reason', event.target.value)} rows={2} maxLength={500} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100" />
          </Field>
        </form>
      )}
    </LifecycleModal>
  );
}

/* --------------------------------- replace --------------------------------- */

/** Hands an office to a new manager and decides what happens to the manager who steps down. */
export function ReplaceManagerDialog({
  office, outgoing, nationalOperationsManagers, canDeactivate = false, onClose, onDone,
}: {
  office: { id: string; name: string; stateId?: number | null };
  outgoing: { id: string; name: string; employeeCode: string };
  nationalOperationsManagers: NationalManager[];
  /** Deactivating the outgoing manager needs hrm.employees.manage; without it that option is not offered. */
  canDeactivate?: boolean;
  onClose: () => void;
  /** `officeNames` lets the caller name a state that the replacement managed until now (it is now without a manager). */
  onDone: (result: { reportsMoved: number; vacatedOfficeId: string | null; officeNames: Record<string, string> }) => void;
}) {
  const [today] = useState(() => toServerDay(new Date()));
  const nationalManager = singleNationalManager(nationalOperationsManagers);
  const organisation = useLoaded(loadOrganisation, 'Unable to load the offices.');
  const [form, setForm] = useState(() => createReplaceForm(today));
  const designationRef = useRef<HTMLDivElement | null>(null);
  const [incoming, setIncoming] = useState<PickedEmployee | null>(null);
  const [managerPicked, setManagerPicked] = useState<PickedEmployee | null>(null);
  const [errors, setErrors] = useState<ReplaceErrors>({});
  const [submitError, setSubmitError] = useState('');
  const [saving, setSaving] = useState(false);

  const org = organisation.state.status === 'ready' ? organisation.state.data : null;
  const officeUnit = org?.units.find((unit) => unit.id === office.id);
  const stateId = office.stateId ?? officeUnit?.state?.id ?? null;
  const transferOffices = useMemo(() => selectableOffices(org?.units ?? [], office.id), [org, office.id]);
  const departments = useMemo(() => departmentOptionsOf(org), [org]);
  const transferUnit = transferOffices.find((unit) => unit.id === form.transferOfficeId);
  const transferKind = destinationKindOf(transferUnit);
  const cities = useCities([stateId, form.outgoingAction === 'TRANSFER' && transferKind === 'STATE' ? transferUnit?.state?.id : null]);
  const incomingAlreadyInOffice = incoming?.officeUnitId === office.id;
  const keepLabel = `Same as ${outgoing.name}'s manager${nationalManager ? ' (or the National Operations Manager)' : ''}`;

  const update = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => (current[key as keyof ReplaceErrors] ? { ...current, [key]: undefined } : current));
    setSubmitError('');
  };

  const chooseIncoming = (employee: PickedEmployee | null) => {
    setIncoming(employee);
    setForm((current) => ({
      ...current,
      incomingEmployeeId: employee?.id ?? '',
      manager: employee && current.manager.mode === 'set' && current.manager.employeeId === employee.id ? KEEP_MANAGER : current.manager,
    }));
    setErrors((current) => ({ ...current, incomingEmployeeId: undefined, incomingCityId: undefined }));
    setSubmitError('');
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving || !org) return;
    const found = validateReplaceForm(form, { today, outgoingEmployeeId: outgoing.id, incomingAlreadyInOffice, transferKind });
    setErrors(found);
    if (Object.keys(found).length) return;
    setSaving(true);
    setSubmitError('');
    try {
      const response = await hrmApi.replaceOfficeManager(office.id, toReplacePayload(form, { outgoingEmployeeId: outgoing.id, transferKind }));
      onDone({
        reportsMoved: response.data.reportsMoved,
        vacatedOfficeId: response.data.vacatedOfficeId ?? null,
        officeNames: Object.fromEntries(org.units.filter((unit) => unit.kind === 'STATE' || unit.kind === 'HEAD_OFFICE').map((unit) => [unit.id, unit.name])),
      });
    } catch (error) {
      setSubmitError(getHrmErrorMessage(error, 'Unable to replace the manager. Nothing was changed.'));
      // The outgoing manager was titled State Manager: say where the new title is chosen.
      if (errorCodeOf(error) === DESIGNATION_REQUIRED_CODE) {
        window.setTimeout(() => designationRef.current?.querySelector<HTMLElement>('button')?.focus(), 80);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <LifecycleModal
      title={`Replace the manager of ${office.name}`}
      description="Everything happens together, so the office is never left without a manager halfway."
      formId="hrm-replace-form"
      busy={saving}
      error={submitError}
      submitLabel="Replace manager"
      busyLabel="Replacing…"
      icon={UserCog}
      submitDisabled={!org}
      onClose={onClose}
    >
      {!org ? <LoadGate state={organisation.state} onRetry={organisation.reload} label="Loading offices…" /> : (
        <form id="hrm-replace-form" onSubmit={submit} noValidate className="space-y-5">
          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Stepping down</p>
            <PersonCard name={outgoing.name} code={outgoing.employeeCode} />
          </div>
          <Field id="hrm-replace-incoming" label="New manager" required error={errors.incomingEmployeeId}>
            <HrmEmployeePicker id="hrm-replace-incoming" ariaLabel="New manager" value={incoming} invalid={Boolean(errors.incomingEmployeeId)} excludeIds={[outgoing.id]} onChange={chooseIncoming} />
          </Field>
          {incoming ? (
            incomingAlreadyInOffice
              ? <Notice tone="info">{incoming.name} already works from {office.name}.</Notice>
              : <Notice tone="info">{incoming.name} {incoming.location ? `works in ${incoming.location} today` : 'does not work from this office yet'} and will be moved to {office.name}.</Notice>
          ) : null}
          <div className="grid gap-4 sm:grid-cols-2">
            {incoming && !incomingAlreadyInOffice ? (
              <Field id="hrm-replace-city" label="City" required error={errors.incomingCityId ?? (cities.error || undefined)} hint="The city the new manager will work from.">
                <SearchableSelect id="hrm-replace-city" options={cities.optionsFor(stateId)} value={form.incomingCityId} displayValue={cities.optionsFor(stateId).find((option) => option.id === form.incomingCityId)?.name ?? ''} loading={cities.isLoading(stateId)} onChange={(option) => update('incomingCityId', String(option.id))} placeholder="Select the city" />
                <CityRetry error={cities.error} onRetry={() => cities.retry(stateId)} />
              </Field>
            ) : null}
            <Field id="hrm-replace-date" label="Effective from" required error={errors.effectiveFrom} hint={REPLACE_DATE_MESSAGE}>
              <DateField id="hrm-replace-date" value={form.effectiveFrom} onChange={(value) => update('effectiveFrom', value)} today={today} allowFuture={false} error={errors.effectiveFrom} />
            </Field>
          </div>
          <ReportingManagerField
            idPrefix="hrm-replace"
            choice={form.manager}
            picked={managerPicked}
            keepLabel={keepLabel}
            nationalManager={nationalManager}
            {...(incoming ? { selfId: incoming.id } : {})}
            error={errors.manager}
            onChange={(choice, pickedManager) => { update('manager', choice); setManagerPicked(pickedManager); }}
          />
          <Notice tone="info">People in {office.name} who reported to {outgoing.name} will report to the new manager from now on.</Notice>

          <ChoiceCards name="hrm-replace-outgoing" legend={`What happens to ${outgoing.name}?`} options={outgoingActionOptions(canDeactivate)} value={form.outgoingAction} onChange={(value) => update('outgoingAction', value)} />
          {!canDeactivate ? <p className="-mt-3 text-xs leading-5 text-slate-500">Deactivating {outgoing.name} here needs the hrm.employees.manage permission. Ask someone with that access, or deactivate them from their profile.</p> : null}
          {form.outgoingAction !== 'DEACTIVATE' ? (
            <div ref={designationRef}>
              <Field id="hrm-replace-outgoing-designation" label={`New designation for ${outgoing.name}`} error={errors.outgoingDesignation} hint={OUTGOING_DESIGNATION_HINT}>
                <DesignationSelect id="hrm-replace-outgoing-designation" value={form.outgoingDesignation} onChange={(name) => update('outgoingDesignation', name)} emptyLabel="Keep the current designation" />
              </Field>
            </div>
          ) : null}
          {form.outgoingAction === 'TRANSFER' ? (
            <div className="rounded-xl border border-slate-200 p-3">
              <DestinationFields
                idPrefix="hrm-replace-move"
                offices={transferOffices}
                departments={departments}
                officeId={form.transferOfficeId}
                cityId={form.transferCityId}
                departmentId={form.transferOrgUnitId}
                cityOptions={cities.optionsFor(transferUnit?.state?.id)}
                citiesLoading={cities.isLoading(transferUnit?.state?.id)}
                cityError={cities.error}
                onRetryCities={() => cities.retry(transferUnit?.state?.id)}
                errors={{ office: errors.transferOfficeId, city: errors.transferCityId }}
                officeLabel={`${outgoing.name} moves to`}
                onOffice={(id) => { setForm((current) => ({ ...current, transferOfficeId: id, transferCityId: '' })); setErrors((current) => ({ ...current, transferOfficeId: undefined, transferCityId: undefined })); }}
                onCity={(id) => update('transferCityId', id)}
                onDepartment={(id) => update('transferOrgUnitId', id)}
              />
            </div>
          ) : null}
          {form.outgoingAction === 'DEACTIVATE' ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50/40 p-3">
              <OutcomeAndLogin idPrefix="hrm-replace-deactivate" outcome={form.deactivateOutcome} onOutcome={(value) => update('deactivateOutcome', value)} disableLogin={form.disableLogin} onDisableLogin={(value) => update('disableLogin', value)} showLogin />
              <p className="mt-2 text-xs leading-5 text-slate-600">Everyone who still reports to {outgoing.name} will report to the new manager.</p>
            </div>
          ) : null}
          <Field id="hrm-replace-reason" label="Reason" error={errors.reason} hint="Optional. Kept in the assignment history.">
            <textarea id="hrm-replace-reason" value={form.reason} onChange={(event) => update('reason', event.target.value)} rows={2} maxLength={500} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100" />
          </Field>
        </form>
      )}
    </LifecycleModal>
  );
}
