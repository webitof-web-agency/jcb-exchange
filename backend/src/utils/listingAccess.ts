export type ListingActorRole = 'SUPER_ADMIN' | 'ADMIN' | 'EMPLOYEE' | 'PARTNER' | 'CUSTOMER';

const hasPermission = (permissions: string[] = [], permission: string) =>
  permissions.includes('ALL_ACCESS') || permissions.includes(permission);

export const canCreateListing = (role: ListingActorRole, permissions: string[] = []) => {
  if (role === 'CUSTOMER' || role === 'PARTNER' || role === 'SUPER_ADMIN' || role === 'ADMIN') {
    return true;
  }

  return role === 'EMPLOYEE' && hasPermission(permissions, 'listings.create');
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
