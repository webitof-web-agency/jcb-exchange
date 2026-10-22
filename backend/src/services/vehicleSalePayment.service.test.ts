import assert from 'node:assert/strict';
import test from 'node:test';
import {
  normalizeVehicleSaleReceiptChannel,
  selectedVehicleSaleReceiptChannels,
} from './vehicleSalePayment.service';

test('normalizes receipt delivery channel requests', () => {
  assert.equal(normalizeVehicleSaleReceiptChannel('SMS'), 'SMS');
  assert.equal(normalizeVehicleSaleReceiptChannel('WHATSAPP'), 'WHATSAPP');
  assert.equal(normalizeVehicleSaleReceiptChannel(undefined), 'BOTH');
  assert.equal(normalizeVehicleSaleReceiptChannel('email'), 'BOTH');
});

test('selects only the requested delivery channel', () => {
  assert.deepEqual(selectedVehicleSaleReceiptChannels('SMS'), ['SMS']);
  assert.deepEqual(selectedVehicleSaleReceiptChannels('WHATSAPP'), ['WHATSAPP']);
  assert.deepEqual(selectedVehicleSaleReceiptChannels('BOTH'), ['WHATSAPP', 'SMS']);
});
