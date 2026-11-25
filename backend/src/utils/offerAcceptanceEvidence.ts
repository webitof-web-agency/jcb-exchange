import { createHash } from 'node:crypto';
import PDFDocument from 'pdfkit';

/**
 * Pure parts of an offer acceptance (no database): which signing methods exist, checking what the candidate sent,
 * fingerprints, and the acceptance certificate PDF. Used by services/offerAcceptance.service.ts.
 */

export const ACCEPTANCE_METHODS = ['TYPED', 'DRAWN', 'UPLOADED_SCAN', 'OFFLINE_HR'] as const;
export type AcceptanceMethod = (typeof ACCEPTANCE_METHODS)[number];
export const CANDIDATE_ACCEPTANCE_METHODS = ['TYPED', 'DRAWN', 'UPLOADED_SCAN'] as const;

export const MAX_DRAWN_SIGNATURE_BYTES = 300 * 1024;
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export const sha256Hex = (buffer: Buffer) => createHash('sha256').update(buffer).digest('hex');

/** "Dr. Ravi  K. Sharma" and "ravi k sharma" are compared without titles' dots, case or spacing. */
export const normalizePersonName = (value: string) => value.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
export const namesMatch = (typed: string, onRecord: string) => normalizePersonName(typed) !== '' && normalizePersonName(typed) === normalizePersonName(onRecord);

/** A drawn signature arrives as a PNG data URL; anything else (or too small / too big) is refused. */
export const decodeDrawnSignature = (dataUrl: unknown): Buffer | null => {
  if (typeof dataUrl !== 'string') return null;
  const match = /^data:image\/png;base64,([A-Za-z0-9+/]+={0,2})$/.exec(dataUrl.trim());
  if (!match?.[1]) return null;
  const buffer = Buffer.from(match[1], 'base64');
  if (buffer.length < 200 || buffer.length > MAX_DRAWN_SIGNATURE_BYTES) return null;
  if (!buffer.subarray(0, 8).equals(PNG_MAGIC)) return null;
  return buffer;
};

export type CandidateAcceptanceInput = {
  method: (typeof CANDIDATE_ACCEPTANCE_METHODS)[number];
  fullName: string;
  place: string;
};

/** Checks what the candidate sent with "Accept". The scan file itself is checked by the upload middleware. */
export const validateCandidateAcceptance = (
  body: Record<string, unknown>,
  candidateName: string,
  hasFile: boolean,
): { value: CandidateAcceptanceInput; drawn: Buffer | null } | { error: string } => {
  const method = typeof body.method === 'string' ? body.method.trim().toUpperCase() : '';
  if (!(CANDIDATE_ACCEPTANCE_METHODS as readonly string[]).includes(method)) return { error: 'Choose how you want to sign: type your name, draw your signature, or upload the signed letter.' };
  const fullName = typeof body.fullName === 'string' ? body.fullName.trim().replace(/\s+/g, ' ') : '';
  if (fullName.length < 2 || fullName.length > 160) return { error: 'Enter your full name as it appears on the offer letter.' };
  if (!LATIN_TEXT.test(fullName)) return { error: 'Write your name in English letters, as on the offer letter.' };
  if (!namesMatch(fullName, candidateName)) return { error: `The name must match the name on the offer letter (${candidateName}).` };
  const place = typeof body.place === 'string' ? body.place.trim().replace(/\s+/g, ' ') : '';
  if (place.length < 2 || place.length > 120) return { error: 'Enter the place (city) where you are signing.' };
  if (!LATIN_TEXT.test(place)) return { error: 'Write the place in English letters (for example Pune).' };
  const consent = body.consent === true || body.consent === 'true' || body.consent === '1';
  if (!consent) return { error: 'Please confirm that you have read the offer letter and accept it.' };

  let drawn: Buffer | null = null;
  if (method === 'DRAWN') {
    drawn = decodeDrawnSignature(body.drawnSignature);
    if (!drawn) return { error: 'Draw your signature in the box before accepting.' };
  }
  if (method === 'UPLOADED_SCAN' && !hasFile) return { error: 'Upload the signed offer letter (PDF, JPG or PNG).' };
  return { value: { method: method as CandidateAcceptanceInput['method'], fullName, place }, drawn };
};

export type CertificateInput = {
  /** HR entered only the signing date (paper copy): show the date, not a time. */
  dateOnly?: boolean;
  companyName: string;
  letterNo: string;
  candidateName: string;
  designation: string;
  department: string;
  placeOfPosting: string;
  joiningDate: string;
  method: AcceptanceMethod;
  acceptedName: string;
  place: string;
  acceptedAt: Date;
  ipAddress: string | null;
  userAgent: string | null;
  documentHash: string;
  signatureHash: string | null;
  signatureImage: Buffer | null;
  recordedBy: string | null;
  note: string | null;
};

export const METHOD_LABELS: Record<AcceptanceMethod, string> = {
  TYPED: 'Typed name on the secure offer link',
  DRAWN: 'Signature drawn on the secure offer link',
  UPLOADED_SCAN: 'Signed letter uploaded on the secure offer link',
  OFFLINE_HR: 'Signed paper letter recorded by HR',
};

const istDateTime = (date: Date) => new Intl.DateTimeFormat('en-IN', {
  timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true,
}).format(date) + ' IST';

const istDate = (date: Date) => new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric' }).format(date);

/**
 * The PDF uses the built-in fonts, which draw Latin (WinAnsi) characters only. Names and places are checked to be
 * Latin on input; anything else that reaches the certificate (an old record, a pasted symbol) becomes "?" instead of
 * garbage glyphs.
 */
export const pdfSafeText = (value: string) => value.normalize('NFKC').replace(/[^\x20-\x7E\u00A0-\u00FF\u2013\u2014\u2018\u2019\u201C\u201D\u20B9]/g, '?');

/** Names and places are written in English letters (like the offer letter itself). */
export const LATIN_TEXT = /^[A-Za-z0-9\u00C0-\u00FF .,'()\/&-]+$/;

/** The acceptance certificate (A4 PDF). */
export const buildAcceptanceCertificatePdf = (input: CertificateInput) => new Promise<Buffer>((resolve, reject) => {
  const document = new PDFDocument({ size: 'A4', margin: 48, info: { Title: `Offer Acceptance Certificate ${input.letterNo}` } });
  const chunks: Buffer[] = [];
  document.on('data', (chunk: Buffer) => chunks.push(chunk));
  document.once('error', reject);
  document.once('end', () => resolve(Buffer.concat(chunks)));

  document.fillColor('#111827').font('Helvetica-Bold').fontSize(18).text(input.companyName.toUpperCase(), { align: 'center' })
    .moveDown(0.3).fontSize(14).text('Offer Acceptance Certificate', { align: 'center' })
    .moveDown(0.2).font('Helvetica').fontSize(9).fillColor('#64748b')
    .text('Electronic record of the candidate\'s acceptance of the offer letter referred to below.', { align: 'center' });
  document.moveDown(1.2);

  const row = (label: string, value: string) => {
    const y = document.y;
    document.font('Helvetica-Bold').fontSize(9.5).fillColor('#334155').text(label, 48, y, { width: 165 });
    document.font('Helvetica').fontSize(9.5).fillColor('#111827').text(pdfSafeText(value || '-'), 220, y, { width: 327 });
    document.moveDown(0.45);
  };
  row('Offer letter no.', input.letterNo);
  row('Candidate', input.candidateName);
  row('Designation', input.designation);
  row('Department', input.department);
  row('Place of posting', input.placeOfPosting);
  row('Date of joining', input.joiningDate);
  document.moveDown(0.6);
  row('Accepted by (name entered)', input.acceptedName);
  row('Method', METHOD_LABELS[input.method]);
  row('Place', input.place);
  row(input.dateOnly ? 'Date signed' : 'Date and time', input.dateOnly ? istDate(input.acceptedAt) : istDateTime(input.acceptedAt));
  row(input.method === 'OFFLINE_HR' ? 'Recorded from (HR system)' : 'IP address', input.ipAddress || '-');
  if (input.method !== 'OFFLINE_HR') row('Browser / device', (input.userAgent || '-').slice(0, 240));
  if (input.recordedBy) row('Recorded by', input.recordedBy);
  if (input.note) row('HR note', input.note.slice(0, 600));
  document.moveDown(0.6);
  row('SHA-256 of the offer letter', input.documentHash);
  if (input.signatureHash) row(input.method === 'DRAWN' ? 'SHA-256 of the signature' : 'SHA-256 of the signed copy', input.signatureHash);

  document.moveDown(1);
  const boxTop = document.y;
  document.roundedRect(48, boxTop, 499, 110, 6).lineWidth(0.8).strokeColor('#cbd5e1').stroke();
  document.font('Helvetica-Bold').fontSize(9).fillColor('#64748b').text('SIGNATURE', 60, boxTop + 10);
  if (input.method === 'TYPED') {
    document.font('Times-BoldItalic').fontSize(28).fillColor('#0f172a').text(pdfSafeText(input.acceptedName), 60, boxTop + 40, { width: 470 });
  } else if (input.signatureImage) {
    try {
      document.image(input.signatureImage, 60, boxTop + 26, { fit: [260, 76] });
    } catch {
      document.font('Helvetica').fontSize(10).fillColor('#0f172a').text('Signed copy stored with this record (see its hash above).', 60, boxTop + 46);
    }
  } else {
    document.font('Helvetica').fontSize(10).fillColor('#0f172a').text('Signed copy stored with this record (see its hash above).', 60, boxTop + 46, { width: 470 });
  }
  document.y = boxTop + 124;
  document.x = 48;
  document.font('Helvetica').fontSize(8).fillColor('#64748b').text(
    'This certificate records a simple electronic acceptance (typed or drawn signature, or a signed copy), with the time, ' +
    'IP address and browser of the person accepting and the SHA-256 fingerprint of the offer letter that was accepted. ' +
    'It is not an Aadhaar eSign or a digital signature certificate. Any change to the offer letter after acceptance ' +
    'changes its fingerprint.',
    { width: 499 },
  );
  document.end();
});

