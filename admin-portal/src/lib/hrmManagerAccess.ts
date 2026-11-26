import type { HrmChargeRef, HrmManagerAccessContext, HrmManagerAccessInput, HrmManagerAccessResult } from './hrmApi';

/** The rules behind "Login role & access" and additional charges in the dialogs (no React, so they are tested). */

export const KEEP_ROLE = '__keep__';
export const NO_ROLE = '__none__';

/** `grant` null means "not touched": ticked whenever the access can be given. */
export type ManagerAccessForm = { grant: boolean | null; roleId: string };
export const createManagerAccessForm = (): ManagerAccessForm => ({ grant: null, roleId: KEEP_ROLE });

export type ManagerAccessMode = 'posting' | 'charge';

/** Their state access already follows the posting: it moves with it, so there is nothing to tick. */
export const accessFollowsPosting = (context: HrmManagerAccessContext | null, mode: ManagerAccessMode) =>
  mode === 'posting' && Boolean(context?.state && context.followsPosting);

/**
 * Whether the access tick is offered: an appointment gives it to a login; a charge may also give it later, when a
 * login is linked. A posting that already has the access does not offer it again (a charge keeps its own).
 */
export const canOfferAccess = (context: HrmManagerAccessContext | null, mode: ManagerAccessMode) => {
  if (!context || !context.state) return false;
  if (mode === 'charge') return context.viewerCanGrant && (context.hasLogin ? context.canGrantAccess : true);
  return context.canGrantAccess && !context.alreadyHasStateAccess && !context.followsPosting;
};

export const isAccessTicked = (form: ManagerAccessForm, context: HrmManagerAccessContext | null, mode: ManagerAccessMode) =>
  canOfferAccess(context, mode) && (form.grant ?? true);

/** The request part; undefined when nothing is to be changed. */
export const toManagerAccessPayload = (form: ManagerAccessForm, context: HrmManagerAccessContext | null, mode: ManagerAccessMode): HrmManagerAccessInput | undefined => {
  const payload: HrmManagerAccessInput = {};
  if (isAccessTicked(form, context, mode)) payload.grantStateAccess = true;
  if (context?.canChangeRole && form.roleId !== KEEP_ROLE) {
    const next = form.roleId === NO_ROLE ? null : form.roleId;
    if (next !== (context.login?.role?.id ?? null)) payload.customRoleId = next;
  }
  return Object.keys(payload).length ? payload : undefined;
};

/** Why nothing can be given, in words; null when something can. */
export const accessBlockedMessage = (context: HrmManagerAccessContext, mode: ManagerAccessMode) => {
  if (context.blockedReason === 'OWN_RECORD') return 'Your own role and access are changed by somebody else.';
  if (context.blockedReason === 'NO_LOGIN') {
    return mode === 'charge'
      ? 'No login yet. If access is ticked, it is created when a login is linked.'
      : 'No login yet, so no role or access can be given. Link a login on their profile afterwards.';
  }
  if (!context.canChangeRole && !canOfferAccess(context, mode) && !context.alreadyHasStateAccess && !accessFollowsPosting(context, mode)) {
    return 'You do not have the permissions to change their role or give this state (users.update, hrm.employees.manage, hrm.scope.manage).';
  }
  return null;
};

/** The sentence added to a success message. */
export const describeAccessResult = (result: HrmManagerAccessResult | undefined) => {
  if (!result) return '';
  const parts = [
    result.access === 'GRANTED' ? 'State access given.' : result.access === 'ALREADY' ? 'They already had access to the state.' : '',
    result.roleChanged ? 'Login role changed (they sign in again).' : '',
  ].filter(Boolean);
  return parts.length ? ` ${parts.join(' ')}` : '';
};

export const describeEndedCharges = (ended: ReadonlyArray<{ officeName: string }> | undefined) =>
  ended?.length ? ` Additional charge ended: ${[...new Set(ended.map((charge) => charge.officeName))].join(', ')}.` : '';

const shortDay = (value: string) => new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${value}T00:00:00.000Z`));

/** "From 01 Nov 2026 to 31 Mar 2027" / "From 01 Nov 2026, until it is ended". */
export const describeChargePeriod = (charge: Pick<HrmChargeRef, 'effectiveFrom' | 'effectiveTo'>) =>
  charge.effectiveTo ? `From ${shortDay(charge.effectiveFrom)} to ${shortDay(charge.effectiveTo)}` : `From ${shortDay(charge.effectiveFrom)}, until it is ended`;

/** Charges a change can end by choice: the destination office's own charge ends by itself. */
export const endableCharges = (charges: readonly HrmChargeRef[] | undefined, destinationOfficeId: string | null | undefined) =>
  (charges ?? []).filter((charge) => charge.officeUnitId !== destinationOfficeId);

export type ChargeDialogForm = { employeeId: string; officeId: string; effectiveFrom: string; openEnded: boolean; effectiveTo: string; reason: string };
export type ChargeDialogErrors = Partial<Record<'employeeId' | 'officeId' | 'effectiveFrom' | 'effectiveTo', string>>;
export const createChargeForm = (today: string, patch: Partial<ChargeDialogForm> = {}): ChargeDialogForm => ({
  employeeId: '', officeId: '', effectiveFrom: today, openEnded: true, effectiveTo: '', reason: '', ...patch,
});

export const validateChargeForm = (form: ChargeDialogForm, today: string): ChargeDialogErrors => {
  const errors: ChargeDialogErrors = {};
  if (!form.employeeId) errors.employeeId = 'Choose the employee.';
  if (!form.officeId) errors.officeId = 'Choose the state office.';
  if (!form.effectiveFrom) errors.effectiveFrom = 'Choose the first day.';
  if (!form.openEnded) {
    if (!form.effectiveTo) errors.effectiveTo = 'Choose the last day.';
    else if (form.effectiveTo < form.effectiveFrom) errors.effectiveTo = 'The last day cannot be before the first day.';
    else if (form.effectiveTo < today) errors.effectiveTo = 'The last day cannot be in the past.';
  }
  return errors;
};
