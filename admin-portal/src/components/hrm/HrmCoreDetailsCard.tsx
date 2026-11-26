'use client';

import { ArrowLeftRight, Save } from 'lucide-react';
import type { HrmEmployee } from '@/lib/hrmApi';
import { formatHrmDate, formatHrmStatus, getHrmStatusClass } from '@/lib/hrmUi';
import type { IdentityErrors, ProfileForm } from '@/lib/hrmLogin';

export type CoreDetailsErrors = IdentityErrors & { preferredName?: string };

const FIELDS = [
  ['preferredName', 'Preferred name'],
  ['workEmail', 'Work email'],
  ['mobile', 'Mobile'],
] as const;

/** Preferred name, work email and mobile, the status (changed with "Change status") and the fixed facts. */
export default function HrmCoreDetailsCard({
  employee,
  form,
  onChange,
  errors,
  onSubmit,
  saving,
  canEdit,
  canEditLoginIdentity,
  loginRole,
  ownRecord,
  offerReference,
  onChangeStatus,
}: {
  employee: HrmEmployee;
  form: ProfileForm;
  onChange: (key: keyof ProfileForm, value: string) => void;
  errors: CoreDetailsErrors;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  saving: boolean;
  canEdit: boolean;
  canEditLoginIdentity: boolean;
  loginRole: string | null | undefined;
  ownRecord: boolean;
  offerReference: string | null;
  onChangeStatus?: (() => void) | undefined;
}) {
  const hasLogin = Boolean(employee.user);
  return (
    <form onSubmit={onSubmit} noValidate className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-2">
        <h2 className="font-bold text-slate-950">Contact & status</h2>

        {canEdit ? <button disabled={saving} type="submit" className="inline-flex min-h-9 items-center gap-2 rounded-lg bg-slate-950 px-3 text-xs font-bold text-white disabled:opacity-60"><Save className="h-3.5 w-3.5" /> {saving ? 'Saving…' : 'Save'}</button> : null}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {FIELDS.map(([key, label]) => {
          const isLoginField = hasLogin && key !== 'preferredName';
          const locked = !canEdit || (isLoginField && !canEditLoginIdentity);
          const problem = errors[key];
          const what = key === 'workEmail' ? 'email' : 'mobile';
          return (
            <label key={key} className="text-xs font-semibold text-slate-700">
              {isLoginField ? `${label} (login)` : label}
              <input disabled={locked} type={key === 'workEmail' ? 'email' : 'text'} inputMode={key === 'mobile' ? 'tel' : undefined} maxLength={key === 'preferredName' ? 160 : key === 'workEmail' ? 254 : 20} autoComplete="off" aria-invalid={Boolean(problem)} value={form[key]} onChange={(event) => onChange(key, event.target.value)} className={`mt-1 min-h-10 w-full rounded-lg border px-3 text-sm font-normal outline-none focus:border-amber-400 disabled:bg-slate-50 ${problem ? 'border-rose-300' : 'border-slate-200'}`} />
              {problem ? <span role="alert" className="mt-1 block text-[11px] font-medium text-rose-600">{problem}</span>
                : isLoginField ? <span className="mt-1 block text-[11px] font-normal text-slate-500">{canEditLoginIdentity ? `Also the login ${what}. Changing it signs the person out everywhere.` : loginRole === 'ADMIN' || loginRole === 'SUPER_ADMIN' ? `Administrator login: its ${what} is changed on the Users screen.` : ownRecord ? `Your login ${what}: another HR user changes it.` : `The login ${what}. Someone with Users access changes it.`}</span> : null}
            </label>
          );
        })}
        <div className="text-xs font-semibold text-slate-700">
          Status
          <div className="mt-1 flex min-h-10 flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5">
            <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${getHrmStatusClass(employee.status)}`}>{formatHrmStatus(employee.status)}</span>
            {onChangeStatus ? <button type="button" onClick={onChangeStatus} className="inline-flex min-h-7 items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-2.5 text-xs font-bold text-amber-900 hover:bg-amber-100"><ArrowLeftRight className="h-3.5 w-3.5" aria-hidden="true" /> Change status</button> : null}
          </div>
          <span className="mt-1 block text-[11px] font-normal text-slate-500">{onChangeStatus ? 'Change status shows what is possible now.' : 'Changing the status needs the hrm.employees.manage permission.'}</span>
        </div>
      </div>
      <dl className="mt-5 grid gap-3 border-t border-slate-100 pt-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <div><dt className="text-xs text-slate-500">Legal name</dt><dd className="break-words font-semibold text-slate-800">{employee.legalName}</dd></div>
        <div><dt className="text-xs text-slate-500">Joining date</dt><dd className="font-semibold text-slate-800">{formatHrmDate(employee.joinedOn)}</dd></div>
        <div><dt className="text-xs text-slate-500">Personal email</dt><dd className="break-words font-semibold text-slate-800">{employee.personalEmail || '—'}</dd></div>
        <div><dt className="text-xs text-slate-500">Offer reference</dt><dd className="break-words font-semibold text-slate-800">{offerReference || (employee.offerId ? 'Recruitment offer' : '—')}</dd></div>
      </dl>
    </form>
  );
}
