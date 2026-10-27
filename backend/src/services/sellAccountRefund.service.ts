import { Prisma, SellAccountPaymentMethod, SellAccountRefundReason, SellAccountRefundStatus } from '@prisma/client';
import prisma from '../lib/prisma';
import { getSellAccount } from './sellAccount.service';
import { paymentSummaryForSellAccount } from './sellAccountFinance';
import { nextSellAccountRefundNumberFor } from './vehicleSaleInvoice.service';

// Refunds to the purchaser of a Sold Vehicle, maker-checker: one user requests, another approves,
// then the payment is recorded. Only a PAID refund changes the customer balance and the books.

export type RefundActor = { id?: string | undefined; role?: string | undefined };

const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '');
const money = (value: unknown, label: string) => {
  if (value === undefined || value === null || value === '') return 0;
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) throw new Error(`${label} must be zero or more.`);
  return Math.round(amount * 100) / 100;
};
const validEnum = <T extends string>(value: unknown, allowed: readonly T[]) =>
  allowed.includes(String(value) as T) ? String(value) as T : null;
const formatInr = (value: number) => `Rs. ${value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Locks the deal row so two refund actions on one deal never run at the same time. */
const lockDeal = async (tx: Prisma.TransactionClient, sellAccountId: string) => {
  await tx.$queryRaw`SELECT id FROM "SellAccount" WHERE id = ${sellAccountId} FOR UPDATE`;
  return tx.sellAccount.findUnique({ where: { id: sellAccountId }, include: { payments: true, refunds: true } });
};

type DealWithMoney = NonNullable<Awaited<ReturnType<typeof lockDeal>>>;

/** What can still be refunded, leaving `excludeRefundId` out of the open requests. */
const refundableFor = (deal: DealWithMoney, excludeRefundId?: string) =>
  paymentSummaryForSellAccount(deal, deal.payments, deal.refunds.filter((refund) => refund.id !== excludeRefundId)).purchaserRefundable;

const assertWithinRefundable = (deal: DealWithMoney, total: number, excludeRefundId?: string) => {
  const refundable = refundableFor(deal, excludeRefundId);
  if (total > refundable + 0.005) {
    throw new Error(deal.cancelledAt
      ? `Only ${formatInr(refundable)} received from the customer is left to refund.`
      : `Only ${formatInr(refundable)} can be refunded: that is what the customer paid above the sale amount (real receipts only). Cancel the sale to refund everything.`);
  }
};

export const requestSellAccountRefund = async (sellAccountId: string, body: any, actorId?: string) => {
  const reason = validEnum(body?.reason, Object.values(SellAccountRefundReason));
  if (!reason) throw new Error('Choose the refund reason.');
  const amount = money(body?.amount, 'Refund amount');
  const forfeitAmount = money(body?.forfeitAmount, 'Cancellation charge');
  if (amount + forfeitAmount <= 0) throw new Error('Enter the amount to refund.');
  const method = validEnum(body?.method, Object.values(SellAccountPaymentMethod)) ?? SellAccountPaymentMethod.BANK_TRANSFER;

  const created = await prisma.$transaction(async (tx) => {
    const deal = await lockDeal(tx, sellAccountId);
    if (!deal || deal.deletedAt) return false;
    if (deal.isDraft) throw new Error('Save the Sold Vehicle record first.');
    if (forfeitAmount > 0 && !deal.cancelledAt) throw new Error('A cancellation charge can only be kept when the sale is cancelled.');
    if ((reason === 'DEAL_CANCELLED' || reason === 'VEHICLE_RETURN') && !deal.cancelledAt) {
      throw new Error('Cancel the sale first; then the money received can be refunded.');
    }
    assertWithinRefundable(deal, amount + forfeitAmount);
    await tx.sellAccountRefund.create({
      data: {
        sellAccountId,
        reason,
        amount: new Prisma.Decimal(amount),
        forfeitAmount: new Prisma.Decimal(forfeitAmount),
        method,
        note: text(body?.note).slice(0, 1000) || null,
        requestedById: actorId || null,
      },
    });
    return true;
  });
  return created ? getSellAccount(sellAccountId) : null;
};

const loadRefund = async (tx: Prisma.TransactionClient, sellAccountId: string, refundId: string) => {
  const deal = await lockDeal(tx, sellAccountId);
  if (!deal || deal.deletedAt) return null;
  const refund = deal.refunds.find((item) => item.id === refundId);
  return refund ? { deal, refund } : null;
};

export const approveSellAccountRefund = async (sellAccountId: string, refundId: string, actor: RefundActor) => {
  const done = await prisma.$transaction(async (tx) => {
    const found = await loadRefund(tx, sellAccountId, refundId);
    if (!found) return false;
    const { deal, refund } = found;
    if (refund.status !== SellAccountRefundStatus.REQUESTED) throw new Error('Only a requested refund can be approved.');
    // Maker-checker: the requester cannot approve their own refund (a super admin can).
    if (refund.requestedById && refund.requestedById === actor.id && actor.role !== 'SUPER_ADMIN') {
      throw new Error('A different user must approve this refund.');
    }
    assertWithinRefundable(deal, Number(refund.amount) + Number(refund.forfeitAmount), refund.id);
    await tx.sellAccountRefund.update({
      where: { id: refund.id },
      data: { status: SellAccountRefundStatus.APPROVED, approvedById: actor.id || null, approvedAt: new Date() },
    });
    return true;
  });
  return done ? getSellAccount(sellAccountId) : null;
};

export const rejectSellAccountRefund = async (sellAccountId: string, refundId: string, body: any, actorId?: string) => {
  const reason = text(body?.reason);
  if (reason.length < 3) throw new Error('Enter why the refund is rejected.');
  const done = await prisma.$transaction(async (tx) => {
    const found = await loadRefund(tx, sellAccountId, refundId);
    if (!found) return false;
    if (found.refund.status !== SellAccountRefundStatus.REQUESTED && found.refund.status !== SellAccountRefundStatus.APPROVED) {
      throw new Error('Only a requested or approved refund can be rejected.');
    }
    await tx.sellAccountRefund.update({
      where: { id: refundId },
      data: { status: SellAccountRefundStatus.REJECTED, rejectedById: actorId || null, rejectedAt: new Date(), rejectReason: reason.slice(0, 1000) },
    });
    return true;
  });
  return done ? getSellAccount(sellAccountId) : null;
};

/** Records the refund payment: assigns the refund advice number and posts to the books. */
export const paySellAccountRefund = async (sellAccountId: string, refundId: string, body: any, actorId?: string) => {
  const refundDate = body?.refundDate ? new Date(String(body.refundDate)) : new Date();
  if (Number.isNaN(refundDate.getTime())) throw new Error('Enter a valid refund date.');
  if (refundDate.getTime() > Date.now() + 24 * 60 * 60 * 1000) throw new Error('The refund date cannot be in the future.');
  const done = await prisma.$transaction(async (tx) => {
    const found = await loadRefund(tx, sellAccountId, refundId);
    if (!found) return false;
    const { deal, refund } = found;
    if (refund.status !== SellAccountRefundStatus.APPROVED) throw new Error('Approve the refund before recording its payment.');
    assertWithinRefundable(deal, Number(refund.amount) + Number(refund.forfeitAmount), refund.id);
    const method = validEnum(body?.method, Object.values(SellAccountPaymentMethod)) ?? refund.method;
    const reference = text(body?.reference).slice(0, 120);
    if (Number(refund.amount) > 0 && method !== SellAccountPaymentMethod.CASH && !reference) {
      throw new Error('Enter the transaction / cheque number of the refund.');
    }
    const refundNumber = refund.refundNumber || await nextSellAccountRefundNumberFor(tx, refundDate, deal.purchaserCity);
    await tx.sellAccountRefund.update({
      where: { id: refund.id },
      data: {
        status: SellAccountRefundStatus.PAID,
        refundNumber,
        refundDate,
        method,
        reference: reference || null,
        drawnOn: text(body?.drawnOn).slice(0, 120) || null,
        paidById: actorId || null,
        paidAt: new Date(),
      },
    });
    // Bumps updatedAt so the Finance Hub posting sweep picks the refund up.
    await tx.sellAccount.update({ where: { id: sellAccountId }, data: { updatedById: actorId || null } });
    return true;
  });
  return done ? getSellAccount(sellAccountId) : null;
};
