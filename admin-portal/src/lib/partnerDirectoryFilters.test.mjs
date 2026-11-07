import assert from 'node:assert/strict';
import test from 'node:test';
import { matchesPartnerDirectoryLocation } from './partnerDirectoryFilters.mjs';

test('matches partners by canonical state and city ids', () => {
  const partner = {
    state: 'Chhattisgarh',
    city: 'Raipur',
    partnerProfile: {
      stateId: 22,
      cityId: 401,
      state: { id: 22, name: 'Chhattisgarh' },
      city: { id: 401, name: 'Raipur' },
    },
  };

  assert.equal(matchesPartnerDirectoryLocation(partner, { stateId: '22', cityId: '401' }), true);
  assert.equal(matchesPartnerDirectoryLocation(partner, { stateId: '22', cityId: '402' }), false);
});

test('falls back to saved location names for legacy partners without ids', () => {
  const partner = {
    state: 'Chhattisgarh',
    city: 'Raipur',
    partnerProfile: { district: 'Raipur' },
  };

  assert.equal(
    matchesPartnerDirectoryLocation(partner, {
      stateId: '22',
      stateName: 'chhattisgarh',
      cityId: '401',
      cityName: 'RAIPUR',
    }),
    true,
  );
});

test('does not apply a location filter when no location is selected', () => {
  assert.equal(matchesPartnerDirectoryLocation({ partnerProfile: null }, {}), true);
});
