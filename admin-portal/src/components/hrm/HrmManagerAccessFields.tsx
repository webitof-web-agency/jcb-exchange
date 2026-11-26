'use client';

import { useEffect, useRef, useState } from 'react';
import { Loader2, RefreshCw, ShieldCheck } from 'lucide-react';
import { hrmApi, type HrmChargeRef, type HrmManagerAccessContext } from '@/lib/hrmApi';
import {
  accessBlockedMessage, accessFollowsPosting, canOfferAccess, describeChargePeriod, KEEP_ROLE, NO_ROLE,
  type ManagerAccessForm, type ManagerAccessMode,
} from '@/lib/hrmManagerAccess';
import { getHrmErrorMessage } from '@/lib/hrmUi';

type Props = {
  employeeId: string | null;
  officeUnitId: string | null;
  value: ManagerAccessForm;
  onChange: (value: ManagerAccessForm) => void;
  onContext: (context: HrmManagerAccessContext | null) => void;
  /**
   * False while the choices are loading (or failed to load): the dialog waits, so the ticked defaults are never
   * dropped without anybody noticing. True when there is nothing to wait for.
   */
  onReady?: (ready: boolean) => void;
  mode: ManagerAccessMode;
  /** The change starts later: the role still changes now, so say it. */
  futureDated?: boolean;
  title?: string;
  /** False where only the role can change (an outgoing manager). */
  showAccess?: boolean;
  disabled?: boolean;
};

/**
 * "Login role & access" for the chosen person, used by the appointment, replacement, transfer and charge dialogs, so
 * the role and the state access are given in the same step. The parent keeps the form and gets the loaded context
 * back (it needs it to build the request).
 */
export default function HrmManagerAccessFields(props: Props) {
  if (!props.employeeId) return null;
  // A new person or office starts afresh: an earlier answer is never shown (or sent) for it.
  return <AccessChoices key={`${props.employeeId}:${props.officeUnitId ?? ''}`} {...props} employeeId={props.employeeId} />;
}

function AccessChoices({
  employeeId, officeUnitId, value, onChange, onContext, onReady, mode, futureDated = false, title = 'Login role & access', showAccess = true, disabled = false,
}: Props & { employeeId: string }) {
  const [loaded, setLoaded] = useState<{ context: HrmManagerAccessContext | null; error: string }>({ context: null, error: '' });
  const [reload, setReload] = useState(0);
  const onContextRef = useRef(onContext);
  const onReadyRef = useRef(onReady);
  useEffect(() => { onContextRef.current = onContext; onReadyRef.current = onReady; });

  useEffect(() => {
    let cancelled = false;
    onContextRef.current(null);
    onReadyRef.current?.(false);
    hrmApi.getManagerAccessContext(employeeId, officeUnitId)
      .then((response) => {
        if (cancelled) return;
        setLoaded({ context: response.data.context, error: '' });
        onContextRef.current(response.data.context);
        onReadyRef.current?.(true);
      })
      .catch((failure) => { if (!cancelled) setLoaded({ context: null, error: getHrmErrorMessage(failure, 'Role and access choices could not be loaded.') }); });
    return () => {
      cancelled = true;
      // Gone (another choice, or the section closed): nothing to send and nothing to wait for.
      onContextRef.current(null);
      onReadyRef.current?.(true);
    };
  }, [employeeId, officeUnitId, reload]);

  const { context, error } = loaded;
  const blocked = !context ? null
    : showAccess || context.blockedReason ? accessBlockedMessage(context, mode)
    : context.canChangeRole ? null : 'Changing their role needs the users.update and hrm.employees.manage permissions.';
  const follows = showAccess && accessFollowsPosting(context, mode);
  const offerAccess = showAccess && canOfferAccess(context, mode);
  const roleName = context?.login?.role?.name ?? 'No role';
  const stateName = context?.state?.name ?? 'this state';

  return (
    <fieldset className="min-w-0 rounded-xl border border-slate-200 p-3">
      <legend className="flex items-center gap-1.5 px-1 text-sm font-semibold text-slate-900"><ShieldCheck className="h-4 w-4 text-amber-600" aria-hidden="true" />{title}</legend>
      {error ? (
        <p role="alert" className="text-xs text-rose-600">{error} <button type="button" onClick={() => { setLoaded({ context: null, error: '' }); setReload((count) => count + 1); }} className="inline-flex items-center gap-1 font-semibold underline"><RefreshCw className="h-3 w-3" />Try again</button></p>
      ) : !context ? (
        <p className="flex items-center gap-2 text-xs text-slate-500"><Loader2 className="h-3.5 w-3.5 animate-spin" />Checking their login…</p>
      ) : (
        <div className="space-y-3">
          {blocked ? <p className="text-xs leading-5 text-slate-600">{blocked}</p> : null}
          {context.canChangeRole ? (
            <label className="block text-xs font-semibold text-slate-700">Permission role
              <select value={value.roleId} disabled={disabled} onChange={(event) => onChange({ ...value, roleId: event.target.value })} className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-normal text-slate-900 outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100">
                <option value={KEEP_ROLE}>Keep current ({roleName})</option>
                {context.login?.role ? <option value={NO_ROLE}>No role</option> : null}
                {context.roles.filter((role) => role.id !== context.login?.role?.id).map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}
              </select>
              {futureDated && value.roleId !== KEEP_ROLE ? <span className="mt-1 block font-normal leading-5 text-amber-700">The role changes now, not on the start date.</span> : null}
            </label>
          ) : context.hasLogin && !blocked ? <p className="text-xs text-slate-600">Permission role: <span className="font-semibold text-slate-800">{roleName}</span></p> : null}
          {follows ? <p className="text-xs leading-5 text-emerald-700">Their state access follows the posting, so {stateName} is given from the start date.</p>
            : offerAccess ? (
              <label className="flex cursor-pointer items-start gap-2.5">
                <input type="checkbox" checked={value.grant ?? true} disabled={disabled} onChange={(event) => onChange({ ...value, grant: event.target.checked })} className="mt-0.5 h-4 w-4 rounded accent-amber-500" />
                <span>
                  <span className="block text-sm font-semibold text-slate-900">Give access to {stateName}</span>
                  <span className="block text-xs leading-4 text-slate-500">{mode === 'charge' ? 'They see this state for exactly the days of the charge.' : 'They see this state from the start date; it follows the posting and ends when they stop managing it.'}</span>
                </span>
              </label>
            ) : showAccess && context.alreadyHasStateAccess ? <p className="text-xs text-emerald-700">Already has access to {stateName}.</p>
              : showAccess && context.hasLogin && !blocked ? <p className="text-xs text-slate-500">You cannot give access to this state (needs hrm.scope.manage and the state in your own access).</p> : null}
        </div>
      )}
    </fieldset>
  );
}

/** Tick boxes for additional charges a change can end (only the ones the viewer may end). */
export function EndChargeTicks({ charges, selected, onChange, title, hint }: {
  charges: readonly HrmChargeRef[];
  selected: readonly string[];
  onChange: (ids: string[]) => void;
  title: string;
  hint: string;
}) {
  if (!charges.length) return null;
  return (
    <fieldset className="min-w-0 rounded-xl border border-slate-200 p-3">
      <legend className="px-1 text-sm font-semibold text-slate-900">{title}</legend>
      <p className="mb-2 text-xs leading-4 text-slate-500">{hint}</p>
      <div className="space-y-1.5">
        {charges.map((charge) => {
          const allowed = charge.canEnd !== false;
          return (
            <label key={charge.id} className={`flex items-start gap-2.5 ${allowed ? 'cursor-pointer' : 'opacity-60'}`}>
              <input type="checkbox" disabled={!allowed} checked={allowed && selected.includes(charge.id)} onChange={(event) => onChange(event.target.checked ? [...selected, charge.id] : selected.filter((id) => id !== charge.id))} className="mt-0.5 h-4 w-4 rounded accent-amber-500" />
              <span className="text-sm text-slate-800">{charge.officeName}<span className="block text-xs text-slate-500">{describeChargePeriod(charge)}{allowed ? '' : ' · outside your HRM access'}</span></span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
