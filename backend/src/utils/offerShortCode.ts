import { randomBytes } from 'node:crypto';

/**
 * Short offer links (https://<site>/o/<code>): an SMS (DLT) variable and a WhatsApp URL-button suffix must be short,
 * so the long signed token link is reached through an 8-character code. The code is a bearer secret (whoever has it
 * opens the offer), so it is random (no counter), never logged in clear and rate-limited on lookup.
 * No database here: unit-tested.
 */

// No 0/O, 1/l/I: a candidate may type the code from a printed letter or an SMS.
export const OFFER_SHORT_CODE_ALPHABET = '23456789abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ';
export const OFFER_SHORT_CODE_LENGTH = 8;
const CODE_PATTERN = new RegExp(`^[${OFFER_SHORT_CODE_ALPHABET}]{${OFFER_SHORT_CODE_LENGTH}}$`);

/** A random code; bytes that would bias the alphabet are skipped (rejection sampling). */
export const generateOfferShortCode = (random: (size: number) => Buffer = randomBytes): string => {
  const alphabet = OFFER_SHORT_CODE_ALPHABET;
  const limit = 256 - (256 % alphabet.length);
  let code = '';
  while (code.length < OFFER_SHORT_CODE_LENGTH) {
    for (const byte of random(32)) {
      if (byte >= limit) continue;
      code += alphabet[byte % alphabet.length];
      if (code.length === OFFER_SHORT_CODE_LENGTH) break;
    }
  }
  return code;
};

export const isOfferShortCode = (value: unknown): value is string => typeof value === 'string' && CODE_PATTERN.test(value);

export const buildOfferShortUrl = (origin: string, code: string) => `${origin.replace(/\/+$/, '')}/o/${code}`;

const LINK_KEYS = new Set(['offerResponseUrl', 'offerShortUrl', 'offerShortCode', 'offer_response_url', 'offer_short_url', 'offer_short_code']);
const maskText = (text: string) => text
  .replace(/(\/offer-response\/)[^\s"'<>?#]+/g, '$1****')
  .replace(/(\/o\/)[A-Za-z0-9]{4,}/g, '$1****');

/**
 * A copy safe to store in a message log: offer link fields and anything that looks like an offer link is masked
 * (the real link is built again when the message is delivered). Objects and arrays are copied, never changed.
 */
export const maskOfferLinks = <T>(value: T, depth = 0): T => {
  if (depth > 8) return value;
  if (typeof value === 'string') return maskText(value) as unknown as T;
  if (Array.isArray(value)) return value.map((item) => maskOfferLinks(item, depth + 1)) as unknown as T;
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => [
      key,
      LINK_KEYS.has(key) && typeof item === 'string' && item ? '****' : maskOfferLinks(item, depth + 1),
    ])) as T;
  }
  return value;
};
