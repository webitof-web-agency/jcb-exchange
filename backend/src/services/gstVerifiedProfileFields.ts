type GstObject = Record<string, unknown>;

export type GstVerifiedProfileFields = {
  mobile: string;
  email: string;
  address: string;
};

const asObject = (value: unknown): GstObject | null => (
  value && typeof value === 'object' && !Array.isArray(value) ? value as GstObject : null
);

const text = (value: unknown) => typeof value === 'string' ? value.trim() : '';

const canonicalKey = (key: string) => key.replace(/[^a-z0-9]/gi, '').toLowerCase();

const findScalarByKeys = (value: unknown, keys: string[], depth = 0): string => {
  if (depth > 8 || value === null || value === undefined) return '';
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findScalarByKeys(item, keys, depth + 1);
      if (found) return found;
    }
    return '';
  }
  const object = asObject(value);
  if (!object) return '';

  const normalizedKeys = new Set(keys.map(canonicalKey));
  for (const [key, candidate] of Object.entries(object)) {
    if (normalizedKeys.has(canonicalKey(key))) {
      const found = text(candidate);
      if (found) return found;
    }
  }
  for (const candidate of Object.values(object)) {
    const found = findScalarByKeys(candidate, keys, depth + 1);
    if (found) return found;
  }
  return '';
};

const flattenAddress = (value: unknown, depth = 0): string => {
  if (depth > 8 || value === null || value === undefined) return '';
  const scalar = text(value);
  if (scalar) return scalar;
  if (Array.isArray(value)) {
    return value.map((item) => flattenAddress(item, depth + 1)).filter(Boolean).join(', ');
  }
  const object = asObject(value);
  if (!object) return '';

  const addressKeys = [
    'address', 'fullAddress', 'full_address', 'registeredAddress', 'registered_address',
    'principalAddress', 'principal_address', 'addressLine', 'address_line',
  ];
  for (const key of addressKeys) {
    const matchingKey = Object.keys(object).find((candidate) => canonicalKey(candidate) === canonicalKey(key));
    if (matchingKey) {
      const found = flattenAddress(object[matchingKey], depth + 1);
      if (found) return found;
    }
  }

  return Object.values(object)
    .map((item) => flattenAddress(item, depth + 1))
    .filter(Boolean)
    .join(', ');
};

const findAddress = (result: GstObject) => {
  const direct = findScalarByKeys(result, ['address', 'fullAddress', 'full_address']);
  if (direct) return direct;

  const addressDetails = findScalarByKeys(result, [
    'addressDetails', 'address_details', 'registeredAddress', 'registered_address',
    'principalAddress', 'principal_address',
  ]);
  if (addressDetails) return addressDetails;

  for (const key of ['addressDetails', 'address_details', 'contactDetails', 'contact_details', 'providerData']) {
    const matchingKey = Object.keys(result).find((candidate) => canonicalKey(candidate) === canonicalKey(key));
    if (matchingKey) {
      const flattened = flattenAddress(result[matchingKey]);
      if (flattened) return flattened;
    }
  }
  return '';
};

export const extractGstVerifiedProfileFields = (result: unknown): GstVerifiedProfileFields => {
  const object = asObject(result);
  if (!object) return { mobile: '', email: '', address: '' };

  return {
    mobile: findScalarByKeys(object, [
      'mobile', 'mobileNo', 'mobileNumber', 'mobile_number', 'phone', 'phoneNo',
      'phoneNumber', 'phone_number', 'contactNumber', 'contact_number', 'contactMobile',
    ]),
    email: findScalarByKeys(object, ['email', 'emailId', 'email_id', 'emailAddress', 'email_address']),
    address: findAddress(object),
  };
};
