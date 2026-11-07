import assert from 'node:assert/strict';
import test from 'node:test';
import { buildPartnerCode, findAvailablePartnerCode } from './partnerCode';

test('builds a stable partner code from state, city and dealer first name', () => {
  assert.equal(
    buildPartnerCode({ stateCode: 'CG', stateName: 'Chhattisgarh', cityName: 'Raipur', dealerName: 'Ravi Kumar Gupta' }),
    'cg-raipur-ravi',
  );
});

test('falls back to location names and normalizes unsafe characters', () => {
  assert.equal(
    buildPartnerCode({ stateName: 'Uttar Pradesh', cityName: '  Noida  ', dealerName: 'A&B Machines Pvt. Ltd.' }),
    'uttar-pradesh-noida-a-b',
  );
});

test('adds a deterministic numeric suffix when a partner code already exists', async () => {
  const used = new Set(['cg-raipur-ravi', 'cg-raipur-ravi-2']);
  const code = await findAvailablePartnerCode(
    { stateCode: 'CG', cityName: 'Raipur', dealerName: 'Ravi Kumar' },
    { findUnique: async ({ where }: any) => used.has(where.partnerCode) ? { id: 'existing' } : null },
  );
  assert.equal(code, 'cg-raipur-ravi-3');
});
