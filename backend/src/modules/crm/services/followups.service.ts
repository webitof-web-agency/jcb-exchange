import { Prisma } from '@prisma/client';
import prisma from '../../../lib/prisma';
import { canTouchLead, followUpScopeWhere, type CrmAccess } from '../access';
import { badRequest, forbidden, notFound } from '../http';
import { addDays, FOLLOW_UP_OUTCOMES, FOLLOW_UP_TYPES, istDayStart, isClosedStatus, needsNextFollowUp, oneOf } from '../rules';
import { assertAssignableStaff, contactSelect, dateOrNull, logLeadActivity, pageArgs, staffSelect, syncNextFollowUp, textOrNull } from './common';
import { assertContactAccess } from './contacts.service';
import { changeStatus, NEXT_FOLLOW_UP_REQUIRED } from './leads.service';
import { getCrmConfig } from './settings.service';

const followUpInclude = {
  owner: { select: staffSelect },
  contact: { select: contactSelect },
  lead: { select: { id: true, status: true, leadType: true, priority: true, temperature: true, listingTitleSnapshot: true, ownerId: true, dealerId: true } },
} satisfies Prisma.CrmFollowUpInclude;

const OUTCOME_LABELS: Record<string, string> = {
  CONNECTED: 'Connected', NOT_REACHABLE: 'Not reachable', BUSY: 'Busy', SWITCHED_OFF: 'Switched off', CALL_BACK_LATER: 'Call back later',
  INTERESTED: 'Interested', NOT_INTERESTED: 'Not interested', WRONG_NUMBER: 'Wrong number', VISITED: 'Visited', NO_SHOW: 'No show',
  MESSAGE_SENT: 'Message sent', OTHER: 'Other',
};

// Outcomes that mean we actually reached the customer.
const REACHED = ['CONNECTED', 'CALL_BACK_LATER', 'INTERESTED', 'NOT_INTERESTED', 'VISITED', 'MESSAGE_SENT'];

export const listFollowUps = async (access: CrmAccess, query: Record<string, string>) => {
  const { page, pageSize, skip, take } = pageArgs(query.page, query.pageSize, 200);
  const now = new Date();
  const todayStart = istDayStart(now);
  const tomorrow = addDays(todayStart, 1);
  const and: Prisma.CrmFollowUpWhereInput[] = [followUpScopeWhere(access)];
  if (query.ownerId === 'me') and.push({ ownerId: access.userId });
  else if (query.ownerId === 'none') and.push({ ownerId: null });
  else if (query.ownerId) and.push({ ownerId: query.ownerId });
  const type = oneOf(FOLLOW_UP_TYPES, query.type);
  if (type) and.push({ type });
  if (query.leadId) and.push({ leadId: query.leadId });
  if (query.contactUserId) and.push({ contactUserId: query.contactUserId });
  const bucket = query.bucket || 'today';
  if (bucket === 'overdue') and.push({ status: 'PENDING', dueAt: { lt: now } });
  else if (bucket === 'today') and.push({ status: 'PENDING', dueAt: { gte: now, lt: tomorrow } });
  else if (bucket === 'upcoming') and.push({ status: 'PENDING', dueAt: { gte: tomorrow } });
  else if (bucket === 'pending') and.push({ status: 'PENDING' });
  else if (bucket === 'missed') and.push({ status: 'MISSED' });
  else if (bucket === 'done') and.push({ status: 'DONE' });
  else if (bucket === 'range') {
    const from = dateOrNull(query.from, 'from date') ?? todayStart;
    const to = dateOrNull(query.to, 'to date') ?? addDays(from, 31);
    if (to.getTime() - from.getTime() > 62 * 24 * 60 * 60 * 1000) throw badRequest('Pick a range of two months or less.');
    and.push({ dueAt: { gte: from, lt: to }, status: { not: 'CANCELLED' } });
  }
  const where: Prisma.CrmFollowUpWhereInput = { AND: and };
  const closed = ['done', 'missed'].includes(bucket);
  const [total, items] = await Promise.all([
    prisma.crmFollowUp.count({ where }),
    prisma.crmFollowUp.findMany({ where, include: followUpInclude, orderBy: { [closed ? 'completedAt' : 'dueAt']: closed ? 'desc' : 'asc' }, skip, take }),
  ]);
  return { page, pageSize, total, items };
};

/** Counts for the "my day" header: overdue / today / upcoming / done today / missed. */
export const followUpSummary = async (access: CrmAccess, ownerFilter: string) => {
  const now = new Date();
  const todayStart = istDayStart(now);
  const tomorrow = addDays(todayStart, 1);
  const owner: Prisma.CrmFollowUpWhereInput = ownerFilter === 'me' ? { ownerId: access.userId } : ownerFilter ? { ownerId: ownerFilter } : {};
  const base = (extra: Prisma.CrmFollowUpWhereInput): Prisma.CrmFollowUpWhereInput => ({ AND: [followUpScopeWhere(access), owner, extra] });
  const [overdue, today, upcoming, doneToday, missed] = await Promise.all([
    prisma.crmFollowUp.count({ where: base({ status: 'PENDING', dueAt: { lt: now } }) }),
    prisma.crmFollowUp.count({ where: base({ status: 'PENDING', dueAt: { gte: now, lt: tomorrow } }) }),
    prisma.crmFollowUp.count({ where: base({ status: 'PENDING', dueAt: { gte: tomorrow } }) }),
    prisma.crmFollowUp.count({ where: base({ status: 'DONE', completedAt: { gte: todayStart } }) }),
    prisma.crmFollowUp.count({ where: base({ status: 'MISSED' }) }),
  ]);
  return { overdue, today, upcoming, doneToday, missed };
};

const requireFollowUp = async (access: CrmAccess, id: string) => {
  const followUp = await prisma.crmFollowUp.findUnique({ where: { id }, include: { lead: { select: { id: true, dealerId: true, ownerId: true, status: true } } } });
  if (!followUp) throw notFound('Follow-up not found.');
  const allowed = followUp.lead
    ? canTouchLead(access, followUp.lead) || followUp.ownerId === access.userId
    : access.canSeeAll || followUp.ownerId === access.userId;
  if (!allowed) throw notFound('Follow-up not found.');
  return followUp;
};

export const createFollowUp = async (access: CrmAccess, body: Record<string, unknown>) => {
  if (!access.canManage) throw forbidden();
  const dueAt = dateOrNull(body.dueAt, 'follow-up date');
  if (!dueAt) throw badRequest('Choose when to follow up.');
  if (dueAt.getTime() < Date.now() - 5 * 60 * 1000) throw badRequest('Pick a time in the future.');
  const type = oneOf(FOLLOW_UP_TYPES, body.type) ?? 'CALL';
  const leadId = textOrNull(body.leadId, 60);
  let contactUserId = textOrNull(body.contactUserId, 60);
  let ownerId = textOrNull(body.ownerId, 60);
  let lead: { id: string; customerId: string; ownerId: string | null; dealerId: string; status: string } | null = null;
  if (leadId) {
    lead = await prisma.lead.findUnique({ where: { id: leadId }, select: { id: true, customerId: true, ownerId: true, dealerId: true, status: true } });
    if (!lead || !canTouchLead(access, lead)) throw notFound('Lead not found.');
    if (isClosedStatus(lead.status)) throw badRequest('Reopen the lead before scheduling a follow-up.');
    contactUserId = lead.customerId;
  } else if (contactUserId) {
    if (access.isPartner) throw forbidden('Partners schedule follow-ups on their leads.');
    await assertContactAccess(access, contactUserId);
  } else {
    throw badRequest('Choose a lead or a contact.');
  }
  if (access.isPartner) ownerId = access.userId;
  else if (ownerId && ownerId !== access.userId) {
    if (!access.canAssign) throw forbidden('Only managers can give follow-ups to others.');
    await assertAssignableStaff(prisma, ownerId);
  } else if (!ownerId) {
    ownerId = lead?.ownerId ?? access.userId;
  }
  const row = await prisma.$transaction(async (tx) => {
    const created = await tx.crmFollowUp.create({
      data: {
        leadId: lead?.id ?? null,
        contactUserId: contactUserId as string,
        ownerId,
        type,
        dueAt,
        title: textOrNull(body.title, 200),
        notes: textOrNull(body.notes, 2000),
        createdById: access.userId,
      },
      include: followUpInclude,
    });
    if (lead) {
      await syncNextFollowUp(tx, lead.id);
      await logLeadActivity(tx, { leadId: lead.id, actorId: access.userId, type: 'FOLLOW_UP', title: `${type.charAt(0)}${type.slice(1).toLowerCase()} follow-up scheduled`, content: textOrNull(body.notes, 2000), metadata: { followUpId: created.id, dueAt: dueAt.toISOString() } });
    }
    return created;
  });
  return row;
};

/**
 * Closes a follow-up with an outcome. For an open lead the next step must be scheduled here,
 * or the lead closed (status WON/LOST) in the same call.
 */
export const completeFollowUp = async (access: CrmAccess, id: string, body: Record<string, unknown>) => {
  if (!access.canManage) throw forbidden();
  const followUp = await requireFollowUp(access, id);
  if (followUp.status !== 'PENDING' && followUp.status !== 'MISSED') throw badRequest('This follow-up is already closed.');
  const outcome = oneOf(FOLLOW_UP_OUTCOMES, body.outcome);
  if (!outcome) throw badRequest('Choose the outcome.');
  const outcomeNotes = textOrNull(body.outcomeNotes, 2000);
  const config = await getCrmConfig();
  const nextInput = body.next && typeof body.next === 'object' && !Array.isArray(body.next) ? body.next as Record<string, unknown> : null;
  const nextDue = nextInput ? dateOrNull(nextInput.dueAt, 'next follow-up date') : null;
  if (nextDue && nextDue.getTime() < Date.now() - 5 * 60 * 1000) throw badRequest('The next follow-up must be in the future.');
  const leadStatus = textOrNull(body.leadStatus, 40)?.toUpperCase() ?? null;
  const closingLead = Boolean(leadStatus && isClosedStatus(leadStatus));
  const lead = followUp.lead;

  if (lead && !closingLead && !nextDue && needsNextFollowUp(leadStatus ?? lead.status, config.requireNextFollowUp)) {
    const otherPending = await prisma.crmFollowUp.count({ where: { leadId: lead.id, status: 'PENDING', id: { not: id } } });
    if (!otherPending) throw badRequest('Schedule the next follow-up (or close the lead).', { code: NEXT_FOLLOW_UP_REQUIRED });
  }

  await prisma.$transaction(async (tx) => {
    await tx.crmFollowUp.update({
      where: { id },
      data: { status: 'DONE', outcome, outcomeNotes, completedAt: new Date(), completedById: access.userId },
    });
    if (nextDue) {
      await tx.crmFollowUp.create({
        data: {
          leadId: followUp.leadId,
          contactUserId: followUp.contactUserId,
          ownerId: followUp.ownerId ?? (access.isPartner ? access.userId : lead?.ownerId ?? access.userId),
          type: oneOf(FOLLOW_UP_TYPES, nextInput?.type) ?? followUp.type,
          dueAt: nextDue,
          title: textOrNull(nextInput?.title, 200),
          notes: textOrNull(nextInput?.notes, 2000),
          createdById: access.userId,
        },
      });
    }
    const label = `${followUp.type.charAt(0)}${followUp.type.slice(1).toLowerCase()} follow-up done — ${OUTCOME_LABELS[outcome]}`;
    if (lead) {
      await syncNextFollowUp(tx, lead.id);
      await logLeadActivity(tx, {
        leadId: lead.id,
        actorId: access.userId,
        type: 'FOLLOW_UP',
        title: label,
        content: outcomeNotes,
        metadata: { followUpId: id, outcome, ...(nextDue ? { nextDueAt: nextDue.toISOString() } : {}) },
        contacted: REACHED.includes(outcome),
      });
    } else {
      await tx.crmContactActivity.create({ data: { contactUserId: followUp.contactUserId, actorId: access.userId, type: 'FOLLOW_UP', title: label, content: outcomeNotes, metadata: { followUpId: id, outcome } } });
    }
  });

  // Status changes go through the lead service so its rules (lost reason, closing follow-ups) apply.
  if (lead && leadStatus && leadStatus !== lead.status) {
    await changeStatus(access, lead.id, { status: leadStatus, lostReason: body.lostReason, note: outcomeNotes, wonAmount: body.wonAmount });
  }
  return prisma.crmFollowUp.findUnique({ where: { id }, include: followUpInclude });
};

export const rescheduleFollowUp = async (access: CrmAccess, id: string, body: Record<string, unknown>) => {
  if (!access.canManage) throw forbidden();
  const followUp = await requireFollowUp(access, id);
  if (followUp.status !== 'PENDING' && followUp.status !== 'MISSED') throw badRequest('Only open follow-ups can be rescheduled.');
  const dueAt = dateOrNull(body.dueAt, 'new date');
  if (!dueAt) throw badRequest('Choose the new date and time.');
  if (dueAt.getTime() < Date.now() - 5 * 60 * 1000) throw badRequest('Pick a time in the future.');
  const reason = textOrNull(body.reason, 300);
  if (!reason) throw badRequest('Say why it is being moved.');
  await prisma.$transaction(async (tx) => {
    await tx.crmFollowUp.update({
      where: { id },
      data: { status: 'PENDING', dueAt, previousDueAt: followUp.dueAt, rescheduleCount: { increment: 1 }, lastRescheduleReason: reason, remindedAt: null, customerRemindedAt: null, missedAt: null, escalatedAt: null },
    });
    if (followUp.leadId) {
      await syncNextFollowUp(tx, followUp.leadId);
      await logLeadActivity(tx, { leadId: followUp.leadId, actorId: access.userId, type: 'FOLLOW_UP', title: 'Follow-up rescheduled', content: reason, metadata: { followUpId: id, from: followUp.dueAt.toISOString(), to: dueAt.toISOString() } });
    }
  });
  return prisma.crmFollowUp.findUnique({ where: { id }, include: followUpInclude });
};

/** Moves many open follow-ups (e.g. staff on leave) to one date, keeping each one's time of day. */
export const bulkReschedule = async (access: CrmAccess, body: Record<string, unknown>) => {
  if (!access.canManage) throw forbidden();
  const ids = Array.isArray(body.ids) ? body.ids.map(String).slice(0, 200) : [];
  const date = dateOrNull(body.date, 'date');
  const reason = textOrNull(body.reason, 300);
  if (!ids.length || !date || !reason) throw badRequest('Select follow-ups, a date and a reason.');
  let moved = 0;
  for (const id of ids) {
    const followUp = await requireFollowUp(access, id).catch(() => null);
    if (!followUp || (followUp.status !== 'PENDING' && followUp.status !== 'MISSED')) continue;
    const timeOfDay = followUp.dueAt.getTime() - istDayStart(followUp.dueAt).getTime();
    const dueAt = new Date(istDayStart(date).getTime() + timeOfDay);
    if (dueAt.getTime() < Date.now()) continue;
    await rescheduleFollowUp(access, id, { dueAt: dueAt.toISOString(), reason });
    moved += 1;
  }
  return { moved };
};

export const reassignFollowUp = async (access: CrmAccess, id: string, body: Record<string, unknown>) => {
  if (!access.canAssign) throw forbidden('Only managers can reassign follow-ups.');
  await requireFollowUp(access, id);
  const ownerId = textOrNull(body.ownerId, 60);
  if (ownerId) await assertAssignableStaff(prisma, ownerId);
  return prisma.crmFollowUp.update({ where: { id }, data: { ownerId, remindedAt: null }, include: followUpInclude });
};

export const cancelFollowUp = async (access: CrmAccess, id: string, body: Record<string, unknown>) => {
  if (!access.canManage) throw forbidden();
  const followUp = await requireFollowUp(access, id);
  if (followUp.status !== 'PENDING' && followUp.status !== 'MISSED') throw badRequest('This follow-up is already closed.');
  const reason = textOrNull(body.reason, 300);
  if (!reason) throw badRequest('Say why it is being cancelled.');
  if (followUp.lead && !isClosedStatus(followUp.lead.status)) {
    const config = await getCrmConfig();
    const others = await prisma.crmFollowUp.count({ where: { leadId: followUp.lead.id, status: 'PENDING', id: { not: id } } });
    if (!others && needsNextFollowUp(followUp.lead.status, config.requireNextFollowUp)) {
      throw badRequest('This is the lead\'s only next step. Reschedule it, or close the lead instead.', { code: NEXT_FOLLOW_UP_REQUIRED });
    }
  }
  await prisma.$transaction(async (tx) => {
    await tx.crmFollowUp.update({ where: { id }, data: { status: 'CANCELLED', outcomeNotes: reason, completedAt: new Date(), completedById: access.userId } });
    if (followUp.leadId) {
      await syncNextFollowUp(tx, followUp.leadId);
      await logLeadActivity(tx, { leadId: followUp.leadId, actorId: access.userId, type: 'FOLLOW_UP', title: 'Follow-up cancelled', content: reason, metadata: { followUpId: id } });
    }
  });
  return { cancelled: true };
};
