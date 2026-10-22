import assert from 'node:assert/strict';
import test from 'node:test';
import PizZip from 'pizzip';
import {
  fillBillOfSupplyTemplate,
  fillMoneyReceiptTemplate,
} from './vehicleSaleDocxTemplate';

const documentXml = (paragraphs: string[]) => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>${paragraphs.map((value) => `<w:p><w:r><w:t>${value}</w:t></w:r></w:p>`).join('')}</w:body>
</w:document>`;

const makeTemplate = (paragraphs: string[]) => {
  const zip = new PizZip();
  zip.file('word/document.xml', documentXml(paragraphs));
  zip.file('word/media/image1.jpg', 'original-logo');
  zip.file('word/_rels/document.xml.rels', '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId8" Target="media/image1.jpg" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image"/></Relationships>');
  zip.file('[Content_Types].xml', '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="jpg" ContentType="image/jpeg"/></Types>');
  return zip.generate({ type: 'nodebuffer' });
};

const readDocument = (buffer: Buffer) => {
  const zip = new PizZip(buffer);
  return zip.file('word/document.xml')?.asText() || '';
};

test('fills the supplied money receipt layout and replaces the embedded logo', () => {
  const source = makeTemplate([
    'JCB EXCHANGE (OPC) PRIVATE LIMITED',
    'CIN: OLD',
    'Old address',
    'MONEY RECEIPT',
    'RECEIPT NO : OLD',
    'DATE : OLD',
    'MODEL : OLD MACHINE',
    'COLOR : YELLOW     CUSTOMER ID : -',
    'RECEIVED WITH THANKS FROM: OLD CUSTOMER',
    'PLACE : OLD',
    'MODE',
    'AMOUNT',
    'CASH',
    '1,40,000.00',
    'OLD AMOUNT WORDS',
    'Remarks: old',
    'PO/DD/CHQ SUBJECT TO REALISATION.',
    'FOR, OLD COMPANY',
    "CUSTOMER'S SIGNATURE",
    'AUTHORISED SIGNATORY',
  ]);

  const output = fillMoneyReceiptTemplate(source, {
    companyName: 'JCB Exchange',
    cin: 'U46594CT2026OPC020990',
    companyAddressLine: 'Raipur, Chhattisgarh - 492004',
    receiptNumber: 'JCB/RAIPUR/SAL/26-27/2404',
    receiptDate: '22/OCT/2026',
    vehicleTitle: 'CAT 424B',
    vehicleColor: 'YELLOW',
    customerId: 'SA-2026-001',
    customerName: 'HITESH',
    place: 'RAIPUR, CHHATTISGARH',
    paymentMethod: 'BANK TRANSFER',
    amount: '₹2,000.00',
    amountInWords: 'Rupees Two Thousand Only',
    remarks: 'Payment received against sold vehicle.',
    authorisedSignatoryName: 'Mitali Sharma',
    authorisedSignatoryDesignation: 'Director / Authorized Signatory',
  }, Buffer.from('not-a-real-jpg'));

  const xml = readDocument(output);
  assert.match(xml, /U46594CT2026OPC020990/);
  assert.match(xml, /JCB\/RAIPUR\/SAL\/26-27\/2404/);
  assert.match(xml, /HITESH/);
  assert.match(xml, /BANK TRANSFER/);
  assert.match(xml, /Rupees Two Thousand Only/);
  assert.doesNotMatch(xml, /OLD CUSTOMER|1,40,000\.00|Old address/);

  const zip = new PizZip(output);
  assert.equal(zip.file('word/media/image1.jpg')?.asText(), 'not-a-real-jpg');
});

test('fills the supplied bill of supply layout with buyer, vehicle and payment data', () => {
  const paragraphs = Array.from({ length: 89 }, (_, index) => `Unused ${index}`);
  paragraphs[0] = 'JCB EXCHANGE (OPC) PRIVATE LIMITED';
  paragraphs[1] = 'CIN: OLD';
  paragraphs[2] = 'Old address';
  paragraphs[7] = 'Name: OLD COMPANY';
  paragraphs[8] = 'Invoice No: OLD';
  paragraphs[9] = 'Address: OLD ADDRESS';
  paragraphs[10] = 'Invoice Date: OLD';
  paragraphs[11] = 'GSTIN: OLD';
  paragraphs[12] = 'Place of Supply: OLD';
  paragraphs[13] = 'State / Code: OLD';
  paragraphs[14] = 'Terms of Delivery: OLD';
  paragraphs[15] = 'Buyer (Bill to)';
  paragraphs[16] = 'Name: OLD BUYER';
  paragraphs[17] = 'Address: OLD BUYER ADDRESS';
  paragraphs[18] = 'GSTIN: OLD';
  paragraphs[19] = 'State / Code: OLD';
  paragraphs[32] = '1';
  paragraphs[33] = 'OLD ITEM';
  paragraphs[34] = 'OLD HSN';
  paragraphs[35] = '1';
  paragraphs[36] = 'OLD RATE';
  paragraphs[37] = 'OLD AMOUNT';
  paragraphs[38] = 'Total';
  paragraphs[39] = 'OLD TOTAL';
  paragraphs[46] = 'Amount in Words: OLD';
  paragraphs[53] = 'Terms & Conditions';
  paragraphs[54] = 'OLD TERMS';
  paragraphs[84] = 'For OLD COMPANY';
  paragraphs[86] = 'Name: OLD NAME';
  paragraphs[87] = 'Designation: OLD DESIGNATION';

  const output = fillBillOfSupplyTemplate(makeTemplate(paragraphs), {
    companyName: 'JCB Exchange',
    cin: 'U46594CT2026OPC020990',
    companyAddressLine: 'Raipur, Chhattisgarh - 492004',
    invoiceNumber: 'JCB/RAIPUR/SAL/26-27/2404',
    invoiceDate: '22/OCT/2026',
    customerName: 'HITESH',
    customerAddressLine: 'Raipur, Chhattisgarh',
    customerGstin: '-',
    customerStateCode: 'Chhattisgarh / 22',
    placeOfSupply: 'Chhattisgarh',
    vehicleTitle: 'CAT 424B',
    hsn: '8429',
    quantity: '1',
    rate: '₹50,000.00',
    amount: '₹50,000.00',
    total: '₹50,000.00',
    amountInWords: 'Rupees Fifty Thousand Only',
    terms: 'Payment received in full. GST not charged separately.',
    authorisedSignatoryName: 'Mitali Sharma',
    authorisedSignatoryDesignation: 'Director / Authorized Signatory',
  }, Buffer.from('not-a-real-png'));

  const xml = readDocument(output);
  assert.match(xml, /U46594CT2026OPC020990/);
  assert.match(xml, /HITESH/);
  assert.match(xml, /CAT 424B/);
  assert.match(xml, /Rupees Fifty Thousand Only/);
  assert.match(xml, /Payment received in full/);
  assert.doesNotMatch(xml, /OLD BUYER|OLD ITEM|OLD TERMS|OLD COMPANY/);
});
