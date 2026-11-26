'use client';

import HrmManagerSelect from '@/components/hrm/HrmManagerSelect';
import HrmHeadOfficeField from '@/components/hrm/HrmHeadOfficeField';
import { defaultHeadOffice, headOfficeForPosting, selectedHeadOffice, type HrmHeadOffice } from '@/lib/hrmHeadOffice';
import { toManagerParams, type ManagerOptions, type ManagerPick, type ManagerQuery } from '@/lib/hrmManagers';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import SearchableSelect from '@/components/ui/SearchableSelect';
import type { OfferLetterFormData } from '@/lib/offerLetter';
import {
  EMPLOYMENT_TYPE_LABELS,
  apiErrorMessage,
  buildPlaceOfPosting,
  createEmptyOfferHrmForm,
  formatInr,
  hasSalaryBreakup,
  letterSalaryForPeriod,
  nextCustomComponentCode,
  offerHrmApi,
  offerHrmFormFromStored,
  salaryTotals,
  validateOfferHrmForm,
  type CityOption,
  type OfferEmploymentType,
  type OfferFormOptions,
  type OfferHrmErrors,
  type OfferHrmForm,
  type OfferLocationType,
  type SalaryComponentRow,
  type StoredOfferPlacement,
  type StoredSalaryComponent,
} from '@/lib/offerHrm';

/**
 * The HRM part of an offer form (used by the Offers page and the application's Offer tab): department, designation
 * from the managed list, employment type, head office / state office with state and city, State Manager, reporting
 * manager and the monthly salary breakup. It keeps the letter in step (department, designation, place of posting,
 * salary amount) through `onLetterChange`; the page owns both forms.
 */

/**
 * How the reporting manager got there. One is filled in only after HR changes the place in this editor (a saved offer
 * is never changed by just opening it), and never over a choice HR made.
 */
type ManagerFill = { autoId: string; placeChanged: boolean; decided: boolean };
const NEW_MANAGER_FILL: ManagerFill = { autoId: '', placeChanged: false, decided: false };

type OptionsState = {
  options: OfferFormOptions | null;
  loading: boolean;
  error: string;
  retry: () => void;
};

const NO_OFFER_EDIT_PERMISSION = 'You need permission to create or edit offers to load the HRM departments and designations.';

/**
 * State for one offer editor: the HRM form, its errors and the masters it is checked against.
 * `enabled` is false for people who can neither create nor update offers: the form options route
 * (GET /recruitment/admin/offers/form-options) needs recruitment.offers.create or .update, so it is not called for them.
 */
export const useOfferHrmEditor = (enabled = true) => {
  const [form, setForm] = useState<OfferHrmForm>(createEmptyOfferHrmForm);
  const [errors, setErrors] = useState<OfferHrmErrors>({});
  const [managerFill, setManagerFill] = useState<ManagerFill>(NEW_MANAGER_FILL);
  const [options, setOptions] = useState<OfferFormOptions | null>(null);
  const [loadingState, setLoading] = useState(true);
  const [errorState, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const loading = enabled ? loadingState : false;
  const error = enabled ? errorState : NO_OFFER_EDIT_PERMISSION;

  useEffect(() => {
    if (!enabled) return undefined;
    let cancelled = false;
    offerHrmApi.getFormOptions()
      .then((response) => {
        if (cancelled) return;
        setOptions(response.data.options);
        setError('');
      })
      .catch((reason: unknown) => {
        if (cancelled) return;
        const status = (reason as { response?: { status?: number } })?.response?.status;
        setError(status === 403
          ? NO_OFFER_EDIT_PERMISSION
          : apiErrorMessage(reason, 'Could not load the HRM departments, designations and states.'));
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [attempt, enabled]);

  const retry = useCallback(() => {
    setLoading(true);
    setError('');
    setAttempt((value) => value + 1);
  }, []);

  /** Starts a new offer, or fills the form from a saved one (placement may be null for older offers). */
  const reset = useCallback((stored?: { placement: StoredOfferPlacement | null; components: StoredSalaryComponent[]; reportingManagerName?: string | null }) => {
    setForm(stored ? offerHrmFormFromStored(stored.placement, stored.components, stored.reportingManagerName) : createEmptyOfferHrmForm());
    setErrors({});
    setManagerFill(NEW_MANAGER_FILL);
  }, []);

  /** Checks the HRM fields against the letter's designation; returns true when the offer may be generated. */
  const validate = useCallback((designation: string) => {
    const next = validateOfferHrmForm(form, designation, options, options?.nationalOperationsManagers.length ?? 0);
    setErrors(next);
    return Object.keys(next).length === 0;
  }, [form, options]);

  const optionsState: OptionsState = { options, loading, error, retry };
  return { form, setForm, errors, setErrors, optionsState, reset, validate, managerFill, setManagerFill };
};

export type OfferHrmEditor = ReturnType<typeof useOfferHrmEditor>;

const fieldClass = 'mt-1 w-full rounded-xl border border-gray-200 bg-white p-2.5 text-gray-900';
const errorClass = 'mt-1 block text-[11px] font-semibold text-rose-600';

const FieldError = ({ id, message }: { id: string; message?: string | undefined }) =>
  message ? <span id={id} role="alert" className={errorClass}>{message}</span> : null;

/** Cities per state, loaded once each; a late answer only fills its own state's list. */
const useCities = () => {
  const [byState, setByState] = useState<Record<string, CityOption[]>>({});
  const [loadingStates, setLoadingStates] = useState<Record<string, boolean>>({});
  const [failedStates, setFailedStates] = useState<Record<string, boolean>>({});
  const cache = useRef(new Map<string, Promise<CityOption[]>>());

  const ensure = useCallback((stateId: string): Promise<CityOption[]> => {
    if (!stateId) return Promise.resolve([]);
    const cached = cache.current.get(stateId);
    if (cached) return cached;
    setLoadingStates((current) => ({ ...current, [stateId]: true }));
    setFailedStates((current) => ({ ...current, [stateId]: false }));
    const request = offerHrmApi.getCities(stateId)
      .then((response) => {
        const list = Array.isArray(response.data) ? response.data.map((city) => ({ id: Number(city.id), name: String(city.name) })) : [];
        setByState((current) => ({ ...current, [stateId]: list }));
        return list;
      })
      .catch(() => {
        cache.current.delete(stateId);
        setFailedStates((current) => ({ ...current, [stateId]: true }));
        return [] as CityOption[];
      })
      .finally(() => setLoadingStates((current) => ({ ...current, [stateId]: false })));
    cache.current.set(stateId, request);
    return request;
  }, []);

  return { byState, loadingStates, failedStates, ensure };
};

export default function OfferHrmFields({
  editor,
  letter,
  onLetterChange,
  disabled = false,
  idPrefix = 'offer-hrm',
}: {
  editor: OfferHrmEditor;
  letter: OfferLetterFormData;
  onLetterChange: (patch: Partial<OfferLetterFormData>) => void;
  disabled?: boolean;
  idPrefix?: string;
}) {
  const { form, setForm, errors, setErrors, optionsState, managerFill, setManagerFill } = editor;
  // The chosen row of the list (the form itself keeps only the id and the name).
  const [pickedManager, setPickedManager] = useState<ManagerPick | null>(null);
  const { options, loading, error, retry } = optionsState;
  const cities = useCities();
  // What ticking "State Manager" filled in, so unticking can undo it only while unchanged.
  const autoDesignation = useRef<string | null>(null);
  const { ensure: ensureCities } = cities;

  // A saved offer (edit) or the head office default may name a state whose cities are not loaded yet.
  useEffect(() => {
    if (form.stateId) void ensureCities(form.stateId);
  }, [ensureCities, form.stateId]);

  const clearError = (key: keyof OfferHrmErrors) => setErrors((current) => (current[key] ? { ...current, [key]: undefined } : current));
  const update = (patch: Partial<OfferHrmForm>) => setForm((current) => ({ ...current, ...patch }));

  const stateName = (stateId: string) => options?.states.find((state) => String(state.id) === stateId)?.name ?? '';
  const placeFor = (next: Pick<OfferHrmForm, 'locationType' | 'stateId' | 'cityId'>, cityList?: CityOption[]) => {
    const list = cityList ?? cities.byState[next.stateId] ?? [];
    const cityName = list.find((city) => String(city.id) === next.cityId)?.name ?? '';
    return buildPlaceOfPosting(next, { stateName: stateName(next.stateId), cityName });
  };

  const syncSalary = (rows: SalaryComponentRow[]) => {
    const amount = letterSalaryForPeriod(rows, letter.salaryPeriod);
    if (amount !== null) onLetterChange({ salaryAmount: amount });
  };

  const onDepartment = (id: string) => {
    update({ hrmOrgUnitId: id });
    clearError('hrmOrgUnitId');
    const name = options?.departments.find((department) => department.id === id)?.name;
    if (name) onLetterChange({ department: name });
  };

  const onDesignation = (name: string) => {
    autoDesignation.current = null;
    clearError('designation');
    onLetterChange({ designation: name });
  };

  const onEmploymentType = (type: OfferEmploymentType) => {
    update({ employmentType: type });
    onLetterChange({ employmentType: EMPLOYMENT_TYPE_LABELS[type] });
  };

  const undoStateManagerDefaults = (letterPatch: Partial<OfferLetterFormData>) => {
    if (autoDesignation.current && letter.designation === autoDesignation.current) letterPatch.designation = '';
    autoDesignation.current = null;
  };
  const placeChanged = () => setManagerFill((current) => (current.placeChanged ? current : { ...current, placeChanged: true }));

  /** A head office posting: the office decides the state, the city and the place printed on the letter. */
  const headOfficeValues = (office: HrmHeadOffice) => ({ headOfficeUnitId: office.id, stateId: office.stateId ? String(office.stateId) : '', cityId: office.cityId ? String(office.cityId) : '' });
  const applyHeadOffice = (office: HrmHeadOffice) => {
    clearError('headOfficeUnitId');
    update(headOfficeValues(office));
    onLetterChange({ placeOfPosting: buildPlaceOfPosting({ locationType: 'HEAD_OFFICE' }, { stateName: office.stateName, cityName: office.cityName }) });
  };
  const onHeadOffice = (office: HrmHeadOffice) => {
    placeChanged();
    applyHeadOffice(office);
  };

  // A saved offer is brought up to date: one without a usable head office takes one (see headOfficeForPosting), and
  // a head office that has moved since brings its new place to the letter too.
  const headOffices = options?.headOffices;
  const savedOffice = headOffices?.find((office) => office.id === form.headOfficeUnitId);
  const needsHeadOffice = !disabled && form.locationType === 'HEAD_OFFICE' && Boolean(headOffices?.length)
    && (!savedOffice || headOfficeValues(savedOffice).stateId !== form.stateId || headOfficeValues(savedOffice).cityId !== form.cityId);
  const bringUpToDate = () => {
    const office = headOfficeForPosting(headOffices ?? [], form);
    if (office) applyHeadOffice(office);
  };
  const latestBringUpToDate = useRef(bringUpToDate);
  useEffect(() => { latestBringUpToDate.current = bringUpToDate; });
  useEffect(() => {
    if (!needsHeadOffice) return undefined;
    const timer = window.setTimeout(() => latestBringUpToDate.current(), 0);
    return () => window.clearTimeout(timer);
  }, [needsHeadOffice, headOffices]);

  const onLocationType = (type: OfferLocationType) => {
    clearError('locationType');
    clearError('stateId');
    clearError('cityId');
    const patch: Partial<OfferHrmForm> = { locationType: type, isOfficeManager: false };
    const letterPatch: Partial<OfferLetterFormData> = {};
    if (form.isOfficeManager) undoStateManagerDefaults(letterPatch);
    placeChanged();
    const office = type === 'HEAD_OFFICE' ? defaultHeadOffice(options?.headOffices) : null;
    Object.assign(patch, office ? headOfficeValues(office) : { headOfficeUnitId: '', stateId: '', cityId: '' });
    update(patch);
    if (office) letterPatch.placeOfPosting = buildPlaceOfPosting({ locationType: 'HEAD_OFFICE' }, { stateName: office.stateName, cityName: office.cityName });
    if (Object.keys(letterPatch).length) onLetterChange(letterPatch);
  };

  const onState = (id: string) => {
    placeChanged();
    clearError('stateId');
    clearError('cityId');
    update({ stateId: id, cityId: '' });
    void ensureCities(id);
  };

  const onCity = (id: string) => {
    placeChanged();
    clearError('cityId');
    const next = { ...form, cityId: id };
    update({ cityId: id });
    onLetterChange({ placeOfPosting: placeFor(next) });
  };

  const onOfficeManager = (checked: boolean) => {
    const letterPatch: Partial<OfferLetterFormData> = {};
    if (checked) {
      if (!letter.designation.trim() && options?.stateManagerDesignation) {
        letterPatch.designation = options.stateManagerDesignation;
        autoDesignation.current = options.stateManagerDesignation;
      }
    } else {
      undoStateManagerDefaults(letterPatch);
    }
    placeChanged();
    update({ isOfficeManager: checked });
    if (Object.keys(letterPatch).length) onLetterChange(letterPatch);
  };

  /** Writes the manager into the form and onto the letter. */
  const writeManager = (manager: ManagerPick | null) => {
    setPickedManager(manager);
    update({ reportingManagerEmployeeId: manager?.id ?? '', reportingManagerName: manager?.name ?? '' });
    onLetterChange({ reportingManager: manager?.name ?? '' });
    clearError('reportingManagerEmployeeId');
  };
  const onManager = (manager: ManagerPick | null) => {
    setManagerFill((current) => ({ ...current, autoId: '', decided: true }));
    writeManager(manager);
  };
  const managerQuery: ManagerQuery = form.locationType === 'HEAD_OFFICE'
    ? { headOffice: true }
    // No city here: whatever the city, a "State office" offer puts the person in that state's office.
    : form.locationType === 'STATE_OFFICE' ? { stateId: form.stateId, managerRole: form.isOfficeManager } : {};
  // A manager filled in for the old place goes before the new place is looked up.
  const onManagerListStart = () => {
    if (!managerFill.autoId || form.reportingManagerEmployeeId !== managerFill.autoId) return;
    setManagerFill((current) => ({ ...current, autoId: '' }));
    writeManager(null);
  };
  const onManagerList = (list: ManagerOptions) => {
    if (!managerFill.placeChanged || managerFill.decided || form.reportingManagerEmployeeId || !list.preselect) return;
    const { id } = list.preselect;
    setManagerFill((current) => ({ ...current, autoId: id }));
    writeManager(list.preselect);
  };

  const setRows = (rows: SalaryComponentRow[]) => {
    clearError('salaryComponents');
    update({ salaryComponents: rows });
    syncSalary(rows);
  };
  const updateRow = (index: number, patch: Partial<SalaryComponentRow>) =>
    setRows(form.salaryComponents.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)));
  const addRow = () => setRows([...form.salaryComponents, { code: nextCustomComponentCode(form.salaryComponents), name: '', componentType: 'EARNING', monthlyAmount: '' }]);
  const removeRow = (index: number) => setRows(form.salaryComponents.filter((_, rowIndex) => rowIndex !== index));

  if (loading) {
    return <p className="flex items-center gap-2 rounded-xl bg-gray-50 px-3 py-3 text-[11px] font-semibold text-gray-600"><Loader2 size={14} className="animate-spin" /> Loading HRM departments, designations and states…</p>;
  }
  if (error || !options) {
    return (
      <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-3 text-[11px] font-semibold text-rose-700">
        <p>{error || 'Could not load the HRM lists.'}</p>
        <button type="button" onClick={retry} className="mt-2 rounded-lg bg-white px-3 py-1.5 font-bold text-rose-700 ring-1 ring-rose-200 hover:bg-rose-100">Try again</button>
      </div>
    );
  }

  const selectedState = options.states.find((state) => String(state.id) === form.stateId);
  const cityList = cities.byState[form.stateId] ?? [];
  const citiesLoading = Boolean(cities.loadingStates[form.stateId]);
  const citiesFailed = Boolean(cities.failedStates[form.stateId]);
  const totals = salaryTotals(form.salaryComponents);
  const breakupUsed = hasSalaryBreakup(form.salaryComponents);
  const designationOptions = options.designations.map((designation) => ({ id: designation.name, name: designation.name }));
  const designationKnown = !letter.designation || options.designations.some((designation) => designation.name.toLowerCase() === letter.designation.trim().toLowerCase());

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-blue-200 bg-blue-50/40 p-4">
        <p className="mb-1 text-[11px] font-extrabold uppercase tracking-wider text-blue-800">HRM placement</p>
        <p className="mb-3 text-[11px] text-blue-900/80">When the offer is accepted, the person is added to HRM with exactly this department, designation, office and manager.</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="font-semibold text-gray-700">
            <label htmlFor={`${idPrefix}-department`}>Department *</label>
            <SearchableSelect
              id={`${idPrefix}-department`}
              options={options.departments.map((department) => ({ id: department.id, name: department.name }))}
              value={form.hrmOrgUnitId}
              displayValue={options.departments.find((department) => department.id === form.hrmOrgUnitId)?.name ?? ''}
              onChange={(option) => onDepartment(String(option.id))}
              placeholder={options.departments.length ? 'Select the department' : 'No departments yet: add them in HRM'}
              disabled={disabled}
              className="mt-1"
            />
            <FieldError id={`${idPrefix}-department-error`} message={errors.hrmOrgUnitId} />
          </div>
          <div className="font-semibold text-gray-700">
            <label htmlFor={`${idPrefix}-designation`}>Designation *</label>
            <SearchableSelect
              id={`${idPrefix}-designation`}
              options={designationOptions}
              value={designationKnown ? letter.designation : ''}
              displayValue={designationKnown ? letter.designation : ''}
              onChange={(option) => onDesignation(String(option.name))}
              placeholder="Select the designation"
              disabled={disabled}
              className="mt-1"
            />
            {!designationKnown && <span className="mt-1 block text-[11px] font-semibold text-amber-700">“{letter.designation}” is not on the HRM designation list. Choose one from the list.</span>}
            <FieldError id={`${idPrefix}-designation-error`} message={errors.designation} />
          </div>
          <label className="font-semibold text-gray-700">
            Employment type
            <select
              value={form.employmentType}
              disabled={disabled}
              onChange={(event) => onEmploymentType(event.target.value as OfferEmploymentType)}
              className={fieldClass}
            >
              {options.employmentTypes.map((type) => <option key={type} value={type}>{EMPLOYMENT_TYPE_LABELS[type] ?? type}</option>)}
            </select>
          </label>
          <fieldset className="font-semibold text-gray-700">
            <legend>Works from *</legend>
            <div className="mt-1 flex gap-2">
              {(['HEAD_OFFICE', 'STATE_OFFICE'] as const).map((type) => (
                <label key={type} className={`flex flex-1 cursor-pointer items-center gap-2 rounded-xl border p-2.5 ${form.locationType === type ? 'border-blue-400 bg-white ring-1 ring-blue-300' : 'border-gray-200 bg-white'}`}>
                  <input type="radio" name={`${idPrefix}-location`} value={type} checked={form.locationType === type} disabled={disabled || (type === 'HEAD_OFFICE' && !options.headOffices.length)} onChange={() => onLocationType(type)} />
                  <span>{type === 'HEAD_OFFICE' ? 'Head office' : 'State office'}</span>
                </label>
              ))}
            </div>
            {!options.headOffices.length && <span className="mt-1 block text-[11px] font-normal text-gray-500">{options.places && !options.places.headOffice ? 'Head office postings are outside your recruitment access.' : 'The head office is not set up yet (HRM → Organisation).'}</span>}
            <FieldError id={`${idPrefix}-location-error`} message={errors.locationType} />
          </fieldset>
        </div>

        {form.locationType === 'HEAD_OFFICE' && options.headOffices.length > 0 && (
          <div className="mt-3 font-semibold text-gray-700">
            <label htmlFor={`${idPrefix}-head-office`}>Head office *</label>
            <div className="mt-1">
              <HrmHeadOfficeField id={`${idPrefix}-head-office`} offices={options.headOffices} value={selectedHeadOffice(options.headOffices, form.headOfficeUnitId)?.id ?? ''} onChange={onHeadOffice} error={errors.headOfficeUnitId} disabled={disabled} />
            </div>
          </div>
        )}

        {form.locationType === 'STATE_OFFICE' && (
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="font-semibold text-gray-700">
              <label htmlFor={`${idPrefix}-state`}>State *</label>
              <SearchableSelect
                id={`${idPrefix}-state`}
                options={options.states.map((state) => ({ id: String(state.id), name: state.hasOffice ? state.name : `${state.name} · ${state.officeSwitchedOff ? 'office switched off' : 'no office yet'}` }))}
                value={form.stateId}
                displayValue={selectedState?.name ?? ''}
                onChange={(option) => onState(String(option.id))}
                placeholder="Select the state"
                disabled={disabled}
                className="mt-1"
              />
              <FieldError id={`${idPrefix}-state-error`} message={errors.stateId} />
              {selectedState && !selectedState.hasOffice && !selectedState.officeSwitchedOff && (
                <span className="mt-1 block text-[11px] font-normal text-blue-800">{selectedState.name} has no office yet. It is created when the offer is accepted.</span>
              )}
              {selectedState?.officeSwitchedOff && (
                <span role="alert" className={errorClass}>The {selectedState.name} state office is switched off. Switch it on from HRM → Organisation first.</span>
              )}
            </div>
            <div className="font-semibold text-gray-700">
              <label htmlFor={`${idPrefix}-city`}>City *</label>
              <SearchableSelect
                id={`${idPrefix}-city`}
                options={cityList.map((city) => ({ id: String(city.id), name: city.name }))}
                value={form.cityId}
                displayValue={cityList.find((city) => String(city.id) === form.cityId)?.name ?? ''}
                onChange={(option) => onCity(String(option.id))}
                placeholder={form.stateId ? (citiesLoading ? 'Loading cities…' : 'Select the city') : 'Select the state first'}
                disabled={disabled || !form.stateId}
                loading={citiesLoading}
                className="mt-1"
              />
              {citiesFailed && (
                <span className={errorClass}>
                  Could not load the cities.{' '}
                  <button type="button" onClick={() => void ensureCities(form.stateId)} className="underline">Try again</button>
                </span>
              )}
              <FieldError id={`${idPrefix}-city-error`} message={errors.cityId} />
            </div>
            <label className="flex items-center gap-2 font-semibold text-gray-700 sm:col-span-2">
              <input type="checkbox" checked={form.isOfficeManager} disabled={disabled} onChange={(event) => onOfficeManager(event.target.checked)} />
              Will be the State Manager of this state
            </label>
          </div>
        )}

        <div className="mt-3 font-semibold text-gray-700">
          <label htmlFor={`${idPrefix}-manager`}>Reporting manager</label>
          <div className="mt-1">
            <HrmManagerSelect
              id={`${idPrefix}-manager`}
              value={form.reportingManagerEmployeeId ? (pickedManager?.id === form.reportingManagerEmployeeId ? pickedManager : { id: form.reportingManagerEmployeeId, name: form.reportingManagerName || 'Selected employee' }) : null}
              auto={Boolean(managerFill.autoId) && managerFill.autoId === form.reportingManagerEmployeeId}
              invalid={Boolean(errors.reportingManagerEmployeeId)}
              disabled={disabled}
              onChange={onManager}
              load={async (search) => (await offerHrmApi.getManagerOptions(toManagerParams(managerQuery, search))).data}
              loadKey={JSON.stringify(toManagerParams(managerQuery))}
              onLoadStart={onManagerListStart}
              onLoaded={onManagerList}
            />
          </div>
          <FieldError id={`${idPrefix}-manager-error`} message={errors.reportingManagerEmployeeId} />
        </div>
      </div>

      <div className="rounded-2xl border border-emerald-200 bg-emerald-50/40 p-4">
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="text-[11px] font-extrabold uppercase tracking-wider text-emerald-800">Salary breakup (monthly, ₹)</p>
          {!disabled && <button type="button" onClick={addRow} className="flex items-center gap-1 rounded-lg bg-white px-2 py-1 text-[11px] font-bold text-emerald-800 ring-1 ring-emerald-200 hover:bg-emerald-100"><Plus size={12} /> Add row</button>}
        </div>
        <p className="mb-2 text-[11px] text-emerald-900/80">Optional. When amounts are filled, the salary on the letter is the CTC total of this table.</p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[460px] text-left">
            <thead>
              <tr className="text-[10px] uppercase tracking-wider text-gray-500">
                <th className="py-1 pr-2">Component</th>
                <th className="py-1 pr-2">Type</th>
                <th className="py-1 pr-2 text-right">Monthly</th>
                <th className="py-1 pr-2 text-right">Yearly</th>
                <th className="py-1" aria-label="Remove" />
              </tr>
            </thead>
            <tbody>
              {form.salaryComponents.map((row, index) => {
                const amount = Number(row.monthlyAmount.replace(/,/g, ''));
                return (
                  <tr key={`${row.code}-${index}`}>
                    <td className="py-1 pr-2">
                      <input aria-label={`Salary component ${index + 1} name`} value={row.name} disabled={disabled} onChange={(event) => updateRow(index, { name: event.target.value })} className="w-full rounded-lg border border-gray-200 bg-white p-2" />
                    </td>
                    <td className="py-1 pr-2">
                      <select aria-label={`Salary component ${index + 1} type`} value={row.componentType} disabled={disabled} onChange={(event) => updateRow(index, { componentType: event.target.value as SalaryComponentRow['componentType'] })} className="w-full rounded-lg border border-gray-200 bg-white p-2">
                        <option value="EARNING">Earning</option>
                        <option value="EMPLOYER_CONTRIBUTION">Employer contribution</option>
                      </select>
                    </td>
                    <td className="py-1 pr-2">
                      <input aria-label={`${row.name || 'Salary component'} monthly amount`} inputMode="decimal" value={row.monthlyAmount} disabled={disabled} onChange={(event) => updateRow(index, { monthlyAmount: event.target.value.replace(/[^\d.,]/g, '') })} className="w-full rounded-lg border border-gray-200 bg-white p-2 text-right" placeholder="0" />
                    </td>
                    <td className="py-1 pr-2 text-right text-gray-600">{Number.isFinite(amount) && amount > 0 ? formatInr(amount * 12) : '—'}</td>
                    <td className="py-1 text-right">
                      {!disabled && <button type="button" onClick={() => removeRow(index)} aria-label={`Remove ${row.name || 'salary row'}`} className="rounded p-1 text-gray-400 hover:bg-rose-50 hover:text-rose-600"><Trash2 size={13} /></button>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="text-[11px] font-bold text-gray-800">
              <tr><td className="pt-2" colSpan={2}>Gross salary</td><td className="pt-2 pr-2 text-right">{formatInr(totals.grossMonthly)}</td><td className="pt-2 pr-2 text-right">{formatInr(totals.grossMonthly * 12)}</td><td /></tr>
              <tr><td colSpan={2}>Cost to company (CTC)</td><td className="pr-2 text-right">{formatInr(totals.ctcMonthly)}</td><td className="pr-2 text-right">{formatInr(totals.annualCtc)}</td><td /></tr>
            </tfoot>
          </table>
        </div>
        {breakupUsed && <p className="mt-2 text-[11px] text-emerald-900/80">Letter salary: ₹{formatInr(Number(letter.salaryAmount) || 0)} per {letter.salaryPeriod === 'month' ? 'month' : 'year'}.</p>}
        <FieldError id={`${idPrefix}-salary-error`} message={errors.salaryComponents} />
      </div>
    </div>
  );
}
