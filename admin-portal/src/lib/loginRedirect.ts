type LoginRedirectUser = {
  role: string;
  permissions?: string[];
  accountStatus?: string | null;
  onboardingStatus?: string | null;
  kycStatus?: string | null;
};

const isSafePortalPath = (value?: string | null) => Boolean(value && value.startsWith('/') && !value.startsWith('//'));

export const resolveLoginRedirect = (user: LoginRedirectUser, nextRoute?: string | null) => {
  const requestedRoute = isSafePortalPath(nextRoute) ? nextRoute! : null;

  if (user.role === 'SUPER_ADMIN') return requestedRoute || '/superadmin/dashboard';
  if (user.role === 'ADMIN') return requestedRoute || '/admin/dashboard';
  if (user.role === 'PARTNER') {
    return user.accountStatus === 'ACTIVE' && user.onboardingStatus === 'APPROVED' && user.kycStatus === 'APPROVED'
      ? requestedRoute || '/partner/dashboard'
      : '/partner/kyc';
  }

  return null;
};
