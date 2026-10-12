export type ListingActorRole = 'SUPER_ADMIN' | 'ADMIN' | 'EMPLOYEE' | 'PARTNER' | 'CUSTOMER';

export type ManagedListingCreationSettings = {
  allowAdmin: boolean;
  allowEmployee: boolean;
};

const hasPermission = (permissions: string[] = [], permission: string) =>
  permissions.includes('ALL_ACCESS') || permissions.includes(permission);

export const canCreateListing = (
  role: ListingActorRole,
  permissions: string[] = [],
  settings?: ManagedListingCreationSettings,
) => {
  if (role === 'SUPER_ADMIN' || role === 'CUSTOMER' || role === 'PARTNER') {
    return true;
  }

  if (role === 'ADMIN') {
    return settings?.allowAdmin === true;
  }

  if (role === 'EMPLOYEE') {
    return settings?.allowEmployee === true;
  }

  return false;
};

export const canEditListing = (role: ListingActorRole, permissions: string[] = []) => {
  if (role === 'CUSTOMER' || role === 'PARTNER' || role === 'SUPER_ADMIN' || role === 'ADMIN') {
    return true;
  }

  return (
    role === 'EMPLOYEE' &&
    (hasPermission(permissions, 'listings.update') || hasPermission(permissions, 'listings.approve'))
  );
};

export const canBypassListingVerification = (role: ListingActorRole, permissions: string[] = []) =>
  role === 'SUPER_ADMIN'
  || role === 'ADMIN'
  || (role === 'EMPLOYEE' && hasPermission(permissions, 'listings.verification.bypass'));
