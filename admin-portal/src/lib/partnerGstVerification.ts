import type { GstResultResponse } from './gstVerification';

export type PartnerGstVerificationResponse = GstResultResponse & {
  available: boolean;
  gstNumber: string | null;
};

export const hasGstTemplateContent = (
  response: Pick<PartnerGstVerificationResponse, 'record' | 'result' | 'template'> | null | undefined,
) => Boolean(response && (response.result || response.template || response.record?.template));

/**
 * The KYC preview is the canonical GST certificate when the retained verified
 * result is available. A persisted template can be the legacy one-page
 * verification report created before the KYC certificate preview was wired.
 */
export const shouldRenderCanonicalGstTemplate = (
  response: Pick<PartnerGstVerificationResponse, 'result'> | null | undefined,
) => Boolean(response?.result);

export type GstDisplayField = {
  key: string;
  label: string;
  value: unknown;
};

export type GstDisplayGroup = {
  key: string;
  title: string;
  fields: GstDisplayField[];
};

const FIELD_LABELS: Record<string, string> = {
  gstin: 'GSTIN',
  maskedGstin: 'Masked GSTIN',
  legalName: 'Legal name',
  businessName: 'Trade / business name',
  gstinStatus: 'GST status',
  dateOfRegistration: 'Date of registration',
  dateOfCancellation: 'Date of cancellation',
  constitutionOfBusiness: 'Constitution of business',
  taxpayerType: 'Taxpayer type',
  address: 'Principal address',
  addressDetails: 'Address details',
  centerJurisdiction: 'Centre jurisdiction',
  stateJurisdiction: 'State jurisdiction',
  natureOfCoreBusinessActivityCode: 'Core business activity code',
  natureOfCoreBusinessActivityDescription: 'Core business activity',
  natureOfBusinessActivities: 'Nature of business activities',
  promoters: 'Promoters',
  contactDetails: 'Contact details',
  filingStatus: 'Filing status',
  filingFrequency: 'Filing frequency',
  einvoiceStatus: 'E-invoice status',
  annualTurnover: 'Annual turnover',
  annualTurnoverFy: 'Annual turnover financial year',
  percentageInCash: 'Percentage in cash',
  percentageInCashFy: 'Percentage in cash financial year',
  panNumber: 'PAN linked with GST',
  aadhaarValidation: 'Aadhaar validation status',
  aadhaarValidationDate: 'Aadhaar validation date',
  providerData: 'Provider response data',
};

const GROUP_DEFINITIONS: Array<{ key: string; title: string; fields: string[] }> = [
  {
    key: 'business',
    title: 'Business identity',
    fields: ['legalName', 'businessName', 'constitutionOfBusiness', 'taxpayerType'],
  },
  {
    key: 'registration',
    title: 'GST registration',
    fields: ['gstin', 'maskedGstin', 'gstinStatus', 'dateOfRegistration', 'dateOfCancellation', 'panNumber'],
  },
  {
    key: 'address',
    title: 'Registered address',
    fields: ['address', 'addressDetails', 'centerJurisdiction', 'stateJurisdiction'],
  },
  {
    key: 'operations',
    title: 'Business operations',
    fields: [
      'natureOfCoreBusinessActivityCode',
      'natureOfCoreBusinessActivityDescription',
      'natureOfBusinessActivities',
      'promoters',
      'contactDetails',
      'annualTurnover',
      'annualTurnoverFy',
      'percentageInCash',
      'percentageInCashFy',
      'einvoiceStatus',
      'aadhaarValidation',
      'aadhaarValidationDate',
    ],
  },
  {
    key: 'filings',
    title: 'Return and filing information',
    fields: ['filingStatus', 'filingFrequency'],
  },
];

const isPresent = (value: unknown) => {
  if (value === null || value === undefined || value === '') return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'object') return Object.keys(value as Record<string, unknown>).length > 0;
  return true;
};

export const formatGstFieldLabel = (key: string) => FIELD_LABELS[key] || key
  .replace(/([a-z])([A-Z])/g, '$1 $2')
  .replace(/[_-]+/g, ' ')
  .replace(/\b\w/g, (character) => character.toUpperCase());

export const buildGstDisplayGroups = (result: Record<string, unknown> | null): GstDisplayGroup[] => {
  const source = result || {};
  const usedKeys = new Set<string>();
  const groups = GROUP_DEFINITIONS.map((definition) => {
    const fields = definition.fields
      .filter((key) => isPresent(source[key]))
      .map((key) => {
        usedKeys.add(key);
        return { key, label: formatGstFieldLabel(key), value: source[key] };
      });
    return { ...definition, fields };
  }).filter((group) => group.fields.length > 0);

  const additionalFields = Object.entries(source)
    .filter(([key, value]) => !usedKeys.has(key) && isPresent(value))
    .map(([key, value]) => ({ key, label: formatGstFieldLabel(key), value }));

  if (additionalFields.length > 0) {
    groups.push({ key: 'additional', title: 'Additional verified data', fields: additionalFields });
  }

  return groups;
};
