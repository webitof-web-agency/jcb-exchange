import type { Prisma } from '@prisma/client';

/**
 * The rules of choosing a reporting manager, kept free of the database so they can be tested on their own:
 * who is suggested (and pre-selected), who would make a reporting loop, what to tell HR when there is nobody to
 * suggest, and the directory filter "Manager not set".
 */

/** 'successor' = choosing who takes over the team of somebody who is leaving or suspended. */
export type ManagerPurpose = 'manager' | 'successor';

export type SuggestionKind = 'LEAVER_MANAGER' | 'STATE_MANAGER' | 'CHARGE' | 'NATIONAL';

export type Suggestion = { id: string; kind: SuggestionKind; reason: string };

/**
 * Who is suggested, best first, one entry per person.
 *  - somebody who will manage a state office (State Manager) reports to a National Operations Manager;
 *  - anybody else in a state reports to that state's manager, or whoever holds its additional charge;
 *  - a successor: the leaver's own manager first, then the same people.
 */
export const buildSuggestions = (input: {
  purpose: ManagerPurpose;
  managerRole: boolean;
  stateName: string | null;
  leaverManagerId: string | null;
  stateManagerIds: readonly string[];
  chargeHolderIds: readonly string[];
  nationalIds: readonly string[];
  excludeId?: string | null | undefined;
}): Suggestion[] => {
  const list: Suggestion[] = [];
  const add = (id: string, kind: SuggestionKind, reason: string) => {
    if (id !== input.excludeId && !list.some((item) => item.id === id)) list.push({ id, kind, reason });
  };
  const state = input.stateName ?? 'the state';
  if (input.purpose === 'successor' && input.leaverManagerId) add(input.leaverManagerId, 'LEAVER_MANAGER', 'Their manager');
  if (!input.managerRole || input.purpose === 'successor') {
    for (const id of input.stateManagerIds) add(id, 'STATE_MANAGER', `State Manager of ${state}`);
    for (const id of input.chargeHolderIds) add(id, 'CHARGE', `Additional charge of ${state}`);
  }
  if (input.managerRole) for (const id of input.nationalIds) add(id, 'NATIONAL', 'National Operations Manager');
  return list;
};

/**
 * The one person filled in before HR chooses, only when the answer is obvious: the single National Operations Manager
 * for a State Manager; otherwise the single manager of the state (or, with none, the single charge holder). Nobody is
 * filled in for a successor: that is a decision HR makes.
 */
export const pickPreselect = (
  suggestions: ReadonlyArray<Suggestion & { blocked?: string | null }>,
  input: { purpose: ManagerPurpose; managerRole: boolean },
): string | null => {
  if (input.purpose === 'successor') return null;
  const usable = (kind: SuggestionKind) => suggestions.filter((item) => item.kind === kind && !item.blocked);
  if (input.managerRole) {
    const national = usable('NATIONAL');
    return national.length === 1 ? national[0]!.id : null;
  }
  const managers = usable('STATE_MANAGER');
  if (managers.length) return managers.length === 1 ? managers[0]!.id : null;
  const holders = usable('CHARGE');
  return holders.length === 1 ? holders[0]!.id : null;
};

/** One line above the list when there is no single obvious person. Counts are of everybody, seen or not. */
export const managerNote = (input: {
  purpose: ManagerPurpose;
  managerRole: boolean;
  stateName: string | null;
  stateManagers: number;
  chargeHolders: number;
  nationals: number;
}): string | null => {
  if (input.purpose === 'successor') return null;
  if (input.managerRole) {
    if (!input.nationals) return 'No National Operations Manager is set yet.';
    return input.nationals > 1 ? 'There is more than one National Operations Manager: choose one.' : null;
  }
  if (!input.stateName) return null;
  if (!input.stateManagers && !input.chargeHolders) return `${input.stateName} has no State Manager yet.`;
  if (input.stateManagers > 1 || (!input.stateManagers && input.chargeHolders > 1)) return `${input.stateName} has more than one manager: choose one.`;
  return null;
};

/**
 * Why a person in the employee's own team cannot be chosen (`depth` 1 = reports to them directly). A successor may be
 * one of the direct reports (their own line then moves up); anybody further down would make a loop.
 */
export const loopReason = (depth: number | undefined, purpose: ManagerPurpose, employeeName: string): string | null => {
  if (!depth) return null;
  if (purpose === 'successor') return depth > 1 ? `Reports to somebody in ${employeeName}'s team, so this would make a loop.` : null;
  return depth === 1 ? `Reports to ${employeeName}, so cannot be their manager.` : `Is in ${employeeName}'s team, so cannot be their manager.`;
};

const LEFT: Array<'EXITED' | 'TERMINATED'> = ['EXITED', 'TERMINATED'];

/**
 * The directory filter on the "Reporting to" column. What counts is the assignment in force today, or - for somebody
 * who has none yet - the one still to start. People who have left are in neither list.
 */
export const reportingManagerWhere = (filter: 'missing' | 'assigned', today: Date): Prisma.HrmEmployeeWhereInput => {
  const current = { status: 'ACTIVE' as const, effectiveFrom: { lte: today }, OR: [{ effectiveTo: null }, { effectiveTo: { gte: today } }] };
  const upcoming = { status: 'ACTIVE' as const, effectiveFrom: { gt: today } };
  const withManager: Prisma.HrmEmployeeWhereInput = {
    OR: [
      { assignments: { some: { AND: [current, { managerEmployeeId: { not: null } }] } } },
      { AND: [{ assignments: { none: current } }, { assignments: { some: { ...upcoming, managerEmployeeId: { not: null } } } }] },
    ],
  };
  return { AND: [{ status: { notIn: LEFT } }, filter === 'assigned' ? withManager : { NOT: withManager }] };
};
