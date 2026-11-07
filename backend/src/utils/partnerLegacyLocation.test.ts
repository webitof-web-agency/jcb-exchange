import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveLegacyPartnerLocation } from './partnerLegacyLocation';

const locations = {
  countryId: 101,
  states: [
    { id: 22, name: 'Chhattisgarh', stateCode: 'CG', countryId: 101 },
    { id: 23, name: 'Rajasthan', stateCode: 'RJ', countryId: 101 },
  ],
  cities: [
    { id: 2201, name: 'Raipur', stateId: 22, countryId: 101 },
    { id: 2301, name: 'Jaipur', stateId: 23, countryId: 101 },
  ],
};

test('resolves a legacy partner from saved state and city names', () => {
  assert.deepEqual(
    resolveLegacyPartnerLocation({ userState: ' chhattisgarh ', userCity: 'RAIPUR' }, locations),
    {
      status: 'RESOLVED',
      countryId: 101,
      stateId: 22,
      cityId: 2201,
      stateCode: 'CG',
      stateName: 'Chhattisgarh',
      cityName: 'Raipur',
    },
  );
});

test('uses district only when the legacy user city is absent', () => {
  assert.equal(
    resolveLegacyPartnerLocation({ userState: 'Rajasthan', district: 'Jaipur' }, locations).status,
    'RESOLVED',
  );
});

test('does not guess when state or city is missing or ambiguous', () => {
  assert.equal(resolveLegacyPartnerLocation({ userCity: 'Raipur' }, locations).status, 'MISSING_STATE');
  assert.equal(resolveLegacyPartnerLocation({ userState: 'Chhattisgarh' }, locations).status, 'MISSING_CITY');
  assert.equal(resolveLegacyPartnerLocation({ userState: 'Unknown', userCity: 'Raipur' }, locations).status, 'STATE_NOT_FOUND');
});

test('preserves already stored canonical ids when they form a valid location chain', () => {
  assert.deepEqual(
    resolveLegacyPartnerLocation({ countryId: 101, stateId: 22, cityId: 2201 }, locations),
    {
      status: 'RESOLVED',
      countryId: 101,
      stateId: 22,
      cityId: 2201,
      stateCode: 'CG',
      stateName: 'Chhattisgarh',
      cityName: 'Raipur',
    },
  );
});
