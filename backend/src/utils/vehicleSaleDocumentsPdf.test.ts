import assert from 'node:assert/strict';
import { inflateSync } from 'node:zlib';
import test from 'node:test';
import { renderBillOfSupplyPdf, renderDeliveryChallanPdf, renderMoneyReceiptPdf } from './vehicleSaleDocumentsPdf';
import { renderProfitGstInvoicePdf } from './vehicleSaleProfitInvoicePdf';

const pdfCommands = (buffer: Buffer) => {
  const source = buffer.toString('latin1');
  return [...source.matchAll(/stream\r?\n([\s\S]*?)\n?endstream/g)]
    .map((match) => {
      try {
        return inflateSync(Buffer.from(match[1]!.replace(/\r?\n$/, ''), 'latin1')).toString('latin1');
      } catch {
        return match[1] || '';
      }
    })
    .join('\n');
};

const pdfText = (buffer: Buffer) => {
  const commands = pdfCommands(buffer);
  return [...commands.matchAll(/<([0-9a-f]+)>/gi)]
    .map((match) => Buffer.from(match[1]!, 'hex').toString('latin1'))
    .join('');
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
  assert.match(text, /GSTIN: 22AAPFU0939F1ZV/);
  assert.doesNotMatch(text, /CIN:/);
});

test('money receipts use the approved classic layout without transaction-only columns', async () => {
  const pdf = await renderMoneyReceiptPdf({
    company: {
      name: 'JCB Exchange (OPC) Private Limited',
      addressLine: 'Shop No. 8, Housing Board Complex, Raipur',
      gstin: '22AAHCJ5752E1ZR',
    },
    title: 'MONEY RECEIPT',
    receiptNumber: 'JCB/BILASPUR/SAL/26-27/0002',
    receiptDate: '25/NOV/2026',
    vehicleTitle: 'JCB INDIA LIMITED 3DX PLUS-2WD',
    customerId: 'SA-2026-003',
    customerName: 'ONKAR SURYAVANSHI',
    place: 'Bilaspur, Chhattisgarh',
    mode: 'CASH',
    txnNumber: '22091168',
    txnDate: '25/NOV/2026',
    drawnOn: 'CANARA',
    amount: 'Rs. 2,27,000.00',
    amountInWords: 'Rupees Two Lakh Twenty Seven Thousand Only',
    remarks: 'Being amount received through cash.',
    signatory: { name: 'Authorised Signatory', designation: 'Authorised Signatory' },
  });

  const text = pdfText(pdf);
  assert.match(text, /MODE.*AMOUNT/, 'the payment table must have a MODE and AMOUNT column');
  assert.doesNotMatch(text, /TXN NO\./, 'TXN NO. must stay in remarks, not create a second layout');
  assert.doesNotMatch(text, /DRAWN ON/, 'DRAWN ON must stay in remarks, not create a second layout');
  assert.doesNotMatch(text, /COLOR\s*:/i, 'COLOR label must not be rendered on money receipts');
  assert.match(text, /CUSTOMER ID : SA-2026-003/, 'CUSTOMER ID must still be rendered');
  assert.match(pdfCommands(pdf), /36 \d+ 523 2 re/, 'header must include a full-width horizontal divider bar');
  assert.match(pdfCommands(pdf), /36 176 523 42 re/, 'the classic receipt must retain its boxed reference section');
  assert.doesNotMatch(
    pdfCommands(pdf),
    /0\.11764705882352941 0\.22745098039215686 0\.5411764705882353 scn/,
    'the blue fallback stationery must never be used for money receipts',
  );
});

test('money receipts expand box height dynamically for long model names and show dynamic balance', async () => {
  const pdf = await renderMoneyReceiptPdf({
    company: {
      name: 'JCB Exchange (OPC) Private Limited',
      addressLine: 'Shop No. 8, Housing Board Complex, Shankar Nagar Khamhardih Raipur C.G., Raipur, Chhattisgarh, India',
      gstin: '22AAHCJ5752E1ZR',
    },
    title: 'MONEY RECEIPT',
    receiptNumber: 'JCB/SANGLI/SAL/26-27/0003',
    receiptDate: '25/NOV/2026',
    vehicleTitle: 'CASE EQUIPMENT PRIVATE LTD CASE 770 SS LODER BACKOE providercategoryconstruction equipment vehicle',
    customerId: 'SA-2026-006',
    customerName: 'PARASHARM KASINATH MALI',
    place: 'SANGLI, MAHARASHTRA',
    mode: 'BANK TRANSFER',
    txnNumber: 'ICICR42026100100554774',
    txnDate: '30/OCT/2026',
    drawnOn: '-',
    amount: 'Rs. 3,00,000.00',
    amountInWords: 'Rupees Three Lakh Only',
    balance: 'Rs. 2,00,000.00',
    remarks: 'Being amount received through BANK TRANSFER. Customer balance: ₹2,00,000.00. PO/DD/CHQ subject to realisation.',
    signatory: { name: 'Authorised Signatory', designation: 'Authorised Signatory' },
  });

  const pageCount = (pdf.toString('latin1').match(/\/Type\s*\/Page\b/g) || []).length;
  assert.equal(pageCount, 1, 'Money receipt with long model text must still fit on 1 page');

  const commands = pdfCommands(pdf);
  const boxMatch = commands.match(/36 176 523 (\d+) re/);
  assert.ok(boxMatch, 'reference box must start at expected top coordinate');
  assert.ok(Number(boxMatch[1]) > 42, `expected dynamic reference box height > 42 for wrapped model, got ${boxMatch[1]}`);

  const text = pdfText(pdf);
  assert.doesNotMatch(text, /COLOR\s*:/i);
  assert.match(text, /CUSTOMER ID : SA-2026-006/);
  assert.match(text, /CUSTOMER BALANCE : Rs\. 2,00,000\.00/);
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
  assert.doesNotMatch(text, /CIN:/, 'CIN must be safely omitted from Bill of Supply');
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

test('profit GST invoice keeps Rs. totals, header, and long vehicle titles aligned without wrapping or clipping', async () => {
  const pdf = await renderProfitGstInvoicePdf({
    company: {
      name: 'JCB EXCHANGE (OPC) PRIVATE LIMITED',
      addressLine: 'Shop No. 8, Housing Board Complex, Shankar Nagar Khamhardih Raipur C.G., Raipur, Chhattisgarh, India',
      gstin: '22AAHCJ5752E1ZR',
      state: 'Chhattisgarh',
    },
    invoiceNumber: 'JCBX/PR/20261117/9955',
    invoiceDate: '17/NOV/2026',
    customerName: 'ROSHAN VERMA',
    customerAddressLine: 'Raipur, Chhattisgarh',
    customerStateCode: 'Chhattisgarh',
    placeOfSupply: 'Chhattisgarh',
    vehicle: {
      title: '2021 CASE NEW HOLLAND CONSTRUCTION EQUIPMENT(I) PVT LTD CASE 770 EX-SS',
      registrationNumber: 'CG11BN7867',
      chassisNumber: 'RAJ3DXNA03449629',
      engineNumber: 'H00445338',
      category: 'Excavator (NT)',
    },
    relatedBillOfSupplyNumber: 'JCBX/SV/2026-27/0001',
    finance: {
      purchaseAmount: 2300000,
      saleAmount: 2400000,
      expenses: 16000,
      grossMargin: 84000,
      taxableValue: 71186.44,
      gstRatePercent: 18,
      isIntraState: true,
      cgst: 6406.78,
      sgst: 6406.78,
      igst: 0,
      totalGst: 12813.56,
      totalInvoiceAmount: 84000,
      netProfitAfterGst: 71186.44,
    },
    amountInWords: 'Rupees Eighty Four Thousand Only',
    remarksBullets: [
      '• Gross Profit Margin (Inclusive of 18% GST): Rs. 84,000.00',
      '• Note: Tax Invoice issued under GST Margin Scheme pursuant to Rule 32(5) of the CGST Rules, 2017. Internal record for accounting and audit compliance.',
    ],
    signatory: { name: 'Authorised Signatory', designation: 'Director' },
  });

  assert.equal((pdf.toString('latin1').match(/\/Type\s*\/Page\b/g) || []).length, 1);
  const tjLines = [...pdfCommands(pdf).matchAll(/\[([^\]]*)\]\s*TJ/g)]
    .map((m) => [...m[1]!.matchAll(/<([0-9a-f]+)>/gi)].map((h) => Buffer.from(h[1]!, 'hex').toString('latin1')).join(''));
  assert.ok(tjLines.includes('Total (Gross)'), 'Total (Gross) header must fit on a single line');
  assert.equal(tjLines.filter((line) => line === 'Rs. 84,000.00').length, 2, 'Item and Total Gross amounts must stay on single lines');
  assert.ok(
    tjLines.includes('2021 CASE NEW HOLLAND CONSTRUCTION EQUIPMENT(I) PVT LTD CASE 770 EX-SS'),
    'Long vehicle title must fit cleanly on one line',
  );
  assert.ok(
    tjLines.some((line) => line.includes('Internal record for accounting and audit compliance.')),
    'Wrapped accounting note bullet must not be clipped',
  );
});
