import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PAN_COMPREHENSIVE_OPERATION,
  PAN_COMPREHENSIVE_ROUTE,
  operationLabel,
} from './panVerification';

test('uses the PAN Comprehensive label and canonical route', () => {
  assert.equal(PAN_COMPREHENSIVE_OPERATION, 'PAN_COMPREHENSIVE_V2');
  assert.equal(PAN_COMPREHENSIVE_ROUTE, '/pan-verification/comprehensive');
  assert.equal(operationLabel(PAN_COMPREHENSIVE_OPERATION), 'PAN Comprehensive');
});
