'use client';

import { useMemo, useState } from 'react';
import { Loader2, Pencil, UserRound } from 'lucide-react';
import { toast } from 'react-toastify';
import { hrmApi, type HrmBloodGroup, type HrmEmployee, type HrmGender, type HrmMaritalStatus } from '@/lib/hrmApi';
import { formatHrmDate, getHrmErrorMessage } from '@/lib/hrmUi';
import {
  BLOOD_GROUPS,
  buildPersonalPatch,
  formatAddress,
  mergePersonalForm,
  GENDER_LABELS,
  indiaToday,
  MARITAL_LABELS,
  toPersonalForm,
  validatePersonalForm,
  type AddressForm,
  type PersonalErrors,
  type PersonalForm,
} from '@/lib/hrmProfile';
import HrmModal from './HrmModal';

const inputClass = (invalid: boolean) => `mt-1 min-h-10 w-full rounded-lg border bg-white px-3 text-sm font-normal outline-none focus:border-amber-400 ${invalid ? 'border-rose-300' : 'border-slate-200'}`;

const Field = ({ label, error, hint, children }: { label: string; error?: string | undefined; hint?: string | undefined; children: React.ReactNode }) => (
  <label className="block text-xs font-semibold text-slate-700">
    {label}
    {children}
    {error ? <span role="alert" className="mt-1 block text-[11px] font-medium text-rose-600">{error}</span> : hint ? <span className="mt-1 block text-[11px] font-normal text-slate-500">{hint}</span> : null}
  </label>
);

const AddressFields = ({ prefix, value, onChange, errors, disabled }: { prefix: string; value: AddressForm; onChange: (next: AddressForm) => void; errors: PersonalErrors; disabled: boolean }) => (
  <div className="grid gap-3 sm:grid-cols-2">
    <div className="sm:col-span-2"><Field label="Address line 1" error={errors[`${prefix}.line1`]}><input disabled={disabled} value={value.line1} maxLength={200} onChange={(event) => onChange({ ...value, line1: event.target.value })} className={inputClass(Boolean(errors[`${prefix}.line1`]))} /></Field></div>
    <div className="sm:col-span-2"><Field label="Address line 2 (optional)" error={errors[`${prefix}.line2`]}><input disabled={disabled} value={value.line2} maxLength={200} onChange={(event) => onChange({ ...value, line2: event.target.value })} className={inputClass(Boolean(errors[`${prefix}.line2`]))} /></Field></div>
    <Field label="City" error={errors[`${prefix}.city`]}><input disabled={disabled} value={value.city} maxLength={80} onChange={(event) => onChange({ ...value, city: event.target.value })} className={inputClass(Boolean(errors[`${prefix}.city`]))} /></Field>
    <Field label="State" error={errors[`${prefix}.state`]}><input disabled={disabled} value={value.state} maxLength={80} onChange={(event) => onChange({ ...value, state: event.target.value })} className={inputClass(Boolean(errors[`${prefix}.state`]))} /></Field>
    <Field label="PIN code" error={errors[`${prefix}.pincode`]}><input disabled={disabled} inputMode="numeric" value={value.pincode} maxLength={6} onChange={(event) => onChange({ ...value, pincode: event.target.value.replace(/\D/g, '').slice(0, 6) })} className={inputClass(Boolean(errors[`${prefix}.pincode`]))} /></Field>
  </div>
);

/** Date of birth, gender, family, blood group, addresses and emergency contact: shown, and edited in a dialog. */
export default function HrmPersonalDetailsCard({
  employee,
  canEdit,
  lockDateOfBirth = false,
  editing,
  onEditingChange,
  onSaved,
  onConflict,
}: {
  employee: HrmEmployee;
  canEdit: boolean;
  /** Your own record: date of birth is an HR field, changed by another HR user (the rest is yours to change). */
  lockDateOfBirth?: boolean;
  editing: boolean;
  onEditingChange: (open: boolean) => void;
  onSaved: (employee: HrmEmployee) => void;
  /** Somebody else changed the record: reload it. */
  onConflict: () => Promise<void> | void;
}) {
  const stored = useMemo(() => toPersonalForm(employee), [employee]);
  const contact = employee.emergencyContact;
  return (
    <section id="hrm-personal-details" aria-labelledby="hrm-personal-title" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2"><UserRound className="h-4 w-4 text-amber-600" aria-hidden="true" /><h2 id="hrm-personal-title" className="font-bold text-slate-950">Personal details</h2></div>
        {canEdit ? <button type="button" onClick={() => onEditingChange(true)} className="inline-flex min-h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-bold text-slate-800 hover:bg-slate-50"><Pencil className="h-3.5 w-3.5 text-amber-600" /> Edit</button> : null}
      </div>
      <dl className="mt-3 grid gap-x-5 gap-y-2 text-sm sm:grid-cols-2">
        <div><dt className="text-xs text-slate-500">Date of birth</dt><dd className="font-semibold text-slate-800">{formatHrmDate(employee.dateOfBirth)}</dd></div>
        <div><dt className="text-xs text-slate-500">Gender</dt><dd className="font-semibold text-slate-800">{employee.gender ? GENDER_LABELS[employee.gender] : '—'}</dd></div>
        <div><dt className="text-xs text-slate-500">Father / spouse name</dt><dd className="font-semibold text-slate-800">{employee.fatherOrSpouseName || '—'}</dd></div>
        <div><dt className="text-xs text-slate-500">Marital status</dt><dd className="font-semibold text-slate-800">{employee.maritalStatus ? MARITAL_LABELS[employee.maritalStatus] : '—'}</dd></div>
        <div><dt className="text-xs text-slate-500">Blood group</dt><dd className="font-semibold text-slate-800">{employee.bloodGroup || '—'}</dd></div>
        <div><dt className="text-xs text-slate-500">Emergency contact</dt><dd className="font-semibold text-slate-800">{contact ? `${contact.name} (${contact.relation}) · ${contact.mobile}` : '—'}</dd></div>
        <div className="sm:col-span-2"><dt className="text-xs text-slate-500">Current address</dt><dd className="font-semibold text-slate-800">{formatAddress(employee.currentAddress)}</dd></div>
        <div className="sm:col-span-2"><dt className="text-xs text-slate-500">Permanent address</dt><dd className="font-semibold text-slate-800">{stored.permanentSameAsCurrent ? 'Same as current address' : formatAddress(employee.permanentAddress)}</dd></div>
      </dl>
      {editing ? <PersonalDetailsDialog employee={employee} stored={stored} lockDateOfBirth={lockDateOfBirth} onClose={() => onEditingChange(false)} onSaved={onSaved} onConflict={onConflict} /> : null}
    </section>
  );
}

function PersonalDetailsDialog({ employee, stored, lockDateOfBirth, onClose, onSaved, onConflict }: {
  employee: HrmEmployee;
  stored: PersonalForm;
  lockDateOfBirth: boolean;
  onClose: () => void;
  onSaved: (employee: HrmEmployee) => void;
  onConflict: () => Promise<void> | void;
}) {
  const [form, setForm] = useState<PersonalForm>(stored);
  // What the form was opened from (and the version to save against): after a conflict both follow the reloaded record.
  const [baseline, setBaseline] = useState<PersonalForm>(stored);
  const [version, setVersion] = useState(employee.version);
  const [errors, setErrors] = useState<PersonalErrors>({});
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState('');
  const today = indiaToday();
  const dirty = Object.keys(buildPersonalPatch(form, baseline)).length > 0;
  const set = <K extends keyof PersonalForm>(key: K, value: PersonalForm[K]) => setForm((current) => ({ ...current, [key]: value }));

  const save = async () => {
    if (saving) return;
    const found = validatePersonalForm(form, today);
    setErrors(found);
    setServerError('');
    if (Object.keys(found).length) return;
    const patch = buildPersonalPatch(form, baseline);
    if (!Object.keys(patch).length) { onClose(); return; }
    setSaving(true);
    try {
      const response = await hrmApi.updateEmployee(employee.id, { ...patch, version });
      onSaved({ ...employee, ...response.data.employee });
      toast.success('Personal details saved.');
      onClose();
    } catch (error) {
      const response = (error as { response?: { status?: number; data?: { code?: string } } })?.response;
      if (response?.data?.code === 'EMPLOYEE_ARCHIVED') {
        setServerError(getHrmErrorMessage(error, 'This record was archived (the person never joined), so it cannot be edited.'));
      } else if (response?.status === 409) {
        // Reload the record; keep only what was changed in this dialog, everything else takes the new values.
        try {
          const fresh = (await hrmApi.getEmployee(employee.id)).data.employee;
          const freshForm = toPersonalForm(fresh);
          const { merged, kept } = mergePersonalForm(form, baseline, freshForm);
          setForm(merged);
          setBaseline(freshForm);
          setVersion(fresh.version);
          setServerError(kept.length
            ? `Somebody changed this employee a moment ago. The latest details were loaded and your changes to ${kept.join(', ')} were kept: check them and save again.`
            : 'Somebody changed this employee a moment ago. The latest details were loaded: check them and save again.');
        } catch (reloadError) {
          setServerError(getHrmErrorMessage(reloadError, 'Somebody changed this employee a moment ago and the latest details could not be loaded. Close this dialog and reload the page.'));
        }
        void onConflict();
      } else {
        setServerError(getHrmErrorMessage(error, 'The personal details could not be saved.'));
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <HrmModal
      title="Personal details"
      description={`${employee.preferredName || employee.legalName} (${employee.employeeCode})`}
      onClose={onClose}
      busy={saving}
      lockDismiss={saving || dirty}
      size="lg"
      error={serverError}
      footer={<>
        <button type="button" onClick={onClose} disabled={saving} className="min-h-10 rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50">Cancel</button>
        <button type="button" onClick={() => void save()} disabled={saving} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-slate-950 px-4 text-sm font-bold text-white disabled:opacity-60">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}Save</button>
      </>}
    >
      <div className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Date of birth" error={errors.dateOfBirth} hint={lockDateOfBirth ? 'On your own record this is changed by another HR user.' : undefined}><input disabled={saving || lockDateOfBirth} type="date" max={today} min="1900-01-01" value={form.dateOfBirth} onChange={(event) => set('dateOfBirth', event.target.value)} className={inputClass(Boolean(errors.dateOfBirth))} /></Field>
          <Field label="Gender"><select disabled={saving} value={form.gender} onChange={(event) => set('gender', event.target.value as HrmGender | '')} className={inputClass(false)}><option value="">Not given</option>{(Object.keys(GENDER_LABELS) as HrmGender[]).map((value) => <option key={value} value={value}>{GENDER_LABELS[value]}</option>)}</select></Field>
          <Field label="Father / spouse name" error={errors.fatherOrSpouseName}><input disabled={saving} value={form.fatherOrSpouseName} maxLength={160} onChange={(event) => set('fatherOrSpouseName', event.target.value)} className={inputClass(Boolean(errors.fatherOrSpouseName))} /></Field>
          <Field label="Marital status"><select disabled={saving} value={form.maritalStatus} onChange={(event) => set('maritalStatus', event.target.value as HrmMaritalStatus | '')} className={inputClass(false)}><option value="">Not given</option>{(Object.keys(MARITAL_LABELS) as HrmMaritalStatus[]).map((value) => <option key={value} value={value}>{MARITAL_LABELS[value]}</option>)}</select></Field>
          <Field label="Blood group"><select disabled={saving} value={form.bloodGroup} onChange={(event) => set('bloodGroup', event.target.value as HrmBloodGroup | '')} className={inputClass(false)}><option value="">Not given</option>{BLOOD_GROUPS.map((value) => <option key={value} value={value}>{value}</option>)}</select></Field>
        </div>
        <fieldset>
          <legend className="text-sm font-bold text-slate-900">Current address</legend>
          <div className="mt-2"><AddressFields prefix="currentAddress" value={form.currentAddress} onChange={(next) => set('currentAddress', next)} errors={errors} disabled={saving} /></div>
        </fieldset>
        <fieldset>
          <legend className="text-sm font-bold text-slate-900">Permanent address</legend>
          <label className="mt-2 flex items-center gap-2 text-xs font-semibold text-slate-700"><input disabled={saving} type="checkbox" checked={form.permanentSameAsCurrent} onChange={(event) => set('permanentSameAsCurrent', event.target.checked)} className="h-4 w-4 accent-amber-500" /> Same as current address</label>
          {form.permanentSameAsCurrent ? null : <div className="mt-2"><AddressFields prefix="permanentAddress" value={form.permanentAddress} onChange={(next) => set('permanentAddress', next)} errors={errors} disabled={saving} /></div>}
        </fieldset>
        <fieldset>
          <legend className="text-sm font-bold text-slate-900">Emergency contact</legend>
          <div className="mt-2 grid gap-3 sm:grid-cols-3">
            <Field label="Name" error={errors.emergencyName}><input disabled={saving} value={form.emergencyName} maxLength={160} onChange={(event) => set('emergencyName', event.target.value)} className={inputClass(Boolean(errors.emergencyName))} /></Field>
            <Field label="Relation" error={errors.emergencyRelation}><input disabled={saving} value={form.emergencyRelation} maxLength={60} placeholder="Father, Spouse…" onChange={(event) => set('emergencyRelation', event.target.value)} className={inputClass(Boolean(errors.emergencyRelation))} /></Field>
            <Field label="Mobile" error={errors.emergencyMobile}><input disabled={saving} inputMode="tel" value={form.emergencyMobile} maxLength={20} onChange={(event) => set('emergencyMobile', event.target.value)} className={inputClass(Boolean(errors.emergencyMobile))} /></Field>
          </div>
        </fieldset>
        <p className="text-[11px] text-slate-500">Leave a whole address or the emergency contact empty if it is not known yet; clearing all its fields removes it.</p>
      </div>
    </HrmModal>
  );
}
