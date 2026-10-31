import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const previewSource = fs.readFileSync(
  fileURLToPath(new URL('../components/drivingLicenseVerification/DrivingLicenseTemplatePreview.tsx', import.meta.url)),
  'utf8',
);
const pdfSource = fs.readFileSync(
  fileURLToPath(new URL('../components/drivingLicenseVerification/DrivingLicenseTemplatePdfDocument.tsx', import.meta.url)),
  'utf8',
);
const pageSource = fs.readFileSync(
  fileURLToPath(new URL('../components/drivingLicenseVerification/DrivingLicenseVerificationPage.tsx', import.meta.url)),
  'utf8',
);

test('DrivingLicenseTemplatePreview uses side-specific high-resolution canvas dimensions', () => {
  assert.match(previewSource, /BASE_WIDTH\s*=\s*1024/);
  assert.match(previewSource, /CANVAS_WIDTH\s*=\s*2048/);
  assert.match(previewSource, /BASE_HEIGHT_FRONT\s*=\s*651/);
  assert.match(previewSource, /BASE_HEIGHT_BACK\s*=\s*636/);
  assert.match(previewSource, /CANVAS_HEIGHT_FRONT\s*=\s*1302/);
  assert.match(previewSource, /CANVAS_HEIGHT_BACK\s*=\s*1272/);
  assert.doesNotMatch(previewSource, /\bCANVAS_HEIGHT\b(?!_)/);
  assert.match(previewSource, /ctx\.scale\(OUTPUT_SCALE,\s*OUTPUT_SCALE\)/);
    assert.match(previewSource, /FRONT_TEMPLATE_SRC\s*=\s*'\/templates\/dl\/dl-front-blank-template\.png\?v=2'/);
    assert.match(previewSource, /BACK_TEMPLATE_SRC\s*=\s*'\/templates\/dl\/dl-back-blank-template\.png\?v=2'/);
});

test('DrivingLicenseTemplatePreview matches the reference DL template and icons', () => {
  assert.match(previewSource, /CAR_ICON_SRC\s*=\s*'\/templates\/dl\/car-icon\.png'/);
  assert.match(previewSource, /BIKE_ICON_SRC\s*=\s*'\/templates\/dl\/bike-icon\.png'/);
  assert.match(previewSource, /ADPVEH No\.\(Regn\.Numbers\)/);
  assert.match(previewSource, /Hazardous validity/);
  assert.match(previewSource, /Hill Validity/);
  assert.match(previewSource, /Licencing Authority/);
  assert.match(previewSource, /Mobile Number:/);
});

test('DrivingLicenseTemplatePreview keeps the ADPV label but hides its value', () => {
  assert.match(previewSource, /'ADPVEH No\.\(Regn\.Numbers\)', 300, 114/);
  assert.doesNotMatch(previewSource, /drawText\(ctx, adpvVal, 300, 140/);
  assert.match(previewSource, /'Hazardous validity', 300, 168/);
  assert.match(previewSource, /'Hill Validity', 702, 168/);
});

test('DrivingLicenseTemplatePreview keeps the marked back-card blocks slightly lower', () => {
  assert.match(previewSource, /'ADPVEH No\.\(Regn\.Numbers\)', 300, 114/);
  assert.doesNotMatch(previewSource, /drawText\(ctx, adpvVal, 300, 140/);
  assert.match(previewSource, /'Licencing Authority', 840, 542/);
  assert.match(previewSource, /stringValue\(result\.issuingAuthority\)\.toUpperCase\(\) \|\| '-', 840, 566/);
});

test('DrivingLicenseTemplatePreview maps dynamic API fields onto the template', () => {
  for (const field of [
    'licenseNumber',
    'vehicleClasses',
    'issueDate',
    'issuingAuthority',
    'hazardousValidity',
    'hillValidity',
  ]) {
    assert.match(previewSource, new RegExp(`result\\.${field}`), `Missing dynamic DL field: ${field}`);
  }
});

test('DrivingLicenseTemplatePreview normalizes profile photo sources before drawing', () => {
  assert.match(previewSource, /profileImageSource/);
  assert.match(previewSource, /result\.profileImage, result\.profile_image, result\.photoUrl, result\.photo/);
  assert.match(previewSource, /data:image\/jpeg;base64/);
  assert.match(previewSource, /crossOrigin = 'anonymous'/);
});

test('DrivingLicenseTemplatePreview keeps front-card rows aligned with non-overlapping spacing', () => {
  assert.match(previewSource, /drawText\(ctx, effectiveLicense, 198, 185/);
  assert.match(previewSource, /'Issue Date', 212, 230/);
  assert.match(previewSource, /'Name', 52, 408/);
  assert.match(previewSource, /'Date Of Birth', 52, 448/);
  assert.match(previewSource, /'Son\/Daughter\/Wife of', 52, 488/);
  assert.match(previewSource, /'Address', 52, 528/);
  assert.match(previewSource, /stringValue\(result\.bloodGroup\)\.toUpperCase\(\) \|\| '-', 495, 448, FRONT_DETAIL_VAL_FONT, 80/);
  assert.match(previewSource, /'Organ Donor:', 600, 448/);
});

test('DrivingLicenseTemplatePreview generates a record-specific QR and supports PNG/PDF plus Drive save', () => {
  assert.match(previewSource, /QRCode\.toDataURL/);
  assert.match(previewSource, /qrPayload/);
  assert.match(previewSource, /setQrModalOpen\(true\)/);
  assert.match(previewSource, /downloadPng/);
  assert.match(previewSource, /downloadPdf/);
  assert.match(previewSource, /primeVerificationTemplateBlob/);
  assert.match(previewSource, /\/driving-license-verification\/\$\{response\.record\.id\}\/template/);
  assert.match(previewSource, /Upload & Save Template/);
});

test('DrivingLicenseTemplatePdfDocument creates a printable A4 landscape PDF for the complete card image', () => {
  assert.match(pdfSource, /@react-pdf\/renderer/);
  assert.match(pdfSource, /PAGE_WIDTH\s*=\s*842/);
  assert.match(pdfSource, /PAGE_HEIGHT\s*=\s*595/);
  assert.match(pdfSource, /INDIAN UNION DRIVING LICENCE/);
  assert.match(pdfSource, /Form 7 Rule 16/);
});

test('DrivingLicenseVerificationPage renders the dynamic template on a successful response', () => {
  assert.match(pageSource, /<DrivingLicenseTemplatePreview\s+response=\{response\}/);
  assert.match(pageSource, /response \? <>\{response\.result \? <ResultPanel response=\{response\}/);
});

test('DrivingLicenseVerificationPage does not render cleared API details after a template is saved', () => {
  assert.match(pageSource, /response\.result \? <ResultPanel response=\{response\} \/> : null/);
});

test('saved template keeps the dynamic front/back renderer while API data is present', () => {
  assert.match(previewSource, /const \[dynamicResult, setDynamicResult\] = useState\(\(\) => response\.result\)/);
  assert.match(previewSource, /const result = useMemo\(\(\) => dynamicResult \|\| response\.result \|\| \{\}/);
  assert.match(previewSource, /if \(!hasResult\) return;/);
  assert.match(previewSource, /template && !hasResult \? previewUrl/);
  assert.match(previewSource, /setDynamicResult\(result\)/);
  assert.match(previewSource, /onUploaded\(\{ \.\.\.uploadResponse\.data, result: null, template: savedTemplate \}\)/);
  assert.match(previewSource, /if \(!hasResult && templateBlob\) return templateBlob;/);
});
