import { NextFunction, Request, Response } from 'express';

// Request-wide safety net for every form and API call. Each string in the body and query string is cleaned:
// control and bidi-override characters removed, Unicode normalised (NFC), HTML tags removed, and surrounding
// whitespace trimmed. Keys that could pollute object prototypes are dropped. Field-level rules (digits only,
// PAN/GSTIN format, lengths) stay with each form and controller.
//
// Not touched: passwords, OTPs, tokens and signatures (exact value matters), and the fields that legitimately
// hold markup, which their own allow-list sanitizers clean (utils/htmlSanitizer.ts).

const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const RAW_KEY = /(password|passcode|passphrase|secret|token|signature|otp|apikey|api_key|privatekey|private_key|credential)$/i;
const HTML_KEYS = new Set(['contentHtml', 'svgData', 'privacyPolicy', 'termsConditions', 'disclaimer', 'refundReturnPolicy']);

// Control characters except tab / newline / carriage return, plus Unicode bidi overrides used for spoofing.
// Zero-width joiners stay: Devanagari and other Indic scripts need them.
const CONTROL_CHARACTERS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u202A-\u202E\u2066-\u2069]/g;
const DANGEROUS_BLOCKS = /<(script|style|iframe|object|embed|noscript|template|textarea|title)\b[^>]*>[\s\S]*?<\/\1\s*>/gi;
const COMMENTS = /<!--[\s\S]*?(?:-->|$)/g;
const TAGS = /<\/?[a-z][a-z0-9:-]*(?:\s[^<>]*)?\/?>/gi;
const DECLARATIONS = /<[!?][^<>]*>/g;
// A "<" that would still open a tag once the text lands in HTML (email, PDF template): drop the bracket only.
// "Name <name@example.com>" keeps its brackets.
const TAG_OPENER = /<(?=[a-z/!?])(?![^\s<>@]+@[^\s<>@]+\.[a-z]{2,}>)/gi;

const MAX_DEPTH = 32;

/** Cleans one plain-text value. "price < 5 lakh" and "a<3" keep their bracket; "<b>Ramesh</b>" becomes "Ramesh". */
export const sanitizePlainText = (value: string) => {
  let text = value.replace(CONTROL_CHARACTERS, '').normalize('NFC');
  if (text.includes('<')) {
    text = text
      .replace(DANGEROUS_BLOCKS, '')
      .replace(COMMENTS, '')
      .replace(TAGS, '')
      .replace(DECLARATIONS, '')
      .replace(TAG_OPENER, '');
  }
  // Runs of spaces collapse to one (as the forms do while typing); line breaks and tabs stay.
  return text.replace(/ {2,}/g, ' ').trim();
};

/** Cleans a parsed body / query value in place-safe form (returns a new value). */
export const sanitizeInput = (value: unknown, key = '', depth = 0): unknown => {
  if (depth > MAX_DEPTH) return undefined;
  if (typeof value === 'string') {
    if (RAW_KEY.test(key)) return value;
    if (HTML_KEYS.has(key)) return value.replace(/\u0000/g, '');
    return sanitizePlainText(value);
  }
  if (Array.isArray(value)) return value.map((item) => sanitizeInput(item, key, depth + 1));
  if (value && typeof value === 'object' && !Buffer.isBuffer(value) && !(value instanceof Date)) {
    const cleaned: Record<string, unknown> = {};
    for (const [childKey, childValue] of Object.entries(value as Record<string, unknown>)) {
      if (FORBIDDEN_KEYS.has(childKey)) continue;
      cleaned[childKey] = sanitizeInput(childValue, childKey, depth + 1);
    }
    return cleaned;
  }
  return value;
};

const isPlainObject = (value: unknown) => Boolean(value) && typeof value === 'object' && !Buffer.isBuffer(value);

/** Body only: for routes whose body is parsed later by multer (multipart forms). */
export const sanitizeRequestBody = (req: Request, _res: Response, next: NextFunction) => {
  if (isPlainObject(req.body) || Array.isArray(req.body)) req.body = sanitizeInput(req.body);
  next();
};

export const sanitizeRequest = (req: Request, _res: Response, next: NextFunction) => {
  if (isPlainObject(req.body) || Array.isArray(req.body)) req.body = sanitizeInput(req.body);
  // Express 5 parses req.query through a getter on every access, so the cleaned copy is pinned on the request.
  const query = req.query;
  if (query && Object.keys(query).length) {
    Object.defineProperty(req, 'query', { value: sanitizeInput(query), writable: true, configurable: true, enumerable: true });
  }
  next();
};
