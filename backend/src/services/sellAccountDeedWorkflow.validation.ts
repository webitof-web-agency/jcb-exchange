export type DeedWorkflowSide = 'PURCHASE' | 'SALE';

type SecurePdfDocument = {
  fileUrl?: unknown;
  absoluteUrl?: unknown;
  mimeType?: unknown;
  originalName?: unknown;
};

type EstampState = { code: string; name: string };

const ESTAMP_STATES: EstampState[] = [
  { code: 'AN', name: 'Andaman and Nicobar Islands' }, { code: 'AP', name: 'Andhra Pradesh' },
  { code: 'AR', name: 'Arunachal Pradesh' }, { code: 'AS', name: 'Assam' }, { code: 'BR', name: 'Bihar' },
  { code: 'CH', name: 'Chandigarh' }, { code: 'CT', name: 'Chhattisgarh' }, { code: 'DL', name: 'Delhi' },
  { code: 'GA', name: 'Goa' }, { code: 'GJ', name: 'Gujarat' }, { code: 'HR', name: 'Haryana' },
  { code: 'HP', name: 'Himachal Pradesh' }, { code: 'JH', name: 'Jharkhand' },
  { code: 'JK', name: 'Jammu and Kashmir' }, { code: 'KA', name: 'Karnataka' }, { code: 'KL', name: 'Kerala' },
  { code: 'MH', name: 'Maharashtra' }, { code: 'ML', name: 'Meghalaya' }, { code: 'MN', name: 'Manipur' },
  { code: 'MP', name: 'Madhya Pradesh' }, { code: 'MZ', name: 'Mizoram' }, { code: 'OR', name: 'Odisha' },
  { code: 'PB', name: 'Punjab' }, { code: 'PY', name: 'Puducherry' }, { code: 'RJ', name: 'Rajasthan' },
  { code: 'SK', name: 'Sikkim' }, { code: 'TG', name: 'Telangana' }, { code: 'TN', name: 'Tamil Nadu' },
  { code: 'TR', name: 'Tripura' }, { code: 'UP', name: 'Uttar Pradesh' }, { code: 'UT', name: 'Uttarakhand' },
  { code: 'WB', name: 'West Bengal' },
];

const normalizeStateKey = (value: string) => value.trim().toLowerCase().replace(/[._-]+/g, ' ').replace(/\s+/g, ' ');

const STATE_ALIASES = new Map<string, string>([
  ['national capital territory of delhi', 'DL'],
  ['nct of delhi', 'DL'],
  ['orissa', 'OR'],
  ['pondicherry', 'PY'],
]);

const stringValue = (value: unknown) => typeof value === 'string' ? value.trim() : '';
const wholeNumber = (value: unknown, field: string, min: number, max: number) => {
  const number = typeof value === 'number' ? value : Number(stringValue(value));
  if (!Number.isSafeInteger(number) || number < min || number > max) {
    throw new DeedWorkflowValidationError(`${field} is invalid.`, 'invalid_deed_workflow');
  }
  return number;
};

export class DeedWorkflowValidationError extends Error {
  constructor(message: string, public readonly code: 'deed_pdf_required' | 'invalid_deed_workflow') {
    super(message);
    this.name = 'DeedWorkflowValidationError';
  }
}

export const resolveEstampState = (value: unknown): EstampState => {
  const raw = stringValue(value);
  const code = raw.toUpperCase();
  const byCode = ESTAMP_STATES.find((state) => state.code === code);
  if (byCode) return byCode;

  const key = normalizeStateKey(raw);
  const alias = STATE_ALIASES.get(key);
  const byName = ESTAMP_STATES.find((state) => normalizeStateKey(state.name) === key || state.code === alias);
  if (!byName) throw new DeedWorkflowValidationError('Select a supported stamp execution state.', 'invalid_deed_workflow');
  return byName;
};

export const normalizeDeedWorkflowStart = (input: Record<string, unknown>, document: SecurePdfDocument) => {
  if (stringValue(document.mimeType) !== 'application/pdf') {
    throw new DeedWorkflowValidationError('A PDF deed is required before eSign can start.', 'deed_pdf_required');
  }

  const fileUrl = stringValue(document.fileUrl);
  const absoluteUrl = stringValue(document.absoluteUrl);
  if (!fileUrl || !absoluteUrl) {
    throw new DeedWorkflowValidationError('The uploaded deed file is unavailable.', 'deed_pdf_required');
  }

  const side = stringValue(input.side).toUpperCase();
  if (side !== 'PURCHASE' && side !== 'SALE') {
    throw new DeedWorkflowValidationError('Deed side is invalid.', 'invalid_deed_workflow');
  }

  const signerName = stringValue(input.signerName).replace(/\s+/g, ' ');
  if (signerName.length < 2 || signerName.length > 120) {
    throw new DeedWorkflowValidationError('Signer name is invalid.', 'invalid_deed_workflow');
  }

  const signerMobile = stringValue(input.signerMobile).replace(/\D/g, '');
  if (!/^[6-9]\d{9}$/.test(signerMobile)) {
    throw new DeedWorkflowValidationError('Enter a valid 10-digit signer mobile number.', 'invalid_deed_workflow');
  }

  const signerEmail = stringValue(input.signerEmail).toLowerCase();
  if (signerEmail && (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(signerEmail) || signerEmail.length > 254)) {
    throw new DeedWorkflowValidationError('Signer email is invalid.', 'invalid_deed_workflow');
  }

  const state = resolveEstampState(input.executionState);
  return {
    side: side as DeedWorkflowSide,
    executionStateCode: state.code,
    executionStateName: state.name,
    articleId: wholeNumber(input.articleId, 'Stamp article', 1, 1_000_000),
    stampDuty: wholeNumber(input.stampDuty, 'Stamp duty', 1, 10_000_000),
    considerationAmount: wholeNumber(input.considerationAmount, 'Consideration amount', 1, 1_000_000_000),
    signerName,
    signerMobile,
    ...(signerEmail ? { signerEmail } : {}),
    signature: {
      page: wholeNumber(input.signaturePage, 'Signature page', 1, 1_000),
      x: wholeNumber(input.signatureX, 'Signature X coordinate', 0, 10_000),
      y: wholeNumber(input.signatureY, 'Signature Y coordinate', 0, 10_000),
    },
  };
};
