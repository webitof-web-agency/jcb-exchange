import type { HrmHoliday, HrmOnboardingStatus, HrmShiftPayload } from './hrmApi';

/**
 * Pure helpers for the Onboarding page and the Shifts / Holidays masters (no React, no API), so the rules are
 * tested once and the screens stay thin. Shift rules mirror backend/src/modules/hrm/shiftRules.ts.
 */

// ---- onboarding status ----

export const OPEN_ONBOARDING_STATUSES: HrmOnboardingStatus[] = ['NEEDS_REVIEW', 'PENDING', 'IN_PROGRESS', 'READY_FOR_APPROVAL'];

export type OnboardingChip = 'OPEN' | 'NEEDS_REVIEW' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED' | 'ALL';

export const ONBOARDING_CHIPS: Array<{ id: OnboardingChip; label: string }> = [
  { id: 'OPEN', label: 'Open' },
  { id: 'NEEDS_REVIEW', label: 'Needs review' },
  { id: 'IN_PROGRESS', label: 'In progress' },
  { id: 'COMPLETED', label: 'Joined' },
  { id: 'CANCELLED', label: 'Cancelled' },
  { id: 'ALL', label: 'All' },
];

const STATUS_LABELS: Record<HrmOnboardingStatus, string> = {
  PENDING: 'Pending',
  NEEDS_REVIEW: 'Needs review',
  IN_PROGRESS: 'In progress',
  READY_FOR_APPROVAL: 'Ready to join',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  CANCELLED: 'Cancelled',
  COMPLETED: 'Joined',
};

export const onboardingStatusLabel = (status: string) => STATUS_LABELS[status as HrmOnboardingStatus] ?? status.replace(/_/g, ' ').toLowerCase();

export const onboardingStatusClass = (status: string) => {
  if (status === 'NEEDS_REVIEW') return 'bg-amber-50 text-amber-800 ring-amber-600/30';
  if (status === 'COMPLETED' || status === 'APPROVED') return 'bg-emerald-50 text-emerald-700 ring-emerald-600/20';
  if (status === 'CANCELLED' || status === 'REJECTED') return 'bg-slate-100 text-slate-600 ring-slate-500/20';
  return 'bg-sky-50 text-sky-700 ring-sky-600/20';
};

/** Chip counts from the server's per-status counts (Open = every not-finished status). */
export const onboardingChipCounts = (counts: Partial<Record<string, number>>): Record<OnboardingChip, number> => {
  const of = (status: string) => counts[status] ?? 0;
  const all = Object.values(counts).reduce<number>((total, value) => total + (value ?? 0), 0);
  return {
    OPEN: OPEN_ONBOARDING_STATUSES.reduce((total, status) => total + of(status), 0),
    NEEDS_REVIEW: of('NEEDS_REVIEW'),
    IN_PROGRESS: of('IN_PROGRESS'),
    COMPLETED: of('COMPLETED'),
    CANCELLED: of('CANCELLED'),
    ALL: all,
  };
};

/** The status filter sent to the server for a chip (the chip ids are the server's filter values). */
export const chipToStatusFilter = (chip: OnboardingChip): 'OPEN' | 'ALL' | HrmOnboardingStatus => chip;

// ---- joining date ----

export type JoiningTone = 'overdue' | 'soon' | 'later' | 'none';

const dayKey = (value: Date) => Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate());
/** Today in India (Asia/Kolkata): between 00:00 and 05:30 IST the UTC date is still yesterday. */
const indiaDayKey = (now: Date) => {
  const [year, month, day] = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now).split('-').map(Number);
  return Date.UTC(year!, month! - 1, day!);
};

/** Overdue (joining date passed while still open), within 7 days, later, or no date. */
export const joiningTone = (targetJoiningDate: string | null | undefined, status: string, now = new Date()): JoiningTone => {
  if (!targetJoiningDate) return 'none';
  const date = new Date(targetJoiningDate);
  if (Number.isNaN(date.getTime())) return 'none';
  const days = Math.round((dayKey(date) - indiaDayKey(now)) / 86_400_000);
  if (days < 0 && (OPEN_ONBOARDING_STATUSES as string[]).includes(status)) return 'overdue';
  if (days >= 0 && days <= 7) return 'soon';
  return 'later';
};

export const describeJoining = (targetJoiningDate: string | null | undefined, status: string, now = new Date()) => {
  if (!targetJoiningDate) return 'No joining date';
  const date = new Date(targetJoiningDate);
  if (Number.isNaN(date.getTime())) return 'No joining date';
  const days = Math.round((dayKey(date) - indiaDayKey(now)) / 86_400_000);
  const formatted = new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeZone: 'UTC' }).format(date);
  if (!(OPEN_ONBOARDING_STATUSES as string[]).includes(status)) return formatted;
  if (days < 0) return `${formatted} · ${-days} day${days === -1 ? '' : 's'} overdue`;
  if (days === 0) return `${formatted} · today`;
  if (days === 1) return `${formatted} · tomorrow`;
  return `${formatted} · in ${days} days`;
};

export const progressTone = (percent: number) => (percent >= 100 ? 'bg-emerald-500' : percent >= 60 ? 'bg-amber-400' : 'bg-rose-400');

/** What a cancelled joining did to the HR record, in words. */
export const describeCancelOutcome = (outcome: 'ARCHIVED' | 'EXITED_AGAIN' | null | undefined) =>
  outcome === 'ARCHIVED' ? 'Joining cancelled. The record was archived (nothing was deleted).'
    : outcome === 'EXITED_AGAIN' ? 'Joining cancelled. Their earlier record is back to Exited.'
      : 'Joining cancelled.';

export const describeResolveOutcome = (result: { outcome: string; notes?: string[] }) => {
  const notes = result.notes?.length ? ` ${result.notes.join(' ')}` : '';
  switch (result.outcome) {
    case 'CREATED': return `A new HR record was created.${notes}`;
    case 'REHIRED': return `The earlier HR record was re-opened for the re-hire.${notes}`;
    case 'ALREADY_DONE': return 'This person is already in HRM.';
    case 'DISMISSED': return 'The case was closed.';
    case 'NEEDS_REVIEW': return `It still needs review.${notes}`;
    default: return `Done.${notes}`;
  }
};

/** A reason the server accepts (3 to 1000 characters); null when fine. */
export const reasonProblem = (reason: string) => {
  const text = reason.trim();
  if (text.length < 3) return 'Give a reason (at least 3 characters).';
  if (text.length > 1000) return 'Keep the reason under 1000 characters.';
  return null;
};

// ---- shifts ----

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const minutesOf = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));

export const shiftLengthMinutes = (startTime: string, endTime: string, isNightShift: boolean) => {
  const start = minutesOf(startTime);
  const end = minutesOf(endTime);
  return end > start && !isNightShift ? end - start : end + 1440 - start;
};

export const formatMinutes = (minutes: number | null | undefined) => {
  if (minutes === null || minutes === undefined) return '—';
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return hours ? `${hours}h${rest ? ` ${rest}m` : ''}` : `${rest}m`;
};

export type ShiftForm = {
  name: string; startTime: string; endTime: string; breakMinutes: string; graceMinutes: string;
  halfDayMinutes: string; fullDayMinutes: string; isNightShift: boolean; isActive: boolean;
};
export type ShiftFormErrors = Partial<Record<keyof ShiftForm, string>>;

export const emptyShiftForm = (): ShiftForm => ({
  name: '', startTime: '09:30', endTime: '18:30', breakMinutes: '60', graceMinutes: '15',
  halfDayMinutes: '240', fullDayMinutes: '480', isNightShift: false, isActive: true,
});

const wholeNumber = (value: string) => (value.trim() === '' ? null : /^\d+$/.test(value.trim()) ? Number(value.trim()) : Number.NaN);

/** Same checks as the server (shiftRules.ts + the schema limits). */
export const validateShiftForm = (form: ShiftForm): ShiftFormErrors => {
  const errors: ShiftFormErrors = {};
  if (!form.name.trim()) errors.name = 'Enter a name.';
  else if (form.name.trim().length > 80) errors.name = 'Keep the name under 80 characters.';
  if (!TIME.test(form.startTime)) errors.startTime = 'Use HH:MM (24-hour).';
  if (!TIME.test(form.endTime)) errors.endTime = 'Use HH:MM (24-hour).';
  const breakMinutes = wholeNumber(form.breakMinutes);
  const grace = wholeNumber(form.graceMinutes);
  const half = wholeNumber(form.halfDayMinutes);
  const full = wholeNumber(form.fullDayMinutes);
  if (breakMinutes !== null && (Number.isNaN(breakMinutes) || breakMinutes > 480)) errors.breakMinutes = 'Enter 0–480 minutes.';
  if (grace !== null && (Number.isNaN(grace) || grace > 240)) errors.graceMinutes = 'Enter 0–240 minutes.';
  if (half !== null && (Number.isNaN(half) || half < 30 || half > 1440)) errors.halfDayMinutes = 'Enter 30–1440 minutes, or leave empty.';
  if (full !== null && (Number.isNaN(full) || full < 30 || full > 1440)) errors.fullDayMinutes = 'Enter 30–1440 minutes, or leave empty.';
  if (errors.startTime || errors.endTime) return errors;
  if (form.startTime === form.endTime) { errors.endTime = 'The start and end time cannot be the same.'; return errors; }
  if (!form.isNightShift && minutesOf(form.endTime) < minutesOf(form.startTime)) {
    errors.endTime = 'The shift ends before it starts. Tick "Night shift" if it ends the next day.';
    return errors;
  }
  const length = shiftLengthMinutes(form.startTime, form.endTime, form.isNightShift);
  if (!errors.breakMinutes && (breakMinutes ?? 0) >= length) errors.breakMinutes = 'The break is longer than the shift.';
  if (!errors.halfDayMinutes && !errors.fullDayMinutes && half !== null && full !== null && half >= full) errors.halfDayMinutes = 'Half-day minutes must be less than full-day minutes.';
  if (!errors.fullDayMinutes && full !== null && full > length) errors.fullDayMinutes = 'Full-day minutes are more than the shift is long.';
  return errors;
};

export const shiftPayloadFromForm = (form: ShiftForm): HrmShiftPayload => ({
  name: form.name.trim(),
  startTime: form.startTime,
  endTime: form.endTime,
  breakMinutes: wholeNumber(form.breakMinutes) ?? 0,
  graceMinutes: wholeNumber(form.graceMinutes) ?? 0,
  halfDayMinutes: wholeNumber(form.halfDayMinutes),
  fullDayMinutes: wholeNumber(form.fullDayMinutes),
  isNightShift: form.isNightShift,
  isActive: form.isActive,
});

export const shiftFormFrom = (shift: HrmShiftPayload): ShiftForm => ({
  name: shift.name, startTime: shift.startTime, endTime: shift.endTime,
  breakMinutes: String(shift.breakMinutes ?? 0), graceMinutes: String(shift.graceMinutes ?? 0),
  halfDayMinutes: shift.halfDayMinutes === null || shift.halfDayMinutes === undefined ? '' : String(shift.halfDayMinutes),
  fullDayMinutes: shift.fullDayMinutes === null || shift.fullDayMinutes === undefined ? '' : String(shift.fullDayMinutes),
  isNightShift: shift.isNightShift, isActive: shift.isActive,
});

// ---- holidays ----

/** Holidays grouped by month (in date order), for the list. */
export const groupHolidaysByMonth = (holidays: readonly HrmHoliday[]) => {
  const groups: Array<{ key: string; label: string; holidays: HrmHoliday[] }> = [];
  const sorted = [...holidays].sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name));
  for (const holiday of sorted) {
    const date = new Date(holiday.date);
    const key = holiday.date.slice(0, 7);
    let group = groups.find((entry) => entry.key === key);
    if (!group) {
      group = { key, label: new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(date), holidays: [] };
      groups.push(group);
    }
    group.holidays.push(holiday);
  }
  return groups;
};

export const holidayScopeLabel = (holiday: Pick<HrmHoliday, 'scope' | 'stateName'>) => (holiday.scope === 'ALL_INDIA' ? 'All India' : holiday.stateName ?? 'State');

export type HolidayForm = { date: string; name: string; scope: 'ALL_INDIA' | 'STATE'; stateId: string; isOptional: boolean };
export type HolidayFormErrors = Partial<Record<keyof HolidayForm, string>>;

export const validateHolidayForm = (form: HolidayForm): HolidayFormErrors => {
  const errors: HolidayFormErrors = {};
  if (!/^\d{4}-\d{2}-\d{2}$/.test(form.date) || Number.isNaN(new Date(`${form.date}T00:00:00Z`).getTime())) errors.date = 'Choose the date.';
  if (!form.name.trim()) errors.name = 'Enter the holiday name.';
  else if (form.name.trim().length > 120) errors.name = 'Keep the name under 120 characters.';
  if (form.scope === 'STATE' && !form.stateId) errors.stateId = 'Choose the state.';
  return errors;
};

/** The year list for the selector: last year to two years ahead, plus the chosen one. */
export const holidayYears = (now = new Date(), chosen?: number) => {
  const current = now.getFullYear();
  const years = [current - 1, current, current + 1, current + 2];
  if (chosen && !years.includes(chosen)) years.push(chosen);
  return years.sort((a, b) => a - b);
};

// ---- coverage: managers joining ----

export type UpcomingManager = { id: string; employeeCode: string; name: string; joiningDate: string };

export const describeUpcomingManagers = (managers: readonly UpcomingManager[] | undefined) => {
  if (!managers?.length) return null;
  const first = managers[0]!;
  const date = new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(first.joiningDate));
  const more = managers.length > 1 ? ` (+${managers.length - 1} more)` : '';
  return `Manager joining: ${first.name} (${first.employeeCode}) on ${date}${more}`;
};

/** For a NEEDS_REVIEW case: the matched HR records that can be re-hired (somebody who left). */
export const rehireCandidates = <T extends { status: string }>(matches: readonly T[]): T[] =>
  matches.filter((match) => match.status === 'EXITED' || match.status === 'TERMINATED');

/**
 * Filters carried by a link to the Onboarding page (for example from the Reports page):
 * ?status=<status>&stateId=<number>&orgUnitId=<id>. Invalid values are ignored.
 */
export const readOnboardingLinkFilters = (search: string) => {
  const params = new URLSearchParams(search);
  const status = params.get('status');
  const chipIds = ONBOARDING_CHIPS.map((item) => item.id) as string[];
  const stateId = params.get('stateId') ?? '';
  const orgUnitId = (params.get('orgUnitId') ?? '').trim();
  return {
    chip: status ? (chipIds.includes(status) ? status as OnboardingChip : 'OPEN' as OnboardingChip) : null,
    stateId: /^[1-9]\d{0,9}$/.test(stateId) ? stateId : '',
    orgUnitId: orgUnitId.length <= 100 ? orgUnitId : '',
  };
};
