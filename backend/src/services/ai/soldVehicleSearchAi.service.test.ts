import assert from 'node:assert/strict';
import test from 'node:test';
import { buildSoldVehicleSearch, SoldVehicleSearchError } from './soldVehicleSearchAi.service';

const rows = [
  {
    id: 'deal-1', recordNumber: 'SA-2026-0001', listingId: 'listing-1', listingTitle: 'JCB 3DX',
    invoiceNumber: 'JCBX/SV/26-27/0001', vehicleNumber: 'CG-04-AB-1234', chassisNumber: 'CH-123',
    sellerName: 'Seller One', purchaserName: 'Buyer One', dealStatus: 'COMPLETED',
    sellDate: new Date('2026-11-10T00:00:00.000Z'), sellAmount: 1250000, netProfitAfterGst: 210000, deletedAt: null,
  },
  {
    id: 'deal-2', recordNumber: 'SA-2026-0002', listingId: 'listing-2', listingTitle: 'JCB 3DX',
    invoiceNumber: 'JCBX/SV/26-27/0002', vehicleNumber: 'CG-04-AB-1234', chassisNumber: 'CH-456',
    sellerName: 'Seller Two', purchaserName: 'Buyer Two', dealStatus: 'CANCELLED',
    sellDate: new Date('2026-11-09T00:00:00.000Z'), sellAmount: 1100000, netProfitAfterGst: 100000, deletedAt: null,
  },
];

const db = {
  sellAccount: {
    findMany: async () => rows,
  },
};

test('sold.vehicle.search normalizes formatted registration numbers and reports ambiguity', async () => {
  const result = await buildSoldVehicleSearch(db, { vehicleNumber: 'CG04AB1234' });
  assert.equal(result.found, true);
  assert.equal(result.exact, false);
  assert.equal(result.ambiguous, true);
  assert.deepEqual(result.candidates.map((candidate) => candidate.recordNumber), ['SA-2026-0001', 'SA-2026-0002']);
  assert.deepEqual(result.candidates[0]?.matchReasons, ['vehicleNumber']);
});

test('sold.vehicle.search resolves an exact invoice to one candidate', async () => {
  const result = await buildSoldVehicleSearch(db, { invoiceNumber: 'JCBX/SV/26-27/0001' });
  assert.equal(result.exact, true);
  assert.equal(result.ambiguous, false);
  assert.equal(result.candidates[0]?.dealId, 'deal-1');
});

test('sold.vehicle.search refuses unbounded or invalid queries', async () => {
  await assert.rejects(
    () => buildSoldVehicleSearch(db, {}),
    (error: unknown) => error instanceof SoldVehicleSearchError && error.code === 'QUERY_REQUIRED',
  );
  await assert.rejects(
    () => buildSoldVehicleSearch(db, { query: 'x' }),
    (error: unknown) => error instanceof SoldVehicleSearchError && error.code === 'QUERY_INVALID',
  );
});
