import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const previewSource = fs.readFileSync(new URL('../components/rcLookup/RcCardTemplatePreview.tsx', import.meta.url), 'utf8');
const pdfSource = fs.readFileSync(new URL('../components/rcLookup/RcCardPdfDocument.tsx', import.meta.url), 'utf8');
const pageSource = fs.readFileSync(new URL('../components/rcLookup/RcLookupPage.tsx', import.meta.url), 'utf8');

test('RC blank template image asset exists in public directory and has non-zero size', () => {
  const templatePath = fileURLToPath(new URL('../../public/templates/rc/rc-blank-template.png', import.meta.url));
  assert.ok(fs.existsSync(templatePath), 'RC template image asset must exist');
  const stat = fs.statSync(templatePath);
  assert.ok(stat.size > 10000, 'RC template image must be a valid non-empty image file');
});

test('RcCardTemplatePreview references official template asset and uses 2x high-DPI canvas', () => {
  assert.match(previewSource, /\/templates\/rc\/rc-blank-template\.png/);
  assert.match(previewSource, /CANVAS_WIDTH\s*=\s*2048/);
  assert.match(previewSource, /CANVAS_HEIGHT\s*=\s*684/);
  assert.match(previewSource, /ctx\.scale\(2,\s*2\)/);
});

test('RcCardTemplatePreview binds all dynamic API placeholders on Front card', () => {
  // Regn No
  assert.match(previewSource, /rcData\.rcNumber/);
  assert.match(previewSource, /drawText\(regNoFormatted,\s*149,\s*112/);

  // Date of Regn
  assert.match(previewSource, /rcData\.registrationDate/);
  assert.match(previewSource, /drawText\(regDate,\s*241,\s*112/);

  // Regn Validity
  assert.match(previewSource, /rcData\.registrationUpto/);
  assert.match(previewSource, /drawText\(validityDate,\s*320,\s*112/);

  // Owner Serial (centered inside circle at 475, 108)
  assert.match(previewSource, /rcData\.ownerNumber/);
  assert.match(previewSource, /drawText\(ownerSerial,\s*475,\s*108/);

  // Chassis No (below label at x=149, y=145)
  assert.match(previewSource, /rcData\.vehicleChasiNumber/);
  assert.match(previewSource, /drawText\(chassisNo,\s*149,\s*145/);

  // Engine/Motor No (below label at x=149, y=179)
  assert.match(previewSource, /rcData\.vehicleEngineNumber/);
  assert.match(previewSource, /drawText\(engineNo,\s*149,\s*179/);

  // Owner Name (below label at x=149, y=212)
  assert.match(previewSource, /rcData\.ownerName/);
  assert.match(previewSource, /drawText\(ownerName,\s*149,\s*212/);

  // Son/Daughter/Wife of (below label at x=149, y=247)
  assert.match(previewSource, /rcData\.fatherName/);
  assert.match(previewSource, /drawText\(fatherName,\s*149,\s*247/);

  // Address (below label at x=149, y=282)
  assert.match(previewSource, /rcData\.presentAddress/);
  assert.match(previewSource, /drawText\(addrLines\[0\],\s*149,\s*282/);

  // Fuel (below label flush at start x=30, y=231)
  assert.match(previewSource, /rcData\.fuelType/);
  assert.match(previewSource, /drawText\(fuel,\s*30,\s*231/);

  // Emission Norms (below label flush at start x=30, y=270)
  assert.match(previewSource, /rcData\.normsType/);
  assert.match(previewSource, /drawText\(norms,\s*30,\s*270/);
});

test('RcCardTemplatePreview binds all dynamic API placeholders on Back card', () => {
  // Vehicle Class (aligned with baseline y=46 with clean gap after colon at x=722)
  assert.match(previewSource, /rcData\.vehicleCategoryDescription/);
  assert.match(previewSource, /drawText\(vClass,\s*722,\s*46/);

  // Regn Number on back (aligned flush at x=532)
  assert.match(previewSource, /drawText\(regNoFormatted,\s*532,\s*98/);

  // Month - Year of Mfg (aligned flush at x=532)
  assert.match(previewSource, /rcData\.manufacturingDate/);
  assert.match(previewSource, /drawText\(mfgDate,\s*532,\s*286/);

  // No of Cylinders (next to colon at x=624)
  assert.match(previewSource, /rcData\.noCylinders/);
  assert.match(previewSource, /drawText\(cylinders,\s*624,\s*302/);

  // Maker (below label at x=691, y=97)
  assert.match(previewSource, /rcData\.makerDescription/);
  assert.match(previewSource, /drawText\(maker,\s*691,\s*97/);

  // Model (below label at x=691, y=132)
  assert.match(previewSource, /rcData\.makerModel/);
  assert.match(previewSource, /drawText\(model,\s*691,\s*132/);

  // Color (below label at x=691, y=163)
  assert.match(previewSource, /rcData\.color/);
  assert.match(previewSource, /drawText\(color,\s*691,\s*163/);

  // Body Type (below label at x=808, y=163)
  assert.match(previewSource, /rcData\.bodyType/);
  assert.match(previewSource, /drawText\(bodyType,\s*808,\s*163/);

  // Seating Capacity (below label at x=691, y=196)
  assert.match(previewSource, /rcData\.seatCapacity/);
  assert.match(previewSource, /drawText\(seating,\s*691,\s*196/);

  // Unladen Weight (below label at x=691, y=227)
  assert.match(previewSource, /rcData\.unladenWeight/);
  assert.match(previewSource, /drawText\(unladenWeight,\s*691,\s*227/);

  // Cubic Cap / Horse Power / Wheel Base (below label at x=691, y=258)
  assert.match(previewSource, /rcData\.cubicCapacity/);
  assert.match(previewSource, /rcData\.horsePower/);
  assert.match(previewSource, /rcData\.wheelbase/);
  assert.match(previewSource, /drawText\(specLine,\s*691,\s*258/);

  // Financier (below label at x=691, y=290)
  assert.match(previewSource, /rcData\.financer/);
  assert.match(previewSource, /drawText\(financierText\.toUpperCase\(\),\s*691,\s*290/);

  // Registration Authority (below label at x=884, y=307)
  assert.match(previewSource, /rcData\.registeredAt/);
  assert.match(previewSource, /drawText\(regAuthority,\s*884,\s*307/);
});

test('RcCardTemplatePreview generates dynamic QR code and supports click modal popup', () => {
  assert.match(previewSource, /QRCode\.toDataURL/);
  assert.match(previewSource, /qrObject/);
  assert.match(previewSource, /setQrModalOpen\(true\)/);
  assert.match(previewSource, /qrModalOpen/);
  assert.match(previewSource, /mParivahan RC QR Code Data/);
});

test('RcCardTemplatePreview provides Download PNG and Download PDF actions', () => {
  assert.match(previewSource, /downloadPng/);
  assert.match(previewSource, /downloadPdf/);
  assert.match(previewSource, />PNG<\/span>/);
  assert.match(previewSource, />PDF Card<\/span>/);
});

test('RcCardPdfDocument generates standard A4 Landscape PDF with card image', () => {
  assert.match(pdfSource, /@react-pdf\/renderer/);
  assert.match(pdfSource, /PAGE_WIDTH\s*=\s*842/);
  assert.match(pdfSource, /PAGE_HEIGHT\s*=\s*595/);
  assert.match(pdfSource, /INDIAN UNION VEHICLE REGISTRATION CERTIFICATE/);
  assert.match(pdfSource, /Form 23A - Smart Card Certificate/);
});

test('RcLookupPage renders RcCardTemplatePreview on successful verification', () => {
  assert.match(pageSource, /<RcCardTemplatePreview\s+response=\{response\}/);
  assert.equal(pageSource.includes('RcOwnerHistoryTemplatePreview'), false);
  assert.equal(pageSource.includes('ResultPanel'), false);
});

test('RcCardTemplatePreview supports uploading and saving templates to history', () => {
  assert.match(previewSource, /onUploaded\?/);
  assert.match(previewSource, /Upload & Save Template/);
  assert.match(previewSource, /\/rc-owner-history\/\$\{response\.record\.id\}\/template/);
  assert.match(previewSource, /getVerificationTemplateBlob/);
});
