import { Prisma } from '@prisma/client';
import prisma from '../lib/prisma';
import { logLeadActivity } from '../modules/crm/services/common';
import { enqueueSource } from '../modules/finance-hub/posting/worker';
import {
  assertDeleteRequest,
  finishImpact,
  group,
  type DeletionAlternative,
  type DeletionGroup,
  type DeletionImpact,
} from './deletionImpact';

// Permanent delete of a Sold Vehicle record (from Accounts → Sold Vehicles) or of an RTO record
// together with its Sold Vehicle (from RTO Work). Money stays on record: issued receipts, Bill of
// Supply, credit notes, refunds, seller payments and posted Finance Hub entries block the delete,
// and the sale is cancelled instead. When a delete goes ahead, the side effects of the sale are
// undone: a listing sold through it is taken off Sold and kept hidden (if the person chooses), won
// CRM leads are unlinked, and Finance Hub is re-synced so its draft entries for the sale disappear.

type Db = Prisma.TransactionClient | typeof prisma;
const anyDb = (db: Db) => db as any;

export type RecordDeletionViewer = { id: string };

const CANCEL_SALE: DeletionAlternative = {
  status: 'CANCEL_SALE',
  label: 'Cancel sale',
  description: 'Customer backed out or returned the vehicle. Receipts and bills stay on record, the listing is kept hidden (Unlisted) until relisted, and refunds are handled from the record.',
};

/** Uploaded files in the record's documents JSON (any nesting); each has a url or a Drive file id. */
const countDocuments = (value: unknown): number => {
  if (Array.isArray(value)) return value.reduce((total: number, item) => total + countDocuments(item), 0);
  if (!value || typeof value !== 'object') return 0;
  const record = value as Record<string, unknown>;
  if (typeof record.url === 'string' || typeof record.fileId === 'string' || typeof record.driveFileId === 'string') return 1;
  return Object.values(record).reduce((total: number, item) => total + countDocuments(item), 0);
};

const saleSelect = {
  id: true,
  recordNumber: true,
  isDraft: true,
  isLocked: true,
  cancelledAt: true,
  invoiceNumber: true,
  creditNoteNumber: true,
  listingId: true,
  listingTitle: true,
  vehicleNumber: true,
  purchaserName: true,
  documents: true,
  rtoRecord: { select: { id: true, isLocked: true } },
  payments: { select: { id: true, side: true, receiptStatus: true, listingPaymentId: true } },
  refunds: { select: { status: true } },
  _count: { select: { statusHistory: true, deedWorkflows: true } },
} as const;

const financeEntriesFor = (sellAccountId: string) => ({
  OR: [
    { sourceType: 'SELL_ACCOUNT', sourceId: sellAccountId },
    { sellAccountId },
    { lines: { some: { sellAccountId } } },
  ],
});

/** Groups describing what deleting this sale does. Queries run one after another so this also works inside a transaction. */
const saleGroups = async (db: Db, sale: any, options: { viaRto: boolean }) => {
  const d = anyDb(db);
  const draftVouchers = await d.finVoucher.count({ where: { ...financeEntriesFor(sale.id), status: 'DRAFT' } });
  const postedVouchers = await d.finVoucher.count({ where: { ...financeEntriesFor(sale.id), status: { in: ['PENDING_APPROVAL', 'POSTED'] }, reversalOfId: null } });
  const financeDocuments = await d.finDocument.count({ where: { sellAccountId: sale.id } });
  const wonLeads = await d.lead.count({ where: { wonSellAccountId: sale.id } });
  const listing = sale.listingId
    ? await d.listing.findUnique({ where: { id: sale.listingId }, select: { status: true } })
    : null;

  const purchaserReceipts = sale.payments.filter((item: any) => item.side === 'PURCHASER_RECEIPT');
  const draftReceipts = purchaserReceipts.filter((item: any) => item.receiptStatus === 'DRAFT').length;
  const cancelledReceipts = purchaserReceipts.filter((item: any) => item.receiptStatus === 'CANCELLED').length;
  const issuedReceipts = purchaserReceipts.filter((item: any) => item.receiptStatus === 'ISSUED').length;
  const sellerPayments = sale.payments.filter((item: any) => item.side === 'SELLER_PAYMENT' && item.receiptStatus !== 'CANCELLED').length;
  const openRefunds = sale.refunds.filter((item: any) => item.status !== 'REJECTED').length;
  const listingWasSold = String(listing?.status || '').toUpperCase() === 'SOLD';

  const groups: DeletionGroup[] = [
    group('draftReceipts', 'Draft and cancelled money receipts', draftReceipts + cancelledReceipts, 'DELETED'),
    group('documents', 'Uploaded document details on the record (KYC, deed, photos)', countDocuments(sale.documents), 'DELETED',
      options.viaRto ? 'The files themselves stay in storage.' : undefined),
    ...(options.viaRto ? [] : [group('documentFiles', 'Also remove the uploaded files from storage', countDocuments(sale.documents), 'OPTIONAL',
      'Left unticked, the files stay in storage but nothing in the app links to them.')]),
    group('history', 'Deal status history and deed steps', sale._count.statusHistory + sale._count.deedWorkflows, 'DELETED'),
    group('draftFinance', 'Draft entries in Finance Hub', draftVouchers, 'DELETED', 'Removed by the Finance Hub sync.'),
    listingWasSold
      ? group('listingToUnlisted', 'Take the listing off Sold and keep it hidden (Unlisted)', 1, 'OPTIONAL',
        'Its buyer details are removed and an admin relists it after checking. Left unticked, the listing stays Sold.', { defaultSelected: true })
      : group('listing', 'Link to the listing', sale.listingId && listing ? 1 : 0, 'UNLINKED', 'The listing itself is not changed.'),
    group('wonLeads', 'Won CRM deals', wonLeads, 'UNLINKED', 'They stay Won; the link to this record is cleared and noted on the timeline.'),
    group('locked', 'Locked record', sale.isLocked || sale.rtoRecord?.isLocked ? 1 : 0, 'BLOCKS', 'Locked records can only be viewed.'),
    ...(options.viaRto ? [] : [group('rto', 'Handed over to RTO Work', sale.rtoRecord ? 1 : 0, 'BLOCKS', 'Delete it from RTO Work, which removes both together.')]),
    group('bill', 'Bill of Supply or credit note', sale.invoiceNumber || sale.creditNoteNumber ? 1 : 0, 'BLOCKS'),
    group('issuedReceipts', 'Money receipts given to the customer', issuedReceipts, 'BLOCKS', 'Cancel the receipts whose money was never received, or cancel the sale.'),
    group('refunds', 'Refunds', openRefunds, 'BLOCKS'),
    group('sellerPayments', 'Payments made to the seller', sellerPayments, 'BLOCKS', 'Money paid out stays on record. Remove a payment entered by mistake first, or cancel the sale.'),
    group('postedFinance', 'Posted Finance Hub entries', postedVouchers, 'BLOCKS'),
    group('financeDocuments', 'Finance Hub bills and notes for this sale', financeDocuments, 'BLOCKS'),
  ];
  return { groups, listingWasSold };
};

const loadSale = (db: Db, id: string) => anyDb(db).sellAccount.findFirst({ where: { id, deletedAt: null }, select: saleSelect });

const saleAlternatives = (sale: any): DeletionAlternative[] => (sale && !sale.isDraft && !sale.cancelledAt ? [CANCEL_SALE] : []);

const buildSaleImpact = async (db: Db, id: string) => {
  const sale = await loadSale(db, id);
  if (!sale) return null;
  const { groups, listingWasSold } = await saleGroups(db, sale, { viaRto: false });
  const impact = finishImpact(
    {
      entityType: 'SOLD_VEHICLE',
      entityId: sale.id,
      name: sale.recordNumber,
      subtitle: [sale.vehicleNumber, sale.listingTitle, sale.purchaserName].filter(Boolean).join(' · '),
      currentStatus: sale.cancelledAt ? 'CANCELLED' : sale.isDraft ? 'DRAFT' : 'ACTIVE',
      viewerCanDelete: true,
      viewerDeleteNote: null,
      alternatives: saleAlternatives(sale),
    },
    groups,
  );
  return { sale, impact, listingWasSold };
};

const buildRtoImpact = async (db: Db, id: string) => {
  const d = anyDb(db);
  const rto = await d.vehicleRtoRecord.findUnique({
    where: { id },
    select: { id: true, vehicleNumber: true, customerName: true, isLocked: true, sellAccountId: true, _count: { select: { transferTasks: true, statusLogs: true } } },
  });
  if (!rto) return null;
  const sale = rto.sellAccountId ? await loadSale(db, rto.sellAccountId) : null;
  const saleImpact = sale ? await saleGroups(db, sale, { viaRto: true }) : null;
  const impact = finishImpact(
    {
      entityType: 'RTO_RECORD',
      entityId: rto.id,
      name: rto.vehicleNumber,
      subtitle: [rto.customerName, sale?.recordNumber].filter(Boolean).join(' · '),
      currentStatus: rto.isLocked ? 'LOCKED' : 'ACTIVE',
      viewerCanDelete: true,
      viewerDeleteNote: null,
      alternatives: saleAlternatives(sale),
    },
    [
      group('rtoWork', 'RTO work history and transfer tasks (with their documents)', rto._count.transferTasks + rto._count.statusLogs, 'DELETED'),
      group('soldVehicle', `Connected Sold Vehicle record${sale ? ` ${sale.recordNumber}` : ''}`, sale ? 1 : 0, 'DELETED'),
      group('rtoLocked', 'Locked RTO record', rto.isLocked ? 1 : 0, 'BLOCKS', 'Locked records can only be viewed.'),
      ...(saleImpact?.groups || []).map((item) => ({ ...item, key: `soldVehicle.${item.key}`, label: `Sold Vehicle: ${item.label}` })),
    ],
  );
  return { rto, sale, impact, listingWasSold: Boolean(saleImpact?.listingWasSold) };
};

export const getSellAccountDeletionImpact = async (id: string): Promise<DeletionImpact | null> => (await buildSaleImpact(prisma, id))?.impact || null;

export const getRtoRecordDeletionImpact = async (id: string): Promise<DeletionImpact | null> => (await buildRtoImpact(prisma, id))?.impact || null;

/** Undoes what the sale changed elsewhere, then deletes it (payments, refunds, history and deed steps cascade). */
const removeSaleInTx = async (tx: Prisma.TransactionClient, sale: any, unlistListing: boolean, actorId: string) => {
  // Unlisted, not Paused: a paused listing still shows on the website.
  if (sale.listingId && unlistListing) {
    await (tx as any).listing.update({
      where: { id: sale.listingId },
      data: {
        status: 'UNLISTED',
        soldAt: null,
        moderationReason: `Sold Vehicle record ${sale.recordNumber} was deleted. Check the listing before relisting it.`,
        moderatedAt: new Date(),
        moderatedById: actorId,
      },
    });
    await tx.saleRecord.deleteMany({ where: { listingId: sale.listingId } });
  }
  const leads = await tx.lead.findMany({ where: { wonSellAccountId: sale.id }, select: { id: true } });
  for (const lead of leads) {
    await tx.lead.update({ where: { id: lead.id }, data: { wonSellAccountId: null } });
    await logLeadActivity(tx as any, {
      leadId: lead.id,
      actorId,
      type: 'UPDATED',
      title: `Sold Vehicle record ${sale.recordNumber} deleted`,
      content: 'The sale record was deleted from Accounts. Create a new Sold Vehicle record if the deal goes ahead.',
      metadata: { deletedSellAccountId: sale.id, recordNumber: sale.recordNumber },
    });
  }
  await tx.sellAccount.delete({ where: { id: sale.id } });
};

const resyncFinance = async (sale: any) => {
  const sources: Array<['SELL_ACCOUNT' | 'LISTING_PAYMENT', string]> = [
    ['SELL_ACCOUNT', sale.id],
    ...sale.payments.filter((item: any) => item.listingPaymentId).map((item: any) => ['LISTING_PAYMENT', item.listingPaymentId] as ['LISTING_PAYMENT', string]),
  ];
  // A failed enqueue only delays the cleanup; the regular sweep is not able to find a deleted row,
  // so the failure is logged for a manual "resync" from Finance Hub.
  await Promise.all(sources.map(([type, sourceId]) => enqueueSource(type, sourceId, 'SALE_DELETED').catch((error) => {
    console.error('Finance Hub resync could not be queued after a Sold Vehicle delete:', type, sourceId, error);
  })));
};

const writeAudit = (
  tx: Prisma.TransactionClient,
  entityType: string,
  entityId: string,
  actorId: string,
  reason: string,
  impact: DeletionImpact,
  include: Set<string>,
  extra: Record<string, unknown>,
) =>
  anyDb(tx).finAuditLog.create({
    data: {
      actorUserId: actorId,
      entityType,
      entityId,
      action: 'PERMANENTLY_DELETED',
      reason,
      beforeJson: {
        ...extra,
        removed: Object.fromEntries(impact.groups.map((item) => [item.key, { count: item.count, action: item.action, ...(item.action === 'OPTIONAL' ? { chosen: include.has(item.key) } : {}) }])),
      },
    },
  });

const runDelete = async <T>(work: (tx: Prisma.TransactionClient) => Promise<T>) =>
  prisma.$transaction(work, { maxWait: 10_000, timeout: 60_000 });

export const deleteSellAccountPermanently = async (id: string, viewer: RecordDeletionViewer, request: { include?: unknown; confirmation?: unknown; reason?: unknown }) => {
  const result = await runDelete(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "SellAccount" WHERE id = ${id} FOR UPDATE`;
    const built = await buildSaleImpact(tx, id);
    if (!built) return null;
    const { sale, impact, listingWasSold } = built;
    const { reason, include } = assertDeleteRequest(impact, request, { requireReason: true });
    await removeSaleInTx(tx, sale, listingWasSold && include.has('listingToUnlisted'), viewer.id);
    await writeAudit(tx, 'SOLD_VEHICLE', sale.id, viewer.id, reason, impact, include, {
      recordNumber: sale.recordNumber,
      vehicleNumber: sale.vehicleNumber,
      listingId: sale.listingId,
      purchaserName: sale.purchaserName,
    });
    return sale;
  });
  if (!result) return null;
  await resyncFinance(result);
  return true;
};

export const deleteRtoRecordPermanently = async (id: string, viewer: RecordDeletionViewer, request: { include?: unknown; confirmation?: unknown; reason?: unknown }) => {
  const result = await runDelete(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "VehicleRtoRecord" WHERE id = ${id} FOR UPDATE`;
    const built = await buildRtoImpact(tx, id);
    if (!built) return null;
    const { rto, sale, impact, listingWasSold } = built;
    const { reason, include } = assertDeleteRequest(impact, request, { requireReason: true });
    await tx.vehicleRtoRecord.delete({ where: { id: rto.id } });
    if (sale) await removeSaleInTx(tx, sale, listingWasSold && include.has('soldVehicle.listingToUnlisted'), viewer.id);
    await writeAudit(tx, 'RTO_RECORD', rto.id, viewer.id, reason, impact, include, {
      vehicleNumber: rto.vehicleNumber,
      customerName: rto.customerName,
      sellAccountId: sale?.id || null,
      recordNumber: sale?.recordNumber || null,
    });
    return { sale, pair: Boolean(sale) };
  });
  if (!result) return null;
  if (result.sale) await resyncFinance(result.sale);
  return result.pair ? 'pair' : 'rto';
};

