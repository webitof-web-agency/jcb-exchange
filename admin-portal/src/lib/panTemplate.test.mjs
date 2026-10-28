import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';

const previewSource = fs.readFileSync(new URL('../components/identityHub/PanTemplatePreview.tsx', import.meta.url), 'utf8');
const pageSource = fs.readFileSync(new URL('../components/identityHub/IdentityHubPage.tsx', import.meta.url), 'utf8');
const serviceSource = fs.readFileSync(new URL('../../../backend/src/services/panVerification.service.ts', import.meta.url), 'utf8');
const pdfSource = fs.readFileSync(new URL('../components/identityHub/PanTemplatePdfDocument.tsx', import.meta.url), 'utf8');

 test('PAN template preview uses the supplied asset and secure upload endpoint', () => {
  assert.match(previewSource, /\/images\/pancard\/pan-card-base-template\.jpg/);
  assert.match(previewSource, /\/pan-verification\/\$\{response\.record\.id\}\/template/);
  assert.match(previewSource, /Upload template/);
});

test('PAN result state is cleared from the UI after template upload', () => {
  assert.match(pageSource, /onUploaded=\{handlePanTemplateUploaded\}/);
  assert.match(pageSource, /const handlePanTemplateUploaded[\s\S]*setDob\(''\);\s*triggerHistoryRefresh\(\);\s*\};/);
  assert.match(pageSource, /setPan\(''\)/);
  assert.match(pageSource, /setFullName\(''\)/);
  assert.match(pageSource, /setDob\(''\)/);
  assert.match(previewSource, /onUploaded\(\{ \.\.\.result\.data, result: null \}\)/);
});

test('PAN template uses the current full input PAN and keeps fields below printed labels', () => {
  assert.match(previewSource, /panNumber\?: string/);
  assert.match(previewSource, /stringValue\(\s*panNumber,/);
  assert.match(previewSource, /fullName: \{ x: 58, y: 416/);
  assert.match(previewSource, /dateOfBirth: \{ x: 58, y: 612/);
  assert.match(pageSource, /panNumber=\{pan\}/);
});

test('PAN template preserves the verified typed number instead of masking it', () => {
  assert.match(previewSource, /resolvePanTemplateNumber\(rawPan, response\.record\.maskedPan\)/);
  assert.match(previewSource, /templatePanNumber/);
  assert.match(previewSource, /`PAN: \$\{templatePanNumber\}`/);
  assert.match(pageSource, /panNumber=\{pan\}/);
});
test('PAN template uses a full verified value and a masked fallback below the printed card title', () => {
  assert.match(previewSource, /resolvePanTemplateNumber\(rawPan, response\.record\.maskedPan\)/);
  assert.match(previewSource, /panNumber: \{ x: 470, y: 276/);
  assert.doesNotMatch(previewSource, /panNumber: \{ x: 664, y: 590/);
});

test('PAN result and history expose only the template with download actions', () => {
  assert.doesNotMatch(previewSource, /Copy PAN|Print PAN Card|handleCopyPan|downloadClientPng/);
  assert.match(previewSource, /Download PDF/);
  assert.match(previewSource, /Download PNG/);
  assert.match(previewSource, /PanTemplatePdfDocument/);
  assert.match(previewSource, /response\.template/);
  assert.doesNotMatch(pageSource, /PAN Comprehensive completed|Complete provider response data/);
  assert.match(pdfSource, /@react-pdf\/renderer/);
  assert.match(pdfSource, /Page/);
});

test('PAN history exposes saved-template state without a duplicate upload row', () => {
  assert.match(previewSource, /response\.template/);
  assert.match(previewSource, /Saved template/);
  assert.match(serviceSource, /template:\s*panTemplateSummary\(record\.template\)/);
});

test('PAN backend retention policy is five minutes and clears encrypted data', () => {
  assert.match(serviceSource, /PAN_RAW_DATA_TTL_MS = 5 \* 60 \* 1000/);
  assert.match(serviceSource, /encryptedResult: null, rawDataExpiresAt: null/);
});

test('PAN history is ownership-protected before returning a template', () => {
  assert.match(serviceSource, /record\.requestedById !== requestedById/);
  assert.match(serviceSource, /history_forbidden/);
});

test('PAN photo and signature inputs are optional and have explicit size guidance', () => {
  assert.match(previewSource, /Photo \(optional\)/);
  assert.match(previewSource, /Signature \(optional\)/);
  assert.match(previewSource, /MAX_PAN_PHOTO_BYTES = 1 \* 1024 \* 1024/);
  assert.match(previewSource, /MAX_PAN_SIGNATURE_BYTES = 500 \* 1024/);
  assert.match(previewSource, /Only JPG, PNG, and WEBP files are allowed/);
});

test('PAN template uses the optional photo and signature when rendering', () => {
  assert.match(previewSource, /photoFile/);
  assert.match(previewSource, /signatureFile/);
  assert.match(previewSource, /drawCoverImage\(context, photoImage/);
  assert.match(previewSource, /drawContainImage\(context, signatureImage/);
});

test('PAN saved templates use a session-memory cache and do not persist sensitive blobs', () => {
  assert.match(previewSource, /getPanTemplateBlob/);
  assert.match(previewSource, /panTemplateCache/);
  assert.doesNotMatch(previewSource, /localStorage|sessionStorage/);
});

test('PAN template backend enforces a 1 MB PNG budget and validates the signature', () => {
  assert.match(serviceSource, /MAX_PAN_TEMPLATE_SIZE = 1 \* 1024 \* 1024/);
  assert.match(serviceSource, /PNG_SIGNATURE/);
  assert.match(serviceSource, /template_file_too_large/);
  assert.match(serviceSource, /template_file_signature_invalid/);
});
