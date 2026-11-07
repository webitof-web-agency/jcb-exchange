export type AuthGstSource = {
  gstNumber?: string | null;
  record?: { legalName?: string | null } | null;
  result?: Record<string, unknown> | null;
} | null;

type AuthProfileSource = {
  gstNumber?: string | null;
  businessName?: string | null;
  businessAddress?: string | null;
  email?: string | null;
  primaryContact?: string | null;
  alternateMobile?: string | null;
  gstVerifiedMobile?: string | null;
  gstVerifiedEmail?: string | null;
  gstVerifiedAddress?: string | null;
};

type AuthDocumentSource = {
  documentType?: string | null;
  documentNumber?: string | null;
  nameOnDocument?: string | null;
  fileName?: string | null;
  fileUrl?: string | null;
  verificationResult?: Record<string, unknown> | null;
};

export type PartnerAuthKycFieldKey =
  | 'legalName'
  | 'aadhaar'
  | 'pan'
  | 'address'
  | 'photo'
  | 'email'
  | 'primaryMobile'
  | 'alternateMobile'
  | 'verifiedMobile'
  | 'verifiedEmail'
  | 'verifiedAddress';

export type PartnerAuthKycField = {
  key: PartnerAuthKycFieldKey;
  label: string;
  value: string;
  sensitive?: boolean;
};

const text = (value: unknown): string => typeof value === 'string' ? value.trim() : '';

const resultText = (result: Record<string, unknown> | null | undefined, key: string): string =>
  text(result?.[key]);

const findPanInProviderData = (value: unknown, depth = 0): string => {
  if (!value || typeof value !== 'object' || Array.isArray(value) || depth > 5) return '';
  const object = value as Record<string, unknown>;
  for (const key of ['panNumber', 'pan_number', 'pan']) {
    const candidate = text(object[key]);
    if (candidate) return candidate;
  }
  for (const nestedValue of Object.values(object)) {
    const nestedPan = findPanInProviderData(nestedValue, depth + 1);
    if (nestedPan) return nestedPan;
  }
  return '';
};

const VERIFIED_MOBILE_KEYS = new Set([
  'mobile', 'mobileNo', 'mobileNumber', 'mobile_number', 'phone', 'phoneNo',
  'phoneNumber', 'phone_number', 'contactNumber', 'contact_number', 'contactMobile',
]);

const VERIFIED_EMAIL_KEYS = new Set(['email', 'emailId', 'email_id', 'emailAddress', 'email_address']);

const canonicalKey = (key: string) => key.replace(/[^a-z0-9]/gi, '').toLowerCase();

const findProviderValueByKeys = (value: unknown, keys: Set<string>, depth = 0): string => {
  if (!value || typeof value !== 'object' || depth > 8) return '';
  if (Array.isArray(value)) {
    for (const nestedValue of value) {
      const found = findProviderValueByKeys(nestedValue, keys, depth + 1);
      if (found) return found;
    }
    return '';
  }
  const object = value as Record<string, unknown>;
  const normalizedKeys = new Set(Array.from(keys, canonicalKey));
  for (const [key, candidateValue] of Object.entries(object)) {
    if (normalizedKeys.has(canonicalKey(key))) {
      const candidate = text(candidateValue);
      if (candidate) return candidate;
      const nestedCandidate = findProviderValueByKeys(candidateValue, keys, depth + 1);
      if (nestedCandidate) return nestedCandidate;
    }
  }
  for (const nestedValue of Object.values(object)) {
    const found = findProviderValueByKeys(nestedValue, keys, depth + 1);
    if (found) return found;
  }
  return '';
};

const addressText = (result: Record<string, unknown> | null | undefined): string => {
  const direct = resultText(result, 'address');
  if (direct) return direct;

  const addressDetails = result?.addressDetails;
  if (typeof addressDetails === 'string') return addressDetails.trim();
  if (!addressDetails || typeof addressDetails !== 'object') return '';

  return Object.values(addressDetails as Record<string, unknown>)
    .map(text)
    .filter(Boolean)
    .join(', ');
};

const verifiedAddressText = (result: Record<string, unknown> | null | undefined): string => {
  if (!result) return '';
  const direct = addressText(result);
  if (direct) return direct;
  return findProviderValueByKeys(result, new Set([
    'address', 'registeredAddress', 'registered_address', 'principalAddress', 'principal_address',
  ]));
};

export const buildPartnerAuthGstSource = ({
  profile,
  documents,
}: {
  profile: Pick<AuthProfileSource, 'gstNumber'> | null | undefined;
  documents: AuthDocumentSource[];
}): AuthGstSource => {
  const gstDocument = documents.find((document) => document.documentType === 'GST_CERTIFICATE');
  if (!gstDocument && !profile?.gstNumber) return null;

  return {
    gstNumber: text(profile?.gstNumber) || text(gstDocument?.documentNumber),
    record: { legalName: text(gstDocument?.nameOnDocument) },
    result: gstDocument?.verificationResult || null,
  };
};

export const maskSensitiveValue = (value: string, visibleSuffix = 4): string => {
  const normalized = value.trim();
  if (!normalized) return '';
  if (normalized.length <= visibleSuffix) return '•'.repeat(normalized.length);
  return `${'*'.repeat(normalized.length - visibleSuffix)}${normalized.slice(-visibleSuffix)}`;
};

export const buildPartnerAuthKycFields = ({
  gst,
  profile,
  documents,
}: {
  gst: AuthGstSource;
  profile: AuthProfileSource | null | undefined;
  documents: AuthDocumentSource[];
}): PartnerAuthKycField[] => {
  const result = gst?.result;
  const findDocument = (documentType: string) => documents.find((document) => document.documentType === documentType);
  const aadhaarDocument = findDocument('AADHAAR_CARD');
  const panDocument = findDocument('PAN_CARD');
  const photoDocument = findDocument('PASSPORT_PHOTO');
  const legalName = gst?.record?.legalName?.trim() || resultText(result, 'legalName') || text(profile?.businessName);
  const providerData = result?.providerData;
  const gstin = resultText(result, 'gstin') || text(gst?.gstNumber);
  const pan = resultText(result, 'panNumber')
    || resultText(result, 'pan')
    || findPanInProviderData(providerData)
    || text(panDocument?.documentNumber)
    || (gstin.length === 15 ? gstin.slice(2, 12) : '');
  const address = addressText(result) || text(profile?.businessAddress);
  const verifiedMobile = findProviderValueByKeys(result, VERIFIED_MOBILE_KEYS)
    || text(profile?.gstVerifiedMobile);
  const verifiedEmail = findProviderValueByKeys(result, VERIFIED_EMAIL_KEYS)
    || text(profile?.gstVerifiedEmail);
  const verifiedAddress = verifiedAddressText(result) || text(profile?.gstVerifiedAddress);

  return [
    { key: 'legalName', label: 'Legal name', value: legalName },
    { key: 'aadhaar', label: 'Aadhaar', value: maskSensitiveValue(text(aadhaarDocument?.documentNumber)), sensitive: true },
    { key: 'pan', label: 'PAN', value: pan.toUpperCase() },
    { key: 'address', label: 'Address', value: address },
    { key: 'photo', label: 'Photo', value: text(photoDocument?.fileName) || (photoDocument?.fileUrl ? 'Uploaded photo' : '') },
    { key: 'email', label: 'Email', value: text(profile?.email) },
    { key: 'primaryMobile', label: 'Mobile Number', value: text(profile?.primaryContact) },
    { key: 'alternateMobile', label: 'Dealership alternate number', value: text(profile?.alternateMobile) },
    { key: 'verifiedMobile', label: 'GST verified mobile', value: verifiedMobile },
    { key: 'verifiedEmail', label: 'GST verified email', value: verifiedEmail },
    { key: 'verifiedAddress', label: 'GST verified address', value: verifiedAddress },
  ];
};
