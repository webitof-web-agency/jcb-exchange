import prisma from '../../../lib/prisma';
import { addDays, addMinutes, isMissed, isReminderDue } from '../rules';
import { logLeadActivity } from './common';
import { findMatchingListings } from './matching.service';
import { formatIst, leadTypeLabel, notifyUsers, sendCrmMessage } from './notify.service';
import { rescoreLead } from './scoring.service';
import { getCrmConfig, readAutomationState, writeAutomationState, type CrmConfig } from './settings.service';
import { listPipelineStageStatusSets } from './pipelineStages.service';

const SITE_URL = (process.env.PUBLIC_SITE_URL || 'https://jcbexchange.com').replace(/\/+$/, '');
const BATCH = 200;

const managerIds = async (config: CrmConfig) =>
  config.missed.managerUserIds.length
    ? config.missed.managerUserIds
    : (await prisma.user.findMany({ where: { role: 'SUPER_ADMIN', status: 'ACTIVE' }, select: { id: true } })).map((u) => u.id);

const typeLabel = (type: string) => `${type.charAt(0)}${type.slice(1).toLowerCase()}`;

/** Owner reminders shortly before a follow-up is due (always on; channels from settings). */
const sendReminders = async (config: CrmConfig, now: Date) => {
  const horizon = addMinutes(now, config.reminders.minutesBefore);
  const due = await prisma.crmFollowUp.findMany({
    // Skip ones already far past due (they become MISSED instead of a late "reminder").
    where: { status: 'PENDING', remindedAt: null, dueAt: { lte: horizon, gte: addMinutes(now, -config.missed.graceMinutes) } },
    take: BATCH,
    include: {
      contact: { select: { name: true, mobile: true } },
      owner: { select: { id: true, name: true, mobile: true, role: true } },
      lead: { select: { id: true, listingTitleSnapshot: true, leadType: true } },
    },
  });
  const managers = due.some((f) => !f.ownerId) ? await managerIds(config) : [];
  let sent = 0;
  for (const followUp of due) {
    if (!isReminderDue(followUp, now, config.reminders.minutesBefore)) continue;
    const who = followUp.contact.name || followUp.contact.mobile || 'customer';
    const message = `${typeLabel(followUp.type)} ${who} at ${formatIst(followUp.dueAt)}${followUp.title ? ` — ${followUp.title}` : ''}.`;
    if (config.reminders.inApp) {
      await notifyUsers(followUp.ownerId ? [followUp.ownerId] : managers, {
        title: followUp.ownerId ? 'Follow-up due' : 'Unassigned follow-up due',
        message,
        type: 'CRM_FOLLOW_UP_REMINDER',
        leadId: followUp.leadId,
        tab: 'followups',
        push: config.reminders.push,
      });
    }
    if (followUp.owner && (config.reminders.whatsappToOwner || config.reminders.smsToOwner)) {
      await sendCrmMessage({
        event: 'CRM_FOLLOW_UP_REMINDER',
        recipientType: followUp.owner.role === 'PARTNER' ? 'PARTNER' : 'EMPLOYEE',
        phone: followUp.owner.mobile,
        entityId: followUp.id,
        values: [followUp.owner.name, who, typeLabel(followUp.type), formatIst(followUp.dueAt), followUp.contact.mobile],
        variables: { staffName: followUp.owner.name, customerName: who, followUpType: typeLabel(followUp.type), dueAt: formatIst(followUp.dueAt), customerMobile: followUp.contact.mobile },
        dedupeSuffix: followUp.dueAt.toISOString(),
      });
    }
    await prisma.crmFollowUp.update({ where: { id: followUp.id }, data: { remindedAt: now } });
    sent += 1;
  }
  return sent;
};

/** Marks follow-ups MISSED after the grace period and escalates to managers (always on). */
const markMissed = async (config: CrmConfig, now: Date) => {
  const stale = await prisma.crmFollowUp.findMany({
    where: { status: 'PENDING', dueAt: { lt: addMinutes(now, -config.missed.graceMinutes) } },
    take: BATCH,
    include: { contact: { select: { name: true, mobile: true } }, owner: { select: { id: true, name: true } } },
  });
  if (!stale.length) return 0;
  const managers = config.missed.escalate ? await managerIds(config) : [];
  for (const followUp of stale) {
    if (!isMissed(followUp, now, config.missed.graceMinutes)) continue;
    await prisma.$transaction(async (tx) => {
      await tx.crmFollowUp.update({ where: { id: followUp.id }, data: { status: 'MISSED', missedAt: now, ...(managers.length ? { escalatedAt: now } : {}) } });
      if (followUp.leadId) {
        await logLeadActivity(tx, { leadId: followUp.leadId, actorId: null, type: 'FOLLOW_UP', title: 'Follow-up missed', content: `${typeLabel(followUp.type)} due ${formatIst(followUp.dueAt)} was not done.`, metadata: { followUpId: followUp.id } });
      }
    });
    const who = followUp.contact.name || followUp.contact.mobile || 'customer';
    if (followUp.ownerId) {
      await notifyUsers([followUp.ownerId], { title: 'Follow-up missed', message: `${typeLabel(followUp.type)} ${who} (due ${formatIst(followUp.dueAt)}) was missed. Reschedule or complete it.`, type: 'CRM_FOLLOW_UP_MISSED', leadId: followUp.leadId, tab: 'followups' });
    }
    const escalateTo = managers.filter((id) => id !== followUp.ownerId);
    if (escalateTo.length) {
      await notifyUsers(escalateTo, { title: 'Missed follow-up', message: `${followUp.owner?.name || 'Unassigned'} missed: ${typeLabel(followUp.type)} ${who} (due ${formatIst(followUp.dueAt)}).`, type: 'CRM_ESCALATION', leadId: followUp.leadId, tab: 'followups', push: false });
    }
  }
  return stale.length;
};

/** First-response SLA: always marks the breach; notifies managers only when SLA escalation is on. */
const checkSla = async (config: CrmConfig, now: Date) => {
  const { terminal } = await listPipelineStageStatusSets();
  const breached = await prisma.lead.findMany({
    where: { firstResponseAt: null, slaBreachedAt: null, slaDueAt: { lt: now }, status: { notIn: [...terminal] }, mergedIntoId: null },
    take: BATCH,
    select: { id: true, ownerId: true, priority: true, customer: { select: { name: true } }, listingTitleSnapshot: true, leadType: true, dealer: { select: { role: true } } },
  });
  if (!breached.length) return 0;
  await prisma.lead.updateMany({ where: { id: { in: breached.map((l) => l.id) } }, data: { slaBreachedAt: now } });
  if (config.automation.enabled && config.automation.slaEscalation) {
    const managers = await managerIds(config);
    for (const lead of breached.filter((l) => l.dealer.role !== 'PARTNER')) {
      await notifyUsers([...managers, ...(lead.ownerId ? [lead.ownerId] : [])], {
        title: 'Lead not contacted in time',
        message: `${lead.customer.name || 'A customer'} — ${lead.listingTitleSnapshot || leadTypeLabel(lead.leadType)} (${lead.priority.toLowerCase()} priority) has no first response yet.`,
        type: 'CRM_SLA_BREACH',
        leadId: lead.id,
      });
    }
  }
  return breached.length;
};

/** WhatsApp/SMS appointment reminders to customers for visits/inspections/meetings in the next 24h. */
const customerReminders = async (now: Date) => {
  const upcoming = await prisma.crmFollowUp.findMany({
    where: { status: 'PENDING', customerRemindedAt: null, type: { in: ['VISIT', 'INSPECTION', 'MEETING'] }, dueAt: { gte: addMinutes(now, 60), lte: addDays(now, 1) } },
    take: BATCH,
    include: { contact: { select: { name: true, mobile: true, whatsappNumber: true, crmProfile: { select: { doNotContact: true } } } } },
  });
  for (const followUp of upcoming) {
    if (followUp.contact.crmProfile?.doNotContact) continue;
    await sendCrmMessage({
      event: 'CRM_APPOINTMENT_REMINDER',
      recipientType: 'CUSTOMER',
      phone: followUp.contact.whatsappNumber || followUp.contact.mobile,
      entityId: followUp.id,
      values: [followUp.contact.name, typeLabel(followUp.type), formatIst(followUp.dueAt)],
      variables: { customerName: followUp.contact.name, followUpType: typeLabel(followUp.type), dueAt: formatIst(followUp.dueAt) },
      dedupeSuffix: followUp.dueAt.toISOString(),
    });
    await prisma.crmFollowUp.update({ where: { id: followUp.id }, data: { customerRemindedAt: now } });
  }
  return upcoming.length;
};

/** Tells buyers about newly published listings that fit their saved requirement (one per run). */
const matchAlerts = async (since: Date) => {
  const { terminal } = await listPipelineStageStatusSets();
  const leads = await prisma.lead.findMany({
    where: { matchAlertsEnabled: true, status: { notIn: [...terminal] }, mergedIntoId: null },
    take: BATCH,
    include: { customer: { select: { name: true, mobile: true, whatsappNumber: true, crmProfile: { select: { doNotContact: true } } } } },
  });
  let sent = 0;
  for (const lead of leads) {
    if (lead.customer.crmProfile?.doNotContact) continue;
    const [best] = await findMatchingListings(lead, { limit: 1, excludeIds: [...lead.notifiedListingIds, ...(lead.listingId ? [lead.listingId] : [])], publishedSince: since });
    if (!best) continue;
    const price = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(best.price);
    const url = `${SITE_URL}/machines/${best.id}`;
    await sendCrmMessage({
      event: 'CRM_MATCHING_LISTING',
      recipientType: 'CUSTOMER',
      phone: lead.customer.whatsappNumber || lead.customer.mobile,
      entityId: lead.id,
      values: [lead.customer.name, best.title, price, url],
      variables: { customerName: lead.customer.name, listingTitle: best.title, listingPrice: price, listingUrl: url },
      dedupeSuffix: best.id,
    });
    await prisma.$transaction(async (tx) => {
      await tx.lead.update({ where: { id: lead.id }, data: { notifiedListingIds: [...lead.notifiedListingIds, best.id].slice(-200) } });
      await logLeadActivity(tx, { leadId: lead.id, actorId: null, type: 'WHATSAPP', title: 'Matching machine shared', content: `${best.title} (${price}) — ${url}`, metadata: { listingId: best.id, matchScore: best.matchScore, automated: true } });
    });
    sent += 1;
  }
  return sent;
};

/** Gentle nudge to lost/on-hold leads after N quiet days (never duplicates, never DND contacts). */
const reengage = async (config: CrmConfig, now: Date) => {
  const cutoff = addDays(now, -config.automation.reengageAfterDays);
  const leads = await prisma.lead.findMany({
    where: {
      status: { in: ['LOST', 'ON_HOLD'] },
      mergedIntoId: null,
      NOT: { lostReason: { in: ['Duplicate enquiry', 'Machine already sold'] } },
      OR: [{ lastActivityAt: { lt: cutoff } }, { lastActivityAt: null, updatedAt: { lt: cutoff } }],
      AND: [{ OR: [{ lastReengagedAt: null }, { lastReengagedAt: { lt: cutoff } }] }],
    },
    take: 50,
    include: { customer: { select: { name: true, mobile: true, whatsappNumber: true, crmProfile: { select: { doNotContact: true } } } } },
  });
  for (const lead of leads) {
    if (lead.customer.crmProfile?.doNotContact) continue;
    const enquiry = lead.listingTitleSnapshot || leadTypeLabel(lead.leadType);
    await sendCrmMessage({
      event: 'CRM_REENGAGEMENT',
      recipientType: 'CUSTOMER',
      phone: lead.customer.whatsappNumber || lead.customer.mobile,
      entityId: lead.id,
      values: [lead.customer.name, enquiry],
      variables: { customerName: lead.customer.name, enquiry },
      dedupeSuffix: now.toISOString().slice(0, 10),
    });
    await prisma.$transaction((tx) => tx.lead.update({ where: { id: lead.id }, data: { lastReengagedAt: now } }).then(() =>
      logLeadActivity(tx, { leadId: lead.id, actorId: null, type: 'WHATSAPP', title: 'Re-engagement message sent', metadata: { automated: true } })));
  }
  return leads.length;
};

const rescoreOpen = async () => {
  const { terminal } = await listPipelineStageStatusSets();
  const leads = await prisma.lead.findMany({ where: { status: { notIn: [...terminal] }, mergedIntoId: null }, select: { id: true }, orderBy: { updatedAt: 'desc' }, take: 500 });
  for (const lead of leads) await rescoreLead(lead.id).catch(() => null);
  return leads.length;
};

const due = (state: Record<string, unknown>, key: string, everyMinutes: number, now: Date) => {
  const last = typeof state[key] === 'string' ? new Date(state[key] as string) : null;
  return !last || Number.isNaN(last.getTime()) || now.getTime() - last.getTime() >= everyMinutes * 60000;
};

/** One worker tick. Reminders/missed/SLA marking always run; the rest follow automation settings. */
export const runCrmAutomation = async (now = new Date()) => {
  const config = await getCrmConfig();
  const state = await readAutomationState();
  const summary: Record<string, number> = {};
  summary.reminders = await sendReminders(config, now);
  summary.missed = await markMissed(config, now);
  summary.slaBreaches = await checkSla(config, now);
  const auto = config.automation;
  if (auto.enabled && auto.customerReminders && due(state, 'customerRemindersAt', 15, now)) {
    summary.customerReminders = await customerReminders(now);
    state.customerRemindersAt = now.toISOString();
  }
  if (auto.enabled && auto.matchAlerts && due(state, 'matchAlertsAt', 30, now)) {
    const since = typeof state.matchAlertsAt === 'string' ? new Date(state.matchAlertsAt) : addDays(now, -1);
    summary.matchAlerts = await matchAlerts(since);
    state.matchAlertsAt = now.toISOString();
  }
  if (auto.enabled && auto.reengagement && due(state, 'reengagedAt', 24 * 60, now)) {
    summary.reengaged = await reengage(config, now);
    state.reengagedAt = now.toISOString();
  }
  if (auto.scoring && due(state, 'rescoredAt', 60, now)) {
    summary.rescored = await rescoreOpen();
    state.rescoredAt = now.toISOString();
  }
  state.lastRunAt = now.toISOString();
  state.lastRunSummary = summary;
  await writeAutomationState(state);
  return summary;
};
