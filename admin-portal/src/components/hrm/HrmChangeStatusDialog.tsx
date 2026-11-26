'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, ArrowRight, Loader2, Lock } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { hrmApi, type HrmEmployee } from '@/lib/hrmApi';
import { formatHrmStatus, getHrmErrorMessage, getHrmStatusClass, hasHrmPermission } from '@/lib/hrmUi';
import { getHrmProfileAbilities } from '@/lib/hrmAccess';
import { describeReactivation } from '@/lib/hrmAssignment';
import { describeStatusChangeRefusal } from '@/lib/hrmProfile';
import { OPEN_CASE_STATUSES, statusChanges, type StatusActionId, type StatusOption } from '@/lib/hrmStatus';
import HrmModal from './HrmModal';
import HrmCancelJoiningDialog from './HrmCancelJoiningDialog';
import HrmConfirmJoiningDialog from './HrmConfirmJoiningDialog';
import { DeactivateDialog } from './HrmLifecycleDialogs';

const cancelButton = 'h-10 rounded-xl border border-slate-200 px-5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60';

const StatusChip = ({ status }: { status: string }) => (
  <span className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${getHrmStatusClass(status)}`}>{formatHrmStatus(status)}</span>
);

type Loaded = { employee: HrmEmployee; openCaseId: string | null };

/**
 * One place to change an employee's status, opened from the profile and from every directory row. It reads the record
 * fresh, lists only the changes the current status allows (with the reason when one cannot be chosen) and uses the
 * proper flow for each: a direct save, Confirm joining, Deactivate, Reactivate or Cancel joining.
 */
export default function HrmChangeStatusDialog({ employeeId, onClose, onChanged }: {
  employeeId: string;
  onClose: () => void;
  /** Something changed: reload. `message` is null when the flow already announced it. */
  onChanged: (message: string | null) => void | Promise<void>;
}) {
  const { user } = useAuthStore();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [loadError, setLoadError] = useState('');
  const [reload, setReload] = useState(0);
  const [chosen, setChosen] = useState<StatusActionId | null>(null);
  const [flow, setFlow] = useState<'choose' | 'joining' | 'deactivate' | 'cancel'>('choose');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setLoadError('');
      try {
        const [record, onboarding] = await Promise.all([
          hrmApi.getEmployee(employeeId),
          // Without onboarding access the case is unknown; the server still refuses what a case does not allow.
          hrmApi.getEmployeeOnboarding(employeeId).catch(() => null),
        ]);
        if (cancelled) return;
        const joiningCase = onboarding?.data.onboarding?.case;
        setLoaded({ employee: record.data.employee, openCaseId: joiningCase && OPEN_CASE_STATUSES.has(joiningCase.status) ? joiningCase.id : null });
      } catch (requestError) {
        if (!cancelled) setLoadError(getHrmErrorMessage(requestError, 'The employee could not be loaded.'));
      }
    }, 0);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [employeeId, reload]);

  const finished = useCallback(async (message: string | null) => {
    onClose();
    await onChanged(message);
  }, [onChanged, onClose]);

  const employee = loaded?.employee ?? null;
  const name = employee ? employee.preferredName || employee.legalName : '';
  const ownLogin = Boolean(employee?.user && user && employee.user.id === user.id);
  const openCaseId = loaded?.openCaseId ?? null;
  const abilities = employee ? getHrmProfileAbilities(user, {
    archived: Boolean(employee.archivedAt),
    status: employee.status,
    ownLogin,
    hasLogin: Boolean(employee.user),
    loginRole: employee.user?.role,
    documentsVisible: employee.documentsVisible,
    openCase: Boolean(openCaseId),
    hasOpenAssignment: (employee.assignments ?? []).some((assignment) => assignment.status === 'ACTIVE' && !assignment.effectiveTo),
  }) : null;
  const changes = employee && abilities
    ? statusChanges({
      status: employee.status,
      archived: Boolean(employee.archivedAt),
      // The server cancels a joining only with hrm.onboarding.manage (reading the Onboarding page is not enough).
      abilities: { ...abilities, useCancelJoining: abilities.useCancelJoining && hasHrmPermission(user?.permissions, ['hrm.onboarding.manage'], user?.role === 'SUPER_ADMIN') },
      ownLogin,
      openCase: Boolean(openCaseId),
      superAdminLogin: employee.user?.role === 'SUPER_ADMIN',
    })
    : null;
  const option: StatusOption | null = changes?.options.find((item) => item.id === chosen && !item.blocked) ?? null;
  const dangerous = option?.to === 'EXITED' || option?.to === 'SUSPENDED' || option?.to === 'ARCHIVED';

  const submit = async () => {
    if (!employee || !option || saving) return;
    setError('');
    if (option.id === 'CONFIRM_JOINING') { setFlow('joining'); return; }
    if (option.id === 'SUSPEND' || option.id === 'EXIT') { setFlow('deactivate'); return; }
    if (option.id === 'CANCEL_JOINING') { setFlow('cancel'); return; }
    setSaving(true);
    try {
      if (option.id === 'REACTIVATE') {
        const response = await hrmApi.reactivateEmployee(employee.id);
        await finished(describeReactivation({ employeeCode: employee.employeeCode, loginEnabled: Boolean(response.data.loginEnabled) }));
      } else {
        await hrmApi.updateEmployee(employee.id, { status: option.to, version: employee.version });
        await finished(`${name} is now ${formatHrmStatus(option.to)}.`);
      }
    } catch (requestError) {
      setError(describeStatusChangeRefusal(requestError) ?? getHrmErrorMessage(requestError, 'The status could not be changed. Nothing was saved.'));
      // Somebody else may have changed the record: show what it is now.
      if ((requestError as { response?: { status?: number } })?.response?.status === 409) setReload((value) => value + 1);
    } finally {
      setSaving(false);
    }
  };

  if (employee && flow === 'joining') {
    return (
      <HrmConfirmJoiningDialog
        employeeId={employee.id}
        onClose={() => setFlow('choose')}
        onDone={(result) => finished(`${result.employeeCode} joined and is now active.`)}
      />
    );
  }
  if (employee && flow === 'deactivate') {
    return (
      <DeactivateDialog
        employee={{ id: employee.id, employeeCode: employee.employeeCode, name }}
        initialOutcome={option?.id === 'SUSPEND' ? 'SUSPENDED' : 'EXITED'}
        onClose={() => setFlow('choose')}
        onDone={() => void finished(null)}
      />
    );
  }

  if (employee && flow === 'cancel' && openCaseId) {
    return <HrmCancelJoiningDialog caseId={openCaseId} name={name} onClose={() => setFlow('choose')} onDone={(message) => void finished(message)} />;
  }

  const canChoose = Boolean(changes?.options.some((item) => !item.blocked));
  return (
    <HrmModal
      title="Change status"
      description={employee ? `${name} (${employee.employeeCode})` : 'Loading the employee…'}
      onClose={onClose}
      busy={saving}
      error={error}
      footer={<>
        <button type="button" onClick={onClose} disabled={saving} className={cancelButton}>{changes && !canChoose ? 'Close' : 'Cancel'}</button>
        {changes && canChoose ? (
          <button type="button" onClick={() => void submit()} disabled={saving || !option} className={`inline-flex h-10 items-center justify-center gap-2 rounded-xl px-5 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-50 ${dangerous ? 'bg-rose-600 text-white hover:bg-rose-700' : 'bg-amber-400 text-slate-950 hover:bg-amber-500'}`}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
            {saving ? 'Saving…' : option?.button ?? 'Choose a status'}
          </button>
        ) : null}
      </>}
    >
      {loadError ? (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-700">
          <span className="flex items-start gap-2"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{loadError}</span>
          <button type="button" onClick={() => setReload((value) => value + 1)} className="rounded-lg border border-rose-200 bg-white px-3 py-1.5 text-xs font-semibold hover:bg-rose-50">Try again</button>
        </div>
      ) : !employee || !changes ? (
        <div role="status" className="flex items-center justify-center gap-2 py-8 text-sm text-slate-500"><Loader2 className="h-5 w-5 animate-spin text-amber-500" /> Loading…</div>
      ) : (
        <div className="space-y-4">
          <p className="flex items-center gap-2 text-sm text-slate-600">Current status <StatusChip status={employee.status} /></p>
          {changes.closed ? <p role="note" className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm leading-6 text-slate-700">{changes.closed}</p> : (
            <fieldset disabled={saving}>
              <legend className="mb-2 text-sm font-bold text-slate-900">Change to</legend>
              <div className="space-y-2">
                {changes.options.map((item) => {
                  const selected = option?.id === item.id;
                  return (
                    <label key={item.id} className={`flex items-start gap-3 rounded-xl border p-3 transition ${item.blocked ? 'cursor-not-allowed border-slate-200 bg-slate-50' : selected ? 'cursor-pointer border-amber-400 bg-amber-50/70 ring-1 ring-amber-300' : 'cursor-pointer border-slate-200 hover:border-amber-300 hover:bg-amber-50/30'}`}>
                      <input type="radio" name="hrm-new-status" value={item.id} checked={selected} disabled={Boolean(item.blocked)} onChange={() => { setChosen(item.id); setError(''); }} className="mt-0.5 h-4 w-4 shrink-0 accent-amber-500" />
                      <span className="min-w-0">
                        <span className={`block text-sm font-semibold ${item.blocked ? 'text-slate-500' : 'text-slate-900'}`}>{item.title}</span>
                        <span className="block text-xs leading-5 text-slate-500">{item.description}</span>
                        {item.blocked ? <span className="mt-1 flex items-start gap-1.5 text-xs font-medium leading-5 text-amber-800"><Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />{item.blocked}</span> : null}
                      </span>
                    </label>
                  );
                })}
              </div>
            </fieldset>
          )}
        </div>
      )}
    </HrmModal>
  );
}
