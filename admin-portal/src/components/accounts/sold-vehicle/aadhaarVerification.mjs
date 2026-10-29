const isObject = (value) => Boolean(value && typeof value === 'object' && !Array.isArray(value));

export const getAadhaarVerificationRecordId = (preview) => {
  const record = isObject(preview?.response?.record) ? preview.response.record : null;
  return typeof record?.id === 'string'
    && record.id.trim()
    && typeof record.maskedAadhaar === 'string'
    && record.maskedAadhaar.trim()
    ? record.id.trim()
    : '';
};

const normalizeKey = (value) => value.replace(/[^a-z0-9]/gi, '').toLowerCase();

const optionalString = (value) => {
  if (value === null || value === undefined || value === '') return undefined;
  if (typeof value === 'object') return undefined;
  return String(value).trim() || undefined;
};

const completeAadhaarNumber = (value) => {
  const digits = optionalString(value)?.replace(/\D/g, '') || '';
  return digits.length === 12 ? digits : undefined;
};

const findField = (value, keys) => {
  if (!isObject(value)) return undefined;
  const wantedKeys = new Set(keys.map(normalizeKey));
  for (const [key, entryValue] of Object.entries(value)) {
    if (wantedKeys.has(normalizeKey(key)) && entryValue !== null && entryValue !== undefined && entryValue !== '') {
      return entryValue;
    }
  }
  for (const entryValue of Object.values(value)) {
    const nestedValue = findField(entryValue, keys);
    if (nestedValue !== undefined) return nestedValue;
  }
  return undefined;
};

const findObject = (value, keys) => {
  const result = findField(value, keys);
  return isObject(result) ? result : {};
};

const addressText = (address) => [
  address.fullAddress,
  address.line1,
  address.line_1,
  address.line2,
  address.line_2,
  address.streetName,
  address.street_name,
  address.vtc,
  address.po,
  address.subDistrict,
  address.sub_district,
  address.district,
  address.state,
  address.pinCode,
  address.pincode,
  address.zip,
  address.country,
].map(optionalString).filter(Boolean).join(', ');

export const buildAadhaarCardData = (preview, result) => {
  const record = isObject(preview?.response?.record) ? preview.response.record : {};
  const address = findObject(result, ['address', 'addressDetails', 'address_details']);
  const providerAadhaarNumber = optionalString(findField(result, [
    'aadhaarNumber',
    'aadhaar_number',
    'maskedAadhaar',
    'masked_aadhaar',
    'aadhaar',
    'aadhar',
  ]));
  const aadhaarNumber = completeAadhaarNumber(preview?.number) || providerAadhaarNumber || optionalString(preview?.number);
  const nameEnglish = optionalString(findField(result, ['nameEnglish', 'name_english', 'fullName', 'full_name', 'name']));
  const nameHindi = optionalString(findField(result, ['nameHindi', 'name_hindi']));
  const dob = optionalString(findField(result, ['dob', 'dateOfBirth', 'date_of_birth', 'birthDate']));
  const gender = optionalString(findField(result, ['gender', 'sex']));
  const genderHindi = optionalString(findField(result, ['genderHindi', 'gender_hindi']));
  const photoUrl = optionalString(findField(result, ['photoUrl', 'photo_url', 'photo', 'profileImage', 'profile_image', 'image']));
  const issueDate = optionalString(findField(result, ['issueDate', 'issue_date', 'dateOfIssue', 'date_of_issue']))
    || optionalString(findField(record, ['issueDate', 'issue_date', 'dateOfIssue', 'date_of_issue']));
  const addressEnglish = optionalString(findField(result, ['fullAddress', 'full_address'])) || optionalString(findField(address, ['full', 'fullAddress', 'full_address', 'addressEnglish', 'address_english'])) || addressText(address) || undefined;
  const addressHindi = optionalString(findField(result, ['addressHindi', 'address_hindi'])) || undefined;
  const xmlUrl = optionalString(findField(result, ['xmlUrl', 'xml_url']));
  const qrData = optionalString(findField(result, ['qrData', 'qr_data', 'qrPayload', 'qr_payload'])) || (xmlUrl?.startsWith('https://') ? xmlUrl : undefined);
  const fatherName = optionalString(findField(result, ['fatherName', 'father_name', 'careOf', 'care_of']));

  return {
    aadhaarNumber: aadhaarNumber || '—',
    nameEnglish: nameEnglish || '—',
    nameHindi: nameHindi || '—',
    fatherNameHindi: '—',
    fatherNameEnglish: '—',
    dob: dob || '—',
    gender: gender || '—',
    genderHindi: genderHindi || '—',
    issueDate: issueDate || '—',
    addressEnglish: addressEnglish || '—',
    addressHindi: addressHindi || '—',
    ...(photoUrl ? { photoUrl } : {}),
    ...(qrData ? { qrData } : {}),
    ...(xmlUrl?.startsWith('https://') ? { qrUrl: xmlUrl } : {}),
    ...(fatherName ? { fatherNameEnglish: fatherName } : {}),
  };
};

const sharedAadhaarValue = (value) => {
  const text = optionalString(value);
  return text && text !== 'â€”' ? text : undefined;
};

export const buildSharedAadhaarTemplateData = (preview, result) => {
  const cardData = buildAadhaarCardData(preview, result);
  const address = findObject(result, ['address', 'addressDetails', 'address_details']);
  const addressValue = (keys) => sharedAadhaarValue(findField(address, keys));
  const addressData = {
    country: addressValue(['country']),
    district: addressValue(['district']),
    state: addressValue(['state']),
    postOffice: addressValue(['postOffice', 'post_office', 'po']),
    house: addressValue(['house', 'houseNumber', 'house_number', 'hNo', 'h_no']),
    locality: addressValue(['locality', 'area', 'colony']),
    vtc: addressValue(['vtc', 'village', 'town', 'city']),
    subDistrict: addressValue(['subDistrict', 'sub_district', 'tehsil']),
    street: addressValue(['street', 'streetName', 'street_name']),
    landmark: addressValue(['landmark']),
    pincode: addressValue(['pincode', 'pinCode', 'pin_code', 'zip']),
  };

  return {
    fullName: sharedAadhaarValue(cardData.nameEnglish),
    fatherName: sharedAadhaarValue(cardData.fatherNameEnglish),
    careOf: sharedAadhaarValue(cardData.fatherNameEnglish),
    maskedAadhaar: sharedAadhaarValue(cardData.aadhaarNumber),
    dob: sharedAadhaarValue(cardData.dob),
    gender: sharedAadhaarValue(cardData.gender),
    mobileNumber: sharedAadhaarValue(findField(result, ['mobileNumber', 'mobile_number', 'mobile'])),
    profileImage: sharedAadhaarValue(cardData.photoUrl),
    issueDate: sharedAadhaarValue(cardData.issueDate),
    nameHindi: sharedAadhaarValue(cardData.nameHindi),
    addressHindi: sharedAadhaarValue(cardData.addressHindi),
    qrData: sharedAadhaarValue(cardData.qrData),
    qrPayload: sharedAadhaarValue(cardData.qrData),
    address: Object.fromEntries(Object.entries(addressData).filter(([, value]) => value)),
  };
};

export const hasAadhaarCardData = (data) => Boolean(
  data && ['aadhaarNumber', 'nameEnglish', 'dob', 'gender', 'addressEnglish', 'photoUrl'].some((key) => {
    const value = optionalString(data[key]);
    return Boolean(value && value !== '—');
  }),
);
