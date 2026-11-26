/**
 * The access review: who can see which states, and what looks wrong (a manager without a login or access, a State
 * Manager who can see the whole country, access nobody should still have...). Pure, so every rule can be tested.
 */
import { hasAllIndiaScope, hasHrmPermission } from './security';
import { recruitmentReachFrom } from '../../utils/recruitmentReachRules';

export type ReviewScope = { scopeType: string; stateId: number | null; source: string; activeFrom: Date; activeTo: Date | null };

export type ReviewUser = {
  userId: string;
  name: string;
  email: string | null;
  status: string;
  /** Account role: SUPER_ADMIN, ADMIN or EMPLOYEE. */
  role: string;
  roleName: string | null;
  /** Effective permissions (the role's, else the direct grants). */
  permissions: string[];
  employee: { id: string; employeeCode: string; name: string; status: string; archived: boolean } | null;
  /** Open access scopes: running or still to come. */
  scopes: ReviewScope[];
};

export type ReviewOfficeHolder = {
  employeeId: string;
  employeeCode: string;
  name: string;
  userId: string | null;
  kind: 'PRIMARY' | 'CHARGE';
  /** The last day of a charge (YYYY-MM-DD); null for a posting or an open-ended charge. */
  until: string | null;
};

export type ReviewOffice = { officeId: string; officeName: string; stateId: number; stateName: string; holders: ReviewOfficeHolder[] };

export type ReviewJob = { id: string; title: string; jobCode: string; location: string; status: string };

export type ReviewInput = {
  today: Date;
  users: ReviewUser[];
  offices: ReviewOffice[];
  jobsWithoutState: ReviewJob[];
  stateNames: ReadonlyMap<number, string>;
};

export type ReviewIssueCode =
  | 'MANAGER_NO_LOGIN' | 'MANAGER_NO_ACCESS' | 'MANAGER_NO_ROLE' | 'MANAGER_TOO_WIDE' | 'EXTRA_STATE_ACCESS'
  | 'STALE_ACCESS' | 'RECRUITMENT_NO_REACH' | 'CHARGE_ENDING' | 'VACANT_OFFICE' | 'JOB_NO_STATE';

export type ReviewSeverity = 'HIGH' | 'MEDIUM' | 'LOW';

export const REVIEW_ISSUES: Record<ReviewIssueCode, { severity: ReviewSeverity; title: string }> = {
  MANAGER_TOO_WIDE: { severity: 'HIGH', title: 'State Manager can see or change more than their states' },
  STALE_ACCESS: { severity: 'HIGH', title: 'Access of somebody who left or whose login is off' },
  MANAGER_NO_ACCESS: { severity: 'HIGH', title: 'State Manager without access to their state' },
  EXTRA_STATE_ACCESS: { severity: 'MEDIUM', title: 'Access to a state they do not manage' },
  MANAGER_NO_LOGIN: { severity: 'MEDIUM', title: 'State Manager without a login' },
  MANAGER_NO_ROLE: { severity: 'MEDIUM', title: 'State Manager without a permission role' },
  RECRUITMENT_NO_REACH: { severity: 'MEDIUM', title: 'Recruitment permission but no state' },
  VACANT_OFFICE: { severity: 'MEDIUM', title: 'State office without a manager' },
  CHARGE_ENDING: { severity: 'LOW', title: 'Additional charge ending soon' },
  JOB_NO_STATE: { severity: 'LOW', title: 'Job without a state' },
};

export const CHARGE_ENDING_DAYS = 15;
const LEFT_OR_HELD = new Set(['EXITED', 'TERMINATED', 'SUSPENDED']);
/** Things a State Manager's login should not have: they reach beyond their own states. */
export const WIDE_PERMISSIONS = [
  'ALL_ACCESS', 'hrm.scope.all', 'recruitment.scope.all',
  'users.read', 'users.create', 'users.update', 'users.delete', 'roles.create', 'roles.update', 'roles.delete',
] as const;

export type ReviewIssue = {
  code: ReviewIssueCode;
  severity: ReviewSeverity;
  title: string;
  detail: string;
  person: { userId: string | null; employeeId: string | null; employeeCode: string | null; name: string } | null;
  office: { id: string; name: string } | null;
  stateId: number | null;
  stateName: string | null;
  jobId: string | null;
};

const day = (date: Date) => date.toISOString().slice(0, 10);
const runningOn = (scope: ReviewScope, today: Date) => scope.activeFrom.getTime() <= today.getTime() && (!scope.activeTo || scope.activeTo.getTime() >= today.getTime());

/** How far a login reaches in HRM today. */
export const hrmReachOf = (user: ReviewUser, today: Date) => {
  const running = user.scopes.filter((scope) => runningOn(scope, today));
  const permissions = new Set(user.permissions);
  const allIndia = user.role === 'SUPER_ADMIN' || hasHrmPermission(permissions, 'hrm.scope.all') || hasAllIndiaScope(running);
  return {
    allIndia,
    stateIds: [...new Set(running.flatMap((scope) => (scope.scopeType === 'STATE' && scope.stateId ? [scope.stateId] : [])))],
    headOffice: running.some((scope) => scope.scopeType === 'HEAD_OFFICE'),
    directReports: running.some((scope) => scope.scopeType === 'DIRECT_REPORTS'),
    other: running.some((scope) => ['DEPARTMENT', 'TEAM', 'REGION'].includes(scope.scopeType)),
  };
};

const usesRecruitment = (user: ReviewUser) => user.permissions.some((permission) => permission.startsWith('recruitment.') && permission !== 'recruitment.scope.all');

/** What recruitment shows a login: everything, some states / head office, nothing, or it has no recruitment at all. */
export const recruitmentViewOf = (user: ReviewUser, today: Date): 'ALL' | 'STATES' | 'NONE' | 'NOT_USED' => {
  const all = user.role === 'SUPER_ADMIN' || user.permissions.includes('ALL_ACCESS');
  if (!all && !usesRecruitment(user)) return 'NOT_USED';
  const reach = recruitmentReachFrom({
    userId: user.userId, role: user.role, permissions: user.permissions,
    scopes: user.scopes.filter((scope) => runningOn(scope, today)),
  });
  if (reach.all) return 'ALL';
  return reach.stateIds.length || reach.headOffice ? 'STATES' : 'NONE';
};

const personOf = (user: ReviewUser) => ({
  userId: user.userId, employeeId: user.employee?.id ?? null, employeeCode: user.employee?.employeeCode ?? null, name: user.employee?.name ?? user.name,
});

export const findReviewIssues = (input: ReviewInput): ReviewIssue[] => {
  const { today, users, offices, stateNames } = input;
  const issues: ReviewIssue[] = [];
  const add = (code: ReviewIssueCode, detail: string, extra: Partial<Pick<ReviewIssue, 'person' | 'office' | 'stateId' | 'stateName' | 'jobId'>> = {}) => {
    issues.push({
      code, severity: REVIEW_ISSUES[code].severity, title: REVIEW_ISSUES[code].title, detail,
      person: null, office: null, stateId: null, stateName: null, jobId: null, ...extra,
    });
  };
  const userById = new Map(users.map((user) => [user.userId, user]));
  const managedStates = new Map<string, Set<number>>();
  const reviewedManagers = new Set<string>();

  for (const office of offices) {
    const place = { office: { id: office.officeId, name: office.officeName }, stateId: office.stateId, stateName: office.stateName };
    if (!office.holders.length) add('VACANT_OFFICE', `Nobody manages ${office.officeName}. Appoint a manager or give somebody an additional charge.`, place);
    for (const holder of office.holders) {
      const manager = { userId: holder.userId, employeeId: holder.employeeId, employeeCode: holder.employeeCode, name: holder.name };
      if (holder.kind === 'CHARGE' && holder.until) {
        const left = Math.round((new Date(`${holder.until}T00:00:00.000Z`).getTime() - today.getTime()) / 86_400_000);
        if (left >= 0 && left <= CHARGE_ENDING_DAYS) add('CHARGE_ENDING', `${holder.name}'s charge of ${office.officeName} ends on ${holder.until}.`, { ...place, person: manager });
      }
      const user = holder.userId ? userById.get(holder.userId) : undefined;
      if (!user) {
        add('MANAGER_NO_LOGIN', `${holder.name} manages ${office.officeName} but has no login.`, { ...place, person: manager });
        continue;
      }
      const states = managedStates.get(user.userId) ?? new Set<number>();
      states.add(office.stateId);
      managedStates.set(user.userId, states);
      const reach = hrmReachOf(user, today);
      if (!reach.allIndia && !reach.stateIds.includes(office.stateId)) {
        add('MANAGER_NO_ACCESS', `${holder.name} manages ${office.officeName} but cannot see ${office.stateName}. Give access on their profile.`, { ...place, person: manager });
      }
      if (reviewedManagers.has(user.userId)) continue;
      reviewedManagers.add(user.userId);
      if (user.role !== 'SUPER_ADMIN' && !user.permissions.length) {
        add('MANAGER_NO_ROLE', `${holder.name} manages a state but their login has no permission role.`, { ...place, person: manager });
      }
      const wide = WIDE_PERMISSIONS.filter((permission) => user.permissions.includes(permission)) as string[];
      if (user.role === 'SUPER_ADMIN') wide.unshift('Super Admin');
      if (user.scopes.some((scope) => scope.scopeType === 'ALL_INDIA' && runningOn(scope, today))) wide.push('All-India access');
      if (wide.length) add('MANAGER_TOO_WIDE', `${holder.name} has: ${wide.join(', ')}.`, { ...place, person: manager });
    }
  }

  for (const user of users) {
    const open = user.scopes.filter((scope) => !scope.activeTo || scope.activeTo.getTime() >= today.getTime());
    const gone = user.employee && (user.employee.archived || LEFT_OR_HELD.has(user.employee.status));
    if (open.length && (user.status !== 'ACTIVE' || gone)) {
      const why = gone ? `the person is ${user.employee!.archived ? 'archived' : user.employee!.status.toLowerCase().replace(/_/g, ' ')}` : `the login is ${user.status.toLowerCase().replace(/_/g, ' ')}`;
      add('STALE_ACCESS', `${open.length} access ${open.length === 1 ? 'entry is' : 'entries are'} still open although ${why}.`, { person: personOf(user) });
    }
    const managed = managedStates.get(user.userId);
    if (managed) {
      const extra = open.filter((scope) => scope.scopeType === 'STATE' && scope.stateId && runningOn(scope, today) && !managed.has(scope.stateId));
      for (const stateId of new Set(extra.map((scope) => scope.stateId!))) {
        const from = extra.find((scope) => scope.stateId === stateId)!;
        add('EXTRA_STATE_ACCESS', `Sees ${stateNames.get(stateId) ?? `state ${stateId}`} (since ${day(from.activeFrom)}) without managing it.`, {
          person: personOf(user), stateId, stateName: stateNames.get(stateId) ?? null,
        });
      }
    }
    if (user.status === 'ACTIVE' && recruitmentViewOf(user, today) === 'NONE') {
      add('RECRUITMENT_NO_REACH', 'Has recruitment permissions but no state, head office or all-India access, so recruitment shows nothing.', { person: personOf(user) });
    }
  }

  for (const job of input.jobsWithoutState) {
    add('JOB_NO_STATE', `${job.title} (${job.jobCode}), ${job.location}: choose its state and posting type, otherwise only all-India recruiters see it.`, { jobId: job.id });
  }

  const rank: Record<ReviewSeverity, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };
  return issues.sort((a, b) => rank[a.severity] - rank[b.severity] || a.code.localeCompare(b.code)
    || (a.person?.name ?? a.office?.name ?? '').localeCompare(b.person?.name ?? b.office?.name ?? ''));
};

export type ReviewPerson = {
  userId: string;
  name: string;
  email: string | null;
  loginStatus: string;
  roleName: string | null;
  accountRole: string;
  employee: { id: string; employeeCode: string; status: string } | null;
  hr: { allIndia: boolean; states: Array<{ id: number; name: string }>; headOffice: boolean; directReports: boolean; other: boolean };
  recruitment: 'ALL' | 'STATES' | 'NONE' | 'NOT_USED';
  manages: Array<{ officeId: string; officeName: string; kind: 'PRIMARY' | 'CHARGE'; until: string | null }>;
};

/** Every login that can use HRM or recruitment, or has any access, with how far it reaches. */
export const reviewPeople = (input: ReviewInput): ReviewPerson[] => {
  const manages = new Map<string, ReviewPerson['manages']>();
  for (const office of input.offices) {
    for (const holder of office.holders) {
      if (!holder.userId) continue;
      manages.set(holder.userId, [...(manages.get(holder.userId) ?? []), { officeId: office.officeId, officeName: office.officeName, kind: holder.kind, until: holder.until }]);
    }
  }
  return input.users
    .filter((user) => user.role === 'SUPER_ADMIN' || user.scopes.length || manages.has(user.userId)
      || user.permissions.some((permission) => permission === 'ALL_ACCESS' || permission.startsWith('hrm.') || permission.startsWith('recruitment.')))
    .map((user) => {
      const reach = hrmReachOf(user, input.today);
      return {
        userId: user.userId,
        name: user.employee?.name ?? user.name,
        email: user.email,
        loginStatus: user.status,
        roleName: user.roleName,
        accountRole: user.role,
        employee: user.employee ? { id: user.employee.id, employeeCode: user.employee.employeeCode, status: user.employee.status } : null,
        hr: {
          allIndia: reach.allIndia,
          states: reach.stateIds.map((id) => ({ id, name: input.stateNames.get(id) ?? `State ${id}` })).sort((a, b) => a.name.localeCompare(b.name)),
          headOffice: reach.headOffice,
          directReports: reach.directReports,
          other: reach.other,
        },
        recruitment: recruitmentViewOf(user, input.today),
        manages: manages.get(user.userId) ?? [],
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
};
