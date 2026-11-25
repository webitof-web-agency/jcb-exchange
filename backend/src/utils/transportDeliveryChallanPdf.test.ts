import assert from 'node:assert/strict';
import test from 'node:test';
import zlib from 'node:zlib';
import { renderTransportDeliveryChallanPdf } from './transportDeliveryChallanPdf';
import { meaningfulAddress, resolveTransportParties } from './transportParties';

/** Pulls the printed text out of a pdfkit document (Flate streams, hex or literal strings). */
const extractPdfText = (pdf: Buffer): string => {
  const raw = pdf.toString('latin1');
  const parts: string[] = [];
  const streamPattern = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  let match: RegExpExecArray | null;
  while ((match = streamPattern.exec(raw)) !== null) {
    let content: string;
    try {
      content = zlib.inflateSync(Buffer.from(match[1] as string, 'latin1')).toString('latin1');
    } catch {
      continue;
    }
    const arrayPattern = /\[([^\]]*)\]\s*TJ/g;
    let t: RegExpExecArray | null;
    while ((t = arrayPattern.exec(content)) !== null) {
      const hexParts = [...(t[1] as string).matchAll(/<([0-9a-fA-F]*)>/g)].map((h) => Buffer.from(h[1] as string, 'hex').toString('latin1'));
      parts.push(hexParts.join(''));
    }
  }
  return parts.join('\n');
};

const baseData = {
  challanNumber: '01',
  challanDate: '12/11/2026',
  machineTitle: '3DX 2WD BACKHOE LOADER JCB MACHINE',
  registrationNumber: 'CG13LA2827',
  declaredValue: 900000,
  carrierVehicleNumber: 'HR74C8493',
  dispatchName: 'DHANSAY SHYAMLE',
  dispatchGstin: 'URP',
  dispatchAddress: 'WARD 5 MAIN ROAD',
  dispatchCity: 'AMBIKAPUR',
  dispatchState: 'CHHATTISGARH',
  dispatchPincode: '497001',
  deliveryName: 'NAUSHAD KHAN',
  deliveryGstin: 'URP',
  deliveryAddress: 'VASAI EAST',
  deliveryCity: 'VASAI PALGHAR',
  deliveryState: 'MAHARASHTRA',
  deliveryPincode: '401208',
  signatoryName: 'DHANSAY SHYAMLE',
};

test('renders a valid delivery challan PDF', async () => {
  const pdfBuffer = await renderTransportDeliveryChallanPdf(baseData);
  assert.ok(Buffer.isBuffer(pdfBuffer));
  assert.ok(pdfBuffer.length > 1000);
  assert.equal(pdfBuffer.subarray(0, 5).toString('ascii'), '%PDF-');
});

test('challan prints the live machine, truck and party details and no HSN code', async () => {
  const text = extractPdfText(await renderTransportDeliveryChallanPdf(baseData)).replace(/\s+/g, ' ');
  assert.match(text, /CHALLAN NO\. 01/);
  assert.match(text, /OLD 3DX 2WD BACKHOE LOADER JCB MACHINE AND REG NO\. CG13LA2827 IS TRANSPORTING FOR JOB WORKS/);
  assert.match(text, /VEHICLE NO\. . HR74C8493/);
  assert.match(text, /900000/);
  assert.match(text, /AMBIKAPUR, CHHATTISGARH-497001/);
  assert.match(text, /VASAI PALGHAR, MAHARASHTRA-401208/);
  assert.doesNotMatch(text, /HSN/i);
  assert.doesNotMatch(text, /84295900/);
});

test('challan leaves out values that are not available instead of inventing them', async () => {
  const text = extractPdfText(
    await renderTransportDeliveryChallanPdf({
      ...baseData,
      registrationNumber: null,
      carrierVehicleNumber: null,
      dispatchAddress: '',
      dispatchPincode: null,
      deliveryGstin: '',
    }),
  );
  assert.doesNotMatch(text, /REG NO/);
  assert.doesNotMatch(text, /VEHICLE NO/);
  assert.doesNotMatch(text, /HR74C8493/);
  assert.doesNotMatch(text, /NOT REGISTERED/);
  assert.doesNotMatch(text, /TO BE ASSIGNED/);
  assert.match(text, /AMBIKAPUR, CHHATTISGARH\b/);
  assert.equal((text.match(/GSTIN :/g) || []).length, 1);
});

test('vehicle number falls back to the machine registration when no truck is recorded', async () => {
  const text = extractPdfText(
    await renderTransportDeliveryChallanPdf({ ...baseData, carrierVehicleNumber: null }),
  ).replace(/\s+/g, ' ');
  assert.match(text, /VEHICLE NO\. . CG13LA2827/);
  assert.doesNotMatch(text, /HR74C8493/);
});

test('city and state are not printed twice', async () => {
  const text = extractPdfText(await renderTransportDeliveryChallanPdf({ ...baseData, dispatchAddress: '' }));
  assert.equal((text.match(/AMBIKAPUR/g) || []).length, 1);
});

test('meaningfulAddress drops a stored "city, state" placeholder', () => {
  assert.equal(meaningfulAddress('Raigarh, Chhattisgarh', [{ city: 'Raigarh', state: 'Chhattisgarh' }]), '');
  assert.equal(meaningfulAddress('Raigarh', [{ city: 'Raigarh', state: 'Chhattisgarh' }]), '');
  assert.equal(meaningfulAddress('Ward 5, Main Road', [{ city: 'Raigarh', state: 'Chhattisgarh' }]), 'Ward 5, Main Road');
});

test('parties follow the live sold vehicle record and fall back to stored values', () => {
  const parties = resolveTransportParties(
    {
      dispatchName: 'OLD SELLER',
      dispatchGstin: 'URP',
      dispatchAddress: 'Raigarh, Chhattisgarh',
      dispatchCity: 'Raigarh',
      dispatchState: 'Chhattisgarh',
      deliveryName: 'OLD BUYER',
      deliveryCity: 'Old City',
      deliveryState: 'Old State',
      declaredValue: 100,
    },
    {
      sellerName: 'New Seller',
      sellerCity: 'Bilaspur',
      sellerState: 'Chhattisgarh',
      purchaserName: 'New Buyer',
      purchaserCity: '',
      purchaserState: null,
      sellAmount: '250000.00',
    },
  );
  assert.equal(parties.dispatch.name, 'New Seller');
  assert.equal(parties.dispatch.city, 'Bilaspur');
  assert.equal(parties.dispatch.address, '');
  assert.equal(parties.delivery.name, 'New Buyer');
  assert.equal(parties.delivery.city, 'Old City');
  assert.equal(parties.declaredValue, 250000);
});
