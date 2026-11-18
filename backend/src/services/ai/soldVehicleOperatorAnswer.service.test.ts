import assert from 'node:assert/strict';
import test from 'node:test';
import { buildSoldVehicleOperatorAnswer } from './soldVehicleOperatorAnswer.service';

const detail = {
  parties: {
    seller: { name: 'Harishchand', number: '9876543210' },
    purchaser: { name: 'Buyer One' },
    owner: { name: 'Owner One' },
  },
};

test('returns the raw authorized seller name for an exact Sold Vehicle question', () => {
  assert.equal(buildSoldVehicleOperatorAnswer({
    message: 'sold vehicles module me seller name kya hai btao',
    toolName: 'sold.vehicle.detail',
    operatorData: detail,
  }), 'Seller name: Harishchand');
});

test('does not answer a party field from an unrelated tool', () => {
  assert.equal(buildSoldVehicleOperatorAnswer({
    message: 'seller name batao',
    toolName: 'sell.accounts.summary',
    operatorData: detail,
  }), null);
});
