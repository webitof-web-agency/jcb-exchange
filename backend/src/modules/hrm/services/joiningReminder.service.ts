import prisma from '../../../lib/prisma';
import { dispatchRecruitmentWhatsApp } from '../../../services/whatsappIntegration.service';
import { dispatchRecruitmentSms } from '../../../services/smsIntegration.service';
import { enqueueConfiguredEmail } from '../../../services/recruitmentEmail.service';
import { getEmployeeScopeWhere } from '../access';
import { activeChargeWhere } from '../additionalChargeRules';
import { listCurrentOfficeManagers, WORKING_STATUSES } from '../officeAssignments';
import { buildChecklist, checklistProgress } from '../onboardingChecklist';
import {
  JOINING_REMINDER_STATUSES,
  OPEN_CASE_STATUSES,
  buildReminderNotification,
  buildReminderPayload,
  channelDispatchFailed,
  describeMissingItems,
  isJoiningReminderDue,
  managesOnboarding,
  mergeReminderRecipients,
  onboardingPathFor,
  pickPlacementOn,
  portalUrl,
  reminderDays,
  reminderNotificationKey,
  reminderRecipientType,
  reminderRelatedEntityId,
  stateOfficeTarget,
  type JoinerSummary,
  type ReminderRecipient,
  type StaffContact,
  type StateOfficeTarget,
} from '../joiningReminderRules';
import { loadChecklistFacts } from './onboarding.service';

/**
 * The database side of the joining reminder (the rules are in joiningReminderRules.ts). Run by the background job
 * once a day; safe to run again: every notification and message has a unique dedupe key.
 */

type Joiner = JoinerSummary & { userId: string | null; target: StateOfficeTarget | null };

const contactSelect = { id: true, role: true, status: true, email: true, mobile: true, whatsappNumber: true } as const;

const isUniqueViolation = (error: unknown) => typeof error === 'object' && error !== null && 'code' in error && (error as { code?: unknown }).code === 'P2002';

/** People joining on the day whose checklist still has required items open. */
const findDueJoiners = async (joiningDay: Date, joiningDayKey: string): Promise<Joiner[]> => {
  const rows = await prisma.hrmEmployee.findMany({
    where: {
      status: { in: [...JOINING_REMINDER_STATUSES] },
      archivedAt: null,
      joinedOn: joiningDay,
      onboardingCases: { some: { status: { in: [...OPEN_CASE_STATUSES] } } },
    },
    select: { id: true, employeeCode: true, legalName: true, preferredName: true, status: true, archivedAt: true, joinedOn: true, userId: true },
    orderBy: { employeeCode: 'asc' },
  });
  if (!rows.length) return [];
  const ids = rows.map((row) => row.id);
  const [facts, assignments] = await Promise.all([
    loadChecklistFacts(ids),
    prisma.hrmEmploymentAssignment.findMany({
      where: { employeeId: { in: ids }, status: 'ACTIVE', OR: [{ effectiveTo: null }, { effectiveTo: { gte: joiningDay } }] },
      orderBy: [{ effectiveFrom: 'asc' }, { createdAt: 'asc' }],
      select: {
        employeeId: true, designation: true, effectiveFrom: true, effectiveTo: true, stateId: true,
        officeUnit: { select: { id: true, name: true, type: true, stateId: true, state: { select: { name: true } } } },
        state: { select: { name: true } },
      },
    }),
  ]);
  const joiners: Joiner[] = [];
  for (const row of rows) {
    const employeeFacts = facts.get(row.id);
    if (!employeeFacts) continue;
    const checklist = buildChecklist(employeeFacts);
    const { missingRequired } = checklistProgress(checklist);
    // The query already filters; the pure rule is the one place that decides.
    if (!isJoiningReminderDue({ ...row, hasOpenCase: true }, joiningDay, missingRequired)) continue;
    const placement = pickPlacementOn(assignments.filter((assignment) => assignment.employeeId === row.id), joiningDay);
    joiners.push({
      employeeId: row.id,
      userId: row.userId,
      employeeName: row.preferredName?.trim() || row.legalName,
      employeeCode: row.employeeCode,
      designation: placement?.designation ?? '',
      joiningDate: joiningDayKey,
      officeName: placement?.officeUnit?.name ?? '',
      stateName: placement?.state?.name ?? placement?.officeUnit?.state?.name ?? '',
      missingItems: describeMissingItems(checklist, missingRequired),
      missingCount: missingRequired.length,
      target: stateOfficeTarget(placement),
    });
  }
  return joiners;
};

/**
 * For each joiner, the logins that hold hrm.onboarding.manage and whose HRM scope covers them (the same scope filter
 * the Onboarding list uses). A login whose scope cannot be worked out is skipped and the run counts a failure.
 */
const hrContactsByJoiner = async (joinerIds: string[]) => {
  const byJoiner = new Map<string, StaffContact[]>(joinerIds.map((id) => [id, []]));
  let failed = 0;
  const staff = await prisma.user.findMany({
    where: { status: 'ACTIVE', role: { in: ['SUPER_ADMIN', 'ADMIN', 'EMPLOYEE'] } },
    select: { ...contactSelect, customRole: { select: { permissions: true } }, adminPermissions: { select: { permission: true } } },
  });
  for (const user of staff) {
    if (!managesOnboarding(user)) continue;
    try {
      const scope = await getEmployeeScopeWhere({ userId: user.id, role: user.role });
      const covered = scope
        ? (await prisma.hrmEmployee.findMany({ where: { AND: [{ id: { in: joinerIds } }, scope] }, select: { id: true } })).map((row) => row.id)
        : joinerIds;
      const contact: StaffContact = { id: user.id, role: user.role, status: user.status, email: user.email, mobile: user.mobile, whatsappNumber: user.whatsappNumber };
      for (const id of covered) byJoiner.get(id)?.push(contact);
    } catch (error) {
      failed += 1;
      console.error('[hrm-joining-reminder] could not read the HRM scope of a recipient:', error instanceof Error ? error.message : error);
    }
  }
  return { byJoiner, failed };
};

/** The logins of the current managers (posted or on additional charge) of the state office, or of the state's offices. */
const stateManagerContacts = async (target: StateOfficeTarget, today: Date): Promise<StaffContact[]> => {
  const officeIds = 'officeUnitId' in target
    ? [target.officeUnitId]
    : (await prisma.hrmOrgUnit.findMany({ where: { type: 'REGION', stateId: target.stateId, isActive: true }, select: { id: true } })).map((row) => row.id);
  const managerIds = new Set<string>();
  for (const officeId of officeIds) {
    for (const row of await listCurrentOfficeManagers(prisma, officeId, today)) managerIds.add(row.employeeId);
  }
  // Whoever holds an additional charge of the office hears about its joiners too.
  const holders = officeIds.length ? await prisma.hrmAdditionalCharge.findMany({
    where: { officeUnitId: { in: officeIds }, ...activeChargeWhere(today), employee: { status: { in: [...WORKING_STATUSES] }, archivedAt: null } },
    select: { employeeId: true },
  }) : [];
  for (const row of holders) managerIds.add(row.employeeId);
  if (!managerIds.size) return [];
  const rows = await prisma.hrmEmployee.findMany({ where: { id: { in: [...managerIds] }, userId: { not: null } }, select: { user: { select: contactSelect } } });
  return rows.flatMap((row) => (row.user ? [row.user] : []));
};

/** The in-app notification and the configured channels for one recipient. Each is deduplicated on its own key. */
const remind = async (joiner: Joiner, recipient: ReminderRecipient, portalOrigin: string | undefined) => {
  const path = onboardingPathFor(recipient.role);
  let created = false;
  try {
    await prisma.notification.create({
      data: {
        userId: recipient.userId,
        ...buildReminderNotification(joiner),
        type: 'HRM_JOINING_REMINDER',
        link: path,
        dedupeKey: reminderNotificationKey(joiner.employeeId, joiner.joiningDate, recipient.userId),
      },
    });
    created = true;
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
  }
  // Called again on a repeated run on purpose: WhatsApp / SMS / email each skip a key they already have, so a run that
  // stopped between the notification and the message still sends the message. Each channel's answer is read: one
  // that could not be queued (not one that is simply switched off) fails this recipient, so the day is tried again.
  const common = {
    eventCode: 'RECRUITMENT_JOINING_REMINDER' as const,
    relatedEntityType: 'HRM_EMPLOYEE',
    relatedEntityId: reminderRelatedEntityId(joiner.employeeId, joiner.joiningDate),
    payloadSnapshot: buildReminderPayload(joiner, portalUrl(path, portalOrigin)),
  };
  const recipientType = reminderRecipientType(recipient.role);
  const settle = (work: Promise<unknown>) => work.catch((error: unknown) => (error instanceof Error ? error : new Error(String(error))));
  const [whatsapp, sms, email] = await Promise.all([
    settle(dispatchRecruitmentWhatsApp({ ...common, recipientType, recipientPhone: recipient.phone, dispatchSms: false })),
    settle(dispatchRecruitmentSms({ ...common, recipientType, recipientPhone: recipient.phone })),
    recipient.email ? settle(enqueueConfiguredEmail({ ...common, recipientEmail: recipient.email })) : Promise.resolve(null),
  ]);
  const failedChannels = ([['WhatsApp', whatsapp], ['SMS', sms], ['email', email]] as const).filter(([, result]) => channelDispatchFailed(result)).map(([name]) => name);
  if (failedChannels.length) throw new Error(`could not queue the ${failedChannels.join(' / ')} reminder; it is tried again on the next run`);
  return created;
};

export const runJoiningReminders = async (now = new Date()) => {
  const { today, joiningDay, joiningDayKey } = reminderDays(now);
  const joiners = await findDueJoiners(joiningDay, joiningDayKey);
  if (!joiners.length) return { joiners: 0, recipients: 0, notified: 0, failed: 0 };

  const hr = await hrContactsByJoiner(joiners.map((joiner) => joiner.employeeId));
  let failed = hr.failed;
  let recipients = 0;
  let notified = 0;
  const managersOf = new Map<string, Promise<StaffContact[]>>();
  const portalOrigin = process.env.ADMIN_PORTAL_URL;
  for (const joiner of joiners) {
    try {
      let stateManagers: StaffContact[] = [];
      if (joiner.target) {
        const key = JSON.stringify(joiner.target);
        if (!managersOf.has(key)) managersOf.set(key, stateManagerContacts(joiner.target, today));
        stateManagers = await managersOf.get(key)!;
      }
      const list = mergeReminderRecipients({ hr: hr.byJoiner.get(joiner.employeeId) ?? [], stateManagers, joinerUserId: joiner.userId });
      for (const recipient of list) {
        recipients += 1;
        try {
          if (await remind(joiner, recipient, portalOrigin)) notified += 1;
        } catch (error) {
          failed += 1;
          console.error(`[hrm-joining-reminder] reminder for ${joiner.employeeCode} failed:`, error instanceof Error ? error.message : error);
        }
      }
    } catch (error) {
      failed += 1;
      console.error(`[hrm-joining-reminder] recipients of ${joiner.employeeCode} could not be read:`, error instanceof Error ? error.message : error);
    }
  }
  return { joiners: joiners.length, recipients, notified, failed };
};
