import { HrmHttpError } from './errors';

/**
 * The date rules of the assignment timeline, kept free of the database so they can be tested on their own.
 * An employee's assignments form a timeline: the open-ended one is current, a change closes it the day before the
 * next one starts, so history is never edited, only extended.
 */

const DAY_MS = 86_400_000;
/** How far back a change may be dated (late data entry) and how far ahead it may be scheduled. */
export const MAX_BACKDATE_DAYS = 90;
export const MAX_SCHEDULE_DAYS = 365;

/**
 * Today as a DATE value (UTC midnight) for the Indian calendar day. The name is kept for the many callers; it used to
 * be the UTC day, which made transfers and joinings take effect 5h30 late (and disagree with access scopes).
 */
export const utcToday = (now = new Date()) =>
  new Date(`${new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)}T00:00:00.000Z`);
export const parseDay = (value: string) => new Date(`${value}T00:00:00.000Z`);
export const toDay = (date: Date) => date.toISOString().slice(0, 10);
export const addDays = (date: Date, days: number) => new Date(date.getTime() + days * DAY_MS);

export type ChangePlan = { kind: 'END'; effectiveTo: Date } | { kind: 'CANCEL' };

/**
 * What happens to the open assignment when a change starts on `newFrom`.
 *  - after it began: it ends the day before the change;
 *  - the same day it began: it is replaced (cancelled), because it never had a full day of its own;
 *  - before it began: refused.
 */
export const planAssignmentChange = (input: { pivotFrom: Date; newFrom: Date; today: Date }): ChangePlan => {
  const { pivotFrom, newFrom, today } = input;
  if (newFrom.getTime() < today.getTime() - MAX_BACKDATE_DAYS * DAY_MS) {
    throw new HrmHttpError(400, 'DATE_TOO_OLD', `The change date cannot be more than ${MAX_BACKDATE_DAYS} days in the past.`);
  }
  if (newFrom.getTime() > today.getTime() + MAX_SCHEDULE_DAYS * DAY_MS) {
    throw new HrmHttpError(400, 'DATE_TOO_FAR', 'The change date cannot be more than a year ahead.');
  }
  if (newFrom.getTime() < pivotFrom.getTime()) {
    throw new HrmHttpError(409, 'BEFORE_CURRENT_ASSIGNMENT', `The change cannot start before the current assignment began on ${toDay(pivotFrom)}.`);
  }
  if (newFrom.getTime() === pivotFrom.getTime()) return { kind: 'CANCEL' };
  return { kind: 'END', effectiveTo: addDays(newFrom, -1) };
};

/**
 * The assignment an employee's access scope is judged by: the one in force today, or - for somebody who has not
 * started yet (joining date ahead, or the first hours of the day in India while UTC is still yesterday) - the one
 * that starts next. Without this fallback a new joiner would be invisible to the HR user who just added them.
 * Pass only ACTIVE rows that are still open (no end date, or an end date that is not before today).
 */
export const pickScopeAssignment = <T extends { effectiveFrom: Date }>(rows: readonly T[], today: Date): T | null => {
  let started: T | null = null;
  let upcoming: T | null = null;
  for (const row of rows) {
    if (row.effectiveFrom.getTime() <= today.getTime()) {
      if (!started || row.effectiveFrom.getTime() > started.effectiveFrom.getTime()) started = row;
    } else if (!upcoming || row.effectiveFrom.getTime() < upcoming.effectiveFrom.getTime()) {
      upcoming = row;
    }
  }
  return started ?? upcoming;
};

/**
 * The assignments an employee's access scope is judged by (any of them matching is enough):
 * every open ACTIVE row in force today; or, for somebody with none in force yet, every upcoming one (a joiner whose
 * first placement and an already scheduled transfer are both visible to the people who will manage them).
 * The database filter in scopeWhere.ts applies exactly this rule.
 */
export const pickScopeAssignments = <T extends { effectiveFrom: Date }>(rows: readonly T[], today: Date): T[] => {
  const started = rows.filter((row) => row.effectiveFrom.getTime() <= today.getTime());
  return started.length ? started : rows.filter((row) => row.effectiveFrom.getTime() > today.getTime());
};
