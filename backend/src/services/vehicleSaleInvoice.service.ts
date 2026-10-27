import { createHash, randomBytes } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import prisma from '../lib/prisma';
import { getAppSettings } from '../utils/appSettings';
import { numberToWordsInr } from '../utils/customerPrimeInvoice';
import { renderSellAccountVoucherPdf } from '../utils/sellAccountVoucherPdf';
import { renderBillOfSupplyPdf, renderMoneyReceiptPdf } from '../utils/vehicleSaleDocumentsPdf';
import { fillBillOfSupplyTemplate, fillMoneyReceiptTemplate } from '../utils/vehicleSaleDocxTemplate';
import { financialYearLabel, nextVehicleSaleInvoiceNumber, vehicleSaleInvoicePrefix } from '../utils/vehicleSaleInvoice';
import { loadInvoiceLogo } from './customerPrimeInvoice.service';
import { convertDocxToPdf } from './docxToPdf.service';
import { paymentSummaryForSellAccount } from './sellAccountFinance';

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
  await lockSeries(client, vehicleSaleInvoicePrefix(date));
  const existing: Array<{ invoiceNumber: string | null }> = await client.sellAccount.findMany({
    where: { invoiceNumber: { startsWith: vehicleSaleInvoicePrefix(date) } },
    select: { invoiceNumber: true },
  });
  return nextVehicleSaleInvoiceNumber(date, existing.map((item) => item.invoiceNumber || ''));
};

/**
 * Serialises numbering of one series until the caller's transaction ends, so two users issuing
 * at the same moment never get the same number. Outside a transaction the lock is released at
 * once, so it is harmless there.
 */
const lockSeries = async (client: any, prefix: string) => {
  if (typeof client?.$executeRaw !== 'function') return;
  await client.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`number-series:${prefix}`}))`;
};

/** Next number of a series, continuing from the highest one in use (records can be deleted). */
const nextInSeries = (prefix: string, existing: Array<string | null>) => {
  const highest = existing.reduce((max, value) => {
    const sequence = Number.parseInt((value || '').slice(prefix.length), 10);
    return Number.isFinite(sequence) && sequence > max ? sequence : max;
  }, 0);
  return `${prefix}${String(highest + 1).padStart(4, '0')}`;
};

/** Credit notes against cancelled Bills of Supply, e.g. JCBX/CN/2026-27/0001. */
export const nextSellAccountCreditNoteNumberFor = async (client: any, date: Date) => {
  const prefix = `JCBX/CN/${financialYearLabel(date)}/`;
  await lockSeries(client, prefix);
  const existing: Array<{ creditNoteNumber: string | null }> = await client.sellAccount.findMany({
    where: { creditNoteNumber: { startsWith: prefix } },
    select: { creditNoteNumber: true },
  });
  return nextInSeries(prefix, existing.map((item) => item.creditNoteNumber));
};

const cityCode = (city?: string | null) => (city || 'CITY').replace(/[^A-Za-z0-9]+/g, '-').toUpperCase();

/** Refund advices, e.g. JCB/RAIPUR/RFD/26-27/0001 (same shape as money receipts). */
export const nextSellAccountRefundNumberFor = async (client: any, date: Date, city?: string | null) => {
  const prefix = `JCB/${cityCode(city)}/RFD/${financialYear(date)}/`;
  await lockSeries(client, prefix);
  const existing: Array<{ refundNumber: string | null }> = await client.sellAccountRefund.findMany({
    where: { refundNumber: { startsWith: prefix } },
    select: { refundNumber: true },
  });
  return nextInSeries(prefix, existing.map((item) => item.refundNumber));
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
    throw new TemplateUnavailableError(`Vehicle-sale document template is missing or unreadable: ${sourcePath}`);
  }
};

class TemplateUnavailableError extends Error {}

/**
 * The DOCX stationery templates are provisioned separately (not in git) and need a DOCX→PDF
 * converter. Where either is missing, the document is drawn with the built-in layout instead of
 * failing; any other error is still raised.
 */
const renderWithTemplateFallback = async (label: string, fromTemplate: () => Promise<Buffer>, builtIn: () => Promise<Buffer>) => {
  try {
    return await fromTemplate();
  } catch (error) {
    const setupMissing = error instanceof TemplateUnavailableError
      || (error instanceof Error && /DOCX-to-PDF conversion is not configured/i.test(error.message));
    if (!setupMissing) throw error;
    console.warn(`[vehicle-sale] ${label}: ${(error as Error).message} Using the built-in layout.`);
    return builtIn();
  }
};

// pdfkit's standard fonts have no ₹ glyph.
const rupeesText = (value: number) => `Rs. ${value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

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

const vehicleIdentityLine = (record: { vehicleNumber?: string | null; chassisNumber?: string | null; listing?: { engineNumber?: string | null } | null }) =>
  [
    record.listing?.engineNumber ? `Engine No. ${record.listing.engineNumber}` : '',
    record.chassisNumber ? `Chassis No. ${record.chassisNumber}` : '',
    record.vehicleNumber ? `Reg. No. ${record.vehicleNumber}` : '',
  ].filter(Boolean).join(', ');

/** Bill of Supply: the sale amount only, no GST charged (second-hand goods). */
export const buildVehicleSaleInvoicePdf = async (sellAccountId: string) => {
  const record = await prisma.sellAccount.findUnique({
    where: { id: sellAccountId },
    include: { payments: true, refunds: true, listing: { select: { address: true, locationCity: true, locationState: true, engineNumber: true } } },
  });
  if (!record || record.deletedAt) throw new Error('Sold Vehicle record was not found for invoice generation.');
  if (!record.invoiceNumber) throw new Error('The invoice has not been generated for this Sold Vehicle yet.');

  const appSettings = await getAppSettings();
  const saleAmount = Number(record.sellAmount);
  const summary = paymentSummaryForSellAccount({ ...record, cancelledAt: null }, record.payments, record.refunds);
  const amountReceived = summary.purchaserReceived;
  const balance = summary.purchaserBalance;
  const identity = vehicleIdentityLine(record);
  const invoiceDate = record.invoiceGeneratedAt || record.completedAt || new Date();
  const logo = await loadInvoiceLogo(appSettings.siteLogo.darkLogoUrl || appSettings.siteLogo.imageUrl);
  const company = appSettings.companyInvoice;
  const invoiceNumber = record.invoiceNumber;
  const description = [vehicleTitleOf(record), record.chassisNumber ? `Chassis No. ${record.chassisNumber}` : ''].filter(Boolean).join(' - ');
  const placeOfSupply = record.purchaserState || record.listing?.locationState || company.state || '-';
  const terms = (money: (value: number) => string) => [
    `Being old ${vehicleTitleOf(record)} sold${identity ? `, ${identity}` : ''} vide Inv. No. ${invoiceNumber}, Dt. ${formatDocumentDate(invoiceDate)}.`,
    balance > 0
      ? `Total received: ${money(amountReceived)}. Balance due: ${money(balance)}.`
      : `Payment received in full: ${money(amountReceived)}.`,
    'GST not charged separately on this Bill of Supply.',
    record.creditNoteNumber ? `CANCELLED vide Credit Note ${record.creditNoteNumber}.` : '',
    company.termsAndConditions,
  ].filter(Boolean).join(' ');
  const buffer = await renderWithTemplateFallback('Bill of Supply', async () => {
    const template = await readTemplate('VEHICLE_SALE_BILL_OF_SUPPLY_TEMPLATE_PATH', 'JCB_EXCHANGE_BILL OF SUPPLY 01.docx');
    const docx = fillBillOfSupplyTemplate(template, {
      companyName: company.companyName || 'JCB Exchange',
      cin: company.cin || '-',
      companyAddressLine: companyAddressLine(company),
      companyGstin: company.gstin || '-',
      invoiceNumber,
      invoiceDate: formatDocumentDate(invoiceDate),
      customerName: record.purchaserName || 'Customer',
      customerAddressLine: customerAddressLine(record),
      customerGstin: '-',
      customerStateCode: record.purchaserState || '-',
      placeOfSupply,
      vehicleTitle: description,
      hsn: '-',
      quantity: '1',
      rate: formatInr(saleAmount),
      amount: formatInr(saleAmount),
      total: formatInr(saleAmount),
      amountInWords: numberToWordsInr(saleAmount),
      terms: terms(formatInr),
      authorisedSignatoryName: authorisedSignatoryName(company),
      authorisedSignatoryDesignation: authorisedSignatoryDesignation(company),
    }, logo);
    return convertDocxToPdf(docx, `JCB-Exchange-Bill-of-Supply-${invoiceNumber}.pdf`);
  }, () => renderBillOfSupplyPdf({
    company: { name: company.companyName || 'JCB Exchange', addressLine: companyAddressLine(company), cin: company.cin, gstin: company.gstin, state: company.state },
    invoiceNumber,
    invoiceDate: formatDocumentDate(invoiceDate),
    customerName: record.purchaserName || 'Customer',
    customerAddressLine: customerAddressLine(record),
    customerStateCode: record.purchaserState || '-',
    placeOfSupply,
    description,
    hsn: '-',
    amount: rupeesText(saleAmount),
    total: rupeesText(saleAmount),
    amountInWords: numberToWordsInr(saleAmount),
    remarks: terms(rupeesText),
    cancelled: record.creditNoteNumber ? `CANCELLED - Credit Note ${record.creditNoteNumber}` : null,
    signatory: { name: authorisedSignatoryName(company), designation: authorisedSignatoryDesignation(company) },
  }, logo));

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
  const prefix = `JCB/${cityCode(city)}/SAL/${financialYear(date)}/`;
  await lockSeries(client, prefix);
  const existing: Array<{ receiptNumber: string | null }> = await client.sellAccountPayment.findMany({
    where: { receiptNumber: { startsWith: prefix } },
    select: { receiptNumber: true },
  });
  return nextInSeries(prefix, existing.map((item) => item.receiptNumber));
};

/** "Being amount received through RTGS (Txn No. 244043, dated 08/SEP/2026, drawn on AXIS 3943) against ..." */
const receiptRemarks = (payment: { method: string; reference: string | null; drawnOn: string | null; paymentDate: Date; note: string | null }, vehicleTitle: string, balance: number) => {
  const details = [
    payment.reference ? `Txn No. ${payment.reference}` : '',
    `dated ${formatDocumentDate(payment.paymentDate)}`,
    payment.drawnOn ? `drawn on ${payment.drawnOn}` : '',
  ].filter(Boolean).join(', ');
  return [
    `Being amount received through ${paymentMethodLabel(payment.method)} (${details}) against ${vehicleTitle}.`,
    payment.note ? payment.note.replace(/([^.!?])\s*$/, '$1.') : '',
    `Customer balance: ${formatInr(balance)}.`,
    'PO/DD/CHQ subject to realisation.',
  ].filter(Boolean).join(' ');
};

/** Money receipt PDF. A DRAFT receipt prints with a "not valid" marker and no receipt number. */
export const buildVehicleSalePaymentReceiptPdf = async (paymentId: string, options: { allowDraft?: boolean } = {}) => {
  const payment = await prisma.sellAccountPayment.findUnique({
    where: { id: paymentId },
    include: { sellAccount: { include: { payments: true, refunds: true, listing: { select: { address: true, locationCity: true, locationState: true } } } } },
  });
  if (!payment || payment.side !== 'PURCHASER_RECEIPT' || payment.sellAccount.deletedAt) {
    throw new Error('Customer payment receipt was not found.');
  }
  const isDraft = payment.receiptStatus === 'DRAFT';
  if (isDraft && !options.allowDraft) throw new Error('This receipt is still a draft.');
  if (!isDraft && !payment.receiptNumber) throw new Error('The payment receipt has not been generated yet.');

  const appSettings = await getAppSettings();
  const received = Number(payment.amount);
  const summary = paymentSummaryForSellAccount(payment.sellAccount, payment.sellAccount.payments, payment.sellAccount.refunds);
  // A draft is not in the balance yet; show the balance as it will be once it is issued.
  const balance = isDraft ? Math.max(0, summary.purchaserBalance - received) : summary.purchaserBalance;
  const vehicleTitle = vehicleTitleOf(payment.sellAccount);
  const statusNote = isDraft
    ? 'DRAFT RECEIPT - NOT VALID UNTIL ISSUED.'
    : payment.receiptStatus === 'CANCELLED' ? `CANCELLED: ${payment.cancelReason || 'money not received'}.` : '';
  const logo = await loadInvoiceLogo(appSettings.siteLogo.darkLogoUrl || appSettings.siteLogo.imageUrl);
  const company = appSettings.companyInvoice;
  const receiptNumber = isDraft ? 'DRAFT (NOT VALID)' : payment.receiptNumber!;
  const fileLabel = isDraft ? `DRAFT-${payment.id.slice(0, 8)}` : payment.receiptNumber!.replace(/[^A-Za-z0-9-]+/g, '-');
  const customerName = payment.sellAccount.purchaserName || 'Customer';
  const place = customerAddressLine(payment.sellAccount);
  const remarks = [statusNote, receiptRemarks(payment, vehicleTitle, balance)].filter(Boolean).join(' ');
  const buffer = await renderWithTemplateFallback('Money receipt', async () => {
    const template = await readTemplate('VEHICLE_SALE_MONEY_RECEIPT_TEMPLATE_PATH', 'JCB_Exchange_OPC_Private_Limited_Money_Receipt.docx');
    const docx = fillMoneyReceiptTemplate(template, {
      companyName: company.companyName || 'JCB Exchange',
      cin: company.cin || '-',
      companyAddressLine: companyAddressLine(company),
      receiptNumber,
      receiptDate: formatDocumentDate(payment.paymentDate),
      vehicleTitle,
      vehicleColor: '-',
      customerId: payment.sellAccount.recordNumber,
      customerName,
      place,
      paymentMethod: paymentMethodLabel(payment.method),
      amount: formatInr(received),
      amountInWords: numberToWordsInr(received),
      remarks,
      authorisedSignatoryName: authorisedSignatoryName(company),
      authorisedSignatoryDesignation: authorisedSignatoryDesignation(company),
    }, logo);
    return convertDocxToPdf(docx, `JCB-Exchange-Money-Receipt-${fileLabel}.pdf`);
  }, () => renderMoneyReceiptPdf({
    company: { name: company.companyName || 'JCB Exchange', addressLine: companyAddressLine(company), cin: company.cin, gstin: company.gstin },
    title: isDraft ? 'MONEY RECEIPT (DRAFT - NOT VALID)' : payment.receiptStatus === 'CANCELLED' ? 'MONEY RECEIPT (CANCELLED)' : 'MONEY RECEIPT',
    receiptNumber,
    receiptDate: formatDocumentDate(payment.issuedAt || payment.paymentDate),
    vehicleTitle,
    customerId: payment.sellAccount.recordNumber,
    customerName,
    place,
    mode: paymentMethodLabel(payment.method),
    txnNumber: payment.reference || '-',
    txnDate: formatDocumentDate(payment.paymentDate),
    drawnOn: payment.drawnOn || '-',
    amount: rupeesText(received),
    amountInWords: numberToWordsInr(received),
    remarks: remarks.replace(/₹/g, 'Rs. '),
    signatory: { name: authorisedSignatoryName(company), designation: authorisedSignatoryDesignation(company) },
  }, logo));
  return {
    buffer,
    fileName: `JCB-Exchange-Money-Receipt-${fileLabel}.pdf`,
    receiptNumber,
  };
};

const sellAccountDocumentContext = async (sellAccountId: string) => {
  const record = await prisma.sellAccount.findUnique({ where: { id: sellAccountId } });
  if (!record || record.deletedAt) throw new Error('Sold Vehicle record was not found.');
  const appSettings = await getAppSettings();
  const company = appSettings.companyInvoice;
  return {
    record,
    logo: await loadInvoiceLogo(appSettings.siteLogo.darkLogoUrl || appSettings.siteLogo.imageUrl),
    company: { name: company.companyName || 'JCB Exchange', addressLine: companyAddressLine(company), gstin: company.gstin, cin: company.cin },
    signatory: { name: authorisedSignatoryName(company), designation: authorisedSignatoryDesignation(company) },
    party: { label: 'PAID TO', name: record.purchaserName || 'Customer', mobile: record.purchaserNumber, place: [record.purchaserCity, record.purchaserState].filter(Boolean).join(', ') },
    vehicle: { title: vehicleTitleOf(record), registrationNumber: record.vehicleNumber, chassisNumber: record.chassisNumber, recordNumber: record.recordNumber },
  };
};

const REFUND_REASON_LABEL: Record<string, string> = {
  DEAL_CANCELLED: 'Deal cancelled',
  EXCESS_PAYMENT: 'Excess payment',
  PRICE_REDUCTION: 'Price reduction',
  VEHICLE_RETURN: 'Vehicle returned',
  OTHER: 'Other',
};

/** Refund advice for a paid refund: money returned to the purchaser. */
export const buildSellAccountRefundAdvicePdf = async (sellAccountId: string, refundId: string) => {
  const refund = await prisma.sellAccountRefund.findFirst({ where: { id: refundId, sellAccountId } });
  if (!refund || refund.status !== 'PAID' || !refund.refundNumber) throw new Error('Only a paid refund has a refund advice.');
  const context = await sellAccountDocumentContext(sellAccountId);
  const amount = Number(refund.amount);
  const forfeit = Number(refund.forfeitAmount);
  const details = [
    refund.reference ? `Txn No. ${refund.reference}` : '',
    refund.refundDate ? `dated ${formatDocumentDate(refund.refundDate)}` : '',
    refund.drawnOn ? `bank ${refund.drawnOn}` : '',
  ].filter(Boolean).join(', ');
  const buffer = await renderSellAccountVoucherPdf({
    title: 'REFUND ADVICE',
    subtitle: 'Amount returned to the customer against the vehicle deal below',
    number: refund.refundNumber,
    date: refund.refundDate || refund.paidAt || new Date(),
    company: context.company,
    party: context.party,
    vehicle: context.vehicle,
    details: [
      ['REASON', REFUND_REASON_LABEL[refund.reason] || refund.reason],
      ['MODE', `${paymentMethodLabel(refund.method)}${details ? ` (${details})` : ''}`],
      ...(forfeit > 0 ? [['CANCELLATION CHARGE RETAINED', rupeesText(forfeit)] as [string, string]] : []),
    ],
    amountLabel: 'AMOUNT REFUNDED',
    amount,
    narration: [`Being amount refunded to ${context.party.name} against ${context.vehicle.title} (${context.vehicle.recordNumber}).`, refund.note].filter(Boolean).join(' '),
    signatory: context.signatory,
  }, context.logo);
  return { buffer, fileName: `JCB-Exchange-Refund-${refund.refundNumber.replace(/[^A-Za-z0-9-]+/g, '-')}.pdf` };
};

/** Credit note cancelling the Bill of Supply of a cancelled sale. */
export const buildSellAccountCreditNotePdf = async (sellAccountId: string) => {
  const context = await sellAccountDocumentContext(sellAccountId);
  const { record } = context;
  if (!record.creditNoteNumber || !record.invoiceNumber) throw new Error('No credit note was issued for this sale.');
  const amount = Number(record.sellAmount);
  const buffer = await renderSellAccountVoucherPdf({
    title: 'CREDIT NOTE',
    subtitle: 'Bill of Supply cancelled - GST not charged separately',
    number: record.creditNoteNumber,
    date: record.creditNoteDate || record.cancelledAt || new Date(),
    company: context.company,
    party: { ...context.party, label: 'ISSUED TO' },
    vehicle: context.vehicle,
    details: [
      ['AGAINST BILL OF SUPPLY', `${record.invoiceNumber}${record.invoiceGeneratedAt ? ` dated ${formatDocumentDate(record.invoiceGeneratedAt)}` : ''}`],
      ['REASON', record.cancelReason || 'Sale cancelled'],
    ],
    amountLabel: 'CREDIT NOTE VALUE',
    amount,
    narration: `Being sale of ${context.vehicle.title} cancelled; Bill of Supply ${record.invoiceNumber} stands cancelled.`,
    signatory: context.signatory,
  }, context.logo);
  return { buffer, fileName: `JCB-Exchange-Credit-Note-${record.creditNoteNumber.replace(/[^A-Za-z0-9-]+/g, '-')}.pdf` };
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
    select: { id: true, receiptNumber: true, receiptStatus: true, receiptTokenExpiresAt: true, sellAccount: { select: { deletedAt: true } } },
  });
  if (!payment || payment.sellAccount.deletedAt || !payment.receiptNumber || payment.receiptStatus !== 'ISSUED') return null;
  if (payment.receiptTokenExpiresAt && payment.receiptTokenExpiresAt <= new Date()) return null;
  return payment.id;
};
