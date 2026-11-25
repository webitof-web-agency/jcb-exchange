import prisma from '../../../lib/prisma';
import { dispatchRecruitmentWhatsApp } from '../../../services/whatsappIntegration.service';
import { buildJoiningWelcomePayload, welcomeContact } from '../joiningWelcome';
import { pickPlacementOn } from '../joiningReminderRules';

/**
 * Sends RECRUITMENT_JOINING_WELCOME after Confirm joining has committed. Fire-and-forget: it reads the record as it is
 * now (the confirm may have changed the mobile and the first-day placement), never throws and never fails or slows the
 * confirm. The joining date is part of the dedupe key, so a re-hire who joins again later is welcomed again.
 */
export const sendJoiningWelcome = async (input: { employeeId: string; joiningDate: string; loginEmail: string | null }) => {
  try {
    const day = new Date(`${input.joiningDate}T00:00:00.000Z`);
    const [employee, assignments] = await Promise.all([
      prisma.hrmEmployee.findUnique({
        where: { id: input.employeeId },
        select: { employeeCode: true, legalName: true, preferredName: true, personalEmail: true, workEmail: true, mobile: true },
      }),
      prisma.hrmEmploymentAssignment.findMany({
        where: { employeeId: input.employeeId, status: 'ACTIVE', OR: [{ effectiveTo: null }, { effectiveTo: { gte: day } }] },
        orderBy: [{ effectiveFrom: 'asc' }, { createdAt: 'asc' }],
        select: { designation: true, effectiveFrom: true, effectiveTo: true, officeUnit: { select: { name: true } } },
      }),
    ]);
    if (!employee) return { queued: false, reason: 'EMPLOYEE_NOT_FOUND' as const };
    const placement = pickPlacementOn(assignments, day);
    const contact = welcomeContact(employee);
    return await dispatchRecruitmentWhatsApp({
      eventCode: 'RECRUITMENT_JOINING_WELCOME',
      relatedEntityType: 'HRM_EMPLOYEE',
      relatedEntityId: input.employeeId,
      recipientType: 'CANDIDATE',
      recipientPhone: contact.phone,
      recipientEmail: contact.email,
      dedupeSuffix: input.joiningDate,
      payloadSnapshot: buildJoiningWelcomePayload({
        employee,
        joiningDate: input.joiningDate,
        designation: placement?.designation,
        officeName: placement?.officeUnit?.name,
        loginEmail: input.loginEmail,
      }),
    });
  } catch (error) {
    console.error('[hrm] joining welcome could not be sent:', error instanceof Error ? error.message : error);
    return { queued: false, reason: 'DISPATCH_ERROR' as const };
  }
};
