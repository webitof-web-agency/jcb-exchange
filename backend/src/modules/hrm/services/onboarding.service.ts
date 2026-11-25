import { Prisma } from '@prisma/client';
import prisma from '../../../lib/prisma';
import { normalizeSalaryComponents } from '../../../utils/offerRules';
import { assertEmployeeAccess, getActiveScopes, getEmployeeScopeWhere, getHrmPermissions } from '../access';
import { writeHrmAudit } from '../audit';
import { HrmAuthorizationError, HrmConflictError, HrmHttpError, HrmNotFoundError } from '../errors';
import { syncOfficePrimaryManager } from '../officeAssignments';
import { buildChecklist, checklistProgress, documentState, type ChecklistFacts } from '../onboardingChecklist';
import { HRM_PERMISSIONS, hasAllIndiaScope, hasHrmPermission } from '../security';
import { parseHrmInput, schemas } from '../validation';
import { handOfferToHrm } from './offerHandoff.service';
import { findEmployeeMatches } from './employeeOnboarding.service';
import { istToday } from '../istDate';
import { endScopesOnExit } from '../accessProvisioning';

type Actor = { userId: string; role: string; ipAddress?: string | null };

/**
 * Onboarding: everybody between "offer accepted" and "joined". HR sees the list (paged, filtered, within their
 * scope), each person's joining checklist and recruitment record, can cancel a joining (no-show: nothing is
 * deleted, the never-joined record is archived) and decides cases where the offer matched an existing HR record.
 */

const OPEN_STATUSES = ['NEEDS_REVIEW', 'PENDING', 'IN_PROGRESS', 'READY_FOR_APPROVAL'] as const;
const DAY = 86_400_000;
/** Indian calendar day: the joining windows, current salary and shift follow the office's day, not UTC's. */
const todayUtc = () => istToday();

const audit = (actor: Actor, entityType: 'HRM_ONBOARDING' | 'HRM_EMPLOYEE', entityId: string, action: string, after: unknown, tx?: Prisma.TransactionClient) =>
  writeHrmAudit({ actorUserId: actor.userId, entityType, entityId, action, after, ...(actor.ipAddress !== undefined ? { ipAddress: actor.ipAddress } : {}) }, tx);

// ---- checklist facts, for many people at once ----

export const loadChecklistFacts = async (employeeIds: string[]) => {
  const facts = new Map<string, ChecklistFacts>();
  if (!employeeIds.length) return facts;
  const today = todayUtc();
  const joined = await prisma.hrmEmployee.findMany({ where: { id: { in: employeeIds } }, select: { id: true, joinedOn: true } });
  // Salary and shift must cover the (new) joining date, or today if that has passed.
  const coverFrom = new Map(joined.map((row) => [row.id, row.joinedOn && row.joinedOn > today ? row.joinedOn : today]));
  const [employees, assignments, documents, banks, salaryRows, shiftRows] = await Promise.all([
    prisma.hrmEmployee.findMany({ where: { id: { in: employeeIds } }, select: { id: true, dateOfBirth: true, gender: true, currentAddress: true, emergencyContact: true, userId: true } }),
    prisma.hrmEmploymentAssignment.findMany({ where: { employeeId: { in: employeeIds }, status: 'ACTIVE', OR: [{ effectiveTo: null }, { effectiveTo: { gte: today } }] }, select: { employeeId: true } }),
    prisma.hrmEmployeeDocument.findMany({ where: { employeeId: { in: employeeIds }, status: { in: ['VERIFIED', 'PENDING'] } }, select: { employeeId: true, category: true, status: true, provider: true, providerReference: true } }),
    prisma.hrmEmployeeBankAccount.findMany({ where: { employeeId: { in: employeeIds }, isPrimary: true }, select: { employeeId: true, isVerified: true } }),
    prisma.hrmCompensationRevision.findMany({ where: { employeeId: { in: employeeIds }, status: { in: ['APPROVED', 'PENDING_APPROVAL'] }, OR: [{ effectiveTo: null }, { effectiveTo: { gte: today } }] }, select: { employeeId: true, status: true, effectiveTo: true } }),
    prisma.hrmShiftAssignment.findMany({ where: { employeeId: { in: employeeIds }, status: 'ACTIVE', OR: [{ effectiveTo: null }, { effectiveTo: { gte: today } }] }, select: { employeeId: true, effectiveTo: true } }),
  ]);
  const covers = (row: { employeeId: string; effectiveTo: Date | null }) => !row.effectiveTo || row.effectiveTo >= (coverFrom.get(row.employeeId) ?? today);
  const salaries = salaryRows.filter(covers);
  const shifts = shiftRows.filter(covers);
  const placed = new Set(assignments.map((row) => row.employeeId));
  const withShift = new Set(shifts.map((row) => row.employeeId));
  for (const employee of employees) {
    const mine = documents.filter((row) => row.employeeId === employee.id);
    const statusesOf = (category: string) => mine.filter((row) => row.category === category).map((row) => row.status);
    const kycVerified = (prefix: string) => mine.some((row) => row.provider === 'SUREPASS' && row.status === 'VERIFIED' && (row.providerReference ?? '').startsWith(prefix));
    const bank = banks.find((row) => row.employeeId === employee.id);
    const salary = salaries.filter((row) => row.employeeId === employee.id);
    facts.set(employee.id, {
      personal: {
        dateOfBirth: Boolean(employee.dateOfBirth),
        gender: Boolean(employee.gender),
        currentAddress: Boolean(employee.currentAddress),
        emergencyContact: Boolean(employee.emergencyContact),
      },
      hasPlacement: placed.has(employee.id),
      panVerified: kycVerified('PAN:'),
      aadhaarVerified: kycVerified('AADHAAR:'),
      bank: bank ? (bank.isVerified ? 'VERIFIED' : 'ADDED') : 'MISSING',
      documents: {
        OFFER: documentState(statusesOf('OFFER')),
        ACCEPTANCE: documentState(statusesOf('ACCEPTANCE')),
        PHOTO: documentState(statusesOf('PHOTO')),
        ADDRESS: documentState(statusesOf('ADDRESS')),
        EDUCATION: documentState(statusesOf('EDUCATION')),
      },
      salary: salary.some((row) => row.status === 'APPROVED') ? 'APPROVED' : salary.length ? 'PENDING' : 'MISSING',
      hasShift: withShift.has(employee.id),
      hasLogin: Boolean(employee.userId),
    });
  }
  return facts;
};

// ---- scope: which cases the caller may see ----

/** Null = every case. Otherwise the case ids / employees the caller's scope covers (NEEDS_REVIEW cases by the offer's state). */
export const caseScope = async (actor: Actor): Promise<Prisma.HrmOnboardingCaseWhereInput | null> => {
  const scopeWhere = await getEmployeeScopeWhere(actor);
  if (!scopeWhere) return null;
  const scopes = await getActiveScopes(actor.userId);
  if (hasAllIndiaScope(scopes)) return null;
  const stateIds = scopes.flatMap((scope) => (scope.scopeType === 'STATE' && scope.stateId ? [scope.stateId] : []));
  const hasHeadOfficeScope = scopes.some((scope) => scope.scopeType === 'HEAD_OFFICE');
  // A STATE scope covers that state's office, never head office people who sit in the same state (same rule as the
  // employee filter); a HEAD_OFFICE scope covers head office offers.
  const offerIds = stateIds.length || hasHeadOfficeScope
    ? (await prisma.offer.findMany({
      where: {
        status: 'ACCEPTED',
        OR: [
          ...(stateIds.length ? [{ stateId: { in: stateIds }, NOT: { locationType: 'HEAD_OFFICE' } }] : []),
          ...(hasHeadOfficeScope ? [{ locationType: 'HEAD_OFFICE' }] : []),
        ],
      },
      select: { id: true },
    })).map((row) => row.id)
    : [];
  return { OR: [{ employee: scopeWhere }, ...(offerIds.length ? [{ employeeId: null, offerId: { in: offerIds } }] : [])] };
};

/**
 * Cases of people placed in a state / department (by the assignment in force today or the one that will start), plus
 * - for a state filter - cases that never got an HR record, by the accepted offer's state. Shared by the Onboarding
 * list and the Reports pipeline, so a pipeline chip and the list it opens always show the same cases.
 */
export const casePlacementFilter = async (filter: { stateId?: number | undefined; orgUnitId?: string | undefined }, today: Date): Promise<Prisma.HrmOnboardingCaseWhereInput | null> => {
  if (!filter.stateId && !filter.orgUnitId) return null;
  const offerIds = filter.stateId && !filter.orgUnitId
    ? (await prisma.offer.findMany({ where: { stateId: filter.stateId, status: 'ACCEPTED' }, select: { id: true } })).map((row) => row.id)
    : [];
  return {
    OR: [
      {
        employee: {
          assignments: {
            some: {
              status: 'ACTIVE', OR: [{ effectiveTo: null }, { effectiveTo: { gte: today } }],
              ...(filter.stateId ? { stateId: filter.stateId } : {}),
              ...(filter.orgUnitId ? { orgUnitId: filter.orgUnitId } : {}),
            },
          },
        },
      },
      ...(offerIds.length ? [{ employeeId: null, offerId: { in: offerIds } }] : []),
    ],
  };
};

export const listOnboardingCases = async (actor: Actor, rawQuery: unknown) => {
  const query = parseHrmInput(schemas.onboardingQuery, rawQuery);
  const page = query.page ?? 1;
  const limit = query.limit ?? 20;
  const scope = await caseScope(actor);
  const today = todayUtc();

  const filters: Prisma.HrmOnboardingCaseWhereInput[] = [];
  if (scope) filters.push(scope);
  if (query.joining === 'THIS_WEEK') filters.push({ targetJoiningDate: { gte: today, lt: new Date(today.getTime() + 7 * DAY) } });
  if (query.joining === 'NEXT_30_DAYS') filters.push({ targetJoiningDate: { gte: today, lt: new Date(today.getTime() + 30 * DAY) } });
  if (query.joining === 'OVERDUE') filters.push({ targetJoiningDate: { lt: today }, status: { in: [...OPEN_STATUSES] } });
  const placementWhere = await casePlacementFilter({ stateId: query.stateId, orgUnitId: query.orgUnitId }, today);
  if (placementWhere) filters.push(placementWhere);
  if (query.search) {
    const candidates = await prisma.candidate.findMany({ where: { fullName: { contains: query.search, mode: 'insensitive' } }, select: { id: true }, take: 200 });
    filters.push({
      OR: [
        { employee: { legalName: { contains: query.search, mode: 'insensitive' } } },
        { employee: { employeeCode: { contains: query.search, mode: 'insensitive' } } },
        ...(candidates.length ? [{ candidateId: { in: candidates.map((row) => row.id) } }] : []),
      ],
    });
  }
  const statusFilter: Prisma.HrmOnboardingCaseWhereInput = !query.status || query.status === 'OPEN'
    ? { status: { in: [...OPEN_STATUSES] } }
    : query.status === 'ALL' ? {} : { status: query.status };
  const baseWhere: Prisma.HrmOnboardingCaseWhereInput = filters.length ? { AND: filters } : {};
  const where: Prisma.HrmOnboardingCaseWhereInput = { AND: [baseWhere, statusFilter] };

  const [rows, total, groups] = await Promise.all([
    prisma.hrmOnboardingCase.findMany({
      where,
      include: { employee: { select: { id: true, employeeCode: true, legalName: true, preferredName: true, status: true, archivedAt: true } } },
      orderBy: [{ targetJoiningDate: { sort: 'asc', nulls: 'last' } }, { createdAt: 'desc' }],
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.hrmOnboardingCase.count({ where }),
    prisma.hrmOnboardingCase.groupBy({ by: ['status'], where: baseWhere, _count: { _all: true } }),
  ]);

  const offerIds = rows.map((row) => row.offerId).filter((value): value is string => Boolean(value));
  const offers = offerIds.length ? await prisma.offer.findMany({
    where: { id: { in: offerIds } },
    select: { id: true, designation: true, department: true, joiningLocation: true, stateId: true, candidate: { select: { fullName: true, email: true, mobile: true } }, application: { select: { applicationRef: true } } },
  }) : [];
  const offerOf = new Map(offers.map((offer) => [offer.id, offer]));
  const facts = await loadChecklistFacts(rows.map((row) => row.employeeId).filter((value): value is string => Boolean(value)));
  // For a case that needs review: the HR records the offer matched (by email / mobile), the only ones a re-hire may use.
  const matchesOf = new Map<string, Array<{ id: string; employeeCode: string; name: string; status: string; matchedBy: string }>>();
  for (const row of rows) {
    if (row.status !== 'NEEDS_REVIEW' || !row.offerId) continue;
    const offer = offerOf.get(row.offerId);
    if (!offer) continue;
    const found = await findEmployeeMatches(offer.candidate.email, offer.candidate.mobile);
    matchesOf.set(row.id, found.map((match) => ({ id: match.id, employeeCode: match.employeeCode, name: match.legalName, status: match.status, matchedBy: match.matchedByEmail ? 'email' : 'mobile' })));
  }

  return {
    cases: rows.map((row) => {
      const offer = row.offerId ? offerOf.get(row.offerId) : undefined;
      const employeeFacts = row.employeeId ? facts.get(row.employeeId) : undefined;
      return {
        id: row.id,
        status: row.status,
        targetJoiningDate: row.targetJoiningDate,
        reviewNote: row.reviewNote,
        createdAt: row.createdAt,
        employee: row.employee ? { id: row.employee.id, employeeCode: row.employee.employeeCode, name: row.employee.preferredName || row.employee.legalName, status: row.employee.status, archived: Boolean(row.employee.archivedAt) } : null,
        candidateName: offer?.candidate.fullName ?? row.employee?.legalName ?? null,
        offer: offer ? { id: offer.id, designation: offer.designation, department: offer.department, placeOfPosting: offer.joiningLocation, applicationRef: offer.application.applicationRef } : null,
        progress: employeeFacts ? checklistProgress(buildChecklist(employeeFacts)) : null,
        matches: matchesOf.get(row.id) ?? [],
      };
    }),
    statusCounts: Object.fromEntries(groups.map((group) => [group.status, (group._count as { _all?: number } | undefined)?._all ?? 0])),
    pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
  };
};

// ---- one person's onboarding (profile cards) ----

const recruitmentDetails = async (offerId: string) => {
  const offer = await prisma.offer.findUnique({
    where: { id: offerId },
    include: {
      job: { select: { title: true, locationCity: true, locationState: true } },
      application: { select: { id: true, applicationRef: true, appliedAt: true, applicantSnapshot: true, currentStage: true, answers: { select: { answerText: true, question: { select: { question: true, order: true } } } }, interviews: { select: { id: true, scheduledAt: true, type: true, status: true }, orderBy: { scheduledAt: 'desc' }, take: 10 } } },
      candidate: { select: { fullName: true, email: true, mobile: true } },
    },
  });
  if (!offer) return null;
  const letter = (offer.offerLetterData && typeof offer.offerLetterData === 'object' ? offer.offerLetterData : {}) as Record<string, unknown>;
  const parsed = normalizeSalaryComponents(offer.salaryComponents ?? null);
  return {
    offerId: offer.id,
    status: offer.status,
    letterNo: typeof letter.offerLetterNo === 'string' ? letter.offerLetterNo : null,
    jobTitle: offer.job.title,
    jobLocation: [offer.job.locationCity, offer.job.locationState].filter(Boolean).join(', '),
    designation: offer.designation,
    department: offer.department,
    placeOfPosting: offer.joiningLocation,
    joiningDate: offer.joiningDate,
    probationPeriod: offer.probationPeriod,
    annualCtc: offer.annualCtc !== null ? Number(offer.annualCtc) : null,
    salaryComponents: 'error' in parsed ? [] : parsed.components,
    candidate: offer.candidate,
    application: {
      id: offer.application.id,
      applicationRef: offer.application.applicationRef,
      appliedAt: offer.application.appliedAt,
      stage: offer.application.currentStage,
      submitted: offer.application.applicantSnapshot,
      answers: offer.application.answers
        .sort((a, b) => a.question.order - b.question.order)
        .map((answer) => ({ question: answer.question.question, answer: answer.answerText ?? '' })),
      interviews: offer.application.interviews,
    },
    acceptance: offer.status === 'ACCEPTED' ? {
      method: offer.acceptanceMethod,
      name: offer.acceptedName,
      place: offer.acceptedPlace,
      acceptedAt: offer.respondedAt,
      ipAddress: offer.acceptedIp,
      documentHash: offer.documentHash,
      signatureHash: offer.signatureHash,
      note: offer.acceptanceNote,
    } : null,
  };
};

export const getEmployeeOnboarding = async (actor: Actor, employeeId: string) => {
  await assertEmployeeAccess({ ...actor, employeeId });
  const permissions = await getHrmPermissions(actor.userId, actor.role);
  // The same as the Salary card: read, manage or approve.
  const canSeeSalary = [HRM_PERMISSIONS.COMPENSATION_READ, HRM_PERMISSIONS.COMPENSATION_MANAGE, HRM_PERMISSIONS.COMPENSATION_APPROVE].some((permission) => hasHrmPermission(permissions, permission));
  // The applicant's submissions and the acceptance evidence (IP, fingerprints) are onboarding records.
  const canSeeOnboarding = hasHrmPermission(permissions, HRM_PERMISSIONS.ONBOARDING_READ) || hasHrmPermission(permissions, HRM_PERMISSIONS.ONBOARDING_MANAGE);
  const employee = await prisma.hrmEmployee.findUnique({ where: { id: employeeId }, select: { id: true, offerId: true, status: true } });
  if (!employee) throw new HrmNotFoundError('Employee not found.');
  const onboardingCase = await prisma.hrmOnboardingCase.findFirst({ where: { employeeId }, orderBy: { createdAt: 'desc' }, include: { acceptanceEvidence: true } });
  const facts = (await loadChecklistFacts([employeeId])).get(employeeId);
  const checklist = facts ? buildChecklist(facts) : [];
  const offerId = onboardingCase?.offerId ?? employee.offerId;
  const recruitment = offerId ? await recruitmentDetails(offerId) : null;
  return {
    case: onboardingCase ? { ...onboardingCase, rehireSnapshot: undefined, acceptanceEvidence: canSeeOnboarding ? onboardingCase.acceptanceEvidence : null } : null,
    checklist,
    progress: checklistProgress(checklist),
    recruitment: recruitment ? {
      ...recruitment,
      ...(canSeeSalary ? {} : { annualCtc: null, salaryComponents: [] }),
      ...(canSeeOnboarding ? {} : {
        candidate: { fullName: recruitment.candidate.fullName, email: '', mobile: '' },
        application: { ...recruitment.application, submitted: null, answers: [] },
        acceptance: recruitment.acceptance ? { ...recruitment.acceptance, ipAddress: null, documentHash: null, signatureHash: null } : null,
      }),
    } : null,
    access: { salary: canSeeSalary, onboarding: canSeeOnboarding },
  };
};

// ---- cancel a joining (no-show) ----

const requireOnboardingManage = async (actor: Actor) => {
  const permissions = await getHrmPermissions(actor.userId, actor.role);
  if (!hasHrmPermission(permissions, HRM_PERMISSIONS.ONBOARDING_MANAGE)) throw new HrmAuthorizationError('This needs the hrm.onboarding.manage permission.');
  return permissions;
};

/**
 * The person will not join. Nothing is deleted: the case is CANCELLED; a record created for this offer is archived
 * (it never joined); a re-opened record of somebody who left earlier goes back to EXITED. Assignments, salary
 * drafts and shifts made for this joining are cancelled; the recruitment application is marked "Did not join".
 */
export const cancelJoining = async (actor: Actor, caseId: string, rawInput: unknown) => {
  const input = parseHrmInput(schemas.cancelJoining, rawInput);
  await requireOnboardingManage(actor);
  const onboardingCase = await prisma.hrmOnboardingCase.findUnique({ where: { id: caseId } });
  if (!onboardingCase) throw new HrmNotFoundError('Onboarding case not found.');
  if (!(OPEN_STATUSES as readonly string[]).includes(onboardingCase.status)) throw new HrmConflictError(`This onboarding is already ${onboardingCase.status.toLowerCase().replace(/_/g, ' ')}.`);
  if (onboardingCase.employeeId) await assertEmployeeAccess({ ...actor, employeeId: onboardingCase.employeeId });
  else if ((await caseScope(actor)) && !(await prisma.hrmOnboardingCase.count({ where: { AND: [{ id: caseId }, (await caseScope(actor))!] } }))) {
    throw new HrmAuthorizationError();
  }

  const result = await prisma.$transaction(async (tx) => {
    const now = new Date();
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`hrm-onboarding-case:${caseId}`}))`;
    const claimed = await tx.hrmOnboardingCase.updateMany({ where: { id: caseId, status: { in: [...OPEN_STATUSES] } }, data: { status: 'CANCELLED', rejectionReason: input.reason } });
    if (claimed.count !== 1) throw new HrmConflictError('This onboarding was changed a moment ago. Refresh and check it.');
    let employeeOutcome: 'ARCHIVED' | 'EXITED_AGAIN' | null = null;
    if (onboardingCase.employeeId) {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`hrm-assignment:${onboardingCase.employeeId}`}))`;
      const employee = await tx.hrmEmployee.findUniqueOrThrow({ where: { id: onboardingCase.employeeId }, select: { id: true, status: true, userId: true, createdAt: true } });
      if (!['DRAFT', 'PRE_ONBOARDING', 'ONBOARDING'].includes(employee.status)) {
        throw new HrmConflictError('This person has already joined. Use Deactivate on their profile instead.');
      }
      const startOfCase = onboardingCase.createdAt;
      // Records made for this joining (assignments, salary, shift) are cancelled; earlier history stays as it is.
      const assignments = await tx.hrmEmploymentAssignment.findMany({ where: { employeeId: employee.id, createdAt: { gte: new Date(startOfCase.getTime() - 60_000) }, status: { in: ['ACTIVE', 'PLANNED'] } }, select: { id: true, officeUnitId: true } });
      await tx.hrmEmploymentAssignment.updateMany({ where: { id: { in: assignments.map((row) => row.id) } }, data: { status: 'CANCELLED' } });
      for (const officeUnitId of new Set(assignments.map((row) => row.officeUnitId).filter((value): value is string => Boolean(value)))) await syncOfficePrimaryManager(tx, officeUnitId);
      await tx.hrmCompensationRevision.updateMany({ where: { employeeId: employee.id, createdAt: { gte: new Date(startOfCase.getTime() - 60_000) }, status: { in: ['DRAFT', 'PENDING_APPROVAL', 'APPROVED'] } }, data: { status: 'REJECTED' } });
      await tx.hrmShiftAssignment.updateMany({ where: { employeeId: employee.id, createdAt: { gte: new Date(startOfCase.getTime() - 60_000) }, status: 'ACTIVE' }, data: { status: 'CANCELLED' } });
      // Leave asked for during this joining is closed too (nobody approves leave for a joining that did not happen).
      await tx.hrmLeaveRequest.updateMany({ where: { employeeId: employee.id, createdAt: { gte: new Date(startOfCase.getTime() - 60_000) }, status: { in: ['DRAFT', 'SUBMITTED'] } }, data: { status: 'CANCELLED', decisionReason: 'Joining cancelled.', version: { increment: 1 } } });
      // A record created together with this case never joined: archive it. An older record (re-hire) left before.
      const createdForThisCase = employee.createdAt.getTime() >= startOfCase.getTime() - 60_000;
      if (createdForThisCase) {
        // The login (if one was linked before joining) is released so it can be used again; its HRM access ends.
        if (employee.userId) {
          await endScopesOnExit(tx, employee.userId, new Date(istToday().getTime() - 86_400_000));
        }
        await tx.hrmEmployee.update({ where: { id: employee.id }, data: { archivedAt: now, archivedById: actor.userId, userId: null, version: { increment: 1 } } });
        if (employee.userId) await audit(actor, 'HRM_EMPLOYEE', employee.id, 'LOGIN_UNLINKED_ON_CANCEL', { loginUserId: employee.userId }, tx);
        employeeOutcome = 'ARCHIVED';
      } else {
        // A re-hire who does not join: the record goes back exactly as it was before the offer re-opened it.
        const snapshot = (onboardingCase.rehireSnapshot ?? null) as null | {
          employee?: { status?: string; joinedOn?: string | null; exitDate?: string | null; source?: string; candidateId?: string | null; applicationId?: string | null; offerId?: string | null };
          assignments?: Array<{ id: string; status: string; effectiveTo: string | null }>;
          salaries?: Array<{ id: string; status: string; effectiveTo: string | null }>;
          shifts?: Array<{ id: string; status: string; effectiveTo: string | null }>;
          scopes?: Array<{ id: string; activeTo: string | null }>;
        };
        const prior = snapshot?.employee;
        const asDate = (value: string | null | undefined) => (value ? new Date(value) : null);
        await tx.hrmEmployee.update({
          where: { id: employee.id },
          data: {
            status: (prior?.status as 'EXITED' | 'TERMINATED' | undefined) ?? 'EXITED',
            ...(prior ? {
              joinedOn: asDate(prior.joinedOn), exitDate: asDate(prior.exitDate),
              ...(prior.source ? { source: prior.source as 'RECRUITMENT' | 'DIRECT_HR' } : {}),
              candidateId: prior.candidateId ?? null, applicationId: prior.applicationId ?? null, offerId: prior.offerId ?? null,
            } : {}),
            version: { increment: 1 },
          },
        });
        for (const row of snapshot?.assignments ?? []) await tx.hrmEmploymentAssignment.update({ where: { id: row.id }, data: { status: row.status as 'ACTIVE' | 'ENDED', effectiveTo: asDate(row.effectiveTo) } });
        for (const row of snapshot?.salaries ?? []) await tx.hrmCompensationRevision.update({ where: { id: row.id }, data: { status: row.status as 'APPROVED', effectiveTo: asDate(row.effectiveTo) } });
        for (const row of snapshot?.shifts ?? []) await tx.hrmShiftAssignment.update({ where: { id: row.id }, data: { status: row.status as 'ACTIVE', effectiveTo: asDate(row.effectiveTo) } });
        for (const row of snapshot?.scopes ?? []) await tx.hrmAccessScope.update({ where: { id: row.id }, data: { activeTo: asDate(row.activeTo) } });
        employeeOutcome = 'EXITED_AGAIN';
      }
      await audit(actor, 'HRM_EMPLOYEE', employee.id, 'JOINING_CANCELLED', { caseId, outcome: employeeOutcome, reason: input.reason }, tx);
    }
    // The offer stays ACCEPTED (the candidate did accept; the signed copy and evidence stay viewable and it cannot be
    // deleted). Its HRM handoff is closed, which also frees the application for a new offer later.
    if (onboardingCase.offerId) {
      await tx.offer.update({
        where: { id: onboardingCase.offerId },
        data: { hrmHandoffStatus: onboardingCase.employeeId ? 'CANCELLED' : 'DISMISSED', hrmHandoffError: `Joining cancelled: ${input.reason}` },
      });
    }
    if (onboardingCase.applicationId) {
      const application = await tx.jobApplication.findUnique({ where: { id: onboardingCase.applicationId }, select: { id: true, currentStage: true, terminalStatus: true, candidateId: true } });
      if (application) {
        await tx.jobApplication.update({ where: { id: application.id }, data: { terminalStatus: 'Did Not Join' } });
        await tx.applicationStageHistory.create({ data: { applicationId: application.id, fromStage: application.currentStage, toStage: application.currentStage, fromTerminalStatus: application.terminalStatus, toTerminalStatus: 'Did Not Join', changedById: actor.userId, notes: `Joining cancelled in HRM: ${input.reason}` } });
        await tx.recruitmentActivityLog.create({ data: { candidateId: application.candidateId, applicationId: application.id, actorId: actor.userId, action: 'JOINING_CANCELLED', title: 'Joining Cancelled', details: input.reason } });
      }
    }
    await audit(actor, 'HRM_ONBOARDING', caseId, 'JOINING_CANCELLED', { reason: input.reason, employeeOutcome }, tx);
    return { caseId, employeeOutcome };
  }, { timeout: 20000, maxWait: 5000 });
  return result;
};

// ---- a case that matched an existing HR record ----

export const resolveOnboardingReview = async (actor: Actor, caseId: string, rawInput: unknown) => {
  const input = parseHrmInput(schemas.resolveOnboardingReview, rawInput);
  const permissions = await requireOnboardingManage(actor);
  if (!hasHrmPermission(permissions, HRM_PERMISSIONS.EMPLOYEES_MANAGE)) throw new HrmAuthorizationError('Deciding this needs the hrm.employees.manage permission.');
  const onboardingCase = await prisma.hrmOnboardingCase.findUnique({ where: { id: caseId } });
  if (!onboardingCase) throw new HrmNotFoundError('Onboarding case not found.');
  if (onboardingCase.status !== 'NEEDS_REVIEW') throw new HrmConflictError('Only a case that needs review can be decided here.');
  if (!onboardingCase.offerId) throw new HrmConflictError('This case has no recruitment offer.');
  const scope = await caseScope(actor);
  if (scope && !(await prisma.hrmOnboardingCase.count({ where: { AND: [{ id: caseId }, scope] } }))) throw new HrmAuthorizationError();

  if (input.action === 'DISMISS') {
    await prisma.$transaction(async (tx) => {
      // The same lock the handoff takes: a dismiss and a "create new" cannot both win.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`hrm-offer-handoff:${onboardingCase.offerId}`}))`;
      const closed = await tx.hrmOnboardingCase.updateMany({ where: { id: caseId, status: 'NEEDS_REVIEW' }, data: { status: 'CANCELLED', rejectionReason: input.reason } });
      if (closed.count !== 1) throw new HrmConflictError('This case was decided a moment ago. Refresh and check it.');
      // The offer stays ACCEPTED with its evidence; the dismissed handoff frees the application for a new offer.
      await tx.offer.update({ where: { id: onboardingCase.offerId! }, data: { hrmHandoffStatus: 'DISMISSED', hrmHandoffError: input.reason } });
      if (onboardingCase.applicationId) {
        const application = await tx.jobApplication.findUnique({ where: { id: onboardingCase.applicationId }, select: { id: true, currentStage: true, terminalStatus: true, candidateId: true } });
        if (application) {
          await tx.jobApplication.update({ where: { id: application.id }, data: { terminalStatus: 'Joining Closed' } });
          await tx.applicationStageHistory.create({ data: { applicationId: application.id, fromStage: application.currentStage, toStage: application.currentStage, fromTerminalStatus: application.terminalStatus, toTerminalStatus: 'Joining Closed', changedById: actor.userId, notes: `HRM review dismissed: ${input.reason}` } });
          await tx.recruitmentActivityLog.create({ data: { candidateId: application.candidateId, applicationId: application.id, actorId: actor.userId, action: 'JOINING_CLOSED', title: 'Joining Closed', details: input.reason } });
        }
      }
      await audit(actor, 'HRM_ONBOARDING', caseId, 'REVIEW_DISMISSED', { reason: input.reason }, tx);
    });
    return { outcome: 'DISMISSED' as const, caseId };
  }
  if (input.action === 'USE_EXISTING') {
    if (!input.employeeId) throw new HrmHttpError(400, 'EMPLOYEE_REQUIRED', 'Choose the existing HR record of this person.');
    await assertEmployeeAccess({ ...actor, employeeId: input.employeeId });
    // Only a record this offer actually matched (same email or mobile) can be re-opened.
    const offer = await prisma.offer.findUnique({ where: { id: onboardingCase.offerId }, select: { candidate: { select: { email: true, mobile: true } } } });
    const matches = offer ? await findEmployeeMatches(offer.candidate.email, offer.candidate.mobile) : [];
    if (!matches.some((match) => match.id === input.employeeId)) {
      throw new HrmHttpError(400, 'NOT_A_MATCH', 'That HR record does not share this candidate\'s email or mobile number. Choose one of the matching records.');
    }
  }
  const result = await handOfferToHrm(onboardingCase.offerId, input.action === 'CREATE_NEW' ? { ignoreMatches: true } : { rehireEmployeeId: input.employeeId! });
  await audit(actor, 'HRM_ONBOARDING', result.caseId, input.action === 'CREATE_NEW' ? 'REVIEW_CREATED_NEW' : 'REVIEW_REHIRED', { reason: input.reason, outcome: result.outcome });
  return result;
};

/**
 * May the caller start / view the HRM handoff of this accepted offer? Same rule as the Onboarding list: an existing
 * case is judged by caseScope; before a case exists, by the offer's place (state office of one of their states, or the
 * head office for a HEAD_OFFICE scope). All-India users see every offer.
 */
export const offerVisibleTo = async (actor: Actor, offerId: string) => {
  const scope = await caseScope(actor);
  if (!scope) return true;
  const existing = await prisma.hrmOnboardingCase.findFirst({ where: { offerId }, select: { id: true } });
  if (existing) return (await prisma.hrmOnboardingCase.count({ where: { AND: [{ id: existing.id }, scope] } })) > 0;
  const offer = await prisma.offer.findUnique({ where: { id: offerId }, select: { stateId: true, locationType: true } });
  if (!offer) return false;
  const scopes = await getActiveScopes(actor.userId);
  if (offer.locationType === 'HEAD_OFFICE') return scopes.some((item) => item.scopeType === 'HEAD_OFFICE');
  return Boolean(offer.stateId && scopes.some((item) => item.scopeType === 'STATE' && item.stateId === offer.stateId));
};
