import { SellAccountDealStatus } from '@prisma/client';
import prisma from '../lib/prisma';
import { normalizeRtoWorkStatus } from './rtoStatus';
import { assertRemark, summarizeTransferTasks } from './rtoTransferTasks';
import { recordRtoStatusChange } from './rtoTransferStore';
import { getSellAccount, paymentSummaryForRecord } from './sellAccount.service';
import { dispatchConfiguredSms } from './smsIntegration.service';
import { issueInvoiceToken, nextVehicleSaleInvoiceNumberFor, vehicleTitleOf } from './vehicleSaleInvoice.service';
import { dispatchConfiguredWhatsApp } from './whatsappIntegration.service';

export class VehicleSaleCompletionError extends Error {
  constructor(message: string, readonly statusCode = 400) {
    super(message);
    this.name = 'VehicleSaleCompletionError';
  }
}

export const buildPublicInvoiceUrl = (publicApiBaseUrl: string, token: string) =>
  `${publicApiBaseUrl.replace(/\/+$/, '')}/api/public/sale-invoices/${token}`;

const formatInr = (value: number) => `Rs. ${Math.round(value).toLocaleString('en-IN')}`;

type ChannelResult = { channel: 'WHATSAPP' | 'SMS'; sent: boolean; status: string; detail?: string | null };

const describeDispatch = (channel: ChannelResult['channel'], result: any): ChannelResult => {
  if (result?.queued && result?.sent) return { channel, sent: true, status: 'SENT' };
  if (result?.queued) return { channel, sent: false, status: 'FAILED', detail: result?.error || null };
  if (result?.duplicate) return { channel, sent: false, status: 'DUPLICATE' };
  return { channel, sent: false, status: String(result?.reason || 'NOT_SENT') };
};

/**
 * Sends the invoice to the end customer (the vehicle purchaser) over WhatsApp (with the PDF
 * attached) and SMS (with the public view link). Messaging failures never undo the sale.
 */
export const deliverVehicleSaleInvoice = async (
  sellAccountId: string,
  token: string,
  publicApiBaseUrl: string,
  dedupeSuffix?: string,
) => {
  const record = await prisma.sellAccount.findUnique({ where: { id: sellAccountId } });
  if (!record?.invoiceNumber) throw new VehicleSaleCompletionError('Invoice has not been generated yet.');

  const invoiceUrl = buildPublicInvoiceUrl(publicApiBaseUrl, token);
  const vehicleTitle = vehicleTitleOf(record);
  const customerName = record.purchaserName?.trim() || 'Customer';
  const amount = formatInr(Number(record.sellAmount));
  const payloadSnapshot = {
    customerName,
    vehicleTitle,
    registrationNumber: record.vehicleNumber || '',
    invoiceNumber: record.invoiceNumber,
    invoiceAmount: amount,
    invoiceUrl,
  };

  const [whatsapp, sms] = await Promise.all([
    dispatchConfiguredWhatsApp({
      eventCode: 'VEHICLE_SALE_INVOICE',
      relatedEntityType: 'SELL_ACCOUNT',
      relatedEntityId: record.id,
      recipientType: 'CUSTOMER',
      recipientPhone: record.purchaserNumber,
      // Body variables {{1}}..{{6}} of the approved "vehicle sale invoice" template.
      templateComponents: [{
        type: 'body',
        parameters: [
          { type: 'text', text: customerName },
          { type: 'text', text: vehicleTitle },
          { type: 'text', text: record.vehicleNumber || '-' },
          { type: 'text', text: record.invoiceNumber },
          { type: 'text', text: amount },
          { type: 'text', text: invoiceUrl },
        ],
      }],
      payloadSnapshot,
      dedupeSuffix,
    }),
    dispatchConfiguredSms({
      eventCode: 'VEHICLE_SALE_INVOICE',
      relatedEntityType: 'SELL_ACCOUNT',
      relatedEntityId: record.id,
      recipientType: 'CUSTOMER',
      recipientPhone: record.purchaserNumber,
      payloadSnapshot,
      dedupeSuffix,
    }),
  ]);

  const channels = [describeDispatch('WHATSAPP', whatsapp), describeDispatch('SMS', sms)];
  const attemptedAt = new Date();
  const anySent = channels.some((channel) => channel.sent);
  await prisma.sellAccount.update({
    where: { id: record.id },
    data: {
      invoiceDelivery: { attemptedAt: attemptedAt.toISOString(), channels } as any,
      ...(anySent ? { invoiceSentAt: attemptedAt } : {}),
    },
  });
  return { invoiceUrl, channels, anySent };
};

/** Issues the final Bill of Supply as soon as the customer balance reaches zero.
 * RTO completion and record locking remain a separate workflow step. */
export const issueAndDeliverVehicleSaleInvoiceAfterFullPayment = async (
  sellAccountId: string,
  publicApiBaseUrl: string,
) => {
  const issued = issueInvoiceToken();
  const prepared = await prisma.$transaction(async (tx) => {
    const current = await tx.sellAccount.findUnique({ where: { id: sellAccountId }, include: { payments: true, refunds: true } });
    if (!current || current.deletedAt || current.cancelledAt) return null;
    const payments = paymentSummaryForRecord(current, current.payments);
    if (payments.purchaserPaymentStatus !== 'FULL') return null;
    if (current.invoiceNumber && current.invoiceTokenHash) return { id: current.id, alreadyIssued: true };
    const now = new Date();
    const invoiceNumber = current.invoiceNumber || await nextVehicleSaleInvoiceNumberFor(tx, now);
    await tx.sellAccount.update({
      where: { id: current.id },
      data: {
        invoiceNumber,
        invoiceGeneratedAt: current.invoiceGeneratedAt || now,
        invoiceTokenHash: issued.tokenHash,
        invoiceTokenExpiresAt: issued.expiresAt,
      },
    });
    return { id: current.id, alreadyIssued: false };
  });
  if (!prepared) return null;
  if (prepared.alreadyIssued) return { delivery: null, alreadyIssued: true };
  return { delivery: await deliverVehicleSaleInvoice(prepared.id, issued.token, publicApiBaseUrl), alreadyIssued: false };
};

/**
 * Final step of a vehicle sale: every transfer task is done and the customer has paid in full.
 * Marks the deal done, issues the invoice, locks both records and notifies the customer.
 */
export const completeVehicleSale = async (
  id: string,
  body: { remark?: unknown },
  actorId: string | undefined,
  publicApiBaseUrl: string,
) => {
  const remark = assertRemark(body.remark, 'completing the sale');
  const completedId = await prisma.$transaction(async (tx) => {
    const current = await tx.sellAccount.findFirst({
      where: { OR: [{ id }, { recordNumber: id }], deletedAt: null },
      include: { payments: true, refunds: true, rtoRecord: { include: { transferTasks: true } } },
    });
    if (!current) return null;
    if (current.isLocked) throw new VehicleSaleCompletionError('This sale is already completed and locked.', 423);
    if (current.cancelledAt) throw new VehicleSaleCompletionError('This sale is cancelled.');
    if (current.isDraft) throw new VehicleSaleCompletionError('Save the Sold Vehicle record before completing the sale.');
    const rto = current.rtoRecord;
    if (!rto) throw new VehicleSaleCompletionError('Start RTO work before completing the sale.');
    if (rto.isLocked) throw new VehicleSaleCompletionError('The RTO record is already locked.', 423);

    const tasks = summarizeTransferTasks(rto.transferTasks);
    if (!tasks.total) throw new VehicleSaleCompletionError('Create the ownership transfer checklist before completing the sale.');
    if (!tasks.allDone) throw new VehicleSaleCompletionError(`Transfer is not complete yet. Pending: ${tasks.pendingLabels.join(', ')}.`);
    const payments = paymentSummaryForRecord(current, current.payments);
    if (payments.purchaserPaymentStatus !== 'FULL') {
      throw new VehicleSaleCompletionError(`Customer payment is not complete. Balance: ${formatInr(payments.purchaserBalance)}.`);
    }

    const now = new Date();
    const issued = current.invoiceNumber && current.invoiceTokenHash ? null : issueInvoiceToken();
    const invoiceNumber = current.invoiceNumber || await nextVehicleSaleInvoiceNumberFor(tx, now);
    const previousRtoStatus = normalizeRtoWorkStatus(rto.rtoStatus);

    await tx.vehicleRtoRecord.update({
      where: { id: rto.id },
      data: { rtoStatus: 'DEAL_DONE', isLocked: true, lockedAt: now, lockedById: actorId || null },
    });
    await recordRtoStatusChange(tx, { rtoRecordId: rto.id, oldStatus: previousRtoStatus, newStatus: 'DEAL_DONE', remark, actorId });
    await tx.sellAccount.update({
      where: { id: current.id },
      data: {
        dealStatus: SellAccountDealStatus.DEAL_DONE,
        rtoStatusSnapshot: 'DEAL_DONE',
        completedAt: now,
        invoiceNumber,
        invoiceGeneratedAt: current.invoiceGeneratedAt || now,
        ...(issued ? { invoiceTokenHash: issued.tokenHash, invoiceTokenExpiresAt: issued.expiresAt } : {}),
        isLocked: true,
        lockedAt: now,
        lockedById: actorId || null,
        updatedById: actorId || null,
      },
    });
    if (current.dealStatus !== SellAccountDealStatus.DEAL_DONE) {
      await tx.sellAccountStatusHistory.create({
        data: { sellAccountId: current.id, oldStatus: current.dealStatus, newStatus: SellAccountDealStatus.DEAL_DONE, reason: remark, changedById: actorId || null },
      });
    }
    return { id: current.id, token: issued?.token || null };
  });

  if (!completedId) return null;
  const delivery = completedId.token
    ? await deliverVehicleSaleInvoice(completedId.id, completedId.token, publicApiBaseUrl)
    : null;
  return { record: await getSellAccount(completedId.id), delivery };
};

/** Issues a fresh public link (the old one stops working) and sends the invoice again. */
export const resendVehicleSaleInvoice = async (id: string, publicApiBaseUrl: string) => {
  const record = await prisma.sellAccount.findFirst({ where: { OR: [{ id }, { recordNumber: id }], deletedAt: null } });
  if (!record) return null;
  if (record.cancelledAt) throw new VehicleSaleCompletionError('This sale is cancelled; its Bill of Supply cannot be sent.');
  if (!record.invoiceNumber || !record.completedAt) throw new VehicleSaleCompletionError('Complete the sale before sending the invoice.');
  const issued = issueInvoiceToken();
  await prisma.sellAccount.update({
    where: { id: record.id },
    data: { invoiceTokenHash: issued.tokenHash, invoiceTokenExpiresAt: issued.expiresAt },
  });
  const delivery = await deliverVehicleSaleInvoice(record.id, issued.token, publicApiBaseUrl, `resend-${Date.now()}`);
  return { record: await getSellAccount(record.id), delivery };
};
