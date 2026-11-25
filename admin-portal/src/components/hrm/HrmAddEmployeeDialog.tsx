'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'react-toastify';
import { AlertCircle, Building2, CheckCircle2, ChevronDown, Copy, Eye, EyeOff, KeyRound, Landmark, Link2, Loader2, MapPin, Plus, Settings2, ShieldAlert, Sparkles, UserRound, X } from 'lucide-react';
import api from '@/lib/api';
import SearchableSelect from '@/components/ui/SearchableSelect';
import { bodyScrollLock } from '@/lib/bodyScrollLock';
import { hrmApi, type HrmEmployeeFormOptions, type HrmLinkableUser, type HrmLocationType, type HrmOnboardResult } from '@/lib/hrmApi';
import { EMPLOYMENT_TYPE_OPTIONS } from '@/lib/hrmDirectory';
import {
  buildLoginDetailsText,
  createEmptyOnboardForm,
  describeLostSelections,
  describeNationalManager,
  describeStateOffice,
  EARLIEST_JOINING_DATE,
  extractFieldErrors,
  fieldForServerMessage,
  findByName,
  generateTemporaryPassword,
  getStateManagerDefaults,
  isOnboardFormDirty,
  locationAfterSwitch,
  maxDateOfBirth,
  maxJoiningDate,
  normaliseName,
  normalizeMobile,
  reconcileDepartment,
  reconcileDesignation,
  revertStateManagerDefaults,
  sanitiseMobileInput,
  stateOptionLabel,
  toDateInputValue,
  toOnboardExistingPayload,
  toOnboardPayload,
  validateOnboardForm,
  type DefaultLocation,
  type ListChange,
  type OnboardErrors,
  type OnboardForm,
  type OnboardMode,
} from '@/lib/hrmOnboarding';
import { formatHrmDate, formatHrmStatus, getHrmErrorMessage } from '@/lib/hrmUi';
import HrmLoginPicker, { type LoginNote } from './HrmLoginPicker';
import { ManageDepartmentsDialog, ManageDesignationsDialog } from './HrmManageListDialogs';

type Portal = 'admin' | 'employee';
type OptionsState = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; options: HrmEmployeeFormOptions };
type CityOption = { id: number; name: string };
type CreatedSummary = {
  result: HrmOnboardResult;
  /** null when the login already existed: no password was set or shown. */
  password: string | null;
  existingLogin: boolean;
  department: string;
  location: string;
  officeRole: string | null;
};

const NO_ROLE = '__none__';
const FIELD_ORDER: Array<keyof OnboardForm> = ['userId', 'fullName', 'mobile', 'email', 'password', 'joiningDate', 'designation', 'orgUnitId', 'locationType', 'stateId', 'cityId', 'nationalManagerId', 'preferredName', 'dateOfBirth', 'personalEmail'];
const DETAIL_FIELDS: Array<keyof OnboardForm> = ['preferredName', 'dateOfBirth', 'personalEmail'];
/** The fields that have a box in each mode: a server message for any other path goes to the banner. */
const COMMON_FIELDS: Array<keyof OnboardForm> = ['mobile', 'joiningDate', 'designation', 'orgUnitId', 'locationType', 'stateId', 'cityId', 'nationalManagerId', 'preferredName', 'dateOfBirth', 'personalEmail'];
const MODE_FIELDS: Record<OnboardMode, Array<keyof OnboardForm>> = {
  NEW: ['fullName', 'email', 'password', ...COMMON_FIELDS],
  EXISTING: ['userId', ...COMMON_FIELDS],
};

/** Cities of a state from the location master (the same source every other state/city picker uses). */
const fetchCities = async (stateId: string): Promise<CityOption[]> => (await api.get<CityOption[]>(`/locations/cities/${stateId}`)).data || [];

/** The head office's own place from the form options, as the form stores it. */
const defaultLocationOf = (options: HrmEmployeeFormOptions | null): DefaultLocation =>
  (options?.headOffice && options.headOfficeUnit ? { stateId: options.headOffice.stateId, cityId: options.headOffice.cityId } : null);

const inputClass = (error?: string) =>
  `h-10 w-full rounded-lg border bg-white px-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:ring-2 disabled:bg-slate-50 ${error ? 'border-rose-300 focus:border-rose-400 focus:ring-rose-100' : 'border-slate-200 focus:border-amber-400 focus:ring-amber-100'}`;

function Field({ id, label, required, error, hint, children, className = '' }: { id: string; label: string; required?: boolean; error?: string | undefined; hint?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-slate-700">{label}{required ? <span className="text-rose-500"> *</span> : null}</label>
      {children}
      {error ? <p id={`${id}-error`} role="alert" className="mt-1 text-xs font-medium text-rose-600">{error}</p> : hint ? <p className="mt-1 text-xs leading-5 text-slate-500">{hint}</p> : null}
    </div>
  );
}

function ReadOnlyField({ label, value, hint }: { label: string; value: string; hint?: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1 block text-sm font-medium text-slate-700">{label}</p>
      <p className="flex h-10 items-center truncate rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-700" title={value}>{value || '—'}</p>
      {hint ? <p className="mt-1 text-xs leading-5 text-slate-500">{hint}</p> : null}
    </div>
  );
}

function SectionTitle({ icon: Icon, title, description }: { icon: typeof KeyRound; title: string; description: string }) {
  return (
    <div className="flex items-start gap-3 border-b border-slate-100 pb-3">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-600"><Icon className="h-4 w-4" /></span>
      <div>
        <h3 className="text-sm font-bold text-slate-900">{title}</h3>
        <p className="text-xs text-slate-500">{description}</p>
      </div>
    </div>
  );
}

const copyText = async (text: string, label: string) => {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`${label} copied.`);
  } catch {
    toast.error('Copy was blocked by the browser. Select the text and copy it manually.');
  }
};

/** Logins that already belong to an HR record cannot be picked again; the note says where to go instead. */
const loginNote = (user: HrmLinkableUser): LoginNote => {
  const match = user.matchingEmployee;
  if (!match) return null;
  return {
    text: match.hasLogin
      ? `Already has HR record ${match.employeeCode} – open that profile.`
      : `Already has HR record ${match.employeeCode} – open that profile and use Link existing login`,
    blocked: true,
  };
};

/**
 * "Add New Employee": one form that sets the employee up once. Either it creates the login account (same fields as
 * Users → Add New Employee) together with the HR record and the first assignment, or it creates the HR record for a
 * login that already exists, so nobody has to be added twice.
 */
export default function HrmAddEmployeeDialog({ portal, allIndia, onClose, onCreated, onListsChanged }: {
  portal: Portal;
  /**
   * The viewer has all-India HRM access (from the directory's reach). Department and designation masters are head
   * office's: creating, renaming or deleting them also needs it (the server answers 403 HRM_ALL_INDIA_REQUIRED).
   */
  allIndia?: boolean;
  onClose: () => void;
  onCreated: (result: HrmOnboardResult) => void;
  /** The department or designation list changed (created, renamed, switched off, deleted): the screen behind refreshes what it shows. */
  onListsChanged?: () => void;
}) {
  const [optionsState, setOptionsState] = useState<OptionsState>({ status: 'loading' });
  const canManageMasters = Boolean(optionsState.status === 'ready' && optionsState.options.abilities.canManageOrg) && allIndia !== false;
  const [reloadKey, setReloadKey] = useState(0);
  const [form, setForm] = useState<OnboardForm | null>(null);
  /** How the form looked when it was handed over: anything different is work the person would lose. */
  const [baseline, setBaseline] = useState<OnboardForm | null>(null);
  const [listsNotice, setListsNotice] = useState('');
  const [listsError, setListsError] = useState('');
  /** Only the newest refresh of the lists may write to the form. */
  const refreshSeq = useRef(0);
  const addingDepartmentRef = useRef(false);
  const addingDesignationRef = useRef(false);
  const [modeChoice, setModeChoice] = useState<OnboardMode | null>(null);
  const [selectedLogin, setSelectedLogin] = useState<HrmLinkableUser | null>(null);
  const [errors, setErrors] = useState<OnboardErrors>({});
  const [submitError, setSubmitError] = useState('');
  const [saving, setSaving] = useState(false);
  const [created, setCreated] = useState<CreatedSummary | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [dobMax, setDobMax] = useState('');
  const [joiningMax, setJoiningMax] = useState('');
  /** The designation that ticking "State Manager" filled in, so unticking can take exactly that back. */
  const autoFilledDesignation = useRef<string | null>(null);
  const [addedDepartments, setAddedDepartments] = useState<Array<{ id: string; code: string; name: string }>>([]);
  const [newDepartment, setNewDepartment] = useState<string | null>(null);
  const [addingDepartment, setAddingDepartment] = useState(false);
  const [departmentError, setDepartmentError] = useState('');
  const [addedDesignations, setAddedDesignations] = useState<Array<{ id: string; name: string; isSystem: boolean }>>([]);
  const [newDesignation, setNewDesignation] = useState<string | null>(null);
  const [addingDesignation, setAddingDesignation] = useState(false);
  const [designationError, setDesignationError] = useState('');
  const [manage, setManage] = useState<'departments' | 'designations' | null>(null);
  const [cities, setCities] = useState<Record<string, CityOption[]>>({});
  const [citiesLoadingFor, setCitiesLoadingFor] = useState('');
  const [cityError, setCityError] = useState('');
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const errorRef = useRef<HTMLParagraphElement | null>(null);
  const manageOpen = manage !== null;

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setOptionsState({ status: 'loading' });
      try {
        const response = await hrmApi.getEmployeeFormOptions();
        if (cancelled) return;
        const options = response.data.options;
        setOptionsState({ status: 'ready', options });
        setDobMax(maxDateOfBirth());
        setJoiningMax(maxJoiningDate());
        const defaultLocation = defaultLocationOf(options);
        const initial = createEmptyOnboardForm(toDateInputValue(new Date()), defaultLocation ? 'HEAD_OFFICE' : 'STATE_OFFICE', defaultLocation);
        setForm((current) => current ?? initial);
        setBaseline((current) => current ?? initial);
        // The head office place is preselected, so its cities are needed for the City box right away.
        if (defaultLocation) {
          const stateKey = String(defaultLocation.stateId);
          try {
            const list = await fetchCities(stateKey);
            if (!cancelled) setCities((current) => (current[stateKey] ? current : { ...current, [stateKey]: list }));
          } catch {
            if (!cancelled) setCityError('Cities could not be loaded. Choose the state again to retry.');
          }
        }
      } catch (error) {
        if (!cancelled) setOptionsState({ status: 'error', message: getHrmErrorMessage(error, 'Unable to load the employee form.') });
      }
    }, 0);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [reloadKey]);

  // Escape and a click outside must never throw away a one-time password or a form that was filled in: they close the
  // dialog only while nothing is at stake (the X and Cancel buttons always can).
  const formDirty = Boolean(form && baseline && isOnboardFormDirty(form, baseline));
  const lockDismiss = saving || (created ? Boolean(created.password) : formDirty);

  // Escape closes (unless saving or locked), Tab stays inside the dialog.
  useEffect(() => {
    // Capture phase: the dropdown closes its own list on Escape, and by then the list is gone from the page,
    // so the check has to run first or one Escape would close the dropdown AND discard the whole form.
    const onKeyDown = (event: KeyboardEvent) => {
      // A manage dialog on top handles its own Escape and Tab; this form must neither close nor grab the focus.
      if (manageOpen) return;
      const listOpen = Boolean(document.querySelector('[role="listbox"]'));
      if (event.key === 'Escape') {
        const local = event.target instanceof Element && event.target.closest('[data-escape-local]');
        if (!saving && !lockDismiss && !local && !listOpen) onClose();
        return;
      }
      if (event.key !== 'Tab' || !dialogRef.current || listOpen) return;
      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled]), textarea, [tabindex]:not([tabindex="-1"])')).filter((element) => element.offsetParent !== null);
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;
      const active = document.activeElement;
      if (!(active instanceof Node) || !dialogRef.current.contains(active)) { event.preventDefault(); first.focus(); return; }
      if (event.shiftKey && active === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && active === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [saving, lockDismiss, onClose, manageOpen]);

  // The page behind does not scroll. The lock is shared with the manage dialogs opened on top of this one.
  useEffect(() => bodyScrollLock.acquire(), []);

  const options = optionsState.status === 'ready' ? optionsState.options : null;
  const formReady = Boolean(options && form);

  // Which ways of adding somebody this person may use. The switch shows only when both are open to them.
  const canNew = Boolean(options && options.abilities.canManageEmployees && options.abilities.canAssign && options.abilities.canCreateLogin);
  const canExisting = Boolean(options && options.abilities.canManageEmployees && options.abilities.canAssign && options.abilities.canReadUsers);
  const availableModes = useMemo<OnboardMode[]>(() => [...(canNew ? ['NEW' as const] : []), ...(canExisting ? ['EXISTING' as const] : [])], [canNew, canExisting]);
  const mode: OnboardMode = modeChoice && availableModes.includes(modeChoice) ? modeChoice : (availableModes[0] ?? 'NEW');
  const showSwitch = canNew && canExisting;

  useEffect(() => {
    if (created) dialogRef.current?.focus();
    else if (formReady) document.getElementById(mode === 'NEW' ? 'hrm-add-fullName' : 'hrm-add-login-search')?.focus();
  }, [formReady, created, mode]);

  const departments = useMemo(
    () => [...new Map([...(options?.departments ?? []), ...addedDepartments].map((department) => [department.id, department] as const)).values()].sort((a, b) => a.name.localeCompare(b.name)),
    [options?.departments, addedDepartments],
  );
  const departmentOptions = useMemo(() => departments.map((department) => ({ id: department.id, name: department.name })), [departments]);
  // Designations from the managed list, plus any added in this form that the server list has not returned yet.
  const designations = useMemo(
    () => [...new Map([...(options?.designations ?? []), ...addedDesignations].map((designation) => [designation.id, designation] as const)).values()].sort((a, b) => a.name.localeCompare(b.name)),
    [options?.designations, addedDesignations],
  );
  const designationOptions = useMemo(() => designations.map((designation) => ({ id: designation.id, name: designation.name })), [designations]);
  const roleOptions = useMemo(() => [{ id: NO_ROLE, name: 'No permission role assigned' }, ...(options?.roles ?? []).map((role) => ({ id: role.id, name: role.name }))], [options?.roles]);
  // Every state of the master is listed; the label says which ones have no office yet or a switched-off one.
  const stateOptions = useMemo(
    () => (options?.states ?? []).map((state) => ({ id: state.id, name: stateOptionLabel(state) })),
    [options?.states],
  );
  // A head office employee's place does not need a state office, so those states carry no "No office yet" label.
  const plainStateOptions = useMemo(() => (options?.states ?? []).map((state) => ({ id: state.id, name: state.name })), [options?.states]);
  const typeOptions = useMemo(() => EMPLOYMENT_TYPE_OPTIONS.map((value) => ({ id: value, name: formatHrmStatus(value) })), []);

  // There is no reporting-manager box: the server makes a State Manager report to the National Operations Manager.
  const nationalNote = useMemo(() => describeNationalManager(options?.nationalOperationsManagers ?? []), [options?.nationalOperationsManagers]);
  const defaultLocation = useMemo(() => defaultLocationOf(options), [options]);

  const update = <K extends keyof OnboardForm>(key: K, value: OnboardForm[K]) => {
    if (key === 'orgUnitId' || key === 'designation') setListsNotice('');
    setForm((current) => (current ? { ...current, [key]: value } : current));
    setErrors((current) => (current[key] ? { ...current, [key]: undefined } : current));
    setSubmitError('');
  };

  const switchMode = (next: OnboardMode) => {
    if (next === mode || saving) return;
    setModeChoice(next);
    setSelectedLogin(null);
    setErrors({});
    setSubmitError('');
    setShowPassword(false);
    setForm((current) => (current ? { ...current, fullName: '', mobile: '', email: '', password: '', customRoleId: '', userId: '' } : current));
  };

  /** Reloads the form options after a list was changed in a manage dialog, keeping everything the person typed. */
  const refreshOptions = async (change: ListChange) => {
    const seq = refreshSeq.current + 1;
    refreshSeq.current = seq;
    setListsError('');
    const before = form ? { orgUnitId: form.orgUnitId, designation: form.designation } : null;
    try {
      const fresh = (await hrmApi.getEmployeeFormOptions()).data.options;
      // Two changes in a row start two refreshes: only the newest one may write, an older answer is dropped.
      if (seq !== refreshSeq.current) return;
      setOptionsState({ status: 'ready', options: fresh });
      // The server list is now the truth: drop what this form added locally.
      setAddedDepartments([]);
      setAddedDesignations([]);
      setForm((current) => (current ? {
        ...current,
        orgUnitId: reconcileDepartment(current.orgUnitId, fresh.departments),
        designation: reconcileDesignation(current.designation, change, fresh.designations),
      } : current));
      // A department or designation that was selected and is gone is cleared; say so instead of leaving a blank box.
      if (before) {
        setListsNotice(describeLostSelections(before, {
          orgUnitId: reconcileDepartment(before.orgUnitId, fresh.departments),
          designation: reconcileDesignation(before.designation, change, fresh.designations),
        }));
      }
    } catch (error) {
      if (seq !== refreshSeq.current) return;
      // The change itself is saved. The lists on screen may be out of date, so say so and offer a retry.
      setListsError(getHrmErrorMessage(error, 'The department and designation lists could not be refreshed.'));
    }
  };

  const selectLogin = (user: HrmLinkableUser) => {
    setSelectedLogin(user);
    // The login's own mobile is shown read-only and used by the server; the box is only for logins without one.
    setForm((current) => (current ? { ...current, userId: user.id, mobile: '' } : current));
    setErrors((current) => ({ ...current, userId: undefined, mobile: undefined }));
    setSubmitError('');
  };

  const clearLogin = () => {
    setSelectedLogin(null);
    setForm((current) => (current ? { ...current, userId: '', mobile: '' } : current));
    setSubmitError('');
  };

  const loadCities = useCallback(async (stateId: string) => {
    if (!stateId || cities[stateId]) return;
    setCitiesLoadingFor(stateId);
    setCityError('');
    try {
      const response = await api.get<CityOption[]>(`/locations/cities/${stateId}`);
      setCities((current) => ({ ...current, [stateId]: response.data || [] }));
    } catch {
      setCityError('Cities could not be loaded. Choose the state again to retry.');
    } finally {
      setCitiesLoadingFor((current) => (current === stateId ? '' : current));
    }
  }, [cities]);

  const changeState = (stateId: string) => {
    setForm((current) => (current ? { ...current, stateId, cityId: '' } : current));
    setErrors((current) => ({ ...current, stateId: undefined, cityId: undefined }));
    setCityError('');
    void loadCities(stateId);
  };

  const chooseLocation = (locationType: HrmLocationType) => {
    if (form && form.locationType === locationType) return;
    // Only a state office has a manager, so the flag does not travel to the head office, and what ticking it filled in
    // (the State Manager designation) goes back with it. The head office starts on its own place again; a state office
    // starts empty.
    const revert = locationType === 'HEAD_OFFICE' && form?.isOfficeManager ? revertStateManagerDefaults(form, autoFilledDesignation.current) : {};
    if (locationType === 'HEAD_OFFICE') autoFilledDesignation.current = null;
    setForm((current) => (current ? {
      ...current,
      locationType,
      ...locationAfterSwitch(current, locationType, defaultLocation),
      ...(locationType === 'HEAD_OFFICE' ? { isOfficeManager: false, nationalManagerId: '', ...revert } : {}),
    } : current));
    setErrors((current) => ({ ...current, locationType: undefined, stateId: undefined, cityId: undefined }));
    setCityError('');
    setSubmitError('');
    if (locationType === 'HEAD_OFFICE' && defaultLocation) void loadCities(String(defaultLocation.stateId));
  };

  const toggleOfficeManager = (checked: boolean) => {
    if (!form) return;
    if (checked) {
      // Remember what the tick filled in, so unticking can take exactly that back (and never a designation the person chose).
      const defaults = getStateManagerDefaults(form, { designation: options?.stateManagerDesignation ?? '' });
      autoFilledDesignation.current = defaults.designation ?? null;
      setForm((current) => (current ? { ...current, isOfficeManager: true, ...defaults } : current));
    } else {
      const revert = revertStateManagerDefaults(form, autoFilledDesignation.current);
      autoFilledDesignation.current = null;
      setForm((current) => (current ? { ...current, isOfficeManager: false, nationalManagerId: '', ...revert } : current));
    }
    setErrors((current) => ({ ...current, designation: undefined, nationalManagerId: undefined }));
    setSubmitError('');
  };

  /** Puts the head office back on its own place (Raipur, Chhattisgarh). */
  const useDefaultLocation = () => {
    if (!defaultLocation) return;
    setForm((current) => (current ? { ...current, stateId: String(defaultLocation.stateId), cityId: String(defaultLocation.cityId) } : current));
    setErrors((current) => ({ ...current, stateId: undefined, cityId: undefined }));
    setCityError('');
    void loadCities(String(defaultLocation.stateId));
  };

  const addDepartment = async () => {
    if (addingDepartmentRef.current) return;
    const name = (newDepartment ?? '').replace(/\s+/g, ' ').trim();
    if (name.length < 2) { setDepartmentError('Enter the department name.'); return; }
    const existing = departments.find((department) => department.name.toLowerCase() === name.toLowerCase());
    if (existing) { update('orgUnitId', existing.id); setNewDepartment(null); return; }
    addingDepartmentRef.current = true;
    setAddingDepartment(true);
    setDepartmentError('');
    try {
      const response = await hrmApi.createOrganisationUnit({ kind: 'DEPARTMENT', name });
      const unit = response.data.unit;
      setAddedDepartments((current) => [...current, { id: unit.id, code: unit.code, name: unit.name }]);
      update('orgUnitId', unit.id);
      setNewDepartment(null);
      onListsChanged?.();
    } catch (error) {
      setDepartmentError(getHrmErrorMessage(error, 'Unable to create the department.'));
    } finally {
      addingDepartmentRef.current = false;
      setAddingDepartment(false);
    }
  };

  const addDesignation = async () => {
    if (addingDesignationRef.current) return;
    const name = normaliseName(newDesignation ?? '');
    if (name.length < 2) { setDesignationError('Enter the designation name.'); return; }
    const existing = findByName(designations, name);
    if (existing) { update('designation', existing.name); setNewDesignation(null); return; }
    addingDesignationRef.current = true;
    setAddingDesignation(true);
    setDesignationError('');
    try {
      const created = (await hrmApi.createDesignation(name)).data.designation;
      setAddedDesignations((current) => [...current, { id: created.id, name: created.name, isSystem: created.isSystem }]);
      update('designation', created.name);
      setNewDesignation(null);
      onListsChanged?.();
    } catch (error) {
      setDesignationError(getHrmErrorMessage(error, 'Unable to create the designation.'));
    } finally {
      addingDesignationRef.current = false;
      setAddingDesignation(false);
    }
  };

  /** A manage dialog changed the lists: refresh them and keep the selection in step (rename follows, removal clears). */
  const handleListChange = (change: ListChange) => {
    void refreshOptions(change);
    // The screen behind shows department and designation names too (a rename rewrites the assignments): refresh it now,
    // even if this form is then simply cancelled.
    onListsChanged?.();
    setErrors((current) => ({ ...current, designation: undefined, orgUnitId: undefined }));
  };

  const selectedState = options?.states.find((state) => String(state.id) === form?.stateId);
  // A state without an office gets one when saving, but only an administrator may create it. A state whose office is
  // switched off is a different case: saving would be refused, so it blocks here with the way out.
  const stateOffice = form?.locationType === 'STATE_OFFICE' ? describeStateOffice(selectedState, Boolean(options?.abilities.canManageOrg)) : { error: null, note: null };
  const stateOfficeMessage = stateOffice.error;
  const stateOfficeNote = stateOffice.note;
  const headOfficeAvailable = Boolean(options?.headOffice && options?.headOfficeUnit);

  const focusField = (key: keyof OnboardForm) => {
    const id = key === 'userId' ? 'hrm-add-login-search' : `hrm-add-${key}`;
    window.setTimeout(() => document.getElementById(id)?.focus(), 0);
  };

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!form || !options || saving) return;
    const found = validateOnboardForm(form, { headOfficeAvailable, mode, stateOfficeMessage, nationalManagerCount: options.nationalOperationsManagers?.length ?? 0 });
    setErrors(found);
    const firstInvalid = FIELD_ORDER.find((key) => found[key]);
    if (firstInvalid) {
      // The optional details are collapsed; open them so the problem is visible before focusing it.
      if (DETAIL_FIELDS.includes(firstInvalid)) setMoreOpen(true);
      focusField(firstInvalid);
      return;
    }
    setSaving(true);
    setSubmitError('');
    try {
      const existingLogin = mode === 'EXISTING';
      const response = existingLogin
        ? await hrmApi.onboardExistingLogin(toOnboardExistingPayload(form))
        : await hrmApi.onboardEmployee(toOnboardPayload(form));
      const stateName = options.states.find((state) => String(state.id) === form.stateId)?.name;
      const cityName = cities[form.stateId]?.find((city) => String(city.id) === form.cityId)?.name;
      setCreated({
        result: response.data,
        password: existingLogin ? null : form.password,
        existingLogin,
        department: departments.find((department) => department.id === form.orgUnitId)?.name ?? '—',
        location: form.locationType === 'HEAD_OFFICE'
          ? `Head Office · ${[cityName, stateName].filter(Boolean).join(', ') || (options.headOffice ? `${options.headOffice.cityName}, ${options.headOffice.stateName}` : '—')}`
          : [cityName, stateName].filter(Boolean).join(', ') || '—',
        officeRole: form.locationType === 'STATE_OFFICE' && form.isOfficeManager ? 'Manager of the state office' : null,
      });
      setForm((current) => (current ? { ...current, password: '' } : current));
      onCreated(response.data);
    } catch (error) {
      // A validation failure carries one message per field: each goes on its own box (a rejected personal email never
      // lands on the login email) and the first one is focused. Anything else falls back to the banner.
      const { fields, unmapped } = extractFieldErrors(error, MODE_FIELDS[mode]);
      const firstField = FIELD_ORDER.find((key) => fields[key]);
      if (firstField) {
        setErrors((current) => ({ ...current, ...fields }));
        if (DETAIL_FIELDS.some((key) => fields[key])) setMoreOpen(true);
        // Messages for paths this form has no box for (if any) stay in the banner next to the footer.
        setSubmitError(unmapped.join(' '));
        focusField(firstField);
        return;
      }
      const message = getHrmErrorMessage(error, 'Unable to create the employee. Nothing was saved.');
      setSubmitError(message);
      const field = fieldForServerMessage(message, mode);
      if (field) {
        setErrors((current) => ({ ...current, [field]: message }));
        if (DETAIL_FIELDS.includes(field)) setMoreOpen(true);
      }
      window.setTimeout(() => { ((field ? document.getElementById(`hrm-add-${field}`) : null) ?? errorRef.current)?.focus(); }, 0);
    } finally {
      setSaving(false);
    }
  };

  const addAnother = () => {
    setCreated(null);
    setErrors({});
    setSubmitError('');
    setShowPassword(false);
    setSelectedLogin(null);
    setMoreOpen(false);
    setAddedDepartments([]);
    setNewDepartment(null);
    setDepartmentError('');
    setAddedDesignations([]);
    setNewDesignation(null);
    setDesignationError('');
    setCityError('');
    autoFilledDesignation.current = null;
    setListsNotice('');
    setListsError('');
    // A fresh form keeps the work location type, and a head office employee starts on the head office place again.
    const fresh = createEmptyOnboardForm(toDateInputValue(new Date()), form?.locationType ?? 'HEAD_OFFICE', defaultLocation);
    setForm(fresh);
    setBaseline(fresh);
    setReloadKey((value) => value + 1);
  };

  const missingPermissions = options ? [
    !options.abilities.canManageEmployees && 'hrm.employees.manage',
    !options.abilities.canAssign && 'hrm.assignments.manage',
    !options.abilities.canCreateLogin && 'users.create',
  ].filter((value): value is string => Boolean(value)) : [];

  const selectedStateId = form?.stateId ?? '';
  const citiesLoading = Boolean(selectedStateId) && citiesLoadingFor === selectedStateId;
  const cityOptions = useMemo(() => (cities[selectedStateId] ?? []).map((city) => ({ id: city.id, name: city.name })), [cities, selectedStateId]);
  const headOfficeLabel = options?.headOffice ? `${options.headOffice.cityName}, ${options.headOffice.stateName}` : '';
  const locationTypes: Array<{ id: HrmLocationType; title: string; description: string; disabled?: boolean }> = [
    {
      id: 'HEAD_OFFICE',
      title: 'Head Office',
      description: !options?.headOffice ? 'Raipur is not in the location master' : !options.headOfficeUnit ? 'Set up the head office on the Organisation page first' : `Default: ${headOfficeLabel}`,
      disabled: !headOfficeAvailable,
    },
    { id: 'STATE_OFFICE', title: 'State office', description: 'Choose state and city' },
  ];
  // Head office employees may sit in another city; the default is Raipur and can be restored in one click.
  const headOfficeIsDefault = Boolean(defaultLocation && form && form.stateId === String(defaultLocation.stateId) && form.cityId === String(defaultLocation.cityId));
  const selectedDesignation = form ? findByName(designations, form.designation) : undefined;

  return (
    <>
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/60 p-3 sm:p-4" onMouseDown={() => { if (!lockDismiss && !manageOpen && !document.querySelector('[role="listbox"]')) onClose(); }}>
      <div ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="hrm-add-employee-title" onMouseDown={(event) => event.stopPropagation()} className="flex max-h-[calc(100dvh-1.5rem)] outline-none w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4 sm:px-6">
          <div>
            <h2 id="hrm-add-employee-title" className="text-lg font-bold text-slate-950">{created ? (created.existingLogin ? 'Employee added' : 'Employee created') : 'Add New Employee'}</h2>
            {!created ? (
              <p className="mt-0.5 text-xs text-slate-500">
                {mode === 'EXISTING'
                  ? 'Creates the HR record for a login that already exists. No second login is made.'
                  : 'Creates the login account and the HR record together, so you set the employee up once.'}
              </p>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            {options && !created ? <span className="hidden whitespace-nowrap rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600 sm:inline-flex" title="Assigned automatically when you save">ID {options.nextEmployeeCode} · auto</span> : null}
            <button type="button" onClick={onClose} disabled={saving} aria-label="Close" className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50"><X className="h-4 w-4" /></button>
          </div>
        </div>

        {optionsState.status === 'loading' ? (
          <div role="status" className="flex flex-col items-center gap-3 px-6 py-16 text-sm text-slate-500"><Loader2 className="h-6 w-6 animate-spin text-amber-500" />Loading the form…</div>
        ) : optionsState.status === 'error' ? (
          <div className="px-6 py-10 text-center">
            <AlertCircle className="mx-auto h-8 w-8 text-rose-400" />
            <p role="alert" className="mt-3 text-sm font-medium text-slate-800">{optionsState.message}</p>
            <button type="button" onClick={() => setReloadKey((value) => value + 1)} className="mt-4 rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">Try again</button>
          </div>
        ) : !availableModes.length ? (
          <div className="px-6 py-10 text-center">
            <ShieldAlert className="mx-auto h-8 w-8 text-amber-500" />
            <p className="mt-3 text-sm font-semibold text-slate-900">You can’t add employees yet</p>
            <p className="mx-auto mt-1 max-w-sm text-xs leading-5 text-slate-500">This needs the following permissions on your role. Ask an administrator to add them:</p>
            <p className="mt-3 flex flex-wrap justify-center gap-1.5">{missingPermissions.map((permission) => <code key={permission} className="rounded bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-700">{permission}</code>)}</p>
            <p className="mx-auto mt-3 max-w-sm text-xs leading-5 text-slate-500">To link a login that already exists instead of creating one, <code className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-semibold text-slate-700">users.read</code> is needed in place of <code className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-semibold text-slate-700">users.create</code>.</p>
          </div>
        ) : created ? (
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-6 sm:px-6">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-emerald-50 text-emerald-600"><CheckCircle2 className="h-6 w-6" /></span>
              <div>
                <p className="font-bold text-slate-950">{created.result.employee.legalName}</p>
                <p className="text-xs text-slate-500">Employee ID {created.result.employee.employeeCode} · status {formatHrmStatus(created.result.employee.status)}</p>
              </div>
            </div>
            <dl className="mt-5 grid gap-3 rounded-xl border border-slate-100 bg-slate-50 p-4 text-sm sm:grid-cols-2">
              {[
                ['Department', created.department],
                ['Designation', created.result.assignment.designation],
                ['Work location', created.location],
                ...(created.officeRole ? [['Office role', created.officeRole]] : []),
                ['Joining date', formatHrmDate(created.result.employee.joinedOn)],
                ['Permission role', created.result.user.role?.name ?? 'No permission role assigned'],
              ].map(([label, value]) => (
                <div key={label}><dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</dt><dd className="mt-0.5 font-medium text-slate-900">{value}</dd></div>
              ))}
            </dl>
            {created.existingLogin ? (
              <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50/70 p-4">
                <p className="flex items-center gap-2 text-sm font-bold text-slate-900"><Link2 className="h-4 w-4 text-emerald-600" /> Existing login linked</p>
                <div className="mt-3 flex items-center justify-between gap-3 rounded-lg bg-white px-3 py-2">
                  <div className="min-w-0"><p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Login email</p><p className="truncate font-mono text-sm font-semibold text-slate-900">{created.result.user.email}</p></div>
                  <button type="button" onClick={() => void copyText(created.result.user.email, 'Login email')} aria-label="Copy Login email" className="shrink-0 rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900"><Copy className="h-4 w-4" /></button>
                </div>
                <p className="mt-3 text-xs leading-5 text-emerald-900">This person already had a login, so no new account or password was created. They keep signing in with their existing password.</p>
              </div>
            ) : (
              <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50/70 p-4">
                <p className="flex items-center gap-2 text-sm font-bold text-slate-900"><KeyRound className="h-4 w-4 text-amber-600" /> Login details</p>
                <div className="mt-3 space-y-2 text-sm">
                  {[['Login email', created.result.user.email], ['Temporary password', created.password ?? '']].map(([label, value]) => (
                    <div key={label} className="flex items-center justify-between gap-3 rounded-lg bg-white px-3 py-2">
                      <div className="min-w-0"><p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</p><p className="truncate font-mono text-sm font-semibold text-slate-900">{value}</p></div>
                      <button type="button" onClick={() => void copyText(value!, label!)} aria-label={`Copy ${label}`} className="shrink-0 rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900"><Copy className="h-4 w-4" /></button>
                    </div>
                  ))}
                </div>
                <p className="mt-3 text-xs leading-5 text-amber-900">The password is shown only now and is stored encrypted. Share it securely and ask the employee to change it after the first login.</p>
              </div>
            )}
            <div className="mt-6 flex flex-col-reverse gap-2 border-t border-slate-100 pt-4 sm:flex-row sm:justify-end">
              {!created.existingLogin ? (
                <button type="button" onClick={() => void copyText(buildLoginDetailsText({ employeeCode: created.result.employee.employeeCode, name: created.result.employee.legalName, email: created.result.user.email, password: created.password ?? '', portalUrl: window.location.origin }), 'Login details')} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"><Copy className="h-4 w-4" /> Copy login details</button>
              ) : null}
              <button type="button" onClick={addAnother} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"><Plus className="h-4 w-4" /> Add another</button>
              <Link href={`/${portal}/hrm/${encodeURIComponent(created.result.employee.id)}`} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-semibold text-white hover:bg-slate-800"><UserRound className="h-4 w-4" /> Open profile</Link>
            </div>
          </div>
        ) : form ? (
          <form id="hrm-add-employee-form" onSubmit={submit} noValidate className="flex min-h-0 flex-1 flex-col">
            <div className="min-h-0 flex-1 space-y-7 overflow-y-auto px-5 py-5 sm:px-6">

              {showSwitch ? (
                <div role="radiogroup" aria-label="How is the login set up" className="grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1">
                  {([['NEW', 'New login', 'Create the login too'], ['EXISTING', 'Existing login', 'Link one from the Users page']] as const).map(([id, title, hint]) => {
                    const selected = mode === id;
                    return (
                      <button key={id} type="button" role="radio" aria-checked={selected} onClick={() => switchMode(id)} disabled={saving} className={`rounded-lg px-3 py-2 text-left transition disabled:opacity-60 ${selected ? 'bg-white shadow-sm ring-1 ring-amber-200' : 'hover:bg-white/60'}`}>
                        <span className={`block text-sm font-bold ${selected ? 'text-slate-950' : 'text-slate-600'}`}>{title}</span>
                        <span className="block truncate text-[11px] text-slate-500">{hint}</span>
                      </button>
                    );
                  })}
                </div>
              ) : null}

              {mode === 'NEW' ? (
                <section className="space-y-4">
                  <SectionTitle icon={KeyRound} title="Login account" description="The employee signs in with these details." />
                  <Field id="hrm-add-fullName" label="Employee Full Name" required error={errors.fullName}>
                    <input id="hrm-add-fullName" value={form.fullName} onChange={(event) => update('fullName', event.target.value)} placeholder="Enter full name" autoComplete="off" maxLength={160} aria-invalid={Boolean(errors.fullName)} className={inputClass(errors.fullName)} />
                  </Field>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field id="hrm-add-mobile" label="Mobile Number" required error={errors.mobile}>
                      <input id="hrm-add-mobile" value={form.mobile} onChange={(event) => update('mobile', sanitiseMobileInput(event.target.value))} onBlur={() => { const tidy = normalizeMobile(form.mobile); if (tidy.length === 10 && tidy !== form.mobile) update('mobile', tidy); }} placeholder="Enter mobile number" inputMode="numeric" autoComplete="off" aria-invalid={Boolean(errors.mobile)} className={inputClass(errors.mobile)} />
                    </Field>
                    <Field id="hrm-add-email" label="Email Address" required error={errors.email}>
                      <input id="hrm-add-email" type="email" value={form.email} onChange={(event) => update('email', event.target.value)} placeholder="Enter email address" autoComplete="off" maxLength={254} aria-invalid={Boolean(errors.email)} className={inputClass(errors.email)} />
                    </Field>
                  </div>
                  <Field id="hrm-add-password" label="Temporary Password" required error={errors.password} hint="Share this password with the employee so they can login.">
                    <div className="flex gap-2">
                      <div className="relative min-w-0 flex-1">
                        <input id="hrm-add-password" type={showPassword ? 'text' : 'password'} value={form.password} onChange={(event) => update('password', event.target.value)} placeholder="Enter temporary password" autoComplete="new-password" maxLength={72} aria-invalid={Boolean(errors.password)} className={`${inputClass(errors.password)} pr-10`} />
                        <button type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? 'Hide password' : 'Show password'} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:text-slate-700">{showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>
                      </div>
                      <button type="button" onClick={() => { update('password', generateTemporaryPassword()); setShowPassword(true); }} className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50"><Sparkles className="h-3.5 w-3.5 text-amber-500" /> Generate</button>
                    </div>
                  </Field>
                  <Field id="hrm-add-customRoleId" label="Permission Role" hint={<>Create roles from <Link href={`/${portal}/users/roles`} target="_blank" className="font-semibold text-amber-700 underline-offset-2 hover:underline">Users Role</Link>, then assign one to control employee module access.</>}>
                    <SearchableSelect id="hrm-add-customRoleId" options={roleOptions} value={form.customRoleId || NO_ROLE} displayValue={roleOptions.find((role) => role.id === (form.customRoleId || NO_ROLE))?.name ?? ''} onChange={(option) => update('customRoleId', option.id === NO_ROLE ? '' : String(option.id))} searchable={roleOptions.length > 8} className="w-full" />
                  </Field>
                </section>
              ) : (
                <section className="space-y-4">
                  <SectionTitle icon={Link2} title="Existing login" description="Pick the account created on the Users page. Its name, email, password and permission role stay as they are." />
                  <div>
                    <p className="mb-1 block text-sm font-medium text-slate-700">Employee login<span className="text-rose-500"> *</span></p>
                    <HrmLoginPicker idPrefix="hrm-add-login" selected={selectedLogin} onSelect={selectLogin} onClear={clearLogin} getNote={loginNote} disabled={saving} error={errors.userId} />
                  </div>
                  {selectedLogin ? (
                    <div className="grid gap-4 sm:grid-cols-2">
                      <ReadOnlyField label="Employee Full Name" value={selectedLogin.name} />
                      <ReadOnlyField label="Email Address" value={selectedLogin.email ?? ''} />
                      {selectedLogin.mobile ? (
                        <ReadOnlyField label="Mobile Number" value={selectedLogin.mobile} />
                      ) : (
                        <Field id="hrm-add-mobile" label="Mobile Number" error={errors.mobile} hint="This login has no mobile number. Add one here (optional).">
                          <input id="hrm-add-mobile" value={form.mobile} onChange={(event) => update('mobile', sanitiseMobileInput(event.target.value))} onBlur={() => { const tidy = normalizeMobile(form.mobile); if (tidy.length === 10 && tidy !== form.mobile) update('mobile', tidy); }} placeholder="Enter mobile number" inputMode="numeric" autoComplete="off" aria-invalid={Boolean(errors.mobile)} className={inputClass(errors.mobile)} />
                        </Field>
                      )}
                      <ReadOnlyField label="Permission Role" value={selectedLogin.role?.name ?? 'No permission role assigned'} hint={<>Roles are changed from <Link href={`/${portal}/users`} target="_blank" className="font-semibold text-amber-700 underline-offset-2 hover:underline">Users</Link>.</>} />
                    </div>
                  ) : null}
                </section>
              )}

              <section className="space-y-4">
                <SectionTitle icon={Building2} title="Job details" description="Where the employee sits in the company." />
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field id="hrm-add-joiningDate" label="Joining Date" required error={errors.joiningDate} hint="A future date takes effect on that day.">
                    <input id="hrm-add-joiningDate" type="date" value={form.joiningDate} min={EARLIEST_JOINING_DATE} max={joiningMax || undefined} onChange={(event) => update('joiningDate', event.target.value)} aria-invalid={Boolean(errors.joiningDate)} className={inputClass(errors.joiningDate)} />
                  </Field>
                  <Field id="hrm-add-designation" label="Designation" required error={errors.designation}>
                    <SearchableSelect id="hrm-add-designation" options={designationOptions} value={selectedDesignation?.id ?? ''} displayValue={form.designation} onChange={(option) => update('designation', option.name)} placeholder={designationOptions.length ? 'Select designation' : 'No designations yet'} disabled={!designationOptions.length} className="w-full" />
                    {canManageMasters ? (
                      <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1">
                        {newDesignation === null ? (
                          <button type="button" onClick={() => { setNewDesignation(''); setDesignationError(''); }} className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700 hover:text-amber-800"><Plus className="h-3 w-3" /> New designation</button>
                        ) : null}
                        <button type="button" onClick={() => setManage('designations')} className="inline-flex items-center gap-1 text-xs font-semibold text-slate-600 hover:text-slate-900"><Settings2 className="h-3 w-3" /> Manage designations</button>
                      </div>
                    ) : !designationOptions.length ? <p className="mt-1 text-xs text-amber-700">No designations exist yet. Ask an administrator to create one.</p> : null}
                    {canManageMasters && newDesignation !== null ? (
                      <div className="mt-2">
                        <div className="flex gap-2">
                          <input value={newDesignation} onChange={(event) => { setNewDesignation(event.target.value); setDesignationError(''); }} data-escape-local onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); void addDesignation(); } else if (event.key === 'Escape') { event.preventDefault(); setNewDesignation(null); } }} placeholder="Designation name" aria-label="New designation name" maxLength={120} autoFocus className={`${inputClass(designationError)} h-9`} />
                          <button type="button" onClick={() => void addDesignation()} disabled={addingDesignation} className="inline-flex h-9 shrink-0 items-center gap-1 rounded-lg bg-slate-950 px-3 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-60">{addingDesignation ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}Add</button>
                          <button type="button" onClick={() => setNewDesignation(null)} aria-label="Cancel new designation" className="h-9 shrink-0 rounded-lg px-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><X className="h-4 w-4" /></button>
                        </div>
                        {designationError ? <p role="alert" className="mt-1 text-xs font-medium text-rose-600">{designationError}</p> : null}
                      </div>
                    ) : null}
                  </Field>
                  <Field id="hrm-add-orgUnitId" label="Department" required error={errors.orgUnitId}>
                    <SearchableSelect id="hrm-add-orgUnitId" options={departmentOptions} value={departmentOptions.some((department) => department.id === form.orgUnitId) ? form.orgUnitId : ''} displayValue={departmentOptions.find((department) => department.id === form.orgUnitId)?.name ?? ''} onChange={(option) => update('orgUnitId', String(option.id))} placeholder={departmentOptions.length ? 'Select department' : 'No departments yet'} disabled={!departmentOptions.length} className="w-full" />
                    {canManageMasters ? (
                      newDepartment === null ? (
                        <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1">
                          <button type="button" onClick={() => { setNewDepartment(''); setDepartmentError(''); }} className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700 hover:text-amber-800"><Plus className="h-3 w-3" /> New department</button>
                          <button type="button" onClick={() => setManage('departments')} className="inline-flex items-center gap-1 text-xs font-semibold text-slate-600 hover:text-slate-900"><Settings2 className="h-3 w-3" /> Manage departments</button>
                        </div>
                      ) : (
                        <div className="mt-2">
                          <div className="flex gap-2">
                            <input value={newDepartment} onChange={(event) => { setNewDepartment(event.target.value); setDepartmentError(''); }} data-escape-local onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); void addDepartment(); } else if (event.key === 'Escape') { event.preventDefault(); setNewDepartment(null); } }} placeholder="Department name" aria-label="New department name" maxLength={160} autoFocus className={`${inputClass(departmentError)} h-9`} />
                            <button type="button" onClick={() => void addDepartment()} disabled={addingDepartment} className="inline-flex h-9 shrink-0 items-center gap-1 rounded-lg bg-slate-950 px-3 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-60">{addingDepartment ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}Add</button>
                            <button type="button" onClick={() => setNewDepartment(null)} aria-label="Cancel new department" className="h-9 shrink-0 rounded-lg px-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><X className="h-4 w-4" /></button>
                          </div>
                          {departmentError ? <p role="alert" className="mt-1 text-xs font-medium text-rose-600">{departmentError}</p> : null}
                        </div>
                      )
                    ) : !departmentOptions.length ? <p className="mt-1 text-xs text-amber-700">No departments exist yet. Ask an administrator to create one.</p> : null}
                  </Field>
                  <Field id="hrm-add-employmentType" label="Employment Type">
                    <SearchableSelect id="hrm-add-employmentType" options={typeOptions} value={form.employmentType} displayValue={formatHrmStatus(form.employmentType)} onChange={(option) => update('employmentType', String(option.id))} searchable={false} className="w-full" />
                  </Field>
                </div>
                {listsNotice ? <p role="status" className="rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">{listsNotice}</p> : null}
                {listsError ? (
                  <p role="alert" className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">
                    <span>{listsError} The lists shown may be out of date.</span>
                    <button type="button" onClick={() => void refreshOptions({ type: 'other', list: 'department' })} className="font-semibold underline underline-offset-2 hover:text-rose-900">Try again</button>
                  </p>
                ) : null}
              </section>

              <section className="space-y-4">
                <SectionTitle icon={MapPin} title="Work location" description="Head Office defaults to Raipur. Other employees sit in a state office." />
                <div id="hrm-add-locationType" tabIndex={-1} role="radiogroup" aria-label="Work location" className="grid gap-2 sm:grid-cols-2">
                  {locationTypes.map((type) => {
                    const selected = form.locationType === type.id;
                    const Icon = type.id === 'HEAD_OFFICE' ? Landmark : MapPin;
                    return (
                      <button key={type.id} type="button" role="radio" aria-checked={selected} disabled={type.disabled} onClick={() => chooseLocation(type.id)} className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-left transition disabled:cursor-not-allowed disabled:opacity-50 ${selected ? 'border-amber-400 bg-amber-50 ring-2 ring-amber-100' : 'border-slate-200 bg-white hover:border-amber-200 hover:bg-slate-50'}`}>
                        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${selected ? 'bg-amber-400 text-slate-950' : 'bg-slate-100 text-slate-500'}`}><Icon className="h-4 w-4" /></span>
                        <span className="min-w-0"><span className="block text-sm font-bold text-slate-900">{type.title}</span><span className="block text-xs text-slate-500">{type.description}</span></span>
                      </button>
                    );
                  })}
                </div>
                {errors.locationType ? <p role="alert" className="text-xs font-medium text-rose-600">{errors.locationType}</p> : null}
                {form.locationType === 'STATE_OFFICE' || headOfficeAvailable ? (
                  <>
                    <div className="grid gap-4 sm:grid-cols-2">
                      {form.locationType === 'STATE_OFFICE' ? (
                        <Field id="hrm-add-stateId" label="State" required error={errors.stateId || stateOfficeMessage || undefined} hint={stateOfficeNote ?? (options?.abilities.canManageOrg ? 'Every state is listed. A state without an office gets one when you save.' : 'Every state is listed.')}>
                          <SearchableSelect id="hrm-add-stateId" options={stateOptions} value={form.stateId} displayValue={selectedState?.name ?? ''} onChange={(option) => changeState(String(option.id))} placeholder="Select state" className="w-full" />
                        </Field>
                      ) : (
                        <Field id="hrm-add-stateId" label="State" required error={errors.stateId} hint={`Default: ${headOfficeLabel}.`}>
                          <SearchableSelect id="hrm-add-stateId" options={plainStateOptions} value={form.stateId} displayValue={selectedState?.name ?? ''} onChange={(option) => changeState(String(option.id))} placeholder="Select state" className="w-full" />
                        </Field>
                      )}
                      <Field id="hrm-add-cityId" label="City" required error={errors.cityId || cityError || undefined}>
                        <SearchableSelect id="hrm-add-cityId" options={cityOptions} value={form.cityId} displayValue={cityOptions.find((city) => String(city.id) === form.cityId)?.name ?? ''} onChange={(option) => update('cityId', String(option.id))} placeholder={form.stateId ? (citiesLoading ? 'Loading cities…' : 'Select city') : 'Select state first'} disabled={!form.stateId} loading={citiesLoading} className="w-full" />
                      </Field>
                    </div>
                    {form.locationType === 'HEAD_OFFICE' && !headOfficeIsDefault && defaultLocation ? (
                      <button type="button" onClick={useDefaultLocation} className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700 hover:text-amber-800"><MapPin className="h-3 w-3" /> Use the head office place ({headOfficeLabel})</button>
                    ) : null}
                    {form.locationType === 'STATE_OFFICE' ? (
                      <>
                        <label className={`flex cursor-pointer items-start gap-3 rounded-xl border px-4 py-3 transition ${form.isOfficeManager ? 'border-amber-300 bg-amber-50/60' : 'border-slate-200 bg-white hover:bg-slate-50'}`}>
                          <input id="hrm-add-isOfficeManager" type="checkbox" checked={form.isOfficeManager} onChange={(event) => toggleOfficeManager(event.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 rounded accent-amber-500" />
                          <span className="min-w-0">
                            <span className="block text-sm font-semibold text-slate-900">Manager of this state office (State Manager)</span>
                            <span className="block text-xs leading-5 text-slate-500">A state can have more than one manager. State Managers report to the National Operations Manager by default.</span>
                          </span>
                        </label>
                        {form.isOfficeManager ? (
                          <p role="note" className={`rounded-lg px-3 py-2 text-xs leading-5 ${nationalNote.tone === 'ok' ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-800'}`}>{nationalNote.text}</p>
                        ) : null}
                        {form.isOfficeManager && (options?.nationalOperationsManagers?.length ?? 0) > 1 ? (
                          <Field id="hrm-add-nationalManagerId" label="Reports to (National Operations Manager)" required error={errors.nationalManagerId}>
                            <select
                              id="hrm-add-nationalManagerId"
                              value={form.nationalManagerId}
                              onChange={(event) => update('nationalManagerId', event.target.value)}
                              className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100"
                            >
                              <option value="">Choose…</option>
                              {(options?.nationalOperationsManagers ?? []).map((manager) => (
                                <option key={manager.id} value={manager.id}>{manager.name} ({manager.employeeCode})</option>
                              ))}
                            </select>
                          </Field>
                        ) : null}
                      </>
                    ) : null}
                  </>
                ) : null}
              </section>

              <section>
                <button type="button" onClick={() => setMoreOpen((value) => !value)} aria-expanded={moreOpen} aria-controls="hrm-add-more-details" className="flex w-full items-center justify-between gap-3 rounded-xl border border-slate-200 px-4 py-3 text-left hover:bg-slate-50">
                  <span>
                    <span className="block text-sm font-bold text-slate-900">More details (optional)</span>
                    <span className="block text-xs text-slate-500">Preferred name, date of birth and personal email.</span>
                  </span>
                  <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition ${moreOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
                </button>
                {moreOpen ? (
                  <div id="hrm-add-more-details" className="mt-4 grid gap-4 sm:grid-cols-2">
                    <Field id="hrm-add-preferredName" label="Preferred Name" error={errors.preferredName}>
                      <input id="hrm-add-preferredName" value={form.preferredName} onChange={(event) => update('preferredName', event.target.value)} placeholder="Name used day to day" autoComplete="off" maxLength={160} className={inputClass(errors.preferredName)} />
                    </Field>
                    <Field id="hrm-add-dateOfBirth" label="Date of Birth" error={errors.dateOfBirth} hint="The employee must be at least 14 years old.">
                      <input id="hrm-add-dateOfBirth" type="date" value={form.dateOfBirth} min="1940-01-01" max={dobMax || undefined} onChange={(event) => update('dateOfBirth', event.target.value)} aria-invalid={Boolean(errors.dateOfBirth)} className={inputClass(errors.dateOfBirth)} />
                    </Field>
                    <Field id="hrm-add-personalEmail" label="Personal Email" error={errors.personalEmail} className="sm:col-span-2">
                      <input id="hrm-add-personalEmail" type="email" value={form.personalEmail} onChange={(event) => update('personalEmail', event.target.value)} placeholder="Personal email address" autoComplete="off" maxLength={254} aria-invalid={Boolean(errors.personalEmail)} className={inputClass(errors.personalEmail)} />
                    </Field>
                  </div>
                ) : null}
              </section>
            </div>

            {submitError ? <p ref={errorRef} tabIndex={-1} role="alert" className="mx-5 mb-3 flex items-start gap-2 rounded-lg bg-rose-50 px-3 py-2.5 text-xs font-medium text-rose-700 outline-none sm:mx-6"><AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />{submitError}</p> : null}
            <div className="flex flex-col-reverse gap-2 border-t border-slate-100 bg-white px-5 py-4 sm:flex-row sm:justify-end sm:px-6">
              <button type="button" onClick={onClose} disabled={saving} className="h-10 rounded-xl border border-slate-200 px-5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60">Cancel</button>
              <button type="submit" disabled={saving} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-amber-400 px-5 text-sm font-bold text-slate-950 shadow-sm hover:bg-amber-500 disabled:opacity-60">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}{saving ? 'Creating…' : mode === 'EXISTING' ? 'Add Employee' : 'Create Employee'}
              </button>
            </div>
          </form>
        ) : null}
      </div>
    </div>
    {/* Rendered beside the form (not inside it) so clicks and keys in these dialogs never reach the form's own handlers. */}
    {manage === 'departments' ? <ManageDepartmentsDialog onClose={() => setManage(null)} onChanged={handleListChange} /> : null}
    {manage === 'designations' ? <ManageDesignationsDialog onClose={() => setManage(null)} onChanged={handleListChange} /> : null}
    </>
  );
}
