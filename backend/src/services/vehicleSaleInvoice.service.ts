import { createHash, randomBytes } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import prisma from '../lib/prisma';
import { getAppSettings } from '../utils/appSettings';
import { numberToWordsInr } from '../utils/customerPrimeInvoice';
import { fillBillOfSupplyTemplate, fillMoneyReceiptTemplate } from '../utils/vehicleSaleDocxTemplate';
import { nextVehicleSaleInvoiceNumber, vehicleSaleInvoicePrefix } from '../utils/vehicleSaleInvoice';
import { loadInvoiceLogo } from './customerPrimeInvoice.service';
import { convertDocxToPdf } from './docxToPdf.service';

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

export const issuePaymentReceiptToken = (now = new Date()) => issueInvoiceToken(now);

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

const templatePath = (environmentVariable: string, fileName: string) =>
  process.env[environmentVariable]?.trim() || path.resolve(process.cwd(), 'templates', 'vehicle-sale', fileName);

const readTemplate = async (environmentVariable: string, fileName: string) => {
  const sourcePath = templatePath(environmentVariable, fileName);
  try {
    return await fs.readFile(sourcePath);
  } catch {
    throw new Error(`Vehicle-sale document template is missing or unreadable: ${sourcePath}`);
  }
};

const formatInr = (value: number) => `₹${value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const formatDocumentDate = (value: Date) => value.toLocaleDateString('en-GB', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
}).replace(/ /g, '/').toUpperCase();

const companyAddressLine = (company: Awaited<ReturnType<typeof getAppSettings>>['companyInvoice']) =>
  [company.address, company.city, company.state, company.country].filter((value) => value?.trim()).join(', ') || 'Address not configured';

const authorisedSignatoryName = (company: Awaited<ReturnType<typeof getAppSettings>>['companyInvoice']) =>
  company.authorisedSignatoryName || 'Authorised Signatory';

const authorisedSignatoryDesignation = (company: Awaited<ReturnType<typeof getAppSettings>>['companyInvoice']) =>
  company.authorisedSignatoryDesignation || 'Authorised Signatory';

const paymentMethodLabel = (method: string) => ({
  CASH: 'CASH',
  UPI: 'UPI',
  BANK_TRANSFER: 'BANK TRANSFER',
  CHEQUE: 'CHEQUE',
  OTHER: 'OTHER',
} as Record<string, string>)[method] || method;

const customerAddressLine = (record: {
  purchaserCity?: string | null;
  purchaserState?: string | null;
  listing?: { address?: string | null; locationCity?: string | null; locationState?: string | null } | null;
}) =>
  [record.purchaserCity, record.purchaserState].filter(Boolean).join(', ')
  || [record.listing?.address, record.listing?.locationCity, record.listing?.locationState].filter(Boolean).join(', ')
  || 'Address not provided';

export const buildVehicleSaleInvoicePdf = async (sellAccountId: string) => {
  const record = await prisma.sellAccount.findUnique({
    where: { id: sellAccountId },
    include: { payments: true, listing: { select: { address: true, locationCity: true, locationState: true } } },
  });
  if (!record || record.deletedAt) throw new Error('Sold Vehicle record was not found for invoice generation.');
  if (!record.invoiceNumber) throw new Error('The invoice has not been generated for this Sold Vehicle yet.');

  const appSettings = await getAppSettings();
  const saleAmount = Number(record.sellAmount);
  const amountReceived = record.payments
    .filter((payment) => payment.side === 'PURCHASER_RECEIPT')
    .reduce((total, payment) => total + Number(payment.amount), 0);
  const template = await readTemplate('VEHICLE_SALE_BILL_OF_SUPPLY_TEMPLATE_PATH', 'JCB_EXCHANGE_BILL OF SUPPLY 01.docx');
  const logo = await loadInvoiceLogo(appSettings.siteLogo.darkLogoUrl || appSettings.siteLogo.imageUrl);
  const docx = fillBillOfSupplyTemplate(template, {
    companyName: appSettings.companyInvoice.companyName || 'JCB Exchange',
    cin: appSettings.companyInvoice.cin || '-',
    companyAddressLine: companyAddressLine(appSettings.companyInvoice),
    invoiceNumber: record.invoiceNumber,
    invoiceDate: formatDocumentDate(record.invoiceGeneratedAt || record.completedAt || new Date()),
    customerName: record.purchaserName || 'Customer',
    customerAddressLine: customerAddressLine(record),
    customerGstin: '-',
    customerStateCode: record.purchaserState || '-',
    placeOfSupply: record.purchaserState || record.listing?.locationState || appSettings.companyInvoice.state || '-',
    vehicleTitle: vehicleTitleOf(record),
    hsn: '-',
    quantity: '1',
    rate: formatInr(saleAmount),
    amount: formatInr(saleAmount),
    total: formatInr(saleAmount),
    amountInWords: numberToWordsInr(saleAmount),
    terms: [
      appSettings.companyInvoice.termsAndConditions,
      `Payment received in full. Total received: ${formatInr(amountReceived)}. Balance: ${formatInr(Math.max(0, saleAmount - amountReceived))}.`,
      'GST not charged separately on this Bill of Supply.',
    ].filter(Boolean).join(' '),
    authorisedSignatoryName: authorisedSignatoryName(appSettings.companyInvoice),
    authorisedSignatoryDesignation: authorisedSignatoryDesignation(appSettings.companyInvoice),
  }, logo);
  const buffer = await convertDocxToPdf(docx, `JCB-Exchange-Bill-of-Supply-${record.invoiceNumber}.pdf`);

  return {
    buffer,
    fileName: `JCB-Exchange-Bill-of-Supply-${record.invoiceNumber.replace(/[^A-Za-z0-9-]+/g, '-')}.pdf`,
    invoiceNumber: record.invoiceNumber,
  };
};

const financialYear = (date: Date) => {
  const year = date.getFullYear();
  const startYear = date.getMonth() >= 3 ? year : year - 1;
  return `${String(startYear).slice(-2)}-${String(startYear + 1).slice(-2)}`;
};

export const nextVehicleSalePaymentReceiptNumberFor = async (client: any, date: Date, city?: string | null) => {
  const prefix = `JCB/${(city || 'CITY').replace(/[^A-Za-z0-9]+/g, '-').toUpperCase()}/SAL/${financialYear(date)}/`;
  const existing: Array<{ receiptNumber: string | null }> = await client.sellAccountPayment.findMany({
    where: { receiptNumber: { startsWith: prefix } },
    select: { receiptNumber: true },
  });
  const highest = existing.reduce((max, item) => {
    const sequence = Number.parseInt((item.receiptNumber || '').slice(prefix.length), 10);
    return Number.isFinite(sequence) && sequence > max ? sequence : max;
  }, 0);
  return `${prefix}${String(highest + 1).padStart(4, '0')}`;
};

export const buildVehicleSalePaymentReceiptPdf = async (paymentId: string) => {
  const payment = await prisma.sellAccountPayment.findUnique({
    where: { id: paymentId },
    include: { sellAccount: { include: { payments: true, listing: { select: { address: true, locationCity: true, locationState: true } } } } },
  });
  if (!payment || payment.side !== 'PURCHASER_RECEIPT' || payment.sellAccount.deletedAt) {
    throw new Error('Customer payment receipt was not found.');
  }
  if (!payment.receiptNumber) throw new Error('The payment receipt has not been generated yet.');

  const appSettings = await getAppSettings();
  const received = Number(payment.amount);
  const totalReceived = payment.sellAccount.payments
    .filter((item) => item.side === 'PURCHASER_RECEIPT')
    .reduce((total, item) => total + Number(item.amount), 0);
  const balance = Math.max(0, Number(payment.sellAccount.sellAmount) - totalReceived);
  const template = await readTemplate('VEHICLE_SALE_MONEY_RECEIPT_TEMPLATE_PATH', 'JCB_Exchange_OPC_Private_Limited_Money_Receipt.docx');
  const logo = await loadInvoiceLogo(appSettings.siteLogo.darkLogoUrl || appSettings.siteLogo.imageUrl);
  const docx = fillMoneyReceiptTemplate(template, {
    companyName: appSettings.companyInvoice.companyName || 'JCB Exchange',
    cin: appSettings.companyInvoice.cin || '-',
    companyAddressLine: companyAddressLine(appSettings.companyInvoice),
    receiptNumber: payment.receiptNumber,
    receiptDate: formatDocumentDate(payment.paymentDate),
    vehicleTitle: vehicleTitleOf(payment.sellAccount),
    vehicleColor: '-',
    customerId: payment.sellAccount.recordNumber,
    customerName: payment.sellAccount.purchaserName || 'Customer',
    place: customerAddressLine(payment.sellAccount),
    paymentMethod: paymentMethodLabel(payment.method),
    amount: formatInr(received),
    amountInWords: numberToWordsInr(received),
    remarks: [payment.note, `Customer balance after receipt: ${formatInr(balance)}.`].filter(Boolean).join(' '),
    authorisedSignatoryName: authorisedSignatoryName(appSettings.companyInvoice),
    authorisedSignatoryDesignation: authorisedSignatoryDesignation(appSettings.companyInvoice),
  }, logo);
  const buffer = await convertDocxToPdf(docx, `JCB-Exchange-Money-Receipt-${payment.receiptNumber}.pdf`);
  return {
    buffer,
    fileName: `JCB-Exchange-Money-Receipt-${payment.receiptNumber.replace(/[^A-Za-z0-9-]+/g, '-')}.pdf`,
    receiptNumber: payment.receiptNumber,
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

export const findPaymentIdByReceiptToken = async (token: unknown) => {
  if (!isWellFormedInvoiceToken(token)) return null;
  const payment = await prisma.sellAccountPayment.findUnique({
    where: { receiptTokenHash: hashInvoiceToken(token) },
    select: { id: true, receiptNumber: true, receiptTokenExpiresAt: true, sellAccount: { select: { deletedAt: true } } },
  });
  if (!payment || payment.sellAccount.deletedAt || !payment.receiptNumber) return null;
  if (payment.receiptTokenExpiresAt && payment.receiptTokenExpiresAt <= new Date()) return null;
  return payment.id;
};
