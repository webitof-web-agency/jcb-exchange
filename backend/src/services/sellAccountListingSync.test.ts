import assert from 'node:assert/strict';
import test from 'node:test';
import { Prisma } from '@prisma/client';
import { syncListingSoldStatusFromSellAccount } from './sellAccountListingSync';

test('syncListingSoldStatusFromSellAccount returns null if deal is cancelled', async () => {
  const mockTx = {};
  const result = await syncListingSoldStatusFromSellAccount(
    mockTx,
    {
      id: 'sell-1',
      cancelledAt: new Date(),
      dealStatus: 'DEAL_DONE',
    },
    true,
  );
  assert.equal(result, null);
});

test('syncListingSoldStatusFromSellAccount returns null if neither fully paid nor DEAL_DONE', async () => {
  const mockTx = {};
  const result = await syncListingSoldStatusFromSellAccount(
    mockTx,
    {
      id: 'sell-2',
      dealStatus: 'OPEN',
      sellAmount: 500000,
    },
    false,
  );
  assert.equal(result, null);
});

test('syncListingSoldStatusFromSellAccount auto-marks listing as SOLD and upserts SaleRecord upon 100% full payment', async () => {
  let updatedListing: any = null;
  let upsertedSaleRecord: any = null;
  let detachedListing: any = null;

  const mockTx: any = {
    listing: {
      findUnique: async ({ where }: any) => {
        if (where.id === 'list-123') {
          return {
            id: 'list-123',
            status: 'PUBLISHED',
            soldAt: null,
            title: 'JCB 3DX 2024',
            price: new Prisma.Decimal(2300000),
            locationCity: 'Bilaspur',
            locationState: 'Chhattisgarh',
          };
        }
        return null;
      },
      update: async ({ where, data }: any) => {
        updatedListing = { id: where.id, ...data };
        return updatedListing;
      },
    },
    saleRecord: {
      upsert: async (args: any) => {
        upsertedSaleRecord = args;
        return args;
      },
    },
    $executeRaw: async (query: any) => {
      detachedListing = true;
      return 1;
    },
  };

  const result = await syncListingSoldStatusFromSellAccount(
    mockTx,
    {
      id: 'sa-001',
      recordNumber: 'SA-2026-001',
      listingId: 'list-123',
      vehicleNumber: 'CG 11 BN 7867',
      purchaserName: 'Satish Kumar Banjare',
      purchaserNumber: '9876543210',
      purchaserCity: 'Janjgir Champa',
      purchaserState: 'Chhattisgarh',
      sellAmount: 2300000,
      invoiceNumber: 'INV-2026-001',
      dealStatus: 'FULL_PAYMENT',
    },
    true,
  );

  assert.ok(result);
  assert.equal(result.status, 'SOLD');
  assert.equal(result.listingId, 'list-123');
  assert.ok(result.soldAt instanceof Date);

  // Listing was updated to SOLD
  assert.ok(updatedListing);
  assert.equal(updatedListing.status, 'SOLD');
  assert.ok(updatedListing.soldAt instanceof Date);

  // SaleRecord was upserted with confidential buyer info
  assert.ok(upsertedSaleRecord);
  assert.equal(upsertedSaleRecord.where.listingId, 'list-123');
  assert.equal(upsertedSaleRecord.create.buyerName, 'Satish Kumar Banjare');
  assert.equal(upsertedSaleRecord.create.buyerPhone, '9876543210');
  assert.equal(upsertedSaleRecord.create.buyerCity, 'Janjgir Champa');
  assert.equal(upsertedSaleRecord.create.buyerState, 'Chhattisgarh');
  assert.equal(upsertedSaleRecord.create.invoiceNo, 'INV-2026-001');
  assert.equal(String(upsertedSaleRecord.create.soldPrice), '2300000');
  assert.ok(upsertedSaleRecord.create.notes.includes('SA-2026-001'));

  // Marketplace leads were detached
  assert.equal(detachedListing, true);
});

test('syncListingSoldStatusFromSellAccount matches listing via registration key if listingId is not directly set', async () => {
  let updatedListing: any = null;
  let boundListingId: any = null;

  const mockTx: any = {
    listing: {
      findUnique: async () => null,
      findFirst: async ({ where }: any) => {
        if (where.registrationNumberKey === 'CG11BN7867') {
          return {
            id: 'list-auto-reg',
            status: 'PUBLISHED',
            soldAt: null,
            title: 'JCB INDIA LIMITED 3DX',
            price: new Prisma.Decimal(2300000),
            locationCity: 'Bilaspur',
            locationState: 'Chhattisgarh',
          };
        }
        return null;
      },
      update: async ({ where, data }: any) => {
        updatedListing = { id: where.id, ...data };
        return updatedListing;
      },
    },
    sellAccount: {
      update: async ({ where, data }: any) => {
        boundListingId = data.listingId;
      },
    },
    saleRecord: {
      upsert: async (args: any) => args,
    },
    $executeRaw: async () => 1,
  };

  const result = await syncListingSoldStatusFromSellAccount(
    mockTx,
    {
      id: 'sa-002',
      recordNumber: 'SA-2026-002',
      listingId: null,
      vehicleNumber: 'CG 11 BN 7867',
      purchaserName: 'Satish Kumar',
      purchaserNumber: '9876543210',
      sellAmount: 2300000,
      dealStatus: 'DEAL_DONE',
    },
    false,
  );

  assert.ok(result);
  assert.equal(result.listingId, 'list-auto-reg');
  assert.equal(result.status, 'SOLD');
  assert.equal(updatedListing.status, 'SOLD');
  assert.equal(boundListingId, 'list-auto-reg');
});

test('syncListingSoldStatusFromSellAccount preserves existing soldAt if listing was already sold', async () => {
  const existingSoldAt = new Date('2026-11-16T10:00:00.000Z');
  let listingUpdateCalled = false;

  const mockTx: any = {
    listing: {
      findUnique: async () => ({
        id: 'list-prev-sold',
        status: 'SOLD',
        soldAt: existingSoldAt,
        title: 'JCB 3DX',
        price: new Prisma.Decimal(2300000),
      }),
      update: async () => {
        listingUpdateCalled = true;
      },
    },
    saleRecord: {
      upsert: async (args: any) => args,
    },
    $executeRaw: async () => 1,
  };

  const result = await syncListingSoldStatusFromSellAccount(
    mockTx,
    {
      id: 'sa-003',
      listingId: 'list-prev-sold',
      dealStatus: 'DEAL_DONE',
      completedAt: new Date('2026-11-21T12:00:00.000Z'),
    },
    true,
  );

  assert.ok(result);
  assert.equal(result.soldAt.getTime(), existingSoldAt.getTime());
  assert.equal(listingUpdateCalled, false, 'Should not rewrite listing status if already SOLD with soldAt');
});
