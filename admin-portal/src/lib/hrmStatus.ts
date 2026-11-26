/**
 * "Change status": which changes an employee's current status allows, how each one is made, and why a change cannot
 * be chosen. The rules mirror the server (hrm.service updateEmployee, Confirm / Cancel joining, Deactivate,
 * Reactivate), which checks everything again.
 */

/** An onboarding case that is still open: the person is closed with Cancel joining, not Deactivate. */
export const OPEN_CASE_STATUSES = new Set(['PENDING', 'NEEDS_REVIEW', 'IN_PROGRESS', 'READY_FOR_APPROVAL']);

const JOINING = new Set(['DRAFT', 'PRE_ONBOARDING', 'ONBOARDING']);
const LEFT = new Set(['EXITED', 'TERMINATED']);

export type StatusActionId =
  | 'CONFIRM_JOINING' | 'CANCEL_JOINING'
  | 'SET_ACTIVE' | 'SET_ON_LEAVE' | 'SET_NOTICE'
  | 'REACTIVATE' | 'SUSPEND' | 'EXIT';

export type StatusOption = {
  id: StatusActionId;
  /** The status it leads to. */
  to: 'ACTIVE' | 'ON_LEAVE' | 'NOTICE_PERIOD' | 'SUSPENDED' | 'EXITED' | 'ARCHIVED';
  title: string;
  description: string;
  /** Why it cannot be chosen; null when it can. */
  blocked: string | null;
  /** The dialog's main button while this option is chosen. */
  button: string;
};

export type StatusFacts = {
  status: string;
  archived: boolean;
  /** The profile's abilities (lib/hrmAccess.ts getHrmProfileAbilities). */
  abilities: {
    own: boolean;
    confirmJoining: boolean;
    useCancelJoining: boolean;
    editProfile: boolean;
    deactivate: boolean;
    reactivate: boolean;
  };
  /** The record's login is the signed-in user. */
  ownLogin: boolean;
  openCase: boolean;
  /** The linked login is a Super Admin: HRM never deactivates it. */
  superAdminLogin: boolean;
};

export const OWN_RECORD_REASON = 'This is your own record: another HR user changes your status.';

export const statusChanges = (facts: StatusFacts): { closed: string | null; options: StatusOption[] } => {
  const { abilities, status } = facts;
  if (facts.archived) return { closed: 'This person never joined. The record is archived and cannot be changed.', options: [] };
  if (LEFT.has(status)) return { closed: 'This person has left the company. To hire them again, send a new offer from Recruitment: their record is used again.', options: [] };

  const needs = (allowed: boolean, permissions: string) => (abilities.own ? OWN_RECORD_REASON : allowed ? null : `Needs ${permissions}.`);
  const deactivationBlock = facts.superAdminLogin
    ? 'A Super Admin cannot be deactivated from HRM.'
    : facts.ownLogin ? 'You cannot deactivate your own account.'
      : needs(abilities.deactivate, 'the hrm.assignments.manage and hrm.employees.manage permissions');
  const editBlock = needs(abilities.editProfile, 'the hrm.employees.manage permission');

  const suspend: StatusOption = { id: 'SUSPEND', to: 'SUSPENDED', title: 'Suspended', description: 'On hold. Their assignments stay and they can be reactivated later.', blocked: deactivationBlock, button: 'Continue' };
  const exit: StatusOption = { id: 'EXIT', to: 'EXITED', title: 'Exited', description: 'They have left. Their assignments end and they no longer count as staff.', blocked: deactivationBlock, button: 'Continue' };

  if (JOINING.has(status)) {
    const join: StatusOption = {
      id: 'CONFIRM_JOINING', to: 'ACTIVE', title: 'Active (confirm joining)',
      description: 'They have joined: check the joining details, make the login and give access.',
      blocked: needs(abilities.confirmJoining, 'the hrm.onboarding.manage, hrm.employees.manage and hrm.employees.read permissions'),
      button: 'Continue',
    };
    // With an open onboarding case a no-show is closed by Cancel joining; without one, by deactivating.
    if (facts.openCase) {
      return { closed: null, options: [join, {
        id: 'CANCEL_JOINING', to: 'ARCHIVED', title: 'Cancel joining',
        description: 'They are not joining: the record is archived. Nothing is deleted.',
        blocked: needs(abilities.useCancelJoining, 'the hrm.onboarding.manage, hrm.assignments.manage and hrm.employees.manage permissions'),
        button: 'Continue',
      }] };
    }
    return { closed: null, options: [join, { ...exit, description: 'They are not joining, or have already left. The record is closed.' }, suspend] };
  }

  if (status === 'SUSPENDED') {
    return { closed: null, options: [{
      id: 'REACTIVATE', to: 'ACTIVE', title: 'Active (reactivate)',
      description: 'Back to work. Their login is switched on again if HRM switched it off.',
      blocked: needs(abilities.reactivate, 'the hrm.employees.manage permission'),
      button: 'Reactivate',
    }, exit] };
  }

  const working: StatusOption[] = [
    { id: 'SET_ACTIVE', to: 'ACTIVE', title: 'Active', description: status === 'NOTICE_PERIOD' ? 'The notice is withdrawn and they keep working.' : 'Back at work.', blocked: editBlock, button: 'Save status' },
    { id: 'SET_ON_LEAVE', to: 'ON_LEAVE', title: 'On leave', description: 'Away on leave. Leave requests are recorded in the Leave tab.', blocked: editBlock, button: 'Save status' },
    { id: 'SET_NOTICE', to: 'NOTICE_PERIOD', title: 'Notice period', description: 'Serving notice before leaving. Choose Exited once they have left.', blocked: editBlock, button: 'Save status' },
  ];
  return { closed: null, options: [...working.filter((option) => option.to !== status), suspend, exit] };
};
