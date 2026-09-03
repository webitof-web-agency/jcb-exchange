import prisma from '../lib/prisma';

const prismaAny = prisma as any;

export const ACCOUNT_REVOKED_CODE = 'ACCOUNT_REVOKED';
export const ACCOUNT_REVOKED_MESSAGE =
  'This account has been deactivated or removed. Please contact the super admin for access.';
export const ACCOUNT_INACTIVE_CODE = 'ACCOUNT_INACTIVE';
export const ACCOUNT_INACTIVE_MESSAGE =
  'This account is inactive right now. Please contact the super admin to reactivate access.';

const inactiveUserStatuses = new Set(['INACTIVE']);
const revokedUserStatuses = new Set(['SUSPENDED', 'BLOCKED', 'CLOSED']);
const blockedPartnerStatuses = new Set(['SUSPENDED', 'BLOCKED', 'CLOSED']);
const approvedPartnerStatuses = {
  onboardingStatus: 'APPROVED',
  accountStatus: 'ACTIVE',
  kycStatus: 'APPROVED',
} as const;

export const authenticatedUserSelect = {
  id: true,
  email: true,
  name: true,
  role: true,
  status: true,
  mobile: true,
  whatsappNumber: true,
  city: true,
  state: true,
  customRoleId: true,
  adminProfile: {
    select: {
      title: true,
      isRootAdmin: true,
    },
  },
  adminPermissions: {
    select: {
      permission: true,
    },
  },
  customRole: {
    select: {
      id: true,
      name: true,
      permissions: true,
    },
  },
  partnerProfile: {
    select: {
      onboardingStatus: true,
      accountStatus: true,
      kycStatus: true,
      partnerType: true,
      ownerName: true,
      businessName: true,
      businessAddress: true,
      district: true,
      pinCode: true,
      contactPreference: true,
    },
  },
} as const;

export const fetchAuthenticatedUserById = async (userId: string) => {
  if (!userId) {
    return null;
  }

  return prismaAny.user.findUnique({
    where: { id: userId },
    select: authenticatedUserSelect,
  });
};

export const resolveEffectiveUserRole = (user: {
  role?: string | null;
  partnerProfile?: {
    onboardingStatus?: string | null;
    accountStatus?: string | null;
    kycStatus?: string | null;
  } | null;
} | null) => {
  if (!user) {
    return 'CUSTOMER' as const;
  }

  if (
    user.role === 'SUPER_ADMIN' ||
    user.role === 'ADMIN' ||
    user.role === 'EMPLOYEE' ||
    user.role === 'PARTNER'
  ) {
    return user.role;
  }

  const partnerProfile = user.partnerProfile;
  const isVerifiedPartner =
    partnerProfile?.onboardingStatus === approvedPartnerStatuses.onboardingStatus &&
    partnerProfile?.accountStatus === approvedPartnerStatuses.accountStatus &&
    partnerProfile?.kycStatus === approvedPartnerStatuses.kycStatus;

  return isVerifiedPartner ? 'PARTNER' : (user.role || 'CUSTOMER');
};

export const getAccountAccessState = (user: {
  status?: string | null;
  role?: string | null;
  partnerProfile?: {
    onboardingStatus?: string | null;
    accountStatus?: string | null;
    kycStatus?: string | null;
  } | null;
} | null) => {
  if (!user) {
    return 'revoked' as const;
  }

  if (user.status && inactiveUserStatuses.has(user.status)) {
    return 'inactive' as const;
  }

  if (user.status && revokedUserStatuses.has(user.status)) {
    return 'revoked' as const;
  }

  if (resolveEffectiveUserRole(user) === 'PARTNER') {
    const accountStatus = user.partnerProfile?.accountStatus;
    if (!accountStatus || blockedPartnerStatuses.has(accountStatus)) {
      return 'revoked' as const;
    }
  }

  return 'active' as const;
};

export const isAccountRevoked = (user: Parameters<typeof getAccountAccessState>[0]) =>
  getAccountAccessState(user) === 'revoked';

export const isAccountInactive = (user: Parameters<typeof getAccountAccessState>[0]) =>
  getAccountAccessState(user) === 'inactive';

export const isPortalStatusBlocked = (status?: string | null) =>
  !!status && (inactiveUserStatuses.has(status) || revokedUserStatuses.has(status));
