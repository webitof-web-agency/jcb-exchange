import prisma from '../../../lib/prisma';
import { allowedAdminPermissions } from '../../../utils/adminPermissions';
import { activeChargeWhere } from '../additionalChargeRules';
import { toDay, utcToday } from '../assignmentTimeline';
import { findReviewIssues, REVIEW_ISSUES, reviewPeople, type ReviewInput, type ReviewIssueCode, type ReviewOffice } from '../accessReviewRules';
import { currentAssignmentWhere, WORKING_STATUSES } from '../officeAssignments';
import { resolveHrmPermissions } from '../security';
import { parseHrmInput, schemas } from '../validation';

/** Loads who has what and runs the access review rules (accessReviewRules.ts). All-India HR users only (route). */

const known = (permissions: readonly string[]) => permissions.filter((permission) => allowedAdminPermissions.has(permission));
const personName = (employee: { legalName: string; preferredName: string | null }) => employee.preferredName || employee.legalName;

const loadReviewInput = async (): Promise<ReviewInput> => {
  const today = utcToday();
  const holderSelect = { id: true, employeeCode: true, legalName: true, preferredName: true, userId: true } as const;
  const working = { status: { in: [...WORKING_STATUSES] }, archivedAt: null };
  const [offices, postings, charges, users, scopes, states, jobs] = await Promise.all([
    prisma.hrmOrgUnit.findMany({
      where: { type: 'REGION', isActive: true, stateId: { not: null } },
      select: { id: true, name: true, stateId: true },
      orderBy: { name: 'asc' },
    }),
    prisma.hrmEmploymentAssignment.findMany({
      where: { isOfficeManager: true, officeUnitId: { not: null }, ...currentAssignmentWhere(today), employee: working },
      select: { officeUnitId: true, employee: { select: holderSelect } },
      orderBy: [{ effectiveFrom: 'asc' }, { createdAt: 'asc' }],
    }),
    prisma.hrmAdditionalCharge.findMany({
      where: { ...activeChargeWhere(today), employee: working },
      select: { officeUnitId: true, effectiveTo: true, employee: { select: holderSelect } },
      orderBy: { effectiveFrom: 'asc' },
    }),
    prisma.user.findMany({
      where: { role: { in: ['SUPER_ADMIN', 'ADMIN', 'EMPLOYEE'] } },
      select: {
        id: true, name: true, email: true, status: true, role: true, archivedAt: true,
        customRole: { select: { name: true, permissions: true } },
        adminPermissions: { select: { permission: true } },
        hrmEmployee: { select: { id: true, employeeCode: true, legalName: true, preferredName: true, status: true, archivedAt: true } },
      },
    }),
    prisma.hrmAccessScope.findMany({
      where: { OR: [{ activeTo: null }, { activeTo: { gte: today } }] },
      select: { userId: true, scopeType: true, stateId: true, source: true, activeFrom: true, activeTo: true },
    }),
    prisma.state.findMany({ where: { country: { iso2: 'IN' } }, select: { id: true, name: true } }),
    prisma.job.findMany({
      where: { status: { not: 'ARCHIVED' }, OR: [{ hrmStateId: null }, { hrmLocationType: null }] },
      select: { id: true, title: true, jobCode: true, locationCity: true, locationState: true, status: true },
      orderBy: { createdAt: 'desc' },
      take: 500,
    }),
  ]);
  const stateNames = new Map(states.map((state) => [state.id, state.name]));

  const reviewOffices: ReviewOffice[] = offices.map((office) => {
    const primary = postings.filter((row) => row.officeUnitId === office.id);
    const extra = charges.filter((row) => row.officeUnitId === office.id);
    const holders = new Map<string, ReviewOffice['holders'][number]>();
    for (const row of primary) {
      holders.set(row.employee.id, { employeeId: row.employee.id, employeeCode: row.employee.employeeCode, name: personName(row.employee), userId: row.employee.userId, kind: 'PRIMARY', until: null });
    }
    for (const row of extra) {
      if (holders.has(row.employee.id)) continue;
      holders.set(row.employee.id, { employeeId: row.employee.id, employeeCode: row.employee.employeeCode, name: personName(row.employee), userId: row.employee.userId, kind: 'CHARGE', until: row.effectiveTo ? toDay(row.effectiveTo) : null });
    }
    return { officeId: office.id, officeName: office.name, stateId: office.stateId!, stateName: stateNames.get(office.stateId!) ?? office.name, holders: [...holders.values()] };
  });

  const scopesByUser = new Map<string, typeof scopes>();
  for (const scope of scopes) scopesByUser.set(scope.userId, [...(scopesByUser.get(scope.userId) ?? []), scope]);

  return {
    today,
    offices: reviewOffices,
    stateNames,
    jobsWithoutState: jobs.map((job) => ({ id: job.id, title: job.title, jobCode: job.jobCode, location: [job.locationCity, job.locationState].filter(Boolean).join(', '), status: job.status })),
    users: users.map((user) => ({
      userId: user.id,
      name: user.name || user.email || user.id,
      email: user.email,
      status: user.archivedAt ? 'ARCHIVED' : user.status,
      role: user.role,
      roleName: user.customRole?.name ?? null,
      permissions: user.role === 'SUPER_ADMIN' ? ['ALL_ACCESS'] : [...resolveHrmPermissions(
        user.role,
        user.customRole ? known(user.customRole.permissions) : null,
        known(user.adminPermissions.map((row) => row.permission)),
      )],
      employee: user.hrmEmployee ? {
        id: user.hrmEmployee.id, employeeCode: user.hrmEmployee.employeeCode, name: personName(user.hrmEmployee),
        status: user.hrmEmployee.status, archived: Boolean(user.hrmEmployee.archivedAt),
      } : null,
      scopes: (scopesByUser.get(user.id) ?? []).map(({ userId: _userId, ...scope }) => scope),
    })),
  };
};

const matches = (search: string | undefined, values: Array<string | null | undefined>) => {
  if (!search) return true;
  const wanted = search.toLowerCase();
  return values.some((value) => value?.toLowerCase().includes(wanted));
};

const filtered = async (rawQuery: unknown) => {
  const query = parseHrmInput(schemas.accessReviewQuery, rawQuery);
  const input = await loadReviewInput();
  const allIssues = findReviewIssues(input);
  const counts = Object.fromEntries((Object.keys(REVIEW_ISSUES) as ReviewIssueCode[]).map((code) => [code, 0])) as Record<ReviewIssueCode, number>;
  for (const issue of allIssues) counts[issue.code] += 1;
  const issues = allIssues.filter((issue) => (!query.issue || issue.code === query.issue)
    && (!query.stateId || issue.stateId === query.stateId)
    && matches(query.search, [issue.person?.name, issue.person?.employeeCode, issue.office?.name, issue.stateName, issue.detail]));
  const people = reviewPeople(input).filter((person) => (!query.stateId || person.hr.allIndia || person.hr.states.some((state) => state.id === query.stateId))
    && matches(query.search, [person.name, person.email, person.employee?.employeeCode, person.roleName, ...person.hr.states.map((state) => state.name)]));
  return { query, input, counts, issues, people, issueTotal: allIssues.length };
};

export const getAccessReview = async (rawQuery: unknown) => {
  const { query, input, counts, issues, people, issueTotal } = await filtered(rawQuery);
  const view = query.view ?? 'issues';
  const rows: unknown[] = view === 'issues' ? issues : people;
  const limit = query.limit ?? 25;
  const totalPages = Math.max(1, Math.ceil(rows.length / limit));
  const page = Math.min(query.page ?? 1, totalPages);
  return {
    view,
    today: toDay(input.today),
    summary: {
      issues: issueTotal,
      high: (Object.keys(REVIEW_ISSUES) as ReviewIssueCode[]).filter((code) => REVIEW_ISSUES[code].severity === 'HIGH').reduce((sum, code) => sum + counts[code], 0),
      types: (Object.keys(REVIEW_ISSUES) as ReviewIssueCode[]).map((code) => ({ code, title: REVIEW_ISSUES[code].title, severity: REVIEW_ISSUES[code].severity, count: counts[code] })),
    },
    states: [...input.stateNames.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name)),
    issues: view === 'issues' ? rows.slice((page - 1) * limit, page * limit) : [],
    people: view === 'people' ? rows.slice((page - 1) * limit, page * limit) : [],
    pagination: { page, limit, total: rows.length, totalPages },
  };
};

const csvCell = (value: unknown) => {
  const text = String(value ?? '');
  // Formula injection guard for spreadsheet apps, and quoting.
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

export const getAccessReviewCsv = async (rawQuery: unknown) => {
  const { query, issues, people } = await filtered(rawQuery);
  const view = query.view ?? 'issues';
  const header = view === 'issues'
    ? ['Severity', 'Problem', 'Person', 'Employee code', 'Office', 'State', 'Detail']
    : ['Name', 'Email', 'Employee code', 'Role', 'Login', 'HRM access', 'Recruitment', 'Manages'];
  const rows = view === 'issues'
    ? issues.map((issue) => [issue.severity, issue.title, issue.person?.name, issue.person?.employeeCode, issue.office?.name, issue.stateName, issue.detail])
    : people.map((person) => [
      person.name, person.email, person.employee?.employeeCode, person.roleName ?? person.accountRole, person.loginStatus,
      person.hr.allIndia ? 'All of India' : [...person.hr.states.map((state) => state.name), person.hr.headOffice ? 'Head office' : '', person.hr.directReports ? 'Direct reports' : ''].filter(Boolean).join('; ') || 'Own record only',
      person.recruitment,
      person.manages.map((office) => `${office.officeName}${office.kind === 'CHARGE' ? ' (additional charge)' : ''}`).join('; '),
    ]);
  const csv = [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n');
  return { fileName: `hrm-access-${view}-${new Date().toISOString().slice(0, 10)}.csv`, csv: `﻿${csv}\r\n` };
};
