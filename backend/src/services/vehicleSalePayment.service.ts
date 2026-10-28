import prisma from '../lib/prisma';
import { paymentSummaryForSellAccount } from './sellAccountFinance';
import { dispatchConfiguredSms } from './smsIntegration.service';
import { dispatchConfiguredWhatsApp } from './whatsappIntegration.service';
import { issuePaymentReceiptToken, nextVehicleSalePaymentReceiptNumberFor, vehicleTitleOf } from './vehicleSaleInvoice.service';
import { decryptDocumentLinkToken, encryptDocumentLinkToken } from '../utils/documentLinkToken';

export type VehicleSaleReceiptChannel = 'WHATSAPP' | 'SMS' | 'BOTH';

export const normalizeVehicleSaleReceiptChannel = (value: unknown): VehicleSaleReceiptChannel =>
  value === 'SMS' || value === 'WHATSAPP' || value === 'BOTH' ? value : 'BOTH';

export const selectedVehicleSaleReceiptChannels = (channel: VehicleSaleReceiptChannel): Array<'WHATSAPP' | 'SMS'> =>
  channel === 'SMS' ? ['SMS'] : channel === 'WHATSAPP' ? ['WHATSAPP'] : ['WHATSAPP', 'SMS'];

const formatInr = (value: number) => `Rs. ${value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const paymentMethodLabel = (method: string) => ({
  CASH: 'cash',
  UPI: 'UPI',
  BANK_TRANSFER: 'bank transfer',
  CHEQUE: 'cheque',
  OTHER: 'other',
} as Record<string, string>)[method] || method.toLowerCase();

const describeDispatch = (channel: 'WHATSAPP' | 'SMS', result: any) => {
  if (result?.queued && result?.sent) return { channel, sent: true, status: 'SENT' };
  if (result?.queued) return { channel, sent: false, status: 'FAILED', detail: result?.error || null };
  if (result?.duplicate) return { channel, sent: false, status: 'DUPLICATE' };
  return { channel, sent: false, status: String(result?.reason || 'NOT_SENT') };
};

export const buildPublicPaymentReceiptUrl = (publicApiBaseUrl: string, token: string) =>
  `${publicApiBaseUrl.replace(/\/+$/, '')}/api/public/payment-receipts/${token}`;

export const refreshVehicleSalePaymentReceiptToken = async (paymentId: string) => {
  return prisma.$transaction(async (tx) => {
    const payment = await tx.sellAccountPayment.findUnique({
      where: { id: paymentId },
      include: { sellAccount: { select: { id: true, deletedAt: true, purchaserCity: true } } },
    });
    if (!payment || payment.side !== 'PURCHASER_RECEIPT' || payment.sellAccount.deletedAt) return null;
    if (payment.receiptStatus !== 'ISSUED') throw new Error('Convert the draft receipt to a real receipt before sending it.');
    const now = new Date();
    const persistedToken = payment.receiptTokenCiphertext && payment.receiptTokenExpiresAt && payment.receiptTokenExpiresAt > now
      ? decryptDocumentLinkToken(payment.receiptTokenCiphertext)
      : null;
    if (persistedToken) return { paymentId: payment.id, token: persistedToken };
    const issued = issuePaymentReceiptToken(now);
    const receiptNumber = payment.receiptNumber || await nextVehicleSalePaymentReceiptNumberFor(tx, payment.paymentDate, payment.sellAccount.purchaserCity);
    await tx.sellAccountPayment.update({
      where: { id: payment.id },
      data: {
        receiptNumber,
        receiptTokenHash: issued.tokenHash,
        receiptTokenCiphertext: encryptDocumentLinkToken(issued.token),
        receiptTokenExpiresAt: issued.expiresAt,
        receiptGeneratedAt: new Date(),
      },
    });
    return { paymentId: payment.id, token: issued.token };
  });
};

export const deliverVehicleSalePaymentReceipt = async (
  paymentId: string,
  token: string,
  publicApiBaseUrl: string,
  channel: VehicleSaleReceiptChannel = 'BOTH',
  dedupeSuffix?: string,
) => {
  const payment = await prisma.sellAccountPayment.findUnique({
    where: { id: paymentId },
    include: { sellAccount: { include: { payments: true, refunds: true } } },
  });
  if (!payment || payment.side !== 'PURCHASER_RECEIPT' || payment.sellAccount.deletedAt || payment.receiptStatus !== 'ISSUED') {
    return { invoiceUrl: null, channels: [], anySent: false };
  }

  const amount = Number(payment.amount);
  const balance = paymentSummaryForSellAccount(payment.sellAccount, payment.sellAccount.payments, payment.sellAccount.refunds).purchaserBalance;
  const receiptUrl = buildPublicPaymentReceiptUrl(publicApiBaseUrl, token);
  const customerName = payment.sellAccount.purchaserName?.trim() || 'Customer';
  const vehicleTitle = vehicleTitleOf(payment.sellAccount);
  const receiptNumber = payment.receiptNumber || payment.id;
  const payloadSnapshot = {
    customerName,
    vehicleTitle,
    amount: formatInr(amount),
    receiptNumber,
    balance: formatInr(balance),
    paymentMethod: paymentMethodLabel(payment.method),
    receiptUrl,
  };

  const selectedChannels = selectedVehicleSaleReceiptChannels(channel);
  const [whatsapp, sms] = await Promise.all([
    selectedChannels.includes('WHATSAPP') ? dispatchConfiguredWhatsApp({
      eventCode: 'VEHICLE_SALE_PAYMENT_RECEIPT',
      relatedEntityType: 'SELL_ACCOUNT_PAYMENT',
      relatedEntityId: payment.id,
      recipientType: 'CUSTOMER',
      recipientPhone: payment.sellAccount.purchaserNumber,
      templateComponents: [{
        type: 'body',
        parameters: [
          { type: 'text', text: customerName },
          { type: 'text', text: vehicleTitle },
          { type: 'text', text: formatInr(amount) },
          { type: 'text', text: receiptNumber },
          { type: 'text', text: formatInr(balance) },
          { type: 'text', text: paymentMethodLabel(payment.method) },
          { type: 'text', text: receiptUrl },
        ],
      }],
      payloadSnapshot,
      dedupeSuffix,
    }) : null,
    selectedChannels.includes('SMS') ? dispatchConfiguredSms({
      eventCode: 'VEHICLE_SALE_PAYMENT_RECEIPT',
      relatedEntityType: 'SELL_ACCOUNT_PAYMENT',
      relatedEntityId: payment.id,
      recipientType: 'CUSTOMER',
      recipientPhone: payment.sellAccount.purchaserNumber,
      payloadSnapshot,
      dedupeSuffix,
    }) : null,
  ]);

  const channels = selectedChannels.map((selectedChannel) =>
    describeDispatch(selectedChannel, selectedChannel === 'WHATSAPP' ? whatsapp : sms));
  const previousChannels: Array<{ channel?: string; sent?: boolean }> = Array.isArray((payment.receiptDelivery as { channels?: unknown } | null)?.channels)
    ? ((payment.receiptDelivery as { channels: Array<{ channel?: string; sent?: boolean }> }).channels)
    : [];
  const mergedChannels = [
    ...previousChannels.filter((previous) => !channels.some((current) => current.channel === previous.channel)),
    ...channels,
  ];
  const attemptedAt = new Date();
  const anySent = mergedChannels.some((channel) => channel.sent === true);
  await prisma.sellAccountPayment.update({
    where: { id: payment.id },
    data: { receiptDelivery: { attemptedAt: attemptedAt.toISOString(), channels: mergedChannels, anySent } as any },
  });
  return { invoiceUrl: receiptUrl, channels, anySent };
};
