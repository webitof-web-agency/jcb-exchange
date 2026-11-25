import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildTransportDeliveryChallanPdf,
  generateNextChallanNumber,
  getVehicleTransportList,
} from './vehicleTransport.service';

const mockTransportRecord = {
  id: 'vt-test-1',
  sellAccountId: 'sa-test-1',
  challanNumber: '01',
  challanDate: new Date('2026-11-24T00:00:00.000Z'),
  status: 'BOOKED' as const,
  hsnCode: '84295900',
  declaredValue: 900000,
  carrierVehicleNumber: 'HR74C8493',
  dispatchName: 'DHANSAY SHYAMLE',
  dispatchGstin: 'URP',
  dispatchAddress: 'AMBIKAPUR',
  dispatchCity: 'AMBIKAPUR',
  dispatchState: 'CHHATTISGARH',
  dispatchPincode: '49700',
  deliveryName: 'NAUSHAD KHAN',
  deliveryGstin: 'URP',
  deliveryAddress: 'VASAI MUMBAI',
  deliveryCity: 'VASAI PALGHAR',
  deliveryState: 'MAHARASHTRA',
  deliveryPincode: '401208',
  currentLocation: 'AMBIKAPUR',
  lastRemark: 'Transport record auto-initialized.',
  createdAt: new Date('2026-11-24T00:00:00.000Z'),
  updatedAt: new Date('2026-11-24T00:00:00.000Z'),
  sellAccount: {
    id: 'sa-test-1',
    recordNumber: 'SA-2026-001',
    vehicleNumber: 'CG13LA2827',
    listingTitle: '3DX 2WD BACKHOE LOADER JCB MACHINE',
    brandName: 'JCB',
    vehicleModel: '3DX 2WD',
    sellerName: 'DHANSAY SHYAMLE',
    sellerNumber: '9999999999',
    sellerCity: 'AMBIKAPUR',
    sellerState: 'CHHATTISGARH',
    purchaserName: 'NAUSHAD KHAN',
    purchaserNumber: '8888888888',
    purchaserCity: 'VASAI PALGHAR',
    purchaserState: 'MAHARASHTRA',
    sellAmount: 900000,
    listingId: null,
    listing: null,
  },
  timeline: [],
};

test('vehicle transport service returns sequential challan numbers', async () => {
  const nextNum = await generateNextChallanNumber({
    vehicleTransport: {
      findMany: async () => [{ challanNumber: '01' }, { challanNumber: '09' }],
    },
  } as never);
  assert.equal(nextNum, '10');
});

test('vehicle transport service lists records with metrics', async () => {
  const fakeDb = {
    sellAccount: {
      findMany: async () => [],
    },
    vehicleTransport: {
      count: async () => 1,
      findMany: async () => [mockTransportRecord],
      groupBy: async () => [{ status: 'BOOKED', _count: { _all: 1 } }],
    },
  };

  const list = await getVehicleTransportList({ page: 1, limit: 10, db: fakeDb as never });
  assert.equal(list.items.length, 1);
  assert.equal(list.metrics.total, 1);
  assert.equal(list.metrics.pendingDispatch, 1);
  assert.equal(list.metrics.onTheWay, 0);
  assert.equal(list.metrics.delivered, 0);
});

test('builds transport delivery challan PDF for an existing transport record', async () => {
  const fakeDb = {
    vehicleTransport: {
      findFirst: async () => mockTransportRecord,
    },
    sellAccount: {
      findFirst: async () => null,
    },
  };

  const result = await buildTransportDeliveryChallanPdf(mockTransportRecord.id, fakeDb as never);
  assert.ok(Buffer.isBuffer(result.buffer));
  assert.ok(result.buffer.length > 500);
  assert.equal(result.buffer.subarray(0, 5).toString('ascii'), '%PDF-');
  assert.equal(result.fileName, 'Delivery-Challan-01.pdf');
  assert.equal(result.challanNumber, '01');
});
