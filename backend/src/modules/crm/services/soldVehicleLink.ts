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
