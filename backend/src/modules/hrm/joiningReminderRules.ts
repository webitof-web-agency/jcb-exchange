import { allowedAdminPermissions } from '../../utils/adminPermissions';
import { istToday } from './istDate';
import type { ChecklistItem } from './onboardingChecklist';
import { kindOfUnit } from './organisationCodes';
import { HRM_PERMISSIONS, hasHrmPermission, resolveHrmPermissions } from './security';

/**
 * The joining reminder (pure: no database). One day before somebody joins, while their joining checklist still has
 * required items open, the HR users who manage onboarding for that person and the State Manager of their office get
 * a reminder: in the app, and on WhatsApp / SMS / email once HR switches RECRUITMENT_JOINING_REMINDER on.
 *
 * The job wakes every few minutes but acts once per Indian day after 09:00, plus a catch-up at start-up, so a server
 * that was down at 09:00 still sends. Every message carries a unique dedupe key (notification, WhatsApp, SMS, email),
 * so a second run on the same day - a restart, a second server - sends nothing twice.
 */

export const REMINDER_TIMEZONE = 'Asia/Kolkata';
export const REMINDER_START_HOUR = 9;
/** A failed run is tried again on the next wake-ups (every 5 minutes), up to this many times a day, then left. */
export const MAX_RUN_ATTEMPTS_PER_DAY = 12;
const DAY_MS = 86_400_000;

/** The people who have not joined yet (Confirm joining moves them to ACTIVE). */
export const JOINING_REMINDER_STATUSES = ['DRAFT', 'PRE_ONBOARDING', 'ONBOARDING'] as const;
/** An onboarding case that is still being worked on (the same list as the Onboarding screen's "Open"). */
export const OPEN_CASE_STATUSES = ['NEEDS_REVIEW', 'PENDING', 'IN_PROGRESS', 'READY_FOR_APPROVAL'] as const;
const INTERNAL_ROLES = new Set(['SUPER_ADMIN', 'ADMIN', 'EMPLOYEE']);

export const dayKey = (date: Date) => date.toISOString().slice(0, 10);

export const istHour = (now: Date) =>
  Number(new Intl.DateTimeFormat('en-GB', { timeZone: REMINDER_TIMEZONE, hour: '2-digit', hourCycle: 'h23' }).format(now));

/** The Indian day a run belongs to and the joining day it reminds about (tomorrow), as UTC-midnight DATE values. */
export const reminderDays = (now: Date) => {
  const today = istToday(now);
  const joiningDay = new Date(today.getTime() + DAY_MS);
  return { today, todayKey: dayKey(today), joiningDay, joiningDayKey: dayKey(joiningDay) };
};

// ---- once per Indian day ----

export type ReminderRunState = { day: string | null; done: boolean; attempts: number };
export const initialReminderRunState: ReminderRunState = { day: null, done: false, attempts: 0 };

export type ReminderRunPlan =
  | { run: true; day: string; attempt: number }
  | { run: false; reason: 'BEFORE_START' | 'DONE_TODAY' | 'GAVE_UP_TODAY' };

export const planReminderRun = (now: Date, state: ReminderRunState): ReminderRunPlan => {
  if (istHour(now) < REMINDER_START_HOUR) return { run: false, reason: 'BEFORE_START' };
  const { todayKey } = reminderDays(now);
  if (state.day !== todayKey) return { run: true, day: todayKey, attempt: 1 };
  if (state.done) return { run: false, reason: 'DONE_TODAY' };
  if (state.attempts >= MAX_RUN_ATTEMPTS_PER_DAY) return { run: false, reason: 'GAVE_UP_TODAY' };
  return { run: true, day: todayKey, attempt: state.attempts + 1 };
};

/** Only a run with no failures closes the day; a partial one is run again (the dedupe keys skip what was sent). */
export const recordReminderRun = (state: ReminderRunState, day: string, ok: boolean): ReminderRunState => ({
  day,
  done: ok,
  attempts: state.day === day ? state.attempts + 1 : 1,
});

/**
 * The wake-up logic of the job, without the timer: runs `run` when the plan says so, remembers the day, and never
 * lets two runs overlap in this process. A thrown error counts as a failed run.
 */
export const createReminderRunner = <R extends { failed: number }>(run: (now: Date) => Promise<R>) => {
  let state = initialReminderRunState;
  let running = false;
  return {
    state: () => state,
    wake: async (now = new Date()) => {
      if (running) return { skipped: 'RUNNING' as const };
      const plan = planReminderRun(now, state);
      if (!plan.run) return { skipped: plan.reason };
      running = true;
      try {
        const result = await run(now);
        state = recordReminderRun(state, plan.day, result.failed === 0);
        return { ran: true as const, attempt: plan.attempt, result };
      } catch (error) {
        state = recordReminderRun(state, plan.day, false);
        throw error;
      } finally {
        running = false;
      }
    },
  };
};

// ---- who is due ----

export type ReminderCandidate = { status: string; archivedAt: Date | null; joinedOn: Date | null; hasOpenCase: boolean };

/** Joins tomorrow, has not joined yet, is not archived, has an open case and the checklist is not complete. */
export const isJoiningReminderDue = (candidate: ReminderCandidate, joiningDay: Date, missingRequired: readonly string[]) =>
  (JOINING_REMINDER_STATUSES as readonly string[]).includes(candidate.status)
  && !candidate.archivedAt
  && candidate.hasOpenCase
  && candidate.joinedOn !== null
  && candidate.joinedOn.getTime() === joiningDay.getTime()
  && missingRequired.length > 0;

/** "PAN verified, Salary bank account and 2 more": short enough for an SMS / WhatsApp variable. */
export const describeMissingItems = (items: readonly ChecklistItem[], missingKeys: readonly string[], maxItems = 4) => {
  const labels = missingKeys.map((key) => items.find((item) => item.key === key)?.label ?? key);
  if (labels.length <= maxItems) return labels.join(', ');
  return `${labels.slice(0, maxItems).join(', ')} and ${labels.length - maxItems} more`;
};

/** The assignment in force on the day, otherwise the first one still to come (same rule as Confirm joining). */
export const pickPlacementOn = <T extends { effectiveFrom: Date; effectiveTo: Date | null }>(rows: readonly T[], day: Date): T | null => {
  const open = rows
    .filter((row) => !row.effectiveTo || row.effectiveTo.getTime() >= day.getTime())
    .sort((a, b) => a.effectiveFrom.getTime() - b.effectiveFrom.getTime());
  return open.filter((row) => row.effectiveFrom.getTime() <= day.getTime()).pop() ?? open[0] ?? null;
};

export type StateOfficeTarget = { officeUnitId: string } | { stateId: number };

/**
 * Whose State Manager is told: the state office the person is placed in. Head office joiners have no State Manager
 * (a state scope does not cover head office staff); an assignment with a state but no office looks up that state's
 * office.
 */
export const stateOfficeTarget = (placement: { stateId: number | null; officeUnit: { id: string; type: string; stateId: number | null } | null } | null): StateOfficeTarget | null => {
  if (!placement) return null;
  if (placement.officeUnit) return kindOfUnit(placement.officeUnit) === 'STATE' ? { officeUnitId: placement.officeUnit.id } : null;
  return placement.stateId ? { stateId: placement.stateId } : null;
};

// ---- who is told ----

export type StaffContact = { id: string; role: string; status: string; email: string | null; mobile: string | null; whatsappNumber: string | null };
export type StaffPermissions = { role: string; customRole: { permissions: readonly string[] } | null; adminPermissions: ReadonlyArray<{ permission: string }> };

/**
 * Holds hrm.onboarding.manage, read the same way as getHrmPermissions / loadOperatorPermissions: the custom role's list
 * when the login has a role, otherwise its direct grants (unknown permissions ignored). A Super Admin holds everything.
 */
export const managesOnboarding = (user: StaffPermissions) => {
  if (!INTERNAL_ROLES.has(user.role)) return false;
  const known = (list: readonly string[]) => list.filter((permission) => allowedAdminPermissions.has(permission));
  const permissions = resolveHrmPermissions(
    user.role,
    user.customRole ? known(Array.isArray(user.customRole.permissions) ? user.customRole.permissions : []) : null,
    known(user.adminPermissions.map((item) => item.permission)),
  );
  return hasHrmPermission(permissions, HRM_PERMISSIONS.ONBOARDING_MANAGE);
};

export type ReminderRecipient = { userId: string; role: string; email: string | null; phone: string | null; reason: 'HR' | 'STATE_MANAGER' };

/**
 * One reminder per person: HR users first, then the State Manager(s) (who are told even without the permission).
 * Switched-off logins, non-staff accounts and the joiner's own login (a re-hire's) are left out.
 */
export const mergeReminderRecipients = (input: { hr: readonly StaffContact[]; stateManagers: readonly StaffContact[]; joinerUserId: string | null }): ReminderRecipient[] => {
  const seen = new Set<string>();
  const result: ReminderRecipient[] = [];
  const add = (user: StaffContact, reason: ReminderRecipient['reason']) => {
    if (seen.has(user.id) || user.id === input.joinerUserId) return;
    if (user.status !== 'ACTIVE' || !INTERNAL_ROLES.has(user.role)) return;
    seen.add(user.id);
    result.push({
      userId: user.id,
      role: user.role,
      email: user.email?.trim() || null,
      phone: user.whatsappNumber?.trim() || user.mobile?.trim() || null,
      reason,
    });
  };
  for (const user of input.hr) add(user, 'HR');
  for (const user of input.stateManagers) add(user, 'STATE_MANAGER');
  return result;
};

/** Staff messages: Super Admins as SUPER_ADMIN, everybody else as RECRUITER (the recruitment staff recipient type). */
export const reminderRecipientType = (role: string) => (role === 'SUPER_ADMIN' ? 'SUPER_ADMIN' as const : 'RECRUITER' as const);

/** A Super Admin works in /admin; every other staff login (ADMIN included) in /employee. */
export const onboardingPathFor = (role: string) => (role === 'SUPER_ADMIN' ? '/admin/hrm/onboarding' : '/employee/hrm/onboarding');

/** The portal page as a full address when ADMIN_PORTAL_URL is set (messages leave the app), otherwise the path. */
export const portalUrl = (path: string, origin: string | null | undefined) => {
  const base = origin?.trim().replace(/\/+$/, '') ?? '';
  return /^https?:\/\//i.test(base) ? `${base}${path}` : path;
};

export const reminderNotificationKey = (employeeId: string, joiningDayKey: string, userId: string) =>
  `hrm-joining-reminder:${employeeId}:${joiningDayKey}:${userId}`;

/** The message logs' related entity: one reminder per person per joining date (a moved date is reminded again). */
export const reminderRelatedEntityId = (employeeId: string, joiningDayKey: string) => `${employeeId}:${joiningDayKey}`;

// ---- what is said ----

export type JoinerSummary = {
  employeeId: string;
  employeeName: string;
  employeeCode: string;
  designation: string;
  joiningDate: string;
  officeName: string;
  stateName: string;
  missingItems: string;
  /** How many required checklist items are open (the SMS text). */
  missingCount?: number;
};

/**
 * A DLT SMS variable holds about 30 characters, far less than the checklist labels ("Department, designation and
 * office" alone is 34), so SMS gets a count ("3 items pending"); WhatsApp, email and in-app keep the full list.
 */
export const describeMissingItemsShort = (count: number) => (count <= 0 ? 'Checklist complete' : `${count} item${count === 1 ? '' : 's'} pending`);

/** The RECRUITMENT_JOINING_REMINDER payload (the template variables). The onboarding page is not a secret link. */
export const buildReminderPayload = (joiner: JoinerSummary, onboardingUrl: string) => ({
  employeeName: joiner.employeeName,
  employeeCode: joiner.employeeCode,
  designation: joiner.designation,
  joiningDate: joiner.joiningDate,
  officeName: joiner.officeName,
  stateName: joiner.stateName,
  missingItems: joiner.missingItems,
  missingItemsShort: describeMissingItemsShort(joiner.missingCount ?? 0),
  onboardingUrl,
});

/** Reasons a channel gives for not sending that are expected (switched off, no number...), not a failure to retry. */
const EXPECTED_SKIPS = new Set([
  'RULE_DISABLED', 'TEMPLATE_DISABLED', 'MESSAGE_ID_REQUIRED', 'RECIPIENT_MISSING', 'NOTIFICATION_PREFERENCE_DISABLED',
  'SETTINGS_DISABLED', 'INTEGRATION_DISABLED', 'ALREADY_QUEUED', 'UNSUPPORTED_EVENT', 'INVALID_TEMPLATE_CONFIGURATION',
]);

/**
 * Whether a channel's answer means "could not be queued, try again later": a thrown error, an explicit DISPATCH_ERROR,
 * or a refusal that carries an error and no expected reason. A duplicate means it already went out.
 */
export const channelDispatchFailed = (result: unknown): boolean => {
  if (result instanceof Error) return true;
  if (!result || typeof result !== 'object') return false;
  const outcome = result as { queued?: unknown; duplicate?: unknown; reason?: unknown; error?: unknown };
  if (outcome.queued === true || outcome.duplicate === true) return false;
  if (outcome.reason === 'DISPATCH_ERROR') return true;
  if (typeof outcome.reason === 'string' && EXPECTED_SKIPS.has(outcome.reason)) return false;
  return outcome.queued === false && typeof outcome.error === 'string' && Boolean(outcome.error);
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "2026-11-26" -> "26 Nov 2026" (the in-app text; the payload keeps YYYY-MM-DD like the other events). */
export const friendlyDay = (value: string) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  const month = match ? MONTHS[Number(match[2]) - 1] : undefined;
  return match && month ? `${Number(match[3])} ${month} ${match[1]}` : value;
};

export const buildReminderNotification = (joiner: JoinerSummary) => ({
  title: `Joining tomorrow: ${joiner.employeeName}`,
  message: `${joiner.employeeName} (${joiner.employeeCode})${joiner.designation ? `, ${joiner.designation},` : ''} joins on ${friendlyDay(joiner.joiningDate)}${joiner.officeName ? ` at ${joiner.officeName}` : ''}. Still open on the joining checklist: ${joiner.missingItems}.`,
});
