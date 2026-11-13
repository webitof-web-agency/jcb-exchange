import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getReceiptDocumentUrl,
  getReceiptMediaType,
  getReceiptThumbnailUrl,
  isSafeReceiptUrl,
  shouldMaskDriveViewerControls,
} from './receiptMedia.mjs';

test('classifies uploaded PDF receipts from their MIME type', () => {
  assert.equal(getReceiptMediaType('https://drive.google.com/uc?id=receipt-id', 'application/pdf'), 'pdf');
});

test('classifies uploaded image receipts from their MIME type', () => {
  assert.equal(getReceiptMediaType('https://drive.google.com/uc?id=receipt-id', 'image/jpeg'), 'image');
});

test('uses the file extension when a legacy receipt has no MIME type', () => {
  assert.equal(getReceiptMediaType('https://api.example.com/uploads/receipt.pdf'), 'pdf');
  assert.equal(getReceiptMediaType('https://api.example.com/uploads/receipt.webp'), 'image');
});

test('treats an extensionless legacy Drive receipt as a document', () => {
  assert.equal(getReceiptMediaType('https://drive.google.com/uc?id=legacy-receipt-id'), 'document');
});

test('rejects unsafe receipt preview URLs', () => {
  assert.equal(isSafeReceiptUrl('javascript:alert(1)'), false);
  assert.equal(isSafeReceiptUrl('https://drive.google.com/uc?id=receipt-id'), true);
});

test('uses Google Drive embedded preview URLs for legacy Drive receipts', () => {
  assert.equal(
    getReceiptDocumentUrl('https://drive.google.com/uc?id=legacy-receipt-id'),
    'https://drive.google.com/file/d/legacy-receipt-id/preview',
  );
});

test('uses a Google Drive thumbnail for an inline legacy receipt preview', () => {
  // Without an API URL the preview falls back to Drive's own thumbnail.
  const saved = process.env.NEXT_PUBLIC_API_URL;
  delete process.env.NEXT_PUBLIC_API_URL;
  try {
    assert.equal(
      getReceiptThumbnailUrl('https://drive.google.com/uc?id=legacy-receipt-id'),
      'https://drive.google.com/thumbnail?id=legacy-receipt-id&sz=w2000',
    );
  } finally {
    if (saved !== undefined) process.env.NEXT_PUBLIC_API_URL = saved;
  }
});

test('uses the API media proxy for a legacy Drive receipt when the API URL is set', () => {
  const saved = process.env.NEXT_PUBLIC_API_URL;
  process.env.NEXT_PUBLIC_API_URL = 'https://api.example.test/api';
  try {
    assert.equal(
      getReceiptThumbnailUrl('https://drive.google.com/uc?id=legacy-receipt-id'),
      'https://api.example.test/api/documents/upload/public/listing-media/drive/legacy-receipt-id',
    );
  } finally {
    if (saved === undefined) delete process.env.NEXT_PUBLIC_API_URL;
    else process.env.NEXT_PUBLIC_API_URL = saved;
  }
});

test('masks native Drive viewer controls when a receipt is embedded', () => {
  assert.equal(
    shouldMaskDriveViewerControls('https://drive.google.com/file/d/legacy-receipt-id/preview'),
    true,
  );
  assert.equal(shouldMaskDriveViewerControls('https://files.example.com/receipt.pdf'), false);
});
