import { createHash, randomBytes } from 'node:crypto';
import prisma from '../lib/prisma';
import { getAppSettings } from '../utils/appSettings';
import { nextVehicleSaleInvoiceNumber, renderVehicleSaleInvoicePdf, vehicleSaleInvoicePrefix } from '../utils/vehicleSaleInvoice';
import { loadInvoiceLogo } from './customerPrimeInvoice.service';

const INVOICE_LINK_TTL_DAYS = 180;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export const hashInvoiceToken = (token: string) => createHash('sha256').update(token).digest('hex');

/** A 256-bit random link token. Only its hash is persisted. */
export const issueInvoiceToken = (now = new Date()) => {
  const token = randomBytes(32).toString('base64url');
  return {
    token,
    tokenHash: hashInvoiceToken(token),
    expiresAt: new Date(now.getTime() + INVOICE_LINK_TTL_DAYS * 24 * 60 * 60 * 1000),
  };
};

export const isWellFormedInvoiceToken = (token: unknown): token is string => typeof token === 'string' && TOKEN_PATTERN.test(token);

export const nextVehicleSaleInvoiceNumberFor = async (client: any, date: Date) => {
  const existing: Array<{ invoiceNumber: string | null }> = await client.sellAccount.findMany({
    where: { invoiceNumber: { startsWith: vehicleSaleInvoicePrefix(date) } },
    select: { invoiceNumber: true },
  });
  return nextVehicleSaleInvoiceNumber(date, existing.map((item) => item.invoiceNumber || ''));
};

export const vehicleTitleOf = (record: { listingTitle?: string | null; brandName?: string | null; vehicleModel?: string | null; vehicleNumber?: string | null }) =>
  record.listingTitle?.trim()
  || [record.brandName, record.vehicleModel].filter(Boolean).join(' ').trim()
  || record.vehicleNumber
  || 'Vehicle';

export const buildVehicleSaleInvoicePdf = async (sellAccountId: string) => {
  const record = await prisma.sellAccount.findUnique({
    where: { id: sellAccountId },
    include: { payments: true },
  });
  if (!record || record.deletedAt) throw new Error('Sold Vehicle record was not found for invoice generation.');
  if (!record.invoiceNumber) throw new Error('The invoice has not been generated for this Sold Vehicle yet.');

  const appSettings = await getAppSettings();
  const amountReceived = record.payments
    .filter((payment) => payment.side === 'PURCHASER_RECEIPT')
    .reduce((total, payment) => total + Number(payment.amount), 0);
  const buffer = await renderVehicleSaleInvoicePdf({
    company: appSettings.companyInvoice,
    invoiceNumber: record.invoiceNumber,
    invoiceDate: record.invoiceGeneratedAt || record.completedAt || new Date(),
    recordNumber: record.recordNumber,
    customer: {
      name: record.purchaserName || 'Customer',
      mobile: record.purchaserNumber || '',
      city: record.purchaserCity || '',
      state: record.purchaserState || '',
    },
    vehicle: {
      title: vehicleTitleOf(record),
      brand: record.brandName || '',
      model: record.vehicleModel || '',
      category: record.vehicleType || '',
      registrationNumber: record.vehicleNumber || '',
      chassisNumber: record.chassisNumber || '',
    },
    saleType: record.saleType === 'EXCHANGE' ? 'EXCHANGE' : 'SELL',
    saleAmount: Number(record.sellAmount),
    exchangeVehicle: record.saleExchangeVehicle || '',
    exchangeValue: Number(record.saleExchangeValue || 0),
    amountReceived,
  }, await loadInvoiceLogo(appSettings.siteLogo.darkLogoUrl || appSettings.siteLogo.imageUrl));

  return {
    buffer,
    fileName: `JCB-Exchange-Invoice-${record.invoiceNumber.replace(/[^A-Za-z0-9-]+/g, '-')}.pdf`,
    invoiceNumber: record.invoiceNumber,
  };
};

/** Resolves a public invoice link. Unknown, malformed and expired tokens all look the same. */
export const findSellAccountIdByInvoiceToken = async (token: unknown) => {
  if (!isWellFormedInvoiceToken(token)) return null;
  const record = await prisma.sellAccount.findUnique({
    where: { invoiceTokenHash: hashInvoiceToken(token) },
    select: { id: true, deletedAt: true, invoiceNumber: true, invoiceTokenExpiresAt: true },
  });
  if (!record || record.deletedAt || !record.invoiceNumber) return null;
  if (record.invoiceTokenExpiresAt && record.invoiceTokenExpiresAt <= new Date()) return null;
  return record.id;
};
