const MIN_RC_LENGTH = 3;
const MAX_RC_LENGTH = 30;

export const normalizeRcNumber = (value: unknown) =>
  typeof value === 'string' ? value.trim().toUpperCase().replace(/\s+/g, '') : '';

export const validateRcNumber = (value: unknown) => {
  const rcNumber = normalizeRcNumber(value);
  if (!rcNumber) return 'Vehicle registration number is required.';
  if (rcNumber.length < MIN_RC_LENGTH || rcNumber.length > MAX_RC_LENGTH || !/^[A-Z0-9/-]+$/.test(rcNumber)) {
    return 'Enter a valid vehicle registration number.';
  }
  return null;
};
