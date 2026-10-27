const isRecord = (value) => Boolean(value && typeof value === 'object' && !Array.isArray(value));

const textValue = (value) => {
  if (value === null || value === undefined || typeof value === 'object') return '';
  return String(value).trim();
};

export const getAadhaarDisplayFields = (value) => {
  const result = isRecord(value) ? value : {};
  return {
    name: textValue(result.fullName),
    maskedAadhaar: textValue(result.maskedAadhaar),
    dob: textValue(result.dob),
    gender: textValue(result.gender),
    mobile: textValue(result.mobileNumber),
    address: textValue(result.fullAddress),
    profileImage: textValue(result.profileImage),
    xmlUrl: textValue(result.xmlUrl),
  };
};

export const getAadhaarApiError = (error, fallback) => {
  const response = isRecord(error) && isRecord(error.response) ? error.response : {};
  const data = isRecord(response.data) ? response.data : {};
  const detail = textValue(data.error) || textValue(data.message);
  return detail || fallback;
};
