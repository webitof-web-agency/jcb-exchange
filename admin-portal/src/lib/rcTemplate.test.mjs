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
  assert.match(previewSource, /drawText\(validityDate,\s*325,\s*112/);

  // Owner Serial
  assert.match(previewSource, /rcData\.ownerNumber/);
  assert.match(previewSource, /drawText\(ownerSerial,\s*468,\s*113/);

  // Chassis No
  assert.match(previewSource, /rcData\.vehicleChasiNumber/);
  assert.match(previewSource, /drawText\(chassisNo,\s*220,\s*131/);

  // Engine/Motor No
  assert.match(previewSource, /rcData\.vehicleEngineNumber/);
  assert.match(previewSource, /drawText\(engineNo,\s*246,\s*165/);

  // Owner Name
  assert.match(previewSource, /rcData\.ownerName/);
  assert.match(previewSource, /drawText\(ownerName,\s*228,\s*198/);

  // Son/Daughter/Wife of
  assert.match(previewSource, /rcData\.fatherName/);
  assert.match(previewSource, /drawText\(fatherName,\s*148,\s*250/);

  // Address
  assert.match(previewSource, /rcData\.presentAddress/);
  assert.match(previewSource, /drawText\(addrLines\[0\],\s*205,\s*269/);

  // Fuel
  assert.match(previewSource, /rcData\.fuelType/);
  assert.match(previewSource, /drawText\(fuel,\s*20,\s*242/);

  // Emission Norms
  assert.match(previewSource, /rcData\.normsType/);
  assert.match(previewSource, /drawText\(norms,\s*20,\s*287/);
});

test('RcCardTemplatePreview binds all dynamic API placeholders on Back card', () => {
  // Vehicle Class
  assert.match(previewSource, /rcData\.vehicleCategoryDescription/);
  assert.match(previewSource, /drawText\(vClass,\s*700,\s*34/);

  // Regn Number on back
  assert.match(previewSource, /drawText\(regNoFormatted,\s*526,\s*98/);

  // Month - Year of Mfg
  assert.match(previewSource, /rcData\.manufacturingDate/);
  assert.match(previewSource, /drawText\(mfgDate,\s*536,\s*286/);

  // No of Cylinders
  assert.match(previewSource, /rcData\.noCylinders/);
  assert.match(previewSource, /drawText\(cylinders,\s*625,\s*303/);

  // Maker
  assert.match(previewSource, /rcData\.makerDescription/);
  assert.match(previewSource, /drawText\(maker,\s*745,\s*80/);

  // Model
  assert.match(previewSource, /rcData\.makerModel/);
  assert.match(previewSource, /drawText\(model,\s*735,\s*118/);

  // Color
  assert.match(previewSource, /rcData\.color/);
  assert.match(previewSource, /drawText\(color,\s*728,\s*149/);

  // Body Type
  assert.match(previewSource, /rcData\.bodyType/);
  assert.match(previewSource, /drawText\(bodyType,\s*848,\s*149/);

  // Seating Capacity
  assert.match(previewSource, /rcData\.seatCapacity/);
  assert.match(previewSource, /drawText\(seating,\s*808,\s*181/);

  // Unladen Weight
  assert.match(previewSource, /rcData\.unladenWeight/);
  assert.match(previewSource, /drawText\(unladenWeight,\s*805,\s*211/);

  // Cubic Cap / Horse Power / Wheel Base
  assert.match(previewSource, /rcData\.cubicCapacity/);
  assert.match(previewSource, /rcData\.horsePower/);
  assert.match(previewSource, /rcData\.wheelbase/);
  assert.match(previewSource, /drawText\(specLine,\s*690,\s*259/);

  // Financier
  assert.match(previewSource, /rcData\.financer/);
  assert.match(previewSource, /drawText\(financierText\.toUpperCase\(\),\s*748,\s*276/);

  // Registration Authority
  assert.match(previewSource, /rcData\.registeredAt/);
  assert.match(previewSource, /drawText\(regAuthority,\s*865,\s*306/);
});

test('RcCardTemplatePreview generates dynamic QR code and supports click modal popup', () => {
  assert.match(previewSource, /QRCode\.toDataURL/);
  assert.match(previewSource, /qrObject/);
  assert.match(previewSource, /setQrModalOpen\(true\)/);
  assert.match(previewSource, /qrModalOpen/);
  assert.match(previewSource, /mParivahan RC QR Code Data/);
});

test('RcCardTemplatePreview provides Download PNG, Download PDF, and Print actions', () => {
  assert.match(previewSource, /downloadPng/);
  assert.match(previewSource, /downloadPdf/);
  assert.match(previewSource, /handlePrint/);
  assert.match(previewSource, />PNG<\/span>/);
  assert.match(previewSource, />PDF Card<\/span>/);
  assert.match(previewSource, />Print<\/span>/);
});

test('RcCardPdfDocument generates standard A4 Landscape PDF with card image', () => {
  assert.match(pdfSource, /@react-pdf\/renderer/);
  assert.match(pdfSource, /PAGE_WIDTH\s*=\s*842/);
  assert.match(pdfSource, /PAGE_HEIGHT\s*=\s*595/);
  assert.match(pdfSource, /INDIAN UNION VEHICLE REGISTRATION CERTIFICATE/);
  assert.match(pdfSource, /Form 23A - Smart Card Certificate/);
});

test('RcLookupPage renders RcCardTemplatePreview on successful verification', () => {
  assert.match(pageSource, /<RcCardTemplatePreview response=\{response\} \/>/);
});
