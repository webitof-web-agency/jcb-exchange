import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getReceiptDocumentUrl,
  getReceiptPreviewMode,
  getReceiptPreviewUrl,
  shouldMaskDriveViewerControls,
} from './receiptPreview.mjs';

test('uses an inline image preview for extensionless Google Drive receipts', () => {
  const receiptUrl = 'https://drive.google.com/uc?id=legacy-receipt-id';

  assert.equal(getReceiptPreviewMode(receiptUrl), 'image');
  assert.equal(
    getReceiptPreviewUrl(receiptUrl, receiptUrl),
    'https://drive.google.com/thumbnail?id=legacy-receipt-id&sz=w2000',
  );
});

test('uses an embedded document preview for PDF receipts', () => {
  const receiptUrl = 'https://api.example.com/uploads/receipt.pdf';

  assert.equal(getReceiptPreviewMode(receiptUrl), 'document');
  assert.equal(getReceiptDocumentUrl(receiptUrl, receiptUrl), receiptUrl);
});

test('converts Drive documents to the embedded preview URL', () => {
  assert.equal(
    getReceiptDocumentUrl('https://drive.google.com/uc?id=legacy-receipt-id', 'fallback'),
    'https://drive.google.com/file/d/legacy-receipt-id/preview',
  );
});

test('masks native Drive viewer controls when a receipt is embedded', () => {
  assert.equal(
    shouldMaskDriveViewerControls('https://drive.google.com/file/d/legacy-receipt-id/preview'),
    true,
  );
  assert.equal(shouldMaskDriveViewerControls('https://files.example.com/receipt.pdf'), false);
});
