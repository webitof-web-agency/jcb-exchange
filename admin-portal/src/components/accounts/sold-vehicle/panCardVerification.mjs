const isObject = (value) => Boolean(value && typeof value === 'object' && !Array.isArray(value));

const normalizeKey = (value) => value.replace(/[^a-z0-9]/gi, '').toLowerCase();

const previewValue = (value) => {
  if (value === null || value === undefined || value === '') return '-';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'object') return JSON.stringify(value, null, 2);
  return String(value);
};

export const findPanVerificationField = (value, keys) => {
  if (!isObject(value)) return undefined;
  const wantedKeys = new Set(keys.map(normalizeKey));

  for (const [key, entryValue] of Object.entries(value)) {
    if (wantedKeys.has(normalizeKey(key)) && entryValue !== null && entryValue !== undefined && entryValue !== '') {
      return entryValue;
    }
  }

  for (const entryValue of Object.values(value)) {
    const nestedValue = findPanVerificationField(entryValue, keys);
    if (nestedValue !== undefined) return nestedValue;
  }

  return undefined;
};

const optionalString = (value) => {
  const normalized = previewValue(value);
  return normalized === '-' ? undefined : normalized;
};

export const buildPanCardData = (preview, result) => {
  const response = isObject(preview?.response) ? preview.response : {};
  const record = isObject(response.record) ? response.record : {};
  const panNumber = optionalString(preview?.number) || previewValue(findPanVerificationField(result, ['pan', 'panNumber']));
  const name = previewValue(findPanVerificationField(result, ['fullName', 'name']));
  const fatherName = previewValue(findPanVerificationField(result, ['fatherName', 'father', 'fathersName']));
  const dob = previewValue(findPanVerificationField(result, ['dateOfBirth', 'dob', 'birthDate']));
  const maskedAadhaar = previewValue(findPanVerificationField(result, ['maskedAadhaar', 'maskedAadhar', 'maskedAadhaarNumber', 'aadhaar', 'aadhar']));
  const dateOfIssue = optionalString(findPanVerificationField(result, ['dateOfIssue', 'dateOfVerification', 'verifiedAt', 'createdAt']))
    || optionalString(findPanVerificationField(record, ['dateOfIssue', 'dateOfVerification', 'verifiedAt', 'createdAt']))
    || '';
  const photoUrl = optionalString(findPanVerificationField(result, ['photoUrl', 'photo', 'profilePhoto', 'profileImage']));
  const signatureUrl = optionalString(findPanVerificationField(result, ['signatureUrl', 'signature', 'signatureImage']));
  const qrData = optionalString(findPanVerificationField(result, ['qrData', 'qrCode', 'qrPayload']))
    || `PAN:${panNumber}|NAME:${name}|FATHER:${fatherName}|DOB:${dob}`;

  return {
    panNumber,
    name,
    fatherName,
    dob,
    dateOfIssue,
    ...(photoUrl ? { photoUrl } : {}),
    ...(signatureUrl ? { signatureUrl } : {}),
    signatureText: name === '-' ? '' : name,
    qrData,
    maskedAadhaar,
  };
};
