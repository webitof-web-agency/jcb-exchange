const D_TABLE: number[][] = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
  [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
  [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
  [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
  [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
  [6, 5, 9, 8, 7, 1, 0, 4, 3, 2],
  [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
  [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
  [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
];
const P_TABLE: number[][] = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
  [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
  [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
  [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
  [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
  [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
  [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
];

const normalizeDigits = (value: unknown) => typeof value === 'string' ? value.replace(/\D/g, '') : '';

const isVerhoeffValid = (value: string) => {
  let checksum = 0;
  [...value].reverse().forEach((character, index) => {
    const digit = Number(character);
    checksum = D_TABLE[checksum]?.[P_TABLE[index % 8]?.[digit] ?? 0] ?? checksum;
  });
  return checksum === 0;
};

export const normalizeAadhaarInput = (value: unknown) => normalizeDigits(value).slice(0, 12);

export const formatAadhaarNumber = (value: unknown): string => {
  const digits = normalizeAadhaarInput(value);
  if (!digits) return '';
  const parts: string[] = [];
  for (let i = 0; i < digits.length; i += 4) {
    parts.push(digits.slice(i, i + 4));
  }
  return parts.join(' ');
};

export const validateAadhaarNumber = (value: unknown): string | null => {
  const normalized = normalizeAadhaarInput(value);
  if (!normalized) {
    return 'Please enter a 12-digit Aadhaar number.';
  }
  if (normalized.length !== 12) {
    return `Aadhaar number must be exactly 12 digits (currently ${normalized.length} digits entered).`;
  }
  if (normalized[0] === '0' || normalized[0] === '1') {
    return `Aadhaar number cannot start with '${normalized[0]}'. Valid Aadhaar numbers start with digits 2 to 9.`;
  }
  if (!isVerhoeffValid(normalized)) {
    return 'Invalid Aadhaar number (checksum validation failed). Please verify all digits.';
  }
  return null;
};

export const maskAadhaar = (value: unknown) => {
  const normalized = normalizeDigits(value);
  return normalized.length >= 4 ? `XXXXXXXX${normalized.slice(-4)}` : 'XXXXXXXX';
};
