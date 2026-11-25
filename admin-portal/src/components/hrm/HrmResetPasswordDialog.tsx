'use client';

import { useEffect, useRef, useState } from 'react';
import { AlertCircle, Check, Copy, Eye, EyeOff, KeyRound, Loader2, RefreshCw } from 'lucide-react';
import { hrmApi } from '@/lib/hrmApi';
import { validateLoginPassword } from '@/lib/hrmLogin';
import { buildLoginDetailsText, generateTemporaryPassword } from '@/lib/hrmOnboarding';
import { getHrmErrorMessage } from '@/lib/hrmUi';
import HrmModal from './HrmModal';

type Copied = 'password' | 'details' | null;

/**
 * Sets a new login password for an employee (for example when they lost the temporary one). The server ends every
 * session of that login, so the old password stops working everywhere. The new password is held only in this
 * component's state: it is shown once after saving and is gone when the dialog closes.
 */
export default function HrmResetPasswordDialog({ employee, ownLogin = false, onClose }: {
  employee: { id: string; employeeCode: string; name: string; loginEmail: string | null };
  /** True when the login being changed is the signed-in user's own: they will be signed out too. */
  ownLogin?: boolean;
  onClose: () => void;
}) {
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [fieldError, setFieldError] = useState('');
  const [savedPassword, setSavedPassword] = useState<string | null>(null);
  const [copied, setCopied] = useState<Copied>(null);
  const resultRef = useRef<HTMLDivElement | null>(null);
  const copyTimer = useRef<number | null>(null);

  // After saving, the form is replaced by the result panel: move focus there so keyboard users are not left behind.
  useEffect(() => {
    if (savedPassword !== null) resultRef.current?.focus();
  }, [savedPassword]);

  useEffect(() => () => { if (copyTimer.current !== null) window.clearTimeout(copyTimer.current); }, []);

  const generate = () => {
    setPassword(generateTemporaryPassword());
    setShow(true);
    setFieldError('');
    setError('');
  };

  const submit = async (event?: React.FormEvent) => {
    event?.preventDefault();
    if (saving) return;
    const problem = validateLoginPassword(password);
    if (problem) { setFieldError(problem); document.getElementById('hrm-reset-password')?.focus(); return; }
    setSaving(true);
    setError('');
    setFieldError('');
    try {
      await hrmApi.resetLoginPassword(employee.id, password);
      setSavedPassword(password);
      setPassword('');
      setShow(false);
    } catch (requestError) {
      // The typed password stays so it can be corrected; the server's reason is shown next to the buttons.
      setError(getHrmErrorMessage(requestError, 'Unable to reset the password. Nothing was changed.'));
    } finally {
      setSaving(false);
    }
  };

  const copy = async (text: string, what: Exclude<Copied, null>) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
      if (copyTimer.current !== null) window.clearTimeout(copyTimer.current);
      copyTimer.current = window.setTimeout(() => setCopied(null), 2000);
    } catch {
      setError('Copy was blocked by the browser. Select the password and copy it by hand.');
    }
  };

  const done = savedPassword !== null;
  const detailsText = done
    ? buildLoginDetailsText({ employeeCode: employee.employeeCode, name: employee.name, email: employee.loginEmail ?? '', password: savedPassword, portalUrl: window.location.origin })
    : '';

  return (
    <HrmModal
      title={done ? 'Password changed' : 'Reset login password'}
      description={done
        ? `${employee.name} (${employee.employeeCode}) must sign in with the new password.`
        : `Set a new password for ${employee.name} (${employee.employeeCode}). They are signed out everywhere and must use this password.`}
      onClose={onClose}
      busy={saving}
      // The new password is shown once: Escape or a stray click must not throw it (or a typed one) away. Done / Cancel / X still close.
      lockDismiss={done || Boolean(password)}
      size="md"
      footer={(
        <div className="flex w-full flex-col gap-3">
          {error ? <p role="alert" className="flex items-start gap-2 rounded-lg bg-rose-50 px-3 py-2.5 text-xs font-medium text-rose-700"><AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />{error}</p> : null}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            {done ? (
              <button type="button" onClick={onClose} className="h-10 rounded-xl bg-slate-950 px-5 text-sm font-bold text-white hover:bg-slate-800">Done</button>
            ) : (
              <>
                <button type="button" onClick={onClose} disabled={saving} className="h-10 rounded-xl border border-slate-200 px-5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60">Cancel</button>
                <button type="submit" form="hrm-reset-password-form" disabled={saving || !password} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-amber-400 px-5 text-sm font-bold text-slate-950 shadow-sm hover:bg-amber-300 disabled:opacity-60">
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}{saving ? 'Saving…' : 'Reset password'}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    >
      {done ? (
        <div ref={resultRef} tabIndex={-1} className="space-y-4 outline-none">
          <p className="rounded-lg bg-emerald-50 px-3 py-2.5 text-xs font-medium text-emerald-800">
            Saved. Every old session of this login has ended{ownLogin ? ', including yours: you will be asked to sign in again' : ''}. This is the only time the password is shown.
          </p>
          <dl className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
            <div className="flex justify-between gap-3"><dt className="text-slate-500">Employee ID</dt><dd className="font-medium text-slate-900">{employee.employeeCode}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-slate-500">Login email</dt><dd className="min-w-0 truncate font-medium text-slate-900">{employee.loginEmail || '—'}</dd></div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-slate-500">New password</dt>
              <dd className="flex min-w-0 items-center gap-2">
                <code className="min-w-0 break-all rounded bg-white px-2 py-1 font-mono text-sm font-semibold text-slate-900">{savedPassword}</code>
                <button type="button" onClick={() => void copy(savedPassword, 'password')} className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-100">
                  {copied === 'password' ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}{copied === 'password' ? 'Copied' : 'Copy'}
                </button>
              </dd>
            </div>
          </dl>
          <button type="button" onClick={() => void copy(detailsText, 'details')} className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-800 hover:bg-slate-50">
            {copied === 'details' ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5 text-amber-600" />}{copied === 'details' ? 'Login details copied' : 'Copy login details'}
          </button>
        </div>
      ) : (
        <form id="hrm-reset-password-form" onSubmit={(event) => void submit(event)} noValidate className="space-y-3">
          {ownLogin ? <p className="rounded-lg bg-amber-50 px-3 py-2.5 text-xs font-medium text-amber-800">This is your own login, so you will be signed out after saving.</p> : null}
          <div>
            <label htmlFor="hrm-reset-password" className="text-xs font-semibold text-slate-700">New password <span className="text-rose-600">*</span></label>
            <div className="mt-1 flex gap-2">
              <div className="relative min-w-0 flex-1">
                <input
                  id="hrm-reset-password"
                  type={show ? 'text' : 'password'}
                  value={password}
                  onChange={(event) => { setPassword(event.target.value); setFieldError(''); setError(''); }}
                  autoComplete="new-password"
                  spellCheck={false}
                  aria-invalid={Boolean(fieldError)}
                  aria-describedby={fieldError ? 'hrm-reset-password-error' : 'hrm-reset-password-hint'}
                  disabled={saving}
                  className={`min-h-10 w-full rounded-lg border px-3 pr-10 text-sm outline-none focus:border-amber-400 disabled:bg-slate-50 ${fieldError ? 'border-rose-300' : 'border-slate-200'}`}
                />
                <button type="button" onClick={() => setShow((value) => !value)} aria-label={show ? 'Hide password' : 'Show password'} aria-pressed={show} className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-slate-500 hover:text-slate-800">
                  {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <button type="button" onClick={generate} disabled={saving} className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-800 hover:bg-slate-50 disabled:opacity-60">
                <RefreshCw className="h-3.5 w-3.5 text-amber-600" />Generate
              </button>
            </div>
            {fieldError
              ? <p id="hrm-reset-password-error" role="alert" className="mt-1.5 text-xs font-medium text-rose-600">{fieldError}</p>
              : <p id="hrm-reset-password-hint" className="mt-1.5 text-xs text-slate-500">At least 8 characters. Share it with the person safely; they should change it after signing in.</p>}
          </div>
        </form>
      )}
    </HrmModal>
  );
}
