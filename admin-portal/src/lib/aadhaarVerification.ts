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
  [2, 7, 9, 5, 8, 0, 4, 3, 1, 6],
  [7, 0, 4, 1, 9, 5, 8, 2, 6, 3],
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

export const validateAadhaarNumber = (value: unknown) => {
  const normalized = normalizeAadhaarInput(value);
  return normalized.length === 12 && normalized[0] !== '0' && normalized[0] !== '1' && isVerhoeffValid(normalized)
    ? null
    : 'Enter a valid 12-digit Aadhaar number.';
};

export const maskAadhaar = (value: unknown) => {
  const normalized = normalizeDigits(value);
  return normalized.length >= 4 ? `XXXXXXXX${normalized.slice(-4)}` : 'XXXXXXXX';
};
