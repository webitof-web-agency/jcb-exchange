import assert from 'node:assert/strict';
import test from 'node:test';
import { buildSoldVehicleDocumentActions } from './soldVehicleDocumentActions.service';

test('builds exact Sold Vehicle actions for every generated and stored document family', () => {
  const actions = buildSoldVehicleDocumentActions({
    dealId: '32e28d69-5b6e-41b8-a1dd-850528f6ad09',
    recordNumber: 'SA-2026-001',
    vehicleNumber: 'CG04AB1234',
    invoiceNumber: 'JCBX/SV/2026-27/0001',
    creditNoteNumber: 'JCBX/CN/2026-27/0001',
    payments: [{ id: '42e28d69-5b6e-41b8-a1dd-850528f6ad09', side: 'PURCHASER_RECEIPT', receiptStatus: 'ISSUED', receiptNumber: 'JCB/RAIPUR/SAL/26-27/0001' }],
    refunds: [{ id: '52e28d69-5b6e-41b8-a1dd-850528f6ad09', refundNumber: 'JCB/RAIPUR/RFD/26-27/0001', status: 'PAID' }],
    accountDocuments: [
      { documentType: 'purchaseDeed', hasFile: true, fileName: 'purchase-deed.pdf', mimeType: 'application/pdf' },
      { documentType: 'sellAadhaarCard', hasFile: true, fileName: 'buyer-aadhaar.pdf', mimeType: 'application/pdf' },
    ],
    rto: { id: '62e28d69-5b6e-41b8-a1dd-850528f6ad09', tasks: [{ id: 'task-1', label: 'RC Transfer', documents: [{ id: 'rto-file-1', fileName: 'rc.pdf', hasFile: true, mimeType: 'application/pdf' }] }] },
    listingMedia: [{ id: 'media-1', hasFile: true, type: 'IMAGE', fileName: 'front.jpg', mimeType: 'image/jpeg' }],
    websitePayments: [{ id: 'advance-1', hasReceipt: true, fileName: 'advance.pdf', mimeType: 'application/pdf' }],
  });

  const urls = actions.map((action) => action.url);
  assert.ok(urls.some((url) => url.endsWith('/invoice')));
  assert.ok(urls.some((url) => url.includes('/payments/42e28d69-5b6e-41b8-a1dd-850528f6ad09/receipt')));
  assert.ok(urls.some((url) => url.endsWith('/credit-note')));
  assert.ok(urls.some((url) => url.includes('/refunds/52e28d69-5b6e-41b8-a1dd-850528f6ad09/advice')));
  assert.ok(urls.some((url) => url.endsWith('/delivery-challan')));
  assert.ok(urls.some((url) => url.endsWith('/transfer-certificate')));
  assert.ok(urls.some((url) => url.includes('/files/sale-32e28d69-5b6e-41b8-a1dd-850528f6ad09-purchaseDeed')));
  assert.ok(urls.some((url) => url.includes('/files/rto-task-task-1-rto-file-1')));
  assert.ok(urls.some((url) => url.includes('/files/media-media-1')));
  assert.ok(urls.some((url) => url.includes('/files/listing-payment-advance-1')));
  assert.ok(actions.every((action) => action.downloadable));
});

test('does not create files for draft/unavailable or malformed document sources', () => {
  const actions = buildSoldVehicleDocumentActions({
    dealId: '32e28d69-5b6e-41b8-a1dd-850528f6ad09',
    recordNumber: 'SA-2026-001',
    vehicleNumber: 'CG04AB1234',
    invoiceNumber: null,
    creditNoteNumber: null,
    payments: [{ id: 'payment-1', side: 'PURCHASER_RECEIPT', receiptStatus: 'DRAFT', receiptNumber: null }],
    refunds: [{ id: 'refund-1', refundNumber: null, status: 'REQUESTED' }],
    accountDocuments: [{ documentType: 'purchaseDeed', hasFile: false, fileName: 'missing.pdf', mimeType: 'application/pdf' }],
    rto: null,
    listingMedia: [{ id: 'media-1', hasFile: false, type: 'IMAGE', fileName: 'missing.jpg', mimeType: 'image/jpeg' }],
    websitePayments: [{ id: 'advance-1', hasReceipt: false, fileName: 'missing.pdf', mimeType: 'application/pdf' }],
  });

  assert.equal(actions.filter((action) => action.label.includes('Invoice') || action.label.includes('Receipt') || action.label.includes('Refund') || action.label.includes('Credit')).length, 0);
  assert.equal(actions.some((action) => action.url.includes('missing')), false);
});
