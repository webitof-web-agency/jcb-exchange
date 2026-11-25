import prisma from '../../../lib/prisma';
import { normalizeSalaryComponents, totalSalaryComponents } from '../../../utils/offerRules';
import { assertEmployeeAccess, getHrmPermissions } from '../access';
import { writeHrmAudit } from '../audit';
import { HrmAuthorizationError, HrmConflictError, HrmHttpError, HrmNotFoundError } from '../errors';
import { HRM_PERMISSIONS, hasHrmPermission } from '../security';
import { parseHrmInput, schemas } from '../validation';
import { istToday } from '../istDate';
import { assertEmployeeWritable, assertNotOwnRecord } from '../employeeGuards';

type Actor = { userId: string; role: string; ipAddress?: string | null };

/**
 * Salary revisions (effective-dated, never deleted). HR proposes a revision with its monthly breakup; it stays
 * PENDING_APPROVAL until somebody with hrm.compensation.approve - not the person who proposed it, unless a Super
 * Admin - approves or rejects it. Approving closes the salary in force the day before and supersedes approved
 * revisions that would start on or after the new date. Only approved revisions are "the salary" (payroll).
 */

const dayFrom = (value: string) => new Date(`${value}T00:00:00.000Z`);
const DAY = 86_400_000;

const audit = (actor: Actor, entityId: string, action: string, after: unknown, before?: unknown) => writeHrmAudit({
  actorUserId: actor.userId, entityType: 'HRM_COMPENSATION', entityId, action, after,
  ...(before !== undefined ? { before } : {}), ...(actor.ipAddress !== undefined ? { ipAddress: actor.ipAddress } : {}),
});

export const proposeCompensation = async (actor: Actor, employeeId: string, rawInput: unknown) => {
  const input = parseHrmInput(schemas.proposeCompensation, rawInput);
  await assertEmployeeAccess({ ...actor, employeeId });
  await assertNotOwnRecord(actor, employeeId, 'Proposing a salary');
  const employee = await prisma.hrmEmployee.findUnique({ where: { id: employeeId }, select: { id: true, archivedAt: true, status: true } });
  if (!employee || employee.archivedAt) throw new HrmNotFoundError('Employee not found.');
  if (employee.status === 'EXITED' || employee.status === 'TERMINATED') throw new HrmConflictError('This person has left the company, so their salary cannot be revised.');

  const parsed = normalizeSalaryComponents(input.components);
  if ('error' in parsed) throw new HrmHttpError(400, 'SALARY_INVALID', parsed.error);
  if (!parsed.components.length) throw new HrmHttpError(400, 'SALARY_INVALID', 'Enter at least one salary amount.');
  const totals = totalSalaryComponents(parsed.components);
  const basic = parsed.components.find((component) => component.code === 'BASIC')?.monthlyAmount ?? 0;

  const revision = await prisma.hrmCompensationRevision.create({
    data: {
      employeeId,
      effectiveFrom: dayFrom(input.effectiveFrom),
      currency: 'INR',
      baseSalary: basic,
      grossSalary: totals.grossMonthly,
      annualCtc: totals.annualCtc,
      status: 'PENDING_APPROVAL',
      reason: input.reason ?? null,
      createdById: actor.userId,
      components: {
        create: parsed.components.map((component) => ({
          code: component.code, name: component.name, componentType: component.componentType,
          amount: component.monthlyAmount, isRecurring: true, isTaxable: component.componentType === 'EARNING',
        })),
      },
    },
    include: { components: true },
  });
  await audit(actor, revision.id, 'PROPOSED', { employeeId, effectiveFrom: input.effectiveFrom, annualCtc: totals.annualCtc });
  return revision;
};

export const decideCompensation = async (actor: Actor, revisionId: string, rawInput: unknown) => {
  const input = parseHrmInput(schemas.compensationDecision, rawInput);
  const permissions = await getHrmPermissions(actor.userId, actor.role);
  if (!hasHrmPermission(permissions, HRM_PERMISSIONS.COMPENSATION_APPROVE)) {
    throw new HrmAuthorizationError('Approving or rejecting a salary needs the hrm.compensation.approve permission.');
  }
  const revision = await prisma.hrmCompensationRevision.findUnique({ where: { id: revisionId }, include: { components: true } });
  if (!revision) throw new HrmNotFoundError('Salary revision not found.');
  await assertEmployeeAccess({ ...actor, employeeId: revision.employeeId });
  // Nobody decides their own salary, and nothing is approved for somebody who left or never joined.
  await assertNotOwnRecord(actor, revision.employeeId, 'Approving a salary');
  if (input.action === 'APPROVE') await assertEmployeeWritable(revision.employeeId);
  if (revision.status !== 'PENDING_APPROVAL' && revision.status !== 'DRAFT') {
    throw new HrmConflictError(`This salary revision is already ${revision.status.toLowerCase().replace(/_/g, ' ')}.`);
  }
  // Maker-checker: the person who proposed a salary does not approve it themselves.
  if (revision.createdById === actor.userId && actor.role !== 'SUPER_ADMIN') {
    throw new HrmAuthorizationError('A salary you proposed must be approved by somebody else.');
  }
  const reason = input.reason?.trim() || null;

  if (input.action === 'REJECT') {
    if (!reason || reason.length < 3) throw new HrmHttpError(400, 'REASON_REQUIRED', 'Give the reason the salary is rejected.');
    const result = await prisma.hrmCompensationRevision.updateMany({
      where: { id: revisionId, status: revision.status },
      data: { status: 'REJECTED', reason: [revision.reason, `Rejected: ${reason}`].filter(Boolean).join('\n') },
    });
    if (result.count !== 1) throw new HrmConflictError('This salary revision was changed a moment ago. Refresh and try again.');
    await audit(actor, revisionId, 'REJECTED', { reason });
    return prisma.hrmCompensationRevision.findUniqueOrThrow({ where: { id: revisionId }, include: { components: true } });
  }

  if (!revision.components.length) {
    throw new HrmHttpError(400, 'SALARY_BREAKUP_REQUIRED', 'This salary has only a CTC. Reject it and propose it again with the monthly breakup (Basic, HRA, ...) before approving.');
  }

  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`hrm-compensation:${revision.employeeId}`}))`;
    const result = await tx.hrmCompensationRevision.updateMany({
      where: { id: revisionId, status: revision.status },
      data: { status: 'APPROVED', approvedById: actor.userId, approvedAt: new Date(), ...(reason ? { reason: [revision.reason, `Approved: ${reason}`].filter(Boolean).join('\n') } : {}) },
    });
    if (result.count !== 1) throw new HrmConflictError('This salary revision was changed a moment ago. Refresh and try again.');
    const from = revision.effectiveFrom;
    // The salary in force before ends the day before; approved ones that would start on or after it are replaced.
    await tx.hrmCompensationRevision.updateMany({
      where: { employeeId: revision.employeeId, id: { not: revisionId }, status: 'APPROVED', effectiveFrom: { lt: from }, OR: [{ effectiveTo: null }, { effectiveTo: { gte: from } }] },
      data: { effectiveTo: new Date(from.getTime() - DAY) },
    });
    await tx.hrmCompensationRevision.updateMany({
      where: { employeeId: revision.employeeId, id: { not: revisionId }, status: 'APPROVED', effectiveFrom: { gte: from } },
      data: { status: 'SUPERSEDED' },
    });
    await writeHrmAudit({
      actorUserId: actor.userId, entityType: 'HRM_COMPENSATION', entityId: revisionId, action: 'APPROVED',
      after: { effectiveFrom: from.toISOString().slice(0, 10), annualCtc: revision.annualCtc, reason },
      ...(actor.ipAddress !== undefined ? { ipAddress: actor.ipAddress } : {}),
    }, tx);
    return tx.hrmCompensationRevision.findUniqueOrThrow({ where: { id: revisionId }, include: { components: true } });
  });
};

/** All revisions (newest first) with who proposed / approved them, and the one in force today. */
export const listCompensationHistory = async (actor: Actor, employeeId: string) => {
  await assertEmployeeAccess({ ...actor, employeeId });
  const revisions = await prisma.hrmCompensationRevision.findMany({
    where: { employeeId },
    include: { components: true },
    orderBy: [{ effectiveFrom: 'desc' }, { createdAt: 'desc' }],
  });
  const userIds = [...new Set(revisions.flatMap((revision) => [revision.createdById, revision.approvedById]).filter((value): value is string => Boolean(value)))];
  const users = userIds.length ? await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true, email: true } }) : [];
  const nameOf = new Map(users.map((user) => [user.id, user.name || user.email || user.id]));
  const today = istToday();
  const current = revisions.find((revision) => revision.status === 'APPROVED' && revision.effectiveFrom <= today && (!revision.effectiveTo || revision.effectiveTo >= today)) ?? null;
  return {
    currentRevisionId: current?.id ?? null,
    revisions: revisions.map((revision) => ({
      ...revision,
      createdByName: revision.createdById ? nameOf.get(revision.createdById) ?? null : null,
      approvedByName: revision.approvedById ? nameOf.get(revision.approvedById) ?? null : null,
    })),
  };
};
