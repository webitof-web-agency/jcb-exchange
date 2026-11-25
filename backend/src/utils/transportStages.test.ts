import assert from 'node:assert/strict';
import test from 'node:test';
import { getNextTransportStage, validateTransportTransition } from './transportStages';

test('procedure order is Pending Dispatch, Out For Delivery, On The Way, Delivered', () => {
  assert.equal(getNextTransportStage('BOOKED'), 'OUT_FOR_DELIVERY');
  assert.equal(getNextTransportStage('VEHICLE_ASSIGNED'), 'OUT_FOR_DELIVERY');
  assert.equal(getNextTransportStage('OUT_FOR_DELIVERY'), 'ON_THE_WAY');
  assert.equal(getNextTransportStage('ON_THE_WAY'), 'DELIVERED');
  assert.equal(getNextTransportStage('DISPATCHED'), 'DELIVERED');
  assert.equal(getNextTransportStage('DELIVERED'), null);
  assert.equal(getNextTransportStage('CANCELLED'), null);
});

test('any stage can be chosen, forward, skipping ahead or back', () => {
  assert.equal(validateTransportTransition('BOOKED', 'OUT_FOR_DELIVERY'), null);
  assert.equal(validateTransportTransition('BOOKED', 'ON_THE_WAY'), null);
  assert.equal(validateTransportTransition('BOOKED', 'DELIVERED'), null);
  assert.equal(validateTransportTransition('ON_THE_WAY', 'BOOKED'), null);
  assert.equal(validateTransportTransition('DELIVERED', 'ON_THE_WAY'), null);
  assert.equal(validateTransportTransition('VEHICLE_ASSIGNED', 'DELIVERED'), null);
  assert.equal(validateTransportTransition('ON_THE_WAY', 'CANCELLED'), null);
});

test('same stage, unknown stage and cancelled shipments are refused', () => {
  assert.match(validateTransportTransition('ON_THE_WAY', 'ON_THE_WAY') ?? '', /already at On The Way/);
  assert.match(validateTransportTransition('DISPATCHED', 'ON_THE_WAY') ?? '', /already at On The Way/);
  assert.match(validateTransportTransition('VEHICLE_ASSIGNED', 'BOOKED') ?? '', /already at Pending Dispatch/);
  assert.ok(validateTransportTransition('BOOKED', 'SOMETHING_ELSE'));
  assert.ok(validateTransportTransition('CANCELLED', 'BOOKED'));
  assert.ok(validateTransportTransition('DELIVERED', 'CANCELLED'));
});
