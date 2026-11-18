import assert from 'node:assert/strict';
import { inflateSync } from 'node:zlib';
import test from 'node:test';
import { renderBillOfSupplyPdf, renderDeliveryChallanPdf, renderMoneyReceiptPdf } from './vehicleSaleDocumentsPdf';

const pdfText = (buffer: Buffer) => {
  const source = buffer.toString('latin1');
  return [...source.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)]
    .map((match) => {
      try {
        return inflateSync(Buffer.from(match[1]!, 'latin1')).toString('latin1');
      } catch {
        return match[1] || '';
      }
    })
    .join('\n');
};

test('money receipts print the configured GSTIN instead of the CIN', async () => {
  const pdf = await renderMoneyReceiptPdf({
    company: {
      name: 'JCB Exchange (OPC) Private Limited',
      addressLine: 'Shop No. 8, Housing Board Complex, Raipur',
      cin: 'U46594CT2026OPC020990',
      gstin: '22AAPFU0939F1ZV',
    },
    title: 'MONEY RECEIPT',
    receiptNumber: 'JCB/RAIPUR/SAL/26-27/0001',
    receiptDate: '16/NOV/2026',
    vehicleTitle: 'JCB INDIA LIMITED 3DX',
    customerId: 'SA-2026-001',
    customerName: 'ROSHAN VERMA',
    place: 'Raipur, Chhattisgarh',
    mode: 'UPI',
    txnNumber: 't2610271409570562368377',
    txnDate: '16/NOV/2026',
    drawnOn: '-',
    amount: 'Rs. 2,50,000.00',
    amountInWords: 'Rupees Two Lakh Fifty Thousand Only',
    remarks: 'Being amount received through UPI against JCB INDIA LIMITED 3DX.',
    signatory: { name: 'Authorised Signatory', designation: 'Authorised Signatory' },
  });

  const text = pdfText(pdf);
  assert.match(text, /<475354494e3a>.*<20323241415046553039333946315a56>/s);
  assert.doesNotMatch(text, /<43494e3a>/);
});

test('bill of supply renders as 1 single page, removes CIN safely, and has Remarks and Signatory', async () => {
  const pdf = await renderBillOfSupplyPdf({
    company: {
      name: 'JCB Exchange (OPC) Private Limited',
      addressLine: 'Shop No. 8, Housing Board Complex, Raipur',
      cin: 'U46594CT2026OPC020990',
      gstin: '22AAHCJ5752E1ZI',
      state: 'Chhattisgarh',
    },
    invoiceNumber: 'JCBX/SV/2026-27/0001',
    invoiceDate: '17/NOV/2026',
    customerName: 'ROSHAN VERMA',
    customerAddressLine: 'Raipur, Chhattisgarh',
    customerStateCode: 'Chhattisgarh',
    placeOfSupply: 'Chhattisgarh',
    description: 'JCB INDIA LIMITED 3DX - Chassis No. RAJ3DXNA0449629',
    hsn: '-',
    amount: 'Rs. 24,00,000.00',
    total: 'Rs. 24,00,000.00',
    amountInWords: 'Rupees Twenty Four Lakh Only',
    remarks: 'Being old JCB INDIA LIMITED 3DX sold vide Inv No: JCBX/SV/2026-27/0001, Dt: 17/NOV/2026. Payment received in full: Rs. 24,00,000.00. GST not charged separately on this Bill of Supply.',
    signatory: { name: 'Authorised Signatory', designation: 'Authorised Signatory' },
  });

  const pageCount = (pdf.toString('latin1').match(/\/Type\s*\/Page\b/g) || []).length;
  assert.equal(pageCount, 1, 'Bill of supply must fit strictly on 1 single page');

  const text = pdfText(pdf);
  assert.doesNotMatch(text, /<43494e3a>/, 'CIN must be safely omitted from Bill of Supply');
  assert.doesNotMatch(text, /U46594CT2026OPC020990/, 'Raw CIN string must not be present');
});

test('delivery challan renders a source-backed vehicle handover document', async () => {
  const pdf = await renderDeliveryChallanPdf({
    company: { name: 'JCB Exchange', addressLine: 'Raipur, Chhattisgarh', gstin: '22AAHCJ5752E1ZI' },
    challanNumber: 'JCBX/DC/SA-2026-001',
    challanDate: '17/NOV/2026',
    sellerName: 'Seller',
    purchaserName: 'Buyer',
    purchaserAddress: 'Raipur, Chhattisgarh',
    vehicleTitle: 'JCB 3DX',
    registrationNumber: 'CG04AB1234',
    chassisNumber: 'CHASSIS-1',
    engineNumber: 'ENGINE-1',
    purpose: 'Vehicle handover against completed Sold Vehicle deal.',
    remarks: 'Internal delivery challan; not a tax invoice.',
    signatory: { name: 'Authorised Signatory', designation: 'Authorised Signatory' },
  });

  assert.equal(pdf.subarray(0, 5).toString('latin1'), '%PDF-');
  assert.equal((pdf.toString('latin1').match(/\/Type\s*\/Page\b/g) || []).length, 1);
});
