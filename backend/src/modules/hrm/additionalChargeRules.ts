/**
 * The date rules of an additional charge (a state office looked after on top of the person's own posting), free of
 * the database so they can be tested on their own. Dates are calendar days (UTC midnight), the last day included.
 */
import { addDays, MAX_BACKDATE_DAYS, MAX_SCHEDULE_DAYS, toDay } from './assignmentTimeline';

export type ChargeState = 'UPCOMING' | 'ACTIVE' | 'ENDED' | 'CANCELLED';
export type ChargePeriod = { status: string; effectiveFrom: Date; effectiveTo: Date | null };

export const chargeState = (charge: ChargePeriod, today: Date): ChargeState => {
  if (charge.status === 'CANCELLED') return 'CANCELLED';
  if (charge.effectiveFrom.getTime() > today.getTime()) return 'UPCOMING';
  if (charge.effectiveTo && charge.effectiveTo.getTime() < today.getTime()) return 'ENDED';
  return 'ACTIVE';
};

/** Prisma filter: charges running today. */
export const activeChargeWhere = (today: Date) => ({
  status: 'ACTIVE',
  effectiveFrom: { lte: today },
  OR: [{ effectiveTo: null }, { effectiveTo: { gte: today } }],
});

/** Prisma filter: charges running today or still to come. */
export const openChargeWhere = (today: Date) => ({
  status: 'ACTIVE',
  OR: [{ effectiveTo: null }, { effectiveTo: { gte: today } }],
});

/** Two inclusive periods (a null end runs on for ever) share at least one day. */
export const periodsOverlap = (
  a: { from: Date; to: Date | null },
  b: { from: Date; to: Date | null },
) => (!b.to || a.from.getTime() <= b.to.getTime()) && (!a.to || b.from.getTime() <= a.to.getTime());

/** Why these dates cannot be used for a new charge; null when they are fine. */
export const chargeDateProblem = (input: { from: Date; to: Date | null; today: Date }): { path: 'effectiveFrom' | 'effectiveTo'; message: string } | null => {
  const { from, to, today } = input;
  if (from.getTime() < addDays(today, -MAX_BACKDATE_DAYS).getTime()) return { path: 'effectiveFrom', message: `The first day cannot be more than ${MAX_BACKDATE_DAYS} days in the past.` };
  if (from.getTime() > addDays(today, MAX_SCHEDULE_DAYS).getTime()) return { path: 'effectiveFrom', message: 'The first day cannot be more than a year ahead.' };
  if (to && to.getTime() < from.getTime()) return { path: 'effectiveTo', message: 'The last day cannot be before the first day.' };
  if (to && to.getTime() < today.getTime()) return { path: 'effectiveTo', message: 'The last day cannot be in the past.' };
  return null;
};

/** Why the last day of a charge cannot be changed to `to` (null = open ended); null when it can. */
export const chargeEndChangeProblem = (charge: ChargePeriod, to: Date | null, today: Date): string | null => {
  const state = chargeState(charge, today);
  if (state === 'CANCELLED' || state === 'ENDED') return 'This charge is over. Give a new one instead.';
  if (to && to.getTime() < charge.effectiveFrom.getTime()) return 'The last day cannot be before the first day. Cancel the charge instead.';
  if (to && to.getTime() < today.getTime()) return `The last day cannot be before today (${toDay(today)}). Use "End charge" to stop it.`;
  return null;
};

export type ChargeEndPlan =
  | { kind: 'NONE' }
  /** It ends before it ever started: it never takes effect, and neither does its access. */
  | { kind: 'CANCEL'; scopeEnd: Date }
  | { kind: 'END'; effectiveTo: Date; scopeEnd: Date };

/** What ending a charge with `lastDay` as its last day does. Ending never extends a charge. */
export const planChargeEnd = (charge: ChargePeriod, lastDay: Date): ChargeEndPlan => {
  if (charge.status === 'CANCELLED') return { kind: 'NONE' };
  if (charge.effectiveTo && charge.effectiveTo.getTime() <= lastDay.getTime()) return { kind: 'NONE' };
  if (lastDay.getTime() < charge.effectiveFrom.getTime()) return { kind: 'CANCEL', scopeEnd: addDays(charge.effectiveFrom, -1) };
  return { kind: 'END', effectiveTo: lastDay, scopeEnd: lastDay };
};
