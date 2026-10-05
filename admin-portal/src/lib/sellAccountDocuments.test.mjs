import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createEmptySellAccountDocuments,
  getSellAccountDocumentKeys,
  normalizeSellAccountDocuments,
  SELL_ACCOUNT_DOCUMENT_ACCEPT,
} from './sellAccountDocuments.mjs';

test('accepts PDF and common image formats for sell account documents', () => {
  assert.match(SELL_ACCOUNT_DOCUMENT_ACCEPT, /application\/pdf/);
  assert.match(SELL_ACCOUNT_DOCUMENT_ACCEPT, /image\/jpeg/);
  assert.match(SELL_ACCOUNT_DOCUMENT_ACCEPT, /image\/png/);
});

test('creates all purchase and sell document slots empty', () => {
  assert.deepEqual(createEmptySellAccountDocuments(), {
    purchaseDeed: null,
    purchaseAadhaarCard: null,
    purchasePanCard: null,
    purchaseGstCertificate: null,
    sellDeed: null,
    sellAadhaarCard: null,
    sellPanCard: null,
    sellGstCertificate: null,
  });
});

test('normalizes older sell account records without document fields', () => {
  assert.equal(normalizeSellAccountDocuments({}).purchasePanCard, null);
  assert.deepEqual(getSellAccountDocumentKeys('purchase'), [
    'purchaseDeed',
    'purchaseAadhaarCard',
    'purchasePanCard',
    'purchaseGstCertificate',
  ]);
});

test('preserves uploaded document metadata for both deed sections', () => {
  const image = {
    fileUrl: '/documents/secure/drive-image-1',
    originalName: 'pan.png',
    mimeType: 'image/png',
  };
  const documents = normalizeSellAccountDocuments({ purchasePanCard: image });

  assert.equal(documents.purchasePanCard.fileUrl, image.fileUrl);
  assert.equal(documents.purchasePanCard.originalName, image.originalName);
  assert.equal(documents.purchasePanCard.mimeType, image.mimeType);
  assert.equal(documents.sellPanCard, null);
});

test('preserves documents nested inside a stored sell account record', () => {
  const pdf = { fileUrl: '/documents/secure/drive-pdf-2', originalName: 'aadhaar.pdf' };
  const documents = normalizeSellAccountDocuments({ documents: { purchaseAadhaarCard: pdf } });

  assert.equal(documents.purchaseAadhaarCard.fileUrl, pdf.fileUrl);
  assert.equal(documents.purchaseAadhaarCard.originalName, pdf.originalName);
});

test('prefers the current nested document metadata over legacy top-level metadata', () => {
  const legacyPdf = { fileUrl: '/documents/secure/drive-old', originalName: 'old.pdf' };
  const currentPdf = { fileUrl: '/documents/secure/drive-current', originalName: 'current.pdf' };
  const documents = normalizeSellAccountDocuments({
    purchasePanCard: legacyPdf,
    documents: { purchasePanCard: currentPdf },
  });

  assert.equal(documents.purchasePanCard.fileUrl, currentPdf.fileUrl);
  assert.equal(documents.purchasePanCard.originalName, currentPdf.originalName);
});

test('normalizes legacy document URLs into displayable PDF metadata', () => {
  const documents = normalizeSellAccountDocuments({
    documents: { sellGstCertificate: '/api/documents/secure/drive-pdf-3' },
  });

  assert.equal(documents.sellGstCertificate.fileUrl, '/api/documents/secure/drive-pdf-3');
  assert.equal(documents.sellGstCertificate.originalName, 'drive-pdf-3');
});
