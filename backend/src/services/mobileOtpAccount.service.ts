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
};

export const findMobileOtpAccount = async (
  mobile: string,
  repository: MobileOtpAccountRepository,
) => repository.findByMobile(mobile);
