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
  collapseSpaces(value.replace(/[^A-Za-z\s.]/g, '')).slice(0, maxLength);

export const sanitizeMixedText = (value: string, maxLength = 160) =>
  collapseSpaces(value.replace(/[^A-Za-z0-9\s.,&()/#%+\-]/g, '')).slice(0, maxLength);

export const sanitizeUppercaseCode = (value: string, maxLength = 40) =>
  value.toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, maxLength);

export const sanitizeEngineNumber = (value: string, maxLength = 40) =>
  value.toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, maxLength);

export const SELL_VEHICLE_AVAILABILITY_OPTIONS = ['AVAILABLE', 'SOLD'] as const;

export const normalizeSellVehicleAvailability = (value: string) => {
  const normalized = value.toUpperCase();
  if (normalized === 'SOLD') return 'SOLD';
  if (normalized === 'PENDING') return 'PENDING';
  return 'AVAILABLE';
};

export const sanitizeMultilineMixedText = (value: string, maxLength = 2000) =>
  collapseMultilineSpaces(value.replace(/[^A-Za-z0-9\s.,&()/#%+\-:\n]/g, '')).slice(0, maxLength);

const digitFieldMaxLength: Partial<Record<string, number>> = {
  price: 10,
  manufacturingYear: 4,
  registrationYear: 4,
  grossPower: 5,
  operatingHours: 8,
  pinCode: 6,
  previousOwners: 2,
  buyerPhone: 10,
  soldPrice: 10,
  rtoExpenses: 9,
  vehicleMaintenanceCost: 9,
};

const textOnlyFields = new Set([
  'district',
  'buyerName',
  'ownerName',
  'rtoAgentName',
]);

const mixedTextFields = new Set([
  'title',
  'brand',
  'brandName',
  'model',
  'modelName',
  'variant',
  'nearbyLandmark',
  'locationState',
  'locationCity',
  'state',
  'city',
  'buyerState',
  'buyerCity',
  'financerName',
  'rtoOffice',
]);

const multilineFields = new Set([
  'overview',
  'description',
  'additionalDescription',
]);

const uppercaseCodeFields = new Set([
  'registrationNo',
  'chassisOrSerialNo',
  'engineNumber',
  'hsrpNumber',
]);

export const handleDigitOnlyKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
  if (
    [
      'Backspace',
      'Delete',
      'Tab',
      'Escape',
      'Enter',
      'ArrowLeft',
      'ArrowRight',
      'ArrowUp',
      'ArrowDown',
      'Home',
      'End',
    ].includes(e.key) ||
    ((e.ctrlKey || e.metaKey) && ['a', 'c', 'v', 'x', 'z', 'A', 'C', 'V', 'X', 'Z'].includes(e.key))
  ) {
    return;
  }

  // Block any non-digit character (including 'e', 'E', '+', '-', '.', and symbols)
  if (!/^\d$/.test(e.key)) {
    e.preventDefault();
  }
};

export const handleAlphanumericKeyDown = (
  e: React.KeyboardEvent<HTMLInputElement>,
  allowHyphen = false,
) => {
  if (
    [
      'Backspace',
      'Delete',
      'Tab',
      'Escape',
      'Enter',
      'ArrowLeft',
      'ArrowRight',
      'ArrowUp',
      'ArrowDown',
      'Home',
      'End',
    ].includes(e.key) ||
    ((e.ctrlKey || e.metaKey) && ['a', 'c', 'v', 'x', 'z', 'A', 'C', 'V', 'X', 'Z'].includes(e.key))
  ) {
    return;
  }

  const valid = allowHyphen ? /^[a-zA-Z0-9-]$/.test(e.key) : /^[a-zA-Z0-9]$/.test(e.key);
  if (!valid) {
    e.preventDefault();
  }
};

export const handleTextOnlyKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
  if (
    [
      'Backspace',
      'Delete',
      'Tab',
      'Escape',
      'Enter',
      'ArrowLeft',
      'ArrowRight',
      'ArrowUp',
      'ArrowDown',
      'Home',
      'End',
    ].includes(e.key) ||
    ((e.ctrlKey || e.metaKey) && ['a', 'c', 'v', 'x', 'z', 'A', 'C', 'V', 'X', 'Z'].includes(e.key))
  ) {
    return;
  }

  if (!/^[a-zA-Z\s.]$/.test(e.key)) {
    e.preventDefault();
  }
};

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

  if (field === 'engineNumber') {
    return sanitizeEngineNumber(value);
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

export const isValidDateValue = (value: string) => {
  if (!value) return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
};

export const isValidPinCodeValue = (value: string) => value.length === 0 || /^\d{6}$/.test(value);

export const isValidDigitsOnlyValue = (value: string) => value.length === 0 || /^\d+$/.test(value);
