import { logLeadActivity, type Db } from './common';

/**
 * Links a newly created Sold Vehicle record to the CRM deal it came from: the lead named by
 * crmLeadId, or else WON leads on the same listing. Leads already linked are left alone.
 */
export const linkSoldVehicleToWonLeads = async (
  db: Db,
  record: { id: string; recordNumber: string; listingId: string | null },
  crmLeadId: unknown,
  actorId?: string,
) => {
  const leadId = typeof crmLeadId === 'string' && crmLeadId.trim() ? crmLeadId.trim().slice(0, 60) : null;
  if (!leadId && !record.listingId) return;
  const leads = await db.lead.findMany({
    where: {
      status: 'WON',
      wonSellAccountId: null,
      mergedIntoId: null,
      ...(leadId ? { id: leadId } : { listingId: record.listingId }),
    },
    select: { id: true },
  });
  for (const lead of leads) {
    await db.lead.update({ where: { id: lead.id }, data: { wonSellAccountId: record.id } });
    await logLeadActivity(db, {
      leadId: lead.id,
      actorId: actorId || null,
      type: 'UPDATED',
      title: `Sold Vehicle record ${record.recordNumber} created`,
      content: 'Agreement, payment receipts and RTO handover continue in Accounts → Sold Vehicles.',
      metadata: { wonSellAccountId: record.id, recordNumber: record.recordNumber },
    });
  }
};

const MACHINE_SOLD_TAG = 'Machine Sold';

/**
 * A Sold Vehicle sale was cancelled. Leads won on it become LOST ("Sale cancelled"), and other
 * open leads that were told the machine is sold hear that it is free again.
 */
export const releaseCancelledSaleLeads = async (
  db: Db,
  sale: { id: string; recordNumber: string; listingId: string | null; listingTitle: string | null; reason: string },
  actorId?: string,
) => {
  const now = new Date();
  const won = await db.lead.findMany({ where: { wonSellAccountId: sale.id, status: 'WON', mergedIntoId: null }, select: { id: true, tags: true } });
  for (const lead of won) {
    await db.lead.update({
      where: { id: lead.id },
      data: { status: 'LOST', lostReason: 'Sale cancelled', closedAt: now, tags: Array.from(new Set([...(lead.tags || []), 'Sale Cancelled'])) },
    });
    await logLeadActivity(db, {
      leadId: lead.id,
      actorId: actorId || null,
      type: 'STATUS_CHANGE',
      title: `Sale cancelled - ${sale.recordNumber}`,
      content: `Sold Vehicle ${sale.recordNumber} was cancelled. Reason: ${sale.reason}`,
      metadata: { from: 'WON', to: 'LOST', wonSellAccountId: sale.id, saleCancelled: true },
    });
  }
  if (!sale.listingId) return { lostLeads: won.length, reopenedLeads: 0 };
  const waiting = await db.lead.findMany({
    where: { listingId: sale.listingId, tags: { has: MACHINE_SOLD_TAG }, status: { notIn: ['WON', 'LOST'] }, mergedIntoId: null },
    select: { id: true, tags: true },
  });
  for (const lead of waiting) {
    await db.lead.update({ where: { id: lead.id }, data: { tags: (lead.tags || []).filter((tag) => tag !== MACHINE_SOLD_TAG) } });
    await logLeadActivity(db, {
      leadId: lead.id,
      actorId: actorId || null,
      type: 'UPDATED',
      title: `Enquired machine is available again${sale.listingTitle ? ` (${sale.listingTitle})` : ''}`,
      content: 'Its sale was cancelled; the listing is paused until an admin publishes it again.',
      metadata: { releasedListingId: sale.listingId, cancelledSellAccountId: sale.id },
    });
  }
  return { lostLeads: won.length, reopenedLeads: waiting.length };
};
