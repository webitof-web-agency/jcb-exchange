'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Plus, RefreshCw, ShieldCheck } from 'lucide-react';
import { toast } from 'react-toastify';
import HrmModal from './HrmModal';
import HrmHeadOfficeField from './HrmHeadOfficeField';
import { selectedHeadOffice, type HrmHeadOffice } from '@/lib/hrmHeadOffice';
import { hrmApi, type HrmEmployeeAccess, type HrmOrganisation, type HrmScopeType } from '@/lib/hrmApi';
import { SCOPE_TYPE_LABELS, describeScope, grantableScopeTypes, scopePeriodState } from '@/lib/hrmJoining';
import { formatHrmDate, getHrmErrorMessage } from '@/lib/hrmUi';
import { canEndHrmScope, grantableStates, NO_GRANTABLE_ROLE_MESSAGE, SELF_ACTION_HINT, viewerHasAny } from '@/lib/hrmAccess';
import { useAuthStore } from '@/store/authStore';
import { confirmDelete } from '@/store/confirmDeleteStore';

const input = 'mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-400/20 disabled:bg-slate-50';
const PERIOD_CHIP: Record<string, string> = {
  ACTIVE: 'bg-emerald-50 text-emerald-700',
  UPCOMING: 'bg-sky-50 text-sky-700',
  ENDED: 'bg-slate-100 text-slate-500',
};

type Props = {
  employeeId: string;
  /** False for an archived record: everything is read-only. */
  writable: boolean;
  /** The viewer's own record (Super Admin excepted): access and role are changed by another HR user. */
  ownRecord?: boolean;
  /** The person has left (EXITED / TERMINATED): no new access is given (ending one still works). */
  leftCompany?: boolean;
  /** The viewer holds hrm.employees.manage (the login-role route needs it as well as users.update). */
  canManageEmployees?: boolean;
  /** Bumped by the parent after a change elsewhere (for example Confirm joining) to reload. */
  refreshKey?: number;
  /** Tells the parent what was loaded (for example the login's account role). */
  onLoaded?: (access: HrmEmployeeAccess) => void;
};

/**
 * Who this person is in the system: their login's permission role and their HRM access (which employees they can see
 * and manage). Changing the role needs users.update and hrm.employees.manage and only offers roles the viewer may give;
 * giving / ending access needs hrm.scope.manage, and nobody can give (or end) wider access than they have themselves.
 */
export default function HrmAccessCard({ employeeId, writable, ownRecord = false, leftCompany = false, canManageEmployees = false, refreshKey = 0, onLoaded }: Props) {
  const user = useAuthStore((state) => state.user);
  const [access, setAccess] = useState<HrmEmployeeAccess | null>(null);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const [roleSaving, setRoleSaving] = useState(false);
  const [grantOpen, setGrantOpen] = useState(false);
  /** The viewer's own STATE scopes, when the access payload does not carry them (read from the holiday reach). */
  const [reachStateIds, setReachStateIds] = useState<number[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    hrmApi.getEmployeeAccess(employeeId)
      .then((response) => { if (!cancelled) { setAccess(response.data.access); setError(''); onLoaded?.(response.data.access); } })
      .catch((failure) => { if (!cancelled) setError(getHrmErrorMessage(failure, 'Access could not be loaded.')); });
    return () => { cancelled = true; };
    // onLoaded is a notification only; re-running for a new function identity would reload for nothing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employeeId, reload, refreshKey]);

  // A non-all-India HR user may give / end only STATE access for their own states. GET /hrm/holidays answers with the
  // same "own STATE scopes" (it accepts attendance or organisation read), so it is used when the access payload has none.
  const needsOwnStates = Boolean(access && access.abilities.canManageScopes && !access.abilities.allIndia && !access.abilities.ownStateIds);
  const canReadReach = viewerHasAny(user, ['hrm.attendance.read', 'hrm.attendance.manage', 'hrm.org.read']);
  useEffect(() => {
    if (!needsOwnStates || !canReadReach || reachStateIds) return undefined;
    let cancelled = false;
    hrmApi.listHolidays()
      .then((response) => { if (!cancelled) setReachStateIds(response.data.abilities?.allIndia ? [] : response.data.abilities?.stateIds ?? []); })
      .catch(() => { if (!cancelled) setReachStateIds([]); });
    return () => { cancelled = true; };
  }, [needsOwnStates, canReadReach, reachStateIds]);

  const refresh = useCallback(() => setReload((value) => value + 1), []);
  const scopeAbilities = useMemo(() => (access ? {
    canManageScopes: access.abilities.canManageScopes,
    allIndia: access.abilities.allIndia,
    ownStateIds: access.abilities.ownStateIds ?? reachStateIds ?? [],
  } : null), [access, reachStateIds]);
  const hasLogin = Boolean(access?.login);
  // Nothing on your own record (the server refuses it); nothing new for somebody who has left.
  const canGiveAccess = writable && !ownRecord && !leftCompany && hasLogin && Boolean(access?.abilities.canManageScopes);
  const canEnd = (scope: HrmEmployeeAccess['scopes'][number]) => writable && !ownRecord && hasLogin && Boolean(scopeAbilities && canEndHrmScope(scopeAbilities, scope));
  const canChangeRole = writable && !ownRecord && canManageEmployees && Boolean(access?.abilities.canChangeRole) && access?.login?.role === 'EMPLOYEE';
  const roleOptions = useMemo(() => {
    const roles = access?.roles ?? [];
    const current = access?.login?.customRole;
    // The current role stays visible even when the viewer could not give it.
    return current && !roles.some((role) => role.id === current.id) ? [...roles, { id: current.id, name: current.name }] : roles;
  }, [access]);

  const changeRole = async (customRoleId: string) => {
    if (!access?.login || roleSaving) return;
    const next = customRoleId || null;
    if (next === (access.login.customRole?.id ?? null)) return;
    const ok = await confirmDelete({ title: 'Change permission role?', itemName: access.roles.find((role) => role.id === next)?.name ?? 'No role', note: 'The person is signed out and signs in again with the new role.', confirmLabel: 'Change role' });
    if (!ok) return;
    setRoleSaving(true);
    try {
      await hrmApi.changeLoginRole(employeeId, next);
      toast.success('Permission role changed.');
      refresh();
    } catch (failure) {
      toast.error(getHrmErrorMessage(failure, 'The role could not be changed.'));
    } finally {
      setRoleSaving(false);
    }
  };

  const endScope = async (scopeId: string, label: string) => {
    const ok = await confirmDelete({ title: 'End this access?', itemName: label, note: 'It ends today; the history is kept.', confirmLabel: 'End access' });
    if (!ok) return;
    try {
      await hrmApi.endEmployeeScope(scopeId);
      toast.success('Access ended.');
      refresh();
    } catch (failure) {
      toast.error(getHrmErrorMessage(failure, 'The access could not be ended.'));
    }
  };

  const ordered = useMemo(() => {
    const order = { ACTIVE: 0, UPCOMING: 1, ENDED: 2 } as const;
    return [...(access?.scopes ?? [])].sort((a, b) => order[scopePeriodState(a)] - order[scopePeriodState(b)]);
  }, [access]);

  return (
    <section id="hrm-access" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-1.5 font-bold text-slate-950"><ShieldCheck className="h-4 w-4 text-amber-600" /> Access</h2>
        {canGiveAccess ? <button type="button" onClick={() => setGrantOpen(true)} className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-bold text-slate-800 hover:bg-slate-50"><Plus className="h-3.5 w-3.5 text-amber-600" /> Give access</button> : null}
      </div>
      {error ? (
        <p className="mt-3 text-sm text-rose-600">{error} <button type="button" onClick={refresh} className="ml-1 inline-flex items-center gap-1 font-semibold underline"><RefreshCw className="h-3.5 w-3.5" /> Retry</button></p>
      ) : !access ? (
        <p className="mt-3 flex items-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</p>
      ) : !access.login ? (
        <p className="mt-3 text-sm text-slate-500">No login yet, so no system access. They get one at Confirm joining or with “Link existing login”.</p>
      ) : (
        <div className="mt-3 space-y-3 text-sm">
          {ownRecord && writable && (access.abilities.canManageScopes || access.abilities.canChangeRole) ? <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">Your own access and role: {SELF_ACTION_HINT.toLowerCase()}.</p> : null}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-slate-500">Permission role</span>
            {canChangeRole && access.roles.length ? (
              <select aria-label="Permission role" value={access.login.customRole?.id ?? ''} disabled={roleSaving} onChange={(event) => void changeRole(event.target.value)} className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm">
                <option value="">No role</option>
                {roleOptions.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}
              </select>
            ) : <span className="font-medium text-slate-900">{access.login.customRole?.name ?? 'No role assigned'}</span>}
          </div>
          {canChangeRole && !access.roles.length ? <p className="text-xs text-slate-500">{NO_GRANTABLE_ROLE_MESSAGE}</p> : null}
          <div>
            <p className="text-slate-500">HRM access (who they can see)</p>
            {ordered.length ? (
              <ul className="mt-2 space-y-2">
                {ordered.map((scope) => {
                  const period = scopePeriodState(scope);
                  const label = describeScope(scope);
                  return (
                    <li key={scope.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
                      <span className="min-w-0">
                        <span className="font-semibold text-slate-900">{label}</span>
                        {scope.source === 'PLACEMENT' ? <span className="ml-2 rounded-full bg-sky-50 px-2 py-0.5 text-[10px] font-bold text-sky-700">Follows office</span> : null}
                        {scope.source === 'CHARGE' ? <span title="Ends with the additional charge" className="ml-2 rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-bold text-violet-700">Additional charge</span> : null}
                        <span className={`ml-2 rounded-full px-2 py-0.5 text-[10px] font-bold ${PERIOD_CHIP[period]}`}>{period === 'ACTIVE' ? 'Active' : period === 'UPCOMING' ? 'Upcoming' : 'Ended'}</span>
                        <span className="block text-xs text-slate-500">{formatHrmDate(scope.activeFrom)} – {scope.activeTo ? formatHrmDate(scope.activeTo) : 'open'}</span>
                      </span>
                      {period !== 'ENDED' && canEnd(scope) ? <button type="button" onClick={() => void endScope(scope.id, label)} className="text-xs font-semibold text-rose-700 hover:underline">End</button> : null}
                    </li>
                  );
                })}
              </ul>
            ) : <p className="mt-1 text-xs text-slate-500">Only their own record.</p>}
          </div>
        </div>
      )}
      {grantOpen && access && scopeAbilities ? (
        <GrantScopeDialog
          employeeId={employeeId}
          abilities={scopeAbilities}
          canReadOrganisation={viewerHasAny(user, ['hrm.org.read'])}
          onClose={() => setGrantOpen(false)}
          onDone={() => { setGrantOpen(false); refresh(); }}
        />
      ) : null}
    </section>
  );
}

function GrantScopeDialog({ employeeId, abilities, canReadOrganisation, onClose, onDone }: {
  employeeId: string;
  abilities: { canManageScopes: boolean; allIndia: boolean; ownStateIds: number[] };
  /** States and the head office come from GET /hrm/organisation (hrm.org.read). */
  canReadOrganisation: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  // Only what the viewer may give: a STATE for their own states (every state when all-India), the head office and
  // All of India only when all-India, and direct reports always.
  const types = grantableScopeTypes(abilities).filter((type) => {
    if (type === 'STATE') return canReadOrganisation && (abilities.allIndia || abilities.ownStateIds.length > 0);
    if (type === 'HEAD_OFFICE') return canReadOrganisation;
    return true;
  });
  const [scopeType, setScopeType] = useState<HrmScopeType>(types[0] ?? 'DIRECT_REPORTS');
  const [stateId, setStateId] = useState('');
  const [followsOffice, setFollowsOffice] = useState(false);
  const [activeFrom, setActiveFrom] = useState('');
  const [organisation, setOrganisation] = useState<HrmOrganisation | null>(null);
  const [orgError, setOrgError] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const needsOrganisation = scopeType === 'STATE' || scopeType === 'HEAD_OFFICE';

  useEffect(() => {
    if (!needsOrganisation || organisation) return;
    let cancelled = false;
    hrmApi.getOrganisation()
      .then((response) => { if (!cancelled) setOrganisation(response.data.organisation); })
      .catch((failure) => { if (!cancelled) setOrgError(getHrmErrorMessage(failure, 'States and offices could not be loaded.')); });
    return () => { cancelled = true; };
  }, [needsOrganisation, organisation]);

  const headOffices: HrmHeadOffice[] = useMemo(() => (organisation?.units ?? [])
    .filter((unit) => unit.kind === 'HEAD_OFFICE' && unit.isActive)
    .map((unit) => ({ id: unit.id, name: unit.name, isDefault: Boolean(unit.isDefault), stateId: unit.state?.id ?? null, stateName: unit.state?.name ?? null, cityId: unit.city?.id ?? null, cityName: unit.city?.name ?? null }))
    .sort((a, b) => Number(b.isDefault) - Number(a.isDefault) || a.name.localeCompare(b.name)), [organisation]);
  const [headOfficeId, setHeadOfficeId] = useState('');
  const headOffice = selectedHeadOffice(headOffices, headOfficeId);
  const states = useMemo(() => grantableStates(organisation?.states ?? [], abilities), [organisation, abilities]);
  const dirty = Boolean(stateId || activeFrom || followsOffice);

  const submit = async () => {
    if (saving) return;
    if (scopeType === 'STATE' && !stateId) { setError('Choose the state.'); return; }
    if (scopeType === 'HEAD_OFFICE' && !headOffice) { setError('The head office is not set up.'); return; }
    setSaving(true);
    setError('');
    try {
      await hrmApi.grantEmployeeScope(employeeId, {
        scopeType,
        ...(scopeType === 'STATE' ? { stateId: Number(stateId), source: followsOffice ? 'PLACEMENT' as const : 'MANUAL' as const } : { source: 'MANUAL' as const }),
        ...(scopeType === 'HEAD_OFFICE' && headOffice ? { orgUnitId: headOffice.id } : {}),
        ...(activeFrom ? { activeFrom } : {}),
      });
      toast.success('Access given.');
      onDone();
    } catch (failure) {
      setError(getHrmErrorMessage(failure, 'The access could not be given.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <HrmModal title="Give HRM access" description="Which employees this person can see and manage. Nobody can give wider access than they have." onClose={onClose} busy={saving} lockDismiss={saving || dirty} error={error}
      footer={(
        <div className="flex w-full justify-end gap-2">
          <button type="button" onClick={onClose} disabled={saving} className="inline-flex min-h-10 items-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700">Cancel</button>
          <button type="button" onClick={() => void submit()} disabled={saving} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-amber-400 px-4 text-sm font-bold text-slate-950 hover:bg-amber-500 disabled:opacity-60">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Give access</button>
        </div>
      )}>
      <div className="space-y-3 text-sm">
        <label className="block text-xs font-semibold text-slate-700" htmlFor="hrm-grant-type">Access
          <select id="hrm-grant-type" value={scopeType} disabled={saving} onChange={(event) => { setScopeType(event.target.value as HrmScopeType); setError(''); }} className={input}>
            {types.map((type) => <option key={type} value={type}>{type === 'STATE' ? 'Everyone in a state' : type === 'HEAD_OFFICE' ? 'Everyone at the head office' : type === 'ALL_INDIA' ? 'All of India' : SCOPE_TYPE_LABELS[type]}</option>)}
          </select>
        </label>
        {!abilities.allIndia ? <p className="text-xs text-slate-500">You can give access to your own state{abilities.ownStateIds.length === 1 ? '' : 's'} and to direct reports only.</p> : null}
        {needsOrganisation && orgError ? <p className="text-xs text-rose-600">{orgError}</p> : null}
        {scopeType === 'STATE' ? (
          <>
            <label className="block text-xs font-semibold text-slate-700" htmlFor="hrm-grant-state">State
              <select id="hrm-grant-state" value={stateId} disabled={saving || !organisation} onChange={(event) => { setStateId(event.target.value); setError(''); }} className={input}>
                <option value="">{organisation ? 'Choose the state' : 'Loading…'}</option>
                {states.map((state) => <option key={state.id} value={state.id}>{state.name}</option>)}
              </select>
            </label>
            <label className="flex items-start gap-2 text-xs text-slate-700"><input type="checkbox" checked={followsOffice} disabled={saving} onChange={(event) => setFollowsOffice(event.target.checked)} className="mt-0.5" /> Follows their office (a State Manager: moves with a transfer, ends when they stop managing the state or leave)</label>
          </>
        ) : null}
        {scopeType === 'HEAD_OFFICE' ? (headOffice ? (
          <div className="text-xs font-semibold text-slate-700">
            <label htmlFor="hrm-grant-head-office" className="mb-1 block">Head office</label>
            <HrmHeadOfficeField id="hrm-grant-head-office" offices={headOffices} value={headOfficeId} onChange={(office) => { setHeadOfficeId(office.id); setError(''); }} showPlace={false} disabled={saving} />
          </div>
        ) : <p className="text-xs text-slate-600">{organisation ? 'The head office is not set up.' : 'Loading…'}</p>) : null}
        <label className="block text-xs font-semibold text-slate-700" htmlFor="hrm-grant-from">From (optional, today if empty)
          <input id="hrm-grant-from" type="date" value={activeFrom} disabled={saving} onChange={(event) => setActiveFrom(event.target.value)} className={input} />
        </label>
      </div>
    </HrmModal>
  );
}
