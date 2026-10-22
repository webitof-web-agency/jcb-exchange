import prisma from '../../../lib/prisma';
import { scoreLead } from '../rules';
import type { Db } from './common';

const DAY = 24 * 60 * 60 * 1000;

/** Recomputes Lead.score / temperature from live signals (Prime, repeat enquiries, site activity). */
export const rescoreLead = async (leadId: string, db: Db = prisma) => {
  const lead = await db.lead.findUnique({
    where: { id: leadId },
    select: {
      id: true, customerId: true, status: true, priority: true, source: true, budgetMax: true, budgetMin: true,
      categoryId: true, brandId: true, modelId: true, lastActivityAt: true, createdAt: true,
    },
  });
  if (!lead) return null;
  const since = new Date(Date.now() - 30 * DAY);
  const [prime, repeat, views, clicks] = await Promise.all([
    db.customerPrimeSubscription.count({ where: { userId: lead.customerId, status: 'ACTIVE' } }),
    db.leadActivity.count({ where: { leadId: lead.id, title: 'Repeat Enquiry' } }),
    db.analyticsEvent.count({ where: { actorUserId: lead.customerId, eventType: 'LISTING_VIEW', occurredAt: { gte: since } } }),
    db.analyticsEvent.count({ where: { actorUserId: lead.customerId, eventType: 'CONTACT_CLICK', occurredAt: { gte: since } } }),
  ]);
  const last = lead.lastActivityAt ?? lead.createdAt;
  const result = scoreLead({
    priority: lead.priority,
    isPrime: prime > 0,
    repeatEnquiries: repeat,
    listingViews30d: views,
    contactClicks30d: clicks,
    hasBudget: Boolean(lead.budgetMax || lead.budgetMin),
    hasRequirement: Boolean(lead.categoryId || lead.brandId || lead.modelId),
    source: lead.source,
    daysSinceLastActivity: Math.floor((Date.now() - last.getTime()) / DAY),
    status: lead.status,
  });
  await db.lead.update({ where: { id: lead.id }, data: { score: result.score, temperature: result.temperature } });
  return result;
};
