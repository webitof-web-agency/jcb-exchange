'use client';

import { useMemo, useState } from 'react';
import { Building2, Landmark, Loader2, MapPin, Plus, X } from 'lucide-react';
import api from '@/lib/api';
import SearchableSelect from '@/components/ui/SearchableSelect';
import { hrmApi, type HrmCreateUnitPayload, type HrmOrganisation, type HrmOrganisationUnit, type HrmStateOfficesResult } from '@/lib/hrmApi';
import { addCustomDepartment, describeSetupResult, describeSkippedState, describeStateOfficesResult, SUGGESTED_HEAD_OFFICE_DEPARTMENTS, statesWithoutOffice } from '@/lib/hrmOrganisation';
import { getHrmErrorMessage } from '@/lib/hrmUi';
import HrmModal from './HrmModal';

type Done = (message: string) => void;
type UnitKind = HrmCreateUnitPayload['kind'];
type CityOption = { id: number; name: string };

const inputClass = (error?: string) =>
  `h-10 w-full rounded-lg border bg-white px-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:ring-2 disabled:bg-slate-50 ${error ? 'border-rose-300 focus:border-rose-400 focus:ring-rose-100' : 'border-slate-200 focus:border-amber-400 focus:ring-amber-100'}`;

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

const KINDS: Array<{ id: UnitKind; title: string; description: string; icon: typeof MapPin }> = [
  { id: 'STATE', title: 'State office', description: 'One per state. State Managers belong here.', icon: MapPin },
  { id: 'DEPARTMENT', title: 'Department', description: 'A function such as Finance or Sales.', icon: Building2 },
  { id: 'HEAD_OFFICE', title: 'Head office', description: 'Another head office unit.', icon: Landmark },
];

export function AddUnitDialog({ organisation, initialKind = 'STATE', initialStateId, onClose, onDone }: { organisation: HrmOrganisation; initialKind?: UnitKind; /** Preselects the state (the "Add office" button of a state row). */ initialStateId?: number | undefined; onClose: () => void; onDone: Done }) {
  const headOffices = useMemo(() => organisation.units.filter((unit) => unit.kind === 'HEAD_OFFICE' && unit.isActive), [organisation.units]);
  const [kind, setKind] = useState<UnitKind>(initialKind);
  const [name, setName] = useState('');
  const [stateId, setStateId] = useState(initialStateId ? String(initialStateId) : '');
  const [cityId, setCityId] = useState('');
  const [parentId, setParentId] = useState(headOffices.length === 1 ? headOffices[0]!.id : '');
  const [errors, setErrors] = useState<Partial<Record<'name' | 'stateId' | 'cityId', string>>>({});
  const [submitError, setSubmitError] = useState('');
  const [saving, setSaving] = useState(false);
  const [cities, setCities] = useState<Record<string, CityOption[]>>({});
  const [citiesLoading, setCitiesLoading] = useState(false);

  // A state has one office, so only states without any office are offered (a switched-off one is switched on instead).
  const stateChoices = useMemo(
    () => (kind === 'STATE' ? statesWithoutOffice(organisation) : organisation.states),
    [kind, organisation],
  );
  const stateOptions = useMemo(() => stateChoices.map((state) => ({ id: state.id, name: state.name })), [stateChoices]);
  const cityOptions = useMemo(() => (cities[stateId] ?? []).map((city) => ({ id: city.id, name: city.name })), [cities, stateId]);
  const parentOptions = useMemo(() => headOffices.map((unit) => ({ id: unit.id, name: unit.name })), [headOffices]);
  const selectedState = organisation.states.find((state) => String(state.id) === stateId);

  const chooseKind = (next: UnitKind) => {
    setKind(next);
    setErrors({});
    setSubmitError('');
    setStateId('');
    setCityId('');
  };

  const chooseState = async (id: string) => {
    setStateId(id);
    setCityId('');
    setErrors((current) => ({ ...current, stateId: undefined, cityId: undefined }));
    if (kind !== 'HEAD_OFFICE' || cities[id]) return;
    setCitiesLoading(true);
    try {
      const response = await api.get<CityOption[]>(`/locations/cities/${id}`);
      setCities((current) => ({ ...current, [id]: response.data || [] }));
    } catch {
      setSubmitError('Cities could not be loaded. Choose the state again to retry.');
    } finally {
      setCitiesLoading(false);
    }
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving) return;
    const found: typeof errors = {};
    if (kind !== 'STATE' && name.trim().length < 2) found.name = 'Enter the name (at least 2 characters).';
    if (kind !== 'DEPARTMENT' && !stateId) found.stateId = 'Select the state.';
    if (kind === 'HEAD_OFFICE' && !cityId) found.cityId = 'Select the city.';
    setErrors(found);
    if (Object.keys(found).length) return;
    setSaving(true);
    setSubmitError('');
    try {
      await hrmApi.createOrganisationUnit({
        kind,
        ...(name.trim() ? { name: name.trim() } : {}),
        ...(kind !== 'DEPARTMENT' ? { stateId: Number(stateId) } : {}),
        ...(kind === 'HEAD_OFFICE' ? { cityId: Number(cityId) } : {}),
        ...(kind === 'DEPARTMENT' && parentId ? { parentId } : {}),
      });
      onDone(kind === 'STATE' ? `${selectedState?.name ?? 'State'} office added.` : `${name.trim()} added.`);
    } catch (error) {
      setSubmitError(getHrmErrorMessage(error, 'Unable to add the unit. Nothing was saved.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <HrmModal
      title="Add to organisation"
      description="Add a state office, a department or a head office unit. You can add more at any time."
      onClose={onClose}
      busy={saving}
      error={submitError}
      footer={<>
        <button type="button" onClick={onClose} disabled={saving} className={cancelButton}>Cancel</button>
        <button type="submit" form="hrm-add-unit-form" disabled={saving} className={primaryButton}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}{saving ? 'Adding…' : 'Add'}</button>
      </>}
    >
      <form id="hrm-add-unit-form" onSubmit={submit} noValidate className="space-y-5">
        <div role="radiogroup" aria-label="What are you adding?" className="grid gap-2 sm:grid-cols-3">
          {KINDS.map(({ id, title, description, icon: Icon }) => {
            const selected = kind === id;
            return (
              <button key={id} type="button" role="radio" aria-checked={selected} onClick={() => chooseKind(id)} className={`flex flex-col items-start gap-2 rounded-xl border p-3 text-left transition ${selected ? 'border-amber-400 bg-amber-50 ring-2 ring-amber-100' : 'border-slate-200 bg-white hover:border-amber-200 hover:bg-slate-50'}`}>
                <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${selected ? 'bg-amber-400 text-slate-950' : 'bg-slate-100 text-slate-500'}`}><Icon className="h-4 w-4" /></span>
                <span><span className="block text-sm font-bold text-slate-900">{title}</span><span className="mt-0.5 block text-xs leading-4 text-slate-500">{description}</span></span>
              </button>
            );
          })}
        </div>

        {kind !== 'DEPARTMENT' ? (
          <Field id="hrm-unit-state" label="State" required error={errors.stateId} hint={kind === 'STATE' && !stateOptions.length ? 'Every state already has a state office.' : undefined}>
            <SearchableSelect id="hrm-unit-state" options={stateOptions} value={stateId} displayValue={stateOptions.find((state) => String(state.id) === stateId)?.name ?? ''} onChange={(option) => void chooseState(String(option.id))} placeholder="Select state" disabled={!stateOptions.length} className="w-full" />
          </Field>
        ) : null}

        {kind === 'HEAD_OFFICE' ? (
          <Field id="hrm-unit-city" label="City" required error={errors.cityId}>
            <SearchableSelect id="hrm-unit-city" options={cityOptions} value={cityId} displayValue={cityOptions.find((city) => String(city.id) === cityId)?.name ?? ''} onChange={(option) => { setCityId(String(option.id)); setErrors((current) => ({ ...current, cityId: undefined })); }} placeholder={stateId ? (citiesLoading ? 'Loading cities…' : 'Select city') : 'Select state first'} disabled={!stateId} loading={citiesLoading} className="w-full" />
          </Field>
        ) : null}

        <Field
          id="hrm-unit-name"
          label={kind === 'STATE' ? 'Office name' : kind === 'DEPARTMENT' ? 'Department name' : 'Head office name'}
          required={kind !== 'STATE'}
          error={errors.name}
          hint={kind === 'STATE' ? `Optional. Leave empty to use “${selectedState?.name ?? 'State'} State Office”.` : undefined}
        >
          <input id="hrm-unit-name" value={name} onChange={(event) => { setName(event.target.value); setErrors((current) => ({ ...current, name: undefined })); }} placeholder={kind === 'STATE' ? `${selectedState?.name ?? 'Gujarat'} State Office` : kind === 'DEPARTMENT' ? 'e.g. Finance & Accounts' : 'e.g. Raipur Head Office'} maxLength={160} autoComplete="off" aria-invalid={Boolean(errors.name)} className={inputClass(errors.name)} />
        </Field>

        {kind === 'DEPARTMENT' && headOffices.length ? (
          <Field id="hrm-unit-parent" label="Head office" hint="The department belongs to this head office.">
            <SearchableSelect id="hrm-unit-parent" options={parentOptions} value={parentId} displayValue={parentOptions.find((unit) => unit.id === parentId)?.name ?? ''} onChange={(option) => setParentId(String(option.id))} placeholder="Select head office" clearable onClear={() => setParentId('')} className="w-full" />
          </Field>
        ) : null}
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

export function HeadOfficeSetupDialog({ organisation, onClose, onDone }: { organisation: HrmOrganisation; onClose: () => void; onDone: Done }) {
  const location = organisation.headOfficeLocation;
  // The same department list the Add employee form uses (one table). Departments that already exist are shown as
  // added (they are attached to the head office, never created twice); only new names count as "will be created".
  const existingDepartments = organisation.units.filter((unit) => unit.kind === 'DEPARTMENT');
  const existingKeys = new Set(existingDepartments.map((unit) => unit.name.trim().toLowerCase()));
  const isExisting = (name: string) => existingKeys.has(name.trim().toLowerCase());
  const [selected, setSelected] = useState<string[]>(SUGGESTED_HEAD_OFFICE_DEPARTMENTS.filter((name) => !existingKeys.has(name.trim().toLowerCase())));
  const [custom, setCustom] = useState<string[]>([]);
  const [draft, setDraft] = useState('');
  const [draftError, setDraftError] = useState('');
  const [saving, setSaving] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const all = [...SUGGESTED_HEAD_OFFICE_DEPARTMENTS.filter((name) => !isExisting(name)), ...custom];
  const toCreate = all.filter((name) => selected.includes(name) && !isExisting(name));

  const addDraft = () => {
    const result = addCustomDepartment([...all, ...existingDepartments.map((unit) => unit.name)], draft);
    if (result.error) { setDraftError(result.error); return; }
    const name = result.names[result.names.length - 1]!;
    setCustom((current) => [...current, name]);
    setSelected((current) => [...current, name]);
    setDraft('');
    setDraftError('');
  };

  const submit = async () => {
    if (saving || !location) return;
    setSaving(true);
    setSubmitError('');
    try {
      const response = await hrmApi.setupHeadOffice({ departments: toCreate });
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
      description="Creates the Raipur head office and the departments you choose. You can add or switch off departments later."
      onClose={onClose}
      busy={saving}
      size="lg"
      error={submitError}
      footer={<>
        <button type="button" onClick={onClose} disabled={saving} className={cancelButton}>Cancel</button>
        <button type="button" onClick={() => void submit()} disabled={saving || !location} className={primaryButton}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Landmark className="h-4 w-4" />}{saving ? 'Setting up…' : 'Set up head office'}</button>
      </>}
    >
      {location ? (
        <p className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600"><MapPin className="h-3.5 w-3.5 text-amber-600" /> Location: <strong className="font-semibold text-slate-800">{location.cityName}, {location.stateName}</strong></p>
      ) : (
        <p role="alert" className="rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">Raipur, Chhattisgarh is missing from the location master, so the head office cannot be set up yet.</p>
      )}
      <fieldset className="mt-5">
        <legend className="text-sm font-bold text-slate-900">Departments</legend>
        <p className="mt-0.5 text-xs text-slate-500">Untick what you do not need. Departments already added (for example from Add employee) are kept and attached to the head office.</p>
        {existingDepartments.length ? (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {existingDepartments.map((unit) => <span key={unit.id} className={`rounded-full px-2.5 py-1 text-xs font-semibold ${unit.isActive ? 'bg-emerald-50 text-emerald-800 ring-1 ring-inset ring-emerald-200' : 'bg-slate-100 text-slate-500'}`}>{unit.name} · {unit.isActive ? 'already added' : 'switched off'}</span>)}
          </div>
        ) : null}
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {all.map((name) => {
            const checked = selected.includes(name);
            return (
              <label key={name} className={`flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2 text-sm transition ${checked ? 'border-amber-300 bg-amber-50/60 text-slate-900' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                <input type="checkbox" checked={checked} onChange={() => setSelected((current) => (checked ? current.filter((value) => value !== name) : [...current, name]))} className="h-4 w-4 rounded accent-amber-500" />
                <span className="min-w-0 flex-1 truncate">{name}</span>
                {custom.includes(name) ? <button type="button" aria-label={`Remove ${name}`} onClick={(event) => { event.preventDefault(); setCustom((current) => current.filter((value) => value !== name)); setSelected((current) => current.filter((value) => value !== name)); }} className="rounded p-0.5 text-slate-400 hover:text-rose-600"><X className="h-3.5 w-3.5" /></button> : null}
              </label>
            );
          })}
        </div>
        <div className="mt-3 flex gap-2">
          <input value={draft} onChange={(event) => { setDraft(event.target.value); setDraftError(''); }} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); addDraft(); } }} placeholder="Add another department" aria-label="Add another department" data-no-autofocus maxLength={160} className={`${inputClass(draftError)} h-9`} />
          <button type="button" onClick={addDraft} className="inline-flex h-9 shrink-0 items-center gap-1 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50"><Plus className="h-3.5 w-3.5" /> Add</button>
        </div>
        {draftError ? <p role="alert" className="mt-1 text-xs font-medium text-rose-600">{draftError}</p> : null}
        <p className="mt-3 text-xs text-slate-500">{toCreate.length ? `${toCreate.length} new department${toCreate.length === 1 ? '' : 's'} will be created` : 'No new department will be created'}{existingDepartments.length ? `; ${existingDepartments.length} already added stay as they are` : ''}.</p>
      </fieldset>
    </HrmModal>
  );
}

export function RenameUnitDialog({ unit, onClose, onDone }: { unit: HrmOrganisationUnit; onClose: () => void; onDone: Done }) {
  const [name, setName] = useState(unit.name);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [serverError, setServerError] = useState('');

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const next = name.trim();
    if (next.length < 2) { setError('Enter the name (at least 2 characters).'); return; }
    if (next === unit.name) { onClose(); return; }
    setSaving(true);
    setError('');
    setServerError('');
    try {
      await hrmApi.updateOrganisationUnit(unit.id, { name: next });
      onDone(`Renamed to ${next}.`);
    } catch (requestError) {
      setServerError(getHrmErrorMessage(requestError, 'Unable to rename the unit.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <HrmModal
      title="Rename"
      description={`Code ${unit.code} stays the same, so nothing linked to it changes.`}
      onClose={onClose}
      busy={saving}
      size="sm"
      error={serverError}
      footer={<>
        <button type="button" onClick={onClose} disabled={saving} className={cancelButton}>Cancel</button>
        <button type="submit" form="hrm-rename-unit-form" disabled={saving} className={primaryButton}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}{saving ? 'Saving…' : 'Save'}</button>
      </>}
    >
      <form id="hrm-rename-unit-form" onSubmit={submit} noValidate>
        <Field id="hrm-rename-name" label="Name" required error={error || undefined}>
          <input id="hrm-rename-name" value={name} onChange={(event) => { setName(event.target.value); setError(''); setServerError(''); }} maxLength={160} autoComplete="off" className={inputClass(error)} />
        </Field>
      </form>
    </HrmModal>
  );
}

/**
 * Delete a department for good. Only a department nobody was ever placed in (and no open offer or access uses) can be
 * deleted; otherwise the server says why and the department is switched off instead, so history stays readable.
 */
export function DeleteUnitDialog({ unit, departmentNames = [], onClose, onDone }: { unit: HrmOrganisationUnit; departmentNames?: string[]; onClose: () => void; onDone: Done }) {
  const isDepartment = unit.kind === 'DEPARTMENT';
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const submit = async () => {
    setSaving(true);
    setError('');
    try {
      const response = await hrmApi.deleteOrganisationUnit(unit.id);
      const removed = response.data.departmentsDeleted ?? [];
      onDone(removed.length ? `${unit.name} and ${removed.length} department${removed.length === 1 ? '' : 's'} deleted.` : `${unit.name} deleted.`);
    } catch (requestError) {
      setError(getHrmErrorMessage(requestError, `Unable to delete ${unit.name}.`));
    } finally {
      setSaving(false);
    }
  };
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
        {isDepartment
          ? 'The department is removed completely and is no longer offered anywhere (Add employee, offers, filters).'
          : `The ${unit.kind === 'HEAD_OFFICE' ? 'head office' : 'office'} is removed completely.`}
        {' '}This works only when nobody has ever been placed there and no HRM access or open offer uses it. Otherwise it cannot be deleted: switch it off instead so the history stays correct.
      </p>
      {departmentNames.length ? (
        <div className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-800">
          <p className="font-semibold">These departments are deleted with it ({departmentNames.length}):</p>
          <p className="mt-1">{departmentNames.join(', ')}</p>
        </div>
      ) : null}
    </HrmModal>
  );
}

export function ToggleUnitDialog({ unit, onClose, onDone }: { unit: HrmOrganisationUnit; onClose: () => void; onDone: Done }) {
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
          ? 'It will no longer be offered when adding employees. Existing records and history are kept, and you can switch it on again. A unit that still has employees or active sub-units cannot be switched off.'
          : 'It will be offered again when adding employees.'}
      </p>
    </HrmModal>
  );
}
