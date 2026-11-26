'use client';

import { KeyRound, Link2 } from 'lucide-react';
import type { HrmEmployee } from '@/lib/hrmApi';
import { formatHrmStatus } from '@/lib/hrmUi';
import { describeLoginStatusHint, getLoginStatusClass } from '@/lib/hrmLogin';

/** The login account linked to the employee: email, status, role; link one or reset its password. */
export default function HrmLoginCard({
  employee,
  onResetPassword,
  onLinkLogin,
}: {
  employee: HrmEmployee;
  onResetPassword?: (() => void) | undefined;
  onLinkLogin?: (() => void) | undefined;
}) {
  const hint = describeLoginStatusHint(employee.user?.status);
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-bold text-slate-950">Login account</h2>
        {onResetPassword ? <button type="button" onClick={onResetPassword} className="inline-flex min-h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-bold text-slate-800 hover:bg-slate-50"><KeyRound className="h-3.5 w-3.5 text-amber-600" /> Reset password</button> : null}
      </div>
      {employee.user ? (
        <>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between gap-3"><dt className="text-slate-500">Email</dt><dd className="min-w-0 truncate font-medium text-slate-900">{employee.user.email || '—'}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-slate-500">Status</dt><dd><span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${getLoginStatusClass(employee.user.status)}`}>{formatHrmStatus(employee.user.status)}</span></dd></div>
            <div className="flex justify-between gap-3"><dt className="text-slate-500">Permission role</dt><dd className="font-medium text-slate-900">{employee.user.customRole?.name ?? 'No role assigned'}</dd></div>
          </dl>
          {hint ? <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-600">{hint}</p> : null}
        </>
      ) : (
        <div className="mt-3">
          <p className="text-sm text-slate-500">No login account is linked to this employee. A login can also be created at Confirm joining.</p>
          {onLinkLogin ? <button type="button" onClick={onLinkLogin} className="mt-3 inline-flex min-h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-800 hover:bg-slate-50"><Link2 className="h-3.5 w-3.5 text-amber-600" /> Link existing login</button> : null}
        </div>
      )}
    </section>
  );
}
