import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createEmptySellAccountDocuments,
  getSellAccountDocumentKeys,
  normalizeSellAccountDocuments,
} from './sellAccountDocuments.mjs';

test('creates the three purchase and three sell PDF slots empty', () => {
  assert.deepEqual(createEmptySellAccountDocuments(), {
    purchaseAadhaarCard: null,
    purchasePanCard: null,
    purchaseGstCertificate: null,
    sellAadhaarCard: null,
    sellPanCard: null,
    sellGstCertificate: null,
  });
});

test('normalizes older sell account records without document fields', () => {
  assert.equal(normalizeSellAccountDocuments({}).purchasePanCard, null);
  assert.deepEqual(getSellAccountDocumentKeys('purchase'), [
    'purchaseAadhaarCard',
    'purchasePanCard',
    'purchaseGstCertificate',
  ]);
});

test('preserves uploaded document metadata for both deed sections', () => {
  const pdf = { fileUrl: '/documents/secure/drive-pdf-1', originalName: 'pan.pdf' };
  const documents = normalizeSellAccountDocuments({ purchasePanCard: pdf });

  assert.equal(documents.purchasePanCard.fileUrl, pdf.fileUrl);
  assert.equal(documents.purchasePanCard.originalName, pdf.originalName);
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
