const collapseSpaces = (value: string) => value.replace(/\s+/g, ' ').trimStart();

const collapseMultilineSpaces = (value: string) =>
  value
    .replace(/\r/g, '')
    .split('\n')
    .map((line) => collapseSpaces(line))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n');

export const sanitizeDigitsOnly = (value: string, maxLength?: number) => {
  const digitsOnly = value.replace(/\D/g, '');
  return typeof maxLength === 'number' ? digitsOnly.slice(0, maxLength) : digitsOnly;
};

export const sanitizeTextOnly = (value: string, maxLength = 120) =>
  collapseSpaces(value.replace(/[^A-Za-z\s.'&/-]/g, '')).slice(0, maxLength);

export const sanitizeMixedText = (value: string, maxLength = 160) =>
  collapseSpaces(value.replace(/[^A-Za-z0-9\s.,&()/#%+\-]/g, '')).slice(0, maxLength);

export const sanitizeUppercaseCode = (value: string, maxLength = 40) =>
  collapseSpaces(value.toUpperCase().replace(/[^A-Z0-9\s/-]/g, '')).slice(0, maxLength);

export const sanitizeMultilineMixedText = (value: string, maxLength = 2000) =>
  collapseMultilineSpaces(value.replace(/[^A-Za-z0-9\s.,&()/#%+\-:\n]/g, '')).slice(0, maxLength);

const digitFieldMaxLength: Partial<Record<string, number>> = {
  price: 10,
  manufacturingYear: 4,
  registrationYear: 4,
  operatingHours: 8,
  pinCode: 6,
  previousOwners: 3,
  buyerPhone: 10,
  soldPrice: 10,
};

const textOnlyFields = new Set([
  'district',
  'buyerName',
]);

const mixedTextFields = new Set([
  'title',
  'brand',
  'brandName',
  'model',
  'modelName',
  'variant',
  'grossPower',
  'nearbyLandmark',
  'locationState',
  'locationCity',
  'state',
  'city',
  'buyerState',
  'buyerCity',
]);

const multilineFields = new Set([
  'overview',
  'description',
  'additionalDescription',
]);

const uppercaseCodeFields = new Set([
  'registrationNo',
  'chassisOrSerialNo',
]);

export const sanitizeListingFieldValue = (field: string, value: string) => {
  if (field === 'address') {
    return sanitizeMixedText(value, 240);
  }

  if (field in digitFieldMaxLength) {
    return sanitizeDigitsOnly(value, digitFieldMaxLength[field]);
  }

  if (textOnlyFields.has(field)) {
    return sanitizeTextOnly(value);
  }

  if (uppercaseCodeFields.has(field)) {
    return sanitizeUppercaseCode(value);
  }

  if (multilineFields.has(field)) {
    return sanitizeMultilineMixedText(value);
  }

  if (mixedTextFields.has(field)) {
    return sanitizeMixedText(value);
  }

  return value.trim();
};

export const sanitizeListingFormData = <T extends Record<string, unknown>>(form: T): T =>
  Object.fromEntries(
    Object.entries(form).map(([key, value]) => {
      if (typeof value !== 'string') {
        return [key, value];
      }

      return [key, sanitizeListingFieldValue(key, value)];
    }),
  ) as T;

export const isValidYearValue = (value: string) => value.length === 0 || /^\d{4}$/.test(value);

export const isValidPinCodeValue = (value: string) => value.length === 0 || /^\d{6}$/.test(value);

export const isValidDigitsOnlyValue = (value: string) => value.length === 0 || /^\d+$/.test(value);
