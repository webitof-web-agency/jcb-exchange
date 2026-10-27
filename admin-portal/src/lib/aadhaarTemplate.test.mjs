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
  assert.ok(code.includes('downloadPng'), 'Must support PNG download');
  assert.ok(code.includes('downloadPdf'), 'Must support PDF download');
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
  assert.ok(code.includes('<AadhaarTemplatePreview data={result} />'), 'AadhaarDigiLockerPanel must render template preview with dynamic data');
});
