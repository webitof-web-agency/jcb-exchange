import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  buildPartnerDirectoryOrderBy,
  buildPartnerDirectoryWhere,
  parsePartnerDirectoryQuery,
} from './partnerDirectoryQuery.js';

describe('partner directory query contract', () => {
  it('parses combined filters, dates, sorting, and bounded pagination', () => {
    const query = parsePartnerDirectoryQuery({
      search: 'ravi',
      page: '3',
      pageSize: '50',
      countryId: '91',
      stateId: '12',
      cityId: '1201',
      gstStatus: 'VERIFIED',
      kycStatus: 'APPROVED',
      accountStatus: 'ACTIVE',
      partnerType: 'SHOWROOM',
      status: 'Active',
      joinedFrom: '2026-01-01',
      joinedTo: '2026-01-31',
      sort: 'listings',
      archived: 'false',
    });

    assert.deepStrictEqual(query, {
      search: 'ravi',
      page: 3,
      pageSize: 50,
      skip: 100,
      countryId: 91,
      stateId: 12,
      cityId: 1201,
      gstStatus: 'VERIFIED',
      kycStatus: 'APPROVED',
      accountStatus: 'ACTIVE',
      partnerType: 'SHOWROOM',
      status: 'ACTIVE',
      joinedFrom: new Date('2026-01-01T00:00:00.000Z'),
      joinedTo: new Date('2026-02-01T00:00:00.000Z'),
      sort: 'listings',
      archived: false,
    });
  });

  it('rejects invalid filters instead of silently widening the query', () => {
    assert.throws(() => parsePartnerDirectoryQuery({ page: '0' }), /page/i);
    assert.throws(() => parsePartnerDirectoryQuery({ pageSize: '101' }), /pageSize/i);
    assert.throws(() => parsePartnerDirectoryQuery({ countryId: 'not-a-number' }), /countryId/i);
    assert.throws(() => parsePartnerDirectoryQuery({ gstStatus: 'MAYBE' }), /gstStatus/i);
    assert.throws(() => parsePartnerDirectoryQuery({ joinedFrom: '31-01-2026' }), /joinedFrom/i);
    assert.throws(
      () => parsePartnerDirectoryQuery({ joinedFrom: '2026-02-01', joinedTo: '2026-01-01' }),
      /joinedFrom.*joinedTo/i,
    );
  });

  it('builds one combined Prisma where clause for search, locations, status, and archive policy', () => {
    const query = parsePartnerDirectoryQuery({
      search: 'ravi',
      stateId: '12',
      cityId: '1201',
      gstStatus: 'UNVERIFIED',
      kycStatus: 'APPROVED',
      accountStatus: 'ACTIVE',
      partnerType: 'BROKER',
      status: 'ACTIVE',
      joinedFrom: '2026-01-01',
      joinedTo: '2026-01-31',
      archived: 'false',
    });

    const where = buildPartnerDirectoryWhere(query) as Record<string, unknown>;
    const and = where.AND as Array<Record<string, unknown>>;

    assert.equal(where.role, 'PARTNER');
    assert.deepStrictEqual(where.partnerProfile, { isNot: null });
    assert.ok(and.some((item) => item.status === 'ACTIVE'));
    assert.ok(and.some((item) => item.createdAt));
    const serializedAnd = JSON.stringify(and);
    assert.match(serializedAnd, /"stateId":12/);
    assert.match(serializedAnd, /"cityId":1201/);
    assert.match(serializedAnd, /"partnerType":"BROKER"/);
    assert.match(serializedAnd, /"accountStatus":"ACTIVE"/);
    assert.match(serializedAnd, /"kycStatus":"APPROVED"/);
    assert.ok(and.some((item) => Array.isArray(item.OR)));
  });

  it('supports archived-only mode and deterministic sort mappings', () => {
    const archived = parsePartnerDirectoryQuery({ archived: 'true', sort: 'oldest' });
    const archivedWhere = buildPartnerDirectoryWhere(archived) as Record<string, unknown>;

    assert.equal(archivedWhere.status, 'CLOSED');
    assert.deepStrictEqual(buildPartnerDirectoryOrderBy(archived), [
      { createdAt: 'asc' },
      { id: 'asc' },
    ]);
    assert.deepStrictEqual(buildPartnerDirectoryOrderBy(parsePartnerDirectoryQuery({ sort: 'listings' })), [
      { listings: { _count: 'desc' } },
      { createdAt: 'desc' },
      { id: 'asc' },
    ]);
  });
});
