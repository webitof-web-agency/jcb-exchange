import assert from 'node:assert/strict';
import {
  IDENTITY_HUB_VIEW_PERMISSIONS,
  VEHICLE_TRANSPORT_VIEW_PERMISSIONS,
  CHASSIS_TO_RC_VIEW_PERMISSIONS,
  RC_TO_MOBILE_VIEW_PERMISSIONS,
  MOBILE_TO_RC_VIEW_PERMISSIONS,
  RC_MOBILE_NUMBER_CHECK_VIEW_PERMISSIONS,
  canViewFeature,
} from './featurePermissions';

assert.equal(canViewFeature('SUPER_ADMIN', [], IDENTITY_HUB_VIEW_PERMISSIONS), true);
assert.equal(canViewFeature('ADMIN', ['pan.verification.read'], IDENTITY_HUB_VIEW_PERMISSIONS), true);
assert.equal(canViewFeature('ADMIN', ['pan.verification.verify'], IDENTITY_HUB_VIEW_PERMISSIONS), false);
assert.equal(canViewFeature('EMPLOYEE', ['rc.challan.verification.read'], VEHICLE_TRANSPORT_VIEW_PERMISSIONS), true);
assert.equal(canViewFeature('EMPLOYEE', ['rc.challan.verification.verify'], VEHICLE_TRANSPORT_VIEW_PERMISSIONS), false);
assert.equal(canViewFeature('ADMIN', ['ALL_ACCESS'], VEHICLE_TRANSPORT_VIEW_PERMISSIONS), true);
assert.equal(canViewFeature('EMPLOYEE', ['rc.chassis-to-rc.read'], CHASSIS_TO_RC_VIEW_PERMISSIONS), true);
assert.equal(canViewFeature('EMPLOYEE', ['rc.chassis-to-rc.verify'], CHASSIS_TO_RC_VIEW_PERMISSIONS), false);
assert.equal(canViewFeature('EMPLOYEE', ['rc.to-mobile.read'], RC_TO_MOBILE_VIEW_PERMISSIONS), true);
assert.equal(canViewFeature('EMPLOYEE', ['rc.to-mobile.verify'], RC_TO_MOBILE_VIEW_PERMISSIONS), false);
assert.equal(canViewFeature('EMPLOYEE', ['rc.mobile-to-rc.read'], MOBILE_TO_RC_VIEW_PERMISSIONS), true);
assert.equal(canViewFeature('EMPLOYEE', ['rc.mobile-to-rc.lookup'], MOBILE_TO_RC_VIEW_PERMISSIONS), false);
assert.equal(canViewFeature('EMPLOYEE', ['rc.mobile-number-check.read'], RC_MOBILE_NUMBER_CHECK_VIEW_PERMISSIONS), true);
assert.equal(canViewFeature('EMPLOYEE', ['rc.mobile-number-check.check'], RC_MOBILE_NUMBER_CHECK_VIEW_PERMISSIONS), false);

console.log('feature permission tests passed');
