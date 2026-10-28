import fs from 'fs/promises';
import path from 'path';
import type { Readable } from 'stream';
import archiver from 'archiver';
import PDFDocument from 'pdfkit';
import prisma from '../lib/prisma';
import { extractDriveFileIdFromSecureUrl } from '../utils/secureDocumentUrl';
import { publicUploadDir, secureUploadDir } from '../utils/documentUpload';
import { streamFileFromDrive } from './googleDrive.service';
import { getListingPricing } from '../utils/listingPricing';
import { readTaskDocuments, RTO_TRANSFER_TASK_DEFINITIONS } from './rtoTransferTasks';
import {
  buildSellAccountCreditNotePdf,
  buildSellAccountRefundAdvicePdf,
  buildVehicleSaleInvoicePdf,
  buildVehicleSalePaymentReceiptPdf,
} from './vehicleSaleInvoice.service';

// Vehicle Docs: every document the platform holds for one registration number, gathered from Sold
// Vehicle records (uploaded deeds/KYC and generated Bill of Supply, receipts, credit note, refund
// advice), listings (photos, website payment receipts), RTO transfer task uploads and the finance
// document vault. A fixed checklist per section shows which expected documents are still missing (NA).

export type VehicleDocSection = 'Seller & Purchase' | 'Buyer & Sale' | 'Invoices & Payments' | 'RTO Transfer' | 'Listing & Photos' | 'Other';
export const VEHICLE_DOC_SECTIONS: VehicleDocSection[] = ['Seller & Purchase', 'Buyer & Sale', 'Invoices & Payments', 'RTO Transfer', 'Listing & Photos', 'Other'];

type FileContent = { buffer: Buffer; fileName: string; mimeType: string };
export type VehicleDoc = {
  id: string;
  section: VehicleDocSection;
  /** The checklist row this file satisfies; null for extra files (vault uploads). */
  checklistKey: string | null;
  label: string;
  fileName: string;
  mimeType: string;
  size: number | null;
  date: string | null;
  generated: boolean;
  isVideo: boolean;
  read: () => Promise<FileContent>;
};

export class VehicleDocsError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

/** Registration numbers are compared without spaces, dashes or case: "CG 04 DM-1005" = "CG04DM1005". */
export const normalizeVehicleNumber = (value: unknown) => String(value ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');

const SALE_DOCUMENT_SLOTS: Array<{ key: string; label: string; section: VehicleDocSection }> = [
  { key: 'purchaseDeed', label: 'Purchase deed', section: 'Seller & Purchase' },
  { key: 'purchaseAadhaarCard', label: 'Seller Aadhaar card', section: 'Seller & Purchase' },
  { key: 'purchasePanCard', label: 'Seller PAN card', section: 'Seller & Purchase' },
  { key: 'purchaseGstCertificate', label: 'Seller GST certificate', section: 'Seller & Purchase' },
  { key: 'sellDeed', label: 'Sale deed', section: 'Buyer & Sale' },
  { key: 'sellAadhaarCard', label: 'Buyer Aadhaar card', section: 'Buyer & Sale' },
  { key: 'sellPanCard', label: 'Buyer PAN card', section: 'Buyer & Sale' },
  { key: 'sellGstCertificate', label: 'Buyer GST certificate', section: 'Buyer & Sale' },
];

/** Documents every vehicle is expected to have, in display order. RTO rows follow the task checklist. */
const EXPECTED_DOCUMENTS: Array<{ key: string; label: string; section: VehicleDocSection }> = [
  ...SALE_DOCUMENT_SLOTS,
  { key: 'invoice', label: 'Bill of Supply (sale invoice)', section: 'Invoices & Payments' },
  { key: 'receipts', label: 'Money receipts', section: 'Invoices & Payments' },
  { key: 'website-payment', label: 'Website payment proof', section: 'Invoices & Payments' },
  { key: 'credit-note', label: 'Credit note', section: 'Invoices & Payments' },
  { key: 'refunds', label: 'Refund advice', section: 'Invoices & Payments' },
  ...RTO_TRANSFER_TASK_DEFINITIONS.map((task) => ({ key: `rto-${task.taskKey}`, label: task.label, section: 'RTO Transfer' as const })),
  { key: 'listing-photos', label: 'Listing photos', section: 'Listing & Photos' },
  { key: 'listing-video', label: 'Listing video', section: 'Listing & Photos' },
];

export type ChecklistState = 'AVAILABLE' | 'NA' | 'NOT_REQUIRED';
export type ChecklistItem = { key: string; label: string; section: VehicleDocSection; state: ChecklistState; note: string | null; docIds: string[] };

/**
 * One row per expected document: AVAILABLE when at least one file matches, NOT_REQUIRED when the RTO task
 * was marked not required, otherwise NA. RTO notes carry the task status ("Transferred", "Pending").
 */
export const buildChecklist = (
  docs: Array<{ id: string; checklistKey: string | null }>,
  rtoTasks: Array<{ taskKey: string; label: string; status: string; remark: string | null }> = [],
): ChecklistItem[] => {
  const statusText = (value: string) => value.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (char) => char.toUpperCase());
  const taskByKey = new Map(rtoTasks.map((task) => [`rto-${task.taskKey}`, task]));
  const expected = [...EXPECTED_DOCUMENTS];
  // Tasks outside the standard checklist (older records) still get a row.
  for (const task of rtoTasks) {
    if (!expected.some((item) => item.key === `rto-${task.taskKey}`)) expected.push({ key: `rto-${task.taskKey}`, label: task.label, section: 'RTO Transfer' });
  }
  return expected.map((item) => {
    const docIds = docs.filter((doc) => doc.checklistKey === item.key).map((doc) => doc.id);
    const task = taskByKey.get(item.key);
    const state: ChecklistState = docIds.length ? 'AVAILABLE' : task?.status === 'NOT_REQUIRED' ? 'NOT_REQUIRED' : 'NA';
    return { key: item.key, label: task?.label || item.label, section: item.section, state, note: task ? statusText(task.status) : null, docIds };
  });
};

const MIME_BY_EXTENSION: Record<string, string> = {
  '.pdf': 'application/pdf', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp',
  '.gif': 'image/gif', '.mp4': 'video/mp4', '.mov': 'video/quicktime', '.webm': 'video/webm',
};
const guessMime = (name: string, fallback = 'application/octet-stream') => MIME_BY_EXTENSION[path.extname(name).toLowerCase()] ?? fallback;
const baseName = (url: string) => decodeURIComponent(url.split('?')[0]!.split('/').pop() || 'file');
const safeName = (value: string) => value.replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim().slice(0, 120) || 'file';
const isoDate = (value: Date | null | undefined) => (value ? value.toISOString().slice(0, 10) : null);

const streamToBuffer = async (stream: Readable) => {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks);
};

/** Reads an uploaded file (Google Drive, local secure or local public storage) by its stored URL. */
const readStoredFile = async (url: string): Promise<Buffer> => {
  const driveId = extractDriveFileIdFromSecureUrl(url) ?? url.match(/\/drive\/([A-Za-z0-9_-]{10,})/)?.[1] ?? null;
  if (driveId) return streamToBuffer(await streamFileFromDrive(driveId));
  const inside = (root: string, relative: string) => {
    const resolvedRoot = path.resolve(root);
    const target = path.resolve(resolvedRoot, relative);
    if (!target.startsWith(`${resolvedRoot}${path.sep}`)) throw new VehicleDocsError('Invalid file path.');
    return target;
  };
  const secure = url.match(/\/api\/documents\/secure\/([^/?#]+)/);
  if (secure) return fs.readFile(inside(secureUploadDir, decodeURIComponent(secure[1]!)));
  const local = url.match(/\/uploads\/public\/([^?#]+)/);
  if (local) return fs.readFile(inside(publicUploadDir, decodeURIComponent(local[1]!)));
  throw new VehicleDocsError('This file is stored somewhere the server cannot read.', 404);
};

const storedDoc = (input: Omit<VehicleDoc, 'read' | 'generated' | 'isVideo'> & { url: string }): VehicleDoc => ({
  ...input,
  generated: false,
  isVideo: input.mimeType.startsWith('video/'),
  read: async () => ({ buffer: await readStoredFile(input.url), fileName: input.fileName, mimeType: input.mimeType }),
});

const generatedDoc = (input: Omit<VehicleDoc, 'read' | 'generated' | 'isVideo' | 'mimeType' | 'size'> & { build: () => Promise<{ buffer: Buffer; fileName: string }> }): VehicleDoc => ({
  id: input.id, section: input.section, checklistKey: input.checklistKey, label: input.label, fileName: input.fileName, date: input.date,
  mimeType: 'application/pdf', size: null, generated: true, isVideo: false,
  read: async () => {
    const built = await input.build();
    return { buffer: built.buffer, fileName: built.fileName || input.fileName, mimeType: 'application/pdf' };
  },
});

// ---------------------------------------------------------------------------------------------
// Gathering one vehicle
// ---------------------------------------------------------------------------------------------

const idsWithNumber = async (table: 'SellAccount' | 'VehicleRtoRecord', column: 'vehicleNumber', normalized: string) => {
  const rows = table === 'SellAccount'
    ? await prisma.$queryRaw<Array<{ id: string }>>`SELECT id FROM "SellAccount" WHERE upper(regexp_replace(coalesce("vehicleNumber", ''), '[^A-Za-z0-9]', '', 'g')) = ${normalized}`
    : await prisma.$queryRaw<Array<{ id: string }>>`SELECT id FROM "VehicleRtoRecord" WHERE upper(regexp_replace(coalesce("vehicleNumber", ''), '[^A-Za-z0-9]', '', 'g')) = ${normalized}`;
  void column;
  return rows.map((row) => row.id);
};

const loadVehicle = async (number: string) => {
  const normalized = normalizeVehicleNumber(number);
  if (normalized.length < 4) throw new VehicleDocsError('Enter a valid vehicle number.');
  const [saleIds, rtoIds, verified] = await Promise.all([
    idsWithNumber('SellAccount', 'vehicleNumber', normalized),
    idsWithNumber('VehicleRtoRecord', 'vehicleNumber', normalized),
    prisma.$queryRaw<Array<{ listingId: string }>>`SELECT "listingId" FROM "ListingVehicleVerification" WHERE upper(regexp_replace(coalesce("verifiedRegistrationNumber", ''), '[^A-Za-z0-9]', '', 'g')) = ${normalized}`,
  ]);
  const sales = await prisma.sellAccount.findMany({
    where: { id: { in: saleIds }, deletedAt: null },
    include: { payments: { orderBy: { paymentDate: 'asc' } }, refunds: { orderBy: { createdAt: 'asc' } } },
    orderBy: { createdAt: 'asc' },
  });
  const rtos = await prisma.vehicleRtoRecord.findMany({
    where: { OR: [{ id: { in: rtoIds } }, { sellAccountId: { in: sales.map((sale) => sale.id) } }] },
    include: { transferTasks: { orderBy: { sortOrder: 'asc' } } },
    orderBy: { createdAt: 'asc' },
  });
  const listingIds = Array.from(new Set([
    ...verified.map((row) => row.listingId),
    ...rtos.map((rto) => rto.listingId),
    ...sales.flatMap((sale) => [sale.listingId, sale.releasedListingId]),
  ].filter((id): id is string => Boolean(id))));
  const listings = await prisma.listing.findMany({
    where: { id: { in: listingIds } },
    include: {
      category: { select: { name: true } }, brand: { select: { name: true } }, model: { select: { name: true } },
      partner: { select: { name: true, mobile: true, role: true } },
      media: { orderBy: { createdAt: 'asc' } },
      vehicleVerification: true,
      paymentSubmissions: { where: { status: { in: ['APPROVED', 'PAID'] } }, orderBy: { createdAt: 'asc' } },
    },
  });
  const vault = await prisma.finVaultDocument.findMany({
    where: { isArchived: false, OR: [{ entityId: { in: [...sales.map((sale) => sale.id), ...listingIds] } }, { tags: { has: normalized } }] },
    orderBy: { createdAt: 'asc' },
  });
  if (!sales.length && !rtos.length && !listings.length) throw new VehicleDocsError('No records found for this vehicle number.', 404);
  return { normalized, sales, rtos, listings, vault };
};

type Loaded = Awaited<ReturnType<typeof loadVehicle>>;

const collectDocs = (vehicle: Loaded): VehicleDoc[] => {
  const docs: VehicleDoc[] = [];
  // With more than one sale on the number (cancelled, then resold) labels name the record.
  const multipleSales = vehicle.sales.length > 1;
  for (const sale of vehicle.sales) {
    const suffix = multipleSales ? ` (${sale.recordNumber})` : '';
    const uploads = (sale.documents && typeof sale.documents === 'object' ? sale.documents : {}) as Record<string, unknown>;
    for (const slot of SALE_DOCUMENT_SLOTS) {
      const value = uploads[slot.key] as { fileUrl?: string; url?: string; absoluteUrl?: string; originalName?: string; fileName?: string; mimeType?: string; size?: number } | string | null | undefined;
      const url = typeof value === 'string' ? value : value?.fileUrl || value?.url || value?.absoluteUrl;
      if (!url) continue;
      const original = typeof value === 'object' && value ? value.originalName || value.fileName : null;
      const fileName = safeName(`${slot.label} - ${sale.recordNumber}${path.extname(original || baseName(url)) || '.pdf'}`);
      docs.push(storedDoc({
        id: `sale-${sale.id}-${slot.key}`, section: slot.section, checklistKey: slot.key, label: `${slot.label}${suffix}`, url, fileName,
        mimeType: (typeof value === 'object' && value?.mimeType) || guessMime(original || baseName(url), 'application/pdf'),
        size: typeof value === 'object' && value?.size ? Number(value.size) : null, date: isoDate(sale.updatedAt),
      }));
    }
    if (sale.invoiceNumber) {
      docs.push(generatedDoc({ id: `sale-${sale.id}-invoice`, section: 'Invoices & Payments', checklistKey: 'invoice', label: `Bill of Supply ${sale.invoiceNumber}`, fileName: `Bill of Supply ${safeName(sale.invoiceNumber)}.pdf`, date: isoDate(sale.invoiceGeneratedAt), build: () => buildVehicleSaleInvoicePdf(sale.id) }));
    }
    for (const payment of sale.payments) {
      if (payment.side !== 'PURCHASER_RECEIPT' || payment.receiptStatus !== 'ISSUED' || !payment.receiptNumber) continue;
      docs.push(generatedDoc({ id: `receipt-${payment.id}`, section: 'Invoices & Payments', checklistKey: 'receipts', label: `Money receipt ${payment.receiptNumber}`, fileName: `Receipt ${safeName(payment.receiptNumber)}.pdf`, date: isoDate(payment.paymentDate), build: () => buildVehicleSalePaymentReceiptPdf(payment.id) }));
    }
    if (sale.creditNoteNumber) {
      docs.push(generatedDoc({ id: `sale-${sale.id}-credit-note`, section: 'Invoices & Payments', checklistKey: 'credit-note', label: `Credit note ${sale.creditNoteNumber}`, fileName: `Credit Note ${safeName(sale.creditNoteNumber)}.pdf`, date: isoDate(sale.creditNoteDate), build: () => buildSellAccountCreditNotePdf(sale.id) }));
    }
    for (const refund of sale.refunds) {
      if (!refund.refundNumber) continue;
      docs.push(generatedDoc({ id: `refund-${refund.id}`, section: 'Invoices & Payments', checklistKey: 'refunds', label: `Refund advice ${refund.refundNumber}`, fileName: `Refund ${safeName(refund.refundNumber)}.pdf`, date: isoDate(refund.createdAt), build: () => buildSellAccountRefundAdvicePdf(sale.id, refund.id) }));
    }
  }
  for (const rto of vehicle.rtos) {
    for (const task of rto.transferTasks) {
      readTaskDocuments(task.documents).forEach((file, index, files) => {
        const label = files.length > 1 ? `${task.label} (${index + 1})` : task.label;
        docs.push(storedDoc({
          id: `rto-task-${task.id}-${file.id}`, section: 'RTO Transfer', checklistKey: `rto-${task.taskKey}`, label, url: file.fileUrl,
          fileName: safeName(`${label}${path.extname(file.fileName) || '.pdf'}`), mimeType: file.mimeType || guessMime(file.fileName, 'application/pdf'),
          size: file.size || null, date: file.uploadedAt.slice(0, 10),
        }));
      });
    }
  }
  for (const listing of vehicle.listings) {
    listing.media.forEach((media, index) => {
      const name = baseName(media.url);
      const mimeType = /video/i.test(media.type) ? guessMime(name, 'video/mp4') : guessMime(name, 'image/jpeg');
      const isVideo = mimeType.startsWith('video/');
      const label = `${media.slot ? media.slot.replace(/[_-]+/g, ' ') : isVideo ? 'Video' : 'Photo'}${media.isFeatured ? ' (cover)' : ''}`;
      docs.push(storedDoc({ id: `media-${media.id}`, section: 'Listing & Photos', checklistKey: isVideo ? 'listing-video' : 'listing-photos', label, url: media.url, fileName: safeName(`${String(index + 1).padStart(2, '0')} ${label}${path.extname(name) || (isVideo ? '.mp4' : '.jpg')}`), mimeType, size: null, date: isoDate(media.createdAt) }));
    });
    for (const payment of listing.paymentSubmissions) {
      if (!payment.receiptUrl) continue;
      const name = baseName(payment.receiptUrl);
      docs.push(storedDoc({ id: `listing-payment-${payment.id}`, section: 'Invoices & Payments', checklistKey: 'website-payment', label: `Website payment proof (${payment.method})`, url: payment.receiptUrl, fileName: safeName(`Website payment proof ${payment.transactionRef || payment.id.slice(0, 8)}${path.extname(name) || '.pdf'}`), mimeType: guessMime(name, 'application/pdf'), size: null, date: isoDate(payment.createdAt) }));
    }
  }
  for (const file of vehicle.vault) {
    const name = file.fileName || baseName(file.fileUrl);
    docs.push(storedDoc({ id: `vault-${file.id}`, section: 'Other', checklistKey: null, label: file.title, url: file.fileUrl, fileName: safeName(`${file.title}${path.extname(name)}`), mimeType: file.mimeType || guessMime(name), size: file.size, date: isoDate(file.createdAt) }));
  }
  return docs;
};

/** RTO tasks behind the checklist: the record linked to the active sale, else the latest one. */
const checklistTasks = (vehicle: Loaded) => {
  const sale = vehicle.sales.find((row) => !row.cancelledAt) ?? vehicle.sales[vehicle.sales.length - 1] ?? null;
  const rto = vehicle.rtos.find((row) => row.sellAccountId === sale?.id) ?? vehicle.rtos[vehicle.rtos.length - 1] ?? null;
  return rto?.transferTasks ?? [];
};

const checklistFor = (vehicle: Loaded, docs: VehicleDoc[]) => buildChecklist(docs, checklistTasks(vehicle));

const summarize = (vehicle: Loaded) => {
  const sale = vehicle.sales.find((row) => !row.cancelledAt) ?? vehicle.sales[vehicle.sales.length - 1] ?? null;
  const listing = vehicle.listings[0] ?? null;
  const rto = vehicle.rtos.find((row) => row.sellAccountId === sale?.id) ?? vehicle.rtos[vehicle.rtos.length - 1] ?? null;
  const verification = vehicle.listings.find((row) => row.vehicleVerification)?.vehicleVerification ?? null;
  const pricing = listing ? getListingPricing(listing) : null;
  return {
    vehicleNumber: sale?.vehicleNumber || rto?.vehicleNumber || verification?.verifiedRegistrationNumber || vehicle.normalized,
    title: sale?.listingTitle || listing?.title || [rto?.brandName, rto?.vehicleModel].filter(Boolean).join(' ') || 'Vehicle',
    category: sale?.vehicleType || listing?.category?.name || rto?.vehicleType || null,
    brand: sale?.brandName || listing?.brand?.name || rto?.brandName || null,
    model: sale?.vehicleModel || listing?.model?.name || rto?.vehicleModel || null,
    year: listing?.manufacturingYear ?? null,
    hours: listing?.operatingHours ?? rto?.hourRunning ?? null,
    chassisNumber: sale?.chassisNumber || verification?.verifiedChassisNumber || null,
    engineNumber: listing?.engineNumber || verification?.verifiedEngineNumber || null,
    location: listing ? `${listing.locationCity}, ${listing.locationState}` : null,
    owner: sale?.ownerName || listing?.ownerName || rto?.customerName || null,
    listing: listing ? { id: listing.id, title: listing.title, status: listing.status, partner: listing.partner?.name ?? null, sellerPrice: pricing?.sellerPrice ?? null, finalPrice: pricing?.finalPrice ?? null, soldAt: isoDate(listing.soldAt) } : null,
    sales: vehicle.sales.map((row) => {
      const received = row.payments.filter((payment) => payment.side === 'PURCHASER_RECEIPT' && payment.receiptStatus === 'ISSUED').reduce((sum, payment) => sum + Number(payment.amount), 0);
      const paidToSeller = row.payments.filter((payment) => payment.side === 'SELLER_PAYMENT').reduce((sum, payment) => sum + Number(payment.amount), 0);
      return {
        id: row.id, recordNumber: row.recordNumber, dealStatus: row.dealStatus, isDraft: row.isDraft, isLocked: row.isLocked, cancelledAt: isoDate(row.cancelledAt),
        sourceType: row.sourceType, sellerName: row.sellerName, sellerNumber: row.sellerNumber, purchaserName: row.purchaserName, purchaserNumber: row.purchaserNumber,
        purchaserCity: row.purchaserCity, sellDate: isoDate(row.sellDate), purchaseAmount: Number(row.purchaseAmount), sellAmount: Number(row.sellAmount),
        received, paidToSeller, invoiceNumber: row.invoiceNumber, creditNoteNumber: row.creditNoteNumber,
      };
    }),
    rto: rto ? {
      id: rto.id, status: rto.rtoStatus, office: rto.rtoOffice, agent: rto.rtoAgentName, hirePurchase: rto.hirePurchaseStatus, financer: rto.financerName,
      tax: [rto.taxStatus, isoDate(rto.taxValidUntil)], fitness: [rto.fitnessStatus, isoDate(rto.fitnessValidUntil)], insurance: [rto.insuranceStatus, isoDate(rto.insuranceValidUntil)],
      puc: [rto.pucStatus, isoDate(rto.pucValidUntil)], hsrp: [rto.hsrpStatus, rto.hsrpNumber], tasks: rto.transferTasks.map((task) => ({ label: task.label, status: task.status, remark: task.remark })),
    } : null,
  };
};

const publicDoc = ({ read: _read, ...doc }: VehicleDoc) => doc;

// ---------------------------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------------------------

/** Every vehicle number known to Sold Vehicles, RTO records or listing verification, with counts. */
export const listVehicleDocs = async (query: { q?: unknown }) => {
  const q = String(query.q ?? '').trim().toLowerCase();
  const [sales, rtos, verified] = await Promise.all([
    prisma.sellAccount.findMany({
      where: { deletedAt: null, vehicleNumber: { not: null } },
      select: { id: true, recordNumber: true, vehicleNumber: true, chassisNumber: true, listingTitle: true, brandName: true, vehicleModel: true, dealStatus: true, sellerName: true, purchaserName: true, ownerName: true, documents: true, invoiceNumber: true, creditNoteNumber: true, updatedAt: true, listingId: true, releasedListingId: true,
        payments: { where: { side: 'PURCHASER_RECEIPT', receiptStatus: 'ISSUED' }, select: { id: true } }, refunds: { where: { refundNumber: { not: null } }, select: { id: true } } },
    }),
    prisma.vehicleRtoRecord.findMany({ select: { vehicleNumber: true, listingId: true, rtoStatus: true, brandName: true, vehicleModel: true, customerName: true, updatedAt: true, transferTasks: { select: { documents: true } } } }),
    prisma.listingVehicleVerification.findMany({ where: { verifiedRegistrationNumber: { not: null } }, select: { listingId: true, verifiedRegistrationNumber: true, verifiedChassisNumber: true, verifiedEngineNumber: true } }),
  ]);
  type Row = { vehicleNumber: string; title: string; owner: string | null; buyer: string | null; chassisNumber: string | null; engineNumber: string | null; dealStatus: string | null; rtoStatus: string | null; listingStatus: string | null; listingIds: Set<string>; documents: number; updatedAt: Date };
  const rows = new Map<string, Row>();
  const row = (number: string, title: string, updatedAt: Date) => {
    const key = normalizeVehicleNumber(number);
    if (key.length < 4) return null;
    const existing = rows.get(key) ?? { vehicleNumber: number.toUpperCase(), title, owner: null, buyer: null, chassisNumber: null, engineNumber: null, dealStatus: null, rtoStatus: null, listingStatus: null, listingIds: new Set<string>(), documents: 0, updatedAt };
    if (updatedAt > existing.updatedAt) existing.updatedAt = updatedAt;
    rows.set(key, existing);
    return existing;
  };
  for (const sale of sales) {
    const item = row(sale.vehicleNumber!, sale.listingTitle || [sale.brandName, sale.vehicleModel].filter(Boolean).join(' ') || 'Vehicle', sale.updatedAt);
    if (!item) continue;
    item.owner ||= sale.ownerName || sale.sellerName;
    item.buyer ||= sale.purchaserName;
    item.chassisNumber ||= sale.chassisNumber;
    item.dealStatus = sale.dealStatus;
    const uploads = (sale.documents && typeof sale.documents === 'object' ? sale.documents : {}) as Record<string, unknown>;
    item.documents += SALE_DOCUMENT_SLOTS.filter((slot) => Boolean(uploads[slot.key])).length + (sale.invoiceNumber ? 1 : 0) + (sale.creditNoteNumber ? 1 : 0) + sale.payments.length + sale.refunds.length;
    for (const id of [sale.listingId, sale.releasedListingId]) if (id) item.listingIds.add(id);
  }
  for (const rto of rtos) {
    const item = row(rto.vehicleNumber, [rto.brandName, rto.vehicleModel].filter(Boolean).join(' ') || 'Vehicle', rto.updatedAt);
    if (!item) continue;
    item.rtoStatus = rto.rtoStatus;
    item.owner ||= rto.customerName;
    item.documents += rto.transferTasks.reduce((sum, task) => sum + readTaskDocuments(task.documents).length, 0);
    if (rto.listingId) item.listingIds.add(rto.listingId);
  }
  for (const verification of verified) {
    const item = row(verification.verifiedRegistrationNumber!, 'Vehicle', new Date(0));
    if (!item) continue;
    item.listingIds.add(verification.listingId);
    item.chassisNumber ||= verification.verifiedChassisNumber;
    item.engineNumber ||= verification.verifiedEngineNumber;
  }
  const listingIds = Array.from(new Set(Array.from(rows.values()).flatMap((item) => Array.from(item.listingIds))));
  const listings = listingIds.length
    ? await prisma.listing.findMany({ where: { id: { in: listingIds } }, select: { id: true, title: true, status: true, engineNumber: true, updatedAt: true, _count: { select: { media: true } } } })
    : [];
  const byId = new Map(listings.map((listing) => [listing.id, listing]));
  const result = Array.from(rows.values()).map((item) => {
    const linked = Array.from(item.listingIds).map((id) => byId.get(id)).filter((listing): listing is NonNullable<typeof listing> => Boolean(listing));
    const listing = linked[0];
    const updatedAt = [item.updatedAt, ...linked.map((entry) => entry.updatedAt)].reduce((latest, date) => (date > latest ? date : latest));
    return {
      vehicleNumber: item.vehicleNumber,
      title: item.title === 'Vehicle' && listing ? listing.title : item.title,
      owner: item.owner,
      buyer: item.buyer,
      // Same precedence as the detail page: sale chassis, then RC verification; listing engine, then RC verification.
      chassisNumber: item.chassisNumber,
      engineNumber: linked.find((entry) => entry.engineNumber)?.engineNumber || item.engineNumber,
      dealStatus: item.dealStatus,
      rtoStatus: item.rtoStatus,
      listingStatus: listing?.status ?? null,
      documents: item.documents + linked.reduce((sum, entry) => sum + entry._count.media, 0),
      updatedAt: updatedAt.toISOString(),
    };
  });
  return result
    .filter((item) => !q
      || [item.vehicleNumber, item.title, item.owner, item.buyer, item.chassisNumber, item.engineNumber].some((value) => String(value ?? '').toLowerCase().includes(q))
      || (normalizeVehicleNumber(q).length > 2 && [item.vehicleNumber, item.chassisNumber, item.engineNumber].some((value) => normalizeVehicleNumber(value).includes(normalizeVehicleNumber(q)))))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
};

export const getVehicleDocs = async (number: string) => {
  const vehicle = await loadVehicle(number);
  const docs = collectDocs(vehicle);
  return { ...summarize(vehicle), sections: VEHICLE_DOC_SECTIONS, checklist: checklistFor(vehicle, docs), documents: docs.map(publicDoc) };
};

export const readVehicleDoc = async (number: string, docId: string) => {
  const vehicle = await loadVehicle(number);
  const doc = collectDocs(vehicle).find((item) => item.id === docId);
  if (!doc) throw new VehicleDocsError('Document not found for this vehicle.', 404);
  return doc.read();
};

// ---------------------------------------------------------------------------------------------
// Vehicle details PDF and ZIP
// ---------------------------------------------------------------------------------------------

const money = (value: number | null | undefined) => (value === null || value === undefined ? '-' : `Rs ${Number(value).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`);
const label = (value: unknown) => (value ? String(value).replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (char) => char.toUpperCase()) : '-');

const renderDetailsPdf = async (summary: ReturnType<typeof summarize>, docs: VehicleDoc[], checklist: ChecklistItem[], company: string) => new Promise<Buffer>((resolve, reject) => {
  const doc = new PDFDocument({ size: 'A4', margin: 40, info: { Title: `Vehicle details ${summary.vehicleNumber}` } });
  const chunks: Buffer[] = [];
  doc.on('data', (chunk: Buffer) => chunks.push(chunk));
  doc.on('end', () => resolve(Buffer.concat(chunks)));
  doc.on('error', reject);
  const width = doc.page.width - 80;
  const heading = (text: string) => {
    if (doc.y > doc.page.height - 120) doc.addPage();
    doc.moveDown(0.6).font('Helvetica-Bold').fontSize(11.5).fillColor('#0f172a').text(text);
    doc.moveTo(40, doc.y + 2).lineTo(40 + width, doc.y + 2).strokeColor('#f59e0b').lineWidth(1).stroke();
    doc.moveDown(0.4);
  };
  const rows = (pairs: Array<[string, unknown]>) => {
    for (const [key, value] of pairs) {
      if (doc.y > doc.page.height - 60) doc.addPage();
      const y = doc.y;
      doc.font('Helvetica').fontSize(9).fillColor('#64748b').text(key, 40, y, { width: 150 });
      doc.font('Helvetica').fontSize(9.5).fillColor('#0f172a').text(value === null || value === undefined || value === '' ? '-' : String(value), 195, y, { width: width - 155 });
      doc.moveDown(0.25);
    }
  };

  doc.font('Helvetica-Bold').fontSize(18).fillColor('#0f172a').text(summary.vehicleNumber);
  doc.font('Helvetica').fontSize(11).fillColor('#334155').text(summary.title);
  doc.fontSize(8.5).fillColor('#64748b').text(`${company} - Vehicle details generated on ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`);

  heading('Vehicle');
  rows([['Registration number', summary.vehicleNumber], ['Category', summary.category], ['Make / model', [summary.brand, summary.model].filter(Boolean).join(' ')], ['Year of manufacture', summary.year], ['Hours running', summary.hours], ['Chassis number', summary.chassisNumber], ['Engine number', summary.engineNumber], ['Owner (as recorded)', summary.owner], ['Location', summary.location]]);

  if (summary.listing) {
    heading('Listing');
    rows([['Title', summary.listing.title], ['Status', label(summary.listing.status)], ['Listed by', summary.listing.partner], ['Seller price', money(summary.listing.sellerPrice)], ['Price shown to buyers', money(summary.listing.finalPrice)], ['Sold on', summary.listing.soldAt]]);
  }

  for (const sale of summary.sales) {
    heading(`Sale ${sale.recordNumber}${sale.cancelledAt ? ' (cancelled)' : sale.isDraft ? ' (draft)' : ''}`);
    rows([
      ['Deal status', label(sale.dealStatus)], ['Source', label(sale.sourceType)], ['Seller', [sale.sellerName, sale.sellerNumber].filter(Boolean).join(' - ')],
      ['Buyer', [sale.purchaserName, sale.purchaserNumber, sale.purchaserCity].filter(Boolean).join(' - ')], ['Sale date', sale.sellDate],
      ['Purchase amount', money(sale.purchaseAmount)], ['Sale amount', money(sale.sellAmount)], ['Received from buyer', money(sale.received)], ['Paid to seller', money(sale.paidToSeller)],
      ['Bill of Supply', sale.invoiceNumber], ['Credit note', sale.creditNoteNumber], ['Cancelled on', sale.cancelledAt],
    ]);
  }

  if (summary.rto) {
    const pair = ([status, extra]: Array<string | null>) => [label(status), extra].filter((part) => part && part !== '-').join(' - ');
    heading('RTO and compliance');
    rows([
      ['RTO status', label(summary.rto.status)], ['RTO office', summary.rto.office], ['RTO agent', summary.rto.agent], ['Hire purchase', [label(summary.rto.hirePurchase), summary.rto.financer].filter(Boolean).join(' - ')],
      ['Tax', pair(summary.rto.tax)], ['Fitness', pair(summary.rto.fitness)], ['Insurance', pair(summary.rto.insurance)], ['PUC', pair(summary.rto.puc)], ['HSRP', pair(summary.rto.hsrp)],
    ]);
    if (summary.rto.tasks.length) {
      doc.moveDown(0.3).font('Helvetica-Bold').fontSize(9.5).fillColor('#0f172a').text('Ownership transfer checklist');
      rows(summary.rto.tasks.map((task) => [task.label, `${label(task.status)}${task.remark ? ` - ${task.remark}` : ''}`]));
    }
  }

  const available = checklist.filter((item) => item.state === 'AVAILABLE').length;
  heading(`Document checklist (${available} of ${checklist.length} available, ${docs.length} files)`);
  const byId = new Map(docs.map((item) => [item.id, item]));
  for (const section of VEHICLE_DOC_SECTIONS) {
    const items = checklist.filter((item) => item.section === section);
    const extras = docs.filter((item) => item.section === section && !item.checklistKey);
    if (!items.length && !extras.length) continue;
    doc.moveDown(0.2).font('Helvetica-Bold').fontSize(9.5).fillColor('#0f172a').text(section);
    rows(items.map((item): [string, unknown] => {
      const note = item.note ? ` - ${item.note}` : '';
      if (item.state === 'NOT_REQUIRED') return [item.label, `Not required${note}`];
      if (item.state === 'NA') return [item.label, `NA${note}`];
      const files = item.docIds.map((id) => byId.get(id)).filter((file): file is VehicleDoc => Boolean(file));
      const listed = files.length > 3 ? `${files.length} files` : files.map((file) => `${file.fileName}${file.isVideo ? ' (video - not in ZIP)' : ''}`).join(', ');
      return [item.label, `Available${note} - ${listed}`];
    }));
    if (extras.length) rows(extras.map((item) => [item.label, item.fileName]));
    else if (section === 'Other') rows([['Other documents', 'NA']]);
  }
  doc.end();
});

const companyName = async () => (await prisma.finCompanyProfile.findUnique({ where: { id: 'default' }, select: { legalName: true } }).catch(() => null))?.legalName || 'JCB Exchange';

export const buildVehicleDetailsPdf = async (number: string) => {
  const vehicle = await loadVehicle(number);
  const summary = summarize(vehicle);
  const docs = collectDocs(vehicle);
  const buffer = await renderDetailsPdf(summary, docs, checklistFor(vehicle, docs), await companyName());
  return { buffer, fileName: `${safeName(summary.vehicleNumber)} - Vehicle Details.pdf` };
};

/** Validates a `?section=` value from the URL; empty means the whole vehicle. */
export const parseDocSection = (value: unknown): VehicleDocSection | null => {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) return null;
  const section = VEHICLE_DOC_SECTIONS.find((item) => item.toLowerCase() === text.toLowerCase());
  if (!section) throw new VehicleDocsError('Unknown document section.');
  return section;
};

/** Throws before any ZIP headers are sent when the vehicle (or the requested section) has nothing to zip. */
export const assertZipHasFiles = async (number: string, section: VehicleDocSection | null) => {
  const vehicle = await loadVehicle(number);
  if (section && !collectDocs(vehicle).some((item) => item.section === section && !item.isVideo)) {
    throw new VehicleDocsError(`No ${section} files for this vehicle.`, 404);
  }
};

/**
 * Writes a ZIP to `output`: the whole vehicle (details PDF plus one folder per section) or, with `section`,
 * only that section's files. Videos are left out. Files that cannot be read are listed in "MISSING FILES.txt"
 * instead of breaking the download.
 */
export const writeVehicleDocsZip = async (number: string, output: NodeJS.WritableStream, section: VehicleDocSection | null = null) => {
  const vehicle = await loadVehicle(number);
  const summary = summarize(vehicle);
  const allDocs = collectDocs(vehicle);
  const docs = section ? allDocs.filter((item) => item.section === section) : allDocs;
  const archive = archiver('zip', { zlib: { level: 6 } });
  const done = new Promise<void>((resolve, reject) => {
    archive.on('error', reject);
    archive.on('end', () => resolve());
  });
  archive.pipe(output);
  if (!section) archive.append(await renderDetailsPdf(summary, allDocs, checklistFor(vehicle, allDocs), await companyName()), { name: '00 Vehicle Details.pdf' });
  const used = new Set<string>();
  const missing: string[] = [];
  let included = 0;
  for (const item of docs) {
    if (item.isVideo) continue;
    try {
      const file = await item.read();
      const folder = section ? '' : `${item.section}/`;
      let name = `${folder}${safeName(file.fileName)}`;
      for (let copy = 2; used.has(name.toLowerCase()); copy += 1) name = `${folder}${safeName(file.fileName).replace(/(\.[^.]+)?$/, ` (${copy})$1`)}`;
      used.add(name.toLowerCase());
      archive.append(file.buffer, { name });
      included += 1;
    } catch (error) {
      missing.push(`${item.section} - ${item.label}: ${error instanceof Error ? error.message : 'could not be read'}`);
    }
  }
  if (missing.length) archive.append(`These files could not be added:\r\n\r\n${missing.join('\r\n')}\r\n`, { name: 'MISSING FILES.txt' });
  await archive.finalize();
  await done;
  return { vehicleNumber: summary.vehicleNumber, section, included, missing: missing.length, skippedVideos: docs.filter((item) => item.isVideo).length };
};

export const vehicleZipFileName = (number: string, section: VehicleDocSection | null = null) =>
  `${safeName(normalizeVehicleNumber(number))} - ${section ? `${safeName(section)} ` : ''}Documents.zip`;
