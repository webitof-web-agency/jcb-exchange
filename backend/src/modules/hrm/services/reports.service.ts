import type { Prisma } from '@prisma/client';
import prisma from '../../../lib/prisma';
import { getActiveScopes, getEmployeeScopeDuringWhere, getEmployeeScopeWhere, getHrmPermissions } from '../access';
import { istToday } from '../istDate';
import { activeChargeWhere } from '../additionalChargeRules';
import { casePlacementFilter, caseScope } from './onboarding.service';
import { currentAssignmentWhere, utcToday, WORKING_STATUSES } from '../officeAssignments';
import { HRM_PERMISSIONS, hasAllIndiaScope, hasHrmPermission } from '../security';
import { parseHrmInput, schemas } from '../validation';

type Actor = { userId: string; role: string; ipAddress?: string | null };

/**
 * Director / HR reports (client requirement R15): headcount state-wise and department-wise, joinings and exits of a
 * month, the onboarding pipeline, KYC completion and vacant states. Every number comes from database aggregates
 * and is limited to the caller's HRM scope (a State Manager sees their state; head office all-India users see all).
 */

export const STATUS_GROUPS = {
  working: ['ACTIVE', 'ON_LEAVE'],
  notice: ['NOTICE_PERIOD'],
  joining: ['DRAFT', 'PRE_ONBOARDING', 'ONBOARDING'],
  onHold: ['SUSPENDED'],
} as const;
type GroupKey = keyof typeof STATUS_GROUPS;
const GROUP_KEYS = Object.keys(STATUS_GROUPS) as GroupKey[];

const monthRange = (month: string | undefined) => {
  // Default: the current month in India.
  const now = istToday();
  const [year, monthIndex] = month ? [Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1] : [now.getUTCFullYear(), now.getUTCMonth()];
  return { start: new Date(Date.UTC(year, monthIndex, 1)), end: new Date(Date.UTC(year, monthIndex + 1, 1)), label: `${year}-${String(monthIndex + 1).padStart(2, '0')}` };
};

const countOf = (group: { _count?: unknown }) => (group._count as { _all?: number } | undefined)?._all ?? 0;

export const getReportSummary = async (actor: Actor, rawQuery: unknown) => {
  const query = parseHrmInput(schemas.reportQuery, rawQuery);
  const scopeWhere = await getEmployeeScopeWhere(actor);
  const today = utcToday();
  const { start, end, label } = monthRange(query.month);

  const employeeBase: Prisma.HrmEmployeeWhereInput = { archivedAt: null, ...(scopeWhere ? { AND: [scopeWhere] } : {}) };
  const placementFilter: Prisma.HrmEmploymentAssignmentWhereInput = {
    ...(query.stateId ? { stateId: query.stateId } : {}),
    ...(query.orgUnitId ? { orgUnitId: query.orgUnitId } : {}),
  };
  // Working people are counted by the assignment in force today; people still joining by the one that will start.
  const assignmentWhereFor = (group: GroupKey): Prisma.HrmEmploymentAssignmentWhereInput => ({
    ...(group === 'joining' ? { status: 'ACTIVE', effectiveTo: null } : currentAssignmentWhere(today)),
    ...placementFilter,
    employee: { ...employeeBase, status: { in: [...STATUS_GROUPS[group]] } },
  });

  // The state / department filter applies to the placement the person had during the month (not years earlier).
  const placementSome: Prisma.HrmEmployeeWhereInput = query.stateId || query.orgUnitId
    ? { assignments: { some: { status: { in: ['ACTIVE', 'ENDED'] as const }, effectiveFrom: { lt: end }, OR: [{ effectiveTo: null }, { effectiveTo: { gte: start } }], ...placementFilter } } }
    : {};
  const duringWhere = await getEmployeeScopeDuringWhere(actor, start, end);
  const monthBase: Prisma.HrmEmployeeWhereInput = { archivedAt: null, ...(duringWhere ? { AND: [duringWhere] } : {}) };
  const joiningWhere: Prisma.HrmEmployeeWhereInput = { ...monthBase, joinedOn: { gte: start, lt: end }, status: { notIn: ['DRAFT', 'PRE_ONBOARDING', 'ONBOARDING'] }, ...placementSome };
  const exitWhere: Prisma.HrmEmployeeWhereInput = { ...monthBase, exitDate: { gte: start, lt: end }, status: { in: ['EXITED', 'TERMINATED'] }, ...placementSome };
  const [joiningCount, exitCount] = await Promise.all([prisma.hrmEmployee.count({ where: joiningWhere }), prisma.hrmEmployee.count({ where: exitWhere })]);
  const [byStateGroups, byDepartmentGroups, totals, joinings, exits, unplaced] = await Promise.all([
    Promise.all(GROUP_KEYS.map((group) => prisma.hrmEmploymentAssignment.groupBy({ by: ['stateId'], where: assignmentWhereFor(group), _count: { _all: true } }))),
    Promise.all(GROUP_KEYS.map((group) => prisma.hrmEmploymentAssignment.groupBy({ by: ['orgUnitId'], where: assignmentWhereFor(group), _count: { _all: true } }))),
    Promise.all(GROUP_KEYS.map((group) => prisma.hrmEmployee.count({
      where: { ...employeeBase, status: { in: [...STATUS_GROUPS[group]] }, ...(query.stateId || query.orgUnitId ? { assignments: { some: group === 'joining' ? { status: 'ACTIVE', effectiveTo: null, ...placementFilter } : { ...currentAssignmentWhere(today), ...placementFilter } } } : {}) },
    }))),
    prisma.hrmEmployee.findMany({
      where: joiningWhere,
      select: { id: true, employeeCode: true, legalName: true, preferredName: true, joinedOn: true, assignments: { where: { status: { in: ['ACTIVE', 'ENDED'] }, effectiveFrom: { lt: end } }, orderBy: { effectiveFrom: 'desc' }, take: 1, select: { designation: true, state: { select: { name: true } } } } },
      orderBy: { joinedOn: 'asc' },
      take: 200,
    }),
    prisma.hrmEmployee.findMany({
      where: exitWhere,
      select: { id: true, employeeCode: true, legalName: true, preferredName: true, exitDate: true, status: true, assignments: { where: { status: { in: ['ACTIVE', 'ENDED'] } }, orderBy: { effectiveFrom: 'desc' }, take: 1, select: { designation: true, state: { select: { name: true } } } } },
      orderBy: { exitDate: 'asc' },
      take: 200,
    }),
    // Working people with no assignment in force today (to be placed).
    query.stateId || query.orgUnitId ? Promise.resolve(0) : prisma.hrmEmployee.count({ where: { ...employeeBase, status: { in: [...STATUS_GROUPS.working, ...STATUS_GROUPS.notice] }, assignments: { none: currentAssignmentWhere(today) } } }),
  ]);

  // Headcount tables.
  const fold = <K extends string | number>(groups: Array<Array<{ key: K | null; count: number }>>) => {
    const rows = new Map<K | null, Record<GroupKey, number>>();
    groups.forEach((list, index) => {
      for (const { key, count } of list) {
        const row = rows.get(key) ?? { working: 0, notice: 0, joining: 0, onHold: 0 };
        row[GROUP_KEYS[index]!] += count;
        rows.set(key, row);
      }
    });
    return rows;
  };
  const stateRows = fold(byStateGroups.map((list) => list.map((group) => ({ key: group.stateId, count: countOf(group) }))));
  const departmentRows = fold(byDepartmentGroups.map((list) => list.map((group) => ({ key: group.orgUnitId, count: countOf(group) }))));
  const stateIds = [...stateRows.keys()].filter((key): key is number => typeof key === 'number');
  const departmentIds = [...departmentRows.keys()].filter((key): key is string => typeof key === 'string');
  const [states, departments] = await Promise.all([
    stateIds.length ? prisma.state.findMany({ where: { id: { in: stateIds } }, select: { id: true, name: true } }) : [],
    departmentIds.length ? prisma.hrmOrgUnit.findMany({ where: { id: { in: departmentIds } }, select: { id: true, name: true } }) : [],
  ]);
  const stateName = new Map(states.map((state) => [state.id, state.name]));
  const departmentName = new Map(departments.map((department) => [department.id, department.name]));
  const toRow = (counts: Record<GroupKey, number>) => ({ ...counts, total: counts.working + counts.notice + counts.joining + counts.onHold });
  const byState = [...stateRows.entries()]
    .map(([key, counts]) => ({ stateId: key, state: key === null ? 'No state' : stateName.get(key as number) ?? `State ${key}`, ...toRow(counts) }))
    .sort((a, b) => b.total - a.total || a.state.localeCompare(b.state));
  const byDepartment = [...departmentRows.entries()]
    .map(([key, counts]) => ({ orgUnitId: key, department: departmentName.get(key as string) ?? 'Unknown', ...toRow(counts) }))
    .sort((a, b) => b.total - a.total || a.department.localeCompare(b.department));

  // Onboarding pipeline and KYC completion (scope applies through the employee).
  const reportPermissions = await getHrmPermissions(actor.userId, actor.role);
  const canSeeOnboarding = hasHrmPermission(reportPermissions, HRM_PERMISSIONS.ONBOARDING_READ) || hasHrmPermission(reportPermissions, HRM_PERMISSIONS.ONBOARDING_MANAGE);
  const pipelineScope = canSeeOnboarding ? await caseScope(actor) : null;
  // The same filter the Onboarding page uses, so a pipeline chip opens exactly the cases it counted.
  const pipelinePlacement = canSeeOnboarding ? await casePlacementFilter({ stateId: query.stateId, orgUnitId: query.orgUnitId }, today) : null;
  const pipelineWhere: Prisma.HrmOnboardingCaseWhereInput = {
    AND: [
      ...(pipelineScope ? [pipelineScope] : []),
      ...(pipelinePlacement ? [pipelinePlacement] : []),
    ],
  };
  const kycPlacement: Prisma.HrmEmployeeWhereInput = query.stateId || query.orgUnitId
    ? { assignments: { some: { ...currentAssignmentWhere(today), ...placementFilter } } }
    : {};
  const [pipelineGroups, kycBase, kycComplete] = await Promise.all([
    canSeeOnboarding ? prisma.hrmOnboardingCase.groupBy({ by: ['status'], where: pipelineWhere, _count: { _all: true } }) : Promise.resolve([]),
    prisma.hrmEmployee.count({ where: { ...employeeBase, ...kycPlacement, status: { in: [...STATUS_GROUPS.working, ...STATUS_GROUPS.notice] } } }),
    prisma.hrmEmployee.count({
      where: {
        ...employeeBase,
        ...kycPlacement,
        status: { in: [...STATUS_GROUPS.working, ...STATUS_GROUPS.notice] },
        documents: { some: { provider: 'SUREPASS', status: 'VERIFIED', providerReference: { startsWith: 'PAN:' } } },
        AND: [
          ...(scopeWhere ? [scopeWhere] : []),
          { documents: { some: { provider: 'SUREPASS', status: 'VERIFIED', providerReference: { startsWith: 'AADHAAR:' } } } },
          { bankAccounts: { some: { isPrimary: true } } },
        ],
      },
    }),
  ]);

  // Vacant states (structure): an all-India viewer sees every state; a scoped viewer only their states.
  const permissions = await getHrmPermissions(actor.userId, actor.role);
  const scopes = await getActiveScopes(actor.userId);
  const allIndia = actor.role === 'SUPER_ADMIN' || hasHrmPermission(permissions, HRM_PERMISSIONS.SCOPE_ALL) || hasAllIndiaScope(scopes);
  const myStates = scopes.flatMap((scope) => (scope.scopeType === 'STATE' && scope.stateId ? [scope.stateId] : []));
  const offices = await prisma.hrmOrgUnit.findMany({
    where: { type: 'REGION', isActive: true, stateId: query.stateId ? (allIndia || myStates.includes(query.stateId) ? query.stateId : -1) : (allIndia ? { not: null } : { in: myStates }) },
    select: {
      id: true, name: true, stateId: true, state: { select: { name: true } },
      officeAssignments: {
        where: { isOfficeManager: true, ...currentAssignmentWhere(today), employee: { status: { in: [...WORKING_STATUSES] }, archivedAt: null } },
        select: { employeeId: true },
        take: 1,
      },
      additionalCharges: {
        where: { ...activeChargeWhere(today), employee: { status: { in: [...WORKING_STATUSES] }, archivedAt: null } },
        select: { employeeId: true },
        take: 1,
      },
    },
    orderBy: { name: 'asc' },
  });
  const vacantStates = offices.filter((office) => !office.officeAssignments.length && !office.additionalCharges.length).map((office) => ({ officeId: office.id, office: office.name, state: office.state?.name ?? null }));

  const personRow = (row: { id: string; employeeCode: string; legalName: string; preferredName: string | null; assignments: Array<{ designation: string; state: { name: string } | null }> }) => ({
    id: row.id, employeeCode: row.employeeCode, name: row.preferredName || row.legalName,
    designation: row.assignments[0]?.designation ?? null, state: row.assignments[0]?.state?.name ?? null,
  });

  return {
    month: label,
    filters: { stateId: query.stateId ?? null, orgUnitId: query.orgUnitId ?? null },
    totals: Object.fromEntries(GROUP_KEYS.map((group, index) => [group, totals[index] ?? 0])) as Record<GroupKey, number>,
    unplaced,
    byState,
    byDepartment,
    joinings: { count: joiningCount, truncated: joiningCount > joinings.length, people: joinings.map((row) => ({ ...personRow(row), date: row.joinedOn })) },
    exits: { count: exitCount, truncated: exitCount > exits.length, people: exits.map((row) => ({ ...personRow(row), date: row.exitDate, status: row.status })) },
    // Null without hrm.onboarding.read: the pipeline is onboarding data.
    onboarding: canSeeOnboarding ? Object.fromEntries(pipelineGroups.map((group) => [group.status, countOf(group)])) : null,
    kyc: { employees: kycBase, complete: kycComplete, percent: kycBase ? Math.round((kycComplete / kycBase) * 100) : 0 },
    vacantStates,
    scope: { allIndia },
  };
};

/** CSV of the headcount table (state-wise or department-wise), for Excel. */
export const getHeadcountCsv = async (actor: Actor, rawQuery: unknown) => {
  const query = parseHrmInput(schemas.reportQuery, rawQuery);
  const summary = await getReportSummary(actor, rawQuery);
  const cell = (value: unknown) => {
    const text = String(value ?? '');
    // Formula injection guard for spreadsheet apps, and quoting.
    const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
    return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  const byDepartment = query.by === 'department';
  const header = [byDepartment ? 'Department' : 'State', 'Working', 'On notice', 'Joining', 'On hold', 'Total'];
  const rows = (byDepartment ? summary.byDepartment.map((row) => [row.department, row.working, row.notice, row.joining, row.onHold, row.total])
    : summary.byState.map((row) => [row.state, row.working, row.notice, row.joining, row.onHold, row.total]));
  const csv = [header, ...rows].map((row) => row.map(cell).join(',')).join('\r\n');
  return { fileName: `hrm-headcount-${byDepartment ? 'department' : 'state'}-${new Date().toISOString().slice(0, 10)}.csv`, csv: `﻿${csv}\r\n` };
};
