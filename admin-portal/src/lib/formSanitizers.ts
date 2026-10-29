// Typing-time cleanup shared by every form (see components/FormSanitizer.tsx, which applies it to all inputs).
// The API cleans requests again (backend sanitizeRequest middleware); these rules keep what people see and
// submit tidy. Each rule must be idempotent: applying it twice gives the same value.

export type SanitizeKind =
  | 'text' | 'multiline' | 'email' | 'tel' | 'url' | 'numeric' | 'decimal'
  | 'name' | 'mobile' | 'pincode' | 'aadhaar' | 'pan' | 'gstin' | 'ifsc' | 'account' | 'upi'
  | 'vehicle' | 'chassis' | 'engine' | 'code' | 'digits' | 'off';

export const SANITIZE_KINDS: readonly SanitizeKind[] = [
  'text', 'multiline', 'email', 'tel', 'url', 'numeric', 'decimal', 'name', 'mobile', 'pincode', 'aadhaar', 'pan', 'gstin',
  'ifsc', 'account', 'upi', 'vehicle', 'chassis', 'engine', 'code', 'digits', 'off',
];

/** Default caps for fields that set no maxLength of their own. */
export const DEFAULT_MAX_LENGTH = { input: 1000, textarea: 20000 } as const;

const fromCodes = (...codes: number[]) => codes.map((code) => String.fromCharCode(code)).join('');
// Control characters (tab and newline handled per kind) and Unicode bidi overrides used for spoofing.
// Zero-width joiners stay: Devanagari and other Indic scripts need them.
const CONTROL = new RegExp(`[${fromCodes(0)}-${fromCodes(8)}${fromCodes(11, 12)}${fromCodes(14)}-${fromCodes(31)}${fromCodes(127)}${fromCodes(0x202a)}-${fromCodes(0x202e)}${fromCodes(0x2066)}-${fromCodes(0x2069)}]`, 'g');
const DANGEROUS_BLOCKS = /<(script|style|iframe|object|embed|noscript|template|textarea|title)\b[^>]*>[\s\S]*?<\/\1\s*>/gi;
const TAGS = /<\/?[a-z][a-z0-9:-]*(?:\s[^<>]*)?\/?>|<!--[\s\S]*?(?:-->|$)|<[!?][^<>]*>/gi;
// A "<" that would open a tag; "price < 5", "a<3" and "Name <name@example.com>" keep theirs.
const TAG_OPENER = /<(?=[a-z/!?])(?![^\s<>@]+@[^\s<>@]+\.[a-z]{2,}>)/gi;

/** Removes markup and invisible characters. Shared by every kind. */
export const stripUnsafe = (value: string) => {
  let text = value.replace(CONTROL, '');
  if (text.includes('<')) text = text.replace(DANGEROUS_BLOCKS, '').replace(TAGS, '').replace(TAG_OPENER, '');
  return text;
};

const singleLine = (value: string) => stripUnsafe(value.replace(/[\r\n\t]+/g, ' ')).replace(/ {2,}/g, ' ').replace(/^\s+/, '');
const keep = (value: string, allowed: RegExp, max?: number) => {
  const cleaned = value.replace(allowed, '');
  return max ? cleaned.slice(0, max) : cleaned;
};
const trimStart = (value: string) => value.replace(/^\s+/, '');
const upper = (value: string, invalid: RegExp, max: number) => trimStart(keep(singleLine(value).toUpperCase(), invalid)).replace(/ {2,}/g, ' ').slice(0, max);

/** Indian mobile: 10 digits. A pasted "+91 98765 43210" or "098765 43210" keeps the last 10 digits. */
const mobile = (value: string) => {
  const digits = value.replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2);
  if (digits.length === 11 && digits.startsWith('0')) return digits.slice(1);
  return digits.slice(0, 10);
};

/** One decimal point; "1,25,000.50" style grouping commas are kept for formatted amount fields. */
const decimal = (value: string) => {
  const cleaned = value.replace(/[^\d.,]/g, '');
  const firstDot = cleaned.indexOf('.');
  return firstDot === -1 ? cleaned : `${cleaned.slice(0, firstDot + 1)}${cleaned.slice(firstDot + 1).replace(/\./g, '')}`;
};

/**
 * Cleans a value while it is typed. `finalize` (on blur) also trims the end, which typing must not do
 * because the next word needs its space.
 */
export const sanitizeFieldValue = (kind: SanitizeKind, value: string, finalize = false): string => {
  let next: string;
  switch (kind) {
    case 'off': return value;
    case 'multiline': next = stripUnsafe(value.replace(/\r\n?/g, '\n')); return finalize ? next.trim() : next;
    case 'text': next = singleLine(value); break;
    case 'email': next = keep(stripUnsafe(value).toLowerCase(), /[^a-z0-9@._+-]/g, 254); break;
    case 'tel': next = keep(stripUnsafe(value), /[^\d+\- ]/g, 20).replace(/(?!^)\+/g, '').replace(/ {2,}/g, ' ').replace(/^\s+/, ''); break;
    case 'url': next = stripUnsafe(value).replace(/\s+/g, ''); break;
    case 'numeric': next = value.replace(/[^\d, ]/g, ''); break;
    case 'decimal': next = decimal(value); break;
    case 'digits': next = value.replace(/\D/g, ''); break;
    case 'name': next = trimStart(singleLine(value).replace(/[^\p{L}\p{M}\s.'-]/gu, '')).replace(/ {2,}/g, ' ').slice(0, 100); break;
    case 'mobile': next = mobile(value); break;
    case 'pincode': next = value.replace(/\D/g, '').slice(0, 6); break;
    case 'aadhaar': next = value.replace(/\D/g, '').slice(0, 12); break;
    case 'account': next = value.replace(/\D/g, '').slice(0, 18); break;
    case 'pan': next = upper(value, /[^A-Z0-9]/g, 10); break;
    case 'gstin': next = upper(value, /[^A-Z0-9]/g, 15); break;
    case 'ifsc': next = upper(value, /[^A-Z0-9]/g, 11); break;
    case 'vehicle': next = upper(value, /[^A-Z0-9]/g, 11); break;
    case 'chassis': next = upper(value, /[^A-Z0-9/-]/g, 30); break;
    case 'engine': next = upper(value, /[^A-Z0-9/-]/g, 30); break;
    case 'code': next = upper(value, /[^A-Z0-9 _/.-]/g, 60); break;
    case 'upi': next = keep(stripUnsafe(value).toLowerCase(), /[^a-z0-9._@-]/g, 60); break;
    default: next = singleLine(value);
  }
  return finalize ? next.trim() : next;
};

/** Picks the rule for a field from its data-sanitize attribute, type and inputMode. */
export const resolveSanitizeKind = (field: { tagName: string; type?: string; inputMode?: string; explicit?: string | null }): SanitizeKind | null => {
  const explicit = field.explicit?.trim().toLowerCase();
  if (explicit) return (SANITIZE_KINDS as readonly string[]).includes(explicit) ? explicit as SanitizeKind : 'text';
  if (field.tagName === 'TEXTAREA') return 'multiline';
  if (field.tagName !== 'INPUT') return null;
  const type = (field.type || 'text').toLowerCase();
  if (type === 'email') return 'email';
  if (type === 'tel') return 'tel';
  if (type === 'url') return 'url';
  if (type !== 'text' && type !== 'search') return null; // password, number, date, file, checkbox ... are left alone
  if (field.inputMode === 'numeric') return 'numeric';
  if (field.inputMode === 'decimal') return 'decimal';
  if (field.inputMode === 'email') return 'email';
  if (field.inputMode === 'tel') return 'tel';
  return 'text';
};

/**
 * Keeps the cursor where the person was typing. The cleanup only changes one stretch of the text, so the
 * unchanged start and end are matched: a cursor inside the unchanged start stays put, one inside the
 * unchanged end keeps its distance from the end, and one inside the changed stretch goes to its end.
 */
export const caretAfterEdit = (before: string, after: string, caret: number) => {
  let head = 0;
  while (head < before.length && head < after.length && before[head] === after[head]) head += 1;
  let tail = 0;
  while (tail < before.length - head && tail < after.length - head && before[before.length - 1 - tail] === after[after.length - 1 - tail]) tail += 1;
  if (caret <= head) return caret;
  if (before.length - caret <= tail) return after.length - (before.length - caret);
  return after.length - tail;
};
