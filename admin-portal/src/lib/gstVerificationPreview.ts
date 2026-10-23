type GstPreviewRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is GstPreviewRecord => Boolean(value && typeof value === 'object' && !Array.isArray(value));

const isMaskedKey = (key: string) => key.toLowerCase().includes('masked') && !key.toLowerCase().startsWith('unmasked');

/**
 * Removes masking metadata from the GST preview without dropping any other
 * provider field. This is presentation-only; the API response remains intact.
 */
export const removeMaskedGstFields = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map((item) => removeMaskedGstFields(item));
  if (!isRecord(value)) return value;

  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !isMaskedKey(key))
      .map(([key, entryValue]) => [key, removeMaskedGstFields(entryValue)]),
  );
};

export const getUnmaskedGstPreviewResult = (result: GstPreviewRecord, fallbackGstin = ''): GstPreviewRecord => {
  const unmaskedResult = removeMaskedGstFields(result) as GstPreviewRecord;
  if (hasValue(unmaskedResult.gstin) || !fallbackGstin) return unmaskedResult;
  return { gstin: fallbackGstin, ...unmaskedResult };
};

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
