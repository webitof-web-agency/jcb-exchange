import { buildAiFileAction, type AiFileAction } from './aiUiActions.service';

type Source = Record<string, unknown>;

export type SoldVehicleDocumentActionInput = {
  dealId: string;
  recordNumber: string | null;
  vehicleNumber: string | null;
  isDraft?: boolean;
  cancelledAt?: unknown;
  completedAt?: unknown;
  invoiceNumber: string | null;
  creditNoteNumber: string | null;
  payments: Source[];
  refunds: Source[];
  accountDocuments: Source[];
  rto: { id: string; tasks: Source[] } | null;
  listingMedia: Source[];
  websitePayments: Source[];
};

const text = (value: unknown) => typeof value === 'string' && value.trim() ? value.trim() : null;
const fileName = (value: unknown, fallback: string) => text(value) || fallback;
const mimeType = (value: unknown, name: string) => {
  const explicit = text(value);
  if (explicit) return explicit;
  const lower = name.toLowerCase();
  if (lower.endsWith('.pdf')) return 'application/pdf';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.mp4')) return 'video/mp4';
  return 'application/octet-stream';
};

const knownAccountDocumentKeys = new Set([
  'purchaseDeed', 'purchaseAadhaarCard', 'purchasePanCard', 'purchaseGstCertificate',
  'sellDeed', 'sellAadhaarCard', 'sellPanCard', 'sellGstCertificate',
]);

const displayDocumentKey = (value: string) => value
  .replace(/([a-z])([A-Z])/g, '$1 $2')
  .replace(/\b\w/g, (character) => character.toUpperCase());

export const buildSoldVehicleDocumentActions = (input: SoldVehicleDocumentActionInput): AiFileAction[] => {
  const actions: AiFileAction[] = [];
  const seen = new Set<string>();
  const add = (label: string, name: string, type: string, url: string) => {
    if (seen.has(url)) return;
    const action = buildAiFileAction({ label, fileName: name, mimeType: type, url });
    if (action) {
      actions.push(action);
      seen.add(url);
    }
  };

  const dealPrefix = `/api/recruitment/admin/sell-accounts/${encodeURIComponent(input.dealId)}`;
  const recordLabel = input.recordNumber || 'Sold vehicle';
  if (text(input.invoiceNumber)) add(`${recordLabel} · Bill of Supply`, `${input.invoiceNumber}.pdf`, 'application/pdf', `${dealPrefix}/invoice`);
  if (text(input.creditNoteNumber)) add(`${recordLabel} · Credit note`, `${input.creditNoteNumber}.pdf`, 'application/pdf', `${dealPrefix}/credit-note`);
  // Delivery challan — always available as a generated document for the deal
  add(`${recordLabel} · Delivery challan`, `Delivery Challan ${recordLabel}.pdf`, 'application/pdf', `${dealPrefix}/delivery-challan`);

  for (const payment of input.payments) {
    const id = text(payment.id);
    if (!id || payment.side !== 'PURCHASER_RECEIPT' || payment.receiptStatus !== 'ISSUED') continue;
    const number = text(payment.receiptNumber) || id;
    add(`${recordLabel} · Money receipt ${number}`, `Money Receipt ${number}.pdf`, 'application/pdf', `${dealPrefix}/payments/${encodeURIComponent(id)}/receipt`);
  }
  for (const refund of input.refunds) {
    const id = text(refund.id);
    const number = text(refund.refundNumber);
    if (!id || !number || refund.status !== 'PAID') continue;
    add(`${recordLabel} · Refund advice ${number}`, `Refund Advice ${number}.pdf`, 'application/pdf', `${dealPrefix}/refunds/${encodeURIComponent(id)}/advice`);
  }

  const vehicle = text(input.vehicleNumber);
  if (!vehicle) return actions;
  const encodedVehicle = encodeURIComponent(vehicle);
  add(`${vehicle} · Vehicle details`, `${vehicle} - Vehicle Details.pdf`, 'application/pdf', `/api/vehicle-docs/${encodedVehicle}/details.pdf?inline=1`);
  add(`${vehicle} · All documents ZIP`, `${vehicle} - Vehicle Documents.zip`, 'application/zip', `/api/vehicle-docs/${encodedVehicle}/zip`);

  for (const document of input.accountDocuments) {
    const key = text(document.documentType);
    if (!key || !knownAccountDocumentKeys.has(key) || document.hasFile !== true) continue;
    const name = fileName(document.fileName, `${key}.pdf`);
    add(`${recordLabel} · ${displayDocumentKey(key)}`, name, mimeType(document.mimeType, name), `/api/vehicle-docs/${encodedVehicle}/files/${encodeURIComponent(`sale-${input.dealId}-${key}`)}`);
  }

  if (input.rto?.id) {
    add(`${vehicle} · RTO transfer summary`, `Ownership Transfer ${vehicle}.pdf`, 'application/pdf', `/api/recruitment/admin/rto-records/${encodeURIComponent(input.rto.id)}/transfer-certificate`);
    for (const task of input.rto.tasks) {
      const taskId = text(task.id);
      const taskLabel = text(task.label) || 'RTO document';
      const documents = Array.isArray(task.documents) ? task.documents : [];
      for (const document of documents) {
        const documentId = text(document.id);
        if (!taskId || !documentId || document.hasFile !== true) continue;
        const name = fileName(document.fileName, `${taskLabel}.pdf`);
        add(`${vehicle} · ${taskLabel}`, name, mimeType(document.mimeType, name), `/api/vehicle-docs/${encodedVehicle}/files/${encodeURIComponent(`rto-task-${taskId}-${documentId}`)}`);
      }
    }
  }

  for (const media of input.listingMedia) {
    const id = text(media.id);
    if (!id || media.hasFile !== true) continue;
    const isVideo = String(media.type || '').toUpperCase().includes('VIDEO');
    const name = fileName(media.fileName, `${vehicle} vehicle ${isVideo ? 'video.mp4' : 'image.jpg'}`);
    add(`${vehicle} · Vehicle ${isVideo ? 'video' : 'image'}`, name, mimeType(media.mimeType || (isVideo ? 'video/mp4' : 'image/jpeg'), name), `/api/vehicle-docs/${encodedVehicle}/files/${encodeURIComponent(`media-${id}`)}`);
  }
  for (const payment of input.websitePayments) {
    const id = text(payment.id);
    if (!id || payment.hasReceipt !== true) continue;
    const name = fileName(payment.fileName, `${vehicle} website payment proof.pdf`);
    add(`${vehicle} · Website advance proof`, name, mimeType(payment.mimeType, name), `/api/vehicle-docs/${encodedVehicle}/files/${encodeURIComponent(`listing-payment-${id}`)}`);
  }

  return actions;
};
