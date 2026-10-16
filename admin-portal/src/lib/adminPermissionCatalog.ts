export type AdminPermissionDefinition = {
  id: string;
  label: string;
};

export const LISTING_PERMISSION_DEFINITIONS: AdminPermissionDefinition[] = [
  { id: 'listings.read', label: 'View All Listings' },
  { id: 'listings.update', label: 'Edit Listing' },
  { id: 'listings.approve', label: 'Approve Listing' },
  { id: 'listings.verification.bypass', label: 'Bypass Vehicle Verification' },
  { id: 'listings.verify_payment', label: 'Payment Verification' },
  { id: 'listings.delete', label: 'Delete Listing' },
];

export const KYC_PERMISSION_DEFINITIONS: AdminPermissionDefinition[] = [
  { id: 'kyc.manage', label: 'Manage Verifications' },
  { id: 'kyc.edit.override', label: 'KYC Edit Override' },
];
