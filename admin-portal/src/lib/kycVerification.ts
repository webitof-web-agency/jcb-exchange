export type KycVerificationDocumentType = 'PAN_CARD' | 'GST_CERTIFICATE' | 'AADHAAR_CARD';

export type KycVerificationDisplay = {
  maskedNumber: string;
  displayName: string;
  status: string;
  category: string;
  extra: string;
};

export type KycVerificationField = {
  label: string;
  value: string;
};

const PAN_PATTERN = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
const GSTIN_PATTERN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][A-Z0-9]Z[A-Z0-9]$/;

const objectOf = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};

const stringOf = (value: unknown) => typeof value === 'string' ? value.trim() : '';

export const normalizeKycDocumentNumber = (documentType: KycVerificationDocumentType, value: string) =>
  value.trim().toUpperCase().replace(/\s+/g, '').slice(0, documentType === 'PAN_CARD' ? 10 : 15);

export const validateKycDocumentNumber = (documentType: KycVerificationDocumentType, value: string) => {
  const normalized = normalizeKycDocumentNumber(documentType, value);
  if (documentType === 'PAN_CARD') {
    return normalized ? (PAN_PATTERN.test(normalized) ? null : 'Enter a valid PAN in the format ABCDE1234F.') : 'PAN number is required.';
  }

  if (documentType === 'GST_CERTIFICATE') {
    return normalized
      ? (GSTIN_PATTERN.test(normalized) ? null : 'Enter a valid 15-character GSTIN.')
      : 'GSTIN is required.';
  }

  return null;
};

export const isKycVerificationSuccessful = (
  documentType: KycVerificationDocumentType,
  result: Record<string, unknown> | null | undefined,
) => {
  if (!result) return false;
  if (documentType === 'PAN_CARD') {
    const details = objectOf(result.panDetails);
    const code = stringOf(details.panStatus).toUpperCase();
    const status = stringOf(details.status).toUpperCase();
    return code === 'E' || status.includes('EXISTING AND VALID') || status === 'VALID';
  }

  if (documentType === 'GST_CERTIFICATE') {
    return stringOf(result.gstinStatus).toUpperCase() === 'ACTIVE';
  }

  return false;
};

export const getKycVerificationDisplay = (
  documentType: KycVerificationDocumentType,
  result: Record<string, unknown> | null | undefined,
): KycVerificationDisplay => {
  const value = objectOf(result);
  if (documentType === 'PAN_CARD') {
    const details = objectOf(value.panDetails);
    const seedingStatus = stringOf(details.aadhaarSeedingStatus).toUpperCase();
    return {
      maskedNumber: stringOf(value.pan || value.panNumber),
      displayName: stringOf(details.fullName),
      status: stringOf(details.panStatusDescription || details.status),
      category: stringOf(details.category),
      extra: seedingStatus === 'Y' ? 'Aadhaar seeded' : seedingStatus === 'R' ? 'Aadhaar not seeded' : '',
    };
  }

  return {
    maskedNumber: stringOf(value.maskedGstin || value.gstin),
    displayName: stringOf(value.legalName || value.businessName),
    status: stringOf(value.gstinStatus),
    category: stringOf(value.taxpayerType),
    extra: stringOf(value.businessName),
  };
};

const addVerificationField = (fields: KycVerificationField[], label: string, value: unknown) => {
  const normalized = stringOf(value);
  if (normalized) fields.push({ label, value: normalized });
};

const getSafeAddress = (value: Record<string, unknown>) => {
  const directAddress = stringOf(value.address);
  if (directAddress) return directAddress;

  const addressDetails = objectOf(value.addressDetails);
  return Object.values(addressDetails)
    .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    .join(', ');
};

export const getKycVerificationFields = (
  documentType: KycVerificationDocumentType,
  result: Record<string, unknown> | null | undefined,
): KycVerificationField[] => {
  const value = objectOf(result);
  const fields: KycVerificationField[] = [];

  if (documentType === 'PAN_CARD') {
    const details = objectOf(value.panDetails);
    addVerificationField(fields, 'Masked PAN', value.pan || value.panNumber);
    addVerificationField(fields, 'Name', details.fullName);
    addVerificationField(fields, 'PAN status', details.panStatusDescription || details.status);
    addVerificationField(fields, 'Category', details.category);

    const seedingStatus = stringOf(details.aadhaarSeedingStatus).toUpperCase();
    const seedingDescription = seedingStatus === 'Y'
      ? 'Seeded'
      : seedingStatus === 'R'
        ? 'Not seeded'
        : details.aadhaarSeedingStatusDescription;
    addVerificationField(fields, 'Aadhaar seeding', seedingDescription);
    return fields;
  }

  addVerificationField(fields, 'Masked GSTIN', value.maskedGstin || value.gstin);
  addVerificationField(fields, 'Legal name', value.legalName);
  addVerificationField(fields, 'Trade name', value.businessName);
  addVerificationField(fields, 'GST status', value.gstinStatus);
  addVerificationField(fields, 'Registration date', value.dateOfRegistration);
  addVerificationField(fields, 'Taxpayer type', value.taxpayerType);
  addVerificationField(fields, 'Address', getSafeAddress(value));
  return fields;
};
