import assert from 'node:assert/strict';
import { inflateSync } from 'node:zlib';
import test from 'node:test';
import { renderMoneyReceiptPdf } from './vehicleSaleDocumentsPdf';

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
