import { FinDealMode, Prisma } from '@prisma/client';
import prisma from '../../../lib/prisma';
import { badRequest, notFound } from '../http';
import { enqueueSource } from '../posting/worker';
import { readEnum, readMoney, readMultiline, readString } from '../utils/input';
import { writeFinAudit } from './audit.service';
import type { ActorContext } from './context';

// Brokerage, consignment and partner-share terms of a Sold Vehicle. Saving them re-queues the
// vehicle so automatic posting reconciles its vouchers.

const ZERO = new Prisma.Decimal(0);
const num = (value: Prisma.Decimal | null | undefined) => (value === null || value === undefined ? null : value.toNumber());

const serialize = (ext: Prisma.FinVehicleDealExtGetPayload<object> | null, sellAccountId: string) => ({
  sellAccountId,
  dealMode: ext?.dealMode ?? 'OUTRIGHT',
  consignorPartyId: ext?.consignorPartyId ?? null,
  consignmentCommission: num(ext?.consignmentCommission),
  brokerPartyId: ext?.brokerPartyId ?? null,
  brokeragePayable: ext?.brokeragePayable.toNumber() ?? 0,
  brokerageReceivable: ext?.brokerageReceivable.toNumber() ?? 0,
  brokerageReceivablePartyId: ext?.brokerageReceivablePartyId ?? null,
  partnerPartyId: ext?.partnerPartyId ?? null,
  partnerShareAmount: ext?.partnerShareAmount.toNumber() ?? 0,
  notes: ext?.notes ?? null,
  saved: Boolean(ext),
});

export const getDealTerms = async (sellAccountId: string) => {
  const deal = await prisma.sellAccount.findUnique({ where: { id: sellAccountId }, select: { id: true } });
  if (!deal) throw notFound('Sold Vehicle record not found.');
  return serialize(await prisma.finVehicleDealExt.findUnique({ where: { sellAccountId } }), sellAccountId);
};

export const saveDealTerms = async (sellAccountId: string, body: Record<string, unknown>, context: ActorContext) => {
  const data = {
    dealMode: readEnum(body, 'dealMode', 'Deal type', Object.values(FinDealMode), 'OUTRIGHT'),
    consignorPartyId: readString(body, 'consignorPartyId', 'Consignor', { max: 60 }),
    consignmentCommission: readMoney(body, 'consignmentCommission', 'Consignment commission'),
    brokerPartyId: readString(body, 'brokerPartyId', 'Broker', { max: 60 }),
    brokeragePayable: readMoney(body, 'brokeragePayable', 'Brokerage payable') ?? ZERO,
    brokerageReceivable: readMoney(body, 'brokerageReceivable', 'Brokerage receivable') ?? ZERO,
    brokerageReceivablePartyId: readString(body, 'brokerageReceivablePartyId', 'Brokerage paid by', { max: 60 }),
    partnerPartyId: readString(body, 'partnerPartyId', 'Partner', { max: 60 }),
    partnerShareAmount: readMoney(body, 'partnerShareAmount', 'Partner share') ?? ZERO,
    notes: readMultiline(body, 'notes', 'Notes', 1000),
  };
  if (data.brokeragePayable.greaterThan(0) && !data.brokerPartyId) throw badRequest('Choose the broker for the brokerage payable.');
  if (data.partnerShareAmount.greaterThan(0) && !data.partnerPartyId) throw badRequest('Choose the partner for the profit share.');
  if (data.dealMode !== 'CONSIGNMENT') {
    data.consignorPartyId = null;
    data.consignmentCommission = null;
  }

  const saved = await prisma.$transaction(async (tx) => {
    const deal = await tx.sellAccount.findUnique({ where: { id: sellAccountId }, select: { id: true, sellAmount: true, deletedAt: true } });
    if (!deal || deal.deletedAt) throw notFound('Sold Vehicle record not found.');
    if (data.consignmentCommission && data.consignmentCommission.greaterThan(deal.sellAmount) && deal.sellAmount.greaterThan(0)) {
      throw badRequest('Consignment commission is more than the sale price.');
    }
    const partyIds = [data.consignorPartyId, data.brokerPartyId, data.brokerageReceivablePartyId, data.partnerPartyId].filter((id): id is string => Boolean(id));
    const found = await tx.finParty.findMany({ where: { id: { in: partyIds }, isActive: true }, select: { id: true } });
    if (found.length !== new Set(partyIds).size) throw badRequest('One of the chosen parties was not found or is inactive.');
    const before = await tx.finVehicleDealExt.findUnique({ where: { sellAccountId } });
    const ext = await tx.finVehicleDealExt.upsert({
      where: { sellAccountId },
      create: { sellAccountId, ...data, updatedById: context.actorUserId },
      update: { ...data, updatedById: context.actorUserId },
    });
    await writeFinAudit({ ...context, entityType: 'FinVehicleDealExt', entityId: sellAccountId, action: before ? 'UPDATE' : 'CREATE', before, after: ext }, tx);
    return ext;
  });
  await enqueueSource('SELL_ACCOUNT', sellAccountId, 'DEAL_TERMS_CHANGED').catch(() => false);
  return serialize(saved, sellAccountId);
};

/** Vehicles with deal terms, for the consignment and brokerage screens. */
export const listDealTerms = async (query: Record<string, unknown>) => {
  const mode = query.mode === 'CONSIGNMENT' ? 'CONSIGNMENT' : null;
  const brokerage = query.brokerage === 'true';
  const rows = await prisma.finVehicleDealExt.findMany({
    where: {
      ...(mode ? { dealMode: mode } : {}),
      ...(brokerage ? { OR: [{ brokeragePayable: { gt: 0 } }, { brokerageReceivable: { gt: 0 } }] } : {}),
    },
    orderBy: { updatedAt: 'desc' },
    take: 1000,
  });
  const dealIds = rows.map((row) => row.sellAccountId);
  const partyIds = Array.from(new Set(rows.flatMap((row) => [row.consignorPartyId, row.brokerPartyId, row.brokerageReceivablePartyId, row.partnerPartyId]).filter((id): id is string => Boolean(id))));
  const [deals, parties] = await Promise.all([
    prisma.sellAccount.findMany({ where: { id: { in: dealIds } }, select: { id: true, recordNumber: true, vehicleNumber: true, listingTitle: true, brandName: true, vehicleModel: true, sellerName: true, purchaserName: true, purchaseAmount: true, sellAmount: true, dealStatus: true, deletedAt: true } }),
    prisma.finParty.findMany({ where: { id: { in: partyIds } }, select: { id: true, code: true, name: true } }),
  ]);
  const partyName = (id: string | null) => (id ? parties.find((party) => party.id === id)?.name ?? null : null);
  return rows.flatMap((row) => {
    const deal = deals.find((item) => item.id === row.sellAccountId);
    if (!deal || deal.deletedAt) return [];
    const sale = deal.sellAmount.toNumber();
    const commission = row.consignmentCommission ? row.consignmentCommission.toNumber() : Math.max(sale - deal.purchaseAmount.toNumber(), 0);
    return [{
      ...serialize(row, row.sellAccountId),
      vehicle: [deal.recordNumber, deal.vehicleNumber, deal.listingTitle || [deal.brandName, deal.vehicleModel].filter(Boolean).join(' ')].filter(Boolean).join(' · '),
      sellerName: deal.sellerName,
      purchaserName: deal.purchaserName,
      sale,
      purchase: deal.purchaseAmount.toNumber(),
      dealStatus: deal.dealStatus,
      consignorName: partyName(row.consignorPartyId) ?? deal.sellerName,
      brokerName: partyName(row.brokerPartyId),
      brokerageReceivableFrom: partyName(row.brokerageReceivablePartyId) ?? deal.purchaserName,
      partnerName: partyName(row.partnerPartyId),
      commission: row.dealMode === 'CONSIGNMENT' ? commission : null,
      payableToConsignor: row.dealMode === 'CONSIGNMENT' ? Math.max(sale - commission, 0) : null,
    }];
  });
};
