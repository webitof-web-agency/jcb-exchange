'use client';

import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Copy, Eye, EyeOff, Loader2, RefreshCw, ShieldCheck } from 'lucide-react';
import HrmModal from './HrmModal';
import HrmLoginPicker from './HrmLoginPicker';
import { hrmApi, type HrmConfirmJoiningResult, type HrmJoiningContext } from '@/lib/hrmApi';
import { generateTemporaryPassword, sanitiseMobileInput } from '@/lib/hrmOnboarding';
import { NO_GRANTABLE_ROLE_MESSAGE } from '@/lib/hrmAccess';
import {
  JOINING_LOGIN_LABELS,
  buildConfirmJoiningPayload,
  createJoiningForm,
  joiningErrorsFromServer,
  loginModeBlock,
  scopeBlock,
  scopeKey,
  validateJoiningForm,
  type JoiningErrors,
  type JoiningForm,
  type JoiningLoginMode,
} from '@/lib/hrmJoining';
import { formatHrmDate, formatHrmStatus, getHrmErrorMessage } from '@/lib/hrmUi';

const input = 'mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-400/20 disabled:bg-slate-50 disabled:text-slate-500';
const label = 'block text-xs font-semibold text-slate-700';
const errorText = 'mt-1 text-xs font-medium text-rose-600';

type Props = {
  employeeId: string;
  onClose: () => void;
  onDone: (result: HrmConfirmJoiningResult) => void | Promise<void>;
};

/**
 * Confirm joining: the actual joining date, the login (made by HR), the HRM access suggested by the placement (HR
 * ticks what to give) and, if the checklist is not complete, the reason to confirm anyway.
 */
export default function HrmConfirmJoiningDialog({ employeeId, onClose, onDone }: Props) {
  const [context, setContext] = useState<HrmJoiningContext | null>(null);
  const [loadError, setLoadError] = useState('');
  const [reload, setReload] = useState(0);
  const [form, setForm] = useState<JoiningForm | null>(null);
  const [baseline, setBaseline] = useState<JoiningForm | null>(null);
  const [errors, setErrors] = useState<JoiningErrors>({});
  const [serverError, setServerError] = useState('');
  const [saving, setSaving] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [result, setResult] = useState<{ result: HrmConfirmJoiningResult; password: string | null } | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    hrmApi.getJoiningContext(employeeId)
      .then((response) => {
        if (cancelled) return;
        const next = response.data.context;
        setContext(next);
        // A reload (the checklist or the record changed on the server) keeps what HR already typed.
        setForm((current) => current ?? createJoiningForm(next));
        setBaseline((current) => current ?? createJoiningForm(next));
        setLoadError('');
      })
      .catch((error) => { if (!cancelled) setLoadError(getHrmErrorMessage(error, 'The joining details could not be loaded.')); });
    return () => { cancelled = true; };
  }, [employeeId, reload]);

  const dirty = useMemo(() => Boolean(form && baseline && JSON.stringify(form) !== JSON.stringify(baseline)), [form, baseline]);
  const update = <K extends keyof JoiningForm>(key: K, value: JoiningForm[K]) => {
    setForm((current) => (current ? { ...current, [key]: value } : current));
    setErrors((current) => ({ ...current, [key]: undefined }));
    setServerError('');
  };

  const chooseMode = (mode: JoiningLoginMode) => {
    if (!context) return;
    setForm((current) => {
      if (!current) return current;
      // Access needs a login: leaving "no login" re-ticks the recommended access (that can be given).
      const scopeKeys = mode === 'NONE' ? [] : current.loginMode === 'NONE'
        ? context.suggestedScopes.filter((scope) => scope.recommended && !scopeBlock(scope, context.abilities, mode)).map(scopeKey)
        : current.scopeKeys;
      return { ...current, loginMode: mode, scopeKeys };
    });
    setErrors({});
    setServerError('');
  };

  const submit = async () => {
    if (!context || !form || saving) return;
    const found = validateJoiningForm(form, context);
    setErrors(found);
    if (Object.keys(found).length) return;
    setSaving(true);
    setServerError('');
    try {
      const response = await hrmApi.confirmJoining(employeeId, buildConfirmJoiningPayload(form, context));
      setResult({ result: response.data.result, password: form.loginMode === 'CREATE' ? form.password : form.loginMode === 'KEEP' && form.keepSetPassword ? form.keepPassword : null });
      // The password is shown once in the result panel; the form copy is cleared.
      setForm((current) => (current ? { ...current, password: '', keepPassword: '' } : current));
    } catch (error) {
      const mapped = joiningErrorsFromServer(error);
      setErrors((current) => ({ ...current, ...mapped.fields }));
      const status = (error as { response?: { status?: number; data?: { code?: string } } })?.response;
      if (status?.data?.code === 'CHECKLIST_INCOMPLETE' || status?.status === 409 && /changed a moment ago/i.test(mapped.banner ?? '')) {
        // Checklist / version moved on the server: reload the context so the dialog shows the current state.
        setServerError(mapped.banner ?? 'This record changed. The latest details were loaded; check and confirm again.');
        setReload((value) => value + 1);
      } else {
        setServerError(mapped.banner ?? (Object.keys(mapped.fields).length ? '' : getHrmErrorMessage(error, 'The joining could not be confirmed.')));
      }
    } finally {
      setSaving(false);
    }
  };

  const copyPassword = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  const finish = () => {
    if (result) void onDone(result.result);
    else onClose();
  };

  if (result) {
    return (
      <HrmModal title="Joining confirmed" description={`${result.result.employeeCode} is now active.`} onClose={finish} lockDismiss={Boolean(result.password)} size="md"
        footer={<button type="button" onClick={finish} className="inline-flex min-h-10 items-center rounded-xl bg-slate-900 px-4 text-sm font-bold text-white hover:bg-slate-800">Done</button>}>
        <div className="space-y-3 text-sm">
          <p className="flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2 font-semibold text-emerald-800"><CheckCircle2 className="h-4 w-4" /> Status is Active, the onboarding case is completed and the recruitment application is marked Hired.</p>
          {result.result.loginEmail ? <p><span className="text-slate-500">Login:</span> <span className="font-semibold text-slate-900">{result.result.loginEmail}</span></p> : <p className="text-slate-600">No login was made. Create or link one later from the profile.</p>}
          {result.password ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
              <p className="text-xs font-semibold text-amber-900">Temporary password (shown only now; share it securely and ask them to change it):</p>
              <div className="mt-2 flex items-center gap-2"><code className="rounded-lg bg-white px-2 py-1 font-mono text-sm text-slate-900">{result.password}</code><button type="button" onClick={() => void copyPassword(result.password!)} className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-amber-300 bg-white px-2 text-xs font-bold text-amber-800"><Copy className="h-3.5 w-3.5" /> {copied ? 'Copied' : 'Copy'}</button></div>
            </div>
          ) : null}
          <p className="text-slate-600">{result.result.scopesGranted ? `${result.result.scopesGranted} HRM access item(s) given.` : 'No HRM access was given (they see their own record only).'}</p>
          {result.result.welcome?.requested ? (
            <p className="rounded-xl bg-sky-50 px-3 py-2 text-sky-800">The welcome message was requested: it goes out by email, WhatsApp and SMS, as each is switched on in Settings. Check the message logs if it does not arrive.</p>
          ) : null}
        </div>
      </HrmModal>
    );
  }

  const busy = saving;
  return (
    <HrmModal title="Confirm joining" description="Record the day they joined, make their login and give the access their role needs." onClose={onClose} busy={busy} lockDismiss={busy || dirty} size="lg" error={serverError}
      footer={(
        <div className="flex w-full flex-wrap items-center justify-end gap-2">
          <button type="button" onClick={onClose} disabled={busy} className="inline-flex min-h-10 items-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-60">Cancel</button>
          <button type="button" onClick={() => void submit()} disabled={busy || !context?.canBeConfirmed || !form} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-emerald-600 px-4 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-60">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Confirm joining</button>
        </div>
      )}>
      {loadError ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{loadError} <button type="button" onClick={() => { setLoadError(''); setReload((value) => value + 1); }} className="ml-2 inline-flex items-center gap-1 font-semibold underline"><RefreshCw className="h-3.5 w-3.5" /> Try again</button></div>
      ) : !context || !form ? (
        <div className="flex items-center gap-2 py-8 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading the joining details…</div>
      ) : (
        <div className="space-y-5">
          {!context.canBeConfirmed ? <p className="rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-600">{context.employee.employeeCode} is {formatHrmStatus(context.employee.status).toLowerCase()}: there is no joining to confirm.</p> : null}
          <section className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
            <p className="font-semibold text-slate-900">{context.employee.name} <span className="font-normal text-slate-500">· {context.employee.employeeCode}</span></p>
            {context.placement ? (
              <p className="mt-1 text-slate-600">{[context.placement.designation, context.placement.department, context.placement.office?.name, context.placement.state?.name].filter(Boolean).join(' · ')}{context.placement.isOfficeManager ? ' · State Manager' : ''}</p>
            ) : <p className="mt-1 text-amber-700">No assignment yet: add one on the profile before or after confirming.</p>}
            <p className="mt-1 text-slate-600">Planned joining: {formatHrmDate(context.employee.plannedJoiningDate)}</p>
            <div className="mt-2">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-600"><span>Joining checklist</span><span>{context.progress.done} / {context.progress.total}</span></div>
              <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-200"><div className="h-full rounded-full bg-emerald-500" style={{ width: `${context.progress.percent}%` }} /></div>
              {context.progress.missingRequired.length ? (
                <ul className="mt-2 list-disc space-y-0.5 pl-5 text-xs text-amber-800">
                  {context.checklist.filter((item) => item.required && item.counted && item.state !== 'DONE').map((item) => <li key={item.key}>{item.label}: {item.hint}</li>)}
                </ul>
              ) : <p className="mt-2 text-xs font-semibold text-emerald-700">Everything required is done.</p>}
            </div>
          </section>

          {context.progress.missingRequired.length ? (
            <label className={label} htmlFor="hrm-joining-override">Reason to confirm with an open checklist *
              <textarea id="hrm-joining-override" rows={2} value={form.overrideReason} disabled={busy} onChange={(event) => update('overrideReason', event.target.value)} className={input} placeholder="For example: bank details will be added in the first week." />
              {errors.overrideReason ? <span className={errorText}>{errors.overrideReason}</span> : null}
            </label>
          ) : null}

          <label className={label} htmlFor="hrm-joining-date">Joining date *
            <input id="hrm-joining-date" type="date" max={context.today} value={form.joiningDate} disabled={busy} onChange={(event) => update('joiningDate', event.target.value)} className={input} />
            <span className="mt-1 block text-[11px] font-normal text-slate-500">The day they actually started. If it differs from the plan, their assignment, salary and shift move to this day.</span>
            {errors.joiningDate ? <span className={errorText}>{errors.joiningDate}</span> : null}
          </label>

          <fieldset>
            <legend className="text-sm font-bold text-slate-900">Login</legend>
            {errors.loginMode ? <p className={errorText}>{errors.loginMode}</p> : null}
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {(['KEEP', 'CREATE', 'LINK', 'NONE'] as const).filter((mode) => mode !== 'KEEP' || context.login).map((mode) => {
                const block = loginModeBlock(mode, context);
                return (
                  <label key={mode} className={`flex cursor-pointer items-start gap-2 rounded-xl border p-3 text-sm ${form.loginMode === mode ? 'border-amber-400 bg-amber-50/60' : 'border-slate-200'} ${block ? 'cursor-not-allowed opacity-60' : ''}`}>
                    <input type="radio" name="hrm-joining-login" checked={form.loginMode === mode} disabled={Boolean(block) || busy} onChange={() => chooseMode(mode)} className="mt-0.5" />
                    <span><span className="font-semibold text-slate-900">{JOINING_LOGIN_LABELS[mode]}</span>{block ? <span className="block text-xs text-slate-500">{block}</span> : null}</span>
                  </label>
                );
              })}
            </div>

            {form.loginMode === 'CREATE' ? (
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label className={label} htmlFor="hrm-joining-email">Work email *
                  <input id="hrm-joining-email" type="email" autoComplete="off" value={form.email} disabled={busy} onChange={(event) => update('email', event.target.value)} className={input} placeholder="name@company.com" />
                  <span className="mt-1 block text-[11px] font-normal text-slate-500">Their company email: they sign in with it.</span>
                  {errors.email ? <span className={errorText}>{errors.email}</span> : null}
                </label>
                <label className={label} htmlFor="hrm-joining-mobile">Mobile
                  <input id="hrm-joining-mobile" inputMode="tel" value={form.mobile} disabled={busy} onChange={(event) => update('mobile', sanitiseMobileInput(event.target.value))} className={input} />
                  {errors.mobile ? <span className={errorText}>{errors.mobile}</span> : null}
                </label>
                <label className={label} htmlFor="hrm-joining-password">Temporary password *
                  <span className="mt-1 flex gap-2">
                    <input id="hrm-joining-password" type={showPassword ? 'text' : 'password'} autoComplete="new-password" value={form.password} disabled={busy} onChange={(event) => update('password', event.target.value)} className={`${input} mt-0`} />
                    <button type="button" aria-label={showPassword ? 'Hide password' : 'Show password'} onClick={() => setShowPassword((value) => !value)} className="rounded-xl border border-slate-200 px-2 text-slate-600">{showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>
                    <button type="button" disabled={busy} onClick={() => { update('password', generateTemporaryPassword()); setShowPassword(true); }} className="whitespace-nowrap rounded-xl border border-slate-200 px-2 text-xs font-bold text-slate-700">Generate</button>
                  </span>
                  {errors.password ? <span className={errorText}>{errors.password}</span> : null}
                </label>
                <label className={label} htmlFor="hrm-joining-role">Permission role
                  <select id="hrm-joining-role" value={form.roleId} disabled={busy} onChange={(event) => update('roleId', event.target.value)} className={input}>
                    <option value="">No role (only their own self-service)</option>
                    {context.roles.map((role) => <option key={role.id} value={role.id}>{role.name}{role.id === context.suggestedRoleId ? ' (suggested)' : ''}</option>)}
                  </select>
                  {!context.roles.length ? <span className="mt-1 block text-[11px] font-normal text-slate-500">{NO_GRANTABLE_ROLE_MESSAGE}</span> : null}
                </label>
              </div>
            ) : null}

            {form.loginMode === 'LINK' ? (
              <div className="mt-3">
                <HrmLoginPicker idPrefix="hrm-joining-link" selected={form.linkUser} onSelect={(user) => update('linkUser', user)} onClear={() => update('linkUser', null)} disabled={busy} error={errors.linkUser} />
              </div>
            ) : null}

            {form.loginMode === 'KEEP' && context.login ? (
              <div className="mt-3 space-y-2 rounded-xl border border-slate-200 p-3 text-sm">
                <p className="text-slate-700">{context.login.email || 'No email'} · {formatHrmStatus(context.login.status)} · {context.login.customRole?.name ?? 'No role'}</p>
                {context.login.status !== 'ACTIVE' ? (
                  <label className="flex items-center gap-2"><input type="checkbox" checked={form.keepReactivate} disabled={busy || !context.abilities.canUpdateLogin} onChange={(event) => update('keepReactivate', event.target.checked)} /> Switch the login on</label>
                ) : null}
                <label className="flex items-center gap-2"><input type="checkbox" checked={form.keepSetPassword} disabled={busy || !context.abilities.canUpdateLogin} onChange={(event) => update('keepSetPassword', event.target.checked)} /> Set a new password</label>
                {form.keepSetPassword ? (
                  <div className="flex gap-2">
                    <input aria-label="New password" type={showPassword ? 'text' : 'password'} autoComplete="new-password" value={form.keepPassword} disabled={busy} onChange={(event) => update('keepPassword', event.target.value)} className={`${input} mt-0`} />
                    <button type="button" disabled={busy} onClick={() => { update('keepPassword', generateTemporaryPassword()); setShowPassword(true); }} className="whitespace-nowrap rounded-xl border border-slate-200 px-2 text-xs font-bold text-slate-700">Generate</button>
                  </div>
                ) : null}
                {errors.keepPassword ? <p className={errorText}>{errors.keepPassword}</p> : null}
                <label className="flex items-center gap-2"><input type="checkbox" checked={form.keepChangeRole} disabled={busy || !context.abilities.canUpdateLogin} onChange={(event) => update('keepChangeRole', event.target.checked)} /> Change the permission role</label>
                {form.keepChangeRole ? (
                  <select aria-label="Permission role" value={form.keepRoleId} disabled={busy} onChange={(event) => update('keepRoleId', event.target.value)} className={input}>
                    <option value="">No role</option>
                    {context.roles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}
                  </select>
                ) : null}
                {form.keepChangeRole && !context.roles.length ? <p className="text-xs text-slate-500">{NO_GRANTABLE_ROLE_MESSAGE}</p> : null}
                {!context.abilities.canUpdateLogin ? <p className="text-xs text-slate-500">Changing the login (switching on, password, role) needs the users.update permission.</p> : null}
              </div>
            ) : null}

            {form.loginMode === 'NONE' ? (
              <label className={`${label} mt-3`} htmlFor="hrm-joining-none">Why no login now? *
                <textarea id="hrm-joining-none" rows={2} value={form.noneReason} disabled={busy} onChange={(event) => update('noneReason', event.target.value)} className={input} />
                {errors.noneReason ? <span className={errorText}>{errors.noneReason}</span> : null}
              </label>
            ) : null}
          </fieldset>

          <fieldset>
            <legend className="flex items-center gap-1.5 text-sm font-bold text-slate-900"><ShieldCheck className="h-4 w-4 text-amber-600" /> HRM access</legend>
            <p className="mt-1 text-xs text-slate-500">Everyone sees their own record. Tick what their role needs on top of that; nothing is given unless ticked.</p>
            <div className="mt-2 space-y-2">
              {context.suggestedScopes.map((scope) => {
                const key = scopeKey(scope);
                const block = scopeBlock(scope, context.abilities, form.loginMode);
                return (
                  <label key={key} className={`flex items-start gap-2 rounded-xl border border-slate-200 p-3 text-sm ${block ? 'opacity-60' : ''}`}>
                    <input type="checkbox" className="mt-0.5" disabled={Boolean(block) || busy} checked={!block && form.scopeKeys.includes(key)} onChange={(event) => update('scopeKeys', event.target.checked ? [...form.scopeKeys, key] : form.scopeKeys.filter((value) => value !== key))} />
                    <span>
                      <span className="font-semibold text-slate-900">{scope.label}</span>
                      {scope.source === 'PLACEMENT' ? <span className="ml-2 rounded-full bg-sky-50 px-2 py-0.5 text-[10px] font-bold text-sky-700">Follows their office</span> : null}
                      {scope.recommended ? <span className="ml-2 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">Suggested</span> : null}
                      <span className="block text-xs text-slate-500">{block ?? scope.reason}</span>
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>

          <label className="flex items-start gap-2 rounded-xl border border-slate-200 p-3 text-sm" htmlFor="hrm-joining-welcome">
            <input id="hrm-joining-welcome" type="checkbox" className="mt-0.5" checked={form.sendWelcome} disabled={busy} onChange={(event) => update('sendWelcome', event.target.checked)} />
            <span>
              <span className="font-semibold text-slate-900">Send a welcome message to the employee (email / WhatsApp / SMS, as switched on in Settings)</span>
              <span className="block text-xs text-slate-500">Sent once, after the joining is confirmed. Leave it unticked to welcome them yourself.</span>
            </span>
          </label>
        </div>
      )}
    </HrmModal>
  );
}
