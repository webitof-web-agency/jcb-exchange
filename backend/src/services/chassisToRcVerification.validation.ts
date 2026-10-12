const MIN_CHASSIS_LENGTH = 5;
const MAX_CHASSIS_LENGTH = 100;

export const normalizeChassisNumber = (value: unknown) =>
  typeof value === 'string' ? value.trim().toUpperCase().replace(/\s+/g, '') : '';

export const validateChassisNumber = (value: unknown) => {
  const chassisNumber = normalizeChassisNumber(value);
  if (!chassisNumber) return 'Chassis number is required.';
  if (
    chassisNumber.length < MIN_CHASSIS_LENGTH
    || chassisNumber.length > MAX_CHASSIS_LENGTH
    || !/^[A-Z0-9/-]+$/.test(chassisNumber)
  ) {
    return 'Enter a valid chassis number.';
  }
  return null;
};
