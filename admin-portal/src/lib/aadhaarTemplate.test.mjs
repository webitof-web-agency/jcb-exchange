import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

test('Aadhaar blank template image asset exists in public directory with valid dimensions', () => {
  const templatePath = path.resolve('public/templates/aadhaar/aadhaar-blank-template.png');
  assert.ok(fs.existsSync(templatePath), 'Aadhaar blank template PNG must exist in public/templates/aadhaar');
  const stat = fs.statSync(templatePath);
  assert.ok(stat.size > 500_000, 'Aadhaar template file size should be substantial (high-resolution)');
});

test('Aadhaar production base template is not excluded from deployment by gitignore', () => {
  const ignorePath = path.resolve('../.gitignore');
  const ignore = fs.readFileSync(ignorePath, 'utf8');
  assert.ok(
    ignore.includes('!/admin-portal/public/templates/aadhaar/aadhaar-blank-template.png'),
    'The exact Aadhaar base PNG must be explicitly unignored for live deployment',
  );
});

test('AadhaarTemplatePreview component has calibrated coordinates and download handlers', () => {
  const componentPath = path.resolve('src/components/identityHub/AadhaarTemplatePreview.tsx');
  assert.ok(fs.existsSync(componentPath), 'AadhaarTemplatePreview.tsx must exist');
  const code = fs.readFileSync(componentPath, 'utf8');

  // Verify key coordinates and features
  assert.ok(code.includes('CANVAS_WIDTH = 1785'), 'Must use 1785 width');
  assert.ok(code.includes('CANVAS_HEIGHT = 2526'), 'Must use 2526 height');
  assert.ok(code.includes('toName'), 'Must map recipient name');
  assert.ok(code.includes('topAadhaar'), 'Must map top letter Aadhaar number');
  assert.ok(code.includes('cardAadhaar'), 'Must map card Aadhaar number');
  assert.ok(code.includes('letterQr'), 'Must generate letter QR code');
  assert.ok(code.includes('backQr'), 'Must generate back card QR code');
  assert.ok(code.includes('qrJsonObject') && code.includes('JSON.stringify'), 'Must encode structured JSON for camera scan pop-up');
  assert.ok(code.includes('effectiveAadhaar'), 'Must support unmasked Aadhaar number');
  assert.ok(code.includes('setCustomAadhaar'), 'Must allow setting/editing unmasked Aadhaar number');
  assert.ok(code.includes('ctx.fillRect(550, 2260, 700, 80)'), 'Must include bottom margin canvas watermark safeguard');
  assert.ok(code.includes('downloadPng'), 'Must support PNG download');
  assert.ok(code.includes('downloadPdf'), 'Must support PDF download');
});

test('Aadhaar downloads and saved uploads use the full number only when a complete number is available', () => {
  const componentPath = path.resolve('src/components/identityHub/AadhaarTemplatePreview.tsx');
  const code = fs.readFileSync(componentPath, 'utf8');
  assert.ok(code.includes('getAadhaarFileToken'), 'Aadhaar filenames must have one guarded number-token helper');
  assert.ok(code.includes('fileToken'), 'PNG/PDF and upload filenames must use the guarded Aadhaar token');
  assert.ok(code.includes('aadhaar-${fileToken}'), 'Downloaded files must include the Aadhaar token');
});

test('saved-history downloads do not reuse legacy record-id filenames', () => {
  const componentPath = path.resolve('src/components/identityHub/AadhaarTemplatePreview.tsx');
  const code = fs.readFileSync(componentPath, 'utf8');
  const pagePath = path.resolve('src/components/identityHub/IdentityHubPage.tsx');
  const pageCode = fs.readFileSync(pagePath, 'utf8');
  assert.ok(code.includes('recordMaskedAadhaar'), 'Saved history viewer must receive the record masked Aadhaar');
  assert.ok(code.includes('savedDownloadFileName'), 'Saved history downloads must use a normalized filename');
  assert.ok(pageCode.includes('recordMaskedAadhaar={response.record.maskedAadhaar}'), 'History detail must pass the record identifier to the viewer');
});

test('legacy saved Aadhaar history can use a local full-number filename override', () => {
  const componentPath = path.resolve('src/components/identityHub/AadhaarTemplatePreview.tsx');
  const code = fs.readFileSync(componentPath, 'utf8');
  assert.ok(code.includes('savedFilenameAadhaar'), 'Saved history viewer must provide a local filename number state');
  assert.ok(code.includes('Full Aadhaar number for filename'), 'Legacy saved history must explain the filename-only override');
  assert.ok(code.includes('savedDownloadBaseName'), 'Saved history downloads must derive their name from the override');
});

test('AadhaarTemplatePdfDocument is registered and uses standard A4 portrait dimensions', () => {
  const pdfDocPath = path.resolve('src/components/identityHub/AadhaarTemplatePdfDocument.tsx');
  assert.ok(fs.existsSync(pdfDocPath), 'AadhaarTemplatePdfDocument.tsx must exist');
  const code = fs.readFileSync(pdfDocPath, 'utf8');
  assert.ok(code.includes('PAGE_WIDTH = 595'), 'Must use A4 width in pt');
  assert.ok(code.includes('PAGE_HEIGHT = 842'), 'Must use A4 height in pt');
});

test('AadhaarDigiLockerPanel renders AadhaarTemplatePreview on result', () => {
  const panelPath = path.resolve('src/components/identityHub/AadhaarDigiLockerPanel.tsx');
  const code = fs.readFileSync(panelPath, 'utf8');
  assert.ok(code.includes('<AadhaarTemplatePreview') && code.includes('result'), 'AadhaarDigiLockerPanel must render template preview with dynamic data');
});

test('Aadhaar result details are hidden after a template is saved', () => {
  const panelPath = path.resolve('src/components/identityHub/AadhaarDigiLockerPanel.tsx');
  const code = fs.readFileSync(panelPath, 'utf8');
  assert.ok(code.includes('result && !template'), 'The raw DigiLocker detail card must be hidden once the template is saved');
});

test('Aadhaar template preview exposes an explicit upload-and-save action', () => {
  const previewPath = path.resolve('src/components/identityHub/AadhaarTemplatePreview.tsx');
  const code = fs.readFileSync(previewPath, 'utf8');
  assert.ok(code.includes('Upload & Save Template'), 'Aadhaar template must expose the upload-and-save action');
});

test('saved Aadhaar templates use a bounded blob cache and never render a blank history modal', () => {
  const previewPath = path.resolve('src/components/identityHub/AadhaarTemplatePreview.tsx');
  const code = fs.readFileSync(previewPath, 'utf8');
  assert.ok(code.includes('getAadhaarTemplateBlob'), 'Saved Aadhaar templates must use the shared blob cache');
  assert.ok(code.includes('Loading saved template...'), 'Saved-template loading state must be visible');
  assert.ok(code.includes('Saved Aadhaar template could not be loaded.'), 'Saved-template errors must be visible');
  assert.ok(code.includes('Retry'), 'Saved-template loading must be retryable');
  assert.ok(code.includes('Saved template metadata is unavailable.'), 'Missing saved-template metadata must not produce a blank modal');
});

test('saved Aadhaar template viewer exposes a PDF download generated from the saved PNG', () => {
  const previewPath = path.resolve('src/components/identityHub/AadhaarTemplatePreview.tsx');
  const code = fs.readFileSync(previewPath, 'utf8');
  assert.ok(code.includes('savedTemplateBlob'), 'Saved template viewer must retain the downloaded blob for PDF generation');
  assert.ok(code.includes('downloadSavedPdf'), 'Saved template viewer must have a dedicated PDF download handler');
  assert.ok(code.includes('Download PDF'), 'Saved template viewer must expose Download PDF');
});

test('Aadhaar issue and as-on dates only use explicit API date fields', () => {
  const previewPath = path.resolve('src/components/identityHub/AadhaarTemplatePreview.tsx');
  const code = fs.readFileSync(previewPath, 'utf8');
  assert.ok(code.includes('safe(sourceData.issueDate)'), 'Issue date must read the API issueDate field');
  assert.ok(!code.includes('safe(sourceData.createdAt)'), 'Record creation time must not be shown as Aadhaar issue date');
  assert.ok(!code.includes('new Date().toLocaleDateString'), 'Current browser date must not be used as a fallback');
  assert.ok(!code.includes('customIssueDate'), 'Manual date override must not bypass API-only date rendering');
});

test('Aadhaar back card does not render the removed vertical Details as on date', () => {
  const previewPath = path.resolve('src/components/identityHub/AadhaarTemplatePreview.tsx');
  const code = fs.readFileSync(previewPath, 'utf8');
  assert.ok(!code.includes('FIELD.asOnDate'), 'The marked vertical back-card date must not be drawn');
});

test('Aadhaar history starts the private template download while loading detail metadata', () => {
  const pagePath = path.resolve('src/components/identityHub/IdentityHubPage.tsx');
  const code = fs.readFileSync(pagePath, 'utf8');
  assert.ok(code.includes('getAadhaarTemplateBlob'), 'History view must prefetch saved Aadhaar templates');
  assert.ok(code.includes('responseType: \'blob\''), 'Aadhaar template prefetch must remain a binary download');
});

test('Aadhaar blank template images have no watermark in bottom margin', async () => {
  const sharp = (await import('sharp')).default;
  const fullPath = path.resolve('public/templates/aadhaar/aadhaar-blank-template.png');
  const { data, info } = await sharp(fullPath).raw().toBuffer({ resolveWithObject: true });

  let nonWhiteCount = 0;
  for (let y = 2260; y < 2340; y++) {
    for (let x = 550; x < 1250; x++) {
      const idx = (y * info.width + x) * info.channels;
      if (data[idx] < 250 || data[idx + 1] < 250 || data[idx + 2] < 250) {
        nonWhiteCount++;
      }
    }
  }
  assert.equal(nonWhiteCount, 0, 'No non-white watermark pixels should exist in bottom margin');
});
