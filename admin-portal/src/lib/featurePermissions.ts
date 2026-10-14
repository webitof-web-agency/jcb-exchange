import { hasAnyPermission } from './permissionUtils';

export const IDENTITY_HUB_VIEW_PERMISSIONS = [
  'pan.verification.read',
  'gst.verification.read',
  'pan.mobile-to-pan.read',
];

export const PAN_VIEW_PERMISSIONS = ['pan.verification.read'];
export const GST_VIEW_PERMISSIONS = ['gst.verification.read'];
export const MOBILE_TO_PAN_VIEW_PERMISSIONS = ['pan.mobile-to-pan.read'];

export const VEHICLE_TRANSPORT_VIEW_PERMISSIONS = [
  'driving-license.verification.read',
  'rc.owner-history.read',
  'rc.full.read',
  'rc.challan.verification.read',
  'rc.chassis-to-rc.read',
  'rc.to-mobile.read',
  'rc.mobile-to-rc.read',
  'rc.mobile-number-check.read',
];

export const DRIVING_LICENSE_VIEW_PERMISSIONS = ['driving-license.verification.read'];
export const RC_OWNER_HISTORY_VIEW_PERMISSIONS = ['rc.owner-history.read'];
export const RC_FULL_VIEW_PERMISSIONS = ['rc.full.read'];
export const RC_CHALLAN_VIEW_PERMISSIONS = ['rc.challan.verification.read'];
export const CHASSIS_TO_RC_VIEW_PERMISSIONS = ['rc.chassis-to-rc.read'];
export const RC_TO_MOBILE_VIEW_PERMISSIONS = ['rc.to-mobile.read'];
export const MOBILE_TO_RC_VIEW_PERMISSIONS = ['rc.mobile-to-rc.read'];
export const RC_MOBILE_NUMBER_CHECK_VIEW_PERMISSIONS = ['rc.mobile-number-check.read'];

export type PortalRole = 'SUPER_ADMIN' | 'ADMIN' | 'EMPLOYEE' | string | undefined;

export const canViewFeature = (
  role: PortalRole,
  userPermissions: string[] | undefined,
  requiredPermissions: string[],
) => role === 'SUPER_ADMIN' || hasAnyPermission(userPermissions, requiredPermissions);
