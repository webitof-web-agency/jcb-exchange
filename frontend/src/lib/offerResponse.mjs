// Pure helpers for the public offer page (/offer-response/[token]). The rules mirror the backend
// (backend/src/utils/offerAcceptanceEvidence.ts): the backend checks everything again; these only give
// the candidate a clear message before anything is sent.

export const SIGN_METHODS = /** @type {const} */ (['TYPED', 'DRAWN', 'UPLOADED_SCAN']);

export const MAX_SIGNED_COPY_BYTES = 5 * 1024 * 1024;
/** Same rule as the server: names and places in English letters (the letter and certificate are in English). */
export const LATIN_TEXT = /^[A-Za-z0-9À-ÿ .,'()/&-]+$/;
export const MAX_DRAWN_SIGNATURE_BYTES = 300 * 1024;
export const SIGNED_COPY_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
const SIGNED_COPY_EXTENSIONS = ['pdf', 'jpg', 'jpeg', 'png', 'webp'];

/** "Dr. Ravi  K. Sharma" and "ravi k sharma" compare equal (same rule as the server). */
export const normalizePersonName = (value) =>
  String(value ?? '').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

export const namesMatch = (typed, onRecord) => {
  const a = normalizePersonName(typed);
  return a !== '' && a === normalizePersonName(onRecord);
};

/** The rough size in bytes of a base64 data URL's payload. */
export const dataUrlBytes = (dataUrl) => {
  const comma = String(dataUrl ?? '').indexOf(',');
  if (comma < 0) return 0;
  const base64 = String(dataUrl).slice(comma + 1);
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((base64.length * 3) / 4) - padding);
};

/**
 * Checks a signed-copy file before upload. Returns an error message or null.
 * @param {{ name: string; size: number; type: string } | null | undefined} file
 */
export const checkSignedCopyFile = (file) => {
  if (!file) return 'Choose the signed offer letter to upload.';
  const extension = String(file.name ?? '').split('.').pop()?.toLowerCase() ?? '';
  // The browser must name the type: the server checks it (a file without a type is refused there).
  const typeOk = SIGNED_COPY_TYPES.includes(file.type);
  if (!typeOk || !SIGNED_COPY_EXTENSIONS.includes(extension)) return 'Upload a PDF, JPG, PNG or WEBP file.';
  if (file.size <= 0) return 'The file is empty.';
  if (file.size > MAX_SIGNED_COPY_BYTES) return 'The file is larger than 5 MB. Please upload a smaller scan or photo.';
  return null;
};

/**
 * Checks the acceptance form. Returns a map of field -> message (empty when everything is fine).
 * @param {{ method: string; fullName: string; place: string; consent: boolean; drawnSignature?: string | null; file?: { name: string; size: number; type: string } | null }} form
 * @param {string} candidateName
 */
export const validateAcceptanceForm = (form, candidateName) => {
  /** @type {Record<string, string>} */
  const errors = {};
  if (!SIGN_METHODS.includes(form.method)) errors.method = 'Choose how you want to sign.';
  const fullName = String(form.fullName ?? '').trim().replace(/\s+/g, ' ');
  if (fullName.length < 2 || fullName.length > 160) errors.fullName = 'Enter your full name as it appears on the offer letter.';
  else if (!namesMatch(fullName, candidateName)) errors.fullName = `The name must match the name on the offer letter (${candidateName}).`;
  const place = String(form.place ?? '').trim();
  if (place.length < 2 || place.length > 120) errors.place = 'Enter the place (city) where you are signing.';
  else if (!LATIN_TEXT.test(place)) errors.place = 'Write the place in English letters (for example Pune).';
  if (!form.consent) errors.consent = 'Please confirm that you have read the offer letter and accept it.';
  if (form.method === 'DRAWN') {
    const data = form.drawnSignature ?? '';
    if (!data.startsWith('data:image/png;base64,')) errors.signature = 'Draw your signature in the box.';
    else if (dataUrlBytes(data) > MAX_DRAWN_SIGNATURE_BYTES) errors.signature = 'The signature is too large. Clear it and draw it again.';
  }
  if (form.method === 'UPLOADED_SCAN') {
    const fileError = checkSignedCopyFile(form.file);
    if (fileError) errors.file = fileError;
  }
  return errors;
};

/** A decline needs a reason of 3 to 1000 characters. */
export const validateDeclineReason = (reason) => {
  const length = String(reason ?? '').trim().length;
  if (length < 3) return 'Please tell us briefly why you are declining (at least 3 characters).';
  if (length > 1000) return 'Please keep the reason under 1000 characters.';
  return null;
};

const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
export const formatInr = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? inr.format(number) : '-';
};

/** Monthly / yearly totals of a salary breakup. */
export const salaryBreakupTotals = (components) => {
  let gross = 0;
  let ctc = 0;
  for (const component of components ?? []) {
    const amount = Number(component?.monthlyAmount) || 0;
    ctc += amount;
    if (component?.componentType === 'EARNING') gross += amount;
  }
  return { grossMonthly: gross, ctcMonthly: ctc, grossYearly: gross * 12, ctcYearly: ctc * 12 };
};

export const formatDate = (value) => {
  if (!value) return '-';
  const date = new Date(typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00` : value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }).format(date);
};

export const formatDateTime = (value) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true,
  }).format(date) + ' IST';
};

export const EMPLOYMENT_TYPE_LABELS = {
  FULL_TIME: 'Full time',
  PART_TIME: 'Part time',
  CONTRACT: 'Contract',
  INTERNSHIP: 'Internship',
  TEMPORARY: 'Temporary',
  FREELANCE: 'Freelance',
};

export const ACCEPTANCE_METHOD_LABELS = {
  TYPED: 'Typed name',
  DRAWN: 'Drawn signature',
  UPLOADED_SCAN: 'Uploaded signed copy',
  OFFLINE_HR: 'Signed paper copy recorded by HR',
};

/** Probation is stored as months ("6") or free text. */
export const describeMonths = (value) => {
  const text = String(value ?? '').trim();
  if (!text) return '-';
  return /^\d+$/.test(text) ? `${text} month${text === '1' ? '' : 's'}` : text;
};

export const describeDays = (value) => {
  const text = String(value ?? '').trim();
  if (!text) return '-';
  return /^\d+$/.test(text) ? `${text} day${text === '1' ? '' : 's'}` : text;
};
