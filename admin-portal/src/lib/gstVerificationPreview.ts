type GstPreviewRecord = Record<string, unknown>;

export type GstVerificationTemplateField = [string, unknown];

const isRecord = (value: unknown): value is GstPreviewRecord => Boolean(value && typeof value === 'object' && !Array.isArray(value));

const hasValue = (value: unknown) => {
  if (value === undefined || value === null || value === '') return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'object') return Object.keys(value as Record<string, unknown>).length > 0;
  return true;
};

const getFirstValue = (sources: GstPreviewRecord[], keys: string[]) => {
  for (const source of sources) {
    for (const key of keys) {
      if (hasValue(source[key])) return source[key];
    }
  }
  return undefined;
};

const getFirstPresentValue = (sources: GstPreviewRecord[], keys: string[]) => {
  let emptyValue: unknown;
  for (const source of sources) {
    for (const key of keys) {
      if (Object.prototype.hasOwnProperty.call(source, key) && source[key] !== null && source[key] !== undefined && source[key] !== '') {
        if (hasValue(source[key])) return source[key];
        emptyValue ??= source[key];
      }
    }
  }
  return emptyValue;
};

// Keep this order and these labels aligned with the supplied GST verification PDF.
// Values are read from the normalized API result first, then from the retained provider
// payload for older verification records. No placeholder business data is introduced.
const GST_VERIFICATION_TEMPLATE_FIELDS: Array<[string, string[]]> = [
  ['Einvoice Status', ['einvoiceStatus', 'einvoice_status']],
  ['Client Id', ['providerClientId', 'client_id', 'clientId']],
  ['Gstin', ['gstin', 'gstin_number', 'id_number']],
  ['Pan Number', ['panNumber', 'pan_number']],
  ['Fy', ['annualTurnoverFy', 'annual_turnover_fy', 'fy']],
  ['Business Name', ['businessName', 'business_name']],
  ['Legal Name', ['legalName', 'legal_name']],
  ['Center Jurisdiction', ['centerJurisdiction', 'center_jurisdiction']],
  ['State Jurisdiction', ['stateJurisdiction', 'state_jurisdiction']],
  ['Date Of Registration', ['dateOfRegistration', 'date_of_registration']],
  ['Constitution Of Business', ['constitutionOfBusiness', 'constitution_of_business']],
  ['Taxpayer Type', ['taxpayerType', 'taxpayer_type']],
  ['Gstin Status', ['gstinStatus', 'gstin_status']],
  ['Date Of Cancellation', ['dateOfCancellation', 'date_of_cancellation']],
  ['Field Visit Conducted', ['fieldVisitConducted', 'field_visit_conducted']],
  ['Nature Bus Activities', ['natureOfBusinessActivities', 'nature_bus_activities']],
  ['Nature Of Core Business Activity Code', ['natureOfCoreBusinessActivityCode', 'nature_of_core_business_activity_code']],
  ['Nature Of Core Business Activity Description', ['natureOfCoreBusinessActivityDescription', 'nature_of_core_business_activity_description']],
  ['Aadhaar Validation', ['aadhaarValidation', 'aadhaar_validation']],
  ['Aadhaar Validation Date', ['aadhaarValidationDate', 'aadhaar_validation_date']],
  ['Filing Status', ['filingStatus', 'filing_status']],
  ['Address', ['address']],
  ['Filing Frequency', ['filingFrequency', 'filing_frequency']],
];

export const getGstVerificationTemplateFields = (result: GstPreviewRecord): GstVerificationTemplateField[] => {
  const providerData = isRecord(result.providerData) ? result.providerData : {};
  const sources = [result, providerData];

  return GST_VERIFICATION_TEMPLATE_FIELDS.flatMap(([label, keys]) => {
    const value = getFirstPresentValue(sources, keys);
    return value === undefined ? [] : [[label, value] as GstVerificationTemplateField];
  });
};

export const getGstPreviewFields = (result: GstPreviewRecord): Array<[string, unknown]> => {
  const providerData = isRecord(result.providerData) ? result.providerData : {};
  const sources = [result, providerData];
  const fields: Array<[string, string[]]> = [
    ['Legal name', ['legalName', 'legal_name']],
    ['Trade name', ['businessName', 'business_name']],
    ['GST status', ['gstinStatus', 'gstin_status']],
    ['Registration date', ['dateOfRegistration', 'date_of_registration']],
    ['Taxpayer type', ['taxpayerType', 'taxpayer_type']],
    ['Business constitution', ['constitutionOfBusiness', 'constitution_of_business']],
    ['Annual turnover', ['annualTurnover', 'annual_turnover']],
    ['Turnover financial year', ['annualTurnoverFy', 'annual_turnover_fy']],
    ['E-invoice eligible', ['einvoiceStatus', 'einvoice_status']],
    ['Address', ['address']],
    ['Promoters', ['promoters']],
    ['Business activities', ['natureOfBusinessActivities', 'nature_bus_activities']],
    ['Filing status', ['filingStatus', 'filing_status']],
    ['Filing frequency', ['filingFrequency', 'filing_frequency']],
    ['HSN information', ['hsnInfo', 'hsn_info']],
  ];

  return fields.flatMap(([label, keys]) => {
    const value = getFirstValue(sources, keys);
    return hasValue(value) ? [[label, value] as [string, unknown]] : [];
  });
};
