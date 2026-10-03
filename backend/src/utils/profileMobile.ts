import { getLoginMobileCandidates, normalizeLoginMobileNumber } from './mobileOtp';

export const normalizeProfileMobile = (value?: string | null) => {
  const trimmed = value?.trim() || '';
  return trimmed ? normalizeLoginMobileNumber(trimmed) : null;
};

export const getProfileMobileCandidates = (value?: string | null) => {
  const normalizedMobile = normalizeProfileMobile(value);
  return normalizedMobile ? getLoginMobileCandidates(normalizedMobile) : [];
};
