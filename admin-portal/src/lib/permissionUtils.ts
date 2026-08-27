export const hasPermission = (userPermissions: string[] | undefined, permission: string) => {
  if (!userPermissions?.length) {
    return false;
  }

  return userPermissions.includes('ALL_ACCESS') || userPermissions.includes(permission);
};

export const hasAnyPermission = (userPermissions: string[] | undefined, requiredPermissions: string[]) => {
  if (!requiredPermissions.length) {
    return true;
  }

  if (!userPermissions?.length) {
    return false;
  }

  return userPermissions.includes('ALL_ACCESS') || requiredPermissions.some((permission) => userPermissions.includes(permission));
};
