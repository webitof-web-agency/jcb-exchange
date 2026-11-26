'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Landmark, Loader2, MapPin, Plus } from 'lucide-react';
import api from '@/lib/api';
import SearchableSelect from '@/components/ui/SearchableSelect';
import { hrmApi, type HrmOrganisation, type HrmOrganisationUnit, type HrmStateOfficesResult } from '@/lib/hrmApi';
import { cleanUnitName, describeSetupResult, describeSkippedState, describeStateOfficesResult, statesWithoutOffice, unitNameProblem } from '@/lib/hrmOrganisation';
import { getHrmErrorMessage } from '@/lib/hrmUi';
import HrmModal from './HrmModal';
import { DefaultStar } from './HrmHeadOfficeField';

type Done = (message: string) => void;
type CityOption = { id: number; name: string };

const inputClass = (error?: string) =>
  `h-10 w-full rounded-lg border bg-white px-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:ring-2 disabled:bg-slate-50 ${error ? 'border-rose-300 focus:border-rose-400 focus:ring-rose-100' : 'border-slate-200 focus:border-amber-400 focus:ring-amber-100'}`;

/** "Default head office" tick. The default is moved by ticking another office, so a ticked one cannot be unticked. */
function DefaultTick({ id, checked, onChange, locked, hint }: { id: string; checked: boolean; onChange?: (value: boolean) => void; locked?: boolean; hint: string }) {
  return (
    <label htmlFor={id} className={`flex items-start gap-2.5 rounded-xl border p-3 ${locked ? 'cursor-default border-slate-200 bg-slate-50' : 'cursor-pointer border-slate-200 hover:border-amber-300'}`}>
      <input id={id} type="checkbox" checked={checked} disabled={locked} onChange={(event) => onChange?.(event.target.checked)} className="mt-0.5 h-4 w-4 rounded accent-amber-500" />
      <span>
        <span className="flex items-center gap-1.5 text-sm font-semibold text-slate-900">Default head office <DefaultStar /></span>
        <span className="block text-xs leading-5 text-slate-500">{hint}</span>
      </span>
    </label>
  );
}

function Field({ id, label, required, error, hint, children }: { id: string; label: string; required?: boolean; error?: string | undefined; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-slate-700">{label}{required ? <span className="text-rose-500"> *</span> : null}</label>
      {children}
      {error ? <p role="alert" className="mt-1 text-xs font-medium text-rose-600">{error}</p> : hint ? <p className="mt-1 text-xs leading-5 text-slate-500">{hint}</p> : null}
    </div>
  );
}

const cancelButton = 'h-10 rounded-xl border border-slate-200 px-5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60';
const primaryButton = 'inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-amber-400 px-5 text-sm font-bold text-slate-950 shadow-sm hover:bg-amber-500 disabled:opacity-60';

export function AddUnitDialog({ organisation, kind, initialStateId, onClose, onDone }: { organisation: HrmOrganisation; kind: 'STATE' | 'HEAD_OFFICE'; /** Preselects the state (the "Add office" button of a state row). */ initialStateId?: number | undefined; onClose: () => void; onDone: Done }) {
  const isState = kind === 'STATE';
  const place = usePlace(organisation, initialStateId ? String(initialStateId) : '');
  // A state has one office, so only states without any office are offered (a switched-off one is switched on instead).
  const stateOptions = useMemo(() => (isState ? statesWithoutOffice(organisation) : organisation.states).map((state) => ({ id: state.id, name: state.name })), [isState, organisation]);
  const [name, setName] = useState('');
  const [makeDefault, setMakeDefault] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<'name' | 'stateId' | 'cityId', string>>>({});
  const [submitError, setSubmitError] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving) return;
    const cleaned = cleanUnitName(name);
    const found: typeof errors = {};
    const problem = isState && !cleaned ? null : unitNameProblem(cleaned);
    if (problem) found.name = problem;
    if (!place.stateId) found.stateId = 'Select the state.';
    if (!isState && !place.cityId) found.cityId = 'Select the city.';
    setErrors(found);
    if (Object.keys(found).length) return;
    setSaving(true);
    setSubmitError('');
    try {
      await hrmApi.createOrganisationUnit({
        kind,
        ...(cleaned ? { name: cleaned } : {}),
        stateId: Number(place.stateId),
        ...(isState ? {} : { cityId: Number(place.cityId) }),
        ...(!isState && makeDefault ? { isDefault: true } : {}),
      });
      onDone(isState ? `${place.stateName || 'State'} office added.` : makeDefault ? `${cleaned} added as the default head office.` : `${cleaned} added.`);
    } catch (error) {
      setSubmitError(getHrmErrorMessage(error, 'Unable to add the office. Nothing was saved.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <HrmModal
      title={isState ? 'Add state office' : 'Add head office unit'}
      description={isState ? 'One office per state. State Managers belong here.' : 'Another head office, with its own state and city.'}
      onClose={onClose}
      busy={saving}
      error={submitError}
      footer={<>
        <button type="button" onClick={onClose} disabled={saving} className={cancelButton}>Cancel</button>
        <button type="submit" form="hrm-add-unit-form" disabled={saving} className={primaryButton}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}{saving ? 'Adding…' : 'Add'}</button>
      </>}
    >
      <form id="hrm-add-unit-form" onSubmit={submit} noValidate className="space-y-4">
        {isState ? (
          <Field id="hrm-unit-state" label="State" required error={errors.stateId} hint={stateOptions.length ? undefined : 'Every state already has a state office.'}>
            <SearchableSelect id="hrm-unit-state" options={stateOptions} value={place.stateId} displayValue={place.stateName} onChange={(option) => { place.chooseState(String(option.id), false); setErrors((current) => ({ ...current, stateId: undefined })); }} placeholder="Select state" disabled={!stateOptions.length} className="w-full" />
          </Field>
        ) : <PlaceFields place={place} errors={{ ...(place.stateId ? {} : { stateId: errors.stateId }), ...(place.cityId ? {} : { cityId: errors.cityId }) }} idPrefix="hrm-unit" />}
        <Field id="hrm-unit-name" label={isState ? 'Office name' : 'Head office name'} required={!isState} error={errors.name} hint={isState ? `Optional. Leave empty to use “${place.stateName || 'State'} State Office”.` : undefined}>
          <input id="hrm-unit-name" value={name} onChange={(event) => { setName(event.target.value); setErrors((current) => ({ ...current, name: undefined })); }} placeholder={isState ? `${place.stateName || 'Gujarat'} State Office` : 'e.g. City Head Office'} maxLength={160} autoComplete="off" aria-invalid={Boolean(errors.name)} className={inputClass(errors.name)} />
        </Field>
        {isState ? null : <DefaultTick id="hrm-unit-default" checked={makeDefault} onChange={setMakeDefault} hint="Forms choose it first, and it is used wherever no head office is chosen. The current default loses the mark." />}
      </form>
    </HrmModal>
  );
}

/**
 * Opens the state offices of several states at once: tick the states, add them in one go. A state that got an
 * office in the meantime is skipped and reported instead of failing the others.
 */
export function AddStateOfficesDialog({ organisation, onClose, onDone }: { organisation: HrmOrganisation; onClose: () => void; onDone: Done }) {
  const candidates = useMemo(() => statesWithoutOffice(organisation), [organisation]);
  const [selected, setSelected] = useState<number[]>([]);
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [result, setResult] = useState<HrmStateOfficesResult | null>(null);

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return needle ? candidates.filter((state) => state.name.toLowerCase().includes(needle)) : candidates;
  }, [candidates, search]);
  const toggle = (id: number) => setSelected((current) => (current.includes(id) ? current.filter((value) => value !== id) : [...current, id]));
  const selectAllShown = () => setSelected((current) => [...new Set([...current, ...visible.map((state) => state.id)])]);
  const finish = () => onDone(result ? describeStateOfficesResult(result) : 'Done.');

  const submit = async () => {
    if (saving || !selected.length) return;
    setSaving(true);
    setSubmitError('');
    try {
      const response = await hrmApi.createStateOffices(selected);
      // Everything went through: close with a toast. Otherwise show what was skipped and why before closing.
      if (response.data.skipped.length) setResult(response.data);
      else onDone(describeStateOfficesResult(response.data));
    } catch (error) {
      setSubmitError(getHrmErrorMessage(error, 'Unable to add the state offices. Nothing was saved.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <HrmModal
      title="Add state offices"
      description="Tick every state you are opening an office in. Each office gets the name “<State> State Office”; you can rename it later."
      onClose={result ? finish : onClose}
      busy={saving}
      size="lg"
      error={result ? '' : submitError}
      footer={result ? (
        <button type="button" onClick={finish} className={primaryButton}>Done</button>
      ) : (
        <>
          <button type="button" onClick={onClose} disabled={saving} className={cancelButton}>Cancel</button>
          <button type="button" onClick={() => void submit()} disabled={saving || !selected.length} className={primaryButton}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}{saving ? 'Adding…' : selected.length ? `Add ${selected.length} state office${selected.length === 1 ? '' : 's'}` : 'Add state offices'}</button>
        </>
      )}
    >
      {result ? (
        <div className="space-y-4" role="status">
          <p className="flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2.5 text-sm font-semibold text-emerald-800"><MapPin className="h-4 w-4" />{describeStateOfficesResult(result)}</p>
          {result.created.length ? <p className="text-xs leading-5 text-slate-600"><span className="font-semibold text-slate-800">Added:</span> {result.created.map((office) => office.name).join(', ')}</p> : null}
          {result.skipped.length ? (
            <div className="rounded-lg bg-amber-50 px-3 py-2.5">
              <p className="text-xs font-semibold text-amber-900">Skipped</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs leading-5 text-amber-800">{result.skipped.map((skipped) => <li key={skipped.stateId}>{describeSkippedState(skipped)}</li>)}</ul>
            </div>
          ) : null}
        </div>
      ) : (
        <>
          {candidates.length ? (
            <fieldset>
              <legend className="sr-only">States without a state office</legend>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search states" aria-label="Search states" autoComplete="off" className={`${inputClass()} sm:max-w-xs`} />
                <div className="flex items-center gap-2 text-xs font-semibold">
                  <button type="button" onClick={selectAllShown} disabled={!visible.length} className="rounded-lg border border-slate-200 px-3 py-1.5 text-slate-700 hover:bg-slate-50 disabled:opacity-50">{search.trim() ? 'Select all shown' : 'Select all'}</button>
                  <button type="button" onClick={() => setSelected([])} disabled={!selected.length} className="rounded-lg border border-slate-200 px-3 py-1.5 text-slate-700 hover:bg-slate-50 disabled:opacity-50">Clear</button>
                </div>
              </div>
              <p className="mt-3 text-xs text-slate-500" aria-live="polite">{selected.length} selected · {candidates.length} state{candidates.length === 1 ? '' : 's'} without an office</p>
              {visible.length ? (
                <div className="mt-2 grid max-h-72 gap-2 overflow-y-auto rounded-xl border border-slate-200 p-2 sm:grid-cols-2">
                  {visible.map((state) => {
                    const checked = selected.includes(state.id);
                    return (
                      <label key={state.id} className={`flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2 text-sm transition ${checked ? 'border-amber-300 bg-amber-50/60 text-slate-900' : 'border-slate-200 text-slate-700 hover:bg-slate-50'}`}>
                        <input type="checkbox" checked={checked} onChange={() => toggle(state.id)} className="h-4 w-4 rounded accent-amber-500" />
                        <span className="min-w-0 flex-1 truncate">{state.name}</span>
                      </label>
                    );
                  })}
                </div>
              ) : <p className="mt-3 rounded-lg bg-slate-50 px-3 py-6 text-center text-sm text-slate-500">No state matches “{search.trim()}”.</p>}
            </fieldset>
          ) : (
            <p className="rounded-lg bg-slate-50 px-3 py-6 text-center text-sm text-slate-600">Every state already has a state office. A switched-off office is switched on again from its row in the table.</p>
          )}
        </>
      )}
    </HrmModal>
  );
}

/** State and city pickers fed by the location master (cities are loaded once per state). */
function usePlace(organisation: HrmOrganisation, initialStateId = '', initialCityId = '') {
  const [stateId, setStateId] = useState(initialStateId);
  const [cityId, setCityId] = useState(initialCityId);
  const [cities, setCities] = useState<Record<string, CityOption[]>>({});
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');

  const loadCities = useCallback(async (id: string) => {
    if (!id) return;
    setLoading(true);
    setLoadError('');
    try {
      const response = await api.get<CityOption[]>(`/locations/cities/${id}`);
      setCities((current) => ({ ...current, [id]: response.data || [] }));
    } catch {
      setLoadError('Cities could not be loaded. Choose the state again to retry.');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    if (!initialStateId) return undefined;
    const timer = window.setTimeout(() => void loadCities(initialStateId), 0);
    return () => window.clearTimeout(timer);
  }, [initialStateId, loadCities]);

  const chooseState = (id: string, withCities = true) => {
    setStateId(id);
    setCityId('');
    if (withCities && !cities[id]) void loadCities(id);
  };
  return {
    stateId, cityId, setCityId, chooseState, loading, loadError,
    stateOptions: organisation.states.map((state) => ({ id: state.id, name: state.name })),
    cityOptions: (cities[stateId] ?? []).map((city) => ({ id: city.id, name: city.name })),
    stateName: organisation.states.find((state) => String(state.id) === stateId)?.name ?? '',
    cityName: (cities[stateId] ?? []).find((city) => String(city.id) === cityId)?.name ?? '',
  };
}

function PlaceFields({ place, errors, idPrefix, fallbackCityName = '' }: { place: ReturnType<typeof usePlace>; errors: { stateId?: string; cityId?: string }; idPrefix: string; fallbackCityName?: string }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field id={`${idPrefix}-state`} label="State" required error={errors.stateId}>
        <SearchableSelect id={`${idPrefix}-state`} options={place.stateOptions} value={place.stateId} displayValue={place.stateName} onChange={(option) => place.chooseState(String(option.id))} placeholder="Select state" className="w-full" />
      </Field>
      <Field id={`${idPrefix}-city`} label="City" required error={errors.cityId || place.loadError || undefined}>
        <SearchableSelect id={`${idPrefix}-city`} options={place.cityOptions} value={place.cityId} displayValue={place.cityName || (place.cityId ? fallbackCityName : '')} onChange={(option) => place.setCityId(String(option.id))} placeholder={place.stateId ? (place.loading ? 'Loading cities…' : 'Select city') : 'Select state first'} disabled={!place.stateId} loading={place.loading} className="w-full" />
      </Field>
    </div>
  );
}

export function HeadOfficeSetupDialog({ organisation, onClose, onDone }: { organisation: HrmOrganisation; onClose: () => void; onDone: Done }) {
  const place = usePlace(organisation);
  const [officeName, setOfficeName] = useState('');
  const [errors, setErrors] = useState<{ stateId?: string; cityId?: string; name?: string }>({});
  const [saving, setSaving] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const departments = organisation.units.filter((unit) => unit.kind === 'DEPARTMENT' && unit.isActive).length;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving) return;
    const cleaned = cleanUnitName(officeName);
    const problem = cleaned ? unitNameProblem(cleaned) : null;
    const found = {
      ...(place.stateId ? {} : { stateId: 'Select the state.' }),
      ...(place.cityId ? {} : { cityId: 'Select the city.' }),
      ...(problem ? { name: problem } : {}),
    };
    setErrors(found);
    if (Object.keys(found).length) return;
    setSaving(true);
    setSubmitError('');
    try {
      const response = await hrmApi.setupHeadOffice({ ...(cleaned ? { name: cleaned } : {}), stateId: Number(place.stateId), cityId: Number(place.cityId), departments: [] });
      onDone(describeSetupResult(response.data));
    } catch (error) {
      setSubmitError(getHrmErrorMessage(error, 'Unable to set up the head office. Nothing was saved.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <HrmModal
      title="Set up head office"
      description="Choose where the head office is. You can change the name and place later."
      onClose={onClose}
      busy={saving}
      size="lg"
      error={submitError}
      footer={<>
        <button type="button" onClick={onClose} disabled={saving} className={cancelButton}>Cancel</button>
        <button type="submit" form="hrm-ho-setup-form" disabled={saving} className={primaryButton}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Landmark className="h-4 w-4" />}{saving ? 'Setting up…' : 'Set up head office'}</button>
      </>}
    >
      <form id="hrm-ho-setup-form" onSubmit={submit} noValidate className="space-y-4">
        <PlaceFields place={place} errors={{ ...(place.stateId ? {} : { stateId: errors.stateId }), ...(place.cityId ? {} : { cityId: errors.cityId }) }} idPrefix="hrm-ho" />
        <Field id="hrm-ho-name" label="Head office name" error={errors.name} hint="Optional. Leave empty to use the city name.">
          <input id="hrm-ho-name" value={officeName} onChange={(event) => { setOfficeName(event.target.value); setErrors((current) => ({ ...current, name: undefined })); }} placeholder={place.cityName ? `${place.cityName} Head Office` : 'City Head Office'} maxLength={160} autoComplete="off" aria-invalid={Boolean(errors.name)} className={inputClass(errors.name)} />
        </Field>
        <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-600">
          {departments ? `Your ${departments} department${departments === 1 ? '' : 's'} will be linked to this head office. ` : ''}Departments are added, renamed and deleted in the Departments section of this page.
        </p>
        <DefaultTick id="hrm-ho-default" checked locked hint="The first head office is the default one." />
      </form>
    </HrmModal>
  );
}

/** Edit a unit: its name, and for a head office also its state and city. */
export function RenameUnitDialog({ organisation, unit, onClose, onDone }: { organisation: HrmOrganisation; unit: HrmOrganisationUnit; onClose: () => void; onDone: Done }) {
  const isHeadOffice = unit.kind === 'HEAD_OFFICE';
  const place = usePlace(organisation, isHeadOffice && unit.state ? String(unit.state.id) : '', isHeadOffice && unit.city ? String(unit.city.id) : '');
  const [name, setName] = useState(unit.name);
  const [makeDefault, setMakeDefault] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [placeErrors, setPlaceErrors] = useState<{ cityId?: string }>({});
  const [serverError, setServerError] = useState('');

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const next = cleanUnitName(name);
    const problem = unitNameProblem(next);
    if (problem) { setError(problem); return; }
    if (isHeadOffice && place.stateId && !place.cityId) { setPlaceErrors({ cityId: 'Select the city.' }); return; }
    const moved = isHeadOffice && Boolean(place.cityId) && (place.stateId !== String(unit.state?.id ?? '') || place.cityId !== String(unit.city?.id ?? ''));
    if (next === unit.name && !moved && !makeDefault) { onClose(); return; }
    setSaving(true);
    setError('');
    setServerError('');
    try {
      await hrmApi.updateOrganisationUnit(unit.id, { ...(next !== unit.name ? { name: next } : {}), ...(moved ? { stateId: Number(place.stateId), cityId: Number(place.cityId) } : {}), ...(makeDefault ? { isDefault: true as const } : {}) });
      onDone(makeDefault ? `${next} is now the default head office.` : `${next} saved.`);
    } catch (requestError) {
      setServerError(getHrmErrorMessage(requestError, 'Unable to save the changes.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <HrmModal
      title={isHeadOffice ? 'Edit head office' : unit.kind === 'STATE' ? 'Edit state office' : 'Rename'}
      description={`Code ${unit.code} stays the same, so nothing linked to it changes.`}
      onClose={onClose}
      busy={saving}
      size={isHeadOffice ? 'lg' : 'sm'}
      error={serverError}
      footer={<>
        <button type="button" onClick={onClose} disabled={saving} className={cancelButton}>Cancel</button>
        <button type="submit" form="hrm-rename-unit-form" disabled={saving} className={primaryButton}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}{saving ? 'Saving…' : 'Save'}</button>
      </>}
    >
      <form id="hrm-rename-unit-form" onSubmit={submit} noValidate className="space-y-4">
        <Field id="hrm-rename-name" label="Name" required error={error || undefined}>
          <input id="hrm-rename-name" value={name} onChange={(event) => { setName(event.target.value); setError(''); setServerError(''); }} maxLength={160} autoComplete="off" className={inputClass(error)} />
        </Field>
        {isHeadOffice ? (
          <>
            <PlaceFields place={place} errors={place.cityId ? {} : placeErrors} idPrefix="hrm-edit-ho" fallbackCityName={unit.city?.name ?? ''} />
            <p className="text-xs leading-5 text-slate-500">New postings at this head office use the new place. Existing records keep the place they have.</p>
            <DefaultTick
              id="hrm-edit-ho-default"
              checked={Boolean(unit.isDefault) || makeDefault}
              locked={Boolean(unit.isDefault) || !unit.isActive}
              onChange={setMakeDefault}
              hint={unit.isDefault ? 'This is the default. To change it, edit another head office and tick this there.' : unit.isActive ? 'Forms choose it first, and it is used wherever no head office is chosen.' : 'Switch this head office on to make it the default.'}
            />
          </>
        ) : null}
      </form>
    </HrmModal>
  );
}

/**
 * Delete an office for good. Only one that nobody was ever placed in (and no HRM access uses) can be deleted;
 * otherwise the server says why and it is switched off instead, so history stays readable. Departments stay.
 */
export function DeleteUnitDialog({ unit, departmentCount = 0, moveTo, onClose, onDone }: { unit: HrmOrganisationUnit; departmentCount?: number; /** The default head office its departments move to. */ moveTo?: string | undefined; onClose: () => void; onDone: Done }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const submit = async () => {
    setSaving(true);
    setError('');
    try {
      await hrmApi.deleteOrganisationUnit(unit.id);
      onDone(`${unit.name} deleted.`);
    } catch (requestError) {
      setError(getHrmErrorMessage(requestError, `Unable to delete ${unit.name}.`));
    } finally {
      setSaving(false);
    }
  };
  if (unit.employeeCount > 0) {
    return (
      <HrmModal title={`${unit.name} is in use`} onClose={onClose} size="sm" footer={<button type="button" onClick={onClose} className={cancelButton}>Close</button>}>
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm font-medium leading-6 text-amber-900">{unit.employeeCount} employee{unit.employeeCount === 1 ? ' works' : 's work'} from this office. Transfer them first (open the office to see them).</p>
        <p className="mt-3 text-sm leading-6 text-slate-600">An office people have worked from keeps its history, so it can be switched off but not deleted.</p>
      </HrmModal>
    );
  }
  return (
    <HrmModal
      title={`Delete ${unit.name}?`}
      onClose={onClose}
      busy={saving}
      size="sm"
      error={error}
      footer={<>
        <button type="button" onClick={onClose} disabled={saving} className={cancelButton}>Cancel</button>
        <button type="button" onClick={() => void submit()} disabled={saving} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-rose-600 px-5 text-sm font-bold text-white hover:bg-rose-700 disabled:opacity-60">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}Delete</button>
      </>}
    >
      <p className="text-sm leading-6 text-slate-600">
        It is removed completely. This works only when nobody has ever been placed there and no HRM access uses it. Otherwise switch it off instead, so the history stays correct.
      </p>
      {departmentCount ? <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-600">Its {departmentCount} department{departmentCount === 1 ? ' stays' : 's stay'} in the company list and {moveTo ? `${departmentCount === 1 ? 'moves' : 'move'} to the default head office, “${moveTo}”.` : 'will link to the next head office you set up.'}</p> : null}
    </HrmModal>
  );
}

export function ToggleUnitDialog({ unit, departmentCount = 0, moveTo, onClose, onDone }: { unit: HrmOrganisationUnit; departmentCount?: number; /** The default head office its departments move to. */ moveTo?: string | undefined; onClose: () => void; onDone: Done }) {
  const switchingOff = unit.isActive;
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    setSaving(true);
    setError('');
    try {
      await hrmApi.updateOrganisationUnit(unit.id, { isActive: !switchingOff });
      onDone(`${unit.name} ${switchingOff ? 'switched off' : 'switched on'}.`);
    } catch (requestError) {
      setError(getHrmErrorMessage(requestError, `Unable to switch ${switchingOff ? 'off' : 'on'} ${unit.name}.`));
    } finally {
      setSaving(false);
    }
  };

  return (
    <HrmModal
      title={switchingOff ? `Switch off ${unit.name}?` : `Switch on ${unit.name}?`}
      onClose={onClose}
      busy={saving}
      size="sm"
      error={error}
      footer={<>
        <button type="button" onClick={onClose} disabled={saving} className={cancelButton}>Cancel</button>
        <button type="button" onClick={() => void submit()} disabled={saving} className={`inline-flex h-10 items-center justify-center gap-2 rounded-xl px-5 text-sm font-bold text-white disabled:opacity-60 ${switchingOff ? 'bg-rose-600 hover:bg-rose-700' : 'bg-emerald-600 hover:bg-emerald-700'}`}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}{switchingOff ? 'Switch off' : 'Switch on'}</button>
      </>}
    >
      <p className="text-sm leading-6 text-slate-600">
        {switchingOff
          ? `It will no longer be offered when adding employees. History is kept and you can switch it on again. An office that still has employees cannot be switched off${unit.kind === 'HEAD_OFFICE' ? '.' : '; departments are not affected.'}`
          : 'It will be offered again when adding employees.'}
      </p>
      {switchingOff && departmentCount ? <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-600">Its {departmentCount} department{departmentCount === 1 ? '' : 's'} will {moveTo ? `move to the default head office, “${moveTo}”.` : 'stay in the company list, linked to no head office.'}</p> : null}
    </HrmModal>
  );
}
