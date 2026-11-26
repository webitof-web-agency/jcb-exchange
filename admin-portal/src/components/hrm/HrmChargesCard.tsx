'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'react-toastify';
import { Loader2, MapPinned, Plus, RefreshCw } from 'lucide-react';
import { hrmApi, type HrmCharge, type HrmChargeList, type HrmChargeOptions, type HrmManagerAccessContext } from '@/lib/hrmApi';
import {
  createChargeForm, createManagerAccessForm, describeChargePeriod, toManagerAccessPayload, validateChargeForm,
  type ChargeDialogErrors,
} from '@/lib/hrmManagerAccess';
import { effectiveDateBounds, shiftDay } from '@/lib/hrmLifecycle';
import { getHrmErrorMessage } from '@/lib/hrmUi';
import HrmEmployeePicker, { type PickedEmployee } from './HrmEmployeePicker';
import HrmManagerAccessFields from './HrmManagerAccessFields';
import HrmModal from './HrmModal';

export type ChargeSubject =
  | { kind: 'employee'; id: string; name: string; employeeCode: string }
  | { kind: 'office'; id: string; name: string };

const STATE_CHIP: Record<HrmCharge['state'], { label: string; tone: string }> = {
  ACTIVE: { label: 'Running', tone: 'bg-emerald-50 text-emerald-700' },
  UPCOMING: { label: 'Upcoming', tone: 'bg-sky-50 text-sky-700' },
  ENDED: { label: 'Ended', tone: 'bg-slate-100 text-slate-500' },
  CANCELLED: { label: 'Cancelled', tone: 'bg-slate-100 text-slate-500' },
};

const input = 'h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100 disabled:bg-slate-50';
const cancelButton = 'inline-flex min-h-10 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 disabled:opacity-60';
const saveButton = 'inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-amber-400 px-4 text-sm font-bold text-slate-950 hover:bg-amber-500 disabled:opacity-60';
const rowButton = 'inline-flex min-h-8 items-center rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50';

/** What the access of a charge looks like, in words. */
const accessChip = (charge: HrmCharge) => {
  if (!charge.grantAccess) return { label: 'No access given', tone: 'bg-slate-100 text-slate-600' };
  if (charge.hasAccess) return { label: 'With access', tone: 'bg-violet-50 text-violet-700' };
  return charge.employee.hasLogin
    ? { label: 'Access missing', tone: 'bg-rose-50 text-rose-700' }
    : { label: 'Access after login', tone: 'bg-amber-50 text-amber-800' };
};

/**
 * Additional charges of one employee (on the profile) or of one state office (on the office page): who looks after a
 * state besides their own posting, for which days, with what access. Charges are ended, never deleted.
 */
export default function HrmChargesCard({
  subject, portal, canGive, refreshKey = 0, onChanged,
}: {
  subject: ChargeSubject;
  portal: 'admin' | 'employee';
  /** The page allows giving a new one (the server checks the rest). */
  canGive: boolean;
  /** Bumped by the page after a change elsewhere (a transfer or exit ends charges). */
  refreshKey?: number;
  onChanged?: () => void;
}) {
  const key = `${subject.kind}:${subject.id}`;
  const [loaded, setLoaded] = useState<{ key: string; data: HrmChargeList | null; error: string }>({ key: '', data: null, error: '' });
  const [reload, setReload] = useState(0);
  const [showHistory, setShowHistory] = useState(false);
  const [dialog, setDialog] = useState<{ type: 'give' } | { type: 'change'; charge: HrmCharge } | { type: 'end'; charge: HrmCharge } | null>(null);

  useEffect(() => {
    let cancelled = false;
    hrmApi.listCharges(subject.kind === 'employee' ? { employeeId: subject.id } : { officeUnitId: subject.id })
      .then((response) => { if (!cancelled) setLoaded({ key, data: response.data, error: '' }); })
      .catch((failure) => { if (!cancelled) setLoaded((current) => ({ key, data: current.key === key ? current.data : null, error: getHrmErrorMessage(failure, 'Additional charges could not be loaded.') })); });
    return () => { cancelled = true; };
  }, [key, subject.kind, subject.id, reload, refreshKey]);

  const data = loaded.key === key ? loaded.data : null;
  const error = loaded.key === key ? loaded.error : '';
  const current = useMemo(() => (data?.charges ?? []).filter((charge) => charge.state === 'ACTIVE' || charge.state === 'UPCOMING'), [data]);
  const history = useMemo(() => (data?.charges ?? []).filter((charge) => charge.state === 'ENDED' || charge.state === 'CANCELLED'), [data]);
  const mayGive = canGive && Boolean(data?.abilities.canGive);

  const done = useCallback((message: string) => {
    toast.success(message);
    setDialog(null);
    setReload((value) => value + 1);
    onChanged?.();
  }, [onChanged]);
  const close = useCallback(() => setDialog(null), []);

  // On a profile with nothing to show and nothing to do, the card stays out of the way.
  if (subject.kind === 'employee' && data && !data.charges.length && !mayGive) return null;

  const row = (charge: HrmCharge) => {
    const chip = STATE_CHIP[charge.state];
    const access = accessChip(charge);
    const open = charge.state === 'ACTIVE' || charge.state === 'UPCOMING';
    return (
      <li key={charge.id} className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2.5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
              {subject.kind === 'employee'
                ? <Link href={`/${portal}/hrm/organisation/offices/${encodeURIComponent(charge.office.id)}`} className="font-semibold text-slate-900 hover:text-amber-700">{charge.office.name}</Link>
                : <Link href={`/${portal}/hrm/${encodeURIComponent(charge.employee.id)}`} className="font-semibold text-slate-900 hover:text-amber-700">{charge.employee.name}</Link>}
              {subject.kind === 'office' ? <span className="text-xs text-slate-500">{charge.employee.employeeCode}</span> : null}
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${chip.tone}`}>{chip.label}</span>
              {open ? <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${access.tone}`}>{access.label}</span> : null}
            </p>
            <p className="mt-0.5 text-xs text-slate-600">{describeChargePeriod(charge)}</p>
            {charge.reason ? <p className="mt-0.5 text-xs text-slate-500">{charge.reason}</p> : null}
          </div>
          {open && charge.canManage ? (
            <div className="flex shrink-0 flex-wrap gap-1.5">
              <button type="button" onClick={() => setDialog({ type: 'change', charge })} className={rowButton}>Change last day</button>
              <button type="button" onClick={() => setDialog({ type: 'end', charge })} className={`${rowButton} text-rose-700 hover:bg-rose-50`}>{charge.state === 'UPCOMING' ? 'Cancel charge' : 'End'}</button>
            </div>
          ) : null}
        </div>
      </li>
    );
  };

  return (
    <section id="hrm-charges" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm" aria-labelledby="hrm-charges-title">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="hrm-charges-title" className="flex items-center gap-1.5 font-bold text-slate-950"><MapPinned className="h-4 w-4 text-amber-600" aria-hidden="true" />Additional charges</h2>
        {mayGive ? <button type="button" onClick={() => setDialog({ type: 'give' })} className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-bold text-slate-800 hover:bg-slate-50"><Plus className="h-3.5 w-3.5 text-amber-600" />Give additional charge</button> : null}
      </div>
      <p className="mt-1 text-xs leading-5 text-slate-500">{subject.kind === 'employee' ? 'State offices they look after besides their own posting. The posting, salary and reporting line stay as they are.' : 'People looking after this office besides their own posting, for example while it has no manager of its own.'}</p>
      {error ? (
        <p role="alert" className="mt-3 text-sm text-rose-600">{error} <button type="button" onClick={() => setReload((value) => value + 1)} className="ml-1 inline-flex items-center gap-1 font-semibold underline"><RefreshCw className="h-3.5 w-3.5" />Retry</button></p>
      ) : !data ? (
        <p className="mt-3 flex items-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />Loading…</p>
      ) : (
        <div className="mt-3 space-y-2">
          {current.length ? <ul className="space-y-2">{current.map(row)}</ul> : <p className="text-sm text-slate-500">No additional charge is running.</p>}
          {history.length ? (
            <div>
              <button type="button" onClick={() => setShowHistory((value) => !value)} aria-expanded={showHistory} className="text-xs font-semibold text-amber-700 hover:underline">{showHistory ? 'Hide history' : `Show history (${history.length})`}</button>
              {showHistory ? <ul className="mt-2 max-h-72 space-y-2 overflow-y-auto custom-scrollbar">{history.map(row)}</ul> : null}
            </div>
          ) : null}
        </div>
      )}
      {dialog?.type === 'give' && data ? <GiveChargeDialog subject={subject} today={data.today} onClose={close} onDone={done} /> : null}
      {dialog?.type === 'change' && data ? <ChangeEndDialog charge={dialog.charge} today={data.today} onClose={close} onDone={done} /> : null}
      {dialog?.type === 'end' && data ? <EndDialog charge={dialog.charge} today={data.today} onClose={close} onDone={done} /> : null}
    </section>
  );
}

function Footer({ busy, onClose, onSave, saveLabel, disabled = false, danger = false }: { busy: boolean; onClose: () => void; onSave: () => void; saveLabel: string; disabled?: boolean; danger?: boolean }) {
  return (
    <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:justify-end">
      <button type="button" onClick={onClose} disabled={busy} className={cancelButton}>Close</button>
      <button type="button" onClick={onSave} disabled={busy || disabled} className={danger ? 'inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-rose-600 px-4 text-sm font-bold text-white hover:bg-rose-700 disabled:opacity-60' : saveButton}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}{saveLabel}
      </button>
    </div>
  );
}

function FieldError({ message }: { message?: string | undefined }) {
  return message ? <p role="alert" className="mt-1 text-xs font-medium text-rose-600">{message}</p> : null;
}

/** "Until it is ended" or a last day. */
function EndDayFields({ openEnded, value, min, onOpenEnded, onValue, error, disabled }: { openEnded: boolean; value: string; min: string; onOpenEnded: (value: boolean) => void; onValue: (value: string) => void; error?: string | undefined; disabled?: boolean }) {
  return (
    <div className="space-y-2">
      <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-800">
        <input type="checkbox" checked={openEnded} disabled={disabled} onChange={(event) => onOpenEnded(event.target.checked)} className="h-4 w-4 rounded accent-amber-500" />
        Until I end it (no last day yet)
      </label>
      {!openEnded ? (
        <label className="block text-sm font-medium text-slate-700">Last day (included)
          <input type="date" value={value} min={min} disabled={disabled} onChange={(event) => onValue(event.target.value)} aria-invalid={Boolean(error)} className={`mt-1 ${input}`} />
        </label>
      ) : null}
      <FieldError message={error} />
    </div>
  );
}

function GiveChargeDialog({ subject, today, onClose, onDone }: { subject: ChargeSubject; today: string; onClose: () => void; onDone: (message: string) => void }) {
  const [form, setForm] = useState(() => createChargeForm(today, subject.kind === 'employee' ? { employeeId: subject.id } : { officeId: subject.id }));
  const [picked, setPicked] = useState<PickedEmployee | null>(null);
  const [options, setOptions] = useState<HrmChargeOptions | null>(null);
  const [optionsError, setOptionsError] = useState('');
  const [accessForm, setAccessForm] = useState(createManagerAccessForm);
  const [accessContext, setAccessContext] = useState<HrmManagerAccessContext | null>(null);
  const [accessReady, setAccessReady] = useState(true);
  const [optionsReload, setOptionsReload] = useState(0);
  const [errors, setErrors] = useState<ChargeDialogErrors>({});
  const [submitError, setSubmitError] = useState('');
  const [saving, setSaving] = useState(false);
  const bounds = effectiveDateBounds(today, true);

  useEffect(() => {
    if (subject.kind !== 'employee') return undefined;
    let cancelled = false;
    hrmApi.getChargeOptions(subject.id)
      .then((response) => { if (!cancelled) { setOptions(response.data); setOptionsError(''); } })
      .catch((failure) => { if (!cancelled) setOptionsError(getHrmErrorMessage(failure, 'The state offices could not be loaded.')); });
    return () => { cancelled = true; };
  }, [subject.kind, subject.id, optionsReload]);

  const update = <K extends keyof typeof form>(field: K, value: (typeof form)[K]) => {
    setForm((current) => ({ ...current, [field]: value }));
    setErrors((current) => (current[field as keyof ChargeDialogErrors] ? { ...current, [field]: undefined } : current));
    setSubmitError('');
  };

  const submit = async () => {
    if (saving || !accessReady) return;
    const found = validateChargeForm(form, today);
    setErrors(found);
    if (Object.keys(found).length) return;
    setSaving(true);
    setSubmitError('');
    try {
      const access = toManagerAccessPayload(accessForm, accessContext, 'charge');
      const response = await hrmApi.createCharge(form.officeId, {
        employeeId: form.employeeId,
        effectiveFrom: form.effectiveFrom,
        effectiveTo: form.openEnded ? null : form.effectiveTo,
        ...(form.reason.trim() ? { reason: form.reason.trim() } : {}),
        ...(access ? { access } : {}),
      });
      const extra = [
        response.data.accessGiven ? 'State access given.' : '',
        response.data.accessPending ? 'Access will be created when a login is linked.' : '',
        response.data.roleChanged ? 'Login role changed.' : '',
      ].filter(Boolean).join(' ');
      onDone(`Additional charge given.${extra ? ` ${extra}` : ''}`);
    } catch (failure) {
      setSubmitError(getHrmErrorMessage(failure, 'The charge could not be given. Nothing was changed.'));
    } finally {
      setSaving(false);
    }
  };

  const notEligible = subject.kind === 'employee' && options && !options.eligible;
  const noOffice = subject.kind === 'employee' && options && options.eligible && !options.offices.length;

  return (
    <HrmModal
      title={subject.kind === 'employee' ? `Additional charge for ${subject.name}` : `Additional charge of ${subject.name}`}
      description="Their own posting does not change. The office counts as covered, and access (if ticked) runs for exactly these days."
      onClose={onClose}
      busy={saving}
      size="lg"
      error={submitError}
      footer={<Footer busy={saving} onClose={onClose} onSave={() => void submit()} saveLabel={saving ? 'Giving…' : 'Give charge'} disabled={Boolean(notEligible || noOffice || !accessReady)} />}
    >
      <div className="space-y-4">
        {subject.kind === 'employee' ? (
          <div>
            <label htmlFor="hrm-charge-office" className="block text-sm font-medium text-slate-700">State office *</label>
            <select id="hrm-charge-office" value={form.officeId} disabled={saving || !options} onChange={(event) => { update('officeId', event.target.value); setAccessForm(createManagerAccessForm()); }} className={`mt-1 ${input}`}>
              <option value="">{options ? 'Choose the state office' : optionsError ? 'Not loaded' : 'Loading…'}</option>
              {(options?.offices ?? []).map((office) => <option key={office.id} value={office.id}>{office.name}</option>)}
            </select>
            {optionsError ? <p role="alert" className="mt-1 text-xs text-rose-600">{optionsError} <button type="button" onClick={() => { setOptionsError(''); setOptionsReload((value) => value + 1); }} className="font-semibold underline">Try again</button></p> : null}
            {notEligible ? <p className="mt-1 text-xs text-rose-600">Only somebody who is working can hold a charge.</p> : null}
            {noOffice ? <p className="mt-1 text-xs text-slate-500">There is no state office left to give: they already hold or work at every office you can manage.</p> : null}
            <FieldError message={errors.officeId} />
          </div>
        ) : (
          <div>
            <label htmlFor="hrm-charge-person" className="mb-1 block text-sm font-medium text-slate-700">Employee *</label>
            <HrmEmployeePicker id="hrm-charge-person" ariaLabel="Employee to hold the charge" value={picked} invalid={Boolean(errors.employeeId)} onChange={(employee) => { setPicked(employee); update('employeeId', employee?.id ?? ''); setAccessForm(createManagerAccessForm()); }} />
            <FieldError message={errors.employeeId} />
          </div>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm font-medium text-slate-700">First day *
            <input type="date" value={form.effectiveFrom} min={bounds.min} max={bounds.max} disabled={saving} onChange={(event) => update('effectiveFrom', event.target.value)} aria-invalid={Boolean(errors.effectiveFrom)} className={`mt-1 ${input}`} />
            <FieldError message={errors.effectiveFrom} />
          </label>
          <EndDayFields openEnded={form.openEnded} value={form.effectiveTo} min={form.effectiveFrom > today ? form.effectiveFrom : today} onOpenEnded={(value) => update('openEnded', value)} onValue={(value) => update('effectiveTo', value)} error={errors.effectiveTo} disabled={saving} />
        </div>
        <HrmManagerAccessFields employeeId={form.officeId && form.employeeId ? form.employeeId : null} officeUnitId={form.officeId || null} value={accessForm} onChange={setAccessForm} onContext={setAccessContext} onReady={setAccessReady} mode="charge" futureDated={form.effectiveFrom > today} disabled={saving} />
        <label className="block text-sm font-medium text-slate-700">Reason
          <textarea value={form.reason} maxLength={500} rows={2} disabled={saving} onChange={(event) => update('reason', event.target.value)} placeholder="Optional. Kept in the history." className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100" />
        </label>
      </div>
    </HrmModal>
  );
}

function ChangeEndDialog({ charge, today, onClose, onDone }: { charge: HrmCharge; today: string; onClose: () => void; onDone: (message: string) => void }) {
  const min = charge.effectiveFrom > today ? charge.effectiveFrom : today;
  const [openEnded, setOpenEnded] = useState(!charge.effectiveTo);
  const [value, setValue] = useState(charge.effectiveTo ?? '');
  const [error, setError] = useState('');
  const [submitError, setSubmitError] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (saving) return;
    if (!openEnded && (!value || value < min)) { setError(`Choose a last day on or after ${min}.`); return; }
    setSaving(true);
    setSubmitError('');
    try {
      await hrmApi.changeChargeEnd(charge.id, openEnded ? null : value);
      onDone('Last day saved.');
    } catch (failure) {
      setSubmitError(getHrmErrorMessage(failure, 'The last day could not be changed.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <HrmModal title="Change the last day" description={`${charge.employee.name} · ${charge.office.name}. ${describeChargePeriod(charge)}.`} onClose={onClose} busy={saving} size="sm" error={submitError}
      footer={<Footer busy={saving} onClose={onClose} onSave={() => void submit()} saveLabel={saving ? 'Saving…' : 'Save'} />}>
      <EndDayFields openEnded={openEnded} value={value} min={min} onOpenEnded={(next) => { setOpenEnded(next); setError(''); }} onValue={(next) => { setValue(next); setError(''); }} error={error} disabled={saving} />
      <p className="mt-3 text-xs leading-5 text-slate-500">The access of this charge moves with its last day.</p>
    </HrmModal>
  );
}

function EndDialog({ charge, today, onClose, onDone }: { charge: HrmCharge; today: string; onClose: () => void; onDone: (message: string) => void }) {
  const upcoming = charge.state === 'UPCOMING';
  const [mode, setMode] = useState<'now' | 'later'>('now');
  const [lastDay, setLastDay] = useState(today);
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [submitError, setSubmitError] = useState('');
  const [saving, setSaving] = useState(false);
  const max = charge.effectiveTo ?? shiftDay(today, 365);

  const submit = async () => {
    if (saving) return;
    if (!upcoming && mode === 'later' && (!lastDay || lastDay < today || lastDay > max)) { setError(`Choose a day from ${today} to ${max}.`); return; }
    setSaving(true);
    setSubmitError('');
    try {
      const response = await hrmApi.endCharge(charge.id, {
        ...(!upcoming && mode === 'later' ? { lastDay } : {}),
        ...(reason.trim() ? { reason: reason.trim() } : {}),
      });
      onDone(response.data.cancelled ? 'Charge cancelled.' : 'Charge ended.');
    } catch (failure) {
      setSubmitError(getHrmErrorMessage(failure, 'The charge could not be ended.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <HrmModal title={upcoming ? 'Cancel this charge' : 'End this charge'} description={`${charge.employee.name} · ${charge.office.name}. ${describeChargePeriod(charge)}.`} onClose={onClose} busy={saving} size="sm" error={submitError}
      footer={<Footer busy={saving} onClose={onClose} onSave={() => void submit()} saveLabel={saving ? 'Ending…' : upcoming ? 'Cancel charge' : 'End charge'} danger />}>
      <div className="space-y-3 text-sm">
        {upcoming ? <p className="text-slate-600">It has not started, so it will never take effect and no access is given. The record stays in the history.</p> : (
          <fieldset className="space-y-2">
            <legend className="sr-only">When it ends</legend>
            <label className="flex cursor-pointer items-start gap-2"><input type="radio" name="hrm-charge-end" checked={mode === 'now'} onChange={() => setMode('now')} className="mt-0.5 accent-amber-500" /><span><span className="block font-semibold text-slate-900">Stop now</span><span className="block text-xs text-slate-500">The charge and its access stop today.</span></span></label>
            <label className="flex cursor-pointer items-start gap-2"><input type="radio" name="hrm-charge-end" checked={mode === 'later'} onChange={() => setMode('later')} className="mt-0.5 accent-amber-500" /><span><span className="block font-semibold text-slate-900">After a day I choose</span><span className="block text-xs text-slate-500">That day is the last one.</span></span></label>
            {mode === 'later' ? <input type="date" aria-label="Last day" value={lastDay} min={today} max={max} onChange={(event) => { setLastDay(event.target.value); setError(''); }} className={input} /> : null}
            <FieldError message={error} />
          </fieldset>
        )}
        <label className="block text-xs font-semibold text-slate-700">Reason (optional)
          <input value={reason} maxLength={500} onChange={(event) => setReason(event.target.value)} className={`mt-1 ${input}`} />
        </label>
        <p className="text-xs leading-5 text-slate-500">If nobody else manages {charge.office.name}, it shows as vacant afterwards.</p>
      </div>
    </HrmModal>
  );
}
