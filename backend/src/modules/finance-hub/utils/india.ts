// Indian identifiers used by the finance masters: GST state codes, GSTIN (with checksum),
// PAN, TAN, IFSC, PIN code and mobile normalisation.

export const GST_STATE_CODES: Record<string, string> = {
  '01': 'Jammu and Kashmir',
  '02': 'Himachal Pradesh',
  '03': 'Punjab',
  '04': 'Chandigarh',
  '05': 'Uttarakhand',
  '06': 'Haryana',
  '07': 'Delhi',
  '08': 'Rajasthan',
  '09': 'Uttar Pradesh',
  '10': 'Bihar',
  '11': 'Sikkim',
  '12': 'Arunachal Pradesh',
  '13': 'Nagaland',
  '14': 'Manipur',
  '15': 'Mizoram',
  '16': 'Tripura',
  '17': 'Meghalaya',
  '18': 'Assam',
  '19': 'West Bengal',
  '20': 'Jharkhand',
  '21': 'Odisha',
  '22': 'Chhattisgarh',
  '23': 'Madhya Pradesh',
  '24': 'Gujarat',
  '26': 'Dadra and Nagar Haveli and Daman and Diu',
  '27': 'Maharashtra',
  '29': 'Karnataka',
  '30': 'Goa',
  '31': 'Lakshadweep',
  '32': 'Kerala',
  '33': 'Tamil Nadu',
  '34': 'Puducherry',
  '35': 'Andaman and Nicobar Islands',
  '36': 'Telangana',
  '37': 'Andhra Pradesh',
  '38': 'Ladakh',
  '97': 'Other Territory',
};

const STATE_ALIASES: Record<string, string> = {
  'new delhi': '07',
  'nct of delhi': '07',
  orissa: '21',
  pondicherry: '34',
  'jammu & kashmir': '01',
  'andaman & nicobar islands': '35',
  'dadra and nagar haveli': '26',
  'daman and diu': '26',
};

const normalizeStateName = (value: string) => value.trim().toLowerCase().replace(/\s+/g, ' ');

export const stateCodeForName = (stateName: string | null | undefined) => {
  if (!stateName) return null;
  const normalized = normalizeStateName(stateName);
  if (STATE_ALIASES[normalized]) return STATE_ALIASES[normalized];
  const match = Object.entries(GST_STATE_CODES).find(([, name]) => normalizeStateName(name) === normalized);
  return match ? match[0] : null;
};

const GSTIN_CHARSET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const GSTIN_PATTERN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

const gstinCheckCharacter = (first14: string) => {
  let sum = 0;
  for (let index = 0; index < 14; index += 1) {
    const product = GSTIN_CHARSET.indexOf(first14.charAt(index)) * (index % 2 === 0 ? 1 : 2);
    sum += Math.floor(product / 36) + (product % 36);
  }
  return GSTIN_CHARSET.charAt((36 - (sum % 36)) % 36);
};

export const normalizeGstin = (value: unknown) =>
  typeof value === 'string' ? value.toUpperCase().replace(/[^0-9A-Z]/g, '') : '';

export const isValidGstin = (value: string) =>
  GSTIN_PATTERN.test(value) &&
  Boolean(GST_STATE_CODES[value.slice(0, 2)]) &&
  gstinCheckCharacter(value.slice(0, 14)) === value.charAt(14);

export const panFromGstin = (gstin: string) => gstin.slice(2, 12);

export const normalizeIdentifier = (value: unknown) =>
  typeof value === 'string' ? value.toUpperCase().replace(/[^0-9A-Z]/g, '') : '';

export const isValidPan = (value: string) => /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(value);
export const isValidTan = (value: string) => /^[A-Z]{4}[0-9]{5}[A-Z]$/.test(value);
export const isValidIfsc = (value: string) => /^[A-Z]{4}0[A-Z0-9]{6}$/.test(value);
export const isValidPinCode = (value: string) => /^[1-9][0-9]{5}$/.test(value);

/** Returns the 10-digit Indian mobile number, or null. Accepts +91 / 91 / 0 prefixes. */
export const normalizeIndianMobile = (value: unknown) => {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  let digits = String(value).replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2);
  if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  return /^[6-9][0-9]{9}$/.test(digits) ? digits : null;
};
