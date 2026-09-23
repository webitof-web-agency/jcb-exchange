export type MobileOtpAccountUser = {
  id: string;
  mobile: string | null;
  email?: string | null;
  name?: string | null;
  role: string;
  status: string;
  isMobileVerified: boolean;
};

export type MobileOtpAccountRepository = {
  findByMobile: (mobile: string) => Promise<MobileOtpAccountUser | null>;
  createCustomer: (mobile: string) => Promise<MobileOtpAccountUser>;
};

export const getNewMobileOtpCustomerData = (mobile: string) => ({
  mobile,
  name: null,
  email: null,
  authProvider: 'MOBILE_OTP',
  role: 'CUSTOMER',
  status: 'ACTIVE',
  isMobileVerified: true,
});

const isUniqueConstraintError = (error: unknown) =>
  !!error && typeof error === 'object' && 'code' in error && error.code === 'P2002';

export const findOrCreateMobileOtpAccount = async (
  mobile: string,
  repository: MobileOtpAccountRepository,
) => {
  const existingUser = await repository.findByMobile(mobile);
  if (existingUser) {
    return { user: existingUser, created: false } as const;
  }

  try {
    return {
      user: await repository.createCustomer(mobile),
      created: true,
    } as const;
  } catch (error) {
    if (!isUniqueConstraintError(error)) {
      throw error;
    }

    const concurrentlyCreatedUser = await repository.findByMobile(mobile);
    if (!concurrentlyCreatedUser) {
      throw error;
    }

    return { user: concurrentlyCreatedUser, created: false } as const;
  }
};
