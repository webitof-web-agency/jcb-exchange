import { normalizeMobileNumber, validateMobileNumber } from './mobileToRcLookup.validation';
import { normalizeRcNumber, validateRcNumber } from './rcOwnerHistory.validation';

export type RcMobileNumberCheckInput = {
  rc_number?: unknown;
  rcNumber?: unknown;
  mobile_number?: unknown;
  mobileNumber?: unknown;
};

export const normalizeRcMobileNumberCheck = (input: RcMobileNumberCheckInput) => ({
  rcNumber: normalizeRcNumber(input.rc_number ?? input.rcNumber),
  mobileNumber: normalizeMobileNumber(input.mobile_number ?? input.mobileNumber),
});

export const validateRcMobileNumberCheck = (input: RcMobileNumberCheckInput) => {
  const normalized = normalizeRcMobileNumberCheck(input);
  return validateRcNumber(normalized.rcNumber) || validateMobileNumber(normalized.mobileNumber);
};
