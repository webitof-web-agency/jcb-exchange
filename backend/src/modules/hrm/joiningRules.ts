/**
 * Pure rules for "Confirm joining" (no database): which HRM access scopes a placement suggests, and which actual
 * joining dates are acceptable. HR sees the suggestions and confirms them; nothing is granted silently.
 */

export type ScopeType = 'OWN' | 'DIRECT_REPORTS' | 'TEAM' | 'DEPARTMENT' | 'REGION' | 'STATE' | 'HEAD_OFFICE' | 'ALL_INDIA';

export type PlacementForScopes = {
  officeKind: 'HEAD_OFFICE' | 'STATE' | 'OTHER' | null;
  officeUnitId: string | null;
  stateId: number | null;
  stateName: string | null;
  isOfficeManager: boolean;
  designation: string | null;
};

export type SuggestedScope = {
  scopeType: ScopeType;
  stateId?: number | null;
  orgUnitId?: string | null;
  /** PLACEMENT scopes follow the person's office (moved / ended with transfers and exits). */
  source: 'PLACEMENT' | 'MANUAL';
  label: string;
  /** Ticked by default in the dialog. */
  recommended: boolean;
  reason: string;
};

const NATIONAL_OPS = 'national operations manager';

/**
 * Everyone sees their own record without any scope. On top of that:
 * - a State Manager: their state (follows their placement);
 * - the National Operations Manager: all of India;
 * - anybody: the people who report to them (recommended only for managers);
 * - head office staff: the head office or all of India are offered, not ticked (depends on the role: HR, accounts...).
 */
export const suggestScopes = (placement: PlacementForScopes): SuggestedScope[] => {
  const suggestions: SuggestedScope[] = [];
  const designation = (placement.designation ?? '').trim().toLowerCase();
  if (placement.officeKind === 'STATE' && placement.isOfficeManager && placement.stateId) {
    suggestions.push({
      scopeType: 'STATE', stateId: placement.stateId, source: 'PLACEMENT', recommended: true,
      label: `Everyone in ${placement.stateName ?? 'their state'}`,
      reason: 'State Manager: sees and manages their own state only. Moves with them on transfer, ends on exit.',
    });
  }
  if (designation === NATIONAL_OPS) {
    suggestions.push({ scopeType: 'ALL_INDIA', source: 'MANUAL', recommended: true, label: 'All of India', reason: 'National Operations Manager: all State Managers report here.' });
  }
  suggestions.push({
    scopeType: 'DIRECT_REPORTS', source: 'MANUAL', recommended: placement.isOfficeManager || designation === NATIONAL_OPS,
    label: 'People who report to them', reason: 'Their direct reports, whoever they are later.',
  });
  if (placement.officeKind === 'HEAD_OFFICE' && designation !== NATIONAL_OPS) {
    if (placement.officeUnitId) {
      suggestions.push({ scopeType: 'HEAD_OFFICE', orgUnitId: placement.officeUnitId, source: 'MANUAL', recommended: false, label: 'Everyone at the head office', reason: 'For head office roles that look after head office staff.' });
    }
    suggestions.push({ scopeType: 'ALL_INDIA', source: 'MANUAL', recommended: false, label: 'All of India', reason: 'For head office HR / director roles that see every employee.' });
  }
  return suggestions;
};

/** The confirmed date must be a real day, not in the future (India), and not unreasonably far before the plan. */
export const describeJoiningDateProblem = (actual: string, today: string, plannedOrNull: string | null) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(actual) || Number.isNaN(new Date(`${actual}T00:00:00.000Z`).getTime()) || new Date(`${actual}T00:00:00.000Z`).toISOString().slice(0, 10) !== actual) {
    return 'Enter the date the person actually joined.';
  }
  if (actual > today) return 'The joining date cannot be in the future. Confirm joining on (or after) the day they join.';
  const earliest = new Date(`${(plannedOrNull && plannedOrNull < today ? plannedOrNull : today)}T00:00:00.000Z`);
  earliest.setUTCDate(earliest.getUTCDate() - 90);
  if (actual < earliest.toISOString().slice(0, 10)) return 'The joining date is more than 90 days before the planned date. Check it.';
  return null;
};
